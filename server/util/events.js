import { differenceInCalendarDays } from "date-fns";
import { prisma } from "./db.js";
import { sendMail } from "./mailer.js";
import { createCalendarEvent } from "../controller/dashboard-controller.js";
import moment from "moment";
import { leaveSubmittedEmail, leaveApprovedEmail, leaveRejectedEmail, leaveCancelledEmail, managerNotificationEmail } from "./email-templates.js";

export async function addLeaveRequestEvent(
  leaveTypeId,
  startDate,
  endDate,
  reason,
  id,
  newRequest,
  extras = {}
) {
  newRequest = await prisma.leaveRequest.create({
    data: {
      userId: id,
      leaveTypeId,
      startDate,
      endDate,
      reason,
      status: "PENDING",
      contactPhone: extras.contactPhone || null,
      contactEmail: extras.contactEmail || null,
      signature: extras.signature || null,
    },
    include: {
      user: {
        select: {
          id: true,
          fullName: true,
          email: true,
          approvedLeaveRequests: { include: { approvedBy: true } },
        },
      },
      leaveType: { select: { id: true, name: true } },
    },
  });

  const managers = await prisma.group.findMany({
    where: { members: { some: { userId: id } } },
    include: { manager: true },
  });

  try {
    const fmtStart = moment(startDate).format("D MMM YYYY");
    const fmtEnd = moment(endDate).format("D MMM YYYY");

    // Notify all admins + managers in the same tenant
    const admins = await prisma.user.findMany({
      where: { role: { in: ["ADMIN", "MANAGER"] }, tenantId: newRequest.user?.tenantId || undefined },
      select: { id: true, email: true },
    });

    for (const admin of admins) {
      await sendMail({
        to: admin.email,
        subject: `Leave request from ${newRequest.user.fullName}`,
        html: managerNotificationEmail({
          employeeName: newRequest.user.fullName,
          leaveType: newRequest.leaveType.name,
          startDate: fmtStart,
          endDate: fmtEnd,
          reason,
          approveUrl: `${process.env.APP_URL}/dashboard/approve-reject?id=${newRequest.id}&status=APPROVED&managerUserId=${admin.id}`,
          rejectUrl: `${process.env.APP_URL}/dashboard/approve-reject?id=${newRequest.id}&status=REJECTED&managerUserId=${admin.id}`,
        }),
      });
    }

    // Confirm to employee
    await sendMail({
      to: newRequest.user.email,
      subject: "Leave request submitted",
      html: leaveSubmittedEmail({
        employeeName: newRequest.user.fullName,
        leaveType: newRequest.leaveType.name,
        startDate: fmtStart,
        endDate: fmtEnd,
        reason,
      }),
    });
  } catch (mailErr) {
    console.warn("Email notification failed (non-fatal):", mailErr.message);
  }

  return newRequest;
}

export async function createEvents(
  request,
  approved,
  description,
  id,
  managerUserId
) {
  // DB transaction
  await prisma.$transaction(async (tx) => {
    request = await tx.leaveRequest.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        leaveTypeId: true,
        startDate: true,
        endDate: true,
        status: true,
        reason: true,
        leaveType: { select: { name: true } },
        user: { select: { fullName: true, email: true } },
      },
    });

    if (!request || request.status !== "PENDING") {
      throw new Error("Request not found or not pending");
    }

    const days = differenceInCalendarDays(
      new Date(request.endDate),
      new Date(request.startDate)
    );

    await tx.userLeaveType.update({
      where: {
        userId_leaveTypeId: {
          userId: request.userId,
          leaveTypeId: request.leaveTypeId,
        },
      },
      data: { leaveBalance: { decrement: days } },
    });

    approved = await tx.leaveRequest.update({
      where: { id },
      data: { status: "APPROVED", approvedById: managerUserId },
      include: {
        approvedBy: {
          select: {
            fullName: true,
            email: true,
          },
        },
        user: {
          select: {
            email: true,
          },
        },
      },
    });
    // --- AFTER TRANSACTION: external calls ---
    description = request.reason || "";
  });

  // email to employee
  try {
    await sendMail({
      to: request.user.email,
      subject: "✅ Your Leave Request has been Approved",
      html: leaveApprovedEmail({
        employeeName: request.user.fullName,
        leaveType: request.leaveType.name,
        startDate: request.startDate.toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" }),
        endDate: request.endDate.toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" }),
        approvedBy: request.approvedBy?.fullName,
      }),
    });
  } catch (mailErr) {
    console.warn("Approval email failed (non-fatal):", mailErr.message);
  }

  // calendar event
  try {
    const summary = `${request.leaveType.name} | ${
      request.user.fullName
    } | ${request.startDate.toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })} → ${request.endDate
      .toISOString()
      .slice(0, 10)}`;

    await prisma.leaveRequest.update({
      where: { id: request.id },
      data: { description: summary },
    });
    const { eventId } = await createCalendarEvent({
      summary,
      description,
      start: request.startDate,
      end: request.endDate,
    });
    await prisma.leaveRequest.update({
      where: { id },
      data: { gcalEventId: eventId },
    });
  } catch (calErr) {
    console.warn("Calendar event creation failed (non-fatal):", calErr.message);
  }
}

export async function rejectLeaveRequestEvent(
  reqRow,
  id,
  managerUserId,
  approvedData
) {
  reqRow = await prisma.leaveRequest.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      leaveTypeId: true,
      startDate: true,
      endDate: true,
      status: true,
      gcalEventId: true,
      reason: true,
      leaveType: { select: { name: true } },
      user: { select: { fullName: true, email: true } },
    },
  });

  if (!reqRow) throw new Error("Request not found");

  const days = differenceInCalendarDays(
    new Date(reqRow.endDate),
    new Date(reqRow.startDate)
  );

  // Update DB in transaction
  await prisma.$transaction(async (tx) => {
    if (reqRow.status === "APPROVED") {
      // Refund balance if it was previously approved
      await tx.userLeaveType.update({
        where: {
          userId_leaveTypeId: {
            userId: reqRow.userId,
            leaveTypeId: reqRow.leaveTypeId,
          },
        },
        data: { leaveBalance: { increment: days } },
      });
    }

    // Mark as rejected
    approvedData = await tx.leaveRequest.update({
      where: { id },
      data: {
        status: "REJECTED",
        updatedAt: new Date(),
        approvedById: managerUserId,
      },
      include: {
        user: { select: { fullName: true, email: true } },
        approvedBy: {
          select: { email: true },
        },
      },
    });

    // Delete calendar event if exists
  });
  if (reqRow.gcalEventId) {
    try {
      await calendar.events.delete({
        calendarId: "primary",
        eventId: reqRow.gcalEventId,
      });
    } catch (err) {
      console.warn("Calendar event not found:", err.message);
    }
  }
  try {
    await sendMail({
      to: reqRow.user.email,
      subject: "❌ Your Leave Request has been Rejected",
      html: leaveRejectedEmail({
        employeeName: reqRow.user.fullName,
        leaveType: reqRow.leaveType.name,
        startDate: reqRow.startDate.toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" }),
        endDate: reqRow.endDate.toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" }),
      }),
    });
  } catch (mailErr) {
    console.warn("Rejection email failed (non-fatal):", mailErr.message);
  }
}

export async function cancelLeaveRequestEvent(id, leaveRequestId) {
  const reqRow = await prisma.leaveRequest.findUnique({
    where: { id: leaveRequestId },
    select: {
      id: true,
      userId: true,
      leaveTypeId: true,
      startDate: true,
      endDate: true,
      status: true,
      gcalEventId: true,
      reason: true,
      leaveType: { select: { name: true } },
      user: { select: { fullName: true, email: true } },
    },
  });

  if (!reqRow) throw new Error("Request not found");

  const days = differenceInCalendarDays(
    new Date(reqRow.endDate),
    new Date(reqRow.startDate)
  );

  // Update DB in transaction
  await prisma.$transaction(async (tx) => {
    if (reqRow.status === "APPROVED") {
      // Refund balance if it was previously approved
      await tx.userLeaveType.update({
        where: {
          userId_leaveTypeId: {
            userId: reqRow.userId,
            leaveTypeId: reqRow.leaveTypeId,
          },
        },
        data: { leaveBalance: { increment: days } },
      });
    }

    // Mark as rejected
    const approvedData = await tx.leaveRequest.update({
      where: { id: leaveRequestId },
      data: {
        status: "CANCELLED",
        updatedAt: new Date(),
        approvedById: id,
      },
      include: {
        user: { select: { fullName: true, email: true } },
        approvedBy: {
          select: { email: true },
        },
      },
    });
    try {
      await sendMail({
        to: reqRow.user.email,
        subject: "❌ Your Leave Request has been Cancelled",
        html: leaveCancelledEmail({
          employeeName: reqRow.user.fullName,
          leaveType: reqRow.leaveType.name,
          startDate: reqRow.startDate.toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" }),
          endDate: reqRow.endDate.toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" }),
        }),
      });
    } catch (emailErr) {
      console.error("Cancel email failed (non-blocking):", emailErr?.message);
    }

    // Delete calendar event if exists
  });
  if (reqRow.gcalEventId) {
    try {
      await calendar.events.delete({
        calendarId: "primary",
        eventId: reqRow.gcalEventId,
      });
    } catch (err) {
      console.warn("Calendar event not found:", err.message);
    }
  }
}

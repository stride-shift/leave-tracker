import { calendar } from "../app.js";
import { prisma } from "../util/db.js";
import errorHandler from "../util/error-handler.js";
import { differenceInCalendarDays } from "date-fns";
import { sendMail } from "../util/mailer.js";
import jwt from "jsonwebtoken";
import moment from "moment";
import {
  addLeaveRequestEvent,
  cancelLeaveRequestEvent,
  createEvents,
  rejectLeaveRequestEvent,
} from "../util/events.js";
export const listUserLeaveType = async (req, res, next) => {
  const { id } = req.params;
  try {
    const userLeaveTypes = await prisma.userLeaveType.findMany({
      where: {
        userId: id,
        isActive: true,
        leaveType: { isDeleted: false }, // keep reference rows
      },
      select: {
        isActive: true,
        leaveBalance: true,
        leaveType: {
          select: {
            id: true,
            name: true,
            description: true,
            isActive: true,
            isDeleted: true,
          },
        },
      },
    });
    const totalBalance = await prisma.userLeaveType.aggregate({
      where: {
        userId: id,
        isActive: true, // only active assignments
        leaveType: { isDeleted: false }, // and non-deleted leave types
      },
      _sum: { leaveBalance: true },
    });
    return res.status(200).json({
      userLeaveTypes,
      totalBalance,
      message: "Success",
    });
  } catch (error) {
    next(errorHandler(500, error));
  }
};
export const addLeaveRequest = async (req, res, next) => {
  const { id } = req.params;
  const { leaveTypeId, startDate, endDate, reason, contactPhone, contactEmail, signature } = req.body;
  try {
    const newRequest = await addLeaveRequestEvent(
      leaveTypeId,
      startDate,
      endDate,
      reason,
      id,
      undefined,
      { contactPhone, contactEmail, signature }
    );

    return res.status(201).json({
      newRequest,
      message: "Success",
    });
  } catch (error) {
    next(errorHandler(500, error));
  }
};

export const listLeaveRequest = async (req, res, next) => {
  const { id } = req.params;
  const { status } = req.query;
  // const days = differenceInCalendarDays(new Date(endDate), new Date(startDate));

  try {
    const leaveRequests = await prisma.leaveRequest.findMany({
      where: { userId: id, status },
      include: {
        leaveType: {
          select: { id: true, name: true, isActive: true, isDeleted: true },
        },
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            groups: {
              select: {
                group: {
                  select: {
                    id: true,
                    name: true,
                    manager: {
                      select: { id: true, fullName: true, email: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { requestedAt: "desc" },
    });

    return res.status(200).json({
      leaveRequests,
      message: "Success",
    });
  } catch (error) {
    next(errorHandler(500, error));
  }
};

export const cancelLeaveRequest = async (req, res, next) => {
  const { id } = req.params;
  const { leaveRequestId } = req.query;
  // const days = differenceInCalendarDays(new Date(endDate), new Date(startDate));

  try {
    await cancelLeaveRequestEvent(id, leaveRequestId);
    return res.status(200).json({
      message: "Success",
    });
  } catch (error) {
    next(errorHandler(500, error));
  }
};
export const manageLeaveRequests = async (req, res, next) => {
  const { id } = req.params;
  const { status } = req.query;

  try {
    const user = await prisma.user.findUnique({ where: { id }, select: { role: true, tenantId: true } });
    const isSuperAdmin = user?.role === "SUPER_ADMIN";
    const isAdmin = user?.role === "ADMIN" || isSuperAdmin;

    const where = { status };
    if (isSuperAdmin) {
      // SUPER_ADMIN sees everything across all orgs
    } else if (isAdmin) {
      // ADMIN sees their org only
      if (user.tenantId) where.user = { tenantId: user.tenantId };
    } else {
      // MANAGER sees their team members only
      where.user = { groups: { some: { group: { managerId: id } } } };
    }

    const managers = await prisma.leaveRequest.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
        leaveType: {
          select: { id: true, name: true, isDeleted: true },
        },
        approvedBy: {
          select: { id: true, fullName: true },
        },
      },
      orderBy: { requestedAt: "desc" },
    });

    return res.status(200).json({
      managers,
      message: "Success",
    });
  } catch (error) {
    next(errorHandler(500, error));
  }
};

export const approveLeaveRequest = async (req, res, next) => {
  const { id } = req.params;
  const { managerUserId } = req.query;
  try {
    await createEvents(undefined, undefined, undefined, id, managerUserId);

    return res.status(200).json({
      message: "Success",
    });
  } catch (error) {
    next(errorHandler(500, error));
  }
};

export async function createCalendarEvent({ summary, start, end }) {
  const { data } = await calendar.events.insert({
    calendarId: "primary",
    resource: {
      summary,
      start: { dateTime: start, timeZone: "Asia/Kolkata" },
      end: { dateTime: end, timeZone: "Asia/Kolkata" },
      extendedProperties: { private: { source: "leave-tracker-app" } },
    },
  });
  return { eventId: data.id, data };
}

// GET /dashboard/leave-request-detail/:id
export const getLeaveRequestDetail = async (req, res, next) => {
  try {
    const { id } = req.params;
    const request = await prisma.leaveRequest.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, fullName: true, email: true, avatarUrl: true, role: true, contractStartDate: true } },
        leaveType: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, fullName: true } },
      },
    });
    if (!request) return res.status(404).json({ error: "Not found" });
    return res.json({ request });
  } catch (error) { next(errorHandler(500, error)); }
};

// PATCH /dashboard/sign-leave-request/:id — manager signs off
export const signLeaveRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { managerSignature, managerNote, action, managerUserId } = req.body;

    if (action === "approve") {
      // Update signature first
      await prisma.leaveRequest.update({
        where: { id },
        data: { managerSignature, managerNote },
      });
      // Then run the approval flow
      await createEvents(undefined, undefined, undefined, id, managerUserId);
    } else if (action === "reject") {
      await prisma.leaveRequest.update({
        where: { id },
        data: { managerSignature, managerNote },
      });
      await rejectLeaveRequestEvent(undefined, id, managerUserId);
    }

    return res.json({ message: action === "approve" ? "Approved and signed" : "Rejected" });
  } catch (error) { next(errorHandler(500, error)); }
};

export const rejectLeaveRequest = async (req, res, next) => {
  const { id } = req?.params;
  const { managerUserId } = req.query;
  try {
    await rejectLeaveRequestEvent(undefined, id, managerUserId, undefined);

    return res.status(200).json({ message: "Request rejected successfully" });
  } catch (error) {
    next(errorHandler(500, error));
  }
};

export const listAllApprovedList = async (req, res, next) => {
  try {
    const { id } = req.query;
    // approved leave requests for one user
    const approvedLeaves = await prisma.leaveRequest.findMany({
      where: {
        userId: id, // ← the user you’re interested in
        status: "APPROVED",
      },
      include: {
        user: {
          select: {
            fullName: true,
          },
        },
        leaveType: true, // if you want the leave-type name, etc.
      },
      orderBy: { startDate: "asc" },
    });

    return res.status(200).json({
      approvedLeaves,
      message: "Request all approved leave successfully",
    });
  } catch (error) {
    next(errorHandler(500, error));
  }
};

// Fetch ALL approved leaves for the whole team (excludes private ones from other users)
export const listTeamApprovedLeaves = async (req, res, next) => {
  try {
    const currentUserId = req.params.id;

    const approvedLeaves = await prisma.leaveRequest.findMany({
      where: {
        status: "APPROVED",
        OR: [
          { userId: currentUserId },              // always show own leaves
          { isPrivate: false },                    // show others’ non-private leaves
        ],
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
          },
        },
        leaveType: {
          select: { id: true, name: true },
        },
      },
      orderBy: { startDate: "asc" },
    });

    return res.status(200).json({
      approvedLeaves,
      message: "Team approved leaves fetched successfully",
    });
  } catch (error) {
    next(errorHandler(500, error));
  }
};

// Toggle privacy on a leave request (only the owner can toggle)
export const toggleLeavePrivacy = async (req, res, next) => {
  try {
    const { id } = req.params;           // leaveRequest id
    const { userId } = req.body;

    const leave = await prisma.leaveRequest.findUnique({ where: { id } });
    if (!leave) return next(errorHandler(404, "Leave request not found"));
    if (leave.userId !== userId) return next(errorHandler(403, "You can only change privacy on your own leaves"));

    const updated = await prisma.leaveRequest.update({
      where: { id },
      data: { isPrivate: !leave.isPrivate },
    });

    return res.status(200).json({
      leave: updated,
      message: `Leave is now ${updated.isPrivate ? "private" : "visible to team"}`,
    });
  } catch (error) {
    next(errorHandler(500, error));
  }
};

export const fetchUser = async (req, res, next) => {
  try {
    const { email, password } = req.query;

    const user = await prisma.user.findUnique({
      where: { email, password },
      select: {
        email: true,
        fullName: true,
        id: true,
        role: true,
        createdAt: true,
      },
    });

    const token = jwt.sign(
      {
        id: user.id,
        userEmail: user.email,
        userRole: user.role,
        fullName: user.fullName,
        createdAt: user.createdAt,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_TIMEOUT || "7d",
      }
    );
    req.headers.authorization = `Bearer ${token}`;

    return res.status(200).json({
      token,
      user,
      message: "Success",
    });
  } catch (error) {
    next(errorHandler(500, error));
  }
};

export const deleteUser = async (req, res, next) => {
  try {
    const { email } = req.query;

    const deleteUser = await prisma.user.delete({ where: { email } });

    return res.status(200).json({
      deleteUser,
      message: "Success",
    });
  } catch (error) {
    next(errorHandler(500, error));
  }
};

import { prisma } from "./db.js";
import { sendMail } from "./mailer.js";

/**
 * Run monthly accrual for all active users.
 * For each active UserLeaveType, adds accrualRate to leaveBalance
 * and logs the accrual in AccrualLog.
 *
 * @param {Date} [forDate] - The date to run accrual for (defaults to now).
 *                           The accrual is keyed to the 1st of that month.
 */
export async function runMonthlyAccrual(forDate = new Date()) {
  // Normalize to 1st of the month (used as unique key to prevent double-runs)
  const accrualDate = new Date(forDate.getFullYear(), forDate.getMonth(), 1);

  // Get all active user-leave-type assignments
  const assignments = await prisma.userLeaveType.findMany({
    where: {
      isActive: true,
      leaveType: { isDeleted: false, isActive: true },
    },
    include: {
      user: { select: { id: true, fullName: true, email: true } },
      leaveType: { select: { id: true, name: true } },
    },
  });

  const results = { processed: 0, skipped: 0, errors: [] };

  for (const assignment of assignments) {
    try {
      // Check if accrual already ran for this month
      const existing = await prisma.accrualLog.findUnique({
        where: {
          userId_leaveTypeId_accrualDate: {
            userId: assignment.userId,
            leaveTypeId: assignment.leaveTypeId,
            accrualDate,
          },
        },
      });

      if (existing) {
        results.skipped++;
        continue;
      }

      // Run accrual in a transaction
      await prisma.$transaction(async (tx) => {
        const updated = await tx.userLeaveType.update({
          where: {
            userId_leaveTypeId: {
              userId: assignment.userId,
              leaveTypeId: assignment.leaveTypeId,
            },
          },
          data: { leaveBalance: { increment: assignment.accrualRate } },
        });

        await tx.accrualLog.create({
          data: {
            userId: assignment.userId,
            leaveTypeId: assignment.leaveTypeId,
            amount: assignment.accrualRate,
            balanceAfter: updated.leaveBalance,
            accrualDate,
          },
        });
      });

      results.processed++;
    } catch (err) {
      results.errors.push({
        userId: assignment.userId,
        leaveTypeId: assignment.leaveTypeId,
        error: err.message,
      });
    }
  }

  return results;
}

/**
 * Get the payroll report — a snapshot of every employee's leave balances.
 * This is what Barbara sends to the payroll company each month.
 */
export async function getPayrollReport() {
  const users = await prisma.user.findMany({
    orderBy: { fullName: "asc" },
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      assignedTypes: {
        where: {
          isActive: true,
          leaveType: { isDeleted: false },
        },
        select: {
          leaveBalance: true,
          accrualRate: true,
          cycleStartDate: true,
          leaveType: {
            select: { id: true, name: true },
          },
        },
      },
    },
  });

  // Calculate totals per user
  const report = users.map((user) => {
    const leaveTypes = user.assignedTypes.map((at) => ({
      leaveTypeName: at.leaveType.name,
      leaveTypeId: at.leaveType.id,
      balance: at.leaveBalance,
      accrualRate: at.accrualRate,
      cycleStartDate: at.cycleStartDate,
    }));

    const totalBalance = leaveTypes.reduce((sum, lt) => sum + lt.balance, 0);

    return {
      userId: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      leaveTypes,
      totalBalance: Math.round(totalBalance * 100) / 100,
    };
  });

  return report;
}

/**
 * Get accrual history for a specific user — shows month-by-month accrual log.
 */
export async function getUserAccrualHistory(userId, leaveTypeId) {
  const where = { userId };
  if (leaveTypeId) {
    where.leaveTypeId = leaveTypeId;
  }

  const logs = await prisma.accrualLog.findMany({
    where,
    orderBy: { accrualDate: "desc" },
    include: {
      userLeaveType: {
        select: {
          leaveType: { select: { name: true } },
        },
      },
    },
  });

  return logs.map((log) => ({
    id: log.id,
    leaveTypeName: log.userLeaveType.leaveType.name,
    amount: log.amount,
    balanceAfter: log.balanceAfter,
    accrualDate: log.accrualDate,
    createdAt: log.createdAt,
  }));
}

/**
 * Send the monthly payroll report to a specified email (Barbara).
 */
export async function sendPayrollReportEmail(toEmail) {
  const report = await getPayrollReport();
  const now = new Date();
  const monthName = now.toLocaleString("en-ZA", { month: "long", year: "numeric" });

  let tableRows = "";
  for (const user of report) {
    const leaveDetails = user.leaveTypes
      .map((lt) => `${lt.leaveTypeName}: ${lt.balance} days (${lt.accrualRate}/mo)`)
      .join("<br>");

    tableRows += `
      <tr>
        <td style="padding:8px;border:1px solid #ddd">${user.fullName}</td>
        <td style="padding:8px;border:1px solid #ddd">${user.email}</td>
        <td style="padding:8px;border:1px solid #ddd">${leaveDetails || "No leave types assigned"}</td>
        <td style="padding:8px;border:1px solid #ddd"><strong>${user.totalBalance}</strong></td>
      </tr>`;
  }

  const html = `
    <div style="font-family: Arial, sans-serif; line-height:1.5; color:#333;">
      <h2>Monthly Leave Report — ${monthName}</h2>
      <p>Below is the current leave balance for all staff members.</p>
      <table style="border-collapse:collapse;width:100%">
        <thead>
          <tr style="background:#f5f5f5">
            <th style="padding:8px;border:1px solid #ddd;text-align:left">Employee</th>
            <th style="padding:8px;border:1px solid #ddd;text-align:left">Email</th>
            <th style="padding:8px;border:1px solid #ddd;text-align:left">Leave Balances</th>
            <th style="padding:8px;border:1px solid #ddd;text-align:left">Total Days Owed</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
      <p style="margin-top:16px;color:#666;font-size:12px">
        This report was auto-generated by the Leave Tracker system.
      </p>
    </div>
  `;

  await sendMail({
    from: process.env.SMTP_USER,
    to: toEmail,
    subject: `Leave Payroll Report — ${monthName}`,
    html,
  });

  return { sent: true, to: toEmail, month: monthName };
}

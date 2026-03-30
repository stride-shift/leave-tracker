import errorHandler from "../util/error-handler.js";
import {
  runMonthlyAccrual,
  getPayrollReport,
  getUserAccrualHistory,
  sendPayrollReportEmail,
} from "../util/accrual-service.js";

/**
 * POST /accrual/run
 * Manually trigger monthly accrual (admin only).
 * Body: { forDate?: string } — optional ISO date string, defaults to current month.
 */
export const triggerAccrual = async (req, res, next) => {
  try {
    const forDate = req.body.forDate ? new Date(req.body.forDate) : new Date();
    const results = await runMonthlyAccrual(forDate);

    return res.status(200).json({
      data: results,
      message: `Accrual complete: ${results.processed} processed, ${results.skipped} skipped`,
    });
  } catch (error) {
    next(errorHandler(500, error));
  }
};

/**
 * GET /accrual/payroll-report
 * Returns the current leave balance snapshot for all employees.
 */
export const payrollReport = async (req, res, next) => {
  try {
    const report = await getPayrollReport();
    return res.status(200).json({
      data: report,
      message: "Success",
    });
  } catch (error) {
    next(errorHandler(500, error));
  }
};

/**
 * POST /accrual/send-payroll-report
 * Emails the payroll report to a specified address.
 * Body: { email: string }
 */
export const emailPayrollReport = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: "Email address is required" });
    }
    const result = await sendPayrollReportEmail(email);
    return res.status(200).json({
      data: result,
      message: "Payroll report sent successfully",
    });
  } catch (error) {
    next(errorHandler(500, error));
  }
};

/**
 * GET /accrual/history/:userId
 * Returns the accrual log for a specific user.
 * Query: ?leaveTypeId=xxx (optional filter)
 */
export const accrualHistory = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { leaveTypeId } = req.query;
    const history = await getUserAccrualHistory(userId, leaveTypeId);
    return res.status(200).json({
      data: history,
      message: "Success",
    });
  } catch (error) {
    next(errorHandler(500, error));
  }
};

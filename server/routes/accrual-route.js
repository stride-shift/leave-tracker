import express from "express";
import { verifyToken, requireRole } from "../util/auth-middleware.js";
import {
  triggerAccrual,
  payrollReport,
  emailPayrollReport,
  accrualHistory,
} from "../controller/accrual-controller.js";

const router = express.Router();

// Admin/Manager: manually trigger monthly accrual
router.post("/run", verifyToken, triggerAccrual);

// Admin/Manager: get payroll report (all employees' leave balances)
router.get("/payroll-report", verifyToken, payrollReport);

// Admin/Manager: email the payroll report
router.post("/send-payroll-report", verifyToken, emailPayrollReport);

// Get accrual history for a specific user
router.get("/history/:userId", verifyToken, accrualHistory);

export default router;

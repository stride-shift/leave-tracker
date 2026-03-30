import express from "express";
import { verifyToken, requireRole } from "../util/auth-middleware.js";
import {
  addLeaveRequest,
  approveLeaveRequest,
  cancelLeaveRequest,
  deleteUser,
  fetchUser,
  listAllApprovedList,
  listLeaveRequest,
  listUserLeaveType,
  manageLeaveRequests,
  rejectLeaveRequest,
  listTeamApprovedLeaves,
  toggleLeavePrivacy,
  getLeaveRequestDetail,
  signLeaveRequest,
} from "../controller/dashboard-controller.js";

const router = express.Router();

router.get("/list-user-leave-types/:id", verifyToken, listUserLeaveType);
router.post("/add-leave-request/:id", verifyToken, addLeaveRequest);
router.get("/list-leave-request/:id", verifyToken, listLeaveRequest);
router.patch("/cancel-leave-request/:id", verifyToken, cancelLeaveRequest);
router.get("/manage-leave-request/:id", verifyToken, manageLeaveRequests);
router.get("/pending-approvals/:id", verifyToken, manageLeaveRequests);
router.patch("/approve-leave-request/:id", verifyToken, approveLeaveRequest);
router.patch("/reject-leave-request/:id", verifyToken, rejectLeaveRequest);
router.get("/list-approved-leaves/:id", verifyToken, listAllApprovedList);
router.get("/team-approved-leaves/:id", verifyToken, listTeamApprovedLeaves);
router.patch("/toggle-leave-privacy/:id", verifyToken, toggleLeavePrivacy);
router.get("/leave-request-detail/:id", verifyToken, getLeaveRequestDetail);
router.post("/sign-leave-request/:id", verifyToken, signLeaveRequest);
router.get("/leave-request-pdf/:id", verifyToken, async (req, res) => {
  try {
    const { prisma } = await import("../util/db.js");
    const PDFDocument = (await import("pdfkit")).default;

    const request = await prisma.leaveRequest.findUnique({
      where: { id: req.params.id },
      include: {
        user: { select: { fullName: true, email: true } },
        leaveType: { select: { name: true } },
        approvedBy: { select: { fullName: true } },
      },
    });
    if (!request) return res.status(404).json({ error: "Not found" });

    const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" }) : "—";
    const days = Math.round((new Date(request.endDate) - new Date(request.startDate)) / (1000*60*60*24)) + 1;

    const doc = new PDFDocument({ size: "A4", margin: 50 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="leave-form-${request.user.fullName.replace(/\s/g, "-")}.pdf"`);
    doc.pipe(res);

    // Header
    doc.fontSize(20).font("Helvetica-Bold").text("Leave Application Form", { align: "center" });
    doc.moveDown(0.3);
    doc.fontSize(10).font("Helvetica").fillColor("#666").text("Strideshift Global", { align: "center" });
    doc.moveDown(0.2);
    doc.fontSize(8).text(`Generated ${new Date().toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })}`, { align: "center" });
    doc.moveDown(1);

    // Line
    doc.strokeColor("#ccc").lineWidth(0.5).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.8);

    // Employee info
    doc.fontSize(9).font("Helvetica-Bold").fillColor("#888").text("EMPLOYEE INFORMATION");
    doc.moveDown(0.5);
    doc.fontSize(11).font("Helvetica").fillColor("#000");
    const row = (label, value, x, y) => {
      doc.fontSize(8).font("Helvetica").fillColor("#888").text(label, x, y);
      doc.fontSize(11).font("Helvetica").fillColor("#000").text(value || "—", x, y + 12);
    };
    const y1 = doc.y;
    row("Full Name", request.user.fullName, 50, y1);
    row("Email", request.user.email, 300, y1);
    doc.y = y1 + 40;
    const y2 = doc.y;
    row("Contact Phone", request.contactPhone, 50, y2);
    row("Contact Email (While Away)", request.contactEmail, 300, y2);
    doc.y = y2 + 50;

    // Separator
    doc.strokeColor("#eee").moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.8);

    // Leave details
    doc.fontSize(9).font("Helvetica-Bold").fillColor("#888").text("LEAVE DETAILS");
    doc.moveDown(0.5);
    const y3 = doc.y;
    row("Leave Type", request.leaveType.name, 50, y3);
    row("Start Date", fmtDate(request.startDate), 200, y3);
    row("End Date", fmtDate(request.endDate), 380, y3);
    doc.y = y3 + 40;
    const y4 = doc.y;
    row("Total Days", `${days} day${days !== 1 ? "s" : ""}`, 50, y4);
    row("Reason", request.reason, 200, y4);
    row("Status", request.status, 380, y4);
    doc.y = y4 + 50;

    // Separator
    doc.strokeColor("#eee").moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.8);

    // Employee signature
    doc.fontSize(9).font("Helvetica-Bold").fillColor("#888").text("EMPLOYEE SIGNATURE");
    doc.moveDown(0.5);
    if (request.signature) {
      try {
        doc.image(request.signature, 50, doc.y, { width: 200, height: 60 });
        doc.y += 65;
      } catch { doc.fontSize(10).fillColor("#999").text("(Signature on file)", 50); doc.moveDown(0.5); }
    } else {
      doc.fontSize(10).font("Helvetica-Oblique").fillColor("#999").text("No signature provided");
      doc.moveDown(0.5);
    }
    doc.fontSize(8).fillColor("#888").text(`Submitted: ${fmtDate(request.requestedAt)}`);
    doc.moveDown(1);

    // Separator
    doc.strokeColor("#eee").moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.8);

    // Manager sign-off
    doc.fontSize(9).font("Helvetica-Bold").fillColor("#888").text("MANAGER SIGN-OFF");
    doc.moveDown(0.5);
    if (request.managerSignature) {
      try {
        doc.image(request.managerSignature, 50, doc.y, { width: 200, height: 60 });
        doc.y += 65;
      } catch { doc.fontSize(10).fillColor("#999").text("(Signature on file)", 50); doc.moveDown(0.5); }
    } else {
      doc.fontSize(10).font("Helvetica-Oblique").fillColor("#999").text("Awaiting manager sign-off");
      doc.moveDown(0.5);
    }
    if (request.managerNote) {
      doc.fontSize(9).fillColor("#666").text(`Note: ${request.managerNote}`);
      doc.moveDown(0.3);
    }
    if (request.approvedBy) {
      doc.fontSize(8).fillColor("#888").text(`Signed by: ${request.approvedBy.fullName} | Decision: ${request.status} | Date: ${fmtDate(request.updatedAt)}`);
    }

    doc.moveDown(2);
    doc.strokeColor("#ccc").moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.5);
    doc.fontSize(7).fillColor("#aaa").text("This is a system-generated document from Leave Tracker — Strideshift Global", { align: "center" });

    doc.end();
  } catch (error) {
    console.error("PDF generation error:", error);
    res.status(500).json({ error: "Failed to generate PDF" });
  }
});
router.get("/fetch-user", fetchUser);
router.patch("/delete-user/:id", verifyToken, deleteUser);

export default router;

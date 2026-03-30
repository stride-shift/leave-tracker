import express from "express";
import { googleLogin, shareCalendar } from "../controller/auth-controller.js";
import { verifyToken, requireRole } from "../util/auth-middleware.js";
import { prisma } from "../util/db.js";
import jwt from "jsonwebtoken";
const router = express.Router();

router.get("/google", googleLogin);
router.get("/google/grant-calendar-permission", shareCalendar);

// Add-on login - by email (for Google Workspace Add-on)
router.post("/addon-login", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email required" });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ error: "User not found. Ask your admin to add you." });

    const token = jwt.sign(
      { id: user.id, userEmail: user.email, userRole: user.role, fullName: user.fullName },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    );

    return res.json({ token, user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role } });
  } catch (error) {
    return res.status(500).json({ error: "Login failed" });
  }
});

// Add-on - get current user + leave balances
router.get("/addon-me", verifyToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, email: true, fullName: true, role: true, avatarUrl: true },
    });
    if (!user) return res.status(404).json({ error: "User not found" });

    const leaveTypes = await prisma.userLeaveType.findMany({
      where: { userId: user.id },
      include: { leaveType: { select: { id: true, name: true } } },
    });

    return res.json({ user, leaveTypes });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch data" });
  }
});

router.post("/refresh", (req, res) => {
  const refreshToken = req.cookies?.refresh;

  if (!refreshToken) return res.sendStatus(403);
  const newAccess = jwt.verify(
    refreshToken,
    process.env.JWT_SECRET_REFRESH,
    (err, decoded) => {
      if (err) return res.sendStatus(403);

      const { id, userEmail, userRole, avatarUrl, fullName, createdAt } =
        decoded;

      const token = jwt.sign(
        {
          id,
          userEmail,
          userRole,
          avatarUrl,
          fullName,
          createdAt,
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_TIMEOUT_REFRESH || "7d" }
      );
      // For - cookies
      // res
      //   .cookie("access", newAccess, {
      //     httpOnly: true,
      //     sameSite: "strict",
      //     secure: false,
      //     maxAge: 15 * 60 * 1000,
      //   })
      //   .sendStatus(204);

      res.json({
        token,
        message: "Success",
      });
    }
  );
});

router.get("/admin", verifyToken, requireRole(["admin"]), (req, res) => {
  res.json({
    message: "Admin area accessed",
    user: req.user,
  });
});

export default router;

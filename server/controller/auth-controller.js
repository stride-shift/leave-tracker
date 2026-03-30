import oauth2Client from "../util/google-config.js";
import axios from "axios";
import { prisma } from "../util/db.js";
import jwt from "jsonwebtoken";
import errorHandler from "../util/error-handler.js";
import { calendar } from "../app.js";

export const googleLogin = async (req, res, next) => {
  try {
    const { code } = req.query;
    if (!code) {
      return res.status(400).json({ error: "Authorization code is required" });
    }

    const googleRes = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(googleRes.tokens);

    console.log("[Auth] Google tokens received:", {
      hasAccessToken: !!googleRes.tokens.access_token,
      hasRefreshToken: !!googleRes.tokens.refresh_token,
      scopes: googleRes.tokens.scope,
    });

    const userRes = await axios.get(
      `${process.env.GOOGLE_OAUTH_URL}${googleRes.tokens.access_token}`
    );
    const { email, name, picture } = userRes.data;
    const refresh_token = googleRes.tokens?.refresh_token;

    // Check if user already exists
    let user = await prisma.user.findFirst({ where: { email } });
    console.log("[Auth] Login:", email, "found:", !!user, "role:", user?.role);

    if (!user) {
      // Create new user — auto-detect tenant by email domain
      console.log("Creating a new user...");

      const domain = email.split("@")[1];
      let tenant = await prisma.tenant.findUnique({ where: { domain } });
      if (!tenant) {
        // Auto-create tenant for new org
        const orgName = domain.split(".")[0].charAt(0).toUpperCase() + domain.split(".")[0].slice(1);
        tenant = await prisma.tenant.create({
          data: { name: orgName, domain },
        });
        console.log("[Auth] Auto-created tenant:", tenant.name, "for domain:", domain);
      }

      // First user in a new tenant gets ADMIN role
      const existingUsers = await prisma.user.count({ where: { tenantId: tenant.id } });
      const role = existingUsers === 0 ? "ADMIN" : "TEAM_MEMBER";

      user = await prisma.user.create({
        data: {
          email,
          avatarUrl: picture,
          fullName: name,
          refresh_token: refresh_token || "",
          tenantId: tenant.id,
          role,
        },
      });

      console.log("[Auth] New user:", name, "role:", role, "tenant:", tenant.name);

      // Auto-assign leave types from this tenant
      const activeLeaveTypes = await prisma.leaveType.findMany({
        where: { isActive: true, isDeleted: false, tenantId: tenant.id },
        select: { id: true },
      });
      if (activeLeaveTypes.length > 0) {
        await prisma.userLeaveType.createMany({
          data: activeLeaveTypes.map((lt) => ({
            userId: user.id,
            leaveTypeId: lt.id,
            leaveBalance: 1.67,
            accrualRate: 1.67,
            isActive: true,
          })),
          skipDuplicates: true,
        });
      }
    } else {
      // Re-fetch to ensure we have latest role + tenantId
      if (refresh_token) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { refresh_token },
        });
      } else {
        // No new refresh token — just re-fetch the user to get current role
        user = await prisma.user.findUnique({ where: { id: user.id } });
      }
    }

    const {
      id,
      email: userEmail,
      role: userRole,
      avatarUrl,
      fullName,
      createdAt,
      tenantId,
    } = user;
    const userDetails = {
      id,
      tenantId,
      userEmail,
      userRole,
      avatarUrl,
      fullName,
      createdAt,
    };
    const token = jwt.sign(userDetails, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_TIMEOUT || "7d",
    });
    const refresh = jwt.sign(userDetails, process.env.JWT_SECRET_REFRESH, {
      expiresIn: process.env.JWT_TIMEOUT_REFRESH || "7d",
    });
    // req.headers.authorization = `Bearer ${token}`;

    // For - cookies
    // res
    //   .cookie("refresh", refreshToken, {
    //     httpOnly: true,
    //     sameSite: "strict",
    //     secure: false,
    //     maxAge: 7 * 24 * 60 * 60 * 1000,
    //   })
    //   .cookie("user-info", accessToken, {
    //     httpOnly: true,
    //     sameSite: "strict",
    //     secure: false,
    //     maxAge: 15 * 60 * 1000,
    //   })
    //   .sendStatus(204);
    return res
      .cookie("refresh", refresh, {
        httpOnly: true,
        sameSite: "strict",
        secure: false,
      })
      .status(201)
      .json({
        token,
        user,
        message: "Success",
      });
  } catch (error) {
    console.error("Google login error:", JSON.stringify(error?.response?.data || error?.message || error));
    next(errorHandler(500, error));
  }
};

export const shareCalendar = async (req, res, next) => {
  try {
    const { email } = req.query;

    if (!email.includes("gmail.com")) {
      throw new Error("Please login with authenticated gmail account.");
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    const respnse = await calendar.acl.insert({
      calendarId: "primary", // service account’s own primary calendar
      requestBody: {
        role: "owner", // or "writer" if you just want edit rights
        scope: {
          type: "user",
          value: user.email, // <-- replace with your account
        },
      },
    });

    console.log("Calendar shared:", res.data);
    return res.status(200).json({
      respnse,
      message: "Success",
    });
  } catch (err) {
    next(errorHandler(500, err));
  }
};

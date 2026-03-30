import express from "express";
import { google } from "googleapis";
import dotenv from "dotenv";
import cors from "cors";
// import fs from "fs";
import authRouter from "./routes/auth.js";
import usersRouter from "./routes/users-route.js";
import dashboardRoute from "./routes/dashboard-route.js";
import accrualRoute from "./routes/accrual-route.js";
import calendarRoute from "./routes/calendar-route.js";
import businessRoute from "./routes/business-route.js";
import path from "path";
import { fileURLToPath } from "url";
import cookieParser from "cookie-parser";
import { handleLlm } from "./util/model.js";
dotenv.config();
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
const allowedOrigins = process.env.DOCKERIZED === "true"
  ? [process.env.APP_URL, "https://leave-tracker-37696495215.europe-west1.run.app"]
  : ["http://localhost:3001", "http://localhost:3002", "http://localhost:3003", "http://localhost:5173"];

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (Google Apps Script, server-to-server)
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) !== -1) return callback(null, true);
      callback(null, true);
    },
    credentials: true,
  })
);

app.get("/healthz", (req, res) => {
  res.send({ message: "Healthy.." });
});

app.use("/auth", authRouter);
app.use("/users", usersRouter);
app.post("/ask-bot", handleLlm);
app.use("/dashboard", dashboardRoute);
app.use("/accrual", accrualRoute);
app.use("/calendar", calendarRoute);
app.use("/business", businessRoute);
app.use("/uploads", express.static(path.join(path.dirname(fileURLToPath(import.meta.url)), "uploads")));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.SERVICE_ACCOUNT_EMAIL,
    private_key: (process.env.SERVICE_ACCOUNT_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
  },
  scopes: [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/calendar.events",
  ],
});

export const gmail = google.gmail({ version: "v1", auth });
// export const sender = process.env.NOTIFICATION_SENDER_EMAIL;
export const calendar = google.calendar({ version: "v3", auth });

if (process.env.DOCKERIZED === "true") {
  const publicDir = path.join(process.cwd(), "public");
  app.use(express.static(publicDir));

  app.all("/{*splat}", (req, res, next) => {
    // Don't catch API routes — let them 404 as JSON
    const apiPaths = ["/auth", "/users", "/dashboard", "/accrual", "/calendar", "/business", "/ask-bot", "/healthz", "/uploads"];
    if (apiPaths.some(p => req.path.startsWith(p))) {
      return res.status(404).json({ error: "Not found" });
    }
    res.sendFile(path.join(publicDir, "index.html"));
  });
} else {
  const clientPath = path.join(__dirname, "../client/dist");
  app.use(express.static(clientPath));

  app.get("*splat", (req, res) => {
    res.sendFile(path.join(clientPath, "index.html"));
  });
}

app.use((err, req, res, next) => {
  const errorMessage = err?.message || err;
  const statusCode = err.statusCode || 500;
  console.log("Error at", errorMessage);
  console.log("Error Code at", statusCode);
  res.status(statusCode).json({
    success: false,
    message: errorMessage,
    statusCode,
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});

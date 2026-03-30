import express from "express";
import { verifyToken } from "../util/auth-middleware.js";
import { getGoogleCalendarEvents } from "../controller/calendar-controller.js";

const router = express.Router();

router.get("/events/:id", verifyToken, getGoogleCalendarEvents);

export default router;

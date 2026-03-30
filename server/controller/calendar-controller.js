import { google } from "googleapis";
import { prisma } from "../util/db.js";
import errorHandler from "../util/error-handler.js";
import oauth2Client from "../util/google-config.js";

// Fetch the logged-in user's Google Calendar events
export const getGoogleCalendarEvents = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { timeMin, timeMax } = req.query;

    // Get user's refresh token from DB
    const user = await prisma.user.findUnique({
      where: { id },
      select: { refresh_token: true, fullName: true, email: true },
    });

    if (!user || !user.refresh_token) {
      return res.status(200).json({
        events: [],
        message: "No Google Calendar linked. Please log in with Google again.",
      });
    }

    // Create a new OAuth2 client for this user
    const userOAuth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      "postmessage"
    );
    userOAuth.setCredentials({ refresh_token: user.refresh_token });

    const calendar = google.calendar({ version: "v3", auth: userOAuth });

    // Default: show current month's events
    const now = new Date();
    const defaultMin = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const defaultMax = new Date(now.getFullYear(), now.getMonth() + 2, 0).toISOString();

    const response = await calendar.events.list({
      calendarId: "primary",
      timeMin: timeMin || defaultMin,
      timeMax: timeMax || defaultMax,
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 250,
      // Request attachments (transcripts, recordings linked to events)
      supportsAttachments: true,
    });

    const events = (response.data.items || []).map((event) => {
      // Extract all conference entry points (Meet link, phone, etc.)
      const entryPoints = (event.conferenceData?.entryPoints || []).map((ep) => ({
        entryPointType: ep.entryPointType,
        uri: ep.uri,
        label: ep.label,
      }));

      // Extract attachments (transcripts, recordings stored in Drive)
      const attachments = (event.attachments || []).map((att) => ({
        fileUrl: att.fileUrl,
        title: att.title || "Attachment",
        mimeType: att.mimeType || "",
        iconLink: att.iconLink || "",
      }));

      // Parse description for Google Meet artifact links (recordings, transcripts, notes)
      const artifactLinks = [];
      const desc = event.description || "";

      // Extract ALL links from HTML description
      const linkRegex = /<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi;
      let match;
      while ((match = linkRegex.exec(desc)) !== null) {
        const url = match[1];
        const text = match[2];
        // Include Drive/Docs/Slides/Sheets links, and anything mentioning recording/transcript/notes
        if (
          url.includes("drive.google.com") ||
          url.includes("docs.google.com") ||
          url.includes("slides.google.com") ||
          url.includes("sheets.google.com") ||
          url.includes("meet.google.com") ||
          text.toLowerCase().includes("recording") ||
          text.toLowerCase().includes("transcript") ||
          text.toLowerCase().includes("notes") ||
          text.toLowerCase().includes("gemini")
        ) {
          artifactLinks.push({ url, title: text || "Link" });
        }
      }

      // Also check for plain-text Google URLs not already captured
      const plainUrlRegex = /(https:\/\/(?:drive|docs|slides|sheets)\.google\.com[^\s<"]+)/gi;
      let plainMatch;
      while ((plainMatch = plainUrlRegex.exec(desc)) !== null) {
        const url = plainMatch[1];
        if (!artifactLinks.some((a) => a.url === url)) {
          let title = "Drive file";
          if (url.includes("transcript")) title = "Transcript";
          else if (url.includes("slides")) title = "Slides";
          else if (url.includes("docs")) title = "Document";
          artifactLinks.push({ url, title });
        }
      }

      return {
        id: event.id,
        summary: event.summary || "(No title)",
        description: event.description || "",
        start: event.start?.dateTime || event.start?.date,
        end: event.end?.dateTime || event.end?.date,
        isAllDay: !event.start?.dateTime,
        location: event.location || "",
        htmlLink: event.htmlLink,
        attendees: (event.attendees || []).map((a) => ({
          email: a.email,
          displayName: a.displayName,
          responseStatus: a.responseStatus,
        })),
        organizer: event.organizer
          ? { email: event.organizer.email, displayName: event.organizer.displayName }
          : null,
        status: event.status,
        conferenceLink: event.conferenceData?.entryPoints?.[0]?.uri || null,
        entryPoints,
        attachments,
        artifactLinks,
      };
    });

    return res.status(200).json({
      events,
      message: "Google Calendar events fetched successfully",
    });
  } catch (error) {
    console.error("Google Calendar fetch error:", error?.message || error);
    // If token is expired/revoked/insufficient scopes, return empty gracefully
    const errMsg = error?.message || "";
    if (
      error?.response?.status === 401 ||
      error?.code === 401 ||
      errMsg.includes("insufficient") ||
      errMsg.includes("invalid_grant") ||
      errMsg.includes("Token has been expired or revoked")
    ) {
      return res.status(200).json({
        events: [],
        message: "Google Calendar access unavailable. Please log out and log back in with Google.",
      });
    }
    next(errorHandler(500, error));
  }
};

import { google } from "googleapis";
import dotenv from "dotenv";
dotenv.config();

console.log("[google-config] CLIENT_ID:", process.env.GOOGLE_CLIENT_ID?.slice(0, 20) + "...");
console.log("[google-config] CLIENT_SECRET:", process.env.GOOGLE_CLIENT_SECRET?.slice(0, 10) + "...");

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  "postmessage"
);

export default oauth2Client;

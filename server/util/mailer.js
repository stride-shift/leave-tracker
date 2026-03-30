import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.RESEND_FROM || "Leave Tracker <onboarding@resend.dev>";

/**
 * Send email via Resend.
 * Non-blocking — never throws, so calling code continues even if email fails.
 */
export async function sendMail({ from, to, subject, html }) {
  try {
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      replyTo: from || undefined,
    });

    if (error) {
      console.error("[mailer] Resend error:", error);
      return;
    }

    console.log(`[mailer] Sent to ${to}: "${subject}" (id: ${data?.id})`);
  } catch (error) {
    console.error("[mailer] Failed:", error?.message || error);
  }
}

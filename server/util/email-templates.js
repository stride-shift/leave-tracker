const APP_URL = process.env.APP_URL || "http://localhost:3001";
const LOGO_URL = "https://ekjnnqpvnoqjkyaypntm.supabase.co/storage/v1/object/public/assets/logo.png";

function layout(badge, badgeColor, title, lead, glassContent, footer) {
  const bc = { green: "#dcfce7;color:#15803d", amber: "#fef3c7;color:#92400e", red: "#fee2e2;color:#991b1b", gray: "#f4f4f5;color:#3f3f46" };
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f0fdf4;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;padding:40px 16px"><tr><td align="center">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%">

<!-- Card -->
<tr><td style="background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 20px 60px rgba(16,185,129,0.12);border:1px solid rgba(34,197,94,0.1)">

  <!-- Green bar -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="height:8px;background:linear-gradient(90deg,#22c55e,#16a34a,#10b981)"></td></tr></table>

  <!-- Content -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:40px 40px 36px">

    <!-- Logo -->
    <img src="${LOGO_URL}" alt="Leave Tracker" width="140" style="display:block;max-width:140px;height:auto;margin-bottom:28px" />

    <!-- Badge -->
    <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="padding:6px 14px;border-radius:999px;background:${bc[badgeColor] || bc.green};font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase">${badge}</td></tr></table>

    <!-- Title -->
    <h1 style="margin:16px 0 0;font-size:32px;line-height:1.15;font-weight:800;letter-spacing:-0.02em;color:#064e3b">${title}</h1>

    <!-- Lead text -->
    <p style="margin:14px 0 0;font-size:16px;line-height:1.7;color:#14532d">${lead}</p>

    <!-- Glass card -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px"><tr><td style="padding:20px;border-radius:16px;background:#f8fdf9;border:1px solid rgba(34,197,94,0.12)">
      ${glassContent}
    </td></tr></table>

    <!-- Footer text -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px"><tr><td style="padding-top:20px;border-top:1px solid rgba(34,197,94,0.1);font-size:14px;line-height:1.7;color:#166534">
      ${footer}
    </td></tr></table>

  </td></tr></table>
</td></tr>

<!-- Branding -->
<tr><td style="padding:20px 0 0;text-align:center">
  <p style="margin:0;font-size:12px;color:#6b7280">Sent by <strong style="color:#374151">Leave Tracker</strong> &middot; Strideshift Global</p>
  <p style="margin:4px 0 0;font-size:11px;color:#9ca3af">Automated message &middot; Do not reply</p>
</td></tr>

</table>
</td></tr></table>
</body></html>`;
}

function metaRow(items) {
  const cells = items.map(([label, value]) =>
    `<td style="padding:12px 16px;border-radius:12px;background:linear-gradient(180deg,#f0fdf4,#e8f8ed);border:1px solid rgba(34,197,94,0.08);vertical-align:top" width="${Math.floor(100/items.length)}%">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#16a34a;font-weight:700;margin-bottom:6px">${label}</div>
      <div style="font-size:15px;color:#064e3b;font-weight:600;line-height:1.4">${value}</div>
    </td>`
  ).join('<td width="12"></td>');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px"><tr>${cells}</tr></table>`;
}

function statusRow(label, value, pillText, pillColor) {
  const pc = { green: "background:#dcfce7;color:#065f46;border:1px solid #bbf7d0", amber: "background:#fef3c7;color:#92400e;border:1px solid #fde68a", red: "background:#fee2e2;color:#991b1b;border:1px solid #fecaca", gray: "background:#f4f4f5;color:#3f3f46;border:1px solid #e4e4e7" };
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="vertical-align:middle">
      <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#16a34a;font-weight:700;margin-bottom:4px">${label}</div>
      <div style="font-size:20px;font-weight:800;color:#064e3b">${value}</div>
    </td>
    <td style="vertical-align:middle;text-align:right">
      <span style="display:inline-block;padding:8px 16px;border-radius:999px;font-size:12px;font-weight:700;${pc[pillColor] || pc.green}">${pillText}</span>
    </td>
  </tr></table>`;
}

function btn(text, url) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px auto 0"><tr><td style="padding:14px 32px;background:#064e3b;border-radius:12px;text-align:center">
    <a href="${url}" style="color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;display:block">${text}</a>
  </td></tr></table>`;
}

// ─── Templates ───

export function leaveSubmittedEmail({ employeeName, leaveType, startDate, endDate, reason }) {
  return layout("Leave Request", "amber", "Leave request submitted",
    `Your <strong style="color:#065f46">${leaveType}</strong> from <strong style="color:#065f46">${startDate}</strong> to <strong style="color:#065f46">${endDate}</strong> has been submitted and is now awaiting approval.`,
    statusRow("Current status", "Awaiting approval", "Request received", "amber") +
    metaRow([["Leave type", leaveType], ["Dates", `${startDate} &mdash; ${endDate}`]]) +
    metaRow([["Employee", employeeName], ["Reason", reason || "&mdash;"]]),
    "We'll send you another update as soon as your request has been reviewed."
  );
}

export function leaveApprovedEmail({ employeeName, leaveType, startDate, endDate, approvedBy }) {
  return layout("Approved", "green", "Leave approved",
    `Your <strong style="color:#065f46">${leaveType}</strong> from <strong style="color:#065f46">${startDate}</strong> to <strong style="color:#065f46">${endDate}</strong> has been approved.`,
    statusRow("Status", "Approved", "Confirmed", "green") +
    metaRow([["Leave type", leaveType], ["Dates", `${startDate} &mdash; ${endDate}`]]) +
    metaRow([["Approved by", approvedBy || "Admin"], ["Calendar", "Event created"]]),
    "A calendar event has been created for your leave period. Enjoy your time off! &#127796;"
  );
}

export function leaveRejectedEmail({ employeeName, leaveType, startDate, endDate, rejectedBy }) {
  return layout("Rejected", "red", "Leave request rejected",
    `Your <strong style="color:#065f46">${leaveType}</strong> from <strong style="color:#065f46">${startDate}</strong> to <strong style="color:#065f46">${endDate}</strong> was not approved.`,
    statusRow("Status", "Rejected", "Not approved", "red") +
    metaRow([["Leave type", leaveType], ["Dates", `${startDate} &mdash; ${endDate}`]]) +
    metaRow([["Reviewed by", rejectedBy || "Admin"], ["Employee", employeeName]]),
    "If you have questions, please contact your administrator."
  );
}

export function leaveCancelledEmail({ employeeName, leaveType, startDate, endDate }) {
  return layout("Cancelled", "gray", "Leave request cancelled",
    `Your <strong style="color:#065f46">${leaveType}</strong> from <strong style="color:#065f46">${startDate}</strong> to <strong style="color:#065f46">${endDate}</strong> has been cancelled.`,
    statusRow("Status", "Cancelled", "Cancelled", "gray") +
    metaRow([["Leave type", leaveType], ["Dates", `${startDate} &mdash; ${endDate}`]]),
    "Your leave balance has been restored if it was previously deducted."
  );
}

export function managerNotificationEmail({ employeeName, leaveType, startDate, endDate, reason }) {
  return layout("Action Required", "amber", "New leave request",
    `<strong style="color:#065f46">${employeeName}</strong> has submitted a <strong style="color:#065f46">${leaveType}</strong> request from <strong style="color:#065f46">${startDate}</strong> to <strong style="color:#065f46">${endDate}</strong>.`,
    statusRow("Requires your action", "Pending review", "New request", "amber") +
    metaRow([["Employee", employeeName], ["Leave type", leaveType]]) +
    metaRow([["Dates", `${startDate} &mdash; ${endDate}`], ["Reason", reason || "&mdash;"]]) +
    btn("View in Dashboard &rarr;", APP_URL + "/dashboard/manage-leave-requests"),
    `Review this request in the <a href="${APP_URL}/dashboard/manage-leave-requests" style="color:#16a34a;text-decoration:none;font-weight:700">Leave Tracker dashboard</a>.`
  );
}

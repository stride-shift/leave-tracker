# Leave Tracker — Google Calendar Add-on Setup

## What This Does

Adds a sidebar to Google Calendar where employees can:
- View their leave balances
- Request leave by selecting dates
- See pending/approved/rejected requests

Managers/admins can also:
- See all pending requests requiring approval
- Approve or reject with one click
- Approved leaves auto-create Calendar events

## Setup Steps

### 1. Create the Apps Script Project

1. Go to [script.google.com](https://script.google.com)
2. Click **New Project**
3. Rename it to "Leave Tracker"

### 2. Add the Code Files

Create these files in the Apps Script editor (click **+** next to Files):

| Script File     | Copy from         |
|-----------------|-------------------|
| `Config.gs`     | `Config.gs`       |
| `Auth.gs`       | `Auth.gs`         |
| `Home.gs`       | `Home.gs`         |
| `RequestLeave.gs` | `RequestLeave.gs` |
| `Approvals.gs`  | `Approvals.gs`    |
| `EventTrigger.gs` | `EventTrigger.gs` |

Then replace `appsscript.json`:
- Click the gear icon (Project Settings)
- Check "Show 'appsscript.json' manifest file in editor"
- Click `appsscript.json` in the sidebar and replace with the content from `appsscript.json`

### 3. Update the API URL

In `Config.gs`, change `API_BASE_URL` to your deployed server URL:

```javascript
const API_BASE_URL = "https://your-server.run.app";
```

For local testing, use your machine's network IP (not localhost):
```javascript
const API_BASE_URL = "http://192.168.x.x:3000";
```

### 4. Deploy as Add-on

1. Click **Deploy** > **Test deployments**
2. Under "Application type", select **Google Workspace Add-on**
3. Click **Install**
4. Open Google Calendar — you should see "Leave Tracker" in the right sidebar

### 5. For Organization-wide Deployment

1. Click **Deploy** > **New deployment**
2. Select **Google Workspace Add-on**
3. Fill in the details and submit
4. Go to [Google Workspace Marketplace SDK](https://console.cloud.google.com/apis/api/appsmarket-component.googleapis.com)
5. Configure and publish for your organization

## How It Works

### Employee Flow
1. Open Google Calendar
2. Click "Leave Tracker" icon in sidebar
3. Sign in (uses your Google email automatically)
4. Click "Request Leave"
5. Select leave type, dates, reason
6. Submit — manager gets email notification

### Manager Flow
1. Receive email with approve/decline links (existing feature)
2. OR open Calendar sidebar > "Requests to Approve"
3. Click Approve/Reject for each request
4. Approved leaves appear as Calendar events automatically

### Calendar Event Flow
1. Employee requests leave
2. Manager approves via sidebar or email link
3. System creates Calendar event: "Annual Leave | John Smith | 1 Apr → 5 Apr"
4. If rejected/cancelled later, Calendar event is automatically deleted

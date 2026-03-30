/**
 * Configuration for the Leave Tracker Add-on.
 * Change API_BASE_URL to your deployed server URL.
 */

// For local development:
// const API_BASE_URL = "http://localhost:3000";
// For production (update after deploying to GCP):
const API_BASE_URL = "https://your-server.run.app";

/**
 * Get or set the user's auth token.
 * The token is stored in PropertiesService so it persists across sessions.
 */
function getToken() {
  return PropertiesService.getUserProperties().getProperty("AUTH_TOKEN");
}

function setToken(token) {
  PropertiesService.getUserProperties().setProperty("AUTH_TOKEN", token);
}

function clearToken() {
  PropertiesService.getUserProperties().deleteProperty("AUTH_TOKEN");
}

/**
 * Make an authenticated API request.
 */
function apiRequest(endpoint, method, payload) {
  const token = getToken();
  const options = {
    method: method || "get",
    headers: {
      "Authorization": token ? "Bearer " + token : "",
      "Content-Type": "application/json",
    },
    muteHttpExceptions: true,
  };

  if (payload) {
    options.payload = JSON.stringify(payload);
  }

  const response = UrlFetchApp.fetch(API_BASE_URL + endpoint, options);
  const code = response.getResponseCode();
  const body = JSON.parse(response.getContentText());

  if (code === 401) {
    clearToken();
    return { error: "Session expired. Please log in again." };
  }

  if (code >= 400) {
    return { error: body.error || body.message || "Request failed" };
  }

  return body;
}

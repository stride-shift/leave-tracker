/**
 * Login card - shown when user is not authenticated.
 */
function buildLoginCard() {
  const card = CardService.newCardBuilder()
    .setHeader(
      CardService.newCardHeader()
        .setTitle("Leave Tracker")
        .setSubtitle("Sign in to manage your leave")
        .setImageUrl("https://fonts.gstatic.com/s/i/short-term/release/googlesymbols/calendar_clock/default/48px.svg")
    );

  const section = CardService.newCardSection()
    .addWidget(
      CardService.newTextParagraph()
        .setText("Sign in with your Strideshift email to request leave, view balances, and manage approvals.")
    )
    .addWidget(
      CardService.newTextButton()
        .setText("Sign In with Google")
        .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
        .setBackgroundColor("#2D6A4F")
        .setOnClickAction(
          CardService.newAction().setFunctionName("handleGoogleLogin")
        )
    );

  card.addSection(section);
  return card.build();
}

/**
 * Handle Google login.
 * Uses the user's Google email to authenticate with the Leave Tracker API.
 */
function handleGoogleLogin(e) {
  const email = Session.getActiveUser().getEmail();

  if (!email) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("Could not get your email. Please try again."))
      .build();
  }

  // Call the API to login/register with Google email
  const response = apiRequest("/auth/addon-login", "post", { email: email });

  if (response.error) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("Login failed: " + response.error))
      .build();
  }

  if (response.token) {
    setToken(response.token);
    // Navigate to the home page
    const nav = CardService.newNavigation().updateCard(buildHomeCard());
    return CardService.newActionResponseBuilder().setNavigation(nav).build();
  }

  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText("Login failed. Contact your admin."))
    .build();
}

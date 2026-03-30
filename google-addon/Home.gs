/**
 * Homepage trigger - entry point for the add-on.
 */
function onHomepage(e) {
  return onCalendarHomepage(e);
}

function onCalendarHomepage(e) {
  if (!getToken()) {
    return buildLoginCard();
  }
  return buildHomeCard();
}

/**
 * Main home card - shows leave balance and quick actions.
 */
function buildHomeCard() {
  // Fetch user data and leave balances
  const userData = apiRequest("/auth/addon-me", "get");

  if (userData.error) {
    clearToken();
    return buildLoginCard();
  }

  const user = userData.user;
  const leaveTypes = userData.leaveTypes || [];
  const totalBalance = leaveTypes.reduce(function(sum, lt) { return sum + (lt.leaveBalance || 0); }, 0);

  const card = CardService.newCardBuilder()
    .setHeader(
      CardService.newCardHeader()
        .setTitle("Leave Tracker")
        .setSubtitle(user.fullName + " — " + totalBalance.toFixed(1) + " days available")
        .setImageUrl("https://fonts.gstatic.com/s/i/short-term/release/googlesymbols/person/default/48px.svg")
    );

  // Balance section
  var balanceSection = CardService.newCardSection()
    .setHeader("Your Leave Balances");

  if (leaveTypes.length > 0) {
    for (var i = 0; i < leaveTypes.length; i++) {
      var lt = leaveTypes[i];
      balanceSection.addWidget(
        CardService.newDecoratedText()
          .setText(lt.leaveType.name)
          .setBottomLabel(lt.leaveBalance.toFixed(1) + " days remaining")
      );
    }
  } else {
    balanceSection.addWidget(
      CardService.newTextParagraph().setText("No leave types assigned yet.")
    );
  }

  card.addSection(balanceSection);

  // Quick actions section
  var actionsSection = CardService.newCardSection()
    .setHeader("Quick Actions")
    .addWidget(
      CardService.newTextButton()
        .setText("Request Leave")
        .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
        .setBackgroundColor("#2D6A4F")
        .setOnClickAction(
          CardService.newAction().setFunctionName("showRequestLeaveForm")
        )
    )
    .addWidget(
      CardService.newTextButton()
        .setText("My Pending Requests")
        .setOnClickAction(
          CardService.newAction().setFunctionName("showPendingRequests")
        )
    );

  // Manager actions
  if (user.role === "ADMIN" || user.role === "MANAGER") {
    actionsSection.addWidget(
      CardService.newTextButton()
        .setText("Requests to Approve")
        .setOnClickAction(
          CardService.newAction().setFunctionName("showApprovalQueue")
        )
    );
  }

  card.addSection(actionsSection);

  // Logout
  card.addSection(
    CardService.newCardSection().addWidget(
      CardService.newTextButton()
        .setText("Sign Out")
        .setOnClickAction(
          CardService.newAction().setFunctionName("handleLogout")
        )
    )
  );

  return card.build();
}

function handleLogout(e) {
  clearToken();
  var nav = CardService.newNavigation().updateCard(buildLoginCard());
  return CardService.newActionResponseBuilder().setNavigation(nav).build();
}

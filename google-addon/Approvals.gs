/**
 * Show the user's pending leave requests.
 */
function showPendingRequests(e) {
  var userData = apiRequest("/auth/addon-me", "get");
  if (userData.error) { clearToken(); return buildLoginCard(); }

  var requests = apiRequest("/dashboard/list-leave-request/" + userData.user.id, "get");

  var card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle("My Leave Requests"));

  var section = CardService.newCardSection();

  var items = (requests.leaveRequests || []).filter(function(r) { return r.status === "PENDING"; });

  if (items.length === 0) {
    section.addWidget(CardService.newTextParagraph().setText("No pending requests."));
  } else {
    for (var i = 0; i < items.length; i++) {
      var r = items[i];
      var start = new Date(r.startDate).toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
      var end = new Date(r.endDate).toLocaleDateString("en-ZA", { day: "numeric", month: "short" });

      section.addWidget(
        CardService.newDecoratedText()
          .setText(r.leaveType.name)
          .setBottomLabel(start + " → " + end + " — " + r.status)
          .setWrapText(true)
      );
    }
  }

  // Also show recent approved/rejected
  var recent = (requests.leaveRequests || []).filter(function(r) { return r.status !== "PENDING"; }).slice(0, 5);
  if (recent.length > 0) {
    section.addWidget(CardService.newTextParagraph().setText("<b>Recent:</b>"));
    for (var j = 0; j < recent.length; j++) {
      var rr = recent[j];
      var s = new Date(rr.startDate).toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
      var en = new Date(rr.endDate).toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
      var emoji = rr.status === "APPROVED" ? "✅" : rr.status === "REJECTED" ? "❌" : "⏳";

      section.addWidget(
        CardService.newDecoratedText()
          .setText(emoji + " " + rr.leaveType.name)
          .setBottomLabel(s + " → " + en)
      );
    }
  }

  card.addSection(section);
  card.addSection(
    CardService.newCardSection().addWidget(
      CardService.newTextButton().setText("← Back").setOnClickAction(
        CardService.newAction().setFunctionName("navigateHome")
      )
    )
  );

  var nav = CardService.newNavigation().pushCard(card.build());
  return CardService.newActionResponseBuilder().setNavigation(nav).build();
}

/**
 * Show requests that need manager/admin approval.
 */
function showApprovalQueue(e) {
  var userData = apiRequest("/auth/addon-me", "get");
  if (userData.error) { clearToken(); return buildLoginCard(); }

  var result = apiRequest("/dashboard/pending-approvals/" + userData.user.id + "?status=PENDING", "get");

  var card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle("Requests to Approve"));

  var section = CardService.newCardSection();
  var items = result.managers || [];

  if (items.length === 0) {
    section.addWidget(CardService.newTextParagraph().setText("No requests waiting for your approval."));
  } else {
    for (var i = 0; i < items.length; i++) {
      var r = items[i];
      var start = new Date(r.startDate).toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
      var end = new Date(r.endDate).toLocaleDateString("en-ZA", { day: "numeric", month: "short" });

      section.addWidget(
        CardService.newDecoratedText()
          .setText("<b>" + r.user.fullName + "</b> — " + r.leaveType.name)
          .setBottomLabel(start + " → " + end + (r.reason ? " | " + r.reason : ""))
          .setWrapText(true)
      );

      // Approve / Reject buttons
      var btnSet = CardService.newButtonSet()
        .addButton(
          CardService.newTextButton()
            .setText("✅ Approve")
            .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
            .setBackgroundColor("#2D6A4F")
            .setOnClickAction(
              CardService.newAction()
                .setFunctionName("handleApprove")
                .setParameters({ requestId: r.id, managerId: userData.user.id })
            )
        )
        .addButton(
          CardService.newTextButton()
            .setText("❌ Reject")
            .setOnClickAction(
              CardService.newAction()
                .setFunctionName("handleReject")
                .setParameters({ requestId: r.id, managerId: userData.user.id })
            )
        );

      section.addWidget(btnSet);

      if (i < items.length - 1) {
        section.addWidget(CardService.newDivider());
      }
    }
  }

  card.addSection(section);
  card.addSection(
    CardService.newCardSection().addWidget(
      CardService.newTextButton().setText("← Back").setOnClickAction(
        CardService.newAction().setFunctionName("navigateHome")
      )
    )
  );

  var nav = CardService.newNavigation().pushCard(card.build());
  return CardService.newActionResponseBuilder().setNavigation(nav).build();
}

/**
 * Handle approval of a leave request.
 */
function handleApprove(e) {
  var params = e.parameters;
  var result = apiRequest(
    "/dashboard/approve-leave-request/" + params.requestId + "?managerUserId=" + params.managerId,
    "patch"
  );

  if (result.error) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("Failed: " + result.error))
      .build();
  }

  // Refresh the approval queue
  var nav = CardService.newNavigation().popCard();
  return CardService.newActionResponseBuilder()
    .setNavigation(nav)
    .setNotification(CardService.newNotification().setText("Leave approved ✅ Calendar event created."))
    .build();
}

/**
 * Handle rejection of a leave request.
 */
function handleReject(e) {
  var params = e.parameters;
  var result = apiRequest(
    "/dashboard/reject-leave-request/" + params.requestId + "?managerUserId=" + params.managerId,
    "patch"
  );

  if (result.error) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("Failed: " + result.error))
      .build();
  }

  var nav = CardService.newNavigation().popCard();
  return CardService.newActionResponseBuilder()
    .setNavigation(nav)
    .setNotification(CardService.newNotification().setText("Leave rejected ❌"))
    .build();
}

/**
 * Show the leave request form.
 */
function showRequestLeaveForm(e) {
  // Fetch leave types for the dropdown
  var userData = apiRequest("/auth/addon-me", "get");
  if (userData.error) { clearToken(); return buildLoginCard(); }

  var leaveTypes = userData.leaveTypes || [];
  var user = userData.user;

  var card = CardService.newCardBuilder()
    .setHeader(
      CardService.newCardHeader()
        .setTitle("Request Leave")
        .setSubtitle("Select dates and submit your request")
    );

  var formSection = CardService.newCardSection();

  // Leave type dropdown
  var leaveTypeDropdown = CardService.newSelectionInput()
    .setType(CardService.SelectionInputType.DROPDOWN)
    .setTitle("Leave Type")
    .setFieldName("leaveTypeId");

  for (var i = 0; i < leaveTypes.length; i++) {
    var lt = leaveTypes[i];
    leaveTypeDropdown.addItem(
      lt.leaveType.name + " (" + lt.leaveBalance.toFixed(1) + "d)",
      lt.leaveType.id,
      i === 0
    );
  }

  formSection.addWidget(leaveTypeDropdown);

  // Start date
  formSection.addWidget(
    CardService.newDatePicker()
      .setTitle("Start Date")
      .setFieldName("startDate")
      .setValueInMsSinceEpoch(Date.now())
  );

  // End date
  formSection.addWidget(
    CardService.newDatePicker()
      .setTitle("End Date")
      .setFieldName("endDate")
      .setValueInMsSinceEpoch(Date.now())
  );

  // Reason
  formSection.addWidget(
    CardService.newTextInput()
      .setFieldName("reason")
      .setTitle("Reason (optional)")
      .setMultiline(true)
      .setHint("e.g. Family vacation, medical appointment...")
  );

  // Submit button
  formSection.addWidget(
    CardService.newTextButton()
      .setText("Submit Request")
      .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
      .setBackgroundColor("#2D6A4F")
      .setOnClickAction(
        CardService.newAction().setFunctionName("submitLeaveRequest")
      )
  );

  // Cancel button
  formSection.addWidget(
    CardService.newTextButton()
      .setText("Cancel")
      .setOnClickAction(
        CardService.newAction().setFunctionName("navigateHome")
      )
  );

  card.addSection(formSection);

  var nav = CardService.newNavigation().pushCard(card.build());
  return CardService.newActionResponseBuilder().setNavigation(nav).build();
}

/**
 * Submit the leave request to the API.
 */
function submitLeaveRequest(e) {
  var formInputs = e.formInput || {};

  var leaveTypeId = formInputs.leaveTypeId;
  var startDateMs = e.formInputs && e.formInputs.startDate ? e.formInputs.startDate.msSinceEpoch : null;
  var endDateMs = e.formInputs && e.formInputs.endDate ? e.formInputs.endDate.msSinceEpoch : null;
  var reason = formInputs.reason || "";

  if (!leaveTypeId) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("Please select a leave type."))
      .build();
  }

  if (!startDateMs || !endDateMs) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("Please select start and end dates."))
      .build();
  }

  var startDate = new Date(parseInt(startDateMs));
  var endDate = new Date(parseInt(endDateMs));

  if (endDate < startDate) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("End date must be after start date."))
      .build();
  }

  // Get user ID
  var userData = apiRequest("/auth/addon-me", "get");
  if (userData.error) { clearToken(); return buildLoginCard(); }

  var result = apiRequest("/dashboard/add-leave-request/" + userData.user.id, "post", {
    leaveTypeId: leaveTypeId,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    reason: reason,
  });

  if (result.error) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText("Failed: " + result.error))
      .build();
  }

  // Success - show confirmation and go back
  var nav = CardService.newNavigation().popCard().updateCard(buildHomeCard());
  return CardService.newActionResponseBuilder()
    .setNavigation(nav)
    .setNotification(CardService.newNotification().setText("Leave request submitted! Your manager will be notified."))
    .build();
}

function navigateHome(e) {
  var nav = CardService.newNavigation().popToRoot().updateCard(buildHomeCard());
  return CardService.newActionResponseBuilder().setNavigation(nav).build();
}

/**
 * Triggered when a user opens a Calendar event.
 * Shows a contextual card if the event is a leave-tracker event.
 */
function onEventOpen(e) {
  if (!getToken()) return buildLoginCard();

  var calendarEvent = e.calendar;
  if (!calendarEvent || !calendarEvent.id) return buildHomeCard();

  // Check if this is a leave tracker event by checking extended properties
  try {
    var event = CalendarApp.getCalendarById(calendarEvent.calendarId)
      .getEventById(calendarEvent.id);

    if (!event) return buildHomeCard();

    var title = event.getTitle() || "";

    // Leave tracker events have format: "LeaveType | Name | Date → Date"
    if (title.indexOf("|") === -1) return buildHomeCard();

    var parts = title.split("|").map(function(s) { return s.trim(); });

    var card = CardService.newCardBuilder()
      .setHeader(
        CardService.newCardHeader()
          .setTitle("Leave Event")
          .setSubtitle(title)
      );

    var section = CardService.newCardSection()
      .addWidget(
        CardService.newDecoratedText()
          .setText("Leave Type")
          .setBottomLabel(parts[0] || "—")
      )
      .addWidget(
        CardService.newDecoratedText()
          .setText("Employee")
          .setBottomLabel(parts[1] || "—")
      )
      .addWidget(
        CardService.newDecoratedText()
          .setText("Period")
          .setBottomLabel(parts[2] || "—")
      )
      .addWidget(
        CardService.newTextParagraph()
          .setText("This leave was approved and synced from Leave Tracker.")
      );

    card.addSection(section);
    return card.build();

  } catch (err) {
    return buildHomeCard();
  }
}

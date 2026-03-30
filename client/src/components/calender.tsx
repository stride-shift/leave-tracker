import { useState, useMemo } from "react";
import {
  Calendar,
  momentLocalizer,
  type View,
  Navigate,
} from "react-big-calendar";
import moment from "moment";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "./gcal-overrides.css";
import ShowLeaveDialog from "./dashboard-feature/show-leave-dialog";
import type { CalendarEvent, startEndDateType } from "type";
import { toast } from "sonner";
import { api } from "@/utils/api";
import { useUserData } from "@/hooks/user-data";
import {
  useTeamLeaveRequests,
  type TeamLeaveEvent,
} from "@/hooks/useTeamLeaveRequests";
import {
  useGoogleCalendarEvents,
  type CalendarAttachment,
  type ArtifactLink,
} from "@/hooks/useGoogleCalendarEvents";
import { useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Search,
  Video,
  MapPin,
  Clock,
  Users,
  ExternalLink,
  FileText,
  Paperclip,
  X,
  Check,
  HelpCircle,
  XCircle,
  Calendar as CalendarIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

// Unified event type for the calendar
interface UnifiedEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  type: "leave" | "meeting";
  // Leave-specific
  fullName?: string;
  userId?: string;
  leaveType?: string;
  reason?: string;
  isOwn?: boolean;
  isPrivate?: boolean;
  // Meeting-specific
  summary?: string;
  description?: string;
  location?: string;
  conferenceLink?: string | null;
  attendees?: { email: string; displayName?: string; responseStatus: string }[];
  htmlLink?: string;
  attachments?: CalendarAttachment[];
  artifactLinks?: ArtifactLink[];
}

// Day-of-week color palette for agenda view rows
const DAY_COLORS = [
  { bg: "rgba(99, 102, 241, 0.10)", bgLight: "rgba(99, 102, 241, 0.06)", accent: "#818cf8", accentLight: "#4f46e5" },   // Sun — indigo
  { bg: "rgba(59, 130, 246, 0.10)", bgLight: "rgba(59, 130, 246, 0.06)", accent: "#60a5fa", accentLight: "#2563eb" },   // Mon — blue
  { bg: "rgba(16, 185, 129, 0.10)", bgLight: "rgba(16, 185, 129, 0.06)", accent: "#34d399", accentLight: "#059669" },   // Tue — emerald
  { bg: "rgba(245, 158, 11, 0.10)", bgLight: "rgba(245, 158, 11, 0.06)", accent: "#fbbf24", accentLight: "#d97706" },   // Wed — amber
  { bg: "rgba(236, 72, 153, 0.10)", bgLight: "rgba(236, 72, 153, 0.06)", accent: "#f472b6", accentLight: "#db2777" },   // Thu — pink
  { bg: "rgba(168, 85, 247, 0.10)", bgLight: "rgba(168, 85, 247, 0.06)", accent: "#c084fc", accentLight: "#7c3aed" },   // Fri — purple
  { bg: "rgba(20, 184, 166, 0.10)", bgLight: "rgba(20, 184, 166, 0.06)", accent: "#2dd4bf", accentLight: "#0d9488" },   // Sat — teal
];

// Google Calendar-style colors for team members
const MEMBER_COLORS = [
  { bg: "#039be5", light: "#e8f4fd" }, // blue
  { bg: "#33b679", light: "#e6f4ea" }, // sage
  { bg: "#8e24aa", light: "#f3e8f9" }, // grape
  { bg: "#e67c73", light: "#fce8e6" }, // flamingo
  { bg: "#f6bf26", light: "#fef7e0" }, // banana
  { bg: "#f4511e", light: "#fce4e1" }, // tangerine
  { bg: "#0b8043", light: "#e6f4ea" }, // basil
  { bg: "#3f51b5", light: "#e8eaf6" }, // blueberry
  { bg: "#616161", light: "#f1f1f1" }, // graphite
  { bg: "#d50000", light: "#fce8e6" }, // tomato
];

// Meeting color (Google Calendar default for meetings)
const MEETING_COLOR = { bg: "#4285f4", light: "#e8f0fe" };

function getColorForUser(
  userId: string,
  colorMap: Map<string, (typeof MEMBER_COLORS)[0]>
) {
  if (!colorMap.has(userId)) {
    colorMap.set(userId, MEMBER_COLORS[colorMap.size % MEMBER_COLORS.length]);
  }
  return colorMap.get(userId)!;
}

function Calender() {
  const localizer = momentLocalizer(moment);
  const [view, setView] = useState<View>("month");
  const storedData = useUserData();
  const userData = storedData?.data;
  const [date, setDate] = useState(new Date());
  const [startEndDate, setStarEndDate] = useState<startEndDateType>({
    start: new Date(),
    end: new Date(),
  });
  const [isLeaveDialogOpen, setIsLeaveDialogOpen] = useState<boolean>(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedMeeting, setSelectedMeeting] = useState<UnifiedEvent | null>(null);
  const queryClient = useQueryClient();

  // Compute time range based on current view date
  const timeRange = useMemo(() => {
    const d = moment(date);
    const timeMin = d.clone().subtract(1, "month").startOf("month").toISOString();
    const timeMax = d.clone().add(1, "month").endOf("month").toISOString();
    return { timeMin, timeMax };
  }, [date]);

  // Fetch team leave requests
  const {
    data: leaveEvents = [],
    isLoading: leavesLoading,
    isError: leavesError,
  } = useTeamLeaveRequests(userData?.id);

  // Fetch Google Calendar events
  const {
    data: gcalEvents = [],
    isLoading: gcalLoading,
    isError: gcalError,
  } = useGoogleCalendarEvents(userData?.id, timeRange.timeMin, timeRange.timeMax);

  // Merge both into unified events
  const allEvents: UnifiedEvent[] = useMemo(() => {
    const leaves: UnifiedEvent[] = leaveEvents.map((e) => ({
      id: e.id,
      title: `${e.fullName} — ${e.leaveType}`,
      start: e.start,
      end: e.end,
      type: "leave" as const,
      fullName: e.fullName,
      userId: e.userId,
      leaveType: e.leaveType,
      reason: e.reason,
      isOwn: e.isOwn,
      isPrivate: e.isPrivate,
    }));

    const meetings: UnifiedEvent[] = gcalEvents.map((e) => ({
      id: e.id,
      title: e.summary,
      start: new Date(e.start),
      end: new Date(e.end),
      type: "meeting" as const,
      summary: e.summary,
      description: e.description,
      location: e.location,
      conferenceLink: e.conferenceLink,
      attendees: e.attendees,
      htmlLink: e.htmlLink,
      attachments: e.attachments,
      artifactLinks: e.artifactLinks,
    }));

    return [...leaves, ...meetings];
  }, [leaveEvents, gcalEvents]);

  // Filter events by search
  const filteredEvents = useMemo(() => {
    if (!searchTerm.trim()) return allEvents;
    const q = searchTerm.toLowerCase();
    return allEvents.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        (e.fullName && e.fullName.toLowerCase().includes(q)) ||
        (e.leaveType && e.leaveType.toLowerCase().includes(q)) ||
        (e.reason && e.reason.toLowerCase().includes(q)) ||
        (e.summary && e.summary.toLowerCase().includes(q)) ||
        (e.location && e.location.toLowerCase().includes(q))
    );
  }, [allEvents, searchTerm]);

  // Build a stable color map per userId
  const colorMap = useMemo(() => {
    const map = new Map<string, (typeof MEMBER_COLORS)[0]>();
    if (userData?.id) {
      map.set(userData.id, MEMBER_COLORS[0]);
    }
    leaveEvents.forEach((e) => getColorForUser(e.userId, map));
    return map;
  }, [leaveEvents, userData?.id]);

  const handleSelectSlot = ({ start, end }: { start: Date; end: Date }) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (start < today) {
      toast("Error", {
        description: "You cannot select a date earlier than today.",
        style: { backgroundColor: "red", color: "white" },
        richColors: true,
      });
      return;
    }

    const inclusiveEnd = new Date(end);
    inclusiveEnd.setDate(end.getDate() - 1);
    setIsLeaveDialogOpen(true);
    const diffTime = inclusiveEnd.getTime() - start.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;
    setStarEndDate({ start, end: end, totalDay: diffDays });
  };

  const handleSelectEvent = (event: UnifiedEvent) => {
    if (event.type === "meeting") {
      setSelectedMeeting(event);
    }
  };

  const handleDoubleClickEvent = () => {};
  const handleNavigate = (newDate: Date) => setDate(newDate);

  async function togglePrivacy(leaveId: string) {
    try {
      await api.patch(`/dashboard/toggle-leave-privacy/${leaveId}`, {
        userId: userData?.id,
      });
      queryClient.invalidateQueries({ queryKey: ["teamLeaveRequests"] });
      toast("Updated", { description: "Leave visibility changed." });
    } catch {
      toast("Error", { description: "Could not update privacy." });
    }
  }

  async function addEvents(newEvent: CalendarEvent) {
    try {
      toast("Processing...", {
        description: <div>Hold on!</div>,
        duration: 5000,
      });

      await api.post(`/dashboard/add-leave-request/${userData?.id}`, {
        leaveTypeId: newEvent.leaveType,
        startDate: moment(newEvent.start).add(1, "days").toISOString(),
        endDate: moment(newEvent.end).add(0, "days").toISOString(),
        reason: newEvent.reason,
        contactPhone: (newEvent as any).contactPhone,
        contactEmail: (newEvent as any).contactEmail,
        signature: (newEvent as any).signature,
      });
      toast("Success", { description: "Applied for leave request." });
      queryClient.invalidateQueries({ queryKey: ["teamLeaveRequests"] });
    } catch (error) {
      console.error(error);
      toast("Error", { description: "Something went wrong" });
    }
  }

  // Build legend
  const memberLegend = useMemo(() => {
    const seen = new Map<
      string,
      { name: string; color: string; isOwn: boolean }
    >();
    leaveEvents.forEach((e) => {
      if (!seen.has(e.userId)) {
        seen.set(e.userId, {
          name: e.fullName,
          color: getColorForUser(e.userId, colorMap).bg,
          isOwn: e.isOwn,
        });
      }
    });
    return Array.from(seen.values());
  }, [leaveEvents, colorMap]);

  const isLoading = leavesLoading || gcalLoading;

  // Google Calendar-style toolbar
  const GCalToolbar = (toolbar: any) => {
    const viewLabels: Record<string, string> = {
      month: "Month",
      week: "Week",
      day: "Day",
      agenda: "Schedule",
    };

    return (
      <div className="gcal-toolbar">
        <div className="gcal-toolbar-left">
          <button
            className="gcal-today-btn"
            onClick={() => toolbar.onNavigate(Navigate.TODAY)}
          >
            Today
          </button>
          <button
            className="gcal-nav-btn"
            onClick={() => toolbar.onNavigate(Navigate.PREVIOUS)}
          >
            <ChevronLeft size={20} />
          </button>
          <button
            className="gcal-nav-btn"
            onClick={() => toolbar.onNavigate(Navigate.NEXT)}
          >
            <ChevronRight size={20} />
          </button>
          <h2 className="gcal-title">{toolbar.label}</h2>
        </div>

        <div className="gcal-toolbar-right">
          <button
            className="gcal-nav-btn"
            onClick={() => setShowSearch(!showSearch)}
            title="Search events"
          >
            <Search size={18} />
          </button>

          <div className="gcal-view-switcher">
            {toolbar.views.map((v: View) => (
              <button
                key={v}
                className={`gcal-view-btn ${
                  toolbar.view === v ? "gcal-view-btn-active" : ""
                }`}
                onClick={() => toolbar.onView(v)}
              >
                {viewLabels[v] || v}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="gcal-container">
      <ShowLeaveDialog
        events={addEvents}
        open={isLeaveDialogOpen}
        startEndDate={startEndDate}
        setOpen={() => setIsLeaveDialogOpen(false)}
      />

      {/* Meeting detail dialog */}
      <Dialog open={!!selectedMeeting} onOpenChange={() => setSelectedMeeting(null)}>
        <DialogContent className="meeting-dialog sm:max-w-[440px] p-0 overflow-hidden gap-0 rounded-2xl border-0 shadow-2xl" showCloseButton={false}>
          {selectedMeeting && (
            <>
              {/* Header — clean white with colored accent */}
              <div className="meeting-dialog-header">
                <div className="meeting-dialog-accent" />
                <div className="flex-1 min-w-0 pl-4 pr-10 py-5">
                  <DialogHeader>
                    <DialogTitle className="text-[17px] font-semibold leading-snug tracking-tight">
                      {selectedMeeting.summary || selectedMeeting.title}
                    </DialogTitle>
                    <DialogDescription asChild>
                      <div className="flex items-center gap-4 mt-2">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <CalendarIcon size={14} className="shrink-0 opacity-70" />
                          <span className="text-[13px]">{moment(selectedMeeting.start).format("ddd, MMM D")}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Clock size={14} className="shrink-0 opacity-70" />
                          <span className="text-[13px]">
                            {moment(selectedMeeting.start).format("h:mm A")} – {moment(selectedMeeting.end).format("h:mm A")}
                          </span>
                        </div>
                      </div>
                    </DialogDescription>
                  </DialogHeader>
                </div>
                <button
                  onClick={() => setSelectedMeeting(null)}
                  className="meeting-dialog-close"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Body */}
              <div className="meeting-dialog-body">
                {/* Join meeting CTA */}
                {selectedMeeting.conferenceLink && (
                  <a
                    href={selectedMeeting.conferenceLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="meeting-join-btn"
                  >
                    <div className="meeting-join-icon">
                      <Video size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">Join with Google Meet</p>
                      <p className="text-xs opacity-80 truncate mt-0.5">{selectedMeeting.conferenceLink.replace("https://", "")}</p>
                    </div>
                    <ExternalLink size={14} className="shrink-0 opacity-60" />
                  </a>
                )}

                {/* Location */}
                {selectedMeeting.location && (
                  <div className="meeting-info-row">
                    <MapPin size={16} className="meeting-info-icon" />
                    <span className="text-sm">{selectedMeeting.location}</span>
                  </div>
                )}

                {/* Attachments: Recordings & Notes */}
                {selectedMeeting.attachments && selectedMeeting.attachments.length > 0 && (
                  <div className="meeting-section">
                    <p className="meeting-section-label">
                      <Paperclip size={13} className="opacity-50" />
                      Attachments
                    </p>
                    <div className="meeting-cards-grid">
                      {selectedMeeting.attachments.map((att, i) => {
                        const isRecording = att.title.toLowerCase().includes("recording") || att.mimeType.includes("video");
                        const isNotes = att.title.toLowerCase().includes("notes") || att.title.toLowerCase().includes("gemini");
                        return (
                          <a
                            key={i}
                            href={att.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="meeting-attachment-card"
                          >
                            <div className={`meeting-attachment-icon ${
                              isRecording
                                ? "meeting-attachment-recording"
                                : isNotes
                                ? "meeting-attachment-notes"
                                : "meeting-attachment-generic"
                            }`}>
                              {isRecording ? (
                                <Video size={16} />
                              ) : isNotes ? (
                                <FileText size={16} />
                              ) : att.iconLink ? (
                                <img src={att.iconLink} alt="" className="w-4 h-4" />
                              ) : (
                                <Paperclip size={16} />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-[13px] font-medium truncate">{att.title}</p>
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                {isRecording ? "Video recording" : isNotes ? "Meeting notes" : att.mimeType.split("/").pop()}
                              </p>
                            </div>
                            <ExternalLink size={12} className="shrink-0 opacity-0 group-hover/att:opacity-50 transition-opacity" />
                          </a>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Artifact links from description */}
                {selectedMeeting.artifactLinks && selectedMeeting.artifactLinks.length > 0 &&
                  !(selectedMeeting.attachments && selectedMeeting.attachments.length > 0) && (
                  <div className="meeting-section">
                    <p className="meeting-section-label">
                      <FileText size={13} className="opacity-50" />
                      Files
                    </p>
                    <div className="meeting-cards-grid">
                      {selectedMeeting.artifactLinks.map((link, i) => {
                        const isRecording = link.title.toLowerCase().includes("recording");
                        const isTranscript = link.title.toLowerCase().includes("transcript") || link.title.toLowerCase().includes("notes");
                        return (
                          <a
                            key={i}
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="meeting-attachment-card"
                          >
                            <div className={`meeting-attachment-icon ${
                              isRecording ? "meeting-attachment-recording" : "meeting-attachment-notes"
                            }`}>
                              {isRecording ? (
                                <Video size={16} />
                              ) : isTranscript ? (
                                <FileText size={16} />
                              ) : (
                                <ExternalLink size={16} />
                              )}
                            </div>
                            <p className="text-[13px] font-medium truncate flex-1">{link.title}</p>
                            <ExternalLink size={12} className="shrink-0 opacity-0 group-hover/att:opacity-50 transition-opacity" />
                          </a>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Description */}
                {selectedMeeting.description && (
                  <div className="meeting-section">
                    <p className="meeting-section-label">
                      <FileText size={13} className="opacity-50" />
                      Description
                    </p>
                    <div
                      className="meeting-description gcal-description-html"
                      dangerouslySetInnerHTML={{ __html: selectedMeeting.description }}
                    />
                  </div>
                )}

                {/* Attendees */}
                {selectedMeeting.attendees && selectedMeeting.attendees.length > 0 && (
                  <div className="meeting-section">
                    <p className="meeting-section-label">
                      <Users size={13} className="opacity-50" />
                      {selectedMeeting.attendees.length} Guest{selectedMeeting.attendees.length !== 1 ? "s" : ""}
                    </p>
                    <div className="meeting-attendees-list">
                      {selectedMeeting.attendees.map((a, i) => (
                        <div key={i} className="meeting-attendee-row">
                          <div className="meeting-attendee-avatar">
                            {(a.displayName || a.email).charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-medium truncate">{a.displayName || a.email}</p>
                            {a.displayName && (
                              <p className="text-[11px] text-muted-foreground truncate">{a.email}</p>
                            )}
                          </div>
                          <div className="meeting-attendee-status" title={a.responseStatus}>
                            {a.responseStatus === "accepted" ? (
                              <Check size={12} className="text-emerald-500" />
                            ) : a.responseStatus === "declined" ? (
                              <XCircle size={12} className="text-red-400" />
                            ) : a.responseStatus === "tentative" ? (
                              <HelpCircle size={12} className="text-amber-500" />
                            ) : (
                              <HelpCircle size={12} className="text-gray-400" />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              {selectedMeeting.htmlLink && (
                <div className="meeting-dialog-footer">
                  <a
                    href={selectedMeeting.htmlLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="meeting-gcal-link"
                  >
                    <CalendarIcon size={13} />
                    Open in Google Calendar
                  </a>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Search bar */}
      {showSearch && (
        <div className="gcal-search-bar">
          <Search size={16} className="gcal-search-icon" />
          <input
            autoFocus
            type="text"
            placeholder="Search for people, meetings, or leave types"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="gcal-search-input"
          />
          {searchTerm && (
            <button
              className="gcal-search-clear"
              onClick={() => setSearchTerm("")}
            >
              &times;
            </button>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="gcal-legend">
        {/* Meetings indicator */}
        {gcalEvents.length > 0 && (
          <div className="gcal-legend-item">
            <span
              className="gcal-legend-dot"
              style={{ backgroundColor: MEETING_COLOR.bg, borderRadius: "50%" }}
            />
            <span className="gcal-legend-name">My Meetings</span>
          </div>
        )}
        {/* Team member leaves */}
        {memberLegend.map((m) => (
          <div key={m.name} className="gcal-legend-item">
            <span
              className="gcal-legend-dot"
              style={{ backgroundColor: m.color }}
            />
            <span className="gcal-legend-name">
              {m.name}
              {m.isOwn && <span className="gcal-legend-you"> (You)</span>}
              {" — Leave"}
            </span>
          </div>
        ))}
      </div>

      {/* Status banners */}
      {isLoading && (
        <div className="gcal-status-bar">Loading...</div>
      )}
      {leavesError && (
        <div className="gcal-error-bar">
          Could not load leave requests. Make sure the server is running.
        </div>
      )}

      {/* The Calendar */}
      <div className="gcal-wrapper">
        <Calendar
          localizer={localizer}
          events={filteredEvents}
          startAccessor="start"
          endAccessor="end"
          style={{ height: "calc(100vh - 180px)", minHeight: 500 }}
          view={view}
          date={date}
          onView={setView}
          onNavigate={handleNavigate}
          views={["month", "week", "day", "agenda"]}
          selectable="ignoreEvents"
          onSelectSlot={handleSelectSlot}
          onSelectEvent={handleSelectEvent}
          onDoubleClickEvent={handleDoubleClickEvent}
          min={new Date(0, 0, 0, 6, 0, 0)}
          max={new Date(0, 0, 0, 22, 0, 0)}
          step={30}
          timeslots={2}
          defaultView="month"
          popup
          tooltipAccessor={(event: any) => {
            if (event.type === "meeting") {
              let tip = event.summary || event.title;
              if (event.location) tip += `\n${event.location}`;
              if (event.attendees?.length) {
                tip += `\n${event.attendees.length} attendee(s)`;
              }
              return tip;
            }
            return `${event.fullName} — ${event.leaveType}${event.reason ? `\n${event.reason}` : ""}`;
          }}
          dayPropGetter={(d: Date) => {
            const isToday = moment(d).isSame(moment(), "day");
            return isToday ? { className: "gcal-today-cell" } : {};
          }}
          eventPropGetter={(event: any) => {
            // In agenda view, style the row with day-based colors
            if (view === "agenda") {
              const colorVal = event.type === "meeting"
                ? MEETING_COLOR.bg
                : getColorForUser(event.userId, colorMap).bg;
              const dayOfWeek = new Date(event.start).getDay();
              const dayColor = DAY_COLORS[dayOfWeek];
              return {
                className: `gcal-event ${event.type === "meeting" ? "gcal-event-meeting" : "gcal-event-leave"}`,
                style: {
                  "--event-color": colorVal,
                  "--day-bg": dayColor.bg,
                  "--day-bg-light": dayColor.bgLight,
                  "--day-accent": dayColor.accent,
                  "--day-accent-light": dayColor.accentLight,
                } as React.CSSProperties,
              };
            }
            if (event.type === "meeting") {
              return {
                className: "gcal-event gcal-event-meeting",
                style: {
                  backgroundColor: MEETING_COLOR.bg,
                  borderLeft: `4px solid ${MEETING_COLOR.bg}`,
                  color: "#fff",
                },
              };
            }
            // Leave event
            const colors = getColorForUser(event.userId, colorMap);
            return {
              className: "gcal-event gcal-event-leave",
              style: {
                backgroundColor: colors.bg,
                borderLeft: `4px solid ${colors.bg}`,
                color: "#fff",
              },
            };
          }}
          components={{
            toolbar: GCalToolbar,
            month: {
              dateHeader: ({ date: d, label }: any) => {
                const isToday = moment(d).isSame(moment(), "day");
                return (
                  <span
                    className={`gcal-date-header ${
                      isToday ? "gcal-date-today" : ""
                    }`}
                  >
                    {label}
                  </span>
                );
              },
            },
            event: (props: any) => {
              const evt = props.event as UnifiedEvent;

              if (evt.type === "meeting") {
                const hasArtifacts = (evt.attachments && evt.attachments.length > 0) || (evt.artifactLinks && evt.artifactLinks.length > 0);
                return (
                  <div className="gcal-event-content">
                    {evt.conferenceLink ? (
                      <Video size={11} style={{ flexShrink: 0, opacity: 0.8 }} />
                    ) : evt.location ? (
                      <MapPin size={11} style={{ flexShrink: 0, opacity: 0.8 }} />
                    ) : (
                      <span className="gcal-event-dot" style={{ background: "rgba(255,255,255,0.6)" }} />
                    )}
                    <span className="gcal-event-text">{evt.summary || evt.title}</span>
                    {hasArtifacts && (
                      <Paperclip size={10} style={{ flexShrink: 0, opacity: 0.7, marginLeft: "auto" }} />
                    )}
                  </div>
                );
              }

              // Leave event
              return (
                <div className="gcal-event-content">
                  <span className="gcal-event-dot" />
                  <span className="gcal-event-text">
                    {evt.fullName} — {evt.leaveType}
                  </span>
                  {evt.isOwn && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePrivacy(evt.id);
                      }}
                      className="gcal-privacy-btn"
                      title={
                        evt.isPrivate
                          ? "Hidden from team — click to show"
                          : "Visible to team — click to hide"
                      }
                    >
                      {evt.isPrivate ? (
                        <EyeOff size={12} />
                      ) : (
                        <Eye size={12} />
                      )}
                    </button>
                  )}
                </div>
              );
            },
          }}
          longPressThreshold={10}
        />
      </div>
    </div>
  );
}

export default Calender;

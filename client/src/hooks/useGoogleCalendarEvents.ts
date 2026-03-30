import { api } from "@/utils/api";
import { useQuery } from "@tanstack/react-query";

export interface CalendarAttachment {
  fileUrl: string;
  title: string;
  mimeType: string;
  iconLink: string;
}

export interface ArtifactLink {
  url: string;
  title: string;
}

export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description: string;
  start: string;
  end: string;
  isAllDay: boolean;
  location: string;
  htmlLink: string;
  attendees: { email: string; displayName?: string; responseStatus: string }[];
  organizer: { email: string; displayName?: string } | null;
  status: string;
  conferenceLink: string | null;
  entryPoints: { entryPointType: string; uri: string; label?: string }[];
  attachments: CalendarAttachment[];
  artifactLinks: ArtifactLink[];
}

export function useGoogleCalendarEvents(
  userId?: string,
  timeMin?: string,
  timeMax?: string
) {
  return useQuery({
    queryKey: ["googleCalendarEvents", userId, timeMin, timeMax],
    queryFn: async (): Promise<GoogleCalendarEvent[]> => {
      if (!userId) return [];

      const params = new URLSearchParams();
      if (timeMin) params.set("timeMin", timeMin);
      if (timeMax) params.set("timeMax", timeMax);

      const response = await api.get(
        `/calendar/events/${userId}?${params.toString()}`
      );

      return response.data?.events || [];
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 3, // cache 3 minutes
    retry: 1,
  });
}

import { api } from "@/utils/api";
import { useQuery } from "@tanstack/react-query";

export interface TeamLeaveEvent {
  id: string;
  reason: string;
  leaveType: string;
  start: Date;
  end: Date;
  fullName: string;
  userId: string;
  avatarUrl?: string;
  isOwn: boolean;
  isPrivate: boolean;
}

export function useTeamLeaveRequests(currentUserId?: string) {
  return useQuery({
    queryKey: ["teamLeaveRequests", currentUserId],
    queryFn: async (): Promise<TeamLeaveEvent[]> => {
      if (!currentUserId) return [];

      const response = await api.get(
        `/dashboard/team-approved-leaves/${currentUserId}`
      );

      return (
        response.data?.approvedLeaves?.map((r: any) => ({
          id: r.id,
          reason: r.reason,
          leaveType: r.leaveType?.name,
          start: new Date(r.startDate),
          end: new Date(r.endDate),
          fullName: r.user.fullName,
          userId: r.user.id,
          avatarUrl: r.user.avatarUrl,
          isOwn: r.user.id === currentUserId,
          isPrivate: r.isPrivate,
        })) || []
      );
    },
    enabled: !!currentUserId,
    staleTime: 1000 * 60 * 5,
    retry: 1,
  });
}

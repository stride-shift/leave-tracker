import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/utils/api";
import { useUserData } from "@/hooks/user-data";
import { Card, CardContent } from "@/components/ui/card";
import { CalendarDays, Leaf, TrendingUp } from "lucide-react";

import Pending from "./dashboard-feature/user-leave-requests/pending";
import Cancelled from "./dashboard-feature/user-leave-requests/cancelled";
import Approved from "./dashboard-feature/user-leave-requests/approved";
import Rejected from "./dashboard-feature/user-leave-requests/rejected";

interface UserLeaveType {
  isActive: boolean;
  leaveBalance: number;
  leaveType: {
    id: string;
    name: string;
    description: string;
    isActive: boolean;
    isDeleted: boolean;
  };
}

const LEAVE_COLORS: Record<string, { icon: string }> = {
  "Vacation": { icon: "from-blue-500 to-blue-600" },
  "Sick Leave": { icon: "from-red-500 to-rose-600" },
  "Family Responsibility / Compassionate": { icon: "from-purple-500 to-purple-600" },
  "Maternity Leave": { icon: "from-pink-500 to-pink-600" },
  "Study Leave": { icon: "from-amber-500 to-orange-500" },
};

const DEFAULT_COLOR = { icon: "from-emerald-500 to-green-600" };

export default function LeaveRequests() {
  const storeData = useUserData();
  const userId = storeData?.data?.id;

  const { data: leaveData } = useQuery({
    queryKey: ["user-leave-types", userId],
    queryFn: async () => {
      const res = await api.get(`/dashboard/list-user-leave-types/${userId}`);
      return res.data;
    },
    enabled: !!userId,
  });

  const leaveTypes: UserLeaveType[] = leaveData?.userLeaveTypes || [];
  const totalBalance = leaveData?.totalBalance?._sum?.leaveBalance || 0;

  return (
    <div className="flex w-full p-2 flex-col gap-6">
      <h1 className="text-xl font-semibold">Leave Requests</h1>

      {/* Leave Balance Cards */}
      <div className="space-y-3">
          <div className="flex items-center gap-2">
            <CalendarDays size={16} className="text-muted-foreground" />
            <p className="text-sm font-medium text-muted-foreground">Your Leave Balances</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {/* Total card */}
            <Card className="border-dashed">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0">
                    <TrendingUp size={18} className="text-white" />
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Total Days</p>
                    <p className="text-2xl font-extrabold tracking-tight">{totalBalance.toFixed(1)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Individual leave type cards */}
            {leaveTypes.map((lt) => {
              const colors = LEAVE_COLORS[lt.leaveType.name] || DEFAULT_COLOR;
              return (
                <Card key={lt.leaveType.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${colors.icon} flex items-center justify-center shrink-0`}>
                        <Leaf size={18} className="text-white" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider truncate">{lt.leaveType.name}</p>
                        <p className="text-2xl font-extrabold tracking-tight">{lt.leaveBalance.toFixed(1)}</p>
                        <p className="text-[10px] text-muted-foreground">days remaining</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        {leaveTypes.length === 0 && (
          <p className="text-sm text-muted-foreground italic">No leave types assigned yet. Contact your admin.</p>
        )}
      </div>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
          <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          <Pending />
        </TabsContent>

        <TabsContent value="approved">
          <Approved />
        </TabsContent>

        <TabsContent value="rejected">
          <Rejected />
        </TabsContent>

        <TabsContent value="cancelled">
          <Cancelled />
        </TabsContent>
      </Tabs>
    </div>
  );
}

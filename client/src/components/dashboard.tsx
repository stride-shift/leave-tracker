import { AppSidebar } from "./app-siderbar";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Outlet, useLocation } from "react-router";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { useTheme } from "next-themes";
import { Moon, Sun, CalendarDays } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/utils/api";
import { useUserData } from "@/hooks/user-data";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useEffect, useRef } from "react";

const pageTitles: Record<string, string> = {
  "/dashboard/me": "Schedule Leaves",
  "/dashboard/admin": "Configuration",
  "/dashboard/leave-requests": "My Leave Requests",
  "/dashboard/manage-leave-requests": "Manage Requests",
  "/dashboard/payroll-report": "Payroll Report",
  "/dashboard/business-tracker": "Business Tracker",
};

export default function Dashboard() {
  const location = useLocation();
  const { resolvedTheme, setTheme } = useTheme();
  const storeData = useUserData();
  const userId = storeData?.data?.id;
  const queryClient = useQueryClient();
  const backfillRan = useRef(false);

  const { data: leaveData, isFetched } = useQuery({
    queryKey: ["header-leave-balance", userId],
    queryFn: async () => {
      const res = await api.get(`/dashboard/list-user-leave-types/${userId}`);
      return res.data;
    },
    enabled: !!userId,
  });

  // Auto-backfill if user has no leave types assigned
  useEffect(() => {
    if (isFetched && userId && !backfillRan.current) {
      const types = leaveData?.userLeaveTypes || [];
      if (types.length === 0) {
        backfillRan.current = true;
        api.post("/users/backfill-leave-types").then(() => {
          queryClient.invalidateQueries({ queryKey: ["header-leave-balance", userId] });
          queryClient.invalidateQueries({ queryKey: ["user-leave-types", userId] });
        }).catch(() => {});
      }
    }
  }, [isFetched, userId, leaveData, queryClient]);

  const totalBalance = leaveData?.totalBalance?._sum?.leaveBalance || 0;
  const leaveTypes = leaveData?.userLeaveTypes || [];

  const currentPage =
    pageTitles[location.pathname] || "Dashboard";

  return (
    <SidebarProvider className="flex">
      <AppSidebar />
      <div className="flex flex-col w-full min-h-screen overflow-hidden">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator
            orientation="vertical"
            className="mr-2 data-[orientation=vertical]:h-4"
          />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem className="hidden md:block">
                <BreadcrumbLink href="/dashboard/me">Dashboard</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem>
                <BreadcrumbPage>{currentPage}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="ml-auto flex items-center gap-3">
            {/* Leave balance indicator — always visible */}
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border bg-background hover:bg-accent/50 cursor-default transition-colors">
                    <CalendarDays size={14} className="text-indigo-500" />
                    <span className="text-xs font-semibold">{totalBalance.toFixed(1)}</span>
                    <span className="text-[10px] text-muted-foreground hidden sm:inline">days</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" align="end" className="p-3">
                  <p className="text-xs font-semibold mb-2">Your Leave Balances</p>
                  {leaveTypes.length > 0 ? (
                    <div className="space-y-1.5">
                      {leaveTypes.map((lt: any) => (
                        <div key={lt.leaveType.id} className="flex items-center justify-between gap-4 text-xs">
                          <span className="text-muted-foreground">{lt.leaveType.name}</span>
                          <Badge variant="secondary" className="text-[10px] font-bold px-1.5 py-0">
                            {lt.leaveBalance.toFixed(1)}d
                          </Badge>
                        </div>
                      ))}
                      <Separator className="my-1" />
                      <div className="flex items-center justify-between gap-4 text-xs font-semibold">
                        <span>Total</span>
                        <span>{totalBalance.toFixed(1)} days</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No leave types assigned yet</p>
                  )}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <button
              onClick={() =>
                setTheme(resolvedTheme === "dark" ? "light" : "dark")
              }
              className="inline-flex cursor-pointer items-center justify-center rounded-md w-9 h-9 border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
              title={
                resolvedTheme === "dark"
                  ? "Switch to light mode"
                  : "Switch to dark mode"
              }
            >
              {resolvedTheme === "dark" ? (
                <Sun size={16} />
              ) : (
                <Moon size={16} />
              )}
            </button>
          </div>
        </header>
        <SidebarInset className="flex-1 overflow-y-auto">
          <Outlet />
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

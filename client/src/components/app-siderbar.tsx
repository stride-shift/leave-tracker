import * as React from "react";
import { Link, useLocation } from "react-router";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { useUserData } from "@/hooks/user-data";
import {
  LayoutDashboard,
  FileText,
  ShieldCheck,
  Users,
  Receipt,
  BriefcaseBusiness,
  LogOut,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useNavigate } from "react-router";
import { useTheme } from "next-themes";

export function AppSidebar({
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  const userContext = useUserData();
  const location = useLocation();
  const navigate = useNavigate();
  const { resolvedTheme } = useTheme();

  function handleLogout() {
    localStorage.removeItem("user-info");
    navigate("/");
  }

  const role = userContext?.data?.role;
  const isSuper = role === "SUPER_ADMIN";
  const isAdmin = role === "ADMIN" || isSuper;
  const isManager = role === "MANAGER" || isAdmin;

  const navItems = [
    isAdmin && {
      title: "Admin Control",
      url: "/dashboard/admin",
      icon: ShieldCheck,
    },
    {
      title: "Dashboard",
      url: "/dashboard/me",
      icon: LayoutDashboard,
    },
    {
      title: "My Leave Requests",
      url: "/dashboard/leave-requests",
      icon: FileText,
    },
    isManager && {
      title: "Manage Requests",
      url: "/dashboard/manage-leave-requests",
      icon: Users,
    },
    isManager && {
      title: "Payroll Report",
      url: "/dashboard/payroll-report",
      icon: Receipt,
    },
    isManager && {
      title: "Business Tracker",
      url: "/dashboard/business-tracker",
      icon: BriefcaseBusiness,
    },
  ].filter(Boolean) as { title: string; url: string; icon: React.ElementType }[];

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="p-3">
        <div className="flex items-center gap-3 group-data-[collapsible=icon]:justify-center">
          <img
            src={resolvedTheme === "light" ? "/logo-light.png" : "/logo-dark.png"}
            alt="Leave Tracker"
            className="h-10 w-auto object-contain shrink-0 group-data-[collapsible=icon]:h-8"
          />
          <div className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="text-xs text-muted-foreground">
              {role === "SUPER_ADMIN"
                ? "Super Admin"
                : role === "ADMIN"
                ? "Administrator"
                : role === "MANAGER"
                ? "Manager"
                : "Employee"}
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location.pathname === item.url}
                  >
                    <Link to={item.url}>
                      <item.icon className="size-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3">
        <div className="flex items-center gap-3 rounded-lg p-2">
          <Avatar className="size-8">
            <AvatarImage src={userContext?.data?.img || "/default-user.webp"} />
            <AvatarFallback className="text-xs">
              {userContext?.data?.name?.slice(0, 2)?.toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col flex-1 min-w-0 leading-tight">
            <span className="text-sm font-medium truncate">
              {userContext?.data?.name}
            </span>
            <span className="text-xs text-muted-foreground truncate">
              {userContext?.data?.email}
            </span>
          </div>
          <button
            onClick={handleLogout}
            className="cursor-pointer text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-sidebar-accent"
            title="Log out"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/utils/api";

import { useEffect, useState } from "react";

import { CreateProject } from "./create-project";
import { ProjectTable } from "./project-table";
import { UserTable } from "./user-data";
import { LeaveTypeManager } from "./leave-type-manager";
import { LeaveBalanceManager } from "./leave-balance-manager";
import { OrgManager } from "./org-manager";

export function RoleAssignTabs() {
  const [allMembers, setAllMembers] = useState<
    {
      label: string;
      value: string;
      icon: React.ComponentType<{ className?: string }>;
    }[]
  >([]);

  // const [allUsers, setAllUsers] = useState<
  //   [{ fullName: string; id: string; role: string }] | null
  // >(null);

  async function fetchAllUsers() {
    const res = await api.get("/users/list-all");
    const data = await res.data;

    // setAllUsers(data?.allUsers);
    if (data?.message === "Success") {
      setAllMembers(
        data?.allUsers
          // ?.filter((profile: any) => profile.role === "TEAM_MEMBER")
          ?.map((profile: any) => ({
            label: profile.fullName,
            value: profile.id,
            icon: ({ className }: { className?: string }) => (
              <div
                className={`relative w-6 h-6 rounded-full overflow-hidden ${
                  className || ""
                }`}
              >
                <img
                  className="object-cover "
                  src={profile.avatarUrl ?? "/default-user.webp"}
                  alt={profile.avatarUrl ?? "/default-user.webp"}
                />
              </div>
            ),
          }))
      );
    }
  }

  useEffect(() => {
    fetchAllUsers();
  }, []);

  return (
    <div className="flex w-full  flex-col gap-6 bg">
      <Tabs defaultValue="organization">
        <TabsList>
          <TabsTrigger value="organization">Organization</TabsTrigger>
          <TabsTrigger value="create-project">Create Project</TabsTrigger>
          <TabsTrigger value="all-projects">All Projects</TabsTrigger>
          <TabsTrigger value="user-data">User Data</TabsTrigger>
          <TabsTrigger value="assign-leaves">Create Leaves</TabsTrigger>
          <TabsTrigger value="leave-balances">Leave Balances</TabsTrigger>
        </TabsList>

        <TabsContent value="organization">
          <OrgManager />
        </TabsContent>

        <TabsContent value="all-projects">
          {/* <AssignMember allMembers={allMembers} allUsers={allUsers} /> */}
          <ProjectTable />
        </TabsContent>

        <TabsContent value="create-project">
          <CreateProject allMembers={allMembers} />
        </TabsContent>

        {/* <TabsContent value="assign-manager">
          <AssignManager allUsers={allUsers} />
        </TabsContent> */}

        <TabsContent value="user-data">
          <UserTable />
        </TabsContent>

        <TabsContent value="assign-leaves">
          <LeaveTypeManager />
        </TabsContent>

        <TabsContent value="leave-balances">
          <LeaveBalanceManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}

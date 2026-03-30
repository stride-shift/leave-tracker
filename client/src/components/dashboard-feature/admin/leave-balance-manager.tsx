import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/utils/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Search, Save, Users, Leaf } from "lucide-react";

interface UserLeaveType {
  leaveBalance: number;
  accrualRate: number;
  isActive: boolean;
  leaveType: {
    id: string;
    name: string;
  };
}

interface UserWithLeaves {
  id: string;
  fullName: string;
  email: string;
  role: string;
  avatarUrl?: string;
  assignedTypes: UserLeaveType[];
}

export function LeaveBalanceManager() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [editingCell, setEditingCell] = useState<{ userId: string; leaveTypeId: string; field: "balance" | "rate" } | null>(null);
  const [editValue, setEditValue] = useState("");

  const { data: usersData, isLoading } = useQuery<UserWithLeaves[]>({
    queryKey: ["leave-balances-all"],
    queryFn: async () => {
      const res = await api.get("/users/list-all");
      const users = res.data?.allUsers || [];
      const detailed = await Promise.all(
        users.map(async (u: any) => {
          const detail = await api.get(`/users/get-user-detail/${u.id}`);
          return detail.data?.userData;
        })
      );
      return detailed.filter(Boolean);
    },
  });

  const { data: leaveTypes } = useQuery({
    queryKey: ["leave-types"],
    queryFn: async () => {
      const res = await api.get("/users/list-leave-type");
      return res.data?.leaveTypes || [];
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ userId, leaveTypeId, leaveBalance, accrualRate }: {
      userId: string; leaveTypeId: string; leaveBalance?: number; accrualRate?: number;
    }) => {
      return (await api.patch(`/users/update-user-leavetype/${userId}`, { leaveTypeId, leaveBalance, accrualRate })).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leave-balances-all"] });
      toast("Updated", { description: "Leave balance updated" });
      setEditingCell(null);
    },
    onError: () => toast("Error", { description: "Failed to update" }),
  });

  const users = usersData || [];
  const activeLeaveTypes = (leaveTypes || []).filter((lt: any) => lt.isActive && !lt.isDeleted);

  const filteredUsers = searchTerm.trim()
    ? users.filter((u) => u.fullName.toLowerCase().includes(searchTerm.toLowerCase()) || u.email.toLowerCase().includes(searchTerm.toLowerCase()))
    : users;

  const getBalance = (user: UserWithLeaves, leaveTypeId: string) => {
    const assigned = user.assignedTypes?.find((a) => a.leaveType.id === leaveTypeId);
    return assigned ? { balance: assigned.leaveBalance, rate: assigned.accrualRate, active: assigned.isActive } : null;
  };

  const handleSave = (userId: string, leaveTypeId: string, field: "balance" | "rate") => {
    const val = parseFloat(editValue);
    if (isNaN(val) || val < 0) return toast("Invalid value");
    if (field === "balance") {
      updateMutation.mutate({ userId, leaveTypeId, leaveBalance: val });
    } else {
      updateMutation.mutate({ userId, leaveTypeId, accrualRate: val });
    }
  };

  const totalBalance = users.reduce((sum, u) => {
    return sum + (u.assignedTypes?.reduce((s, a) => s + a.leaveBalance, 0) || 0);
  }, 0);

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center">
              <Users size={18} className="text-indigo-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Total Users</p>
              <p className="text-2xl font-bold">{users.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center">
              <Leaf size={18} className="text-emerald-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Leave Types</p>
              <p className="text-2xl font-bold">{activeLeaveTypes.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center">
              <Leaf size={18} className="text-amber-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Total Days Across All</p>
              <p className="text-2xl font-bold">{totalBalance.toFixed(1)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-9 w-[260px] text-sm"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Default accrual: <span className="font-semibold text-foreground">1.67 days/month</span> &middot; Click any value to edit
        </p>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-left text-[11px] text-muted-foreground uppercase tracking-wider">
                  <th className="px-4 py-3 font-semibold sticky left-0 bg-muted/30 z-10 min-w-[200px]">Employee</th>
                  <th className="px-3 py-3 font-semibold text-center min-w-[60px]">Role</th>
                  {activeLeaveTypes.map((lt: any) => (
                    <th key={lt.id} className="px-3 py-3 font-semibold text-center min-w-[120px]" colSpan={2}>
                      {lt.name}
                    </th>
                  ))}
                </tr>
                <tr className="border-b bg-muted/20 text-[10px] text-muted-foreground">
                  <th className="px-4 py-1.5 sticky left-0 bg-muted/20 z-10"></th>
                  <th className="px-3 py-1.5"></th>
                  {activeLeaveTypes.map((lt: any) => (
                    <>
                      <th key={`${lt.id}-bal`} className="px-3 py-1.5 text-center font-medium">Balance</th>
                      <th key={`${lt.id}-rate`} className="px-3 py-1.5 text-center font-medium">Rate/mo</th>
                    </>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {isLoading ? (
                  <tr>
                    <td colSpan={2 + activeLeaveTypes.length * 2} className="px-4 py-12 text-center text-muted-foreground">
                      Loading...
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={2 + activeLeaveTypes.length * 2} className="px-4 py-12 text-center text-muted-foreground">
                      No users found
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-accent/30 transition-colors">
                      <td className="px-4 py-3 sticky left-0 bg-background z-10">
                        <div className="flex items-center gap-2.5">
                          {user.avatarUrl ? (
                            <img src={user.avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover" />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-[11px] font-bold text-white shrink-0">
                              {user.fullName.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <p className="font-medium text-[13px]">{user.fullName}</p>
                            <p className="text-[11px] text-muted-foreground">{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <Badge variant="secondary" className="text-[10px] font-semibold">
                          {user.role}
                        </Badge>
                      </td>
                      {activeLeaveTypes.map((lt: any) => {
                        const data = getBalance(user, lt.id);
                        const isEditingBalance = editingCell?.userId === user.id && editingCell?.leaveTypeId === lt.id && editingCell?.field === "balance";
                        const isEditingRate = editingCell?.userId === user.id && editingCell?.leaveTypeId === lt.id && editingCell?.field === "rate";
                        return (
                          <>
                            {/* Balance */}
                            <td key={`${user.id}-${lt.id}-bal`} className="px-3 py-3 text-center">
                              {data ? (
                                isEditingBalance ? (
                                  <div className="flex items-center gap-1 justify-center">
                                    <Input
                                      type="number"
                                      step="0.01"
                                      value={editValue}
                                      onChange={(e) => setEditValue(e.target.value)}
                                      className="h-7 w-16 text-xs text-center"
                                      autoFocus
                                      onKeyDown={(e) => { if (e.key === "Enter") handleSave(user.id, lt.id, "balance"); if (e.key === "Escape") setEditingCell(null); }}
                                    />
                                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleSave(user.id, lt.id, "balance")}>
                                      <Save size={12} />
                                    </Button>
                                  </div>
                                ) : (
                                  <span
                                    className="cursor-pointer hover:bg-accent px-2 py-1 rounded text-[13px] font-semibold tabular-nums"
                                    onClick={() => { setEditingCell({ userId: user.id, leaveTypeId: lt.id, field: "balance" }); setEditValue(String(data.balance)); }}
                                  >
                                    {data.balance.toFixed(2)}
                                  </span>
                                )
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
                            </td>
                            {/* Rate */}
                            <td key={`${user.id}-${lt.id}-rate`} className="px-3 py-3 text-center">
                              {data ? (
                                isEditingRate ? (
                                  <div className="flex items-center gap-1 justify-center">
                                    <Input
                                      type="number"
                                      step="0.01"
                                      value={editValue}
                                      onChange={(e) => setEditValue(e.target.value)}
                                      className="h-7 w-16 text-xs text-center"
                                      autoFocus
                                      onKeyDown={(e) => { if (e.key === "Enter") handleSave(user.id, lt.id, "rate"); if (e.key === "Escape") setEditingCell(null); }}
                                    />
                                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleSave(user.id, lt.id, "rate")}>
                                      <Save size={12} />
                                    </Button>
                                  </div>
                                ) : (
                                  <span
                                    className="cursor-pointer hover:bg-accent px-2 py-1 rounded text-[13px] text-muted-foreground tabular-nums"
                                    onClick={() => { setEditingCell({ userId: user.id, leaveTypeId: lt.id, field: "rate" }); setEditValue(String(data.rate)); }}
                                  >
                                    {data.rate.toFixed(2)}
                                  </span>
                                )
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
                            </td>
                          </>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

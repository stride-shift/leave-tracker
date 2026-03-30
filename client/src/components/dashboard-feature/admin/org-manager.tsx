import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/utils/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Building2, UserPlus, Shield, Users, Crown, Trash2, Pencil, Loader2, Plus, Globe } from "lucide-react";
import { useUserData } from "@/hooks/user-data";

const mono = "'Geist Mono', 'JetBrains Mono', monospace";

const ROLE_BADGE: Record<string, string> = {
  ADMIN: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
  MANAGER: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  TEAM_MEMBER: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20",
};

const ROLE_ICON: Record<string, typeof Shield> = { ADMIN: Crown, MANAGER: Shield, TEAM_MEMBER: Users };

export function OrgManager() {
  const qc = useQueryClient();
  const userData = useUserData();
  const isSuperAdmin = userData?.data?.role === "SUPER_ADMIN";
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("TEAM_MEMBER");
  const [editingOrg, setEditingOrg] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgDomain, setNewOrgDomain] = useState("");
  const [showCreateOrg, setShowCreateOrg] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["org-details"],
    queryFn: async () => {
      const res = await api.get("/users/org-details");
      return res.data;
    },
  });

  const addMemberMutation = useMutation({
    mutationFn: async () => (await api.post("/users/add-new-user", { email: newEmail, fullName: newName, role: newRole })).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["org-details"] }); setNewEmail(""); setNewName(""); setNewRole("TEAM_MEMBER"); toast("Member added to organization"); },
    onError: (e: any) => toast.error(e?.response?.data?.error || "Failed to add member"),
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: string }) => (await api.patch(`/users/update-member-role/${id}`, { role })).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["org-details"] }); toast("Role updated"); },
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/users/remove-member/${id}`)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["org-details"] }); toast("Member removed"); },
  });

  const { data: allOrgsData } = useQuery({
    queryKey: ["all-orgs"],
    queryFn: async () => (await api.get("/users/all-orgs")).data,
    enabled: isSuperAdmin,
  });

  const createOrgMutation = useMutation({
    mutationFn: async () => (await api.post("/users/create-org", { name: newOrgName, domain: newOrgDomain })).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["all-orgs"] }); setNewOrgName(""); setNewOrgDomain(""); setShowCreateOrg(false); toast("Organization created"); },
    onError: (e: any) => toast.error(e?.response?.data?.error || "Failed"),
  });

  const updateOrgMutation = useMutation({
    mutationFn: async () => (await api.patch("/users/update-org", { name: orgName })).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["org-details"] }); setEditingOrg(false); toast("Organization updated"); },
  });

  const tenant = data?.tenant;
  const members = data?.members || [];
  const stats = data?.stats || {};

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6 py-4">

      {/* Org header */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <Building2 size={18} className="text-emerald-500" />
            </div>
            <div>
              {editingOrg ? (
                <div className="flex items-center gap-2">
                  <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} className="h-8 w-[200px] text-sm" autoFocus />
                  <Button size="sm" className="h-8" onClick={() => updateOrgMutation.mutate()}>Save</Button>
                  <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditingOrg(false)}>Cancel</Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-foreground">{tenant?.name || "Organization"}</h3>
                  <button onClick={() => { setOrgName(tenant?.name || ""); setEditingOrg(true); }} className="text-muted-foreground hover:text-foreground"><Pencil size={13} /></button>
                </div>
              )}
              <p className="text-xs text-muted-foreground" style={{ fontFamily: mono }}>{tenant?.domain}</p>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3 mt-4">
          {[
            { label: "Total", value: stats.total || 0, color: "text-foreground" },
            { label: "Admins", value: stats.admins || 0, color: "text-purple-500" },
            { label: "Managers", value: stats.managers || 0, color: "text-blue-500" },
            { label: "Members", value: stats.members || 0, color: "text-zinc-500" },
          ].map((s, i) => (
            <div key={i} className="text-center p-3 rounded-lg bg-muted/30">
              <div className={`text-xl font-bold ${s.color}`} style={{ fontFamily: mono }}>{s.value}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider" style={{ fontFamily: mono }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Add member */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <UserPlus size={15} className="text-muted-foreground" />
          <h4 className="text-sm font-semibold text-foreground">Add Member</h4>
        </div>
        <div className="grid grid-cols-4 gap-3">
          <div>
            <Label className="text-xs">Full Name</Label>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="John Smith" className="h-9 mt-1" />
          </div>
          <div>
            <Label className="text-xs">Email</Label>
            <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="john@company.com" className="h-9 mt-1" />
          </div>
          <div>
            <Label className="text-xs">Role</Label>
            <Select value={newRole} onValueChange={setNewRole}>
              <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="TEAM_MEMBER">Team Member</SelectItem>
                <SelectItem value="MANAGER">Manager</SelectItem>
                <SelectItem value="ADMIN">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button
              className="h-9 w-full"
              disabled={!newEmail.trim() || !newName.trim() || addMemberMutation.isPending}
              onClick={() => addMemberMutation.mutate()}
            >
              {addMemberMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
              <span className="ml-1.5">Add</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Members list */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center gap-2">
          <Users size={14} className="text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">Organization Members</span>
          <span className="text-xs text-muted-foreground ml-auto" style={{ fontFamily: mono }}>{members.length} members</span>
        </div>

        <div className="divide-y divide-border">
          {members.map((member: any) => {
            const RoleIcon = ROLE_ICON[member.role] || Users;
            return (
              <div key={member.id} className="flex items-center gap-3 px-5 py-3 group hover:bg-accent/30 transition-colors">
                {member.avatarUrl ? (
                  <img src={member.avatarUrl} alt="" className="w-8 h-8 rounded-full" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">
                    {member.fullName?.charAt(0)?.toUpperCase()}
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{member.fullName}</p>
                  <p className="text-xs text-muted-foreground" style={{ fontFamily: mono }}>{member.email}</p>
                </div>

                <Select value={member.role} onValueChange={(role) => updateRoleMutation.mutate({ id: member.id, role })}>
                  <SelectTrigger className="w-[140px] h-8 text-xs">
                    <div className="flex items-center gap-1.5">
                      <RoleIcon size={12} />
                      <SelectValue />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ADMIN"><div className="flex items-center gap-1.5"><Crown size={12} /> Admin</div></SelectItem>
                    <SelectItem value="MANAGER"><div className="flex items-center gap-1.5"><Shield size={12} /> Manager</div></SelectItem>
                    <SelectItem value="TEAM_MEMBER"><div className="flex items-center gap-1.5"><Users size={12} /> Team Member</div></SelectItem>
                  </SelectContent>
                </Select>

                <button
                  onClick={() => { if (confirm(`Remove ${member.fullName} from the organization?`)) removeMutation.mutate(member.id); }}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500 transition-all p-1"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* ═══ ALL ORGANIZATIONS (SUPER_ADMIN only) ═══ */}
      {isSuperAdmin && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe size={14} className="text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">All Organizations</span>
              <span className="text-xs text-muted-foreground ml-1" style={{ fontFamily: mono }}>{allOrgsData?.tenants?.length || 0}</span>
            </div>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setShowCreateOrg(!showCreateOrg)}>
              <Plus size={12} /> Add Organization
            </Button>
          </div>

          {showCreateOrg && (
            <div className="px-5 py-4 border-b border-border bg-muted/30">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Organization Name</Label>
                  <Input value={newOrgName} onChange={(e) => setNewOrgName(e.target.value)} placeholder="Acme Corp" className="h-9 mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Domain</Label>
                  <Input value={newOrgDomain} onChange={(e) => setNewOrgDomain(e.target.value)} placeholder="acme.com" className="h-9 mt-1" />
                </div>
                <div className="flex items-end">
                  <Button className="h-9 w-full" disabled={!newOrgName.trim() || !newOrgDomain.trim() || createOrgMutation.isPending} onClick={() => createOrgMutation.mutate()}>
                    {createOrgMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : "Create"}
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className="divide-y divide-border">
            {(allOrgsData?.tenants || []).map((org: any) => (
              <div key={org.id} className="flex items-center gap-3 px-5 py-3 hover:bg-accent/30 transition-colors">
                <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                  <Building2 size={16} className="text-emerald-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{org.name}</p>
                  <p className="text-xs text-muted-foreground" style={{ fontFamily: mono }}>{org.domain}</p>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground" style={{ fontFamily: mono }}>
                  <span>{org._count?.users || 0} users</span>
                  <span>{org._count?.projects || 0} projects</span>
                </div>
              </div>
            ))}
            {(!allOrgsData?.tenants || allOrgsData.tenants.length === 0) && (
              <p className="text-xs text-muted-foreground text-center py-6">No organizations yet</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

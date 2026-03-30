import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/utils/api";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { FileCheck2, Send, Clock, AlertTriangle } from "lucide-react";

interface Organization {
  id: string;
  name: string;
}

interface EditProject {
  id: string;
  name: string;
  description?: string;
  status: string;
  value?: number;
  progress: number;
  startDate?: string;
  expectedEndDate?: string;
  notes?: string;
  proposal?: string;
  proposalDueDate?: string;
  priority?: string;
  owner?: { id: string };
  organization?: { id: string };
}

interface AddProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizations: Organization[];
  editProject?: EditProject | null;
}

const emptyForm = {
  name: "",
  description: "",
  status: "LEAD",
  value: "",
  progress: "0",
  ownerId: "",
  organizationId: "",
  startDate: "",
  expectedEndDate: "",
  notes: "",
  proposal: "",
  proposalDueDate: "",
  priority: "MEDIUM",
};

function toDateInput(d?: string) {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

const statusOptions = [
  { value: "LEAD", label: "Lead", color: "text-indigo-500", desc: "New opportunity in pipeline" },
  { value: "PENDING", label: "Pending", color: "text-amber-500", desc: "Awaiting proposal/decision" },
  { value: "ONGOING", label: "Ongoing", color: "text-blue-500", desc: "Active project" },
  { value: "WON", label: "Won", color: "text-emerald-500", desc: "Deal closed" },
  { value: "LOST", label: "Lost", color: "text-red-500", desc: "Did not proceed" },
];

const priorityOptions = [
  { value: "LOW", label: "Low", color: "text-slate-400" },
  { value: "MEDIUM", label: "Medium", color: "text-blue-500" },
  { value: "HIGH", label: "High", color: "text-amber-500" },
  { value: "URGENT", label: "Urgent", color: "text-red-500" },
];

export function AddProjectDialog({ open, onOpenChange, organizations, editProject }: AddProjectDialogProps) {
  const queryClient = useQueryClient();
  const isEditing = !!editProject;
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (editProject) {
      setForm({
        name: editProject.name || "",
        description: editProject.description || "",
        status: editProject.status || "LEAD",
        value: editProject.value != null ? String(editProject.value) : "",
        progress: String(editProject.progress ?? 0),
        ownerId: editProject.owner?.id || "",
        organizationId: editProject.organization?.id || "",
        startDate: toDateInput(editProject.startDate),
        expectedEndDate: toDateInput(editProject.expectedEndDate),
        notes: editProject.notes || "",
        proposal: editProject.proposal || "",
        proposalDueDate: toDateInput(editProject.proposalDueDate),
        priority: editProject.priority || "MEDIUM",
      });
    } else {
      setForm(emptyForm);
    }
  }, [editProject, open]);

  const { data: usersData } = useQuery<{ allUsers: { id: string; fullName: string }[] }>({
    queryKey: ["all-users"],
    queryFn: async () => (await api.get("/users/list-all")).data,
    enabled: open,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof form) => (await api.post("/business/projects", data)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["business-projects"] });
      queryClient.invalidateQueries({ queryKey: ["business-stats"] });
      toast("Success", { description: "Project created" });
      setForm(emptyForm);
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast("Error", { description: err?.response?.data?.error || "Something went wrong" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: typeof form) => (await api.patch(`/business/projects/${editProject!.id}`, data)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["business-projects"] });
      queryClient.invalidateQueries({ queryKey: ["business-stats"] });
      toast("Updated", { description: "Project updated" });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast("Error", { description: err?.response?.data?.error || "Something went wrong" });
    },
  });

  const users = usersData?.allUsers || [];
  const mutation = isEditing ? updateMutation : createMutation;
  const isPending = mutation.isPending;
  const set = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">{isEditing ? "Edit Project" : "New Project"}</DialogTitle>
          <DialogDescription>
            {isEditing ? "Update the project details." : "Add a new project to your pipeline."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 mt-1">
          {/* ── Basic Info ── */}
          <div className="space-y-3">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Basic Information</p>
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs font-medium">Project Name <span className="text-red-500">*</span></Label>
                <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Cisco Cloud Migration" className="h-9" />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-medium">Description</Label>
                <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Brief scope and goals..." rows={2} className="resize-none" />
              </div>
            </div>
          </div>

          <Separator />

          {/* ── Status, Priority & Value ── */}
          <div className="space-y-3">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Status & Value</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs font-medium">Status</Label>
                <Select value={form.status} onValueChange={(v) => set("status", v)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        <span className={s.color}>&#9679;</span> {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-medium">Priority</Label>
                <Select value={form.priority} onValueChange={(v) => set("priority", v)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {priorityOptions.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        <span className={p.color}>&#9679;</span> {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-medium">Deal Value (R)</Label>
                <Input type="number" value={form.value} onChange={(e) => set("value", e.target.value)} placeholder="0.00" className="h-9" />
              </div>
            </div>
          </div>

          <Separator />

          {/* ── Proposal ── */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <FileCheck2 size={14} className="text-indigo-500" />
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Proposal Details</p>
            </div>
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs font-medium">Proposal Summary</Label>
                <Textarea
                  value={form.proposal}
                  onChange={(e) => set("proposal", e.target.value)}
                  placeholder="e.g. New proposal & costing – awaiting sign-off..."
                  rows={2}
                  className="resize-none"
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-medium">Proposal Due Date</Label>
                <Input type="date" value={form.proposalDueDate} onChange={(e) => set("proposalDueDate", e.target.value)} className="h-9" />
              </div>
            </div>
          </div>

          <Separator />

          {/* ── People & Org ── */}
          <div className="space-y-3">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">People & Organization</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs font-medium">Project Owner</Label>
                <Select value={form.ownerId} onValueChange={(v) => set("ownerId", v)}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select owner" /></SelectTrigger>
                  <SelectContent>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.fullName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-medium">Client Organization</Label>
                <Select value={form.organizationId} onValueChange={(v) => set("organizationId", v)}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select org" /></SelectTrigger>
                  <SelectContent>
                    {organizations.map((o) => (
                      <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <Separator />

          {/* ── Timeline ── */}
          <div className="space-y-3">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Timeline</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs font-medium">Start Date</Label>
                <Input type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} className="h-9" />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs font-medium">Expected End Date</Label>
                <Input type="date" value={form.expectedEndDate} onChange={(e) => set("expectedEndDate", e.target.value)} className="h-9" />
              </div>
            </div>
          </div>

          <Separator />

          {/* ── Progress ── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Progress</p>
              <span className="text-sm font-bold tabular-nums">{form.progress}%</span>
            </div>
            <div>
              <input
                type="range" min="0" max="100" step="5"
                value={form.progress} onChange={(e) => set("progress", e.target.value)}
                className="w-full h-2 rounded-full appearance-none cursor-pointer accent-indigo-500 bg-muted"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1 px-0.5">
                <span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
              </div>
            </div>
          </div>

          <Separator />

          {/* ── Next Steps / Notes ── */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Next Steps & Notes</p>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs font-medium">Next Steps</Label>
              <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="e.g. Send proposal by Friday&#10;Schedule kickoff meeting with team&#10;Follow up with client next week" rows={4} className="resize-none" />
              <p className="text-[10px] text-muted-foreground">One action per line. These appear on the Gantt chart.</p>
            </div>
          </div>

          {/* ── Actions ── */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="px-5">Cancel</Button>
            <Button
              onClick={() => mutation.mutate(form)}
              disabled={!form.name || isPending}
              className="px-5 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white"
            >
              {isPending ? (isEditing ? "Saving..." : "Creating...") : isEditing ? "Save Changes" : "Create Project"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

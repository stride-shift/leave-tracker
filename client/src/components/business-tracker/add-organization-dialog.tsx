import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/utils/api";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Building2 } from "lucide-react";

interface AddOrganizationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const emptyForm = { name: "", industry: "", website: "", notes: "" };

export function AddOrganizationDialog({ open, onOpenChange }: AddOrganizationDialogProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyForm);

  const mutation = useMutation({
    mutationFn: async (data: typeof form) => (await api.post("/business/organizations", data)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["business-organizations"] });
      toast("Success", { description: "Organization created" });
      setForm(emptyForm);
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast("Error", { description: err?.response?.data?.error || "Something went wrong" });
    },
  });

  const set = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-md shadow-indigo-500/20">
              <Building2 size={20} className="text-white" />
            </div>
            <div>
              <DialogTitle className="text-lg">Add Organization</DialogTitle>
              <DialogDescription className="text-xs">Add a client company to link to your projects.</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Separator />

        <div className="space-y-4">
          <div className="grid gap-1.5">
            <Label className="text-xs font-medium">Organization Name <span className="text-red-500">*</span></Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Cisco Systems" className="h-9" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs font-medium">Industry</Label>
              <Input value={form.industry} onChange={(e) => set("industry", e.target.value)} placeholder="e.g. Technology" className="h-9" />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs font-medium">Website</Label>
              <Input value={form.website} onChange={(e) => set("website", e.target.value)} placeholder="https://..." className="h-9" />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label className="text-xs font-medium">Notes</Label>
            <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Key contacts, relationship details..." rows={2} className="resize-none" />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="px-5">Cancel</Button>
            <Button
              onClick={() => mutation.mutate(form)}
              disabled={!form.name || mutation.isPending}
              className="px-5 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white"
            >
              {mutation.isPending ? "Creating..." : "Add Organization"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

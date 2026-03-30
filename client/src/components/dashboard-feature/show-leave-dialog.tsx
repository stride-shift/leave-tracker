import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "../ui/label";

import SelectLeaveType from "./select-leave-type";
import { Textarea } from "@/components/ui/textarea";
import type { CalendarEvent, startEndDateType } from "type";
import moment from "moment";
import { Input } from "@/components/ui/input";
import { useEffect, useState, useRef } from "react";
import { Button } from "../ui/button";
import { api } from "@/utils/api";
import { useUserData } from "@/hooks/user-data";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Separator } from "../ui/separator";
import { Eraser } from "lucide-react";

interface ShowAlertDialTypes {
  open: boolean;
  setOpen: () => void;
  events: (event: CalendarEvent) => void;
  startEndDate: startEndDateType;
}

function ShowLeaveDialog({
  open,
  setOpen,
  startEndDate,
  events,
}: ShowAlertDialTypes) {
  const [details, setDetails] = useState({ reason: "", leaveType: "", contactPhone: "", contactEmail: "" });
  const storedData = useUserData();
  const userData = storedData?.data;
  const [leaveTypes, setLeaveTypes] = useState<number | null>(null);
  const [editedStart, setEditedStart] = useState<string>("");
  const [editedEnd, setEditedEnd] = useState<string>("");
  const [editedDays, setEditedDays] = useState<number | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sigFileRef = useRef<HTMLInputElement>(null);

  // Sync dates when dialog opens
  useEffect(() => {
    if (open && startEndDate) {
      setEditedStart(moment(startEndDate.start).format("YYYY-MM-DD"));
      const endDate = new Date(startEndDate.end);
      endDate.setDate(endDate.getDate() - 1);
      setEditedEnd(moment(endDate).format("YYYY-MM-DD"));
      setEditedDays(startEndDate.totalDay ?? 1);
      setDetails((prev) => ({ ...prev, contactEmail: userData?.email || "" }));
    }
  }, [open, startEndDate, userData]);

  // Recalculate days when dates change
  useEffect(() => {
    if (editedStart && editedEnd) {
      const s = new Date(editedStart);
      const e = new Date(editedEnd);
      const diff = Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      if (diff > 0) setEditedDays(diff);
    }
  }, [editedStart, editedEnd]);

  const totalDays = editedDays ?? startEndDate.totalDay ?? 0;

  const {
    data: userLeaves,
  } = useQuery({
    queryKey: ["userLeaveTypes", userData?.id],
    queryFn: listUserLeaveType,
    enabled: !!userData?.id,
    retry: 1,
  });

  const [isEligible, setIsEligible] = useState<any>(null);

  function handleSubmit() {
    const payload = {
      ...details,
      id: Date.now().toString(),
      start: new Date(editedStart),
      end: new Date(new Date(editedEnd).setDate(new Date(editedEnd).getDate() + 1)),
      totalDay: totalDays.toString(),
      signature: signature || undefined,
    };
    events(payload);
    setOpen();
    resetForm();
  }

  function resetForm() {
    setDetails({ leaveType: "", reason: "", contactPhone: "", contactEmail: "" });
    setIsEligible(null);
    setEditedDays(null);
    setSignature(null);
    clearCanvas();
  }

  async function listUserLeaveType() {
    const res = await api.get(
      `/dashboard/list-user-leave-types/${userData?.id}`
    );
    setLeaveTypes(res.data?.totalBalance?._sum?.leaveBalance);
    return res.data;
  }

  function closeDialog() {
    setOpen();
    resetForm();
  }

  // Signature canvas
  function clearCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    setSignature(null);
  }

  function startDraw(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = getComputedStyle(canvas).getPropertyValue("color") || "#000";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const rect = canvas.getBoundingClientRect();
    const pos = "touches" in e ? { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top } : { x: e.clientX - rect.left, y: e.clientY - rect.top };
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  }

  function draw(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const pos = "touches" in e ? { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top } : { x: e.clientX - rect.left, y: e.clientY - rect.top };
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  }

  function stopDraw() {
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      setSignature(canvas.toDataURL("image/png"));
    }
  }

  function handleSigUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setSignature(dataUrl);
      // Draw on canvas too
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          const img = new Image();
          img.onload = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
            const x = (canvas.width - img.width * scale) / 2;
            const y = (canvas.height - img.height * scale) / 2;
            ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
          };
          img.src = dataUrl;
        }
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  const totalBalance = userLeaves?.totalBalance?._sum?.leaveBalance ?? 0;
  const remainingBalance = totalBalance - totalDays;

  useEffect(() => {
    if (open && (leaveTypes === null || leaveTypes <= 0)) {
      toast("Alert", {
        description: (
          <div>
            You do not have sufficient leave balance to apply for leave. Please
            contact the admin
          </div>
        ),
        style: { backgroundColor: "white", color: "black" },
        richColors: true,
        duration: 5000,
      });
    }
  }, [open, leaveTypes]);

  return (
    <Dialog open={open} onOpenChange={closeDialog}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Leave Application</DialogTitle>
          <DialogDescription>Complete the form below to submit your leave request.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-y-5 mt-2">

          {/* Employee Info */}
          <div className="space-y-3">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Employee Information</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-y-1.5">
                <Label className="text-xs">Full Name</Label>
                <Input disabled value={userData?.name || ""} className="h-9 text-sm disabled:opacity-70" />
              </div>
              <div className="flex flex-col gap-y-1.5">
                <Label className="text-xs">Email</Label>
                <Input disabled value={userData?.email || ""} className="h-9 text-sm disabled:opacity-70" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-y-1.5">
                <Label className="text-xs">Contact Phone</Label>
                <Input
                  type="tel"
                  placeholder="e.g. 082 123 4567"
                  value={details.contactPhone}
                  onChange={(e) => setDetails((prev) => ({ ...prev, contactPhone: e.target.value }))}
                  className="h-9 text-sm"
                />
              </div>
              <div className="flex flex-col gap-y-1.5">
                <Label className="text-xs">Contact Email (while away)</Label>
                <Input
                  type="email"
                  placeholder="alternate@email.com"
                  value={details.contactEmail}
                  onChange={(e) => setDetails((prev) => ({ ...prev, contactEmail: e.target.value }))}
                  className="h-9 text-sm"
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Dates */}
          <div className="space-y-3">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Leave Period</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="flex flex-col gap-y-1.5">
                <Label className="text-xs">Start Date</Label>
                <Input
                  type="date"
                  value={editedStart}
                  onChange={(e) => setEditedStart(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
              <div className="flex flex-col gap-y-1.5">
                <Label className="text-xs">End Date</Label>
                <Input
                  type="date"
                  value={editedEnd}
                  min={editedStart}
                  onChange={(e) => setEditedEnd(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
              <div className="flex flex-col gap-y-1.5">
                <Label className="text-xs">Total Days</Label>
                <Input
                  type="number"
                  min={0.5}
                  step={0.5}
                  value={totalDays.toString()}
                  onChange={(e) => setEditedDays(Math.max(0.5, Number(e.target.value)))}
                  className="h-9 text-sm"
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Leave Type & Reason */}
          <div className="space-y-3">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Leave Details</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-y-1.5">
                <Label className="text-xs">Leave Type (Current Balance)</Label>
                <SelectLeaveType
                  setIsEligible={(e: number) => setIsEligible(e)}
                  data={userLeaves?.userLeaveTypes}
                  type={(value: string) =>
                    setDetails((prev) => ({ ...prev, leaveType: value }))
                  }
                />
              </div>
              <div className="flex flex-col gap-y-1.5">
                <Label className="text-xs">Reason</Label>
                <Textarea
                  maxLength={150}
                  onChange={(e) =>
                    setDetails((prev) => ({ ...prev, reason: e.target.value }))
                  }
                  placeholder="Enter reason for leave..."
                  className="h-[38px] min-h-[38px] text-sm resize-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-y-1.5">
                <Label className="text-xs text-amber-600 dark:text-amber-400">Total Leave Balance</Label>
                <Input
                  className="h-9 text-sm font-semibold disabled:opacity-70"
                  disabled
                  value={totalBalance.toString()}
                />
              </div>
              <div className="flex flex-col gap-y-1.5">
                <Label className="text-xs">Remaining Balance</Label>
                <Input
                  className={`h-9 text-sm font-semibold disabled:opacity-70 ${remainingBalance <= 0 ? "text-red-500" : ""}`}
                  disabled
                  value={remainingBalance.toFixed(2)}
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Signature */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Digital Signature</p>
              <div className="flex items-center gap-2">
                <button onClick={() => sigFileRef.current?.click()} className="text-[10px] text-muted-foreground hover:text-foreground transition-colors">Upload image</button>
                <input ref={sigFileRef} type="file" accept="image/*" className="hidden" onChange={handleSigUpload} />
                <button onClick={clearCanvas} className="text-[10px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"><Eraser size={10} /> Clear</button>
              </div>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 overflow-hidden">
              <canvas
                ref={canvasRef}
                width={440}
                height={100}
                className="w-full cursor-crosshair text-foreground"
                style={{ touchAction: "none" }}
                onMouseDown={startDraw}
                onMouseMove={draw}
                onMouseUp={stopDraw}
                onMouseLeave={stopDraw}
                onTouchStart={startDraw}
                onTouchMove={draw}
                onTouchEnd={stopDraw}
              />
            </div>
            <p className="text-[10px] text-muted-foreground">Draw your signature above or upload an image</p>
          </div>

          {/* Validation */}
          {isEligible && (
            <div>
              <p className="text-red-500 text-xs text-right">
                {remainingBalance <= 0 || totalDays > isEligible
                  ? "Don't have sufficient balance"
                  : ""}
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between gap-x-2 pt-1">
            <p className="text-[10px] text-muted-foreground">
              By submitting, you confirm the details above are correct.
            </p>
            <div className="flex items-center gap-2">
              <Button onClick={closeDialog} variant="outline" size="sm">
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={
                  !details.leaveType.trim() ||
                  !details.reason.trim() ||
                  !editedStart ||
                  !editedEnd ||
                  remainingBalance <= 0 ||
                  totalDays > isEligible
                }
                onClick={handleSubmit}
              >
                Submit Request
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ShowLeaveDialog;

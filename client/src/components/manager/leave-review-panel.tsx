import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/utils/api";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { useUserData } from "@/hooks/user-data";
import { CheckCircle2, XCircle, User, Calendar, Clock, FileText, Eraser, Loader2, Download } from "lucide-react";

const mono = "'Geist Mono', 'JetBrains Mono', monospace";

interface Props {
  requestId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAction?: () => void;
}

const STATUS_BADGE: Record<string, string> = {
  PENDING: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  APPROVED: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  REJECTED: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
  CANCELLED: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20",
};

function fmtDate(d?: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" });
}

function daysBetween(a: string, b: string) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

export function LeaveReviewPanel({ requestId, open, onOpenChange, onAction }: Props) {
  const qc = useQueryClient();
  const storedData = useUserData();
  const managerId = storedData?.data?.id;
  const [managerNote, setManagerNote] = useState("");
  const [managerSig, setManagerSig] = useState<string | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sigFileRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["leave-detail", requestId],
    queryFn: async () => (await api.get(`/dashboard/leave-request-detail/${requestId}`)).data,
    enabled: !!requestId && open,
  });

  const signMutation = useMutation({
    mutationFn: async (action: "approve" | "reject") =>
      (await api.post(`/dashboard/sign-leave-request/${requestId}`, {
        action,
        managerUserId: managerId,
        managerSignature: managerSig,
        managerNote,
      })).data,
    onSuccess: (_, action) => {
      qc.invalidateQueries({ queryKey: ["leaveRequests-manage-pending"] });
      qc.invalidateQueries({ queryKey: ["leaveRequests-manage-approved"] });
      qc.invalidateQueries({ queryKey: ["leaveRequests-manage-rejected"] });
      toast(action === "approve" ? "Leave approved and signed" : "Leave rejected");
      onOpenChange(false);
      onAction?.();
    },
    onError: () => toast.error("Action failed"),
  });

  const request = data?.request;

  // Signature canvas handlers
  function clearCanvas() {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
    setManagerSig(null);
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
    if (canvasRef.current) setManagerSig(canvasRef.current.toDataURL("image/png"));
  }

  function handleSigUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setManagerSig(ev.target?.result as string);
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          const img = new Image();
          img.onload = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); const s = Math.min(canvas.width / img.width, canvas.height / img.height); ctx.drawImage(img, (canvas.width - img.width * s) / 2, (canvas.height - img.height * s) / 2, img.width * s, img.height * s); };
          img.src = ev.target?.result as string;
        }
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  return (
    <Sheet open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setManagerNote(""); setManagerSig(null); clearCanvas(); } }}>
      <SheetContent className="w-[520px] sm:max-w-[520px] overflow-y-auto p-0">
        {isLoading ? (
          <div className="flex items-center justify-center h-full"><div className="h-5 w-5 border-2 border-emerald-500/50 border-t-emerald-400 rounded-full animate-spin" /></div>
        ) : request ? (
          <div className="flex flex-col">
            {/* Header */}
            <div className="p-5 pb-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold text-foreground">Leave Application</h2>
                <Badge variant="outline" className={`text-[10px] font-semibold border ${STATUS_BADGE[request.status]}`}>{request.status}</Badge>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <p className="text-xs text-muted-foreground">Submitted {fmtDate(request.requestedAt)}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1 ml-auto"
                  onClick={() => {
                    const url = `${import.meta.env.VITE_API_URL || "http://localhost:3000"}/dashboard/leave-request-pdf/${requestId}`;
                    window.open(url, "_blank");
                  }}
                >
                  <Download size={12} /> Download PDF
                </Button>
              </div>
            </div>

            <Separator />

            {/* Employee details */}
            <div className="p-5 space-y-3">
              <SLabel>Employee Information</SLabel>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Full Name" value={request.user.fullName} />
                <Field label="Email" value={request.user.email} />
                <Field label="Contact Phone" value={request.contactPhone || "—"} />
                <Field label="Contact Email (while away)" value={request.contactEmail || "—"} />
              </div>
            </div>

            <Separator />

            {/* Leave details */}
            <div className="p-5 space-y-3">
              <SLabel>Leave Details</SLabel>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Leave Type" value={request.leaveType.name} />
                <Field label="Start Date" value={fmtDate(request.startDate)} />
                <Field label="End Date" value={fmtDate(request.endDate)} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Total Days" value={`${daysBetween(request.startDate, request.endDate)} days`} />
                <Field label="Reason" value={request.reason || "—"} />
                <Field label="Priority" value={request.status} />
              </div>
            </div>

            <Separator />

            {/* Employee signature */}
            <div className="p-5 space-y-2">
              <SLabel>Employee Signature</SLabel>
              {request.signature ? (
                <div className="rounded-lg border border-border bg-muted/30 p-2">
                  <img src={request.signature} alt="Employee signature" className="max-h-[80px] mx-auto" />
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">No signature provided</p>
              )}
            </div>

            {/* Manager already signed */}
            {request.managerSignature && (
              <>
                <Separator />
                <div className="p-5 space-y-2">
                  <SLabel>Manager Sign-off</SLabel>
                  <div className="rounded-lg border border-border bg-muted/30 p-2">
                    <img src={request.managerSignature} alt="Manager signature" className="max-h-[80px] mx-auto" />
                  </div>
                  {request.managerNote && <p className="text-sm text-foreground/80 mt-1">{request.managerNote}</p>}
                  {request.approvedBy && <p className="text-[10px] text-muted-foreground mt-1" style={{ fontFamily: mono }}>Signed by {request.approvedBy.fullName}</p>}
                </div>
              </>
            )}

            {/* Sign-off section (only for PENDING) */}
            {request.status === "PENDING" && (
              <>
                <Separator />
                <div className="p-5 space-y-3">
                  <SLabel>Manager Sign-off</SLabel>

                  <Textarea
                    placeholder="Add a note (optional)..."
                    value={managerNote}
                    onChange={(e) => setManagerNote(e.target.value)}
                    rows={2}
                    className="resize-none text-sm"
                  />

                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider" style={{ fontFamily: mono }}>Your Signature</span>
                    <div className="flex items-center gap-2">
                      <button onClick={() => sigFileRef.current?.click()} className="text-[10px] text-muted-foreground hover:text-foreground">Upload</button>
                      <input ref={sigFileRef} type="file" accept="image/*" className="hidden" onChange={handleSigUpload} />
                      <button onClick={clearCanvas} className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1"><Eraser size={10} /> Clear</button>
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/30 overflow-hidden">
                    <canvas
                      ref={canvasRef}
                      width={440}
                      height={80}
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

                  <div className="flex items-center gap-2 pt-2">
                    <Button
                      className="flex-1 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                      disabled={signMutation.isPending}
                      onClick={() => signMutation.mutate("approve")}
                    >
                      {signMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                      Approve & Sign
                    </Button>
                    <Button
                      variant="destructive"
                      className="flex-1 gap-1.5"
                      disabled={signMutation.isPending}
                      onClick={() => signMutation.mutate("reject")}
                    >
                      {signMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                      Reject
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function SLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider" style={{ fontFamily: "'Geist Mono', monospace" }}>{children}</p>;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider block" style={{ fontFamily: "'Geist Mono', monospace" }}>{label}</span>
      <span className="text-sm text-foreground">{value}</span>
    </div>
  );
}

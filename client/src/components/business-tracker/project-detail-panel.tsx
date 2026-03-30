import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/utils/api";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Clock, Calendar, User, Building2, FileText, Link2, Plus, Send, Trash2,
  TrendingUp, Target, AlertTriangle, CheckCircle2, ExternalLink, Upload,
  FileSpreadsheet, Presentation, File, Brain, Sparkles, Loader2, Pencil, Save, X,
} from "lucide-react";

const mono = "'Geist Mono', 'JetBrains Mono', monospace";

interface Props {
  projectId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (project: any) => void;
}

const STATUS_COLORS: Record<string, string> = {
  ONGOING: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  WON: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  PENDING: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20",
  LEAD: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  LOST: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
};
const STATUS_LABELS: Record<string, string> = { ONGOING: "Live", WON: "Won", PENDING: "Pending", LEAD: "Lead", LOST: "Lost" };
const RESOURCE_ICONS: Record<string, typeof FileText> = { proposal: FileText, document: FileText, spreadsheet: FileSpreadsheet, presentation: Presentation, link: Link2, default: File };

function fmtDate(d?: string) { if (!d) return "—"; return new Date(d).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" }); }
function formatCurrency(v: number) { if (v >= 1_000_000) return `R ${(v / 1_000_000).toFixed(1)}M`; if (v >= 1_000) return `R ${(v / 1_000).toFixed(0)}K`; return `R ${v.toLocaleString()}`; }
function daysBetween(a: string, b: string) { return Math.round((new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24)); }
function timeAgo(d: string) { const m = Math.round((Date.now() - new Date(d).getTime()) / 60000); if (m < 60) return `${m}m ago`; const h = Math.round(m / 60); if (h < 24) return `${h}h ago`; const dd = Math.round(h / 24); if (dd < 30) return `${dd}d ago`; return fmtDate(d); }

type PanelTab = "overview" | "resources" | "activity" | "ai";

export function ProjectDetailPanel({ projectId, open, onOpenChange, onEdit }: Props) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<PanelTab>("overview");
  const [noteText, setNoteText] = useState("");
  const [resName, setResName] = useState("");
  const [resUrl, setResUrl] = useState("");
  const [resType, setResType] = useState("link");
  const [showAddLink, setShowAddLink] = useState(false);
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [activeAiBtn, setActiveAiBtn] = useState("");
  const [editField, setEditField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["project-detail", projectId],
    queryFn: async () => (await api.get(`/business/projects/${projectId}`)).data,
    enabled: !!projectId && open,
  });

  const invalidate = () => { qc.invalidateQueries({ queryKey: ["project-detail", projectId] }); qc.invalidateQueries({ queryKey: ["business-projects"] }); qc.invalidateQueries({ queryKey: ["business-stats"] }); };

  const addNoteMutation = useMutation({
    mutationFn: async (content: string) => (await api.post(`/business/projects/${projectId}/activities`, { content, type: "note" })).data,
    onSuccess: () => { invalidate(); setNoteText(""); toast("Note added"); },
  });
  const addResourceMutation = useMutation({
    mutationFn: async (d: { name: string; url: string; type: string }) => (await api.post(`/business/projects/${projectId}/resources`, d)).data,
    onSuccess: () => { invalidate(); setResName(""); setResUrl(""); setShowAddLink(false); toast("Resource added"); },
  });
  const deleteResourceMutation = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/business/resources/${id}`)).data,
    onSuccess: () => { invalidate(); toast("Removed"); },
  });
  const updateFieldMutation = useMutation({
    mutationFn: async (d: Record<string, unknown>) => (await api.patch(`/business/projects/${projectId}`, d)).data,
    onSuccess: () => { invalidate(); setEditField(null); toast("Updated"); },
  });
  const uploadFileMutation = useMutation({
    mutationFn: async (file: globalThis.File) => {
      const fd = new FormData(); fd.append("file", file);
      return (await api.post(`/business/projects/${projectId}/upload`, fd, { headers: { "Content-Type": "multipart/form-data" } })).data;
    },
    onSuccess: () => { invalidate(); toast("File uploaded"); },
    onError: () => { toast.error("Upload failed"); },
  });

  const runAI = async (prompt?: string) => {
    setAiLoading(true);
    try { const res = await api.post(`/business/ai/analyze-project/${projectId}`, { prompt: prompt || aiPrompt || undefined }); setAiResult(res.data.analysis); setAiPrompt(""); } catch { toast.error("Analysis failed"); }
    finally { setAiLoading(false); }
  };

  const project = data?.project;
  if (!project && !isLoading) return null;

  const daysActive = project?.createdAt ? daysBetween(project.createdAt, new Date().toISOString()) : 0;
  const daysRemaining = project?.expectedEndDate ? daysBetween(new Date().toISOString(), project.expectedEndDate) : null;
  const isOverdue = daysRemaining !== null && daysRemaining < 0;

  const startEdit = (field: string, value: string) => { setEditField(field); setEditValue(value); };
  const saveEdit = (field: string, value: any) => { updateFieldMutation.mutate({ [field]: value }); };

  const TABS: { key: PanelTab; label: string; icon: typeof FileText; count?: number }[] = [
    { key: "overview", label: "Overview", icon: Target },
    { key: "resources", label: "Files", icon: FileText, count: project?.resources?.length },
    { key: "activity", label: "Activity", icon: Clock, count: project?.activities?.length },
    { key: "ai", label: "AI", icon: Brain },
  ];

  return (
    <Sheet open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setTab("overview"); setAiResult(null); setEditField(null); setActiveAiBtn(""); } }}>
      <SheetContent className="w-[560px] sm:max-w-[560px] overflow-y-auto p-0 flex flex-col">
        {isLoading ? (
          <div className="flex items-center justify-center flex-1"><div className="h-5 w-5 border-2 border-emerald-500/50 border-t-emerald-400 rounded-full animate-spin" /></div>
        ) : project ? (
          <>
            {/* Header */}
            <div className="p-5 pb-3 shrink-0">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-bold text-foreground leading-tight">{project.name}</h2>
                  {project.description && <p className="text-sm text-muted-foreground mt-0.5">{project.description}</p>}
                </div>
                <Badge variant="outline" className={`shrink-0 text-[10px] font-semibold border ${STATUS_COLORS[project.status]}`}>{STATUS_LABELS[project.status]}</Badge>
              </div>
              <div className="flex items-center gap-3 mt-3 flex-wrap text-sm text-muted-foreground">
                {project.owner && <span className="flex items-center gap-1"><User size={12} /> {project.owner.fullName}</span>}
                {project.organization && <span className="flex items-center gap-1"><Building2 size={12} /> {project.organization.name}</span>}
                {project.value ? <span className="flex items-center gap-1 font-semibold text-foreground"><TrendingUp size={12} className="text-emerald-500" /> {formatCurrency(project.value)}</span> : null}
              </div>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-0.5 px-5 shrink-0 border-b border-border">
              {TABS.map((t) => { const Icon = t.icon; const active = tab === t.key; return (
                <button key={t.key} onClick={() => setTab(t.key)} className={`flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium border-b-2 transition-colors ${active ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`} style={{ fontFamily: mono }}>
                  <Icon size={12} /> {t.label} {t.count ? <span className="text-[9px] bg-muted px-1 rounded">{t.count}</span> : null}
                </button>
              ); })}
            </div>

            <div className="flex-1 overflow-y-auto">

              {/* ═══ OVERVIEW ═══ */}
              {tab === "overview" && (
                <div>
                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-px bg-border">
                    <StatCell label="Days active" value={`${daysActive}d`} icon={<Clock size={12} className="text-muted-foreground" />} />
                    <StatCell label="Progress" value={`${project.progress}%`} icon={<Target size={12} className="text-blue-500" />} />
                    <StatCell label={isOverdue ? "Overdue" : "Remaining"} value={daysRemaining !== null ? `${Math.abs(daysRemaining)}d` : "—"} icon={isOverdue ? <AlertTriangle size={12} className="text-red-500" /> : <Calendar size={12} className="text-emerald-500" />} className={isOverdue ? "text-red-500" : ""} />
                  </div>

                  <div className="p-5 space-y-4">
                    {/* Editable fields */}
                    <EditableField label="Timeline" field="startDate" value={`${fmtDate(project.startDate)} → ${fmtDate(project.expectedEndDate)}`} editField={editField} editValue={editValue} onStart={() => startEdit("dates", "")} onCancel={() => setEditField(null)} onSave={() => {}} customEdit={
                      <div className="grid grid-cols-2 gap-2">
                        <Input type="date" defaultValue={project.startDate?.slice(0, 10) || ""} onChange={(e) => saveEdit("startDate", e.target.value)} className="h-8 text-xs" />
                        <Input type="date" defaultValue={project.expectedEndDate?.slice(0, 10) || ""} onChange={(e) => saveEdit("expectedEndDate", e.target.value)} className="h-8 text-xs" />
                      </div>
                    } />

                    <EditableField label="Priority" field="priority" value={project.priority || "MEDIUM"} editField={editField} editValue={editValue} onStart={() => startEdit("priority", project.priority || "MEDIUM")} onCancel={() => setEditField(null)} onSave={() => {}} customEdit={
                      <select defaultValue={project.priority || "MEDIUM"} onChange={(e) => { saveEdit("priority", e.target.value); }} className="h-8 rounded-md border border-border bg-background px-2 text-xs w-full">
                        <option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="URGENT">Urgent</option>
                      </select>
                    } />

                    <EditableField label="Progress" field="progress" value={`${project.progress}%`} editField={editField} editValue={editValue} onStart={() => startEdit("progress", String(project.progress))} onCancel={() => setEditField(null)} onSave={() => {}} customEdit={
                      <div className="flex items-center gap-2">
                        <input type="range" min="0" max="100" step="5" defaultValue={project.progress} onChange={(e) => saveEdit("progress", e.target.value)} className="flex-1 h-2 rounded-full appearance-none cursor-pointer accent-emerald-500 bg-muted" />
                        <span className="text-xs font-semibold w-8 text-right" style={{ fontFamily: mono }}>{editValue || project.progress}%</span>
                      </div>
                    } />

                    <EditableField label="Value (R)" field="value" value={project.value ? formatCurrency(project.value) : "—"} editField={editField} editValue={editValue} onStart={() => startEdit("value", String(project.value || ""))} onCancel={() => setEditField(null)} onSave={() => saveEdit("value", editValue)} customEdit={
                      <Input type="number" value={editValue} onChange={(e) => setEditValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveEdit("value", editValue)} className="h-8 text-xs" placeholder="0.00" autoFocus />
                    } />

                    {/* Proposal */}
                    <div>
                      <SLabel>Proposal</SLabel>
                      {editField === "proposal" ? (
                        <div className="space-y-1.5 mt-1">
                          <Textarea value={editValue} onChange={(e) => setEditValue(e.target.value)} rows={3} className="text-sm resize-none" autoFocus />
                          <div className="flex gap-1.5">
                            <Button size="sm" className="h-7 text-xs" onClick={() => saveEdit("proposal", editValue)}><Save size={11} className="mr-1" /> Save</Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditField(null)}><X size={11} /></Button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-foreground/80 mt-1 whitespace-pre-line cursor-pointer hover:bg-accent/30 rounded px-2 py-1 -mx-2 transition-colors" onClick={() => startEdit("proposal", project.proposal || "")}>{project.proposal || <span className="text-muted-foreground italic">Click to add proposal...</span>}</p>
                      )}
                    </div>

                    {/* Next Steps */}
                    <div>
                      <SLabel>Next Steps</SLabel>
                      {editField === "notes" ? (
                        <div className="space-y-1.5 mt-1">
                          <Textarea value={editValue} onChange={(e) => setEditValue(e.target.value)} rows={4} className="text-sm resize-none" placeholder="One action per line..." autoFocus />
                          <div className="flex gap-1.5">
                            <Button size="sm" className="h-7 text-xs" onClick={() => saveEdit("notes", editValue)}><Save size={11} className="mr-1" /> Save</Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditField(null)}><X size={11} /></Button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-foreground/80 mt-1 whitespace-pre-line cursor-pointer hover:bg-accent/30 rounded px-2 py-1 -mx-2 transition-colors" onClick={() => startEdit("notes", project.notes || "")}>{project.notes || <span className="text-muted-foreground italic">Click to add next steps...</span>}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ═══ RESOURCES ═══ */}
              {tab === "resources" && (
                <div className="p-5 space-y-4">
                  {/* Upload area */}
                  <div
                    className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-muted-foreground/30 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("border-emerald-500/50"); }}
                    onDragLeave={(e) => { e.currentTarget.classList.remove("border-emerald-500/50"); }}
                    onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove("border-emerald-500/50"); const f = e.dataTransfer.files[0]; if (f) uploadFileMutation.mutate(f); }}
                  >
                    <Upload size={20} className="mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground font-medium">Drop files here or click to upload</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-1" style={{ fontFamily: mono }}>PDF, DOCX, XLSX, CSV, PPTX, HTML — up to 20MB</p>
                    <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.html,.htm,.txt" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFileMutation.mutate(f); e.target.value = ""; }} />
                  </div>
                  {uploadFileMutation.isPending && <p className="text-xs text-muted-foreground text-center" style={{ fontFamily: mono }}>Uploading...</p>}

                  {/* Add link */}
                  <div>
                    <button onClick={() => setShowAddLink(!showAddLink)} className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors" style={{ fontFamily: mono }}><Link2 size={12} /> Add link</button>
                    {showAddLink && (
                      <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2 mt-2">
                        <Input placeholder="Name" value={resName} onChange={(e) => setResName(e.target.value)} className="h-8 text-xs" />
                        <Input placeholder="https://..." value={resUrl} onChange={(e) => setResUrl(e.target.value)} className="h-8 text-xs" />
                        <div className="flex gap-2">
                          <select value={resType} onChange={(e) => setResType(e.target.value)} className="h-8 rounded-md border border-border bg-background px-2 text-xs flex-1"><option value="link">Link</option><option value="proposal">Proposal</option><option value="document">Document</option><option value="spreadsheet">Spreadsheet</option><option value="presentation">Presentation</option></select>
                          <Button size="sm" className="h-8 text-xs" disabled={!resName.trim() || !resUrl.trim()} onClick={() => addResourceMutation.mutate({ name: resName, url: resUrl, type: resType })}>Add</Button>
                        </div>
                      </div>
                    )}
                  </div>

                  <Separator />

                  {/* File list */}
                  {project.resources?.length > 0 ? (
                    <div className="space-y-0.5">
                      {project.resources.map((r: any) => {
                        const Icon = RESOURCE_ICONS[r.type] || RESOURCE_ICONS.default;
                        const isUpload = r.url.startsWith("/uploads/");
                        const href = isUpload ? `${import.meta.env.VITE_API_URL || "http://localhost:3000"}${r.url}` : r.url;
                        return (
                          <div key={r.id} className="flex items-center gap-2.5 group rounded-md px-2.5 py-2 hover:bg-accent/50 transition-colors">
                            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0"><Icon size={14} className="text-muted-foreground" /></div>
                            <div className="flex-1 min-w-0">
                              <a href={href} target="_blank" rel="noopener noreferrer" className="text-sm text-foreground hover:underline truncate block">{r.name}</a>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[10px] text-muted-foreground" style={{ fontFamily: mono }}>{r.type}</span>
                                {r.uploadedBy && <span className="text-[10px] text-muted-foreground/60" style={{ fontFamily: mono }}>{r.uploadedBy.fullName}</span>}
                                <span className="text-[10px] text-muted-foreground/40" style={{ fontFamily: mono }}>{timeAgo(r.createdAt)}</span>
                              </div>
                            </div>
                            <ExternalLink size={12} className="text-muted-foreground/30 group-hover:text-muted-foreground shrink-0 transition-colors" />
                            <button onClick={() => deleteResourceMutation.mutate(r.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500 transition-all p-0.5 shrink-0"><Trash2 size={12} /></button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground/50 text-center py-4">No files or links yet</p>
                  )}
                </div>
              )}

              {/* ═══ ACTIVITY ═══ */}
              {tab === "activity" && (
                <div className="p-5 space-y-4">
                  <div className="flex items-start gap-2">
                    <Textarea placeholder="Add a note or update..." value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={2} className="resize-none text-sm flex-1" />
                    <Button size="icon" className="h-9 w-9 shrink-0" disabled={!noteText.trim() || addNoteMutation.isPending} onClick={() => addNoteMutation.mutate(noteText)}>
                      {addNoteMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    </Button>
                  </div>

                  {project.activities?.length > 0 ? (
                    <div className="space-y-0">
                      {project.activities.map((a: any) => (
                        <div key={a.id} className="flex items-start gap-2.5 py-2.5 border-t border-border/50 first:border-0">
                          <div className="mt-0.5 w-6 h-6 rounded-full bg-muted flex items-center justify-center shrink-0">
                            <FileText size={11} className="text-muted-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-foreground/90 whitespace-pre-line">{a.content}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[10px] text-muted-foreground" style={{ fontFamily: mono }}>{a.author?.fullName || "System"}</span>
                              <span className="text-[10px] text-muted-foreground/40" style={{ fontFamily: mono }}>{timeAgo(a.createdAt)}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground/50 text-center py-8">No activity yet — add a note above</p>
                  )}
                </div>
              )}

              {/* ═══ AI ANALYSIS ═══ */}
              {tab === "ai" && (
                <div className="p-5 space-y-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    {[
                      { l: "Full Analysis", p: "" },
                      { l: "Jobs To Be Done", p: "List the critical jobs to be done for this project. Be specific with tasks, owners, and suggested deadlines. Prioritize by impact." },
                      { l: "Risk Check", p: "What are the risks for this project? Timeline risks, blockers, resource gaps, dependencies. Suggest mitigations." },
                      { l: "Success Plan", p: "Define success metrics and a plan to achieve them. What does a successful outcome look like?" },
                    ].map((q) => {
                      const active = activeAiBtn === q.l;
                      return (
                        <button key={q.l} onClick={() => { setActiveAiBtn(q.l); runAI(q.p); }} disabled={aiLoading} className={`h-7 px-2.5 rounded-md flex items-center gap-1.5 text-[11px] border transition-colors disabled:opacity-50 ${active ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20 font-semibold" : "bg-muted/50 text-muted-foreground border-border hover:text-foreground"}`} style={{ fontFamily: mono }}>
                          {q.l === "Full Analysis" && <Sparkles size={11} />} {q.l}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-2">
                    <input value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !aiLoading && runAI()} placeholder="Ask about this project..." className="flex-1 h-8 pl-3 pr-10 rounded-md bg-muted/50 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/30 text-xs" style={{ fontFamily: mono }} />
                    <Button size="icon" className="h-8 w-8 shrink-0 bg-purple-500/10 text-purple-500 hover:bg-purple-500/20 border-0" disabled={aiLoading} onClick={() => runAI()}>
                      {aiLoading ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                    </Button>
                  </div>

                  {aiLoading && !aiResult && (
                    <div className="rounded-lg p-8 text-center border border-border bg-card">
                      <Loader2 size={20} className="animate-spin mx-auto mb-2 text-purple-500" />
                      <p className="text-xs text-muted-foreground" style={{ fontFamily: mono }}>Analyzing {project.name}...</p>
                    </div>
                  )}

                  {aiResult && (
                    <div className="rounded-lg overflow-hidden border border-purple-500/15 bg-purple-500/[0.02] dark:bg-purple-500/[0.03]">
                      <div className="px-4 py-2 border-b border-purple-500/10 flex items-center gap-2">
                        <Brain size={13} className="text-purple-500" />
                        <span className="text-[10px] text-purple-600 dark:text-purple-400 uppercase tracking-wider font-semibold" style={{ fontFamily: mono }}>Project Analysis</span>
                      </div>
                      <div className="p-4 text-sm leading-relaxed text-foreground/90" dangerouslySetInnerHTML={{ __html: mdToHtml(aiResult) }} />
                    </div>
                  )}

                  {!aiResult && !aiLoading && (
                    <div className="rounded-lg p-10 text-center border border-border bg-card">
                      <Brain size={24} className="mx-auto mb-2 text-muted-foreground/30" />
                      <p className="text-sm text-muted-foreground">AI analysis for <strong>{project.name}</strong></p>
                      <p className="text-[10px] text-muted-foreground/50 mt-1" style={{ fontFamily: mono }}>Click a prompt to get started</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function SLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider" style={{ fontFamily: "'Geist Mono', monospace" }}>{children}</p>;
}

function StatCell({ label, value, icon, className }: { label: string; value: string; icon: React.ReactNode; className?: string }) {
  return (
    <div className="bg-card py-3 px-3 text-center">
      <div className="flex items-center justify-center gap-1 mb-0.5">{icon}</div>
      <div className={`text-base font-bold ${className || "text-foreground"}`} style={{ fontFamily: "'Geist Mono', monospace" }}>{value}</div>
      <div className="text-[9px] text-muted-foreground uppercase tracking-wider" style={{ fontFamily: "'Geist Mono', monospace" }}>{label}</div>
    </div>
  );
}

function EditableField({ label, field, value, editField, editValue, onStart, onCancel, onSave, customEdit }: {
  label: string; field: string; value: string; editField: string | null; editValue: string;
  onStart: () => void; onCancel: () => void; onSave: () => void; customEdit?: React.ReactNode;
}) {
  const isEditing = editField === field || editField === "dates" && field === "startDate";
  return (
    <div>
      <div className="flex items-center justify-between">
        <SLabel>{label}</SLabel>
        {!isEditing && <button onClick={onStart} className="text-muted-foreground/40 hover:text-muted-foreground transition-colors"><Pencil size={11} /></button>}
      </div>
      {isEditing ? (
        <div className="mt-1">{customEdit}</div>
      ) : (
        <p className="text-sm text-foreground mt-0.5">{value}</p>
      )}
    </div>
  );
}

function mdToHtml(md: string): string {
  return md.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/^### (.+)$/gm, '<h3 class="text-sm font-bold text-foreground mt-4 mb-1.5">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-[15px] font-bold text-foreground mt-5 mb-2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-base font-bold text-foreground mt-5 mb-2">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-foreground">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<div class="pl-3.5 relative my-0.5"><span class="absolute left-0.5 text-muted-foreground">&bull;</span>$1</div>')
    .replace(/^\d+\. (.+)$/gm, '<div class="pl-3.5 my-0.5">$1</div>')
    .replace(/\n\n/g, '<div class="h-2"></div>').replace(/\n/g, "<br>");
}

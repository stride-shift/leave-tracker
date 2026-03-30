import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/utils/api";
import {
  Target, Plus, Building2, Search, Download, FileSpreadsheet, FileText, Upload,
  MoreHorizontal, Pencil, Eye, EyeOff, TrendingUp, TrendingDown,
  BarChart3, Brain, Sparkles, Send, Loader2, DollarSign, Users, Columns3,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, GripVertical, Trash2,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { AddProjectDialog } from "./add-project-dialog";
import { AddOrganizationDialog } from "./add-organization-dialog";
import { ImportProjectsDialog } from "./import-projects-dialog";
import { ProjectDetailPanel } from "./project-detail-panel";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip as ReTooltip, ResponsiveContainer, LineChart, Line,
} from "recharts";

const mono = "'Geist Mono', 'JetBrains Mono', 'SF Mono', monospace";

const STATUS_CONFIG = {
  ONGOING: { label: "Live",    dot: "bg-emerald-400",  color: "#34d399", barBg: "bg-emerald-500/10 dark:bg-emerald-400/10", barText: "text-emerald-700 dark:text-emerald-400", barBorder: "border-emerald-500/20 dark:border-emerald-400/20" },
  WON:     { label: "Won",     dot: "bg-blue-400",     color: "#60a5fa", barBg: "bg-blue-500/10 dark:bg-blue-400/10",       barText: "text-blue-700 dark:text-blue-400",       barBorder: "border-blue-500/20 dark:border-blue-400/20" },
  PENDING: { label: "Pending", dot: "bg-zinc-400",     color: "#a1a1aa", barBg: "bg-zinc-500/10 dark:bg-zinc-400/10",       barText: "text-zinc-600 dark:text-zinc-400",       barBorder: "border-zinc-500/20 dark:border-zinc-400/20" },
  LEAD:    { label: "Lead",    dot: "bg-amber-400",    color: "#fbbf24", barBg: "bg-amber-500/10 dark:bg-amber-400/10",     barText: "text-amber-700 dark:text-amber-400",     barBorder: "border-amber-500/20 dark:border-amber-400/20" },
  LOST:    { label: "Lost",    dot: "bg-red-400",      color: "#f87171", barBg: "bg-red-500/10 dark:bg-red-400/10",         barText: "text-red-600 dark:text-red-400",         barBorder: "border-red-500/20 dark:border-red-400/20" },
} as const;
type ProjectStatus = keyof typeof STATUS_CONFIG;

const SECTIONS = [
  { key: "LIVE", label: "Live projects", statuses: ["WON", "ONGOING"] as ProjectStatus[] },
  { key: "PENDING", label: "Pending", statuses: ["PENDING"] as ProjectStatus[] },
  { key: "LEADS", label: "Leads & pipeline", statuses: ["LEAD"] as ProjectStatus[] },
  { key: "LOST", label: "Lost / Closed", statuses: ["LOST"] as ProjectStatus[] },
];

const KANBAN_COLS: { status: ProjectStatus | "UPCOMING"; label: string; color: string; borderColor: string }[] = [
  { status: "ONGOING", label: "Live", color: "bg-emerald-500/10", borderColor: "border-emerald-500/30" },
  { status: "WON", label: "Won", color: "bg-blue-500/10", borderColor: "border-blue-500/30" },
  { status: "PENDING", label: "Pending", color: "bg-zinc-500/10", borderColor: "border-zinc-500/30" },
  { status: "LEAD", label: "Lead", color: "bg-amber-500/10", borderColor: "border-amber-500/30" },
  { status: "UPCOMING", label: "Upcoming", color: "bg-violet-500/10", borderColor: "border-violet-500/30" },
  { status: "LOST", label: "Lost", color: "bg-red-500/10", borderColor: "border-red-500/30" },
];

interface Project { id: string; name: string; description?: string; status: ProjectStatus; value?: number; progress: number; startDate?: string; expectedEndDate?: string; notes?: string; proposal?: string; proposalDueDate?: string; priority?: string; owner?: { id: string; fullName: string; avatarUrl?: string }; organization?: { id: string; name: string; industry?: string }; createdAt: string; updatedAt: string; }
interface Organization { id: string; name: string; industry?: string; website?: string; notes?: string; projects: { id: string; name: string; status: string }[]; }
interface DashboardStats { stats: Record<string, { count: number; value: number }>; total: number; }

function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function startOfWeek(d: Date) { const r = new Date(d); r.setDate(r.getDate() - r.getDay() + 1); r.setHours(0,0,0,0); return r; }
function diffDays(a: Date, b: Date) { return (b.getTime() - a.getTime()) / (1000*60*60*24); }
function fmtShort(d: Date) { return d.toLocaleDateString("en-ZA", { day: "numeric", month: "short" }); }
function fmtDate(d?: string) { if (!d) return "—"; return new Date(d).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" }); }
function formatCurrency(v: number) { if (v >= 1_000_000) return `R ${(v / 1_000_000).toFixed(1)}M`; if (v >= 1_000) return `R ${(v / 1_000).toFixed(0)}K`; return `R ${v.toLocaleString()}`; }

type Tab = "pipeline" | "kanban" | "financials" | "analysis";

export default function BusinessTracker() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("pipeline");
  const [searchTerm, setSearchTerm] = useState("");
  const [addProjectOpen, setAddProjectOpen] = useState(false);
  const [addOrgOpen, setAddOrgOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [showLost, setShowLost] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [detailProjectId, setDetailProjectId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [activeAiPrompt, setActiveAiPrompt] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(7);
  const [showAll, setShowAll] = useState(false);
  const [dragProject, setDragProject] = useState<string | null>(null);

  const { data: statsData } = useQuery<DashboardStats>({ queryKey: ["business-stats"], queryFn: async () => (await api.get("/business/dashboard-stats")).data });
  const { data: projectsData, isLoading } = useQuery<{ projects: Project[] }>({ queryKey: ["business-projects"], queryFn: async () => (await api.get("/business/projects")).data });
  const { data: orgsData } = useQuery<{ organizations: Organization[] }>({ queryKey: ["business-organizations"], queryFn: async () => (await api.get("/business/organizations")).data });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => (await api.patch(`/business/projects/${id}`, data)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["business-projects"] }); qc.invalidateQueries({ queryKey: ["business-stats"] }); toast("Updated"); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/business/projects/${id}`)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["business-projects"] }); qc.invalidateQueries({ queryKey: ["business-stats"] }); toast("Project deleted"); },
  });

  const projects = projectsData?.projects || [];
  const organizations = orgsData?.organizations || [];
  const stats = statsData?.stats;

  const filtered = useMemo(() => {
    let r = projects;
    if (!showLost) r = r.filter((p) => p.status !== "LOST");
    if (searchTerm.trim()) { const q = searchTerm.toLowerCase(); r = r.filter((p) => p.name.toLowerCase().includes(q) || p.organization?.name.toLowerCase().includes(q) || p.owner?.fullName.toLowerCase().includes(q) || p.notes?.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q)); }
    return r;
  }, [projects, searchTerm, showLost]);

  // Pagination
  const totalPages = Math.ceil(filtered.length / pageSize);
  const paged = showAll ? filtered : filtered.slice(page * pageSize, (page + 1) * pageSize);

  const timeline = useMemo(() => {
    const today = new Date(); const start = startOfWeek(addDays(today, -7)); const end = addDays(start, 7 * 8); const days = diffDays(start, end);
    const weeks: { date: Date; pct: number }[] = []; let d = new Date(start);
    while (d <= end) { weeks.push({ date: new Date(d), pct: (diffDays(start, d) / days) * 100 }); d = addDays(d, 7); }
    return { start, end, days, weeks, todayPct: (diffDays(start, today) / days) * 100 };
  }, []);

  const sections = useMemo(() => SECTIONS.filter((s) => s.key !== "LOST" || showLost).map((s) => ({ ...s, projects: paged.filter((p) => s.statuses.includes(p.status)).sort((a, b) => (a.startDate || a.createdAt) < (b.startDate || b.createdAt) ? -1 : 1) })).filter((s) => s.projects.length > 0), [paged, showLost]);

  const barPos = useCallback((p: Project) => {
    const s = p.startDate ? new Date(p.startDate) : new Date(p.createdAt);
    const e = p.expectedEndDate ? new Date(p.expectedEndDate) : addDays(s, 30);
    const l = Math.max(0, (diffDays(timeline.start, s) / timeline.days) * 100);
    const w = Math.max(5, Math.min(100 - l, (diffDays(s, e) / timeline.days) * 100));
    return { left: `${l}%`, width: `${w}%` };
  }, [timeline]);

  const liveCount = (stats?.ONGOING?.count || 0) + (stats?.WON?.count || 0);
  const leadCount = stats?.LEAD?.count || 0;
  const pendingCount = stats?.PENDING?.count || 0;
  const lostCount = stats?.LOST?.count || 0;
  const totalValue = stats ? Object.values(stats).reduce((sum, s) => sum + s.value, 0) : 0;
  const liveValue = (stats?.ONGOING?.value || 0) + (stats?.WON?.value || 0);
  const leadValue = stats?.LEAD?.value || 0;
  const lostValue = stats?.LOST?.value || 0;
  const conversionRate = projects.length > 0 ? Math.round((liveCount / Math.max(1, projects.length - lostCount)) * 100) : 0;

  const ownerStats = useMemo(() => {
    const map = new Map<string, { name: string; count: number; value: number; live: number; leads: number }>();
    for (const p of projects) { const nm = p.owner?.fullName || "Unassigned"; const c = map.get(nm) || { name: nm, count: 0, value: 0, live: 0, leads: 0 }; c.count++; if (p.value) c.value += p.value; if (["ONGOING","WON"].includes(p.status)) c.live++; if (p.status === "LEAD") c.leads++; map.set(nm, c); }
    return [...map.values()].sort((a, b) => b.value - a.value);
  }, [projects]);

  const pieData = useMemo(() => (Object.entries(STATUS_CONFIG) as [ProjectStatus, (typeof STATUS_CONFIG)[ProjectStatus]][]).map(([k, c]) => ({ name: c.label, value: stats?.[k]?.count || 0, color: c.color })).filter(d => d.value > 0), [stats]);
  const barChartData = useMemo(() => (Object.entries(STATUS_CONFIG) as [ProjectStatus, (typeof STATUS_CONFIG)[ProjectStatus]][]).map(([k, c]) => ({ name: c.label, value: stats?.[k]?.value || 0, color: c.color })), [stats]);

  const openDetail = (id: string) => { setDetailProjectId(id); setDetailOpen(true); };

  // Export
  const getExportData = useCallback(() => filtered.map((p) => ({ "Project": p.name, "Status": STATUS_CONFIG[p.status].label, "Owner": p.owner?.fullName || "—", "Value (R)": p.value || 0, "Start": fmtDate(p.startDate), "End": fmtDate(p.expectedEndDate), "Notes": p.notes || "—" })), [filtered]);
  const exportCSV = useCallback(() => { const d = getExportData(); if (!d.length) return; const h = Object.keys(d[0]); const csv = [h.join(","), ...d.map((r) => h.map((k) => { const v = String(r[k as keyof typeof r] ?? ""); return v.includes(",") ? `"${v}"` : v; }).join(","))].join("\n"); const b = new Blob([csv], { type: "text/csv" }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "projects.csv"; a.click(); toast("Exported"); }, [getExportData]);
  const exportExcel = useCallback(async () => { try { const X = await import("xlsx"); const d = getExportData(); const ws = X.utils.json_to_sheet(d); const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, "Projects"); X.writeFile(wb, "projects.xlsx"); toast("Exported"); } catch {} }, [getExportData]);
  const exportPDF = useCallback(async () => { try { const { default: j } = await import("jspdf"); const at = (await import("jspdf-autotable")).default; const d = getExportData(); const doc = new j({ orientation: "landscape" }); doc.setFontSize(16); doc.text("Pipeline Report", 14, 18); const h = Object.keys(d[0]); at(doc, { startY: 26, head: [h], body: d.map((r) => h.map((k) => String(r[k as keyof typeof r] ?? ""))), styles: { fontSize: 7 }, headStyles: { fillColor: [45,106,79] } }); doc.save("projects.pdf"); toast("Exported"); } catch {} }, [getExportData]);

  const runAnalysis = async (prompt?: string) => { setAiLoading(true); if (!prompt && aiPrompt) setActiveAiPrompt(null); try { const res = await api.post("/business/ai/analyze", { prompt: prompt || aiPrompt || undefined }); setAiResult(res.data.analysis); setAiPrompt(""); } catch { toast.error("Analysis failed"); } finally { setAiLoading(false); } };

  const TABS: { key: Tab; label: string; icon: typeof BarChart3 }[] = [
    { key: "pipeline", label: "Pipeline", icon: BarChart3 },
    { key: "kanban", label: "Kanban", icon: Columns3 },
    { key: "financials", label: "Financials", icon: DollarSign },
    { key: "analysis", label: "AI Analysis", icon: Brain },
  ];

  return (
    <TooltipProvider delayDuration={150}>
      <div className="px-6 py-5 max-w-[1400px] mx-auto">

        {/* ─── TOOLBAR ─── */}
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <div className="flex items-center gap-0.5 p-1 rounded-lg bg-muted/50 border border-border">
            {TABS.map((t) => { const Icon = t.icon; const active = tab === t.key; return (
              <button key={t.key} onClick={() => setTab(t.key)} className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-[11px] font-medium transition-all ${active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`} style={{ fontFamily: mono }}><Icon size={13} /> {t.label}</button>
            ); })}
          </div>

          <div className="relative flex-1 max-w-[260px]">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input placeholder="Search projects, owners..." value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setPage(0); }} className="w-full h-8 pl-8 pr-3 rounded-md bg-muted/50 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring text-xs" style={{ fontFamily: mono }} />
          </div>

          <div className="flex items-center gap-1 ml-auto">
            <TBtn onClick={() => { setShowLost(!showLost); setPage(0); }}>{showLost ? <EyeOff size={12} /> : <Eye size={12} />} Lost</TBtn>
            <TBtn onClick={() => setImportOpen(true)}><Upload size={12} /> Import</TBtn>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><TBtn><Download size={12} /> Export</TBtn></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-36">
                <DropdownMenuItem onClick={exportPDF} className="gap-2 text-xs"><FileText size={12} className="text-red-500" /> PDF</DropdownMenuItem>
                <DropdownMenuItem onClick={exportExcel} className="gap-2 text-xs"><FileSpreadsheet size={12} className="text-emerald-500" /> Excel</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={exportCSV} className="gap-2 text-xs"><FileText size={12} className="text-blue-500" /> CSV</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <TBtn onClick={() => setAddOrgOpen(true)}><Building2 size={12} /> Org</TBtn>
            <button onClick={() => { setEditingProject(null); setAddProjectOpen(true); }} className="h-7 px-3 rounded-md flex items-center gap-1.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 transition-colors text-[11px] font-medium" style={{ fontFamily: mono }}><Plus size={12} /> New</button>
          </div>
        </div>

        {/* ═══════════ PIPELINE TAB ═══════════ */}
        {tab === "pipeline" && (
          <>
            <div className="flex items-center gap-5 mb-4">
              {(Object.entries(STATUS_CONFIG) as [ProjectStatus, (typeof STATUS_CONFIG)[ProjectStatus]][]).filter(([k]) => k !== "LOST").map(([key, cfg]) => (
                <div key={key} className="flex items-center gap-2"><div className={`w-2.5 h-2.5 rounded-sm ${cfg.dot}`} /><span className="text-[11px] text-muted-foreground" style={{ fontFamily: mono }}>{cfg.label}</span></div>
              ))}
            </div>

            <div className="rounded-xl overflow-hidden border border-border bg-card/50">
              <div className="bg-muted/60 text-muted-foreground border-b border-border" style={{ display: "grid", gridTemplateColumns: "minmax(180px,210px) 70px 200px 1fr", gap: "0 12px", padding: "10px 20px", fontFamily: mono, fontSize: "10px", letterSpacing: "0.07em", textTransform: "uppercase" }}>
                <div>Project</div><div>Owner</div><div>Next steps</div>
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${timeline.weeks.length}, 1fr)` }}>{timeline.weeks.map((w, i) => <span key={i} className="text-center text-[9px] opacity-70">{fmtShort(w.date)}</span>)}</div>
              </div>

              {isLoading ? <div className="flex items-center justify-center py-20"><div className="h-5 w-5 border-2 border-emerald-500/50 border-t-emerald-400 rounded-full animate-spin" /></div>
              : sections.length === 0 ? <div className="flex flex-col items-center justify-center py-16 text-muted-foreground"><Target size={24} className="mb-2 opacity-40" /><p className="text-sm">No projects found</p></div>
              : sections.map((section) => (
                <div key={section.key}>
                  <div className="px-5 py-1.5 border-t border-border bg-muted/30 text-[9px] text-muted-foreground uppercase tracking-[0.12em] font-medium" style={{ fontFamily: mono }}>{section.label}</div>
                  {section.projects.map((project) => {
                    const cfg = STATUS_CONFIG[project.status]; const bs = barPos(project);
                    const label = project.proposal || project.description || project.name;
                    const notes = project.notes?.split("\n").filter(Boolean).slice(0, 3) || [];
                    return (
                      <div key={project.id} className="group border-t border-border/50 hover:bg-accent/30 transition-colors cursor-pointer" style={{ display: "grid", gridTemplateColumns: "minmax(180px,210px) 70px 200px 1fr", gap: "0 12px", padding: "6px 20px", alignItems: "center" }} onClick={() => openDetail(project.id)}>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[13px] font-medium text-foreground truncate leading-tight hover:underline">{project.name}</span>
                            <DropdownMenu><DropdownMenuTrigger asChild><button onClick={(e) => e.stopPropagation()} className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-muted-foreground hover:text-foreground rounded p-0.5"><MoreHorizontal size={12} /></button></DropdownMenuTrigger>
                              <DropdownMenuContent align="start" className="w-40"><DropdownMenuItem className="gap-2 text-xs" onClick={() => { setEditingProject(project); setAddProjectOpen(true); }}><Pencil size={11} /> Edit</DropdownMenuItem><DropdownMenuSeparator />
                                {(["LEAD","PENDING","ONGOING","WON","LOST"] as ProjectStatus[]).filter(s => s !== project.status).map((s) => (<DropdownMenuItem key={s} className="gap-2 text-xs" onClick={() => updateMutation.mutate({ id: project.id, data: { status: s } })}><div className={`w-2 h-2 rounded-sm ${STATUS_CONFIG[s].dot}`} /> {STATUS_CONFIG[s].label}</DropdownMenuItem>))}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="gap-2 text-xs text-red-500 focus:text-red-500" onClick={() => { if (confirm(`Delete "${project.name}"? This cannot be undone.`)) deleteMutation.mutate(project.id); }}><Trash2 size={11} /> Delete</DropdownMenuItem>
                              </DropdownMenuContent></DropdownMenu>
                          </div>
                          <p className="truncate text-[10px] text-muted-foreground mt-0.5" style={{ fontFamily: mono }}>{project.description || "—"}</p>
                        </div>
                        <div className="truncate text-[10px] text-muted-foreground" style={{ fontFamily: mono }}>{project.owner?.fullName?.split(" ")[0] || "—"}</div>
                        <div className="min-w-0 text-[10px] text-muted-foreground leading-[1.55]" style={{ fontFamily: mono }}>{notes.length > 0 ? notes.map((n, i) => <div key={i} className="truncate">{n}</div>) : "—"}</div>
                        <div className="relative h-9">
                          <div className="absolute inset-0 pointer-events-none" style={{ display: "grid", gridTemplateColumns: `repeat(${timeline.weeks.length}, 1fr)` }}>{timeline.weeks.map((_, i) => <div key={i} className="border-l border-dashed border-border/30 h-full" />)}</div>
                          <div className="absolute top-0 bottom-0 w-0.5 pointer-events-none bg-orange-500/60 z-[5]" style={{ left: `${timeline.todayPct}%` }}><div className="absolute -top-px left-1/2 -translate-x-1/2 bg-orange-500 text-white text-[7px] font-semibold px-1 py-px rounded-sm" style={{ fontFamily: mono }}>NOW</div></div>
                          <Tooltip><TooltipTrigger asChild>
                            <div className={`absolute top-2.5 h-4 rounded flex items-center px-1.5 cursor-pointer transition-all hover:brightness-110 hover:shadow-sm border ${cfg.barBg} ${cfg.barText} ${cfg.barBorder}`} style={{ left: bs.left, width: bs.width, minWidth: "36px", fontFamily: mono, fontSize: "10px", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden" }} onClick={(e) => { e.stopPropagation(); openDetail(project.id); }}>{label}</div>
                          </TooltipTrigger><TooltipContent side="top" className="max-w-sm text-xs"><p className="font-semibold">{project.name}</p><p className="text-muted-foreground">{fmtDate(project.startDate)} → {fmtDate(project.expectedEndDate)}</p>{project.value ? <p>{formatCurrency(project.value)}</p> : null}</TooltipContent></Tooltip>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between mt-4 gap-4">
              <div className="text-[11px] text-muted-foreground" style={{ fontFamily: mono }}>
                {showAll ? `Showing all ${filtered.length}` : `${page * pageSize + 1}–${Math.min((page + 1) * pageSize, filtered.length)} of ${filtered.length}`} projects
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={() => setShowAll(!showAll)} className={`h-7 px-3 rounded-md text-[11px] border transition-colors ${showAll ? "bg-foreground/5 text-foreground border-border" : "text-muted-foreground border-border hover:text-foreground"}`} style={{ fontFamily: mono }}>{showAll ? "Paginate" : "View all"}</button>
                {!showAll && (
                  <>
                    <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }} className="h-7 rounded-md border border-border bg-background px-2 text-[11px] text-foreground" style={{ fontFamily: mono }}>
                      <option value={7}>7</option><option value={10}>10</option><option value={15}>15</option><option value={25}>25</option>
                    </select>
                    <div className="flex items-center gap-0.5 ml-1">
                      <PgBtn disabled={page === 0} onClick={() => setPage(0)}><ChevronsLeft size={13} /></PgBtn>
                      <PgBtn disabled={page === 0} onClick={() => setPage(p => p - 1)}><ChevronLeft size={13} /></PgBtn>
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        const start = Math.max(0, Math.min(page - 2, totalPages - 5));
                        const pg = start + i;
                        if (pg >= totalPages) return null;
                        return <button key={pg} onClick={() => setPage(pg)} className={`h-7 w-7 rounded-md text-[11px] font-medium transition-colors ${pg === page ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted"}`} style={{ fontFamily: mono }}>{pg + 1}</button>;
                      })}
                      <PgBtn disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}><ChevronRight size={13} /></PgBtn>
                      <PgBtn disabled={page >= totalPages - 1} onClick={() => setPage(totalPages - 1)}><ChevronsRight size={13} /></PgBtn>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-2 gap-4 mt-6">
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-3" style={{ fontFamily: mono }}>Distribution</p>
                {pieData.length > 0 ? <ResponsiveContainer width="100%" height={180}><PieChart><Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value" strokeWidth={0}>{pieData.map((e, i) => <Cell key={i} fill={e.color} />)}</Pie><ReTooltip contentStyle={{ borderRadius: 8, border: "none", fontSize: 12 }} /></PieChart></ResponsiveContainer> : <div className="h-[180px] flex items-center justify-center text-muted-foreground text-xs">No data</div>}
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-3" style={{ fontFamily: mono }}>Value by status</p>
                {barChartData.some(d => d.value > 0) ? <ResponsiveContainer width="100%" height={180}><BarChart data={barChartData} barCategoryGap="20%"><XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 9 }} tickFormatter={(v) => formatCurrency(v)} axisLine={false} tickLine={false} /><ReTooltip formatter={(v: any) => formatCurrency(v)} contentStyle={{ borderRadius: 8, border: "none", fontSize: 12 }} /><Bar dataKey="value" radius={[4, 4, 0, 0]}>{barChartData.map((e, i) => <Cell key={i} fill={e.color} />)}</Bar></BarChart></ResponsiveContainer> : <div className="h-[180px] flex items-center justify-center text-muted-foreground text-xs">No data</div>}
              </div>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-4 gap-px mt-4 rounded-xl overflow-hidden border border-border bg-border">
              {[{ v: String(liveCount), l: "Live" }, { v: String(leadCount), l: "Leads" }, { v: formatCurrency(totalValue), l: "Pipeline" }, { v: `${conversionRate}%`, l: "Conversion" }].map((c, i) => (
                <div key={i} className="bg-card py-3 px-4 text-center"><div className="text-lg font-semibold text-foreground tracking-tight" style={{ fontFamily: mono }}>{c.v}</div><div className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5" style={{ fontFamily: mono }}>{c.l}</div></div>
              ))}
            </div>
          </>
        )}

        {/* ═══════════ KANBAN TAB ═══════════ */}
        {tab === "kanban" && (
          <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: "500px" }}>
            {KANBAN_COLS.map((col) => {
              // Use ALL projects for kanban (not filtered by showLost) but respect search
              const searchFiltered = searchTerm.trim() ? projects.filter((p) => { const q = searchTerm.toLowerCase(); return p.name.toLowerCase().includes(q) || p.organization?.name.toLowerCase().includes(q) || p.owner?.fullName.toLowerCase().includes(q); }) : projects;
              const colProjects = col.status === "UPCOMING"
                ? searchFiltered.filter((p) => p.startDate && new Date(p.startDate) > new Date() && p.status !== "LOST" && p.status !== "WON")
                : searchFiltered.filter((p) => p.status === col.status);
              const isDroppable = col.status !== "UPCOMING"; // can't drop into upcoming
              const dotClass = col.status === "UPCOMING" ? "bg-violet-400" : STATUS_CONFIG[col.status as ProjectStatus].dot;
              return (
                <div
                  key={col.status}
                  className={`flex-shrink-0 w-[250px] rounded-xl border ${col.borderColor} ${col.color} flex flex-col`}
                  onDragOver={(e) => { if (isDroppable) { e.preventDefault(); e.currentTarget.classList.add("ring-2", "ring-foreground/20"); } }}
                  onDragLeave={(e) => { e.currentTarget.classList.remove("ring-2", "ring-foreground/20"); }}
                  onDrop={(e) => {
                    e.preventDefault(); e.currentTarget.classList.remove("ring-2", "ring-foreground/20");
                    if (!isDroppable) return;
                    const pid = e.dataTransfer.getData("text/plain");
                    if (pid) updateMutation.mutate({ id: pid, data: { status: col.status as ProjectStatus } });
                    setDragProject(null);
                  }}
                >
                  <div className="px-3 py-2.5 border-b border-border/50 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-sm ${dotClass}`} />
                      <span className="text-xs font-semibold text-foreground">{col.label}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground bg-background/50 px-1.5 py-0.5 rounded" style={{ fontFamily: mono }}>{colProjects.length}</span>
                  </div>
                  <div className="flex-1 p-2 space-y-2 overflow-y-auto">
                    {colProjects.map((p) => (
                      <div
                        key={p.id}
                        draggable={isDroppable}
                        onDragStart={(e) => { e.dataTransfer.setData("text/plain", p.id); setDragProject(p.id); }}
                        onDragEnd={() => setDragProject(null)}
                        onClick={() => openDetail(p.id)}
                        className={`rounded-lg border border-border bg-card p-3 cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all group ${dragProject === p.id ? "opacity-40" : ""}`}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <p className="text-sm font-medium text-foreground leading-tight">{p.name}</p>
                          {isDroppable && <GripVertical size={12} className="text-muted-foreground/30 group-hover:text-muted-foreground shrink-0 mt-0.5 cursor-grab" />}
                        </div>
                        {p.description && <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2" style={{ fontFamily: mono }}>{p.description}</p>}
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-[10px] text-muted-foreground" style={{ fontFamily: mono }}>{p.owner?.fullName?.split(" ")[0] || "—"}</span>
                          {p.value ? <span className="text-[10px] font-semibold text-foreground" style={{ fontFamily: mono }}>{formatCurrency(p.value)}</span> : null}
                        </div>
                        {p.progress > 0 && (
                          <div className="h-1 rounded-full bg-muted mt-2 overflow-hidden">
                            <div className={`h-full rounded-full ${col.status === "UPCOMING" ? "bg-violet-400" : STATUS_CONFIG[p.status].dot}`} style={{ width: `${p.progress}%`, opacity: 0.7 }} />
                          </div>
                        )}
                      </div>
                    ))}
                    {colProjects.length === 0 && <p className="text-xs text-muted-foreground/40 text-center py-8">No projects</p>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ═══════════ FINANCIALS TAB ═══════════ */}
        {tab === "financials" && (
          <div className="space-y-6">
            <div className="grid grid-cols-4 gap-3">
              {[
                { l: "Total Pipeline", v: formatCurrency(totalValue), Icon: DollarSign, c: "text-blue-500", sub: `${projects.length} projects` },
                { l: "Live Revenue", v: formatCurrency(liveValue), Icon: TrendingUp, c: "text-emerald-500", sub: `${liveCount} active` },
                { l: "Lead Pipeline", v: formatCurrency(leadValue), Icon: Target, c: "text-amber-500", sub: `${leadCount} leads` },
                { l: "Lost Revenue", v: formatCurrency(lostValue), Icon: TrendingDown, c: "text-red-500", sub: `${lostCount} lost` },
              ].map((m, i) => (
                <div key={i} className="rounded-xl p-5 bg-card border border-border">
                  <div className="flex items-center justify-between mb-3"><span className="text-[10px] text-muted-foreground uppercase tracking-wider" style={{ fontFamily: mono }}>{m.l}</span><m.Icon size={15} className={`${m.c} opacity-60`} /></div>
                  <div className={`text-[28px] font-bold tracking-tight leading-none ${m.c}`}>{m.v}</div>
                  <div className="text-[10px] text-muted-foreground mt-1.5" style={{ fontFamily: mono }}>{m.sub}</div>
                </div>
              ))}
            </div>
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-5 py-3 border-b border-border"><span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold" style={{ fontFamily: mono }}>Revenue by status</span></div>
              {(Object.entries(STATUS_CONFIG) as [ProjectStatus, (typeof STATUS_CONFIG)[ProjectStatus]][]).map(([key, cfg]) => {
                const count = stats?.[key]?.count || 0; const value = stats?.[key]?.value || 0; const pct = totalValue > 0 ? (value / totalValue) * 100 : 0;
                return (
                  <div key={key} className="border-t border-border/50" style={{ display: "grid", gridTemplateColumns: "130px 1fr 100px 70px", gap: "12px", padding: "10px 20px", alignItems: "center" }}>
                    <div className="flex items-center gap-2"><div className={`w-2.5 h-2.5 rounded-sm ${cfg.dot}`} /><span className="text-xs text-foreground font-medium">{cfg.label}</span><span className="text-[10px] text-muted-foreground">({count})</span></div>
                    <div className="h-2 rounded-full overflow-hidden bg-muted"><div className={`h-full rounded-full transition-all ${cfg.dot}`} style={{ width: `${pct}%`, opacity: 0.6 }} /></div>
                    <div className="text-sm text-foreground font-semibold text-right" style={{ fontFamily: mono }}>{formatCurrency(value)}</div>
                    <div className="text-[11px] text-muted-foreground text-right" style={{ fontFamily: mono }}>{pct.toFixed(1)}%</div>
                  </div>
                );
              })}
            </div>
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-5 py-3 border-b border-border flex items-center gap-2"><Users size={13} className="text-muted-foreground" /><span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold" style={{ fontFamily: mono }}>Team performance</span></div>
              <div className="text-[9px] text-muted-foreground uppercase tracking-wider border-b border-border/50" style={{ display: "grid", gridTemplateColumns: "150px repeat(4, 1fr)", gap: "12px", padding: "8px 20px", fontFamily: mono }}><div>Owner</div><div className="text-center">Projects</div><div className="text-center">Live</div><div className="text-center">Leads</div><div className="text-right">Value</div></div>
              {ownerStats.map((o) => (
                <div key={o.name} className="border-t border-border/50" style={{ display: "grid", gridTemplateColumns: "150px repeat(4, 1fr)", gap: "12px", padding: "9px 20px", alignItems: "center" }}>
                  <span className="text-sm text-foreground font-medium">{o.name}</span>
                  <span className="text-sm text-muted-foreground text-center" style={{ fontFamily: mono }}>{o.count}</span>
                  <span className="text-sm text-emerald-600 dark:text-emerald-400 text-center font-semibold" style={{ fontFamily: mono }}>{o.live}</span>
                  <span className="text-sm text-amber-600 dark:text-amber-400 text-center" style={{ fontFamily: mono }}>{o.leads}</span>
                  <span className="text-sm text-foreground text-right font-semibold" style={{ fontFamily: mono }}>{formatCurrency(o.value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══════════ AI ANALYSIS TAB ═══════════ */}
        {tab === "analysis" && (
          <div className="space-y-5">
            <div className="flex items-center gap-2 flex-wrap">
              {[
                { l: "Full Analysis", p: "" },
                { l: "Risk Assessment", p: "Focus on risk: at-risk projects, stale leads, overdue deadlines." },
                { l: "Revenue Forecast", p: "Revenue forecast: expected income by month, at-risk revenue." },
                { l: "Team Insights", p: "Team workload: who is overloaded, who has capacity." },
                { l: "Weekly Priorities", p: "Top 5-7 actions for this week with owners and deadlines." },
              ].map((q) => {
                const isActive = activeAiPrompt === q.l;
                return (
                  <button key={q.l} onClick={() => { setActiveAiPrompt(q.l); runAnalysis(q.p); }} disabled={aiLoading} className={`h-7 px-3 rounded-md flex items-center gap-1.5 text-[11px] border transition-colors disabled:opacity-50 ${isActive ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20" : "bg-muted/50 text-muted-foreground border-border hover:text-foreground"}`} style={{ fontFamily: mono }}>{q.l === "Full Analysis" && <Sparkles size={12} />} {q.l}</button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <input value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !aiLoading && runAnalysis()} placeholder="Ask anything about your portfolio..." className="flex-1 h-9 pl-4 pr-12 rounded-lg bg-muted/50 border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-purple-500/30 text-sm" />
              <button onClick={() => runAnalysis()} disabled={aiLoading} className="h-9 w-9 rounded-lg flex items-center justify-center text-purple-500 hover:bg-purple-500/10 disabled:opacity-50"><Send size={14} /></button>
            </div>
            {aiLoading && !aiResult && <div className="rounded-xl p-12 text-center border border-border bg-card"><Loader2 size={24} className="animate-spin mx-auto mb-3 text-purple-500" /><p className="text-sm text-muted-foreground" style={{ fontFamily: mono }}>Analyzing {projects.length} projects...</p></div>}
            {aiResult && (
              <div className="rounded-xl overflow-hidden border border-purple-500/20 bg-purple-500/[0.02] dark:bg-purple-500/[0.03]">
                <div className="px-5 py-3 border-b border-purple-500/10 flex items-center gap-2"><Brain size={14} className="text-purple-500" /><span className="text-[10px] text-purple-600 dark:text-purple-400 uppercase tracking-wider font-semibold" style={{ fontFamily: mono }}>AI Analysis</span></div>
                <div className="p-5 text-sm leading-relaxed text-foreground/90" dangerouslySetInnerHTML={{ __html: mdToHtml(aiResult) }} />
              </div>
            )}
            {!aiResult && !aiLoading && <div className="rounded-xl p-16 text-center border border-border bg-card"><Brain size={32} className="mx-auto mb-3 text-muted-foreground/30" /><p className="text-sm text-muted-foreground font-medium">AI-powered portfolio analysis</p><p className="text-[11px] text-muted-foreground/60 mt-1" style={{ fontFamily: mono }}>Click a prompt or type your own</p></div>}
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-between mt-7 text-[10px] text-muted-foreground/50" style={{ fontFamily: mono }}><span>Strideshift &middot; Business Tracker</span><span>Confidential</span></div>

        <AddProjectDialog open={addProjectOpen} onOpenChange={(o) => { setAddProjectOpen(o); if (!o) setEditingProject(null); }} organizations={organizations} editProject={editingProject} />
        <AddOrganizationDialog open={addOrgOpen} onOpenChange={setAddOrgOpen} />
        <ImportProjectsDialog open={importOpen} onOpenChange={setImportOpen} />
        <ProjectDetailPanel projectId={detailProjectId} open={detailOpen} onOpenChange={setDetailOpen} onEdit={(p) => { setDetailOpen(false); setEditingProject(p); setAddProjectOpen(true); }} />
      </div>
    </TooltipProvider>
  );
}

function TBtn({ onClick, children }: { onClick?: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className="h-7 px-2.5 rounded-md flex items-center gap-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors text-[11px]" style={{ fontFamily: "'Geist Mono', monospace" }}>{children}</button>;
}

function PgBtn({ onClick, disabled, children }: { onClick: () => void; disabled: boolean; children: React.ReactNode }) {
  return <button onClick={onClick} disabled={disabled} className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:pointer-events-none transition-colors">{children}</button>;
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

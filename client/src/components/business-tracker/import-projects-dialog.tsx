import { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/utils/api";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, X, Download } from "lucide-react";

interface ImportProjectsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = "upload" | "map" | "preview" | "result";

const PROJECT_FIELDS = [
  { key: "name", label: "Project Name", required: true },
  { key: "description", label: "Description" },
  { key: "status", label: "Status" },
  { key: "priority", label: "Priority" },
  { key: "value", label: "Deal Value" },
  { key: "progress", label: "Progress (%)" },
  { key: "organization", label: "Organization" },
  { key: "owner", label: "Owner" },
  { key: "startDate", label: "Start Date" },
  { key: "expectedEndDate", label: "End Date" },
  { key: "proposal", label: "Proposal" },
  { key: "proposalDueDate", label: "Proposal Due Date" },
  { key: "notes", label: "Notes" },
] as const;

const SKIP = "__skip__";

// Auto-match column headers to field keys
function autoMapColumns(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const aliases: Record<string, string[]> = {
    name: ["project", "project name", "name", "title"],
    description: ["description", "desc", "details", "scope"],
    status: ["status", "stage", "phase"],
    priority: ["priority", "urgency"],
    value: ["value", "deal value", "amount", "value (r)", "deal value (r)"],
    progress: ["progress", "progress (%)", "completion", "complete"],
    organization: ["organization", "org", "client", "company", "client organization"],
    owner: ["owner", "project owner", "assigned", "assigned to", "lead"],
    startDate: ["start date", "start", "begin", "begin date"],
    expectedEndDate: ["end date", "expected end date", "end", "due", "deadline"],
    proposal: ["proposal", "proposal summary"],
    proposalDueDate: ["proposal due", "proposal due date", "proposal deadline"],
    notes: ["notes", "comments", "internal notes", "remarks"],
  };

  const allFieldKeys: string[] = PROJECT_FIELDS.map((f) => f.key);
  for (const header of headers) {
    // Exact field key match (e.g. from Gantt HTML parser)
    if (allFieldKeys.includes(header) && !Object.values(mapping).includes(header)) {
      mapping[header] = header;
      continue;
    }
    const h = header.toLowerCase().trim();
    for (const [field, names] of Object.entries(aliases)) {
      if (names.includes(h) && !Object.values(mapping).includes(field)) {
        mapping[header] = field;
        break;
      }
    }
    if (!mapping[header]) mapping[header] = SKIP;
  }
  return mapping;
}

export function ImportProjectsDialog({ open, onOpenChange }: ImportProjectsDialogProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [columnMap, setColumnMap] = useState<Record<string, string>>({});
  const [importResult, setImportResult] = useState<{ created: number; skipped: number; errors: string[] } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const reset = () => {
    setStep("upload");
    setFileName("");
    setHeaders([]);
    setRows([]);
    setColumnMap({});
    setImportResult(null);
  };

  const handleClose = (open: boolean) => {
    if (!open) reset();
    onOpenChange(open);
  };

  const parseFile = useCallback(async (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["csv", "xlsx", "xls", "html", "htm"].includes(ext || "")) {
      toast.error("Unsupported file", { description: "Please upload a CSV, Excel, or HTML file." });
      return;
    }

    try {
      let data: Record<string, string>[] = [];

      if (ext === "html" || ext === "htm") {
        const text = await file.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, "text/html");

        // Try 1: Gantt-style HTML with .gantt-row / .project-name divs
        const ganttRows = doc.querySelectorAll(".gantt-row");
        if (ganttRows.length) {
          // Parse timeline range from header comment or subtitle
          let timelineStart: Date | null = null;
          let timelineDays = 24;
          const commentMatch = text.match(/Timeline:\s*(\d+\s+\w+)\s*to\s*(\d+\s+\w+)\s*=\s*(\d+)\s*days/i);
          const subtitleMatch = text.match(/(\d+\s+\w+)\s*to\s*(\d+\s+\w+)\s*(\d{4})/i);
          if (commentMatch) {
            const year = text.match(/(\d{4})/)?.[1] || "2026";
            timelineStart = new Date(`${commentMatch[1]} ${year}`);
            timelineDays = parseInt(commentMatch[3]);
          } else if (subtitleMatch) {
            timelineStart = new Date(`${subtitleMatch[1]} ${subtitleMatch[3]}`);
          }

          const pctToDate = (pct: number): string => {
            if (!timelineStart || isNaN(timelineStart.getTime())) return "";
            const d = new Date(timelineStart);
            d.setDate(d.getDate() + Math.round((pct / 100) * timelineDays));
            return d.toISOString().slice(0, 10);
          };

          // Track sections
          let currentSection = "";
          const sectionMap: Record<string, string> = {
            "live projects": "ONGOING", "live": "ONGOING",
            "pending": "PENDING",
            "leads & pipeline": "LEAD", "leads": "LEAD", "new leads": "LEAD",
            "lost": "LOST", "closed": "LOST",
          };
          const container = ganttRows[0].parentElement;
          const rowSections = new Map<Element, string>();
          if (container) {
            for (const child of Array.from(container.children)) {
              if (child.classList.contains("section-label")) {
                const label = (child.textContent || "").trim().toLowerCase();
                for (const [key, status] of Object.entries(sectionMap)) {
                  if (label.includes(key)) { currentSection = status; break; }
                }
              }
              if (child.classList.contains("gantt-row")) {
                rowSections.set(child, currentSection);
              }
            }
          }

          for (const row of ganttRows) {
            const name = row.querySelector(".project-name")?.textContent?.trim() || "";
            if (!name) continue;

            const description = row.querySelector(".project-sub")?.textContent?.trim() || "";
            const owner = row.querySelector(".owner-tag")?.textContent?.trim() || "";
            const status = rowSections.get(row) || "ONGOING";

            // Extract next-steps preserving line breaks
            const nextStepsEl = row.querySelector(".next-steps");
            const notes = nextStepsEl
              ? Array.from(nextStepsEl.childNodes)
                  .map((n) => (n.textContent || "").trim())
                  .filter(Boolean)
                  .join("\n")
              : "";

            // Extract bar text as proposal/summary
            const bars = row.querySelectorAll(".bar");
            const proposal = Array.from(bars).map((b) => (b.textContent || "").trim()).filter(Boolean).join(" | ");

            // Compute dates from bar position (left% = start, left% + width% = end)
            let startDate = "";
            let expectedEndDate = "";
            if (bars.length > 0) {
              const firstBar = bars[0] as HTMLElement;
              const leftMatch = firstBar.getAttribute("style")?.match(/left:\s*([\d.]+)%/);
              const widthMatch = firstBar.getAttribute("style")?.match(/width:\s*([\d.]+)%/);
              if (leftMatch && widthMatch) {
                const leftPct = parseFloat(leftMatch[1]);
                const widthPct = parseFloat(widthMatch[1]);
                startDate = pctToDate(leftPct);
                expectedEndDate = pctToDate(leftPct + widthPct);
              }
            }

            data.push({ name, description, status, owner, notes, proposal, startDate, expectedEndDate });
          }
        }

        // Try 2: find a <table> element
        if (!data.length) {
          const table = doc.querySelector("table");
          if (table) {
            const XLSX = await import("xlsx");
            const ws = XLSX.utils.table_to_sheet(table);
            data = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "" });
          }
        }

        if (!data.length) {
          toast.error("No data found", { description: "Could not extract project data from this HTML file." });
          return;
        }
      } else {
        const XLSX = await import("xlsx");
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        data = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "" });
      }

      if (!data.length) {
        toast.error("Empty file", { description: "The file contains no data rows." });
        return;
      }

      const hdrs = Object.keys(data[0]);
      setFileName(file.name);
      setHeaders(hdrs);
      setRows(data);
      setColumnMap(autoMapColumns(hdrs));
      setStep("map");
    } catch (e) {
      console.error("Import parse error:", e);
      toast.error("Parse error", { description: "Could not read the file." });
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  }, [parseFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
    e.target.value = "";
  }, [parseFile]);

  // Build mapped rows for preview and import
  const mappedRows = rows.map((row) => {
    const mapped: Record<string, string> = {};
    for (const [header, field] of Object.entries(columnMap)) {
      if (field !== SKIP) {
        mapped[field] = row[header] || "";
      }
    }
    return mapped;
  });

  const hasRequiredField = Object.values(columnMap).includes("name");

  const importMutation = useMutation({
    mutationFn: async (projects: Record<string, string>[]) =>
      (await api.post("/business/projects/import", { projects })).data,
    onSuccess: (data) => {
      setImportResult(data);
      setStep("result");
      queryClient.invalidateQueries({ queryKey: ["business-projects"] });
      queryClient.invalidateQueries({ queryKey: ["business-stats"] });
      queryClient.invalidateQueries({ queryKey: ["business-organizations"] });
    },
    onError: (err: any) => {
      toast.error("Import failed", { description: err?.response?.data?.error || "Something went wrong" });
    },
  });

  const downloadTemplate = useCallback(async () => {
    const XLSX = await import("xlsx");
    const template = [
      {
        "Project": "",
        "Description": "",
        "Status": "LEAD",
        "Priority": "MEDIUM",
        "Value (R)": "",
        "Progress (%)": "0",
        "Organization": "",
        "Owner": "",
        "Start Date": "",
        "End Date": "",
        "Proposal": "",
        "Proposal Due Date": "",
        "Notes": "",
      },
    ];
    const ws = XLSX.utils.json_to_sheet(template);
    ws["!cols"] = Object.keys(template[0]).map(() => ({ wch: 18 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Projects");
    XLSX.writeFile(wb, "projects-import-template.xlsx");
    toast("Downloaded", { description: "Template file ready to fill in." });
  }, []);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center gap-2">
            <Upload size={18} /> Import Projects
          </DialogTitle>
          <DialogDescription>
            {step === "upload" && "Upload a CSV, Excel, or HTML file to bulk-import projects."}
            {step === "map" && "Map your file columns to project fields."}
            {step === "preview" && "Review the data before importing."}
            {step === "result" && "Import complete."}
          </DialogDescription>
        </DialogHeader>

        {/* ─── Step 1: Upload ─── */}
        {step === "upload" && (
          <div className="space-y-4 mt-2">
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer ${
                dragOver ? "border-indigo-500 bg-indigo-500/5" : "border-muted-foreground/25 hover:border-muted-foreground/40"
              }`}
              onClick={() => document.getElementById("import-file-input")?.click()}
            >
              <FileSpreadsheet size={36} className="mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm font-medium">Drop your file here, or click to browse</p>
              <p className="text-xs text-muted-foreground mt-1">Supports .csv, .xlsx, .xls, .html</p>
              <input
                id="import-file-input"
                type="file"
                accept=".csv,.xlsx,.xls,.html,.htm"
                className="hidden"
                onChange={handleFileInput}
              />
            </div>

            <div className="flex items-center justify-center">
              <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground" onClick={downloadTemplate}>
                <Download size={13} /> Download template
              </Button>
            </div>
          </div>
        )}

        {/* ─── Step 2: Column Mapping ─── */}
        {step === "map" && (
          <div className="space-y-4 mt-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet size={14} className="text-emerald-500" />
                <span className="text-sm font-medium">{fileName}</span>
                <Badge variant="secondary" className="text-[10px]">{rows.length} rows</Badge>
              </div>
              <Button variant="ghost" size="sm" className="text-xs h-7" onClick={reset}>
                <X size={12} className="mr-1" /> Change file
              </Button>
            </div>

            <div className="rounded-lg border overflow-hidden">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-2 bg-muted/50 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                <span>Your Column</span>
                <span></span>
                <span>Maps To</span>
              </div>
              <div className="divide-y max-h-[320px] overflow-y-auto">
                {headers.map((header) => (
                  <div key={header} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-2">
                    <span className="text-sm truncate" title={header}>{header}</span>
                    <span className="text-muted-foreground text-xs">&rarr;</span>
                    <Select
                      value={columnMap[header] || SKIP}
                      onValueChange={(v) => setColumnMap((m) => ({ ...m, [header]: v }))}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SKIP}>
                          <span className="text-muted-foreground">Skip this column</span>
                        </SelectItem>
                        {PROJECT_FIELDS.map((f) => (
                          <SelectItem key={f.key} value={f.key}>
                            {f.label} {"required" in f && f.required && <span className="text-red-500">*</span>}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>

            {!hasRequiredField && (
              <div className="flex items-center gap-2 text-amber-500 text-xs">
                <AlertCircle size={14} />
                <span>You must map at least one column to <strong>Project Name</strong>.</span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={reset}>Back</Button>
              <Button
                size="sm"
                disabled={!hasRequiredField}
                onClick={() => setStep("preview")}
                className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white"
              >
                Preview Data
              </Button>
            </div>
          </div>
        )}

        {/* ─── Step 3: Preview ─── */}
        {step === "preview" && (
          <div className="space-y-4 mt-2">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{mappedRows.length} projects to import</Badge>
            </div>

            <div className="rounded-lg border overflow-auto max-h-[350px]">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-muted-foreground">#</th>
                    {PROJECT_FIELDS.filter((f) => Object.values(columnMap).includes(f.key)).map((f) => (
                      <th key={f.key} className="px-3 py-2 text-left font-semibold text-muted-foreground whitespace-nowrap">
                        {f.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {mappedRows.slice(0, 50).map((row, i) => (
                    <tr key={i} className={!row.name ? "bg-red-500/5" : ""}>
                      <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                      {PROJECT_FIELDS.filter((f) => Object.values(columnMap).includes(f.key)).map((f) => (
                        <td key={f.key} className="px-3 py-1.5 max-w-[200px] truncate">
                          {row[f.key] || <span className="text-muted-foreground">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {mappedRows.length > 50 && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  Showing first 50 of {mappedRows.length} rows
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setStep("map")}>Back</Button>
              <Button
                size="sm"
                disabled={importMutation.isPending}
                onClick={() => importMutation.mutate(mappedRows)}
                className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white"
              >
                {importMutation.isPending ? "Importing..." : `Import ${mappedRows.length} Projects`}
              </Button>
            </div>
          </div>
        )}

        {/* ─── Step 4: Result ─── */}
        {step === "result" && importResult && (
          <div className="space-y-4 mt-2">
            <div className="rounded-xl border p-6 text-center">
              <CheckCircle2 size={40} className="mx-auto mb-3 text-emerald-500" />
              <p className="text-lg font-semibold">{importResult.created} project{importResult.created !== 1 ? "s" : ""} imported</p>
              {importResult.skipped > 0 && (
                <p className="text-sm text-muted-foreground mt-1">{importResult.skipped} skipped</p>
              )}
            </div>

            {importResult.errors.length > 0 && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-1 max-h-[150px] overflow-y-auto">
                <p className="text-xs font-semibold text-amber-500 flex items-center gap-1.5">
                  <AlertCircle size={13} /> Issues
                </p>
                {importResult.errors.map((err, i) => (
                  <p key={i} className="text-xs text-muted-foreground">{err}</p>
                ))}
              </div>
            )}

            <div className="flex justify-end pt-1">
              <Button
                size="sm"
                onClick={() => handleClose(false)}
                className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white"
              >
                Done
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

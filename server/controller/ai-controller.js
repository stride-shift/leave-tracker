import { prisma } from "../util/db.js";
import errorHandler from "../util/error-handler.js";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// POST /business/ai/analyze
export const analyzePortfolio = async (req, res, next) => {
  try {
    const { prompt: userPrompt } = req.body;

    const projects = await prisma.project.findMany({
      where: { isActive: true },
      include: {
        owner: { select: { fullName: true } },
        organization: { select: { name: true, industry: true } },
      },
    });

    const summary = projects.map((p) => ({
      name: p.name,
      status: p.status,
      value: p.value,
      progress: p.progress,
      owner: p.owner?.fullName || "Unassigned",
      organization: p.organization?.name || "None",
      industry: p.organization?.industry || "Unknown",
      startDate: p.startDate?.toISOString().slice(0, 10) || null,
      endDate: p.expectedEndDate?.toISOString().slice(0, 10) || null,
      description: p.description,
      proposal: p.proposal,
      notes: p.notes,
      priority: p.priority,
    }));

    const statusCounts = {};
    let totalValue = 0;
    let valuedProjects = 0;
    for (const p of projects) {
      statusCounts[p.status] = (statusCounts[p.status] || 0) + 1;
      if (p.value) { totalValue += p.value; valuedProjects++; }
    }

    const context = `You are a senior business analyst for Strideshift, a consulting company. Analyze this project portfolio data and provide actionable insights.

PORTFOLIO SNAPSHOT (${new Date().toISOString().slice(0, 10)}):
- Total projects: ${projects.length}
- Status breakdown: ${JSON.stringify(statusCounts)}
- Total pipeline value: R ${totalValue.toLocaleString()}
- Projects with assigned value: ${valuedProjects}

PROJECTS:
${JSON.stringify(summary, null, 2)}

Respond in clear, structured markdown. Use headers, bullet points, and bold for key numbers. Be specific — reference project names, owners, dates. Keep it concise and actionable. Currency is South African Rand (R).`;

    const defaultPrompt = `Give me a comprehensive business analysis covering:
1. **Pipeline Health** — status distribution, bottlenecks, velocity
2. **Revenue Analysis** — pipeline value breakdown, at-risk revenue, forecast
3. **Team Workload** — owner distribution, capacity concerns
4. **Risk Assessment** — overdue projects, stale leads, dependency risks
5. **Top 3 Recommendations** — prioritized actions for this week`;

    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const result = await model.generateContent([context, userPrompt || defaultPrompt]);
    const text = result.response.text();

    return res.json({ analysis: text, projectCount: projects.length, totalValue, statusCounts });
  } catch (error) {
    console.error("AI analysis error:", error?.message || error);
    next(errorHandler(500, error));
  }
};

// POST /business/ai/analyze-project/:id
export const analyzeProject = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { prompt: userPrompt } = req.body;

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        owner: { select: { fullName: true, email: true } },
        organization: { select: { name: true, industry: true } },
        activities: { orderBy: { createdAt: "desc" }, take: 20, include: { author: { select: { fullName: true } } } },
        resources: true,
      },
    });

    if (!project) return res.status(404).json({ error: "Project not found" });

    const daysActive = Math.round((Date.now() - new Date(project.createdAt).getTime()) / (1000 * 60 * 60 * 24));
    const daysRemaining = project.expectedEndDate ? Math.round((new Date(project.expectedEndDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;

    const context = `You are a senior business analyst at Strideshift consulting. Analyze this specific project and provide actionable insights.

PROJECT: ${project.name}
Status: ${project.status} | Priority: ${project.priority || "MEDIUM"} | Progress: ${project.progress}%
Value: R ${(project.value || 0).toLocaleString()}
Owner: ${project.owner?.fullName || "Unassigned"}
Organization: ${project.organization?.name || "None"} (${project.organization?.industry || "Unknown"})
Description: ${project.description || "None"}
Proposal: ${project.proposal || "None"}
Start: ${project.startDate?.toISOString().slice(0, 10) || "Not set"} | End: ${project.expectedEndDate?.toISOString().slice(0, 10) || "Not set"}
Days active: ${daysActive} | Days remaining: ${daysRemaining ?? "N/A"} ${daysRemaining !== null && daysRemaining < 0 ? "(OVERDUE)" : ""}
Notes/Next Steps: ${project.notes || "None"}

RECENT ACTIVITY (${project.activities.length} entries):
${project.activities.map(a => `- [${a.createdAt.toISOString().slice(0, 10)}] ${a.author?.fullName || "System"}: ${a.content}`).join("\n") || "No activity logged"}

RESOURCES (${project.resources.length}):
${project.resources.map(r => `- ${r.name} (${r.type}): ${r.url}`).join("\n") || "No resources attached"}

Respond in clear, structured markdown. Be specific and actionable. Currency is South African Rand (R).`;

    const defaultPrompt = `Provide a comprehensive analysis of this project:
1. **Project Health** — current status assessment, is it on track?
2. **Jobs To Be Done** — what are the critical next actions? List 5-7 specific tasks with suggested deadlines
3. **Risk Assessment** — what could go wrong? Timeline risks, resource gaps, blockers
4. **Success Metrics** — how to measure if this project is succeeding
5. **Recommendations** — top 3 actionable suggestions for the project owner this week`;

    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const result = await model.generateContent([context, userPrompt || defaultPrompt]);
    const text = result.response.text();

    return res.json({ analysis: text });
  } catch (error) {
    console.error("Project AI analysis error:", error?.message || error);
    next(errorHandler(500, error));
  }
};

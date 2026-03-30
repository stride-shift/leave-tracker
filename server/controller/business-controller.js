import { prisma } from "../util/db.js";
import errorHandler from "../util/error-handler.js";

// GET /business/dashboard-stats
export const getDashboardStats = async (req, res, next) => {
  try {
    const projects = await prisma.project.findMany({
      where: { isActive: true, ...(req.tenantId ? { tenantId: req.tenantId } : {}) },
      select: { status: true, value: true },
    });

    const stats = { LEAD: { count: 0, value: 0 }, PENDING: { count: 0, value: 0 }, ONGOING: { count: 0, value: 0 }, WON: { count: 0, value: 0 }, LOST: { count: 0, value: 0 } };
    for (const p of projects) {
      const s = stats[p.status] || stats.ONGOING;
      s.count++;
      s.value += p.value || 0;
    }

    return res.json({ stats, total: projects.length });
  } catch (error) {
    next(errorHandler(500, error));
  }
};

// GET /business/projects?status=ONGOING
export const listProjects = async (req, res, next) => {
  try {
    const { status } = req.query;
    const where = { isActive: true, ...(req.tenantId ? { tenantId: req.tenantId } : {}) };
    if (status) where.status = status;

    const projects = await prisma.project.findMany({
      where,
      include: {
        owner: { select: { id: true, fullName: true, avatarUrl: true, email: true } },
        organization: { select: { id: true, name: true, industry: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    return res.json({ projects });
  } catch (error) {
    next(errorHandler(500, error));
  }
};

// POST /business/projects
export const createProject = async (req, res, next) => {
  try {
    const { name, description, status, value, progress, ownerId, organizationId, startDate, expectedEndDate, notes, proposal, proposalDueDate, priority } = req.body;

    if (!name) return res.status(400).json({ error: "Project name is required" });

    const project = await prisma.project.create({
      data: {
        name,
        description: description || null,
        status: status || "ONGOING",
        value: value ? parseFloat(value) : null,
        progress: progress ? parseInt(progress) : 0,
        ownerId: ownerId || null,
        organizationId: organizationId || null,
        startDate: startDate ? new Date(startDate) : null,
        expectedEndDate: expectedEndDate ? new Date(expectedEndDate) : null,
        notes: notes || null,
        proposal: proposal || null,
        proposalDueDate: proposalDueDate ? new Date(proposalDueDate) : null,
        priority: priority || "MEDIUM",
      },
      include: {
        owner: { select: { id: true, fullName: true, avatarUrl: true } },
        organization: { select: { id: true, name: true } },
      },
    });

    return res.status(201).json({ project, message: "Project created" });
  } catch (error) {
    if (error.code === "P2002") return res.status(400).json({ error: "A project with this name already exists" });
    next(errorHandler(500, error));
  }
};

// PATCH /business/projects/:id
export const updateProject = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description, status, value, progress, ownerId, organizationId, startDate, expectedEndDate, notes, proposal, proposalDueDate, priority } = req.body;

    const data = {};
    if (name !== undefined) data.name = name;
    if (description !== undefined) data.description = description;
    if (status !== undefined) data.status = status;
    if (value !== undefined) data.value = value ? parseFloat(value) : null;
    if (progress !== undefined) data.progress = parseInt(progress);
    if (ownerId !== undefined) data.ownerId = ownerId || null;
    if (organizationId !== undefined) data.organizationId = organizationId || null;
    if (startDate !== undefined) data.startDate = startDate ? new Date(startDate) : null;
    if (expectedEndDate !== undefined) data.expectedEndDate = expectedEndDate ? new Date(expectedEndDate) : null;
    if (notes !== undefined) data.notes = notes;
    if (proposal !== undefined) data.proposal = proposal;
    if (proposalDueDate !== undefined) data.proposalDueDate = proposalDueDate ? new Date(proposalDueDate) : null;
    if (priority !== undefined) data.priority = priority;

    const project = await prisma.project.update({
      where: { id },
      data,
      include: {
        owner: { select: { id: true, fullName: true, avatarUrl: true } },
        organization: { select: { id: true, name: true } },
      },
    });

    return res.json({ project, message: "Project updated" });
  } catch (error) {
    next(errorHandler(500, error));
  }
};

// GET /business/organizations
export const listOrganizations = async (req, res, next) => {
  try {
    const organizations = await prisma.organization.findMany({
      include: { projects: { select: { id: true, name: true, status: true } } },
      orderBy: { name: "asc" },
    });
    return res.json({ organizations });
  } catch (error) {
    next(errorHandler(500, error));
  }
};

// POST /business/organizations
export const createOrganization = async (req, res, next) => {
  try {
    const { name, industry, website, notes } = req.body;
    if (!name) return res.status(400).json({ error: "Organization name is required" });

    const organization = await prisma.organization.create({
      data: { name, industry: industry || null, website: website || null, notes: notes || null },
    });

    return res.status(201).json({ organization, message: "Organization created" });
  } catch (error) {
    if (error.code === "P2002") return res.status(400).json({ error: "An organization with this name already exists" });
    next(errorHandler(500, error));
  }
};

// POST /business/projects/import
export const importProjects = async (req, res, next) => {
  try {
    const { projects: rows } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "No projects to import" });
    }

    // Fetch existing orgs and users for matching by name
    const [existingOrgs, existingUsers] = await Promise.all([
      prisma.organization.findMany({ select: { id: true, name: true } }),
      prisma.user.findMany({ select: { id: true, fullName: true, email: true } }),
    ]);

    const orgMap = new Map(existingOrgs.map((o) => [o.name.toLowerCase(), o.id]));
    const userMap = new Map(existingUsers.map((u) => [u.fullName.toLowerCase(), u.id]));
    const userEmailMap = new Map(existingUsers.map((u) => [u.email.toLowerCase(), u.id]));

    const validStatuses = ["LEAD", "PENDING", "ONGOING", "WON", "LOST"];
    const validPriorities = ["LOW", "MEDIUM", "HIGH", "URGENT"];

    const results = { created: 0, skipped: 0, errors: [] };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 1;

      if (!row.name || !row.name.trim()) {
        results.errors.push(`Row ${rowNum}: Missing project name`);
        results.skipped++;
        continue;
      }

      // Resolve organization by name — create if not found
      let organizationId = null;
      if (row.organization && row.organization.trim()) {
        const orgName = row.organization.trim();
        organizationId = orgMap.get(orgName.toLowerCase()) || null;
        if (!organizationId) {
          try {
            const newOrg = await prisma.organization.create({ data: { name: orgName } });
            organizationId = newOrg.id;
            orgMap.set(orgName.toLowerCase(), newOrg.id);
          } catch (e) {
            if (e.code === "P2002") {
              const found = await prisma.organization.findFirst({ where: { name: orgName } });
              organizationId = found?.id || null;
            }
          }
        }
      }

      // Resolve owner by name or email
      let ownerId = null;
      if (row.owner && row.owner.trim()) {
        const ownerVal = row.owner.trim().toLowerCase();
        ownerId = userMap.get(ownerVal) || userEmailMap.get(ownerVal) || null;
      }

      // Normalize status
      let status = "ONGOING";
      if (row.status) {
        const s = row.status.trim().toUpperCase();
        if (validStatuses.includes(s)) status = s;
      }

      // Normalize priority
      let priority = "MEDIUM";
      if (row.priority) {
        const p = row.priority.trim().toUpperCase();
        if (validPriorities.includes(p)) priority = p;
      }

      const projectData = {
        name: row.name.trim(),
        description: row.description || null,
        status,
        value: row.value ? parseFloat(row.value) : null,
        progress: row.progress ? parseInt(row.progress) : 0,
        ownerId,
        organizationId,
        startDate: row.startDate ? new Date(row.startDate) : null,
        expectedEndDate: row.expectedEndDate ? new Date(row.expectedEndDate) : null,
        notes: row.notes || null,
        proposal: row.proposal || null,
        proposalDueDate: row.proposalDueDate ? new Date(row.proposalDueDate) : null,
        priority,
      };

      try {
        // Try create first; if duplicate, update the existing record
        await prisma.project.create({ data: projectData });
        results.created++;
      } catch (e) {
        if (e.code === "P2002") {
          try {
            const { name, ...updateData } = projectData;
            // Only update fields that have actual values (don't overwrite with nulls)
            const filtered = {};
            for (const [k, v] of Object.entries(updateData)) {
              if (v !== null && v !== undefined && v !== 0 && v !== "") filtered[k] = v;
            }
            if (Object.keys(filtered).length > 0) {
              await prisma.project.update({ where: { name: row.name.trim() }, data: filtered });
              results.created++;
            } else {
              results.skipped++;
            }
          } catch (ue) {
            results.errors.push(`Row ${rowNum}: update failed — ${ue.message}`);
            results.skipped++;
          }
        } else {
          results.errors.push(`Row ${rowNum}: ${e.message}`);
          results.skipped++;
        }
      }
    }

    return res.json({
      message: `Imported ${results.created} project(s)`,
      ...results,
    });
  } catch (error) {
    next(errorHandler(500, error));
  }
};

// POST /business/seed-team (temporary — creates team users + updates project owners)
export const seedTeam = async (req, res, next) => {
  try {
    const teamMembers = [
      { fullName: "Barbara Dale-Jones", email: "barbara.dalejones@strideshift.ai", role: "MANAGER", shortNames: ["b", "barbara"] },
      { fullName: "Justin Germishuys", email: "justin.germishuys@strideshift.ai", role: "TEAM_MEMBER", shortNames: ["justin"] },
      { fullName: "Alison Jacobson", email: "alison.jacobson@strideshift.ai", role: "TEAM_MEMBER", shortNames: ["alison", "ali"] },
      { fullName: "Shanne Saunders", email: "shanne.saunders@strideshift.ai", role: "TEAM_MEMBER", shortNames: ["shanne"] },
      { fullName: "Stephen Green", email: "stephen.green@strideshift.ai", role: "TEAM_MEMBER", shortNames: ["stephen"] },
      { fullName: "Johannes Backer", email: "johannes.backer@strideshift.ai", role: "TEAM_MEMBER", shortNames: ["johannes"] },
    ];

    const created = [];
    const existed = [];
    const userMap = new Map(); // shortName -> userId

    for (const m of teamMembers) {
      let user = await prisma.user.findUnique({ where: { email: m.email } });
      if (!user) {
        user = await prisma.user.create({ data: { email: m.email, fullName: m.fullName, role: m.role } });
        created.push(m.fullName);
      } else {
        existed.push(m.fullName);
      }
      for (const sn of m.shortNames) {
        userMap.set(sn, user.id);
      }
    }

    // Now update all projects that have no owner — match by the HTML owner short names
    const projects = await prisma.project.findMany({ where: { isActive: true, ownerId: null } });
    let updated = 0;

    // We need to figure out which owner each project had from the HTML
    // The import stored owner as notes or description — let's use the HTML file data
    const ownerMapping = {
      "Britehouse": "stephen",
      "Cisco": "justin",
      "Columba": "b",
      "OMT": "justin",
      "Pragma": "stephen",
      "Pragma Cyborg Habits": "shanne",
      "Standard Bank Namibia": "b",
      "Correlation": "justin",
      "Ctrack": "alison",
      "Sybrin / Lead Sleuth": "stephen",
      "Dandemutande": "alison",
      "GSK / Tech Mahindra": "b",
      "Hon. Selepe": "stephen",
      "IFS": "alison",
      "JET Education Services": "alison",
      "Nedbank": "b",
      "Standard Bank SA": "b",
      "Atlassian": "alison",
      "PPG / Pinnacle Pet Group": "alison",
      "Pragma — AI for Engineers": "justin",
      "Pragma — Board Coaching": "justin",
      "Pragma — Retainer": "stephen",
      "Sybrin — Contract Management": "alison",
    };

    for (const project of projects) {
      const shortName = ownerMapping[project.name];
      if (shortName && userMap.has(shortName)) {
        await prisma.project.update({
          where: { id: project.id },
          data: { ownerId: userMap.get(shortName) },
        });
        updated++;
      }
    }

    return res.json({ message: `Created ${created.length} users, ${existed.length} existed, updated ${updated} project owners`, created, existed });
  } catch (error) {
    next(errorHandler(500, error));
  }
};

// PATCH /business/organizations/:id
export const updateOrganization = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, industry, website, notes } = req.body;

    const data = {};
    if (name !== undefined) data.name = name;
    if (industry !== undefined) data.industry = industry;
    if (website !== undefined) data.website = website;
    if (notes !== undefined) data.notes = notes;

    const organization = await prisma.organization.update({ where: { id }, data });
    return res.json({ organization, message: "Organization updated" });
  } catch (error) {
    next(errorHandler(500, error));
  }
};

// GET /business/projects/:id — full project detail
export const getProject = async (req, res, next) => {
  try {
    const { id } = req.params;
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, fullName: true, avatarUrl: true, email: true } },
        organization: { select: { id: true, name: true, industry: true } },
        activities: { orderBy: { createdAt: "desc" }, take: 50, include: { author: { select: { id: true, fullName: true } } } },
        resources: { orderBy: { createdAt: "desc" }, include: { uploadedBy: { select: { id: true, fullName: true } } } },
      },
    });
    if (!project) return res.status(404).json({ error: "Project not found" });
    return res.json({ project });
  } catch (error) { next(errorHandler(500, error)); }
};

// POST /business/projects/:id/activities
export const addActivity = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { content, type } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: "Content is required" });

    const activity = await prisma.projectActivity.create({
      data: { content: content.trim(), type: type || "note", projectId: id, authorId: req.user?.id || null },
      include: { author: { select: { id: true, fullName: true } } },
    });
    return res.status(201).json({ activity });
  } catch (error) { next(errorHandler(500, error)); }
};

// POST /business/projects/:id/resources
export const addResource = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, url, type } = req.body;
    if (!name?.trim() || !url?.trim()) return res.status(400).json({ error: "Name and URL are required" });

    const resource = await prisma.projectResource.create({
      data: { name: name.trim(), url: url.trim(), type: type || "link", projectId: id, uploadedById: req.user?.id || null },
      include: { uploadedBy: { select: { id: true, fullName: true } } },
    });
    return res.status(201).json({ resource });
  } catch (error) { next(errorHandler(500, error)); }
};

// DELETE /business/resources/:id
export const deleteResource = async (req, res, next) => {
  try {
    await prisma.projectResource.delete({ where: { id: req.params.id } });
    return res.json({ message: "Deleted" });
  } catch (error) { next(errorHandler(500, error)); }
};

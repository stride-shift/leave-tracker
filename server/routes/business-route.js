import express from "express";
import { verifyToken } from "../util/auth-middleware.js";
import {
  getDashboardStats,
  listProjects,
  createProject,
  updateProject,
  importProjects,
  getProject,
  addActivity,
  addResource,
  deleteResource,
  listOrganizations,
  createOrganization,
  updateOrganization,
} from "../controller/business-controller.js";
import { analyzePortfolio, analyzeProject } from "../controller/ai-controller.js";
import multer from "multer";
import path from "path";

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } }); // 20MB

const router = express.Router();

router.get("/dashboard-stats", verifyToken, getDashboardStats);
router.get("/projects", verifyToken, listProjects);
router.post("/projects", verifyToken, createProject);
router.post("/projects/import", verifyToken, importProjects);
router.get("/projects/:id", verifyToken, getProject);
router.patch("/projects/:id", verifyToken, updateProject);
router.delete("/projects/:id", verifyToken, async (req, res, next) => {
  try {
    const { prisma } = await import("../util/db.js");
    const { id } = req.params;
    await prisma.projectActivity.deleteMany({ where: { projectId: id } });
    await prisma.projectResource.deleteMany({ where: { projectId: id } });
    await prisma.project.delete({ where: { id } });
    return res.json({ message: "Project deleted" });
  } catch (error) { next(error); }
});
router.post("/projects/:id/activities", verifyToken, addActivity);
router.post("/projects/:id/resources", verifyToken, addResource);
router.delete("/resources/:id", verifyToken, deleteResource);
router.post("/ai/analyze", verifyToken, analyzePortfolio);
router.post("/ai/analyze-project/:id", verifyToken, analyzeProject);
router.post("/projects/:id/upload", verifyToken, upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const { prisma } = await import("../util/db.js");
    const ext = path.extname(req.file.originalname).toLowerCase();
    const typeMap = { ".pdf": "document", ".doc": "document", ".docx": "document", ".xls": "spreadsheet", ".xlsx": "spreadsheet", ".csv": "spreadsheet", ".ppt": "presentation", ".pptx": "presentation", ".html": "document", ".htm": "document" };
    const resource = await prisma.projectResource.create({
      data: {
        name: req.file.originalname,
        url: `/uploads/${req.file.filename}`,
        type: typeMap[ext] || "document",
        projectId: req.params.id,
        uploadedById: req.user?.id || null,
      },
      include: { uploadedBy: { select: { id: true, fullName: true } } },
    });
    return res.status(201).json({ resource });
  } catch (error) { next(error); }
});
router.get("/organizations", verifyToken, listOrganizations);
router.post("/organizations", verifyToken, createOrganization);
router.patch("/organizations/:id", verifyToken, updateOrganization);

export default router;

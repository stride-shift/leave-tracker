import express from "express";
import { verifyToken, requireRole } from "../util/auth-middleware.js";
import {
  addLeaveType,
  addMemberToManager,
  addNewUser,
  addUserLeaveType,
  assignManagers,
  assignRoles,
  createProjects,
  deleteLeaveType,
  deleteProject,
  deleteUserLeaveType,
  fetchLeaveTypeById,
  fetchUsers,
  getUserDetail,
  listALlProjects,
  listAllUsers,
  listLeaveType,
  listProject,
  updateGroup,
  updateLeaveType,
  updateUserLeaveType,
  backfillLeaveTypes,
  updateContract,
  getOrgDetails,
  updateOrg,
  updateMemberRole,
  removeMember,
} from "../controller/admin-controller.js";

const router = express.Router();

router.get("/list-all", verifyToken, listAllUsers);

router.post(
  "/managers/:id/members",
  verifyToken,

  addMemberToManager
);
router.post(
  "/assign-manager/:id",
  verifyToken,

  assignManagers
);
router.get(
  "/manager/:id/list-users",
  verifyToken,

  fetchUsers
);
router.post(
  "/create-project",
  verifyToken,

  createProjects
);
router.patch("/delete-project/:id", verifyToken, deleteProject);
router.post("/add-new-user", verifyToken, addNewUser);

router.get(
  "/list-all-project",
  verifyToken,

  listALlProjects
);
router.get(
  "/list-project/:id",
  verifyToken,

  listProject
);
router.patch(
  "/update-group/:id",
  verifyToken,

  updateGroup
);
router.post(
  "/add-leave-type",
  verifyToken,

  addLeaveType
);

router.get(
  "/list-leave-type",
  verifyToken,

  listLeaveType
);
router.get(
  "/list-leave-type/:id",
  verifyToken,

  fetchLeaveTypeById
);
router.patch(
  "/update-leave-type/:id",
  verifyToken,

  updateLeaveType
);
router.patch(
  "/delete-leave-type/:id",
  verifyToken,

  deleteLeaveType
);
router.get(
  "/get-user-detail/:id",
  verifyToken,

  getUserDetail
);
router.post(
  "/add-user-leavetype/:id",
  verifyToken,

  addUserLeaveType
);
router.patch(
  "/update-user-leavetype/:id",
  verifyToken,

  updateUserLeaveType
);
router.patch(
  "/delete-user-leavetype/:id",
  verifyToken,

  deleteUserLeaveType
);
router.patch(
  "/assignRoles/:id",
  verifyToken,

  assignRoles
);
router.patch("/update-contract/:id", verifyToken, updateContract);
router.post("/backfill-leave-types", verifyToken, backfillLeaveTypes);
router.get("/org-details", verifyToken, getOrgDetails);
router.get("/all-orgs", verifyToken, async (req, res) => {
  try {
    const { prisma } = await import("../util/db.js");
    if (req.user.role !== "SUPER_ADMIN") return res.status(403).json({ error: "Super Admin only" });
    const tenants = await prisma.tenant.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { users: true, projects: true } } },
    });
    return res.json({ tenants });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post("/create-org", verifyToken, async (req, res) => {
  try {
    const { prisma } = await import("../util/db.js");
    if (req.user.role !== "SUPER_ADMIN") return res.status(403).json({ error: "Super Admin only" });
    const { name, domain } = req.body;
    if (!name?.trim() || !domain?.trim()) return res.status(400).json({ error: "Name and domain required" });
    const existing = await prisma.tenant.findUnique({ where: { domain: domain.trim().toLowerCase() } });
    if (existing) return res.status(400).json({ error: "Organization with this domain already exists" });
    const tenant = await prisma.tenant.create({ data: { name: name.trim(), domain: domain.trim().toLowerCase() } });
    return res.status(201).json({ tenant, message: "Organization created" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.patch("/update-org", verifyToken, updateOrg);
router.patch("/update-member-role/:id", verifyToken, updateMemberRole);
router.delete("/remove-member/:id", verifyToken, removeMember);

export default router;

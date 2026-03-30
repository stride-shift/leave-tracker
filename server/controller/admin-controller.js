import { prisma } from "../util/db.js";
import errorHandler from "../util/error-handler.js";

export const listAllUsers = async (req, res, next) => {
  try {
    const where = req.tenantId ? { tenantId: req.tenantId } : {};
    const allUsers = await prisma.user.findMany({
      where,
      orderBy: { fullName: "asc" },
      include: {
        assignedTypes: {
          where: { leaveType: { isDeleted: false } },
          select: { leaveBalance: true },
        },
      },
    });

    return res.status(200).json({
      allUsers,
      message: "Success",
    });
  } catch (error) {
    next(errorHandler(500, error));
  }
};
export const assignManagers = async (req, res, next) => {
  try {
    const { choice } = req.query;
    const { id } = req.params;

    const switchRole = await prisma.$transaction([
      // delete every mapping where this user is the manager
      prisma.userManager.deleteMany({
        where: { managerId: id },
      }),

      // change the role
      prisma.user.update({
        where: { id },
        data: { role: choice === "TEAM_MEMBER" ? "MANAGER" : "TEAM_MEMBER" },
      }),
    ]);
    return res.status(200).json({
      switchRole,
      message: "Success",
    });
  } catch (error) {
    next(errorHandler(500, error));
  }
};

export const assignRoles = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { role, name } = req.body;

    const update = await prisma.user.update({
      where: { id },
      data: { role, fullName: name },
    });
    return res.status(200).json({
      update,
      message: "Success",
    });
  } catch (error) {
    next(errorHandler(500, error));
  }
};
export const addMemberToManager = async (req, res, next) => {
  try {
    const { users } = req.body;
    const exists = await prisma.userManager.findFirst({
      where: {
        managerId: req.params.id,
        memberId: { in: users ?? [] },
      },
    });

    if (exists) {
      throw new Error(
        `User ${exists.memberId} is already assigned to this manager.`
      );
    }

    const data = await prisma.userManager.createMany({
      data: users?.map((user) => ({
        managerId: req.params.id,
        memberId: user,
      })),
      skipDuplicates: true,
    });

    return res.status(200).json({
      data,
      message: "Success",
    });
  } catch (error) {
    next(errorHandler(500, error));
  }
};

export const fetchUsers = async (req, res, next) => {
  try {
    const allUsers = await prisma.user.findMany({
      where: {
        managedBy: {
          some: { managerId: req.params.id }, // managerId is the id of the manager you care about
        },
      },
      select: { id: true, email: true, fullName: true },
    });

    return res.status(200).json({
      allUsers,
      message: "Success",
    });
  } catch (error) {
    next(errorHandler(500, error));
  }
};
export const createProjects = async (req, res, next) => {
  try {
    const { projectName, groupName, managerId, userIds } = req.body;

    const data = await prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: { name: projectName },
      });

      const group = await tx.group.create({
        data: {
          name: groupName,
          projectId: project.id,
          managerId,
        },
      });
      await tx.user.update({
        where: { id: managerId },
        data: { role: "MANAGER" },
      });
      await tx.userGroup.createMany({
        data: userIds.map((userId) => ({ userId, groupId: group.id })),
        skipDuplicates: true,
      });
    });

    return res.status(200).json({
      data,
      message: "Success",
    });
  } catch (error) {
    next(errorHandler(500, error));
  }
};
export const deleteProject = async (req, res, next) => {
  try {
    const { id } = req.params;
    await prisma.$transaction(async (tx) => {
      await tx.userGroup.deleteMany({ where: { group: { projectId: id } } });
      await tx.group.deleteMany({ where: { projectId: id } });
      await tx.project.delete({ where: { id: id } });
    });

    return res.status(200).json({
      message: "Success",
    });
  } catch (error) {
    next(errorHandler(500, error));
  }
};

export const listALlProjects = async (req, res, next) => {
  try {
    const result = await prisma.group.findMany({
      select: {
        id: true,
        name: true,
        managerId: true,
        manager: { select: { fullName: true, email: true } },
        project: { select: { id: true, name: true } },
        members: { select: { userId: true } }, // UserGroup rows
      },
      orderBy: { createdAt: "asc" },
    });

    return res.status(200).json({
      result,
      message: "Success",
    });
  } catch (error) {
    next(errorHandler(500, error));
  }
};
export const listProject = async (req, res, next) => {
  try {
    const { id } = req.params;

    const group = await prisma.group.findUnique({
      where: { id }, // or { name: groupName }
      select: {
        id: true,
        name: true,
        description: true,
        isActive: true,
        managerId: true,
        manager: { select: { id: true, fullName: true, email: true } },
        project: { select: { id: true, name: true } },
        members: {
          select: {
            user: {
              select: {
                id: true,
                fullName: true,
                email: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });

    return res.status(200).json({
      group,
      message: "Success",
    });
  } catch (error) {
    next(errorHandler(500, error));
  }
};
export const updateGroup = async (req, res, next) => {
  try {
    const { groupId, newProjectName, newGroupName, newManagerId, userIds } =
      req.body;

    const group = await prisma.$transaction(async (tx) => {
      // 1. fetch the group so we know its current project
      const group = await tx.group.findUnique({ where: { id: groupId } });
      if (!group) throw new Error("Group not found");

      // 2. update the project name
      await tx.project.update({
        where: { id: group.projectId },
        data: { name: newProjectName },
      });
      const update = await tx.user.update({
        where: { id: newManagerId },
        data: { role: "MANAGER" },
      });

      // 3. update the group itself
      await tx.group.update({
        where: { id: groupId },
        data: {
          name: newGroupName,
          managerId: newManagerId,
        },
      });

      // 4. replace the member list with the new set
      await tx.userGroup.deleteMany({ where: { groupId } });
      if (userIds?.length) {
        await tx.userGroup.createMany({
          data: userIds?.map((userId) => ({ userId, groupId })),
        });
      }
    });

    return res.status(200).json({
      group,
      message: "Success",
    });
  } catch (error) {
    next(errorHandler(500, error));
  }
};

export const addLeaveType = async (req, res, next) => {
  try {
    const { name, status, description } = req.body;

    const newLeaveType = await prisma.leaveType.create({
      data: {
        name,
        description,
        isActive: status,
      },
    });

    // Auto-assign this leave type to all existing users with default 1.67 days
    if (status) {
      const allUsers = await prisma.user.findMany({ select: { id: true } });
      if (allUsers.length > 0) {
        await prisma.userLeaveType.createMany({
          data: allUsers.map((u) => ({
            userId: u.id,
            leaveTypeId: newLeaveType.id,
            leaveBalance: 1.67,
            accrualRate: 1.67,
            isActive: true,
          })),
          skipDuplicates: true,
        });
      }
    }

    return res.status(201).json({
      newLeaveType,
      message: "Success",
    });
  } catch (error) {
    next(errorHandler(500, error));
  }
};
export const listLeaveType = async (req, res, next) => {
  try {
    const leaveTypes = await prisma.leaveType.findMany({
      orderBy: { name: "asc" },
      where: {
        isDeleted: false,
      },
    });

    return res.status(200).json({
      leaveTypes,
      message: "Success",
    });
  } catch (error) {
    next(errorHandler(500, error));
  }
};

export const updateLeaveType = async (req, res, next) => {
  try {
    const { payload } = req.body;
    const { id } = req.params;

    const updated = await prisma.$transaction(async (tx) => {
      // 1. update the master LeaveType
      await tx.leaveType.update({ where: { id }, data: payload });

      if (payload.isActive !== undefined) {
        await tx.userLeaveType.updateMany({
          where: { leaveTypeId: id },
          data: { isActive: payload.isActive },
        });
      }
    });
    // const updated = await prisma.leaveType.update({
    //   where: { id },
    //   data: payload,
    // });

    return res.status(200).json({
      updated,
      message: "Success",
    });
  } catch (error) {
    next(errorHandler(500, error));
  }
};
export const deleteLeaveType = async (req, res, next) => {
  try {
    const { id } = req.params;
    const deleted = await prisma.leaveType.update({
      where: { id },
      data: { isDeleted: true, isActive: false }, // hide everywhere
    });

    return res.status(200).json({
      deleted,
      message: "Success",
    });
  } catch (error) {
    next(errorHandler(500, error));
  }
};
export const fetchLeaveTypeById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const leaveType = await prisma.leaveType.findUnique({
      where: { id: id }, // or where: { name: leaveTypeName }
    });

    return res.status(200).json({
      leaveType,
      message: "Success",
    });
  } catch (error) {
    next(errorHandler(500, error));
  }
};
export const getUserDetail = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userData = await prisma.user.findUnique({
      where: { id: id },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        avatarUrl: true,
        createdAt: true,
        updatedAt: true,
        contractStartDate: true,
        contractEndDate: true,
        assignedTypes: {
          where: {
            leaveType: { isDeleted: false }, // ← filter out soft-deleted types
          },
          select: {
            leaveBalance: true,
            isActive: true,
            accrualRate: true,
            cycleStartDate: true,
            leaveType: {
              select: {
                id: true,
                name: true,
                description: true,
                isActive: true,
                isDeleted: true,
              },
            },
          },
        },
      },
    });

    return res.status(200).json({
      userData,
      message: "Success",
    });
  } catch (error) {
    next(errorHandler(500, error));
  }
};

export const addUserLeaveType = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { leaveTypeId, leaveBalance, isActive, accrualRate } = req.body;
    const type = await prisma.leaveType.findUnique({
      where: { id: leaveTypeId },
      select: { isActive: true },
    });

    if (!type || !type.isActive) {
      throw new Error("This Leave type is inactive for everyone");
    }

    const userLeaveType = await prisma.userLeaveType.create({
      data: {
        userId: id,
        leaveTypeId: leaveTypeId,
        leaveBalance: leaveBalance,
        isActive,
        accrualRate: accrualRate ?? 1.67,
        cycleStartDate: new Date(),
      },
    });

    return res.status(200).json({
      userLeaveType,
      message: "Success",
    });
  } catch (error) {
    next(errorHandler(500, error));
  }
};
export const updateUserLeaveType = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { leaveTypeId, leaveBalance, isActive, accrualRate } = req.body;

    const updateData = {};

    if (leaveBalance !== undefined) {
      updateData.leaveBalance = leaveBalance;
    }

    if (isActive !== undefined) {
      updateData.isActive = isActive;
    }

    if (accrualRate !== undefined) {
      updateData.accrualRate = accrualRate;
    }
    const type = await prisma.leaveType.findUnique({
      where: { id: leaveTypeId },
      select: { isActive: true },
    });

    if (!type || !type.isActive) {
      throw new Error("This Leave type is inactive for everyone");
    }

    const updatedUserLeaveType = await prisma.userLeaveType.update({
      where: {
        userId_leaveTypeId: {
          userId: id, // target user
          leaveTypeId: leaveTypeId, // target leave type
        },
      },
      data: updateData,
    });

    return res.status(200).json({
      updatedUserLeaveType,
      message: "Success",
    });
  } catch (error) {
    next(errorHandler(500, error));
  }
};

export const deleteUserLeaveType = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { leaveTypeId } = req.body;

    const deleted = await prisma.userLeaveType.delete({
      where: {
        userId_leaveTypeId: {
          userId: id,
          leaveTypeId: leaveTypeId,
        },
      },
    });

    return res.status(200).json({
      deleted,
      message: "Success",
    });
  } catch (error) {
    next(errorHandler(500, error));
  }
};
export const addNewUser = async (req, res, next) => {
  try {
    const { email, fullName, password, role } = req.body;
    const tenantId = req.tenantId;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(400).json({ error: "A user with this email already exists" });

    const newUser = await prisma.user.create({
      data: {
        email,
        fullName,
        password: password || null,
        role: role || "TEAM_MEMBER",
        avatarUrl: null,
        tenantId,
      },
    });

    // Auto-assign all active leave types for this tenant
    const activeLeaveTypes = await prisma.leaveType.findMany({
      where: { isActive: true, isDeleted: false, ...(tenantId ? { tenantId } : {}) },
      select: { id: true },
    });
    if (activeLeaveTypes.length > 0) {
      await prisma.userLeaveType.createMany({
        data: activeLeaveTypes.map((lt) => ({
          userId: newUser.id,
          leaveTypeId: lt.id,
          leaveBalance: 1.67,
          accrualRate: 1.67,
          isActive: true,
        })),
        skipDuplicates: true,
      });
    }

    return res.status(201).json({ newUser, message: "User added to organization" });
  } catch (error) {
    next(errorHandler(500, error));
  }
};

// GET /users/org-details — get current org info + members
export const getOrgDetails = async (req, res, next) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(400).json({ error: "No organization found" });

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    const members = await prisma.user.findMany({
      where: { tenantId },
      select: { id: true, email: true, fullName: true, role: true, avatarUrl: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    const stats = {
      total: members.length,
      admins: members.filter(m => m.role === "ADMIN").length,
      managers: members.filter(m => m.role === "MANAGER").length,
      members: members.filter(m => m.role === "TEAM_MEMBER").length,
    };

    return res.json({ tenant, members, stats });
  } catch (error) { next(errorHandler(500, error)); }
};

// PATCH /users/update-org — update org name/logo
export const updateOrg = async (req, res, next) => {
  try {
    const tenantId = req.tenantId;
    const { name, logo } = req.body;
    const tenant = await prisma.tenant.update({
      where: { id: tenantId },
      data: { ...(name && { name }), ...(logo && { logo }) },
    });
    return res.json({ tenant, message: "Organization updated" });
  } catch (error) { next(errorHandler(500, error)); }
};

// PATCH /users/update-member-role/:id — change a member's role
export const updateMemberRole = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    if (!["ADMIN", "MANAGER", "TEAM_MEMBER"].includes(role)) return res.status(400).json({ error: "Invalid role" });
    const user = await prisma.user.update({ where: { id }, data: { role } });
    return res.json({ user, message: "Role updated" });
  } catch (error) { next(errorHandler(500, error)); }
};

// DELETE /users/remove-member/:id — remove from org
export const removeMember = async (req, res, next) => {
  try {
    const { id } = req.params;
    // Don't delete — just unassign from tenant
    await prisma.user.update({ where: { id }, data: { tenantId: null } });
    return res.json({ message: "Member removed from organization" });
  } catch (error) { next(errorHandler(500, error)); }
};

// PATCH /users/update-contract/:id — update contract dates and recalculate leave
export const updateContract = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { contractStartDate, contractEndDate } = req.body;

    const user = await prisma.user.update({
      where: { id },
      data: {
        contractStartDate: contractStartDate ? new Date(contractStartDate) : null,
        contractEndDate: contractEndDate ? new Date(contractEndDate) : null,
      },
    });

    // Recalculate leave balances based on months worked
    if (contractStartDate) {
      const start = new Date(contractStartDate);
      const end = contractEndDate ? new Date(contractEndDate) : new Date();
      const now = new Date();
      const effectiveEnd = end < now ? end : now;

      // Calculate full months between start and effective end
      const months =
        (effectiveEnd.getFullYear() - start.getFullYear()) * 12 +
        (effectiveEnd.getMonth() - start.getMonth());
      const fullMonths = Math.max(0, months);

      // Update each leave type's balance = months × accrualRate
      const userLeaveTypes = await prisma.userLeaveType.findMany({
        where: { userId: id, isActive: true },
      });

      for (const ult of userLeaveTypes) {
        const accumulated = parseFloat((fullMonths * ult.accrualRate).toFixed(2));
        await prisma.userLeaveType.update({
          where: {
            userId_leaveTypeId: {
              userId: id,
              leaveTypeId: ult.leaveTypeId,
            },
          },
          data: { leaveBalance: accumulated },
        });
      }
    }

    return res.json({ message: "Success", user });
  } catch (error) {
    next(errorHandler(500, error));
  }
};

// POST /users/backfill-leave-types — assign all active leave types to users who are missing them
export const backfillLeaveTypes = async (req, res, next) => {
  try {
    const allUsers = await prisma.user.findMany({ select: { id: true } });
    const activeLeaveTypes = await prisma.leaveType.findMany({
      where: { isActive: true, isDeleted: false },
      select: { id: true },
    });

    if (!activeLeaveTypes.length) {
      return res.json({ message: "No active leave types to assign", assigned: 0 });
    }

    const data = [];
    for (const user of allUsers) {
      for (const lt of activeLeaveTypes) {
        data.push({
          userId: user.id,
          leaveTypeId: lt.id,
          leaveBalance: 1.67,
          accrualRate: 1.67,
          isActive: true,
        });
      }
    }

    const result = await prisma.userLeaveType.createMany({
      data,
      skipDuplicates: true,
    });

    return res.json({ message: "Success", assigned: result.count });
  } catch (error) {
    next(errorHandler(500, error));
  }
};

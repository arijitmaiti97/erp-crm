const express = require('express');
const router = express.Router();
const {
    getProjects,
    getProject,
    createProject,
    updateProject,
    getProjectTeam,
    assignTeamMember,
    removeTeamMember,
    getProjectManagers,
    assignProjectManager,
    removeProjectManager
} = require('../controllers/projects.controller');
const {
    getProjectPayments,
    createPaymentPhase
} = require('../controllers/payments.controller');
const { protect } = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');

// All routes require authentication
router.use(protect);

// Get all projects (role-filtered automatically)
router.get('/', getProjects);

// Get single project
router.get('/:id', getProject);

// Create project (Management only)
router.post('/', checkPermission('create_project'), createProject);

// Update project (Management only)
router.put('/:id', checkPermission('edit_project'), updateProject);

// Get project team
router.get('/:id/team', getProjectTeam);

// Assign team member (Management only)
router.post('/:id/team', checkPermission('assign_team'), assignTeamMember);

// Remove team member (Management only)
router.delete('/:id/team/:memberId', checkPermission('assign_team'), removeTeamMember);

// Get project payment phases
router.get('/:projectId/payments', getProjectPayments);

// Create payment phase (Management only)
router.post('/:projectId/payments', checkPermission('create_project'), createPaymentPhase);

// Project Manager Assignment Routes
// Get project managers (Super admin or assigned managers can view)
router.get('/:id/managers', getProjectManagers);

// Assign manager to project (Super admin only)
router.post('/:id/managers', checkPermission('assign_project_managers'), assignProjectManager);

// Remove manager from project (Super admin only)
router.delete('/:id/managers/:managerId', checkPermission('assign_project_managers'), removeProjectManager);

module.exports = router;

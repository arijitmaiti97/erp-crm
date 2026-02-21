const express = require('express');
const router = express.Router();
const {
  getTeamMembers,
  getUserDetails,
  createTeamMember,
  updateTeamMember,
  assignRole,
  removeRole,
  resetUserPassword,
  getRoles
} = require('../controllers/team.controller');
const { protect } = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');

// All routes require authentication
router.use(protect);

// Get all roles (for dropdowns)
router.get('/roles', getRoles);

// Get all team members
router.get('/', checkPermission('manage_users'), getTeamMembers);

// Get single user details
router.get('/:id', checkPermission('manage_users'), getUserDetails);

// Create new team member
router.post('/', checkPermission('manage_users'), createTeamMember);

// Update team member
router.put('/:id', checkPermission('manage_users'), updateTeamMember);

// Assign role to user
router.post('/:id/roles', checkPermission('manage_users'), assignRole);

// Remove role from user
router.delete('/:id/roles/:roleName', checkPermission('manage_users'), removeRole);

// Reset user password
router.post('/:id/reset-password', checkPermission('manage_users'), resetUserPassword);

module.exports = router;

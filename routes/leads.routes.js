const express = require('express');
const router = express.Router();
const {
  getLeads,
  getLeadById,
  getLeadStats,
  createLead,
  updateLead,
  deleteLead,
  convertToClient,
  assignLead,
  addActivity,
  addNote,
  getLeadSources
} = require('../controllers/leads.controller');
const { protect } = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');

// All routes require authentication
router.use(protect);

// Lead sources (no special permission needed for viewing)
router.get('/sources', getLeadSources);

// Lead statistics
router.get('/stats', getLeadStats);

// Get all leads (filtered by role)
router.get('/', getLeads);

// Get single lead by ID
router.get('/:id', getLeadById);

// Create new lead
router.post('/', checkPermission('create_lead'), createLead);

// Update lead
router.put('/:id', checkPermission('edit_lead'), updateLead);

// Delete lead
router.delete('/:id', checkPermission('delete_lead'), deleteLead);

// Convert lead to client
router.post('/:id/convert', checkPermission('convert_lead'), convertToClient);

// Assign lead to user
router.post('/:id/assign', checkPermission('assign_lead'), assignLead);

// Add activity
router.post('/:id/activities', addActivity);

//Add note
router.post('/:id/notes', addNote);

module.exports = router;

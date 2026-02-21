const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  getTimesheets,
  getTimesheetStats,
  createTimesheet,
  updateTimesheet,
  deleteTimesheet
} = require('../controllers/timesheets.controller');

// All routes require authentication
router.use(protect);

// GET /api/timesheets - Get all timesheet entries (filtered by role)
router.get('/', getTimesheets);

// GET /api/timesheets/stats - Get timesheet statistics
router.get('/stats', getTimesheetStats);

// POST /api/timesheets - Create new timesheet entry
router.post('/', createTimesheet);

// PUT /api/timesheets/:id - Update timesheet entry
router.put('/:id', updateTimesheet);

// DELETE /api/timesheets/:id - Delete timesheet entry
router.delete('/:id', deleteTimesheet);

module.exports = router;

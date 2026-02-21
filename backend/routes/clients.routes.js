const express = require('express');
const router = express.Router();
const {
  getAllClients,
  getClientById,
  createClient,
  updateClient,
  deleteClient,
  getClientStats
} = require('../controllers/clients.controller');
const { protect } = require('../middleware/auth');

// All routes require authentication
router.use(protect);

/**
 * @route   GET /api/clients/stats
 * @desc    Get client statistics
 * @access  Private
 */
router.get('/stats', getClientStats);

/**
 * @route   GET /api/clients
 * @desc    Get all clients with filters
 * @access  Private
 */
router.get('/', getAllClients);

/**
 * @route   GET /api/clients/:id
 * @desc    Get single client details
 * @access  Private
 */
router.get('/:id', getClientById);

/**
 * @route   POST /api/clients
 * @desc    Create new client
 * @access  Private (Sales, Management, Admin)
 */
router.post('/', createClient);

/**
 * @route   PUT /api/clients/:id
 * @desc    Update existing client
 * @access  Private (Sales, Management, Admin)
 */
router.put('/:id', updateClient);

/**
 * @route   DELETE /api/clients/:id
 * @desc    Delete client
 * @access  Private (Admin only)
 */
router.delete('/:id', deleteClient);

module.exports = router;

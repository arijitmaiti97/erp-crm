const express = require('express');
const router = express.Router();
const {
    getPendingPayments,
    updatePaymentPhase,
    deletePaymentPhase,
    getPaymentStats
} = require('../controllers/payments.controller');

const { protect } = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');

// Statistics - for accountants and management
router.get('/stats', protect, checkPermission('view_all_payments'), getPaymentStats);

// Pending payments - for accountants
router.get('/pending', protect, checkPermission('view_all_payments'), getPendingPayments);

// Update payment (mark as paid) - accountant can verify payments
router.put('/:id', protect, checkPermission('verify_payments'), updatePaymentPhase);

// Delete payment phase - management only
router.delete('/:id', protect, checkPermission('edit_project'), deletePaymentPhase);

module.exports = router;

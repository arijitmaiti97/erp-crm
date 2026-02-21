const express = require('express');
const router = express.Router();
const { login, getMe, logout, changePassword, getUsers } = require('../controllers/auth.controller');
const { protect } = require('../middleware/auth');

// Public routes
router.post('/login', login);

// Protected routes
router.get('/me', protect, getMe);
router.get('/users', protect, getUsers);
router.post('/logout', protect, logout);
router.post('/change-password', protect, changePassword);

module.exports = router;

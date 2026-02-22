const express = require('express');
const router = express.Router();
const {
  getTasks,
  getTaskById,
  getTaskStats,
  createTask,
  updateTask,
  deleteTask,
  addTaskComment,
  getMyTasks,
  acceptTask,
  rejectTask,
  pauseTask,
  resumeTask
} = require('../controllers/tasks.controller');
const { protect } = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');

// Task routes
router.get('/stats', protect, getTaskStats);
router.get('/my-tasks', protect, getMyTasks);
router.get('/', protect, getTasks);
router.get('/:id', protect, getTaskById);
router.post('/', protect, checkPermission('create_task'), createTask);
router.put('/:id', protect, checkPermission('edit_task'), updateTask);
router.delete('/:id', protect, checkPermission('delete_task'), deleteTask);

// Task comments
router.post('/:id/comments', protect, checkPermission('comment_task'), addTaskComment);

// Task acceptance workflow
router.post('/:id/accept', protect, acceptTask);
router.post('/:id/reject', protect, rejectTask);

// Task time tracking
router.post('/:id/pause', protect, pauseTask);
router.post('/:id/resume', protect, resumeTask);

module.exports = router;

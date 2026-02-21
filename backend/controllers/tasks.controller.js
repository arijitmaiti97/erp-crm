const { pool } = require('../config/database');
const { successResponse, errorResponse } = require('../utils/response.utils');

// @desc    Get all tasks with filters (project-based access control)
// @route   GET /api/tasks
// @access  Private
const getTasks = async (req, res) => {
  try {
    const { status, priority, assigned_to, project_id, search } = req.query;
    const userId = req.user.id;
    const userRole = req.user.role;
    const permissions = req.user.permissions || [];

    let query = `
      SELECT 
        t.*,
        u1.full_name as assigned_to_name,
        u1.email as assigned_to_email,
        u2.full_name as assigned_by_name,
        p.project_name,
        (SELECT COUNT(*) FROM task_comments tc WHERE tc.task_id = t.id) as comment_count
      FROM tasks t
      LEFT JOIN users u1 ON t.assigned_to = u1.id
      LEFT JOIN users u2 ON t.assigned_by = u2.id
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE 1=1
    `;

    const params = [];

    // Project-based access control
    const canViewAll = permissions.includes('view_all_projects');

    if (canViewAll) {
      // Super admin or management with full access - see all tasks
      // No additional filtering needed
    } else if (userRole === 'management') {
      // Management without view_all_projects - only see tasks for assigned projects
      query += ` AND t.project_id IN (
        SELECT project_id FROM project_managers 
        WHERE manager_id = ? AND is_active = 1
      )`;
      params.push(userId);
    } else {
      // Other roles: can only see their own tasks
      query += ` AND (t.assigned_to = ? OR t.assigned_by = ?)`;
      params.push(userId, userId);
    }

    // Apply filters
    if (status) {
      query += ` AND t.status = ?`;
      params.push(status);
    }

    if (priority) {
      query += ` AND t.priority = ?`;
      params.push(priority);
    }

    if (assigned_to) {
      query += ` AND t.assigned_to = ?`;
      params.push(assigned_to);
    }

    if (project_id) {
      query += ` AND t.project_id = ?`;
      params.push(project_id);
    }

    if (search) {
      query += ` AND (t.title LIKE ? OR t.description LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ` ORDER BY 
      CASE t.priority 
        WHEN 'Urgent' THEN 1
        WHEN 'High' THEN 2
        WHEN 'Medium' THEN 3
        WHEN 'Low' THEN 4
      END,
      t.due_date ASC,
      t.created_at DESC
    `;

    const [tasks] = await pool.query(query, params);

    return successResponse(res, { tasks }, 'Tasks retrieved successfully');

  } catch (error) {
    console.error('Get tasks error:', error);
    return errorResponse(res, 'Failed to retrieve tasks', 500);
  }
};

// @desc    Get task by ID with details
// @route   GET /api/tasks/:id
// @access  Private
const getTaskById = async (req, res) => {
  try {
    const { id } = req.params;

    const [tasks] = await pool.query(`
      SELECT 
        t.*,
        u1.full_name as assigned_to_name,
        u1.email as assigned_to_email,
        u1.phone as assigned_to_phone,
        u2.full_name as assigned_by_name,
        u2.email as assigned_by_email,
        p.project_name,
        p.id as project_id,
        c.company_name as client_company
      FROM tasks t
      LEFT JOIN users u1 ON t.assigned_to = u1.id
      LEFT JOIN users u2 ON t.assigned_by = u2.id
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN clients c ON p.client_id = c.id
      WHERE t.id = ?
    `, [id]);

    if (tasks.length === 0) {
      return errorResponse(res, 'Task not found', 404);
    }

    // Get task comments
    const [comments] = await pool.query(`
      SELECT 
        tc.*,
        u.full_name as user_name,
        u.email as user_email
      FROM task_comments tc
      JOIN users u ON tc.user_id = u.id
      WHERE tc.task_id = ?
      ORDER BY tc.created_at DESC
    `, [id]);

    const task = {
      ...tasks[0],
      comments
    };

    return successResponse(res, { task }, 'Task retrieved successfully');

  } catch (error) {
    console.error('Get task by ID error:', error);
    return errorResponse(res, 'Failed to retrieve task', 500);
  }
};

// @desc    Get task statistics
// @route   GET /api/tasks/stats
// @access  Private
const getTaskStats = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;
    const permissions = req.user.permissions || [];

    let whereClause = '1=1';
    const params = [];

    // Project-based access control
    const canViewAll = permissions.includes('view_all_projects');

    if (canViewAll) {
      // Super admin or management with full access - see all tasks
      whereClause = '1=1';
    } else if (userRole === 'management') {
      // Management without view_all_projects - only see tasks for assigned projects
      whereClause = `project_id IN (
        SELECT project_id FROM project_managers 
        WHERE manager_id = ? AND is_active = 1
      )`;
      params.push(userId);
    } else {
      // Other roles: can only see their own tasks
      whereClause = '(assigned_to = ? OR assigned_by = ?)';
      params.push(userId, userId);
    }

    // Overall stats
    const [stats] = await pool.query(`
      SELECT 
        COUNT(*) as total_tasks,
        SUM(CASE WHEN status = 'To Do' THEN 1 ELSE 0 END) as todo_count,
        SUM(CASE WHEN status = 'In Progress' THEN 1 ELSE 0 END) as in_progress_count,
        SUM(CASE WHEN status = 'In Review' THEN 1 ELSE 0 END) as in_review_count,
        SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) as completed_count,
        SUM(CASE WHEN status = 'Cancelled' THEN 1 ELSE 0 END) as cancelled_count,
        SUM(CASE WHEN priority = 'Urgent' THEN 1 ELSE 0 END) as urgent_count,
        SUM(CASE WHEN priority = 'High' THEN 1 ELSE 0 END) as high_priority_count,
        SUM(CASE WHEN due_date < CURDATE() AND status NOT IN ('Completed', 'Cancelled') THEN 1 ELSE 0 END) as overdue_count,
        SUM(CASE WHEN due_date = CURDATE() AND status NOT IN ('Completed', 'Cancelled') THEN 1 ELSE 0 END) as due_today_count
      FROM tasks
      WHERE ${whereClause}
    `, params);

    // Task distribution by user
    const [userDistribution] = await pool.query(`
      SELECT 
        u.full_name,
        u.email,
        COUNT(t.id) as task_count,
        SUM(CASE WHEN t.status = 'Completed' THEN 1 ELSE 0 END) as completed_count,
        SUM(CASE WHEN t.status IN ('To Do', 'In Progress', 'In Review') THEN 1 ELSE 0 END) as pending_count
      FROM users u
      LEFT JOIN tasks t ON u.id = t.assigned_to AND ${whereClause}
      ${params.length > 0 ? 'WHERE ' + whereClause : ''}
      GROUP BY u.id, u.full_name, u.email
      HAVING task_count > 0
      ORDER BY pending_count DESC, task_count DESC
      LIMIT 10
    `, params.length > 0 ? [...params, ...params] : []);

    return successResponse(res, {
      overview: stats[0],
      user_distribution: userDistribution
    }, 'Task statistics retrieved successfully');

  } catch (error) {
    console.error('Get task stats error:', error);
    return errorResponse(res, 'Failed to retrieve task statistics', 500);
  }
};

// @desc    Create new task
// @route   POST /api/tasks
// @access  Private
const createTask = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const {
      title,
      description,
      project_id,
      assigned_to,
      priority,
      status,
      due_date
    } = req.body;

    const assigned_by = req.user.id;

    // Validation
    if (!title || !title.trim()) {
      await connection.rollback();
      return errorResponse(res, 'Task title is required', 400);
    }

    // Insert task
    const [result] = await connection.query(`
      INSERT INTO tasks (
        title, description, project_id, assigned_to, assigned_by, 
        priority, status, due_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      title.trim(),
      description || null,
      project_id || null,
      assigned_to || null,
      assigned_by,
      priority || 'Medium',
      status || 'To Do',
      due_date || null
    ]);

    const taskId = result.insertId;

    // Log activity
    await connection.query(`
      INSERT INTO activity_logs (user_id, action, entity_type, entity_id, description)
      VALUES (?, 'created', 'task', ?, ?)
    `, [assigned_by, taskId, `Created task: ${title.trim()}`]);

    // Get the created task with details
    const [tasks] = await connection.query(`
      SELECT 
        t.*,
        u1.full_name as assigned_to_name,
        u2.full_name as assigned_by_name,
        p.project_name
      FROM tasks t
      LEFT JOIN users u1 ON t.assigned_to = u1.id
      LEFT JOIN users u2 ON t.assigned_by = u2.id
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE t.id = ?
    `, [taskId]);

    await connection.commit();

    return successResponse(res, { task: tasks[0] }, 'Task created successfully', 201);

  } catch (error) {
    await connection.rollback();
    console.error('Create task error:', error);
    return errorResponse(res, 'Failed to create task', 500);
  } finally {
    connection.release();
  }
};

// @desc    Update task
// @route   PUT /api/tasks/:id
// @access  Private
const updateTask = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const {
      title,
      description,
      project_id,
      assigned_to,
      priority,
      status,
      due_date
    } = req.body;

    // Check if task exists
    const [existingTask] = await connection.query('SELECT * FROM tasks WHERE id = ?', [id]);
    
    if (existingTask.length === 0) {
await connection.rollback();
      return errorResponse(res, 'Task not found', 404);
    }

    // Build update query dynamically
    const updates = [];
    const params = [];

    if (title !== undefined) {
      updates.push('title = ?');
      params.push(title.trim());
    }
    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description);
    }
    if (project_id !== undefined) {
      updates.push('project_id = ?');
      params.push(project_id);
    }
    if (assigned_to !== undefined) {
      updates.push('assigned_to = ?');
      params.push(assigned_to);
    }
    if (priority !== undefined) {
      updates.push('priority = ?');
      params.push(priority);
    }
    if (status !== undefined) {
      updates.push('status = ?');
      params.push(status);
      
      // If status is Completed, set completed_at and calculate duration
      if (status === 'Completed') {
        updates.push('completed_at = NOW()');
        
        // Calculate completed_duration if task was started
        if (existingTask[0].started_at) {
          const startedAt = new Date(existingTask[0].started_at);
          const completedAt = new Date();
          const totalSeconds = Math.floor((completedAt - startedAt) / 1000);
          const pausedSeconds = existingTask[0].total_paused_duration || 0;
          const workDuration = totalSeconds - pausedSeconds;
          
          updates.push('completed_duration = ?');
          params.push(workDuration > 0 ? workDuration : 0);
        }
      }
    }
    if (due_date !== undefined) {
      updates.push('due_date = ?');
      params.push(due_date);
    }

    if (updates.length === 0) {
      await connection.rollback();
      return errorResponse(res, 'No fields to update', 400);
    }

    params.push(id);

    await connection.query(
      `UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    // Log activity
    await connection.query(`
      INSERT INTO activity_logs (user_id, action, entity_type, entity_id, description)
      VALUES (?, 'updated', 'task', ?, ?)
    `, [req.user.id, id, `Updated task: ${title || existingTask[0].title}`]);

    // Get updated task
    const [tasks] = await connection.query(`
      SELECT 
        t.*,
        u1.full_name as assigned_to_name,
        u2.full_name as assigned_by_name,
        p.project_name
      FROM tasks t
      LEFT JOIN users u1 ON t.assigned_to = u1.id
      LEFT JOIN users u2 ON t.assigned_by = u2.id
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE t.id = ?
    `, [id]);

    await connection.commit();

    return successResponse(res, { task: tasks[0] }, 'Task updated successfully');

  } catch (error) {
    await connection.rollback();
    console.error('Update task error:', error);
    return errorResponse(res, 'Failed to update task', 500);
  } finally {
    connection.release();
  }
};

// @desc    Delete task
// @route   DELETE /api/tasks/:id
// @access  Private
const deleteTask = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const { id } = req.params;

    // Check if task exists
    const [task] = await connection.query('SELECT title FROM tasks WHERE id = ?', [id]);
    
    if (task.length === 0) {
      await connection.rollback();
      return errorResponse(res, 'Task not found', 404);
    }

    // Delete task (comments will be deleted by CASCADE)
    await connection.query('DELETE FROM tasks WHERE id = ?', [id]);

    // Log activity
    await connection.query(`
      INSERT INTO activity_logs (user_id, action, entity_type, entity_id, description)
      VALUES (?, 'deleted', 'task', ?, ?)
    `, [req.user.id, id, `Deleted task: ${task[0].title}`]);

    await connection.commit();

    return successResponse(res, null, 'Task deleted successfully');

  } catch (error) {
    await connection.rollback();
    console.error('Delete task error:', error);
    return errorResponse(res, 'Failed to delete task', 500);
  } finally {
    connection.release();
  }
};

// @desc    Add comment to task
// @route   POST /api/tasks/:id/comments
// @access  Private
const addTaskComment = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { comment } = req.body;
    const userId = req.user.id;

    if (!comment || !comment.trim()) {
      await connection.rollback();
      return errorResponse(res, 'Comment text is required', 400);
    }

    // Check if task exists
    const [task] = await connection.query('SELECT title FROM tasks WHERE id = ?', [id]);
    
    if (task.length === 0) {
      await connection.rollback();
      return errorResponse(res, 'Task not found', 404);
    }

    // Insert comment
    const [result] = await connection.query(`
      INSERT INTO task_comments (task_id, user_id, comment)
      VALUES (?, ?, ?)
    `, [id, userId, comment.trim()]);

    // Log activity
    await connection.query(`
      INSERT INTO activity_logs (user_id, action, entity_type, entity_id, description)
      VALUES (?, 'commented', 'task', ?, ?)
    `, [userId, id, `Added comment to task: ${task[0].title}`]);

    // Get the created comment with user details
    const [comments] = await connection.query(`
      SELECT 
        tc.*,
        u.full_name as user_name,
        u.email as user_email
      FROM task_comments tc
      JOIN users u ON tc.user_id = u.id
      WHERE tc.id = ?
    `, [result.insertId]);

    await connection.commit();

    return successResponse(res, { comment: comments[0] }, 'Comment added successfully', 201);

  } catch (error) {
    await connection.rollback();
    console.error('Add task comment error:', error);
    return errorResponse(res, 'Failed to add comment', 500);
  } finally {
    connection.release();
  }
};

// @desc    Get my tasks (assigned to me)
// @route   GET /api/tasks/my-tasks
// @access  Private
const getMyTasks = async (req, res) => {
  try {
    const userId = req.user.id;

    const [tasks] = await pool.query(`
      SELECT 
        t.*,
        u.full_name as assigned_by_name,
        p.project_name,
        (SELECT COUNT(*) FROM task_comments tc WHERE tc.task_id = t.id) as comment_count
      FROM tasks t
      LEFT JOIN users u ON t.assigned_by = u.id
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE t.assigned_to = ?
      ORDER BY 
        CASE t.priority 
          WHEN 'Urgent' THEN 1
          WHEN 'High' THEN 2
          WHEN 'Medium' THEN 3
          WHEN 'Low' THEN 4
        END,
        t.due_date ASC
    `, [userId]);

    return successResponse(res, { tasks }, 'My tasks retrieved successfully');

  } catch (error) {
    console.error('Get my tasks error:', error);
    return errorResponse(res, 'Failed to retrieve tasks', 500);
  }
};

// @desc    Accept a task
// @route   POST /api/tasks/:id/accept
// @access  Private (Assigned user only)
const acceptTask = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    const taskId = req.params.id;
    const userId = req.user.id;

    await connection.beginTransaction();

    // Get task details
    const [tasks] = await connection.query(
      'SELECT * FROM tasks WHERE id = ?',
      [taskId]
    );

    if (tasks.length === 0) {
      await connection.rollback();
      return errorResponse(res, 'Task not found', 404);
    }

    const task = tasks[0];

    // Check if user is assigned to this task
    if (task.assigned_to !== userId) {
      await connection.rollback();
      return errorResponse(res, 'You can only accept tasks assigned to you', 403);
    }

    // Check if task is already accepted
    if (task.accepted_at) {
      await connection.rollback();
      return errorResponse(res, 'Task has already been accepted', 400);
    }

    // Check if task was rejected
    if (task.rejected_at) {
      await connection.rollback();
      return errorResponse(res, 'Cannot accept a rejected task. Please contact the task creator.', 400);
    }

    // Accept the task and change status to 'In Progress', start the timer
    await connection.query(
      `UPDATE tasks 
       SET accepted_at = NOW(), 
           started_at = NOW(),
           status = 'In Progress'
       WHERE id = ?`,
      [taskId]
    );

    await connection.commit();

    return successResponse(res, null, 'Task accepted successfully. Timer started.');

  } catch (error) {
    await connection.rollback();
    console.error('Accept task error:', error);
    return errorResponse(res, 'Failed to accept task', 500);
  } finally {
    connection.release();
  }
};

// @desc    Reject a task
// @route   POST /api/tasks/:id/reject
// @access  Private (Assigned user only)
const rejectTask = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    const taskId = req.params.id;
    const userId = req.user.id;
    const { reason } = req.body;

    if (!reason || reason.trim().length === 0) {
      return errorResponse(res, 'Rejection reason is required', 400);
    }

    await connection.beginTransaction();

    // Get task details
    const [tasks] = await connection.query(
      'SELECT * FROM tasks WHERE id = ?',
      [taskId]
    );

    if (tasks.length === 0) {
      await connection.rollback();
      return errorResponse(res, 'Task not found', 404);
    }

    const task = tasks[0];

    // Check if user is assigned to this task
    if (task.assigned_to !== userId) {
      await connection.rollback();
      return errorResponse(res, 'You can only reject tasks assigned to you', 403);
    }

    // Check if task is already accepted
    if (task.accepted_at) {
      await connection.rollback();
      return errorResponse(res, 'Cannot reject an accepted task. Please contact the task creator.', 400);
    }

    // Check if task was already rejected
    if (task.rejected_at) {
      await connection.rollback();
      return errorResponse(res, 'Task has already been rejected', 400);
    }

    // Reject the task
    await connection.query(
      `UPDATE tasks 
       SET rejected_at = NOW(), 
           rejection_reason = ?,
           status = 'Cancelled'
       WHERE id = ?`,
      [reason.trim(), taskId]
    );

    await connection.commit();

    return successResponse(res, null, 'Task rejected successfully.');

  } catch (error) {
    await connection.rollback();
    console.error('Reject task error:', error);
    return errorResponse(res, 'Failed to reject task', 500);
  } finally {
    connection.release();
  }
};

// @desc    Pause a task (Pending/Blocked status)
// @route   POST /api/tasks/:id/pause
// @access  Private (Assigned user only)
const pauseTask = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    const taskId = req.params.id;
    const userId = req.user.id;
    const { reason } = req.body;

    if (!reason || reason.trim().length === 0) {
      return errorResponse(res, 'Pause reason is required', 400);
    }

    await connection.beginTransaction();

    // Get task details
    const [tasks] = await connection.query(
      'SELECT * FROM tasks WHERE id = ?',
      [taskId]
    );

    if (tasks.length === 0) {
      await connection.rollback();
      return errorResponse(res, 'Task not found', 404);
    }

    const task = tasks[0];

    // Check if user is assigned to this task
    if (task.assigned_to !== userId) {
      await connection.rollback();
      return errorResponse(res, 'You can only pause tasks assigned to you', 403);
    }

    // Check if task is accepted and in progress
    if (!task.accepted_at) {
      await connection.rollback();
      return errorResponse(res, 'Task must be accepted before it can be paused', 400);
    }

    if (task.status !== 'In Progress') {
      await connection.rollback();
      return errorResponse(res, 'Only tasks in progress can be paused', 400);
    }

    if (task.paused_at) {
      await connection.rollback();
      return errorResponse(res, 'Task is already paused', 400);
    }

    // Pause the task
    await connection.query(
      `UPDATE tasks 
       SET paused_at = NOW(), 
           pause_reason = ?,
           status = 'Blocked'
       WHERE id = ?`,
      [reason.trim(), taskId]
    );

    await connection.commit();

    return successResponse(res, null, 'Task paused successfully. Timer stopped.');

  } catch (error) {
    await connection.rollback();
    console.error('Pause task error:', error);
    return errorResponse(res, 'Failed to pause task', 500);
  } finally {
    connection.release();
  }
};

// @desc    Resume a paused task
// @route   POST /api/tasks/:id/resume
// @access  Private (Assigned user only)
const resumeTask = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    const taskId = req.params.id;
    const userId = req.user.id;

    await connection.beginTransaction();

    // Get task details
    const [tasks] = await connection.query(
      'SELECT * FROM tasks WHERE id = ?',
      [taskId]
    );

    if (tasks.length === 0) {
      await connection.rollback();
      return errorResponse(res, 'Task not found', 404);
    }

    const task = tasks[0];

    // Check if user is assigned to this task
    if (task.assigned_to !== userId) {
      await connection.rollback();
      return errorResponse(res, 'You can only resume tasks assigned to you', 403);
    }

    if (!task.paused_at) {
      await connection.rollback();
      return errorResponse(res, 'Task is not paused', 400);
    }

    // Calculate paused duration
    const pausedDuration = Math.floor((new Date() - new Date(task.paused_at)) / 1000);
    const newTotalPausedDuration = (task.total_paused_duration || 0) + pausedDuration;

    // Resume the task
    await connection.query(
      `UPDATE tasks 
       SET paused_at = NULL, 
           pause_reason = NULL,
           total_paused_duration = ?,
           status = 'In Progress'
       WHERE id = ?`,
      [newTotalPausedDuration, taskId]
    );

    await connection.commit();

    return successResponse(res, null, 'Task resumed successfully. Timer restarted.');

  } catch (error) {
    await connection.rollback();
    console.error('Resume task error:', error);
    return errorResponse(res, 'Failed to resume task', 500);
  } finally {
    connection.release();
  }
};

module.exports = {
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
};

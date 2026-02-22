const { pool } = require('../config/database');

// Get all timesheet entries (with filters)
const getTimesheets = async (req, res) => {
  try {
    const { user_id, date, start_date, end_date, project_id } = req.query;
    const currentUser = req.user;

    // Clients should not access timesheets
    if (currentUser.role === 'client') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Timesheets are not available for clients.'
      });
    }

    let query = `
      SELECT 
        t.*,
        u.full_name as user_name,
        u.email as user_email,
        p.project_name,
        tk.title as task_title
      FROM timesheets t
      LEFT JOIN users u ON t.user_id = u.id
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN tasks tk ON t.task_id = tk.id
      WHERE 1=1
    `;

    const params = [];

    // Filter by user (if not admin/manager, only show own entries)
    if (currentUser.role === 'developer' || currentUser.role === 'marketing') {
      query += ` AND t.user_id = ?`;
      params.push(currentUser.id);
    } else if (user_id) {
      query += ` AND t.user_id = ?`;
      params.push(user_id);
    }

    // Date filters
    if (date) {
      query += ` AND t.date = ?`;
      params.push(date);
    } else if (start_date && end_date) {
      query += ` AND t.date BETWEEN ? AND ?`;
      params.push(start_date, end_date);
    }

    if (project_id) {
      query += ` AND t.project_id = ?`;
      params.push(project_id);
    }

    query += ` ORDER BY t.date DESC, t.created_at DESC`;

    const [timesheets] = await pool.query(query, params);

    res.json({
      success: true,
      data: timesheets
    });

  } catch (error) {
    console.error('Get timesheets error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch timesheets',
      error: error.message
    });
  }
};

// Get timesheet statistics
const getTimesheetStats = async (req, res) => {
  try {
    const currentUser = req.user;
    const { start_date, end_date } = req.query;

    // Clients should not access timesheets
    if (currentUser.role === 'client') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Timesheets are not available for clients.'
      });
    }

    // Default to current week if no dates provided
    const startDate = start_date || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const endDate = end_date || new Date().toISOString().split('T')[0];

    let query = `
      SELECT 
        SUM(hours) as total_hours,
        COUNT(*) as total_entries,
        DATE(date) as entry_date
      FROM timesheets
      WHERE date BETWEEN ? AND ?
    `;

    const params = [startDate, endDate];

    // Filter by user role
    if (currentUser.role === 'developer' || currentUser.role === 'marketing') {
      query += ` AND user_id = ?`;
      params.push(currentUser.id);
    }

    query += ` GROUP BY DATE(date) ORDER BY entry_date DESC`;

    const [stats] = await pool.query(query, params);

    // Get total for the period
    const totalQuery = `
      SELECT SUM(hours) as total_hours
      FROM timesheets
      WHERE date BETWEEN ? AND ?
      ${(currentUser.role === 'developer' || currentUser.role === 'marketing') ? ' AND user_id = ?' : ''}
    `;

    const totalParams = (currentUser.role === 'developer' || currentUser.role === 'marketing') 
      ? [startDate, endDate, currentUser.id] 
      : [startDate, endDate];

    const [totalResult] = await pool.query(totalQuery, totalParams);

    res.json({
      success: true,
      data: {
        daily_stats: stats,
        total_hours: totalResult[0]?.total_hours || 0,
        start_date: startDate,
        end_date: endDate
      }
    });

  } catch (error) {
    console.error('Get timesheet stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch timesheet statistics',
      error: error.message
    });
  }
};

// Create timesheet entry
const createTimesheet = async (req, res) => {
  try {
    const { date, hours, description, project_id, task_id } = req.body;
    const user_id = req.user.id;

    // Clients should not create timesheets
    if (req.user.role === 'client') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Timesheets are not available for clients.'
      });
    }

    // Validation
    if (!date || !hours || hours <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Date and hours (greater than 0) are required'
      });
    }

    if (hours > 24) {
      return res.status(400).json({
        success: false,
        message: 'Hours cannot exceed 24 per day'
      });
    }

    // Check if entry already exists for this user and date
    const [existing] = await pool.query(
      `SELECT id FROM timesheets WHERE user_id = ? AND date = ? AND (project_id = ? OR (project_id IS NULL AND ? IS NULL))`,
      [user_id, date, project_id, project_id]
    );

    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Timesheet entry already exists for this date and project. Please update the existing entry.'
      });
    }

    const [result] = await pool.query(
      `INSERT INTO timesheets (user_id, date, hours, description, project_id, task_id) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [user_id, date, hours, description || null, project_id || null, task_id || null]
    );

    // Fetch the created entry with joined data
    const [newEntry] = await pool.query(
      `SELECT 
        t.*,
        u.full_name as user_name,
        p.project_name,
        tk.title as task_title
      FROM timesheets t
      LEFT JOIN users u ON t.user_id = u.id
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN tasks tk ON t.task_id = tk.id
      WHERE t.id = ?`,
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      message: 'Timesheet entry created successfully',
      data: newEntry[0]
    });

  } catch (error) {
    console.error('Create timesheet error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create timesheet entry',
      error: error.message
    });
  }
};

// Update timesheet entry
const updateTimesheet = async (req, res) => {
  try {
    const { id } = req.params;
    const { hours, description, project_id, task_id } = req.body;
    const user_id = req.user.id;

    // Clients should not update timesheets
    if (req.user.role === 'client') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Timesheets are not available for clients.'
      });
    }

    // Check if entry exists and belongs to user (or user is admin/manager)
    const [existing] = await pool.query(
      `SELECT * FROM timesheets WHERE id = ?`,
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Timesheet entry not found'
      });
    }

    // Only allow user to edit their own entries (unless admin/super_admin)
    if (existing[0].user_id !== user_id && !['super_admin', 'admin'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'You can only edit your own timesheet entries'
      });
    }

    if (hours && hours > 24) {
      return res.status(400).json({
        success: false,
        message: 'Hours cannot exceed 24 per day'
      });
    }

    await pool.query(
      `UPDATE timesheets 
       SET hours = ?, description = ?, project_id = ?, task_id = ?
       WHERE id = ?`,
      [hours || existing[0].hours, description || existing[0].description, 
       project_id !== undefined ? project_id : existing[0].project_id,
       task_id !== undefined ? task_id : existing[0].task_id,
       id]
    );

    // Fetch updated entry
    const [updated] = await pool.query(
      `SELECT 
        t.*,
        u.full_name as user_name,
        p.project_name,
        tk.title as task_title
      FROM timesheets t
      LEFT JOIN users u ON t.user_id = u.id
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN tasks tk ON t.task_id = tk.id
      WHERE t.id = ?`,
      [id]
    );

    res.json({
      success: true,
      message: 'Timesheet entry updated successfully',
      data: updated[0]
    });

  } catch (error) {
    console.error('Update timesheet error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update timesheet entry',
      error: error.message
    });
  }
};

// Delete timesheet entry
const deleteTimesheet = async (req, res) => {
  try {
    const { id } = req.params;
    const user_id = req.user.id;

    // Clients should not delete timesheets
    if (req.user.role === 'client') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Timesheets are not available for clients.'
      });
    }

    // Check if entry exists
    const [existing] = await pool.query(
      `SELECT * FROM timesheets WHERE id = ?`,
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Timesheet entry not found'
      });
    }

    // Only allow user to delete their own entries (unless admin/super_admin)
    if (existing[0].user_id !== user_id && !['super_admin', 'admin'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'You can only delete your own timesheet entries'
      });
    }

    await pool.query(`DELETE FROM timesheets WHERE id = ?`, [id]);

    res.json({
      success: true,
      message: 'Timesheet entry deleted successfully'
    });

  } catch (error) {
    console.error('Delete timesheet error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete timesheet entry',
      error: error.message
    });
  }
};

module.exports = {
  getTimesheets,
  getTimesheetStats,
  createTimesheet,
  updateTimesheet,
  deleteTimesheet
};

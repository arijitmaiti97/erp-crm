const { pool } = require('../config/database');
const { successResponse, errorResponse } = require('../utils/response.utils');

/**
 * @desc    Get all clients with optional filters
 * @route   GET /api/clients
 * @access  Private (Sales, Management, Admin)
 */
exports.getAllClients = async (req, res) => {
  try {
    const { search, industry, tier, sort = 'company_name' } = req.query;
    const userRoles = req.user.roles || [];

    let query = `
      SELECT 
        c.id,
        c.company_name,
        c.company_website,
        c.industry,
        c.company_size,
        c.billing_address,
        c.city,
        c.state,
        c.country,
        c.postal_code,
        c.gst_number,
        c.pan_number,
        c.client_tier,
        c.customer_since,
        c.created_at,
        u.email as contact_email,
        u.full_name as contact_name,
        u.phone as contact_phone,
        am.full_name as account_manager_name,
        COUNT(DISTINCT p.id) as total_projects,
        COUNT(DISTINCT CASE WHEN p.status = 'active' THEN p.id END) as active_projects,
        COALESCE(SUM(CASE WHEN pp.status = 'paid' THEN pp.phase_amount END), 0) as total_revenue,
        COALESCE(SUM(CASE WHEN pp.status = 'pending' THEN pp.phase_amount END), 0) as pending_revenue
      FROM clients c
      INNER JOIN users u ON c.user_id = u.id
      LEFT JOIN users am ON c.account_manager_id = am.id
      LEFT JOIN projects p ON c.id = p.client_id
      LEFT JOIN payment_phases pp ON p.id = pp.project_id
      WHERE 1=1
    `;
    const params = [];

    // Search filter
    if (search) {
      query += ` AND (c.company_name LIKE ? OR u.full_name LIKE ? OR u.email LIKE ?)`;
      const searchParam = `%${search}%`;
      params.push(searchParam, searchParam, searchParam);
    }

    // Industry filter
    if (industry) {
      query += ` AND c.industry = ?`;
      params.push(industry);
    }

    // Tier filter
    if (tier) {
      query += ` AND c.client_tier = ?`;
      params.push(tier);
    }

    // Group by client
    query += ` GROUP BY c.id`;

    // Sorting
    const validSortFields = ['company_name', 'customer_since', 'client_tier', 'total_revenue'];
    const sortField = validSortFields.includes(sort) ? sort : 'company_name';
    query += ` ORDER BY ${sortField} ASC`;

    const [clients] = await pool.query(query, params);

    // Get summary stats
    const [stats] = await pool.query(`
      SELECT 
        COUNT(*) as total_clients,
        COUNT(CASE WHEN client_tier = 'Platinum' THEN 1 END) as platinum_clients,
        COUNT(CASE WHEN client_tier = 'Gold' THEN 1 END) as gold_clients,
        COUNT(CASE WHEN client_tier = 'Silver' THEN 1 END) as silver_clients,
        COUNT(CASE WHEN client_tier = 'Bronze' THEN 1 END) as bronze_clients
      FROM clients
    `);

    return successResponse(res, {
      clients,
      stats: stats[0]
    }, 'Clients retrieved successfully');

  } catch (error) {
    console.error('Get all clients error:', error);
    return errorResponse(res, 'Failed to retrieve clients', 500);
  }
};

/**
 * @desc    Get single client by ID with full details
 * @route   GET /api/clients/:id
 * @access  Private
 */
exports.getClientById = async (req, res) => {
  try {
    const { id } = req.params;

    // Get client details
    const [clients] = await pool.query(`
      SELECT 
        c.*,
        u.email as contact_email,
        u.full_name as contact_name,
        u.phone as contact_phone,
        am.full_name as account_manager_name,
        am.email as account_manager_email
      FROM clients c
      INNER JOIN users u ON c.user_id = u.id
      LEFT JOIN users am ON c.account_manager_id = am.id
      WHERE c.id = ?
    `, [id]);

    if (clients.length === 0) {
      return errorResponse(res, 'Client not found', 404);
    }

    const client = clients[0];

    // Get client's projects
    const [projects] = await pool.query(`
      SELECT 
        p.id,
        p.title,
        p.description,
        p.status,
        p.start_date,
        p.end_date,
        p.budget,
        p.created_at,
        COUNT(DISTINCT t.id) as total_tasks,
        COUNT(DISTINCT CASE WHEN t.status = 'completed' THEN t.id END) as completed_tasks
      FROM projects p
      LEFT JOIN tasks t ON p.id = t.project_id
      WHERE p.client_id = ?
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `, [id]);

    // Get payment summary
    const [paymentSummary] = await pool.query(`
      SELECT 
        COUNT(DISTINCT pp.id) as total_phases,
        COUNT(DISTINCT CASE WHEN pp.status = 'paid' THEN pp.id END) as paid_count,
        COUNT(DISTINCT CASE WHEN pp.status = 'pending' THEN pp.id END) as pending_count,
        COUNT(DISTINCT CASE WHEN pp.status = 'overdue' THEN pp.id END) as overdue_count,
        COALESCE(SUM(CASE WHEN pp.status = 'paid' THEN pp.phase_amount END), 0) as total_paid,
        COALESCE(SUM(CASE WHEN pp.status = 'pending' THEN pp.phase_amount END), 0) as total_pending,
        COALESCE(SUM(CASE WHEN pp.status = 'overdue' THEN pp.phase_amount END), 0) as total_overdue
      FROM payment_phases pp
      INNER JOIN projects p ON pp.project_id = p.id
      WHERE p.client_id = ?
    `, [id]);

    return successResponse(res, {
      client,
      projects,
      paymentSummary: paymentSummary[0]
    }, 'Client details retrieved successfully');

  } catch (error) {
    console.error('Get client by ID error:', error);
    return errorResponse(res, 'Failed to retrieve client details', 500);
  }
};

/**
 * @desc    Create new client
 * @route   POST /api/clients
 * @access  Private (Sales, Management, Admin)
 */
exports.createClient = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const {
      // User details (for users table)
      email,
      full_name,
      phone,
      password = 'Client@123', // Default password for new clients
      
      // Client details (for clients table)
      company_name,
      company_website,
      industry,
      company_size,
      billing_address,
      city,
      state,
      country = 'India',
      postal_code,
      gst_number,
      pan_number,
      account_manager_id,
      customer_since,
      client_tier = 'Bronze',
      notes
    } = req.body;

    // Validation
    if (!email || !full_name || !company_name) {
      await connection.rollback();
      return errorResponse(res, 'Email, full name, and company name are required', 400);
    }

    // Check if user/email already exists
    const [existingUsers] = await connection.query(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    if (existingUsers.length > 0) {
      await connection.rollback();
      return errorResponse(res, 'A user with this email already exists', 400);
    }

    // Hash password
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert into users table (with force password change on first login)
    const [userResult] = await connection.query(`
      INSERT INTO users (email, password_hash, full_name, phone, is_active, must_change_password)
      VALUES (?, ?, ?, ?, 1, 1)
    `, [email, hashedPassword, full_name, phone]);

    const userId = userResult.insertId;

    // Get 'client' role ID
    const [clientRole] = await connection.query(
      "SELECT id FROM roles WHERE role_name = 'client'",
      []
    );

    if (clientRole.length === 0) {
      await connection.rollback();
      return errorResponse(res, 'Client role not found in system', 500);
    }

    // Assign 'client' role
    await connection.query(`
      INSERT INTO user_roles (user_id, role_id)
      VALUES (?, ?)
    `, [userId, clientRole[0].id]);

    // Insert into clients table
    const [clientResult] = await connection.query(`
      INSERT INTO clients (
        user_id, company_name, company_website, industry, company_size,
        billing_address, city, state, country, postal_code,
        gst_number, pan_number, account_manager_id, customer_since,
        client_tier, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      userId, company_name, company_website, industry, company_size,
      billing_address, city, state, country, postal_code,
      gst_number, pan_number, account_manager_id, customer_since || new Date(),
      client_tier, notes
    ]);

    await connection.commit();

    // Get the created client
    const [newClient] = await connection.query(`
      SELECT 
        c.*,
        u.email as contact_email,
        u.full_name as contact_name,
        u.phone as contact_phone
      FROM clients c
      INNER JOIN users u ON c.user_id = u.id
      WHERE c.id = ?
    `, [clientResult.insertId]);

    return successResponse(res, newClient[0], 'Client created successfully', 201);

  } catch (error) {
    await connection.rollback();
    console.error('Create client error:', error);
    return errorResponse(res, 'Failed to create client', 500);
  } finally {
    connection.release();
  }
};

/**
 * @desc    Update existing client
 * @route   PUT /api/clients/:id
 * @access  Private (Sales, Management, Admin)
 */
exports.updateClient = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const {
      // User updates
      full_name,
      phone,
      
      // Client updates
      company_name,
      company_website,
      industry,
      company_size,
      billing_address,
      city,
      state,
      country,
      postal_code,
      gst_number,
      pan_number,
      account_manager_id,
      client_tier,
      notes
    } = req.body;

    // Check if client exists
    const [existingClients] = await connection.query(
      'SELECT user_id FROM clients WHERE id = ?',
      [id]
    );

    if (existingClients.length === 0) {
      await connection.rollback();
      return errorResponse(res, 'Client not found', 404);
    }

    const userId = existingClients[0].user_id;

    // Update users table if user data provided
    if (full_name || phone) {
      const userUpdates = [];
      const userParams = [];

      if (full_name) {
        userUpdates.push('full_name = ?');
        userParams.push(full_name);
      }
      if (phone) {
        userUpdates.push('phone = ?');
        userParams.push(phone);
      }

      if (userUpdates.length > 0) {
        userParams.push(userId);
        await connection.query(
          `UPDATE users SET ${userUpdates.join(', ')} WHERE id = ?`,
          userParams
        );
      }
    }

    // Update clients table
    const clientUpdates = [];
    const clientParams = [];

    const fields = {
      company_name, company_website, industry, company_size,
      billing_address, city, state, country, postal_code,
      gst_number, pan_number, account_manager_id, client_tier, notes
    };

    Object.entries(fields).forEach(([key, value]) => {
      if (value !== undefined) {
        clientUpdates.push(`${key} = ?`);
        clientParams.push(value);
      }
    });

    if (clientUpdates.length > 0) {
      clientParams.push(id);
      await connection.query(
        `UPDATE clients SET ${clientUpdates.join(', ')} WHERE id = ?`,
        clientParams
      );
    }

    await connection.commit();

    // Get updated client
    const [updatedClient] = await connection.query(`
      SELECT 
        c.*,
        u.email as contact_email,
        u.full_name as contact_name,
        u.phone as contact_phone
      FROM clients c
      INNER JOIN users u ON c.user_id = u.id
      WHERE c.id = ?
    `, [id]);

    return successResponse(res, updatedClient[0], 'Client updated successfully');

  } catch (error) {
    await connection.rollback();
    console.error('Update client error:', error);
    return errorResponse(res, 'Failed to update client', 500);
  } finally {
    connection.release();
  }
};

/**
 * @desc    Delete client
 * @route   DELETE /api/clients/:id
 * @access  Private (Admin only)
 */
exports.deleteClient = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const { id } = req.params;

    // Check if client exists
    const [clients] = await connection.query(
      'SELECT user_id FROM clients WHERE id = ?',
      [id]
    );

    if (clients.length === 0) {
      await connection.rollback();
      return errorResponse(res, 'Client not found', 404);
    }

    // Check for active projects
    const [activeProjects] = await connection.query(
      'SELECT COUNT(*) as count FROM projects WHERE client_id = ? AND status = "active"',
      [id]
    );

    if (activeProjects[0].count > 0) {
      await connection.rollback();
      return errorResponse(res, 'Cannot delete client with active projects', 400);
    }

    const userId = clients[0].user_id;

    // Delete client (cascade will delete from clients table)
    // This will also cascade delete user_roles
    await connection.query('DELETE FROM users WHERE id = ?', [userId]);

    await connection.commit();

    return successResponse(res, null, 'Client deleted successfully');

  } catch (error) {
    await connection.rollback();
    console.error('Delete client error:', error);
    return errorResponse(res, 'Failed to delete client', 500);
  } finally {
    connection.release();
  }
};

/**
 * @desc    Get client statistics
 * @route   GET /api/clients/stats
 * @access  Private
 */
exports.getClientStats = async (req, res) => {
  try {
    const [stats] = await pool.query(`
      SELECT 
        COUNT(DISTINCT c.id) as total_clients,
        COUNT(DISTINCT CASE WHEN c.client_tier = 'Platinum' THEN c.id END) as platinum_count,
        COUNT(DISTINCT CASE WHEN c.client_tier = 'Gold' THEN c.id END) as gold_count,
        COUNT(DISTINCT CASE WHEN c.client_tier = 'Silver' THEN c.id END) as silver_count,
        COUNT(DISTINCT CASE WHEN c.client_tier = 'Bronze' THEN c.id END) as bronze_count,
        COUNT(DISTINCT p.id) as total_projects,
        COUNT(DISTINCT CASE WHEN p.status = 'active' THEN p.id END) as active_projects,
        COALESCE(SUM(CASE WHEN pp.status = 'paid' THEN pp.phase_amount END), 0) as total_revenue,
        COALESCE(SUM(CASE WHEN pp.status = 'pending' THEN pp.phase_amount END), 0) as pending_revenue
      FROM clients c
      LEFT JOIN projects p ON c.id = p.client_id
      LEFT JOIN payment_phases pp ON p.id = pp.project_id
    `);

    // Get top clients by revenue
    const [topClients] = await pool.query(`
      SELECT 
        c.id,
        c.company_name,
        c.client_tier,
        COALESCE(SUM(CASE WHEN pp.status = 'paid' THEN pp.phase_amount END), 0) as total_revenue,
        COUNT(DISTINCT p.id) as project_count
      FROM clients c
      LEFT JOIN projects p ON c.id = p.client_id
      LEFT JOIN payment_phases pp ON p.id = pp.project_id
      GROUP BY c.id
      ORDER BY total_revenue DESC
      LIMIT 5
    `);

    // Industry breakdown
    const [industries] = await pool.query(`
      SELECT 
        industry,
        COUNT(*) as client_count,
        COALESCE(SUM(revenue), 0) as total_revenue
      FROM (
        SELECT 
          c.industry,
          COALESCE(SUM(CASE WHEN pp.status = 'paid' THEN pp.phase_amount END), 0) as revenue
        FROM clients c
        LEFT JOIN projects p ON c.id = p.client_id
        LEFT JOIN payment_phases pp ON p.id = pp.project_id
        GROUP BY c.id, c.industry
      ) as client_revenues
      WHERE industry IS NOT NULL AND industry != ''
      GROUP BY industry
      ORDER BY client_count DESC
    `);

    return successResponse(res, {
      overview: stats[0],
      topClients,
      industries
    }, 'Client statistics retrieved successfully');

  } catch (error) {
    console.error('Get client stats error:', error);
    return errorResponse(res, 'Failed to retrieve client statistics', 500);
  }
};



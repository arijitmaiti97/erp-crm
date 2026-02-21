const { pool } = require('../config/database');
const { successResponse, errorResponse } = require('../utils/response.utils');

// @desc    Get all leads with filters
// @route   GET /api/leads
// @access  Private (Marketing, Management, Accountant)
const getLeads = async (req, res) => {
  try {
    const { status, priority, source_id, assigned_to, search, converted } = req.query;
    const userId = req.user.id;
    const { roles, permissions } = req.user;

    let query = `
      SELECT 
        l.*,
        ls.source_name,
        u1.full_name as assigned_to_name,
        u2.full_name as assigned_by_name,
        c.company_name as converted_client_name,
        (SELECT COUNT(*) FROM lead_activities WHERE lead_id = l.id) as activity_count,
        (SELECT COUNT(*) FROM lead_notes WHERE lead_id = l.id) as note_count
      FROM leads l
      LEFT JOIN lead_sources ls ON l.source_id = ls.id
      LEFT JOIN users u1 ON l.assigned_to = u1.id
      LEFT JOIN users u2 ON l.assigned_by = u2.id
      LEFT JOIN clients c ON l.converted_to_client_id = c.id
      WHERE 1=1
    `;

    const params = [];

    // Role-based filtering
    const canViewAll = permissions && permissions.includes('view_all_leads');
    
    if (!canViewAll && (roles.includes('marketing') || roles.includes('management'))) {
      // Can only see assigned leads
      query += ` AND l.assigned_to = ?`;
      params.push(userId);
    }

    // Status filter
    if (status) {
      query += ` AND l.status = ?`;
      params.push(status);
    }

    // Priority filter
    if (priority) {
      query += ` AND l.priority = ?`;
      params.push(priority);
    }

    // Source filter
    if (source_id) {
      query += ` AND l.source_id = ?`;
      params.push(source_id);
    }

    // Assigned to filter
    if (assigned_to) {
      query += ` AND l.assigned_to = ?`;
      params.push(assigned_to);
    }

    // Converted filter
    if (converted === 'true') {
      query += ` AND l.status = 'Won' AND l.converted_to_client_id IS NOT NULL`;
    } else if (converted === 'false') {
      query += ` AND l.status NOT IN ('Won', 'Lost')`;
    }

    // Search filter
    if (search) {
      query += ` AND (
        l.first_name LIKE ? OR 
        l.last_name LIKE ? OR 
        l.email LIKE ? OR 
        l.company_name LIKE ? OR
        l.phone LIKE ?
      )`;
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    query += ` ORDER BY l.created_at DESC`;

    const [leads] = await pool.query(query, params);

    return successResponse(res, { leads }, 'Leads retrieved successfully');

  } catch (error) {
    console.error('Get leads error:', error);
    return errorResponse(res, 'Failed to retrieve leads', 500);
  }
};

// @desc    Get single lead by ID
// @route   GET /api/leads/:id
// @access  Private
const getLeadById = async (req, res) => {
  try {
    const { id } = req.params;

    // Get lead details
    const [leads] = await pool.query(`
      SELECT 
        l.*,
        ls.source_name,
        u1.full_name as assigned_to_name,
        u1.email as assigned_to_email,
        u2.full_name as assigned_by_name,
        c.company_name as converted_client_name
      FROM leads l
      LEFT JOIN lead_sources ls ON l.source_id = ls.id
      LEFT JOIN users u1 ON l.assigned_to = u1.id
      LEFT JOIN users u2 ON l.assigned_by = u2.id
      LEFT JOIN clients c ON l.converted_to_client_id = c.id
      WHERE l.id = ?
    `, [id]);

    if (leads.length === 0) {
      return errorResponse(res, 'Lead not found', 404);
    }

    // Get activities
    const [activities] = await pool.query(`
      SELECT la.*, u.full_name as performed_by_name
      FROM lead_activities la
      JOIN users u ON la.performed_by = u.id
      WHERE la.lead_id = ?
      ORDER BY la.performed_at DESC
    `, [id]);

    // Get notes
    const [notes] = await pool.query(`
      SELECT ln.*, u.full_name as created_by_name
      FROM lead_notes ln
      JOIN users u ON ln.created_by = u.id
      WHERE ln.lead_id = ?
      ORDER BY ln.is_important DESC, ln.created_at DESC
    `, [id]);

    const lead = {
      ...leads[0],
      activities,
      notes
    };

    return successResponse(res, { lead }, 'Lead retrieved successfully');

  } catch (error) {
    console.error('Get lead error:', error);
    return errorResponse(res, 'Failed to retrieve lead', 500);
  }
};

// @desc    Get lead statistics
// @route   GET /api/leads/stats
// @access  Private
const getLeadStats = async (req, res) => {
  try {
    const userId = req.user.id;
    const { roles, permissions } = req.user;

    let whereClause = '1=1';
    const params = [];

    // Role-based filtering
    const canViewAll = permissions && permissions.includes('view_all_leads');
    
    if (!canViewAll && (roles.includes('marketing') || roles.includes('management'))) {
      whereClause = 'assigned_to = ?';
      params.push(userId);
    }

    // Overall stats
    const [stats] = await pool.query(`
      SELECT 
        COUNT(*) as total_leads,
        SUM(CASE WHEN status = 'New' THEN 1 ELSE 0 END) as new_count,
        SUM(CASE WHEN status = 'Contacted' THEN 1 ELSE 0 END) as contacted_count,
        SUM(CASE WHEN status = 'Qualified' THEN 1 ELSE 0 END) as qualified_count,
        SUM(CASE WHEN status = 'Proposal' THEN 1 ELSE 0 END) as proposal_count,
        SUM(CASE WHEN status = 'Negotiation' THEN 1 ELSE 0 END) as negotiation_count,
        SUM(CASE WHEN status = 'Won' THEN 1 ELSE 0 END) as won_count,
        SUM(CASE WHEN status = 'Lost' THEN 1 ELSE 0 END) as lost_count,
        SUM(CASE WHEN priority = 'Urgent' THEN 1 ELSE 0 END) as urgent_count,
        SUM(CASE WHEN priority = 'High' THEN 1 ELSE 0 END) as high_priority_count,
        COALESCE(SUM(estimated_value), 0) as total_estimated_value,
        COALESCE(SUM(CASE WHEN status = 'Won' THEN estimated_value ELSE 0 END), 0) as won_value,
        COALESCE(AVG(lead_score), 0) as avg_lead_score
      FROM leads
      WHERE ${whereClause}
    `, params);

    // Conversion rate
    const conversionRate = stats[0].total_leads > 0 
      ? ((stats[0].won_count / stats[0].total_leads) * 100).toFixed(2)
      : 0;

    // Leads by source
    const sourceWhereClause = whereClause === '1=1' ? '1=1' : whereClause.replace('assigned_to', 'l.assigned_to');
    const [sourceDistribution] = await pool.query(`
      SELECT 
        ls.source_name,
        COUNT(l.id) as lead_count,
        COALESCE(SUM(l.estimated_value), 0) as total_value,
        SUM(CASE WHEN l.status = 'Won' THEN 1 ELSE 0 END) as won_count
      FROM lead_sources ls
      LEFT JOIN leads l ON ls.id = l.source_id AND ${sourceWhereClause}
      GROUP BY ls.id, ls.source_name
      HAVING lead_count > 0
      ORDER BY lead_count DESC
    `, params);

    // Top leads by score
    const [topLeads] = await pool.query(`
      SELECT 
        id,
        first_name,
        last_name,
        company_name,
        status,
        lead_score,
        estimated_value
      FROM leads
      WHERE ${whereClause} AND status NOT IN ('Won', 'Lost')
      ORDER BY lead_score DESC
      LIMIT 5
    `, params);

    return successResponse(res, {
      overview: {
        ...stats[0],
        conversion_rate: conversionRate
      },
      source_distribution: sourceDistribution,
      top_leads: topLeads
    }, 'Lead statistics retrieved successfully');

  } catch (error) {
    console.error('Get lead stats error:', error);
    return errorResponse(res, 'Failed to retrieve lead statistics', 500);
  }
};

// @desc    Create new lead
// @route   POST /api/leads
// @access  Private (requires create_lead permission)
const createLead = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const {
      first_name,
      last_name,
      email,
      phone,
      company_name,
      job_title,
      website,
      status = 'New',
      priority = 'Medium',
      lead_score = 0,
      estimated_value,
      currency = 'INR',
      source_id,
      assigned_to,
      address,
      city,
      state,
      country = 'India',
      pincode
    } = req.body;

    // Validation
    if (!first_name || !email) {
      await connection.rollback();
      return errorResponse(res, 'First name and email are required', 400);
    }

    // Check if lead already exists
    const [existing] = await connection.query(
      'SELECT id FROM leads WHERE email = ?',
      [email]
    );

    if (existing.length > 0) {
      await connection.rollback();
      return errorResponse(res, 'Lead with this email already exists', 400);
    }

    // Generate lead number
    const [lastLead] = await connection.query(
      "SELECT lead_number FROM leads ORDER BY id DESC LIMIT 1"
    );
    
    let leadNumber;
    if (lastLead.length > 0) {
      const lastNumber = parseInt(lastLead[0].lead_number.split('-')[2]);
      leadNumber = `LEAD-2026-${String(lastNumber + 1).padStart(3, '0')}`;
    } else {
      leadNumber = 'LEAD-2026-001';
    }

    // Insert lead
    const [result] = await connection.query(`
      INSERT INTO leads (
        lead_number, first_name, last_name, email, phone, company_name,
        job_title, website, status,priority, lead_score, estimated_value,
        currency, source_id, assigned_to, assigned_by, assigned_at,
        address, city, state, country, pincode
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?)
    `, [
      leadNumber, first_name, last_name, email, phone, company_name,
      job_title, website, status, priority, lead_score, estimated_value,
      currency, source_id, assigned_to, req.user.id,
      address, city, state, country, pincode
    ]);

    // Log activity
    await connection.query(`
      INSERT INTO lead_activities (lead_id, activity_type, subject, description, performed_by)
      VALUES (?, 'Note', 'Lead Created', 'Lead was created in the system', ?)
    `, [result.insertId, req.user.id]);

    await connection.commit();

    return successResponse(res, { 
      lead_id: result.insertId,
      lead_number: leadNumber
    }, 'Lead created successfully', 201);

  } catch (error) {
    await connection.rollback();
    console.error('Create lead error:', error);
    return errorResponse(res, 'Failed to create lead', 500);
  } finally {
    connection.release();
  }
};

// @desc    Update lead
// @route   PUT /api/leads/:id
// @access  Private (requires edit_lead permission)
const updateLead = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const updateData = req.body;

    // Check if lead exists
    const [existingLead] = await connection.query('SELECT * FROM leads WHERE id = ?', [id]);
    
    if (existingLead.length === 0) {
      await connection.rollback();
      return errorResponse(res, 'Lead not found', 404);
    }

    // Build update query dynamically
    const allowedFields = [
      'first_name', 'last_name', 'email', 'phone', 'company_name', 'job_title',
      'website', 'status', 'priority', 'lead_score', 'estimated_value', 'currency',
      'source_id', 'address', 'city', 'state', 'country', 'pincode',
      'next_follow_up_date', 'lost_reason'
    ];

    const updates = [];
    const params = [];

    for (const field of allowedFields) {
      if (updateData[field] !== undefined) {
        updates.push(`${field} = ?`);
        params.push(updateData[field]);
      }
    }

    if (updates.length === 0) {
      await connection.rollback();
      return errorResponse(res, 'No valid fields to update', 400);
    }

    params.push(id);

    await connection.query(`
      UPDATE leads 
      SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, params);

    // Log status change if applicable
    if (updateData.status && updateData.status !== existingLead[0].status) {
      await connection.query(`
        INSERT INTO lead_activities (lead_id, activity_type, subject, description, performed_by)
        VALUES (?, 'Status Change', 'Status Updated', ?, ?)
      `, [id, `Status changed from ${existingLead[0].status} to ${updateData.status}`, req.user.id]);

      // If marked as Lost, update lost_at
      if (updateData.status === 'Lost') {
        await connection.query('UPDATE leads SET lost_at = NOW() WHERE id = ?', [id]);
      }
    }

    await connection.commit();

    return successResponse(res, { lead_id: id }, 'Lead updated successfully');

  } catch (error) {
    await connection.rollback();
    console.error('Update lead error:', error);
    return errorResponse(res, 'Failed to update lead', 500);
  } finally {
    connection.release();
  }
};

// @desc    Delete lead (soft delete)
// @route   DELETE /api/leads/:id
// @access  Private (requires delete_lead permission)
const deleteLead = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if lead exists
    const [lead] = await pool.query('SELECT id FROM leads WHERE id = ?', [id]);
    
    if (lead.length === 0) {
      return errorResponse(res, 'Lead not found', 404);
    }

    // Soft delete by marking as Lost
    await pool.query(
      "UPDATE leads SET status = 'Lost', lost_reason = 'Deleted', lost_at = NOW() WHERE id = ?",
      [id]
    );

    return successResponse(res, null, 'Lead deleted successfully');

  } catch (error) {
    console.error('Delete lead error:', error);
    return errorResponse(res, 'Failed to delete lead', 500);
  }
};

// @desc    Convert lead to client
// @route   POST /api/leads/:id/convert
// @access  Private (requires convert_lead permission)
const convertToClient = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const { id } = req.params;
    const { conversion_notes } = req.body;

    // Get lead details
    const [leads] = await connection.query('SELECT * FROM leads WHERE id = ?', [id]);
    
    if (leads.length === 0) {
      await connection.rollback();
      return errorResponse(res, 'Lead not found', 404);
    }

    const lead = leads[0];

    if (lead.status === 'Won' && lead.converted_to_client_id) {
      await connection.rollback();
      return errorResponse(res, 'Lead already converted to client', 400);
    }

    // Create client
    const company_name = lead.company_name || `${lead.first_name} ${lead.last_name}`;
    const contact_person = `${lead.first_name} ${lead.last_name || ''}`.trim();

    const [clientResult] = await connection.query(`
      INSERT INTO clients (
        company_name, contact_person, email, phone, website,
        address, city, state, country, pincode,
        client_tier, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Silver', 'Active')
    `, [
      company_name, contact_person, lead.email, lead.phone, lead.website,
      lead.address, lead.city, lead.state, lead.country, lead.pincode
    ]);

    // Update lead
    await connection.query(`
      UPDATE leads 
      SET status = 'Won',
          converted_to_client_id = ?,
          converted_at = NOW(),
          conversion_notes = ?
      WHERE id = ?
    `, [clientResult.insertId, conversion_notes, id]);

    // Log activity
    await connection.query(`
      INSERT INTO lead_activities (lead_id, activity_type, subject, description, performed_by)
      VALUES (?, 'Status Change', 'Converted to Client', ?, ?)
    `, [id, `Lead successfully converted to client: ${company_name}`, req.user.id]);

    await connection.commit();

    return successResponse(res, { 
      client_id: clientResult.insertId,
      lead_id: id
    }, 'Lead converted to client successfully');

  } catch (error) {
    await connection.rollback();
    console.error('Convert lead error:', error);
    return errorResponse(res, 'Failed to convert lead', 500);
  } finally {
    connection.release();
  }
};

// @desc    Assign lead to user
// @route   POST /api/leads/:id/assign
// @access  Private (requires assign_lead permission)
const assignLead = async (req, res) => {
  try {
    const { id } = req.params;
    const { assigned_to } = req.body;

    if (!assigned_to) {
      return errorResponse(res, 'assigned_to is required', 400);
    }

    await pool.query(`
      UPDATE leads 
      SET assigned_to = ?, assigned_by = ?, assigned_at = NOW()
      WHERE id = ?
    `, [assigned_to, req.user.id, id]);

    // Log activity
    await pool.query(`
      INSERT INTO lead_activities (lead_id, activity_type, subject, description, performed_by)
      VALUES (?, 'Assignment', 'Lead Assigned', 'Lead assigned to team member', ?)
    `, [id, req.user.id]);

    return successResponse(res, null, 'Lead assigned successfully');

  } catch (error) {
    console.error('Assign lead error:', error);
    return errorResponse(res, 'Failed to assign lead', 500);
  }
};

// @desc    Add activity to lead
// @route   POST /api/leads/:id/activities
// @access  Private
const addActivity = async (req, res) => {
  try {
    const { id } = req.params;
    const { activity_type, subject, description, outcome, duration_minutes } = req.body;

    if (!activity_type || !subject) {
      return errorResponse(res, 'activity_type and subject are required', 400);
    }

    await pool.query(`
      INSERT INTO lead_activities (
        lead_id, activity_type, subject, description, outcome,
        duration_minutes, performed_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [id, activity_type, subject, description, outcome, duration_minutes, req.user.id]);

    // Update last contact date
    await pool.query('UPDATE leads SET last_contact_date = NOW() WHERE id = ?', [id]);

    return successResponse(res, null, 'Activity added successfully', 201);

  } catch (error) {
    console.error('Add activity error:', error);
    return errorResponse(res, 'Failed to add activity', 500);
  }
};

// @desc    Add note to lead
// @route   POST /api/leads/:id/notes
// @access  Private
const addNote = async (req, res) => {
  try {
    const { id } = req.params;
    const { note, is_important = false } = req.body;

    if (!note) {
      return errorResponse(res, 'Note content is required', 400);
    }

    await pool.query(`
      INSERT INTO lead_notes (lead_id, note, is_important, created_by)
      VALUES (?, ?, ?, ?)
    `, [id, note, is_important, req.user.id]);

    return successResponse(res, null, 'Note added successfully', 201);

  } catch (error) {
    console.error('Add note error:', error);
    return errorResponse(res, 'Failed to add note', 500);
  }
};

// @desc    Get lead sources
// @route   GET /api/leads/sources
// @access  Private
const getLeadSources = async (req, res) => {
  try {
    const [sources] = await pool.query(`
      SELECT * FROM lead_sources WHERE is_active = 1 ORDER BY source_name
    `);

    return successResponse(res, { sources }, 'Lead sources retrieved successfully');

  } catch (error) {
    console.error('Get lead sources error:', error);
    return errorResponse(res, 'Failed to retrieve lead sources', 500);
  }
};

module.exports = {
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
};

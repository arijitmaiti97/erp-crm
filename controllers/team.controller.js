const { pool } = require('../config/database');
const { successResponse, errorResponse } = require('../utils/response.utils');
const bcrypt = require('bcryptjs');

// @desc    Get all team members with roles
// @route   GET /api/team
// @access  Private (Management, Super Admin)
const getTeamMembers = async (req, res) => {
  try {
    const [users] = await pool.query(`
      SELECT 
        u.id,
        u.email,
        u.full_name,
        u.phone,
        u.is_active,
        u.is_email_verified,
        u.must_change_password,
        u.created_at,
        u.last_login,
        GROUP_CONCAT(DISTINCT r.role_name) as roles,
        GROUP_CONCAT(DISTINCT r.role_display_name) as role_display_names,
        GROUP_CONCAT(DISTINCT r.id) as role_ids
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      WHERE r.role_name != 'client'
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `);

    return successResponse(res, { users }, 'Team members retrieved successfully');
  } catch (error) {
    console.error('Get team members error:', error);
    return errorResponse(res, 'Failed to retrieve team members', 500);
  }
};

// @desc    Get single user details
// @route   GET /api/team/:id
// @access  Private (Management, Super Admin)
const getUserDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const [users] = await pool.query(`
      SELECT 
        u.id,
        u.email,
        u.full_name,
        u.phone,
        u.is_active,
        u.is_email_verified,
        u.must_change_password,
        u.created_at,
        u.last_login,
        GROUP_CONCAT(DISTINCT r.role_name) as roles,
        GROUP_CONCAT(DISTINCT r.role_display_name) as role_display_names
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      WHERE u.id = ?
      GROUP BY u.id
    `, [id]);

    if (users.length === 0) {
      return errorResponse(res, 'User not found', 404);
    }

    return successResponse(res, { user: users[0] }, 'User details retrieved successfully');
  } catch (error) {
    console.error('Get user details error:', error);
    return errorResponse(res, 'Failed to retrieve user details', 500);
  }
};

// @desc    Create new team member
// @route   POST /api/team
// @access  Private (Super Admin, Management)
const createTeamMember = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const { email, full_name, phone, password, roles } = req.body;

    // Validation
    if (!email || !full_name || !password) {
      await connection.rollback();
      return errorResponse(res, 'Email, full name, and password are required', 400);
    }

    // Check if email already exists
    const [existingUsers] = await connection.query(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    if (existingUsers.length > 0) {
      await connection.rollback();
      return errorResponse(res, 'Email already exists', 400);
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Insert user
    const [result] = await connection.query(
      `INSERT INTO users (email, password_hash, full_name, phone, must_change_password) 
       VALUES (?, ?, ?, ?, ?)`,
      [email, hashedPassword, full_name, phone || null, true]
    );

    const userId = result.insertId;

    // Assign roles if provided
    if (roles && Array.isArray(roles) && roles.length > 0) {
      for (const roleName of roles) {
        const [roleData] = await connection.query(
          'SELECT id FROM roles WHERE role_name = ?',
          [roleName]
        );

        if (roleData.length > 0) {
          await connection.query(
            'INSERT INTO user_roles (user_id, role_id, assigned_by) VALUES (?, ?, ?)',
            [userId, roleData[0].id, req.user.id]
          );
        }
      }
    }

    await connection.commit();

    return successResponse(res, { user: { id: userId, email, full_name } }, 'Team member created successfully', 201);

  } catch (error) {
    await connection.rollback();
    console.error('Create team member error:', error);
    return errorResponse(res, 'Failed to create team member', 500);
  } finally {
    connection.release();
  }
};

// @desc    Update team member
// @route   PUT /api/team/:id
// @access  Private (Super Admin, Management)
const updateTeamMember = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    const { id } = req.params;
    const { full_name, phone, is_active } = req.body;

    // Check if user exists
    const [users] = await connection.query('SELECT id FROM users WHERE id = ?', [id]);
    
    if (users.length === 0) {
      return errorResponse(res, 'User not found', 404);
    }

    // Build update query dynamically
    const updates = [];
    const values = [];

    if (full_name !== undefined) {
      updates.push('full_name = ?');
      values.push(full_name);
    }

    if (phone !== undefined) {
      updates.push('phone = ?');
      values.push(phone);
    }

    if (is_active !== undefined) {
      updates.push('is_active = ?');
      values.push(is_active);
    }

    if (updates.length === 0) {
      return errorResponse(res, 'No fields to update', 400);
    }

    values.push(id);

    await connection.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    return successResponse(res, null, 'Team member updated successfully');

  } catch (error) {
    console.error('Update team member error:', error);
    return errorResponse(res, 'Failed to update team member', 500);
  } finally {
    connection.release();
  }
};

// @desc    Assign role to user
// @route   POST /api/team/:id/roles
// @access  Private (Super Admin)
const assignRole = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    const { id } = req.params;
    const { role_name } = req.body;

    if (!role_name) {
      return errorResponse(res, 'Role name is required', 400);
    }

    // Get role ID
    const [roles] = await connection.query(
      'SELECT id FROM roles WHERE role_name = ?',
      [role_name]
    );

    if (roles.length === 0) {
      return errorResponse(res, 'Role not found', 404);
    }

    // Check if already assigned
    const [existing] = await connection.query(
      'SELECT id FROM user_roles WHERE user_id = ? AND role_id = ?',
      [id, roles[0].id]
    );

    if (existing.length > 0) {
      return errorResponse(res, 'Role already assigned', 400);
    }

    // Assign role
    await connection.query(
      'INSERT INTO user_roles (user_id, role_id, assigned_by) VALUES (?, ?, ?)',
      [id, roles[0].id, req.user.id]
    );

    return successResponse(res, null, 'Role assigned successfully');

  } catch (error) {
    console.error('Assign role error:', error);
    return errorResponse(res, 'Failed to assign role', 500);
  } finally {
    connection.release();
  }
};

// @desc    Remove role from user
// @route   DELETE /api/team/:id/roles/:roleName
// @access  Private (Super Admin)
const removeRole = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    const { id, roleName } = req.params;

    // Get role ID from role name
    const [roles] = await connection.query(
      'SELECT id FROM roles WHERE role_name = ?',
      [roleName]
    );

    if (roles.length === 0) {
      return errorResponse(res, 'Role not found', 404);
    }

    const roleId = roles[0].id;

    // Check if user has other roles
    const [userRoles] = await connection.query(
      'SELECT COUNT(*) as count FROM user_roles WHERE user_id = ?',
      [id]
    );

    if (userRoles[0].count <= 1) {
      return errorResponse(res, 'Cannot remove the last role from user', 400);
    }

    await connection.query(
      'DELETE FROM user_roles WHERE user_id = ? AND role_id = ?',
      [id, roleId]
    );

    return successResponse(res, null, 'Role removed successfully');

  } catch (error) {
    console.error('Remove role error:', error);
    return errorResponse(res, 'Failed to remove role', 500);
  } finally {
    connection.release();
  }
};

// @desc    Reset user password
// @route   POST /api/team/:id/reset-password
// @access  Private (Super Admin, Management)
const resetUserPassword = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    const { id } = req.params;

    // Auto-generate a secure password
    const generatePassword = () => {
      const length = 12;
      const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
      let password = '';
      for (let i = 0; i < length; i++) {
        password += charset.charAt(Math.floor(Math.random() * charset.length));
      }
      return password;
    };

    const newPassword = generatePassword();

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await connection.query(
      'UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?',
      [hashedPassword, id]
    );

    return successResponse(res, { newPassword }, 'Password reset successfully');

  } catch (error) {
    console.error('Reset password error:', error);
    return errorResponse(res, 'Failed to reset password', 500);
  } finally {
    connection.release();
  }
};

// @desc    Get all available roles
// @route   GET /api/team/roles
// @access  Private
const getRoles = async (req, res) => {
  try {
    const [roles] = await pool.query(`
      SELECT id, role_name, role_display_name
      FROM roles
      WHERE role_name != 'client'
      ORDER BY role_display_name
    `);

    return successResponse(res, { roles }, 'Roles retrieved successfully');
  } catch (error) {
    console.error('Get roles error:', error);
    return errorResponse(res, 'Failed to retrieve roles', 500);
  }
};

module.exports = {
  getTeamMembers,
  getUserDetails,
  createTeamMember,
  updateTeamMember,
  assignRole,
  removeRole,
  resetUserPassword,
  getRoles
};

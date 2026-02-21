const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');
const { generateToken } = require('../utils/jwtHelper');

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validate input
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Please provide email and password'
            });
        }

        // Check if user exists
        const [users] = await pool.query(
            'SELECT * FROM users WHERE email = ? AND is_active = TRUE',
            [email]
        );

        if (users.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        const user = users[0];

        // Check password
        const isPasswordMatch = await bcrypt.compare(password, user.password_hash);

        if (!isPasswordMatch) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Get user roles
        const [roles] = await pool.query(`
            SELECT r.role_name, r.role_display_name
            FROM user_roles ur
            JOIN roles r ON ur.role_id = r.id
            WHERE ur.user_id = ?
        `, [user.id]);

        const roleNames = roles.map(r => r.role_name);
        const roleDisplayNames = roles.map(r => r.role_display_name);

        // Generate JWT token
        const token = generateToken(user.id, roleNames);

        // Update last login
        await pool.query(
            'UPDATE users SET last_login = NOW() WHERE id = ?',
            [user.id]
        );

        res.status(200).json({
            success: true,
            message: 'Login successful',
            data: {
                token,
                user: {
                    id: user.id,
                    email: user.email,
                    full_name: user.full_name,
                    phone: user.phone,
                    roles: roleNames,
                    role_display_names: roleDisplayNames,
                    is_email_verified: user.is_email_verified,
                    must_change_password: user.must_change_password || false
                }
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during login'
        });
    }
};

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {
    try {
        // Get user with roles and permissions
        const [users] = await pool.query(`
            SELECT 
                u.id,
                u.email,
                u.full_name,
                u.phone,
                u.is_email_verified,
                u.last_login,
                GROUP_CONCAT(DISTINCT r.role_name) as roles,
                GROUP_CONCAT(DISTINCT r.role_display_name) as role_display_names,
                GROUP_CONCAT(DISTINCT p.permission_name) as permissions
            FROM users u
            LEFT JOIN user_roles ur ON u.id = ur.user_id
            LEFT JOIN roles r ON ur.role_id = r.id
            LEFT JOIN role_permissions rp ON r.id = rp.role_id
            LEFT JOIN permissions p ON rp.permission_id = p.id
            WHERE u.id = ?
            GROUP BY u.id
        `, [req.user.id]);

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const user = users[0];

        res.status(200).json({
            success: true,
            data: {
                id: user.id,
                email: user.email,
                full_name: user.full_name,
                phone: user.phone,
                is_email_verified: user.is_email_verified,
                last_login: user.last_login,
                roles: user.roles ? user.roles.split(',') : [],
                role_display_names: user.role_display_names ? user.role_display_names.split(',') : [],
                permissions: user.permissions ? user.permissions.split(',') : []
            }
        });

    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
};

// @desc    Logout user (client-side token removal)
// @route   POST /api/auth/logout
// @access  Private
const logout = (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Logout successful. Please remove token from client.'
    });
};

// @desc    Change password (for first-time login or password reset)
// @route   POST /api/auth/change-password
// @access  Private
const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const userId = req.user.id;

        // Validate input
        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Current password and new password are required'
            });
        }

        // Validate new password strength
        if (newPassword.length < 8) {
            return res.status(400).json({
                success: false,
                message: 'New password must be at least 8 characters long'
            });
        }

        // Get user
        const [users] = await pool.query(
            'SELECT id, password_hash FROM users WHERE id = ?',
            [userId]
        );

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const user = users[0];

        // Verify current password
        const bcrypt = require('bcryptjs');
        const isMatch = await bcrypt.compare(currentPassword, user.password_hash);

        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: 'Current password is incorrect'
            });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update password and clear must_change_password flag
        await pool.query(
            'UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?',
            [hashedPassword, userId]
        );

        res.status(200).json({
            success: true,
            message: 'Password changed successfully'
        });

    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while changing password'
        });
    }
};

// @desc    Get all users (for assignment, dropdowns, etc.)
// @route   GET /api/auth/users
// @access  Private
const getUsers = async (req, res) => {
    try {
        const [users] = await pool.query(`
            SELECT 
                u.id,
                u.email,
                u.full_name,
                u.phone,
                u.is_active,
                GROUP_CONCAT(DISTINCT r.role_name) as roles,
                GROUP_CONCAT(DISTINCT r.role_display_name) as role_display_names
            FROM users u
            LEFT JOIN user_roles ur ON u.id = ur.user_id
            LEFT JOIN roles r ON ur.role_id = r.id
            WHERE u.is_active = 1
            GROUP BY u.id
            HAVING roles IS NULL OR roles NOT LIKE '%client%'
            ORDER BY u.full_name ASC
        `);

        return res.status(200).json({
            success: true,
            data: { users },
            message: 'Users retrieved successfully'
        });
    } catch (error) {
        console.error('Get users error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve users'
        });
    }
};

module.exports = { login, getMe, logout, changePassword, getUsers };

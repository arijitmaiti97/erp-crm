const { verifyToken } = require('../utils/jwtHelper');
const { pool } = require('../config/database');

// Protect routes - Verify JWT token
const protect = async (req, res, next) => {
    let token;

    // Check for token in Authorization header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }

    // Check if token exists
    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Not authorized to access this route. No token provided.'
        });
    }

    try {
        // Verify token
        const decoded = verifyToken(token);

        if (!decoded) {
            return res.status(401).json({
                success: false,
                message: 'Invalid or expired token'
            });
        }

        // Get user from database with roles and permissions
        const [userRows] = await pool.query(`
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
            WHERE u.id = ?
            GROUP BY u.id
        `, [decoded.id]);

        // Get user permissions
        const [permissionRows] = await pool.query(`
            SELECT DISTINCT p.permission_name
            FROM users u
            JOIN user_roles ur ON u.id = ur.user_id
            JOIN role_permissions rp ON ur.role_id = rp.role_id
            JOIN permissions p ON rp.permission_id = p.id
            WHERE u.id = ?
        `, [decoded.id]);

        if (userRows.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'User not found'
            });
        }

        const user = userRows[0];

        // Check if user is active
        if (!user.is_active) {
            return res.status(401).json({
                success: false,
                message: 'User account is deactivated'
            });
        }

        // Attach user to request object
        req.user = {
            id: user.id,
            email: user.email,
            full_name: user.full_name,
            phone: user.phone,
            roles: user.roles ? user.roles.split(',') : [],
            role_display_names: user.role_display_names ? user.role_display_names.split(',') : [],
            permissions: permissionRows.map(row => row.permission_name)
        };

        next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error during authentication'
        });
    }
};

module.exports = { protect };

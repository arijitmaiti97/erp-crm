const { pool } = require('../config/database');

// Check if user has required role(s)
const authorize = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'User not authenticated'
            });
        }

        // Check if user has any of the allowed roles
        const hasRole = req.user.roles.some(role => allowedRoles.includes(role));

        if (!hasRole) {
            return res.status(403).json({
                success: false,
                message: `Access denied. Required role(s): ${allowedRoles.join(', ')}. Your roles: ${req.user.roles.join(', ')}`
            });
        }

        next();
    };
};

// Check if user has required permission(s)
const checkPermission = (...requiredPermissions) => {
    return async (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'User not authenticated'
            });
        }

        try {
            // Get all permissions for user's roles
            const [permissions] = await pool.query(`
                SELECT DISTINCT p.permission_name
                FROM user_roles ur
                JOIN role_permissions rp ON ur.role_id = rp.role_id
                JOIN permissions p ON rp.permission_id = p.id
                WHERE ur.user_id = ?
            `, [req.user.id]);

            const userPermissions = permissions.map(p => p.permission_name);

            // Check if user has all required permissions
            const hasPermission = requiredPermissions.every(perm => userPermissions.includes(perm));

            if (!hasPermission) {
                return res.status(403).json({
                    success: false,
                    message: `Access denied. Required permission(s): ${requiredPermissions.join(', ')}`
                });
            }

            // Attach permissions to request for further use
            req.permissions = userPermissions;

            next();
        } catch (error) {
            console.error('Permission check error:', error);
            return res.status(500).json({
                success: false,
                message: 'Server error during permission check'
            });
        }
    };
};

module.exports = { authorize, checkPermission };

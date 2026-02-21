const { pool } = require('../config/database');

// @desc    Get all projects (role-filtered with manager assignments)
// @route   GET /api/projects
// @access  Private
const getProjects = async (req, res) => {
    try {
        const { roles, id: userId, permissions } = req.user;

        let query = `
            SELECT 
                p.*,
                c.company_name as client_name,
                u.full_name as manager_name,
                COUNT(DISTINCT pt.user_id) as team_size,
                COUNT(DISTINCT pp.id) as payment_phases_count,
                SUM(CASE WHEN pp.status = 'Paid' THEN pp.phase_amount ELSE 0 END) as paid_amount
            FROM projects p
            LEFT JOIN clients c ON p.client_id = c.id
            LEFT JOIN users u ON p.managed_by = u.id
            LEFT JOIN project_team pt ON p.id = pt.project_id
            LEFT JOIN payment_phases pp ON p.id = pp.project_id
        `;

        let whereClause = '';
        let queryParams = [];

        // Check if user has view_all_projects permission
        const canViewAll = permissions && permissions.includes('view_all_projects');

        // Role-based filtering with project manager assignments
        if (canViewAll) {
            // Super admin or management with full access - can see ALL projects
            whereClause = 'WHERE 1=1';
        } else if (roles.includes('management')) {
            // Management without view_all_projects - only see assigned projects
            whereClause = `
                WHERE p.id IN (
                    SELECT project_id FROM project_managers 
                    WHERE manager_id = ? AND is_active = 1
                )
            `;
            queryParams.push(userId);
        } else if (roles.includes('developer') || roles.includes('ui_ux_designer')) {
            // Can only see projects they're assigned to as team members
            whereClause = `
                WHERE p.id IN (
                    SELECT project_id FROM project_team WHERE user_id = ?
                )
            `;
            queryParams.push(userId);
        } else if (roles.includes('client')) {
            // Can only see their own projects
            whereClause = `
                WHERE p.client_id IN (
                    SELECT id FROM clients WHERE user_id = ?
                )
            `;
            queryParams.push(userId);
        } else if (roles.includes('accountant')) {
            // Can see all projects (for payment verification)
            whereClause = 'WHERE 1=1';
        } else if (roles.includes('marketing')) {
            // Can see all projects (read-only access)
            whereClause = 'WHERE 1=1';
        } else {
            // Default: no access
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to view projects'
            });
        }

        query += ` ${whereClause} GROUP BY p.id ORDER BY p.created_at DESC`;

        const [projects] = await pool.query(query, queryParams);

        res.status(200).json({
            success: true,
            count: projects.length,
            data: projects
        });

    } catch (error) {
        console.error('Get projects error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching projects'
        });
    }
};

// @desc    Get single project by ID
// @route   GET /api/projects/:id
// @access  Private
const getProject = async (req, res) => {
    try {
        const projectId = req.params.id;
        const { roles } = req.user;

        // First check if project exists and user has access
        let accessCheck = `
            SELECT p.id 
            FROM projects p
            LEFT JOIN clients c ON p.client_id = c.id
            LEFT JOIN project_team pt ON p.id = pt.project_id
            WHERE p.id = ?
        `;

        let hasAccess = false;

        if (roles.includes('super_admin') || roles.includes('management') || roles.includes('accountant')) {
            hasAccess = true;
        } else if (roles.includes('developer') || roles.includes('ui_ux_designer')) {
            // Check if assigned to project
            const [teamCheck] = await pool.query(
                'SELECT id FROM project_team WHERE project_id = ? AND user_id = ?',
                [projectId, req.user.id]
            );
            hasAccess = teamCheck.length > 0;
        } else if (roles.includes('client')) {
            // Check if it's their project
            const [clientCheck] = await pool.query(
                'SELECT p.id FROM projects p JOIN clients c ON p.client_id = c.id WHERE p.id = ? AND c.user_id = ?',
                [projectId, req.user.id]
            );
            hasAccess = clientCheck.length > 0;
        }

        if (!hasAccess) {
            return res.status(403).json({
                success: false,
                message: 'You do not have access to this project'
            });
        }

        // Get detailed project information
        const [projects] = await pool.query(`
            SELECT 
                p.*,
                c.id as client_id,
                c.company_name,
                c.company_website,
                cu.full_name as client_contact_name,
                cu.email as client_email,
                cu.phone as client_phone,
                u.full_name as manager_name,
                u.email as manager_email
            FROM projects p
            LEFT JOIN clients c ON p.client_id = c.id
            LEFT JOIN users cu ON c.user_id = cu.id
            LEFT JOIN users u ON p.managed_by = u.id
            WHERE p.id = ?
        `, [projectId]);

        if (projects.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Project not found'
            });
        }

        // Get project team
        const [team] = await pool.query(`
            SELECT 
                pt.*,
                u.full_name,
                u.email,
                r.role_display_name
            FROM project_team pt
            JOIN users u ON pt.user_id = u.id
            LEFT JOIN user_roles ur ON u.id = ur.user_id
            LEFT JOIN roles r ON ur.role_id = r.id
            WHERE pt.project_id = ?
        `, [projectId]);

        // Get payment phases
        const [paymentPhases] = await pool.query(`
            SELECT * FROM payment_phases 
            WHERE project_id = ? 
            ORDER BY phase_sequence ASC
        `, [projectId]);

        // Get milestones
        const [milestones] = await pool.query(`
            SELECT * FROM project_milestones 
            WHERE project_id = ? 
            ORDER BY due_date ASC
        `, [projectId]);

        res.status(200).json({
            success: true,
            data: {
                ...projects[0],
                team: team,
                payment_phases: paymentPhases,
                milestones: milestones
            }
        });

    } catch (error) {
        console.error('Get project error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching project'
        });
    }
};

// @desc    Create new project
// @route   POST /api/projects
// @access  Private (Management only)
const createProject = async (req, res) => {
    try {
        const {
            project_request_id,
            client_id,
            project_name,
            project_type,
            project_description,
            technology_stack,
            total_budget,
            currency,
            start_date,
            expected_end_date,
            priority,
            status
        } = req.body;

        // Validate required fields
        if (!client_id || !project_name || !total_budget) {
            return res.status(400).json({
                success: false,
                message: 'Please provide client_id, project_name, and total_budget'
            });
        }

        // Validate dates
        if (!start_date || !expected_end_date) {
            return res.status(400).json({
                success: false,
                message: 'Please provide start_date and expected_end_date'
            });
        }

        // Generate project number
        const [count] = await pool.query('SELECT COUNT(*) as total FROM projects');
        const projectNumber = `PRJ-${new Date().getFullYear()}-${String(count[0].total + 1).padStart(3, '0')}`;

        const [result] = await pool.query(`
            INSERT INTO projects (
                project_number, project_request_id, client_id, project_name, 
                project_type, project_description, technology_stack, 
                total_budget, currency, start_date, expected_end_date, 
                status, priority, completion_percentage, 
                created_by, managed_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            projectNumber,
            project_request_id || null,
            client_id,
            project_name,
            project_type || 'Other',
            project_description || '',
            technology_stack || '',
            total_budget,
            currency || 'INR',
            start_date,
            expected_end_date,
            status || 'Planning',
            priority || 'Medium',
            0,
            req.user.id,
            req.user.id
        ]);

        const [newProject] = await pool.query('SELECT * FROM projects WHERE id = ?', [result.insertId]);

        res.status(201).json({
            success: true,
            message: 'Project created successfully',
            data: newProject[0]
        });

    } catch (error) {
        console.error('Create project error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while creating project'
        });
    }
};

// @desc    Update project
// @route   PUT /api/projects/:id
// @access  Private (Super admin or assigned manager)
const updateProject = async (req, res) => {
    try {
        const projectId = req.params.id;
        const updates = req.body;
        const { roles, id: userId, permissions } = req.user;

        // Check if project exists
        const [existing] = await pool.query('SELECT * FROM projects WHERE id = ?', [projectId]);

        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Project not found'
            });
        }

        const project = existing[0];

        // Check permissions: Super admin can edit all, managers can edit only assigned projects
        const isSuperAdmin = roles.includes('super_admin') || 
                           (permissions && permissions.includes('edit_all_projects'));
        
        let isAssignedManager = false;
        
        if (roles.includes('management')) {
            // Check if this manager is assigned to the project
            const [managerCheck] = await pool.query(`
                SELECT * FROM project_managers 
                WHERE project_id = ? AND manager_id = ? AND is_active = 1
            `, [projectId, userId]);
            
            isAssignedManager = managerCheck.length > 0;
        }

        if (!isSuperAdmin && !isAssignedManager) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to edit this project. Only super admin or assigned managers can edit projects.'
            });
        }

        // Build update query dynamically
        const allowedFields = [
            'client_id', 'project_name', 'project_type', 'project_description', 
            'technology_stack', 'total_budget', 'start_date', 
            'expected_end_date', 'actual_end_date', 'status', 
            'priority', 'completion_percentage', 'notes', 'managed_by'
        ];

        const updateFields = [];
        const updateValues = [];

        Object.keys(updates).forEach(key => {
            if (allowedFields.includes(key)) {
                updateFields.push(`${key} = ?`);
                updateValues.push(updates[key]);
            }
        });

        if (updateFields.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No valid fields to update'
            });
        }

        updateValues.push(projectId);

        await pool.query(
            `UPDATE projects SET ${updateFields.join(', ')} WHERE id = ?`,
            updateValues
        );

        const [updatedProject] = await pool.query('SELECT * FROM projects WHERE id = ?', [projectId]);

        res.status(200).json({
            success: true,
            message: 'Project updated successfully',
            data: updatedProject[0]
        });

    } catch (error) {
        console.error('Update project error:', error);
        console.error('Error details:', error.message);
        console.error('SQL error code:', error.code);
        res.status(500).json({
            success: false,
            message: 'Server error while updating project',
            error: error.message
        });
    }
};

// @desc    Get project team members
// @route   GET /api/projects/:id/team
// @access  Private
const getProjectTeam = async (req, res) => {
    try {
        const projectId = req.params.id;

        const [team] = await pool.query(`
            SELECT 
                pt.*,
                u.full_name,
                u.email,
                u.phone,
                GROUP_CONCAT(DISTINCT r.role_display_name) as roles
            FROM project_team pt
            JOIN users u ON pt.user_id = u.id
            LEFT JOIN user_roles ur ON u.id = ur.user_id
            LEFT JOIN roles r ON ur.role_id = r.id
            WHERE pt.project_id = ?
            GROUP BY pt.id, u.id
            ORDER BY pt.joined_date ASC
        `, [projectId]);

        res.status(200).json({
            success: true,
            count: team.length,
            data: team
        });

    } catch (error) {
        console.error('Get project team error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching project team'
        });
    }
};

// @desc    Assign user to project
// @route   POST /api/projects/:id/team
// @access  Private (Management only)
const assignTeamMember = async (req, res) => {
    try {
        const projectId = req.params.id;
        const { user_id, role_in_project, allocated_hours, hourly_rate } = req.body;

        if (!user_id || !role_in_project) {
            return res.status(400).json({
                success: false,
                message: 'Please provide user_id and role_in_project'
            });
        }

        // Check if already assigned (including inactive records)
        const [existing] = await pool.query(
            'SELECT id, is_active FROM project_team WHERE project_id = ? AND user_id = ?',
            [projectId, user_id]
        );

        if (existing.length > 0) {
            // If already active, return error
            if (existing[0].is_active) {
                return res.status(400).json({
                    success: false,
                    message: 'User already assigned to this project'
                });
            }
            // If inactive, reactivate instead of inserting
            await pool.query(
                'UPDATE project_team SET is_active = 1, role_in_project = ?, allocated_hours = ?, hourly_rate = ?, joined_date = NOW(), assigned_by = ? WHERE id = ?',
                [role_in_project, allocated_hours || null, hourly_rate || null, req.user.id, existing[0].id]
            );
        } else {
            await pool.query(`
                INSERT INTO project_team (
                    project_id, user_id, role_in_project, 
                    allocated_hours, hourly_rate, joined_date, assigned_by
                ) VALUES (?, ?, ?, ?, ?, NOW(), ?)
            `, [projectId, user_id, role_in_project, allocated_hours || null, hourly_rate || null, req.user.id]);
        }

        res.status(201).json({
            success: true,
            message: 'Team member assigned successfully'
        });

    } catch (error) {
        console.error('Assign team member error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while assigning team member'
        });
    }
};

// @desc    Remove user from project team
// @route   DELETE /api/projects/:id/team/:memberId
// @access  Private (Management only)
const removeTeamMember = async (req, res) => {
    try {
        const { id: projectId, memberId } = req.params;

        const [result] = await pool.query(
            'DELETE FROM project_team WHERE project_id = ? AND id = ?',
            [projectId, memberId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Team member assignment not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Team member removed from project successfully'
        });

    } catch (error) {
        console.error('Remove team member error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while removing team member'
        });
    }
};

// @desc    Get all managers assigned to a project
// @route   GET /api/projects/:id/managers
// @access  Private (requires view_all_projects or assigned manager)
const getProjectManagers = async (req, res) => {
    try {
        const { id: projectId } = req.params;

        const [managers] = await pool.query(`
            SELECT 
                pm.*,
                u.full_name as manager_name,
                u.email as manager_email,
                r.role_name,
                assigned_by_user.full_name as assigned_by_name
            FROM project_managers pm
            JOIN users u ON pm.manager_id = u.id
            LEFT JOIN user_roles ur ON u.id = ur.user_id
            LEFT JOIN roles r ON ur.role_id = r.id
            LEFT JOIN users assigned_by_user ON pm.assigned_by = assigned_by_user.id
            WHERE pm.project_id = ? AND pm.is_active = 1
        `, [projectId]);

        res.status(200).json({
            success: true,
            count: managers.length,
            data: managers
        });

    } catch (error) {
        console.error('Get project managers error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching project managers'
        });
    }
};

// @desc    Assign a manager to a project
// @route   POST /api/projects/:id/managers
// @access  Private (requires assign_project_managers permission)
const assignProjectManager = async (req, res) => {
    try {
        const { id: projectId } = req.params;
        const { manager_id } = req.body;

        if (!manager_id) {
            return res.status(400).json({
                success: false,
                message: 'User ID is required'
            });
        }

        // Check if project exists
        const [project] = await pool.query('SELECT id FROM projects WHERE id = ?', [projectId]);
        if (project.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Project not found'
            });
        }

        // Check if user exists and is active (allow any role except client)
        const [user] = await pool.query(`
            SELECT u.id, GROUP_CONCAT(r.role_name) as roles
            FROM users u
            LEFT JOIN user_roles ur ON u.id = ur.user_id
            LEFT JOIN roles r ON ur.role_id = r.id
            WHERE u.id = ? AND u.is_active = 1
            GROUP BY u.id
        `, [manager_id]);

        if (user.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'User not found or is inactive'
            });
        }

        // Don't allow assigning clients to projects
        if (user[0].roles && user[0].roles.includes('client')) {
            return res.status(400).json({
                success: false,
                message: 'Cannot assign clients to project team'
            });
        }

        // Check if already assigned (including inactive records)
        const [existing] = await pool.query(
            'SELECT id, is_active FROM project_managers WHERE project_id = ? AND manager_id = ?',
            [projectId, manager_id]
        );

        if (existing.length > 0) {
            // If already active, return error
            if (existing[0].is_active) {
                return res.status(400).json({
                    success: false,
                    message: 'User already assigned to this project'
                });
            }
            // If inactive, reactivate instead of inserting
            await pool.query(
                'UPDATE project_managers SET is_active = 1, assigned_by = ?, assigned_at = NOW() WHERE id = ?',
                [req.user.id, existing[0].id]
            );
        } else {
            // Assign user to project
            await pool.query(`
                INSERT INTO project_managers (project_id, manager_id, assigned_by)
                VALUES (?, ?, ?)
            `, [projectId, manager_id, req.user.id]);
        }

        res.status(201).json({
            success: true,
            message: 'Team member assigned to project successfully'
        });

    } catch (error) {
        console.error('Assign project manager error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while assigning team member'
        });
    }
};

// @desc    Remove a manager from a project
// @route   DELETE /api/projects/:id/managers/:managerId
// @access  Private (requires assign_project_managers permission)
const removeProjectManager = async (req, res) => {
    try {
        const { id: projectId, managerId } = req.params;

        const [result] = await pool.query(
            'UPDATE project_managers SET is_active = 0 WHERE project_id = ? AND manager_id = ?',
            [projectId, managerId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Manager assignment not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Manager removed from project successfully'
        });

    } catch (error) {
        console.error('Remove project manager error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while removing manager'
        });
    }
};

module.exports = {
    getProjects,
    getProject,
    createProject,
    updateProject,
    getProjectTeam,
    assignTeamMember,
    removeTeamMember,
    getProjectManagers,
    assignProjectManager,
    removeProjectManager
};

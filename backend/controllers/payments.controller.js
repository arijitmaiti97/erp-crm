const { pool } = require('../config/database');

// @desc    Get all payment phases for a project
// @route   GET /api/projects/:projectId/payments
// @access  Private
const getProjectPayments = async (req, res) => {
    try {
        const projectId = req.params.projectId;
        const { roles, id: userId, permissions = [] } = req.user;

        // Check if user has access to this project
        const [project] = await pool.query('SELECT * FROM projects WHERE id = ?', [projectId]);
        
        if (project.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Project not found'
            });
        }

        // Project-based access control
        let hasAccess = false;
        const canViewAll = permissions.includes('view_all_projects');

        if (canViewAll) {
            // Super admin or users with view_all_projects permission
            hasAccess = true;
        } else if (roles.includes('management')) {
            // Management without view_all_projects - only assigned projects
            const [managerCheck] = await pool.query(
                'SELECT * FROM project_managers WHERE project_id = ? AND manager_id = ? AND is_active = 1',
                [projectId, userId]
            );
            hasAccess = managerCheck.length > 0;
        } else if (roles.includes('accountant')) {
            // Accountants can see all payments
            hasAccess = true;
        } else if (roles.includes('client')) {
            // Check if project belongs to client
            const [clientCheck] = await pool.query(
                'SELECT * FROM clients WHERE id = ? AND user_id = ?',
                [project[0].client_id, userId]
            );
            hasAccess = clientCheck.length > 0;
        } else if (roles.includes('developer') || roles.includes('ui_ux_designer')) {
            // Check if user is assigned to project
            const [teamCheck] = await pool.query(
                'SELECT * FROM project_team WHERE project_id = ? AND user_id = ?',
                [projectId, userId]
            );
            hasAccess = teamCheck.length > 0;
        }

        if (!hasAccess) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to view payments for this project'
            });
        }

        // Get payment phases with invoice information
        const [payments] = await pool.query(`
            SELECT 
                pp.*,
                i.invoice_number,
                i.invoice_date,
                i.status as invoice_status,
                p.project_name,
                p.project_number,
                c.company_name as client_name
            FROM payment_phases pp
            LEFT JOIN invoices i ON pp.id = i.payment_phase_id
            JOIN projects p ON pp.project_id = p.id
            JOIN clients c ON p.client_id = c.id
            WHERE pp.project_id = ?
            ORDER BY pp.phase_sequence ASC
        `, [projectId]);

        // Calculate summary
        const totalAmount = payments.reduce((sum, p) => sum + parseFloat(p.phase_amount), 0);
        const paidAmount = payments
            .filter(p => p.status === 'Paid')
            .reduce((sum, p) => sum + parseFloat(p.phase_amount), 0);
        const pendingAmount = totalAmount - paidAmount;

        res.status(200).json({
            success: true,
            count: payments.length,
            data: payments,
            summary: {
                total_amount: totalAmount,
                paid_amount: paidAmount,
                pending_amount: pendingAmount,
                paid_percentage: ((paidAmount / totalAmount) * 100).toFixed(2)
            }
        });

    } catch (error) {
        console.error('Get project payments error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching payments'
        });
    }
};

// @desc    Get all pending payments (for accountants)
// @route   GET /api/payments/pending
// @access  Private (Accountant, Management only)
const getPendingPayments = async (req, res) => {
    try {
        const { roles, id: userId, permissions = [] } = req.user;
        
        // Determine project filter for managers
        let projectFilter = '';
        let params = [];
        const canViewAll = permissions.includes('view_all_projects');
        
        if (!canViewAll && roles.includes('management')) {
            // Management without view_all_projects - only assigned projects
            projectFilter = `AND pp.project_id IN (
                SELECT project_id FROM project_managers 
                WHERE manager_id = ? AND is_active = 1
            )`;
            params = [userId];
        }

        const [payments] = await pool.query(`
            SELECT 
                pp.*,
                p.project_name,
                p.project_number,
                c.company_name as client_name,
                c.id as client_id,
                u.full_name as client_contact_name,
                u.email as client_email,
                u.phone as client_phone,
                DATEDIFF(pp.due_date, CURDATE()) as days_until_due
            FROM payment_phases pp
            JOIN projects p ON pp.project_id = p.id
            JOIN clients c ON p.client_id = c.id
            LEFT JOIN users u ON c.user_id = u.id
            WHERE pp.status = 'Pending' ${projectFilter}
            ORDER BY pp.due_date ASC
        `, params);

        // Categorize payments
        const overdue = payments.filter(p => p.days_until_due < 0);
        const dueToday = payments.filter(p => p.days_until_due === 0);
        const dueSoon = payments.filter(p => p.days_until_due > 0 && p.days_until_due <= 7);
        const upcoming = payments.filter(p => p.days_until_due > 7);

        res.status(200).json({
            success: true,
            count: payments.length,
            data: payments,
            categorized: {
                overdue: { count: overdue.length, items: overdue },
                due_today: { count: dueToday.length, items: dueToday },
                due_soon: { count: dueSoon.length, items: dueSoon },
                upcoming: { count: upcoming.length, items: upcoming }
            }
        });

    } catch (error) {
        console.error('Get pending payments error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching pending payments'
        });
    }
};

// @desc    Create payment phase for a project
// @route   POST /api/projects/:projectId/payments
// @access  Private (Management only)
const createPaymentPhase = async (req, res) => {
    try {
        const projectId = req.params.projectId;
        const {
            phase_name,
            phase_amount,
            phase_percentage,
            due_date,
            description
        } = req.body;

        // Validate required fields
        if (!phase_name || !phase_amount || !due_date) {
            return res.status(400).json({
                success: false,
                message: 'Please provide phase_name, phase_amount, and due_date'
            });
        }

        // Check if project exists
        const [project] = await pool.query('SELECT * FROM projects WHERE id = ?', [projectId]);
        
        if (project.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Project not found'
            });
        }

        // Get next sequence number
        const [sequenceCheck] = await pool.query(
            'SELECT MAX(phase_sequence) as max_seq FROM payment_phases WHERE project_id = ?',
            [projectId]
        );
        const nextSequence = (sequenceCheck[0].max_seq || 0) + 1;

        // Create payment phase
        const [result] = await pool.query(`
            INSERT INTO payment_phases (
                project_id, phase_name, phase_sequence, phase_amount, 
                phase_percentage, due_date, description, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            projectId,
            phase_name,
            nextSequence,
            phase_amount,
            phase_percentage || 0,
            due_date,
            description || '',
            'Pending'
        ]);

        const [newPhase] = await pool.query(
            'SELECT * FROM payment_phases WHERE id = ?',
            [result.insertId]
        );

        res.status(201).json({
            success: true,
            message: 'Payment phase created successfully',
            data: newPhase[0]
        });

    } catch (error) {
        console.error('Create payment phase error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while creating payment phase'
        });
    }
};

// @desc    Update payment phase (mark as paid/pending)
// @route   PUT /api/payments/:id
// @access  Private (Accountant, Management only)
const updatePaymentPhase = async (req, res) => {
    try {
        const paymentId = req.params.id;
        const { 
            status, 
            payment_method, 
            transaction_id, 
            payment_notes,
            amount  // actual amount paid (for partial payments)
        } = req.body;

        // Check if payment phase exists
        const [existing] = await pool.query(
            'SELECT * FROM payment_phases WHERE id = ?', 
            [paymentId]
        );
        
        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Payment phase not found'
            });
        }

        const paymentPhase = existing[0];

        // If marking as paid, create a payment transaction record
        if (status && status === 'Paid') {
            // Update payment phase status
            await pool.query(
                'UPDATE payment_phases SET status = ? WHERE id = ?',
                ['Paid', paymentId]
            );

            // Create payment transaction record
            const transactionNumber = `TXN-${new Date().getFullYear()}-${String(paymentPhase.id).padStart(6, '0')}`;
            
            // Map payment method to database ENUM values
            let dbPaymentMethod = 'Offline/3rd Party';
            if (payment_method && (payment_method.toLowerCase().includes('online') || payment_method.toLowerCase().includes('gateway'))) {
                dbPaymentMethod = 'Online';
            }
            
            await pool.query(`
                INSERT INTO payment_transactions (
                    transaction_number,
                    project_id,
                    payment_phase_id,
                    client_id,
                    amount,
                    payment_method,
                    payment_date,
                    payment_reference_number,
                    bank_name,
                    verification_notes,
                    verified_by,
                    payment_status
                )
                SELECT 
                    ? as transaction_number,
                    ? as project_id,
                    ? as payment_phase_id,
                    p.client_id,
                    ? as amount,
                    ? as payment_method,
                    NOW() as payment_date,
                    ? as payment_reference_number,
                    ? as bank_name,
                    ? as verification_notes,
                    ? as verified_by,
                    'Verified' as payment_status
                FROM projects p WHERE p.id = ?
            `, [
                transactionNumber,
                paymentPhase.project_id,
                paymentId,
                amount || paymentPhase.phase_amount,
                dbPaymentMethod,
                transaction_id || transactionNumber,
                payment_method || 'Cash',  // Store original payment method in bank_name field
                payment_notes || '',
                req.user.id,
                paymentPhase.project_id
            ]);
        } else {
            // Just update status for other cases
            await pool.query(
                'UPDATE payment_phases SET status = ? WHERE id = ?',
                [status || paymentPhase.status, paymentId]
            );
        }

        // Get updated payment phase with transaction details
        const [updatedPhase] = await pool.query(`
            SELECT 
                pp.*,
                pt.transaction_number,
                pt.payment_method,
                pt.bank_name as payment_method_detail,
                pt.payment_reference_number,
                pt.payment_date,
                pt.verification_notes as payment_notes,
                pt.payment_status
            FROM payment_phases pp
            LEFT JOIN payment_transactions pt ON pp.id = pt.payment_phase_id
            WHERE pp.id = ?
            ORDER BY pt.payment_date DESC
            LIMIT 1
        `, [paymentId]);

        res.status(200).json({
            success: true,
            message: 'Payment phase updated successfully',
            data: updatedPhase[0]
        });

    } catch (error) {
        console.error('Update payment phase error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while updating payment phase'
        });
    }
};

// @desc    Delete payment phase
// @route   DELETE /api/payments/:id
// @access  Private (Management only)
const deletePaymentPhase = async (req, res) => {
    try {
        const paymentId = req.params.id;

        // Check if payment exists
        const [existing] = await pool.query('SELECT * FROM payment_phases WHERE id = ?', [paymentId]);
        
        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Payment phase not found'
            });
        }

        // Don't allow deletion if payment is already paid
        if (existing[0].status === 'Paid') {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete a paid payment phase'
            });
        }

        await pool.query('DELETE FROM payment_phases WHERE id = ?', [paymentId]);

        res.status(200).json({
            success: true,
            message: 'Payment phase deleted successfully'
        });

    } catch (error) {
        console.error('Delete payment phase error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while deleting payment phase'
        });
    }
};

// @desc    Get payment statistics (for dashboard with project-based filtering)
// @route   GET /api/payments/stats
// @access  Private (Accountant, Management only)
const getPaymentStats = async (req, res) => {
    try {
        const { roles, id: userId, permissions = [] } = req.user;
        
        // Determine project filter
        let projectFilter = '';
        let params = [];
        const canViewAll = permissions.includes('view_all_projects');
        
        if (!canViewAll && roles.includes('management')) {
            // Management without view_all_projects - only assigned projects
            projectFilter = `AND pp.project_id IN (
                SELECT project_id FROM project_managers 
                WHERE manager_id = ? AND is_active = 1
            )`;
            params = [userId];
        }

        // Total revenue
        const [totalRevenue] = await pool.query(`
            SELECT COALESCE(SUM(phase_amount), 0) as total 
            FROM payment_phases pp
            WHERE status = 'Paid' ${projectFilter}
        `, params);

        // Pending revenue
        const [pendingRevenue] = await pool.query(`
            SELECT COALESCE(SUM(phase_amount), 0) as total 
            FROM payment_phases pp
            WHERE status = 'Pending' ${projectFilter}
        `, params);

        // Overdue payments
        const [overduePayments] = await pool.query(`
            SELECT COUNT(*) as count, COALESCE(SUM(phase_amount), 0) as total
            FROM payment_phases pp
            WHERE status = 'Pending' AND due_date < CURDATE() ${projectFilter}
        `, params);

        // This month's collections
        const [monthlyCollections] = await pool.query(`
            SELECT COALESCE(SUM(phase_amount), 0) as total 
            FROM payment_phases pp
            WHERE status = 'Paid' 
            AND MONTH(created_at) = MONTH(CURDATE())
            AND YEAR(created_at) = YEAR(CURDATE())
            ${projectFilter}
        `, params);

        // Payment by client (with project filtering)
        const clientPaymentsQuery = `
            SELECT 
                c.company_name,
                c.id as client_id,
                COALESCE(SUM(CASE WHEN pp.status = 'Paid' THEN pp.phase_amount ELSE 0 END), 0) as paid_amount,
                COALESCE(SUM(CASE WHEN pp.status = 'Pending' THEN pp.phase_amount ELSE 0 END), 0) as pending_amount
            FROM clients c
            JOIN projects p ON c.id = p.client_id
            JOIN payment_phases pp ON p.id = pp.project_id
            ${!canViewAll && roles.includes('management') ? 
                'WHERE p.id IN (SELECT project_id FROM project_managers WHERE manager_id = ? AND is_active = 1)' : 
                ''}
            GROUP BY c.id, c.company_name
            ORDER BY pending_amount DESC
        `;
        const [clientPayments] = await pool.query(clientPaymentsQuery, params);

        res.status(200).json({
            success: true,
            data: {
                total_revenue: parseFloat(totalRevenue[0].total),
                pending_revenue: parseFloat(pendingRevenue[0].total),
                overdue_count: parseInt(overduePayments[0].count),
                overdue_amount: parseFloat(overduePayments[0].total),
                monthly_collections: parseFloat(monthlyCollections[0].total),
                client_payments: clientPayments
            }
        });

    } catch (error) {
        console.error('Get payment stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching payment statistics'
        });
    }
};

module.exports = {
    getProjectPayments,
    getPendingPayments,
    createPaymentPhase,
    updatePaymentPhase,
    deletePaymentPhase,
    getPaymentStats
};

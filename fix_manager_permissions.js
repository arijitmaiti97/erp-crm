/**
 * Fix Manager Permissions
 * Remove view_all_projects from management role so they only see assigned projects
 */

const mysql = require('mysql2/promise');
require('dotenv').config();

async function fixManagerPermissions() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'erp_crm_db'
    });

    try {
        console.log('🔧 Fixing manager permissions...\n');

        // Remove view_all_projects permission from management role
        const [result] = await connection.query(`
            DELETE FROM role_permissions 
            WHERE role_id = (SELECT id FROM roles WHERE role_name = 'management')
            AND permission_id = (SELECT id FROM permissions WHERE permission_name = 'view_all_projects')
        `);

        console.log(`✅ Removed view_all_projects from management role (${result.affectedRows} rows)`);
        
        // Verify current permissions for management role
        const [permissions] = await connection.query(`
            SELECT p.permission_name, p.permission_description
            FROM role_permissions rp
            JOIN permissions p ON rp.permission_id = p.id
            JOIN roles r ON rp.role_id = r.id
            WHERE r.role_name = 'management'
            ORDER BY p.permission_name
        `);

        console.log('\n📋 Current management role permissions:');
        permissions.forEach(p => {
            console.log(`  ✓ ${p.permission_name} - ${p.permission_description}`);
        });

        console.log('\n✅ Fix complete!');
        console.log('\n📌 Now managers will only see projects assigned to them via project_managers table');
        console.log('📌 Super admin still has view_all_projects and can see everything\n');

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    } finally {
        await connection.end();
    }
}

fixManagerPermissions();

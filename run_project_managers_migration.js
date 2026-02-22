const mysql = require('mysql2/promise');
const fs = require('fs').promises;
const path = require('path');

async function runMigration() {
    const connection = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: 'root',
        database: 'erp_crm_db',
        multipleStatements: true
    });

    console.log('📁 Reading migration file...');
    const sqlPath = path.join(__dirname, '..', 'database', 'migrations', 'create_project_managers.sql');
    const sql = await fs.readFile(sqlPath, 'utf8');

    console.log('🔄 Running project_managers migration...');
    await connection.query(sql);

    console.log('✅ Migration completed successfully!');
    console.log('📊 Checking created data...');

    const [managers] = await connection.query(`
        SELECT pm.*, p.project_name, u.full_name as manager_name
        FROM project_managers pm
        JOIN projects p ON pm.project_id = p.id
        JOIN users u ON pm.manager_id = u.id
        WHERE pm.is_active = 1
    `);

    console.log(`\n✅ Found ${managers.length} project manager assignments:`);
    managers.forEach(m => {
        console.log(`   👤 ${m.manager_name} → 📁 ${m.project_name}`);
    });

    await connection.end();
}

runMigration().catch(err => {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
});

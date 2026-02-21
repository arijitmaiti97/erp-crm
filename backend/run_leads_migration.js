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

    console.log('📁 Reading leads management migration file...');
    const sqlPath = path.join(__dirname, '..', 'database', 'migrations', 'create_leads_management.sql');
    const sql = await fs.readFile(sqlPath, 'utf8');

    console.log('🔄 Running leads management migration...');
    const [results] = await connection.query(sql);

    console.log('✅ Migration completed successfully!');
    
    // Display results
    if (Array.isArray(results)) {
        results.forEach((result, index) => {
            if (result && result.length > 0) {
                console.log(`\nResult ${index + 1}:`);
                console.table(result);
            }
        });
    }

    await connection.end();
}

runMigration().catch(err => {
    console.error('❌ Migration failed:', err.message);
    console.error(err);
    process.exit(1);
});

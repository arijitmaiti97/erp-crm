const mysql = require('mysql2/promise');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

async function recreateLeadsTables() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true
  });

  try {
    console.log('\n🗑️  Dropping old leads tables...\n');
    
    // Drop tables in correct order (foreign keys first)
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    await connection.query('DROP TABLE IF EXISTS lead_notes');
    await connection.query('DROP TABLE IF EXISTS lead_activities');
    await connection.query('DROP TABLE IF EXISTS leads');
    await connection.query('DROP TABLE IF EXISTS lead_sources');
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    
    console.log('✅ Old tables dropped\n');
    
    console.log('📁 Reading leads management migration file...');
    const migrationPath = path.join(__dirname, '..', 'database', 'migrations', 'create_leads_management.sql');
    const migrationSQL = await fs.readFile(migrationPath, 'utf8');
    
    console.log('🔄 Creating new leads tables...\n');
    const results = await connection.query(migrationSQL);
    
    console.log('✅ Leads tables created successfully!\n');
    
    // Verify structure
    const [columns] = await connection.query('SHOW COLUMNS FROM leads');
    console.log('📋 Verified columns:');
    const columnNames = columns.map(c => c.Field);
    
    const requiredColumns = ['status', 'priority', 'source_id', 'estimated_value'];
    requiredColumns.forEach(col => {
      if (columnNames.includes(col)) {
        console.log(`   ✅ ${col}`);
      } else {
        console.log(`   ❌ ${col} - MISSING!`);
      }
    });
    
    // Check data
    const [count] = await connection.query('SELECT COUNT(*) as total FROM leads');
    console.log(`\n📊 Total leads: ${count[0].total}`);
    
    const [sources] = await connection.query('SELECT COUNT(*) as total FROM lead_sources');
    console.log(`📊 Total sources: ${sources[0].total}\n`);
    
    console.log('✨ Migration completed successfully!\n');
    
    await connection.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    await connection.end();
    process.exit(1);
  }
}

recreateLeadsTables();

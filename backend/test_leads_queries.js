const mysql = require('mysql2/promise');
require('dotenv').config();

async function testLeads() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  try {
    console.log('\n🔍 Testing Leads Table...\n');
    
    // Check if table exists
    const [tables] = await connection.query(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'leads'
    `, [process.env.DB_NAME]);
    
    if (tables.length === 0) {
      console.log('❌ Leads table does NOT exist!');
      await connection.end();
      return;
    }
    
    console.log('✅ Leads table exists');
    
    // Count leads
    const [count] = await connection.query('SELECT COUNT(*) as total FROM leads');
    console.log(`📊 Total leads: ${count[0].total}`);
    
    // Test the stats query
    console.log('\n🧪 Testing stats query...');
    const [stats] = await connection.query(`
      SELECT 
        COUNT(*) as total_leads,
        SUM(CASE WHEN status = 'New' THEN 1 ELSE 0 END) as new_count,
        SUM(CASE WHEN status = 'Won' THEN 1 ELSE 0 END) as won_count
      FROM leads
      WHERE 1=1
    `);
    
    console.log('✅ Stats query works:', stats[0]);
    
    // Test source distribution query
    console.log('\n🧪 Testing source distribution query...');
   const [sources] = await connection.query(`
      SELECT 
        ls.source_name,
        COUNT(l.id) as lead_count
      FROM lead_sources ls
      LEFT JOIN leads l ON ls.id = l.source_id AND 1=1
      GROUP BY ls.id, ls.source_name
      HAVING lead_count > 0
      ORDER BY lead_count DESC
    `);
    
    console.log(`✅ Found ${sources.length} sources with leads`);
    
    console.log('\n✨ All tests passed!');
    
    await connection.end();
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('Full error:', error);
    await connection.end();
    process.exit(1);
  }
}

testLeads();

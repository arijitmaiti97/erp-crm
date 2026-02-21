const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkTableStructure() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  try {
    console.log('\n📋 Leads Table Structure:\n');
    
    const [columns] = await connection.query(`
      SHOW COLUMNS FROM leads
    `);
    
    console.log('Columns:');
    columns.forEach(col => {
      console.log(`  - ${col.Field} (${col.Type})`);
    });
    
    await connection.end();
  } catch (error) {
    console.error('Error:', error.message);
    await connection.end();
  }
}

checkTableStructure();

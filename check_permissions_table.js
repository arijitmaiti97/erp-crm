const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkPermissionsTable() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  try {
    const [columns] = await connection.query('SHOW COLUMNS FROM permissions');
    console.log('\n📋 Permissions Table Structure:\n');
    columns.forEach(col => {
      console.log(`  - ${col.Field} (${col.Type})${col.Null === 'NO' ? ' NOT NULL' : ''}`);
    });
    
    await connection.end();
  } catch (error) {
    console.error('Error:', error.message);
    await connection.end();
  }
}

checkPermissionsTable();

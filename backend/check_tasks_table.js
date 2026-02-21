const mysql = require('mysql2/promise');

async function checkTasksTable() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'root',
    database: 'erp_crm_db'
  });

  console.log('\n🔍 Checking tasks table structure...\n');

  try {
    const [columns] = await connection.query("DESCRIBE tasks");
    console.log('Tasks table columns:');
    columns.forEach(col => {
      console.log(`  - ${col.Field} (${col.Type})`);
    });
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await connection.end();
  }
}

checkTasksTable();

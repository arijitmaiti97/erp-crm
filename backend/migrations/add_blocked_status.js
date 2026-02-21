const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'erp_crm_db'
};

async function addBlockedStatus() {
  let connection;

  try {
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Connected to database');

    // Modify the status enum to include 'Blocked'
    await connection.query(`
      ALTER TABLE tasks 
      MODIFY COLUMN status ENUM('To Do', 'In Progress', 'Blocked', 'In Review', 'Completed', 'Cancelled') 
      DEFAULT 'To Do'
    `);
    
    console.log('✅ Added "Blocked" status to tasks table');
    console.log('\n📋 Current status values:');
    console.log('   - To Do');
    console.log('   - In Progress');
    console.log('   - Blocked (NEW)');
    console.log('   - In Review');
    console.log('   - Completed');
    console.log('   - Cancelled');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

addBlockedStatus()
  .then(() => {
    console.log('\n✅ Migration completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  });

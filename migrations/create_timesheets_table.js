const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'erp_crm_db'
};

async function createTimesheetsTable() {
  let connection;

  try {
    connection = await mysql.createConnection(dbConfig);
    console.log('✅ Connected to database');

    // Create timesheets table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS timesheets (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        date DATE NOT NULL,
        hours DECIMAL(5,2) NOT NULL,
        description TEXT,
        project_id INT NULL,
        task_id INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL,
        INDEX idx_user_date (user_id, date),
        INDEX idx_date (date),
        INDEX idx_project (project_id),
        INDEX idx_task (task_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    
    console.log('✅ Timesheets table created successfully');
    console.log('\n📋 Table structure:');
    console.log('   - id: Auto-increment primary key');
    console.log('   - user_id: Who logged the time');
    console.log('   - date: Work date');
    console.log('   - hours: Hours worked (decimal)');
    console.log('   - description: What they worked on');
    console.log('   - project_id: Optional project reference');
    console.log('   - task_id: Optional task reference');
    console.log('   - created_at/updated_at: Timestamps');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

createTimesheetsTable()
  .then(() => {
    console.log('\n✅ Timesheet module database ready!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  });

/**
 * Migration: Add Task Accept/Reject Workflow Columns
 * 
 * This migration adds columns to support task acceptance/rejection workflow:
 * - accepted_at: Timestamp when task was accepted
 * - rejected_at: Timestamp when task was rejected
 * - rejection_reason: Text explaining why task was rejected
 */

const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const addTaskAcceptanceWorkflow = async () => {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'erp_crm_db'
  });
  
  try {
    console.log('🔄 Adding task acceptance workflow columns...');
    
    await connection.beginTransaction();
    
    // Add new columns for task acceptance workflow
    await connection.query(`
      ALTER TABLE tasks
      ADD COLUMN accepted_at TIMESTAMP NULL AFTER status,
      ADD COLUMN rejected_at TIMESTAMP NULL AFTER accepted_at,
      ADD COLUMN rejection_reason TEXT NULL AFTER rejected_at
    `);
    
    // Add index for better query performance
    await connection.query(`
      ALTER TABLE tasks
      ADD INDEX idx_accepted_at (accepted_at),
      ADD INDEX idx_rejected_at (rejected_at)
    `);
    
    await connection.commit();
    
    console.log('✅ Task acceptance workflow columns added successfully!');
    console.log('   - accepted_at: Timestamp when task is accepted');
    console.log('   - rejected_at: Timestamp when task is rejected');
    console.log('   - rejection_reason: Reason for rejection');
    
    process.exit(0);
    
  } catch (error) {
    await connection.rollback();
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await connection.end();
  }
};

// Run migration
addTaskAcceptanceWorkflow();

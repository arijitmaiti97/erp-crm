/**
 * Migration: Add Task Time Tracking Columns
 * 
 * This migration adds columns to support task time tracking:
 * - started_at: When task work actually started
 * - paused_at: When task was paused
 * - pause_reason: Why the task was paused
 * - total_paused_duration: Total time in seconds the task was paused
 * - completed_duration: Total time in seconds from start to completion
 */

const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const addTaskTimeTracking = async () => {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'erp_crm_db'
  });
  
  try {
    console.log('🔄 Adding task time tracking columns...');
    
    await connection.beginTransaction();
    
    // Add new columns for task time tracking
    await connection.query(`
      ALTER TABLE tasks
      ADD COLUMN started_at TIMESTAMP NULL AFTER accepted_at,
      ADD COLUMN paused_at TIMESTAMP NULL AFTER started_at,
      ADD COLUMN pause_reason TEXT NULL AFTER paused_at,
      ADD COLUMN total_paused_duration INT DEFAULT 0 COMMENT 'Total paused time in seconds' AFTER pause_reason,
      ADD COLUMN completed_duration INT DEFAULT 0 COMMENT 'Total work duration in seconds' AFTER total_paused_duration
    `);
    
    // Add indexes for better query performance
    await connection.query(`
      ALTER TABLE tasks
      ADD INDEX idx_started_at (started_at),
      ADD INDEX idx_paused_at (paused_at)
    `);
    
    await connection.commit();
    
    console.log('✅ Task time tracking columns added successfully!');
    console.log('   - started_at: When actual work started');
    console.log('   - paused_at: When task was paused');
    console.log('   - pause_reason: Reason for pausing');
    console.log('   - total_paused_duration: Total time paused (seconds)');
    console.log('   - completed_duration: Total work time (seconds)');
    
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
addTaskTimeTracking();

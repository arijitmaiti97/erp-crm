const mysql = require('mysql2/promise');
require('dotenv').config();

async function addTeamPermissions() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  try {
    console.log('\n🔐 Adding Team Management Permissions...\n');
    
    // Add manage_users permission
    await connection.query(`
      INSERT INTO permissions (permission_name, module)
      VALUES ('manage_users', 'Team Management')
      ON DUPLICATE KEY UPDATE permission_name = permission_name
    `);
    
    console.log('✅ Permission added: manage_users');
    
    // Grant to super_admin
    await connection.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id
      FROM roles r, permissions p
      WHERE r.role_name = 'super_admin' AND p.permission_name = 'manage_users'
      ON DUPLICATE KEY UPDATE role_id = role_id
    `);
    
    console.log('✅ Granted to: super_admin');
    
    // Grant to management
    await connection.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id
      FROM roles r, permissions p
      WHERE r.role_name = 'management' AND p.permission_name = 'manage_users'
      ON DUPLICATE KEY UPDATE role_id = role_id
    `);
    
    console.log('✅ Granted to: management');
    
    console.log('\n✨ Team management permissions configured!\n');
    
    await connection.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
    await connection.end();
    process.exit(1);
  }
}

addTeamPermissions();

const mysql = require('mysql2/promise');

async function checkPermissions() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'root',
    database: 'erp_crm_db'
  });

  console.log('\n🔍 Checking Payment Permissions for Management Role...\n');

  // Check if view_all_payments permission exists
  const [permissions] = await connection.query(
    "SELECT * FROM permissions WHERE permission_name = 'view_all_payments'"
  );
  
  if (permissions.length === 0) {
    console.log('❌ Permission "view_all_payments" does NOT exist in database');
    console.log('\n📋 Available permissions:');
    const [allPerms] = await connection.query("SELECT permission_name FROM permissions");
    allPerms.forEach(p => console.log(`  - ${p.permission_name}`));
  } else {
    console.log('✅ Permission "view_all_payments" exists');
    
    // Check if management role has this permission
    const [rolePerms] = await connection.query(`
      SELECT r.role_name, p.permission_name 
      FROM role_permissions rp 
      JOIN roles r ON rp.role_id = r.id 
      JOIN permissions p ON rp.permission_id = p.id 
      WHERE r.role_name = 'management' AND p.permission_name LIKE '%payment%'
    `);
    
    if (rolePerms.length === 0) {
      console.log('❌ Management role does NOT have view_all_payments permission');
    } else {
      console.log('✅ Management role has payment permissions:');
      rolePerms.forEach(rp => console.log(`  - ${rp.permission_name}`));
    }
  }

  await connection.end();
}

checkPermissions().catch(console.error);

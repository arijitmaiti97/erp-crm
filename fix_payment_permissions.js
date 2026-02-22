const mysql = require('mysql2/promise');

async function fixPaymentPermissions() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'root',
    database: 'erp_crm_db'
  });

  console.log('\n🔧 Adding Payment Permissions to Management Role...\n');

  try {
    // Get management role ID
    const [managementRole] = await connection.query(
      "SELECT id FROM roles WHERE role_name = 'management'"
    );
    
    if (managementRole.length === 0) {
      console.log('❌ Management role not found');
      return;
    }
    
    const roleId = managementRole[0].id;
    
    // Get payment-related permissions
    const paymentPermissions = [
      'view_all_payments',
      'verify_payments'
    ];
    
    for (const permName of paymentPermissions) {
      const [perm] = await connection.query(
        "SELECT id FROM permissions WHERE permission_name = ?",
        [permName]
      );
      
      if (perm.length === 0) {
        console.log(`⚠️  Permission "${permName}" not found, skipping...`);
        continue;
      }
      
      const permId = perm[0].id;
      
      // Check if already assigned
      const [existing] = await connection.query(
        "SELECT * FROM role_permissions WHERE role_id = ? AND permission_id = ?",
        [roleId, permId]
      );
      
      if (existing.length > 0) {
        console.log(`✅ Management already has "${permName}"`);
      } else {
        // Add the permission
        await connection.query(
          "INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)",
          [roleId, permId]
        );
        console.log(`✅ Added "${permName}" to management role`);
      }
    }
    
    console.log('\n✅ Payment permissions configured successfully!\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await connection.end();
  }
}

fixPaymentPermissions();

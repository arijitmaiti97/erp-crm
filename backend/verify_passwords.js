const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
require('dotenv').config();

async function verifyPasswords() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  try {
    console.log('\n🔐 Verifying User Passwords...\n');
    
    // Get all users
    const [users] = await connection.query(
      'SELECT id, email, password_hash, full_name FROM users ORDER BY id'
    );

    // Test passwords
    const testPasswords = ['password123', 'Test@123', 'admin123', 'Password@123'];
    
    console.log('Testing passwords for each user:\n');
    
    for (const user of users) {
      console.log(`\n📧 ${user.email} (${user.full_name})`);
      console.log(`   Hash: ${user.password_hash.substring(0, 25)}...`);
      
      let foundPassword = false;
      for (const testPwd of testPasswords) {
        const isMatch = await bcrypt.compare(testPwd, user.password_hash);
        if (isMatch) {
          console.log(`   ✅ PASSWORD: ${testPwd}`);
          foundPassword = true;
          break;
        }
      }
      
      if (!foundPassword) {
        console.log(`   ❌ Password not found in common list`);
      }
    }

    console.log('\n\n💡 Summary:');
    console.log('If you need to reset all passwords to "password123", run:');
    console.log('node reset_all_passwords.js\n');
    
    await connection.end();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

verifyPasswords();

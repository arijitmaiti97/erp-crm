const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');

async function fixPasswords() {
    try {
        // Connect to database
        const connection = await mysql.createConnection({
            host: 'localhost',
            user: 'root',
            password: 'root',
            database: 'erp_crm_db'
        });

        console.log('Connected to database');

        // Hash the password
        const password = 'Test@123';
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(password, salt);
        
        console.log('Generated hash:', hash);

        // Update all users with the same password
        const [result] = await connection.execute(
            'UPDATE users SET password_hash = ?',
            [hash]
        );

        console.log(`Updated ${result.affectedRows} users`);

        // Verify
        const [users] = await connection.execute('SELECT id, email FROM users');
        console.log('\nUpdated users:');
        users.forEach(user => {
            console.log(`- ${user.email} (ID: ${user.id})`);
        });

        await connection.end();
        console.log('\nPassword fix completed!');
        console.log('All users now have password: Test@123');

    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

fixPasswords();

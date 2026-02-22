const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const { testConnection } = require('./config/database');
const errorHandler = require('./middleware/errorHandler');

// Load environment variables
dotenv.config();

// Initialize express app
const app = express();

// Middleware
app.use(cors({
    origin: [
        process.env.CLIENT_PORTAL_URL,
        process.env.ERP_PORTAL_URL
    ],
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/projects', require('./routes/projects.routes'));
app.use('/api/payments', require('./routes/payments.routes'));
app.use('/api/clients', require('./routes/clients.routes'));
app.use('/api/tasks', require('./routes/tasks.routes'));
app.use('/api/leads', require('./routes/leads.routes'));
app.use('/api/team', require('./routes/team.routes'));
app.use('/api/timesheets', require('./routes/timesheets.routes'));

// Health check route
app.get('/api/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'ERP/CRM API is running',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV
    });
});

// Serve static files from React build folder
app.use(express.static(path.join(__dirname, 'build')));

// SPA fallback - serve React's index.html for any route not matched above
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

// Error handler middleware (must be last)
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 5000;

const startServer = async () => {
    // Test database connection first
    const dbConnected = await testConnection();
    
    if (!dbConnected) {
        console.error('❌ Cannot start server - database connection failed');
        process.exit(1);
    }

    app.listen(PORT, () => {
        console.log('');
        console.log('================================================');
        console.log(`🚀 Server running in ${process.env.NODE_ENV} mode`);
        console.log(`📡 Port: ${PORT}`);
        console.log(`🌐 API URL: http://localhost:${PORT}/api`);
        console.log('================================================');
        console.log('');
        console.log('📋 Available Routes:');
        console.log('   Authentication:');
        console.log('   POST   /api/auth/login');
        console.log('   GET    /api/auth/me');
        console.log('   POST   /api/auth/logout');
        console.log('');
        console.log('   Projects:');
        console.log('   GET    /api/projects');
        console.log('   GET    /api/projects/:id');
        console.log('   POST   /api/projects');
        console.log('   PUT    /api/projects/:id');
        console.log('   GET    /api/projects/:id/team');
        console.log('   POST   /api/projects/:id/team');
        console.log('   GET    /api/projects/:projectId/payments');
        console.log('   POST   /api/projects/:projectId/payments');
        console.log('');
        console.log('   Payments:');
        console.log('   GET    /api/payments/stats');
        console.log('   GET    /api/payments/pending');
        console.log('   PUT    /api/payments/:id');
        console.log('   DELETE /api/payments/:id');
        console.log('');
        console.log('   Health:');
        console.log('   GET    /api/health');
        console.log('');
    });
};

startServer();

# ERP/CRM Backend API

Express.js REST API with MySQL database, JWT authentication, and role-based access control (RBAC).

## Features

- ✅ JWT Authentication
- ✅ Multi-role RBAC (one user can have multiple roles)
- ✅ Permission-based access control
- ✅ MySQL database with connection pooling
- ✅ Express.js REST API
- ✅ CORS enabled for frontend integration
- ✅ Error handling middleware

## Installation

```bash
npm install
```

## Configuration

Create `.env` file (already created):
- PORT, DATABASE, JWT settings configured

## Running the Server

```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login with email & password
- `GET /api/auth/me` - Get current user info (Protected)
- `POST /api/auth/logout` - Logout (Protected)

### Health Check
- `GET /api/health` - Server health status

## Testing Authentication

### 1. Login
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@company.com",
    "password": "password123"
  }'
```

Response:
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "eyJhbGc...",
    "user": {
      "id": 1,
      "email": "admin@company.com",
      "full_name": "John Owner",
      "roles": ["super_admin"],
      "role_display_names": ["Super Admin"]
    }
  }
}
```

### 2. Get Current User
```bash
curl http://localhost:5000/api/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

## Sample Users

| Email | Password | Roles |
|-------|----------|-------|
| admin@company.com | password123 | Super Admin |
| manager@company.com | password123 | Management |
| dev1@company.com | password123 | Developer |
| accountant@company.com | password123 | Accountant, Marketing |
| client1@example.com | password123 | Client |

## Next Steps

- [ ] Create project management endpoints
- [ ] Create payment verification endpoints
- [ ] Create lead management endpoints
- [ ] Create timesheet endpoints
- [ ] Implement file upload for payments
- [ ] Add Socket.io for real-time chat
- [ ] Create frontend React apps

## Project Structure

```
./
├── config/
│   └── database.js          # MySQL connection pool
├── controllers/
│   └── auth.controller.js   # Authentication logic
├── middleware/
│   ├── auth.js              # JWT verification
│   ├── rbac.js              # Role & permission checks
│   └── errorHandler.js      # Global error handler
├── routes/
│   └── auth.routes.js       # Auth endpoints
├── utils/
│   └── jwtHelper.js         # JWT token helper
├── .env                     # Environment variables
├── package.json
└── server.js                # Entry point
```

## Multi-Role Example

User "Neha Finance" (accountant@company.com) has TWO roles:
- Accountant - Can verify payments, view financials
- Marketing - Can manage leads, social media

The API returns all roles and combined permissions for such users.

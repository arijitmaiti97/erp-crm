# Postman Setup Guide

## Quick Import

1. **Open Postman**
2. Click **Import** button (top left)
3. Select file: `ERP_CRM_API.postman_collection.json`
4. Collection imported! ✅

## What's Included

The collection includes:

### 📁 Authentication Folder
- **Login - Admin** (Super Admin with all permissions)
- **Login - Manager** (Management role)
- **Login - Developer** (Developer role)
- **Login - Accountant** (Multi-role: Accountant + Marketing!)
- **Login - Client** (Client role)
- **Get Current User** (Shows roles & permissions)
- **Logout**

### 📁 Health Check Folder
- **Server Health** (Check if API is running)

## Usage Instructions

### Step 1: Test Server Health
1. Open "Health Check" folder
2. Click "Server Health"
3. Click **Send**
4. You should see: `"message": "ERP/CRM API is running"`

### Step 2: Login
1. Open "Authentication" folder
2. Click **"Login - Admin"**
3. Click **Send**
4. **Token is automatically saved!** 🎉

The request has a test script that automatically saves the JWT token to an environment variable.

### Step 3: Get User Info
1. Click **"Get Current User"**
2. Click **Send**
3. See your user details, roles, and all permissions!

The `Authorization: Bearer {{jwt_token}}` header is automatically added using the saved token.

### Step 4: Test Multi-Role User
1. Click **"Login - Accountant (Multi-role)"**
2. Click **Send**
3. Then click **"Get Current User"**
4. You'll see this user has BOTH "accountant" AND "marketing" roles! 🎯

## Auto-Save Token Feature

Each login request has this test script:
```javascript
if (pm.response.code === 200) {
    var jsonData = pm.response.json();
    pm.environment.set("jwt_token", jsonData.data.token);
    pm.environment.set("user_id", jsonData.data.user.id);
    pm.environment.set("user_email", jsonData.data.user.email);
}
```

This means you don't have to manually copy/paste tokens! 🚀

## Environment Variables

The collection uses these variables:

| Variable | Value | Description |
|----------|-------|-------------|
| `base_url` | http://localhost:5000 | API server URL |
| `jwt_token` | (auto-saved) | JWT authentication token |
| `user_id` | (auto-saved) | Current user ID |
| `user_email` | (auto-saved) | Current user email |

To view/edit variables:
1. Click the collection name
2. Go to **Variables** tab
3. Change `base_url` if your server runs on different port

## Testing Different Users

Try logging in with different users to see different roles and permissions:

### Super Admin (All Permissions)
```json
{
    "email": "admin@company.com",
    "password": "password123"
}
```

### Management (Project & Team Management)
```json
{
    "email": "manager@company.com",
    "password": "password123"
}
```

### Developer (View Projects, Submit Timesheets)
```json
{
    "email": "dev1@company.com",
    "password": "password123"
}
```

### Accountant + Marketing (Multi-Role!)
```json
{
    "email": "accountant@company.com",
    "password": "password123"
}
```

### Client (Limited Access)
```json
{
    "email": "client1@example.com",
    "password": "password123"
}
```

## Expected Responses

### Login Success
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 1,
      "email": "admin@company.com",
      "full_name": "John Owner",
      "phone": "+91-9876543210",
      "roles": ["super_admin"],
      "role_display_names": ["Super Admin"],
      "is_email_verified": true
    }
  }
}
```

### Get Current User
```json
{
  "success": true,
  "data": {
    "id": 1,
    "email": "admin@company.com",
    "full_name": "John Owner",
    "roles": ["super_admin"],
    "role_display_names": ["Super Admin"],
    "permissions": [
      "view_all_projects",
      "create_project",
      "edit_project",
      ...25 permissions total
    ]
  }
}
```

### Multi-Role Example (Accountant)
```json
{
  "roles": ["accountant", "marketing"],
  "role_display_names": ["Accountant", "Marketing"],
  "permissions": [
    "view_all_payments",
    "verify_payments",
    "create_invoice",
    "view_financial_reports",
    "view_all_projects",
    "view_leads",
    "create_lead",
    "edit_lead",
    "assign_lead",
    "view_social_media",
    "edit_social_media"
  ]
}
```

## Tips

1. **Always login first** before testing protected endpoints
2. **Token expires in 7 days** (configured in .env)
3. **Switch users easily** - Just click a different login request
4. **Watch the Console** - Token is logged when saved
5. **Check Authorization tab** - See the Bearer token being sent

## Troubleshooting

### "Not authorized" error?
- Make sure you've logged in first
- Check if `{{jwt_token}}` variable is set
- Go to collection Variables tab and verify token exists

### "Cannot connect" error?
- Make sure backend server is running: `npm run dev`
- Check if server is on port 5000
- Verify with Health Check endpoint first

### Token expired?
- Just login again
- New token will be auto-saved

---

## Next: Add More Endpoints

As you create more API endpoints for:
- Projects
- Payments
- Leads
- Timesheets
- Chat

Just add them to this collection and they'll automatically use the saved JWT token! 🎉

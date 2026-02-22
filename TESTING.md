# Backend API - Testing Guide

## Server is Running ✅

Server URL: `http://localhost:5000`

## Test with PowerShell

### 1. Test Server Health
```powershell
Invoke-RestMethod -Uri "http://localhost:5000/api/health"
```

### 2. Login and Get Token
```powershell
$loginResponse = Invoke-RestMethod -Uri "http://localhost:5000/api/auth/login" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"email":"admin@company.com","password":"password123"}'

# Display response
$loginResponse | ConvertTo-Json -Depth 10

# Save token for next requests
$token = $loginResponse.data.token
Write-Host "Token: $token"
```

### 3. Get Current User Info
```powershell
$headers = @{
    "Authorization" = "Bearer $token"
}

$userInfo = Invoke-RestMethod -Uri "http://localhost:5000/api/auth/me" `
  -Headers $headers

$userInfo | ConvertTo-Json -Depth 10
```

### 4. Test Multi-Role User
```powershell
# Login as accountant (has 2 roles)
$multiRoleLogin = Invoke-RestMethod -Uri "http://localhost:5000/api/auth/login" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"email":"accountant@company.com","password":"password123"}'

$multiRoleLogin.data.user | Format-List
```

## Test with cURL (Git Bash / WSL)

### 1. Login
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@company.com","password":"password123"}'
```

### 2. Get User Info (replace TOKEN with actual token)
```bash
TOKEN="YOUR_TOKEN_HERE"

curl http://localhost:5000/api/auth/me \
  -H "Authorization: Bearer $TOKEN"
```

## Sample Responses

### Login Response
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwicm9sZXMiOlsic3VwZXJfYWRtaW4iXSwiaWF0IjoxNzM4NzY3MzQyfQ.xYz123...",
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

### Get Me Response
```json
{
  "success": true,
  "data": {
    "id": 1,
    "email": "admin@company.com",
    "full_name": "John Owner",
    "phone": "+91-9876543210",
    "is_email_verified": true,
    "last_login": "2026-02-19T12:35:42.000Z",
    "roles": ["super_admin"],
    "role_display_names": ["Super Admin"],
    "permissions": [
      "view_all_projects",
      "create_project",
      "edit_project",
      "delete_project",
      "assign_team",
      "view_own_projects",
      "view_all_payments",
      "verify_payments",
      ...all permissions...
    ]
  }
}
```

### Multi-Role User (Accountant)
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

## Error Responses

### Invalid Credentials
```json
{
  "success": false,
  "message": "Invalid credentials"
}
```

### Missing Token
```json
{
  "success": false,
  "message": "Not authorized to access this route. No token provided."
}
```

### Expired Token
```json
{
  "success": false,
  "message": "Invalid or expired token"
}
```

## All Test Users

| Email | Password | Roles | Permissions Count |
|-------|----------|-------|-------------------|
| admin@company.com | password123 | super_admin | 25 (all) |
| manager@company.com | password123 | management | 8 |
| dev1@company.com | password123 | developer | 4 |
| dev2@company.com | password123 | developer | 4 |
| designer@company.com | password123 | ui_ux_designer | 4 |
| accountant@company.com | password123 | accountant, marketing | 11 |
| marketing@company.com | password123 | marketing | 6 |
| client1@example.com | password123 | client | 2 |
| client2@example.com | password123 | client | 2 |

## Projects API Testing

### 1. Get All Projects (Role-Based Filtering)
```powershell
# Login as manager (sees all projects)
$response = Invoke-RestMethod -Uri "http://localhost:5000/api/auth/login" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"email":"manager@company.com","password":"password123"}'

$token = $response.data.token
$headers = @{ "Authorization" = "Bearer $token" }

# Get all projects
$projects = Invoke-RestMethod -Uri "http://localhost:5000/api/projects" -Headers $headers
$projects.data | Select-Object id, project_number, project_name, status, client_name, team_size | Format-Table
```

### 2. Test Role-Based Filtering
```powershell
# Test as Developer (sees only assigned projects)
$devLogin = Invoke-RestMethod -Uri "http://localhost:5000/api/auth/login" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"email":"dev1@company.com","password":"password123"}'

$devToken = $devLogin.data.token
$devHeaders = @{ "Authorization" = "Bearer $devToken" }

$devProjects = Invoke-RestMethod -Uri "http://localhost:5000/api/projects" -Headers $devHeaders
Write-Host "Developer sees $($devProjects.count) projects (only assigned):" -ForegroundColor Cyan
$devProjects.data | Select-Object project_number, project_name | Format-Table
```

```powershell
# Test as Client (sees only their projects)
$clientLogin = Invoke-RestMethod -Uri "http://localhost:5000/api/auth/login" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"email":"client1@example.com","password":"password123"}'

$clientToken = $clientLogin.data.token
$clientHeaders = @{ "Authorization" = "Bearer $clientToken" }

$clientProjects = Invoke-RestMethod -Uri "http://localhost:5000/api/projects" -Headers $clientHeaders
Write-Host "Client sees $($clientProjects.count) projects (only theirs):" -ForegroundColor Cyan
$clientProjects.data | Select-Object project_number, project_name, client_name | Format-Table
```

### 3. Get Single Project Details
```powershell
# Get detailed project info (includes team, milestones, payment phases)
$project = Invoke-RestMethod -Uri "http://localhost:5000/api/projects/1" -Headers $headers
$project.data | ConvertTo-Json -Depth 5
```

### 4. Create New Project (Management Only)
```powershell
# Login as manager
$managerLogin = Invoke-RestMethod -Uri "http://localhost:5000/api/auth/login" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"email":"manager@company.com","password":"password123"}'

$managerToken = $managerLogin.data.token
$managerHeaders = @{ 
    "Authorization" = "Bearer $managerToken"
    "Content-Type" = "application/json"
}

# Create new project
$newProjectBody = @{
    client_id = 1
    project_name = "Mobile App Development"
    project_type = "Mobile App"
    project_description = "Cross-platform mobile app with React Native"
    technology_stack = "React Native, Node.js, MongoDB"
    total_budget = 450000
    currency = "INR"
    start_date = "2026-03-01"
    expected_end_date = "2026-09-30"
    status = "Planning"
    priority = "High"
} | ConvertTo-Json

$newProject = Invoke-RestMethod -Uri "http://localhost:5000/api/projects" `
  -Method POST `
  -Headers $managerHeaders `
  -Body $newProjectBody

Write-Host "Created: $($newProject.data.project_number) - $($newProject.data.project_name)" -ForegroundColor Green
```

### 5. Update Project
```powershell
# Update project status and completion
$updateBody = @{
    status = "In Progress"
    completion_percentage = 25
    notes = "Development phase started"
} | ConvertTo-Json

$updated = Invoke-RestMethod -Uri "http://localhost:5000/api/projects/1" `
  -Method PUT `
  -Headers $managerHeaders `
  -Body $updateBody

$updated.data | Select-Object project_number, status, completion_percentage, notes
```

### 6. Get Project Team
```powershell
# Get team members for a project
$team = Invoke-RestMethod -Uri "http://localhost:5000/api/projects/1/team" -Headers $headers
$team.data | Select-Object full_name, role_in_project, allocated_hours, hourly_rate | Format-Table
```

### 7. Assign Team Member
```powershell
# Assign developer to project
$assignBody = @{
    user_id = 3
    role_in_project = "Lead Developer"
    allocated_hours = 300
    hourly_rate = 500
} | ConvertTo-Json

$assigned = Invoke-RestMethod -Uri "http://localhost:5000/api/projects/1/team" `
  -Method POST `
  -Headers $managerHeaders `
  -Body $assignBody

Write-Host $assigned.message -ForegroundColor Green
```

## Role-Based Access Summary

| Role | Projects Visible | Create | Update | Assign Team |
|------|-----------------|--------|---------|-------------|
| Super Admin | All projects | ✅ | ✅ | ✅ |
| Management | All projects | ✅ | ✅ | ✅ |
| Developer | Assigned only | ❌ | ❌ | ❌ |
| UI/UX Designer | Assigned only | ❌ | ❌ | ❌ |
| Client | Their projects only | ❌ | ❌ | ❌ |
| Accountant | All projects | ❌ | ❌ | ❌ |

## Sample Project Response

```json
{
  "success": true,
  "count": 2,
  "data": [
    {
      "id": 1,
      "project_number": "PRJ-2026-001",
      "project_name": "TechStart Website Redesign",
      "project_type": "Website Development",
      "technology_stack": "MERN Stack (MySQL, Express, React, Node.js)",
      "total_budget": "250000.00",
      "currency": "INR",
      "status": "In Progress",
      "priority": "High",
      "completion_percentage": "35.00",
      "client_name": "TechStart India Pvt Ltd",
      "manager_name": "Sarah Manager",
      "team_size": 2,
      "payment_phases_count": 5,
      "paid_amount": "250000.00"
    }
  ]
}
```

## Next: Use Postman or Thunder Client

For better API testing, install VS Code extension:
- **Thunder Client** (recommended - built into VS Code)
- **REST Client** extension
- Or use **Postman** desktop app

Import these endpoints and save the token automatically!

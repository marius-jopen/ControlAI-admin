# Testing the Admin Panel

## Quick Test (5 minutes)

### 1. Start the Server

```bash
cd controlai-server
npm start
# Should see: Server running on port 3001
```

### 2. Start the Admin Panel

```bash
cd controlai-admin
npm run dev
# Should see: Local: http://localhost:5173
```

### 3. Test Login

1. Open http://localhost:5173
2. Log in with your admin credentials
3. Should redirect to `/admin`
4. Should see user list

**Troubleshooting:**
- "You do not have admin access" → Run SQL to grant admin status
- "Can't connect" → Check if server is running on port 3001
- "Invalid credentials" → Check email/password

### 4. Test User List

- Should see all users from database
- Should show user emails (not just IDs!)
- Click on a user → Details should load

### 5. Test Images

- Select a user
- Should see their generated images
- Click an image → Should open full size
- Try app filter buttons

---

## Manual API Testing

Test the new endpoints directly with curl:

### Get Your Admin Token

First, log in to get a token:

```bash
curl -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your-admin-email@example.com",
    "password": "your-password"
  }'
```

Response:
```json
{
  "user": { "id": "...", "email": "..." },
  "session": { "access_token": "eyJ..." }
}
```

Copy the `access_token` value.

### Test Endpoint 1: Get All Users

```bash
TOKEN="paste-your-token-here"

curl -X GET http://localhost:3001/api/v1/auth/admin/users \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response:**
```json
{
  "users": [
    {
      "id": "uuid",
      "email": "user@example.com",
      "full_name": "John Doe",
      "created_at": "2024-01-01T00:00:00Z",
      "apps": [
        {
          "app_id": "limn",
          "status": "active",
          "credits": 100,
          "created_at": "...",
          "updated_at": "..."
        }
      ]
    }
  ]
}
```

**If you get 403:**
- Your user doesn't have admin status
- Run: `UPDATE user_app_settings SET status = 'admin' WHERE user_id = 'your-id'`

**If you get 401:**
- Token is invalid or expired
- Log in again to get a new token

### Test Endpoint 2: Get Specific User

```bash
USER_ID="paste-user-id-here"

curl -X GET "http://localhost:3001/api/v1/auth/admin/users/$USER_ID" \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response:**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "full_name": "John Doe",
    "created_at": "...",
    "user_metadata": { ... }
  },
  "app_settings": [
    {
      "app_id": "limn",
      "status": "active",
      "credits": 100,
      ...
    }
  ],
  "latest_activity": "2024-01-15T10:30:00Z"
}
```

### Test Endpoint 3: Get User Images

```bash
curl -X GET "http://localhost:3001/api/v1/auth/admin/users/$USER_ID/images?app=limn&limit=10" \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response:**
```json
{
  "images": [
    {
      "id": "uuid",
      "image_url": "https://s3.amazonaws.com/...",
      "tool": "flux-basic",
      "batch_name": "20250618_133237",
      "created_at": "...",
      "app": "limn"
    }
  ],
  "has_more": false
}
```

---

## Testing Admin Access Control

### Test 1: Non-Admin User

1. Create a regular user (no admin status)
2. Log in with that user
3. Try to access `/admin`
4. **Expected**: Should redirect to login with "Admin access required"

### Test 2: Admin Access Revoked

1. Log in as admin
2. In Supabase, change status to 'active'
3. Refresh the admin panel
4. **Expected**: Should redirect to login

### Test 3: Admin on Different App

1. Grant admin on `celine` only
2. Try to access admin panel
3. **Expected**: Should work (admin on ANY app gives access)

---

## Browser DevTools Testing

### Check Network Requests

Open DevTools → Network tab:

1. **Login**: Should see POST to `/api/v1/auth/login`
2. **Load Users**: Should see GET to `/api/v1/auth/admin/users`
3. **Select User**: Should see:
   - GET to `/api/v1/auth/admin/users/:userId`
   - GET to `/api/v1/auth/admin/users/:userId/images`

**Check Headers:**
- Should see `Authorization: Bearer ...` on all admin requests
- Should see `Content-Type: application/json`

**Check Responses:**
- Status 200 for successful requests
- Status 403 if not admin
- Status 401 if token invalid

### Check LocalStorage

Open DevTools → Application → Local Storage:

Should see:
- `admin_token`: JWT token string
- `admin_user`: JSON with user info

### Check Console

Should NOT see:
- Supabase connection errors
- CORS errors
- Network errors

May see:
- Request logs (if you added console.log)
- Component mount logs

---

## Integration Testing

### Test Full User Flow

1. **Load admin panel**
   - User list should populate
   - Should show real emails

2. **Search users**
   - Type in search box
   - Should filter by email/name/ID

3. **Select user**
   - Click on a user
   - Right panel should show details

4. **View apps**
   - Should see all apps user has
   - Should show status badges
   - Should show credits

5. **Filter images**
   - Click "All Apps" → See all images
   - Click "Limn" → See only Limn images
   - Click "CELINE" → See only CELINE images

6. **View image details**
   - Click an image
   - Modal should open
   - Should show:
     - Full size image
     - Tool name
     - App name
     - Batch name
     - Creation date

7. **Close modal**
   - Click X button → Should close
   - Click outside → Should close

### Test Error Cases

1. **Server offline**
   - Stop server
   - Refresh admin panel
   - Should show error message

2. **Invalid token**
   - Clear localStorage
   - Refresh
   - Should redirect to login

3. **Network timeout**
   - Simulate slow network
   - Should show loading states

---

## Performance Testing

### Load Time

- **First load**: Should load user list in < 2 seconds
- **User switch**: Should load details in < 1 second
- **Image loading**: Should use lazy loading

### Memory Usage

Open DevTools → Performance → Memory:
- Navigate between users
- Check for memory leaks
- Should stay under 100MB

### Network Usage

- User list: < 50KB
- User details: < 20KB
- Images: Lazy loaded as needed

---

## Database Queries (Verify Server-Side)

Add logging to server to verify efficient queries:

```javascript
console.log('Fetching users...');
const start = Date.now();
const { data } = await adminSupabase.auth.admin.listUsers();
console.log(`Fetched ${data.users.length} users in ${Date.now() - start}ms`);
```

**Expected:**
- User list: < 500ms for 100 users
- User details: < 200ms
- Images: < 300ms for 50 images

---

## Security Testing

### Test 1: XSS Protection

Try entering malicious input:
```html
<script>alert('XSS')</script>
```
- In search box
- In any user field

**Expected**: Should be escaped, not executed

### Test 2: Token Expiration

1. Log in
2. Wait for token to expire (usually 1 hour)
3. Try to fetch data
4. **Expected**: Should get 401 and redirect to login

### Test 3: Direct API Access

Try accessing admin endpoint without token:
```bash
curl http://localhost:3001/api/v1/auth/admin/users
```

**Expected**: 401 Unauthorized

---

## Automated Test Script

Create `test-admin.sh`:

```bash
#!/bin/bash

API="http://localhost:3001"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "Testing Admin API..."

# Test 1: Login
echo -n "1. Testing login... "
RESPONSE=$(curl -s -X POST "$API/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"password"}')

if [[ $RESPONSE == *"access_token"* ]]; then
  echo -e "${GREEN}✓ PASS${NC}"
  TOKEN=$(echo $RESPONSE | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)
else
  echo -e "${RED}✗ FAIL${NC}"
  exit 1
fi

# Test 2: Get all users
echo -n "2. Testing get all users... "
RESPONSE=$(curl -s -X GET "$API/api/v1/auth/admin/users" \
  -H "Authorization: Bearer $TOKEN")

if [[ $RESPONSE == *"users"* ]]; then
  echo -e "${GREEN}✓ PASS${NC}"
else
  echo -e "${RED}✗ FAIL${NC}"
  exit 1
fi

# Test 3: Non-admin access
echo -n "3. Testing non-admin access... "
RESPONSE=$(curl -s -w "%{http_code}" -X GET "$API/api/v1/auth/admin/users")

if [[ $RESPONSE == *"403"* ]] || [[ $RESPONSE == *"401"* ]]; then
  echo -e "${GREEN}✓ PASS${NC}"
else
  echo -e "${RED}✗ FAIL${NC}"
  exit 1
fi

echo ""
echo -e "${GREEN}All tests passed!${NC}"
```

Run it:
```bash
chmod +x test-admin.sh
./test-admin.sh
```

---

## Troubleshooting Guide

### Issue: Can't log in

**Symptoms:**
- "Invalid credentials" error
- 401 response

**Solutions:**
1. Check email/password are correct
2. Check user exists in Supabase
3. Check server is running
4. Check `.env` has correct server URL

### Issue: "Admin access required"

**Symptoms:**
- 403 response
- Redirect to login after successful login

**Solutions:**
1. Check admin status in database:
```sql
SELECT * FROM user_app_settings WHERE user_id = 'your-id';
```
2. Grant admin access:
```sql
UPDATE user_app_settings SET status = 'admin' WHERE user_id = 'your-id';
```

### Issue: No users showing

**Symptoms:**
- Empty user list
- No errors in console

**Solutions:**
1. Check if users exist:
```sql
SELECT COUNT(*) FROM user_app_settings;
```
2. Check server logs for errors
3. Check network tab for failed requests

### Issue: Images not loading

**Symptoms:**
- Broken image icons
- 403 on image URLs

**Solutions:**
1. Check S3 bucket permissions
2. Check CORS settings on S3
3. Check image URLs are valid
4. Check user has images:
```sql
SELECT COUNT(*) FROM resources WHERE user_id = 'user-id';
```

---

**Need help?** Check the CHANGES.md file for architecture details or ARCHITECTURE.md for technical deep dive.


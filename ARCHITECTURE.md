# Admin Panel Architecture

## Overview

The admin panel follows a **client-server architecture** where all data access goes through the `controlai-server` API. The client never directly connects to Supabase.

```
┌─────────────────┐
│  Admin Panel    │
│  (SvelteKit)    │
└────────┬────────┘
         │ HTTP/REST
         ↓
┌─────────────────┐
│ControlAI Server │
│   (Express)     │
└────────┬────────┘
         │ Supabase Client
         ↓
┌─────────────────┐
│    Supabase     │
│   (Database)    │
└─────────────────┘
```

## Why This Architecture?

### Security
- **Service role key never exposed** to client
- **Admin verification happens server-side**
- **RLS policies enforced** by Supabase
- **Centralized access control**

### Consistency
- **Same auth flow** as main apps (limn, celine, etc.)
- **Reuses existing server infrastructure**
- **Single source of truth** for data access

### Maintainability
- **Server-side logic** easier to update
- **Client stays thin** (UI only)
- **Clear separation of concerns**

## Authentication Flow

### 1. Login

```typescript
// Client sends credentials
POST /api/v1/auth/login
{
  email: "admin@example.com",
  password: "password"
}

// Server responds with session
{
  user: { id, email, full_name },
  session: { access_token, refresh_token }
}
```

### 2. Admin Verification

```typescript
// Client stores token and makes admin request
GET /api/v1/auth/admin/users
Authorization: Bearer <access_token>

// Server verifies:
1. Token is valid (Supabase auth)
2. User has admin status in user_app_settings
3. Returns data or 403 Forbidden
```

### 3. Token Storage

Tokens are stored in `localStorage`:
```typescript
localStorage.setItem('admin_token', access_token);
localStorage.setItem('admin_user', JSON.stringify(user));
```

On page load, the token is retrieved and verified by checking if an admin endpoint call succeeds.

## API Endpoints

### Public Endpoints (No Auth)
- `POST /api/v1/auth/login` - Sign in

### Protected Admin Endpoints (Require Admin Status)
- `GET /api/v1/auth/admin/users` - Get all users
- `GET /api/v1/auth/admin/users/:userId` - Get user details
- `GET /api/v1/auth/admin/users/:userId/images` - Get user's images

## Admin Verification Logic

Server-side admin check (in every admin endpoint):

```javascript
// 1. Verify JWT token
const { data: { user }, error } = await supabase.auth.getUser(token);

// 2. Check if user has admin status
const { data: settings } = await supabase
  .from('user_app_settings')
  .select('status')
  .eq('user_id', user.id)
  .eq('status', 'admin')
  .limit(1);

// 3. Deny if not admin
if (!settings || settings.length === 0) {
  return res.status(403).json({ error: 'Admin access required' });
}

// 4. Continue with admin operation
```

## Data Fetching Pattern

### Client Side (Svelte)

```typescript
// src/lib/api/client.ts
async function fetchWithAuth(url: string) {
  const token = getAuthToken(); // From store
  
  const response = await fetch(`${API_URL}${url}`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  return response.json();
}

export async function getAllUsers() {
  return await fetchWithAuth('/api/v1/auth/admin/users');
}
```

### Server Side (Express)

```javascript
// src/auth/controller.js
export async function getAllUsersWithDetails(req, res) {
  // 1. Extract token from header
  const token = req.headers.authorization?.substring(7);
  
  // 2. Verify admin status
  const isAdmin = await checkAdminStatus(token);
  if (!isAdmin) return res.status(403).json(...);
  
  // 3. Query Supabase with service role
  const { data: users } = await adminSupabase.auth.admin.listUsers();
  const { data: settings } = await adminSupabase
    .from('user_app_settings')
    .select('*');
  
  // 4. Combine and format data
  const formattedUsers = formatUsersWithSettings(users, settings);
  
  // 5. Return to client
  res.json({ users: formattedUsers });
}
```

## State Management

### Auth Store (Svelte Store)

```typescript
interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  loading: boolean;
}

export const authStore = writable<AuthState>({
  user: null,
  token: null,
  isAuthenticated: false,
  isAdmin: false,
  loading: true
});
```

### Store Updates

1. **On app init**: Check localStorage for existing session
2. **On login**: Store token and user, verify admin status
3. **On logout**: Clear store and localStorage
4. **On error**: Clear auth if 401/403 responses

## Error Handling

### Client Side

```typescript
try {
  const users = await getAllUsers();
} catch (error) {
  if (error.message.includes('Admin access required')) {
    // Redirect to login
    goto('/');
  }
  // Show error message
  console.error(error);
}
```

### Server Side

```javascript
try {
  // Admin operation
} catch (error) {
  if (error.code === 'PGRST301') {
    return res.status(403).json({ error: 'Access denied' });
  }
  return res.status(500).json({ error: 'Internal server error' });
}
```

## Security Considerations

### ✅ What's Secure

1. **No direct Supabase access** from client
2. **Service role key** never exposed
3. **Admin status** verified on every request
4. **JWT tokens** with expiration
5. **RLS policies** enforced by Supabase

### ⚠️ Potential Improvements

1. **Refresh token rotation** not implemented yet
2. **Rate limiting** should be added to admin endpoints
3. **Audit logging** for admin actions
4. **IP whitelisting** for admin panel
5. **Two-factor authentication** for admins

## Performance Considerations

### Current Implementation

- **One API call per operation** (getAllUsers, getUserDetails, etc.)
- **Client-side pagination** (fetches up to 100 images)
- **No caching** (each page load fetches fresh data)

### Future Optimizations

1. **Server-side pagination** for large datasets
2. **Response caching** with TTL
3. **Incremental loading** for images
4. **WebSocket connection** for real-time updates
5. **GraphQL** for flexible data fetching

## Development vs Production

### Development
```env
VITE_BACKEND_URL=http://localhost:3001
```

### Production
```env
VITE_BACKEND_URL=https://api.yourapp.com
```

The same endpoints work in both environments - just point to different server URLs.

## Comparison with controlai-client

Both use the same architecture:

| Feature | controlai-client | controlai-admin |
|---------|-----------------|-----------------|
| Auth | Server API | Server API |
| Data fetching | Server API | Server API |
| Supabase access | None (server-side) | None (server-side) |
| Token storage | localStorage | localStorage |
| Protected routes | Yes | Yes |

The only difference is the **admin verification** that happens server-side for admin endpoints.

---

**Key Takeaway**: The admin panel is just another client application that uses the centralized `controlai-server` API, with additional admin-only endpoints that verify user permissions server-side.


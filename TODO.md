# Admin Panel - TODO & Roadmap

## 🔴 High Priority

### Server Endpoints (Required for Full Functionality)

#### 1. User Management Endpoints
- [ ] `GET /api/v1/admin/users` - Get all users with email/name
  - Query auth.users + user_app_settings
  - Return: id, email, full_name, apps[], created_at, last_activity
  - Add admin middleware check
  
- [ ] `GET /api/v1/admin/users/:userId` - Get specific user details
  - Include all user_app_settings
  - Include user_metadata
  - Include generation statistics
  
#### 2. User Modification Endpoints
- [ ] `PATCH /api/v1/admin/users/:userId/status` - Update user status
  - Body: { app_id, status: 'active' | 'blocked' | 'admin' }
  - Validate admin permissions
  - Log the change
  
- [ ] `PATCH /api/v1/admin/users/:userId/credits` - Update user credits
  - Body: { app_id, credits: number }
  - Validate credit amount
  - Log the change

### Frontend Enhancements

#### 1. User Email/Name Display
- [ ] Update `getAllUsers()` to use server endpoint
- [ ] Update UI to show email as primary identifier
- [ ] Update search to search by email/name
- [ ] Add email copy-to-clipboard button

#### 2. User Editing
- [ ] Add "Edit User" button in user details
- [ ] Create edit modal/drawer
- [ ] Add status change dropdown
- [ ] Add credits adjustment input
- [ ] Add save/cancel buttons
- [ ] Add confirmation dialog for status changes

## 🟡 Medium Priority

### Statistics & Analytics

- [ ] Add dashboard overview page
  - Total users count
  - Users per app breakdown
  - Total images generated
  - Recent activity chart
  
- [ ] Add user statistics section
  - Total generations per user
  - Images by tool breakdown
  - Activity timeline
  - Credits usage history

### Advanced Filtering

- [ ] Add date range filter for images
- [ ] Add tool filter in images section
- [ ] Add status filter in user list
- [ ] Add app filter in user list
- [ ] Add sort options (date, name, activity, etc.)

### Bulk Operations

- [ ] Select multiple users
- [ ] Bulk status change
- [ ] Bulk credit adjustment
- [ ] Bulk export

## 🟢 Low Priority

### UI/UX Improvements

- [ ] Add dark mode toggle
- [ ] Improve mobile responsiveness
- [ ] Add keyboard shortcuts
- [ ] Add user preferences (items per page, default filters)
- [ ] Add column resize in user list
- [ ] Add customizable dashboard layout

### Advanced Features

- [ ] Activity audit log
  - Track all admin actions
  - Show who changed what and when
  - Filterable log view
  
- [ ] Email notifications
  - Send emails to users (status changes, etc.)
  - Notification templates
  - Email history
  
- [ ] Export functionality
  - Export user list to CSV
  - Export user details to JSON
  - Export images metadata
  - Schedule automated reports
  
- [ ] Advanced user search
  - Search by email domain
  - Search by registration date range
  - Search by credit range
  - Search by app usage
  
- [ ] User creation
  - Create new user from admin panel
  - Set initial apps and credits
  - Send welcome email

### Developer Experience

- [ ] Add unit tests
- [ ] Add E2E tests
- [ ] Add Storybook for components
- [ ] Add API documentation
- [ ] Add component library
- [ ] Add error boundary

## 📋 Technical Debt

- [ ] Improve TypeScript types (remove `any` types)
- [ ] Add error logging service (Sentry, etc.)
- [ ] Add analytics (Google Analytics, Mixpanel)
- [ ] Optimize bundle size
- [ ] Add service worker for offline support
- [ ] Add pagination for large datasets
- [ ] Optimize image loading (virtual scrolling)
- [ ] Add caching layer (React Query or similar)

## 🐛 Known Issues

- [ ] Email/name not showing (requires server endpoint) ⚠️
- [ ] No pagination on user list (could be slow with many users)
- [ ] No pagination on images (limited to 100 per query)
- [ ] Search only works by ID (not by email/name)
- [ ] Mobile layout needs improvement
- [ ] No loading indicator when filtering images
- [ ] Image modal doesn't support keyboard navigation (arrow keys)

## 🔐 Security Enhancements

- [ ] Add rate limiting on admin endpoints
- [ ] Add CSRF protection
- [ ] Add audit logging for all actions
- [ ] Add two-factor authentication option
- [ ] Add session timeout configuration
- [ ] Add IP whitelisting for admin access
- [ ] Add admin role hierarchy (super admin vs admin)
- [ ] Add permission-based access control

## 🎨 Design Polish

- [ ] Add loading skeletons instead of spinners
- [ ] Add smooth transitions between views
- [ ] Add toast notifications for actions
- [ ] Improve empty states with illustrations
- [ ] Add success/error animations
- [ ] Improve color scheme consistency
- [ ] Add custom icons
- [ ] Add help tooltips

## 📱 Platform Support

- [ ] Test on Safari
- [ ] Test on Firefox
- [ ] Test on mobile Chrome
- [ ] Test on mobile Safari
- [ ] Add iOS PWA support
- [ ] Add Android PWA support
- [ ] Add desktop app (Electron)

## 🚀 Performance

- [ ] Add image lazy loading (already implemented)
- [ ] Add virtual scrolling for large lists
- [ ] Add server-side pagination
- [ ] Add image thumbnail generation
- [ ] Add CDN for static assets
- [ ] Optimize CSS (remove unused)
- [ ] Add bundle splitting
- [ ] Add prefetching for user details

---

## Implementation Order Recommendation

### Sprint 1 (Week 1) - Core Functionality
1. Server endpoints for user data
2. Email/name display in frontend
3. Basic user editing (status)

### Sprint 2 (Week 2) - User Management
1. Credits editing
2. Confirmation dialogs
3. Error handling improvements
4. Search by email/name

### Sprint 3 (Week 3) - Statistics
1. Dashboard overview
2. User statistics
3. Activity timeline
4. Basic analytics

### Sprint 4 (Week 4) - Polish
1. Advanced filtering
2. Bulk operations
3. Export functionality
4. UI/UX improvements

---

**Priority Key:**
- 🔴 High Priority: Core functionality, blocking features
- 🟡 Medium Priority: Important but not blocking
- 🟢 Low Priority: Nice to have, future enhancements

**Status Key:**
- [ ] Not started
- [x] Completed
- [~] In progress
- [!] Blocked


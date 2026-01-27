# ControlAI Admin Panel

Admin dashboard for managing users across all ControlAI applications.

## 📚 Documentation

**Complete documentation**: See **[PROJECT_DOCUMENTATION.md](../controlai-server/PROJECT_DOCUMENTATION.md)** - Single source of truth for the entire platform.

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Configuration

Create a `.env` file:

```env
VITE_API_URL=http://localhost:3001
```

That's it! All data flows through the `controlai-server`, so no Supabase configuration is needed.

### 3. Grant Admin Access

In Supabase SQL Editor:

```sql
UPDATE user_app_settings
SET status = 'admin'
WHERE user_id = 'your-user-id' AND app_id = 'limn';
```

### 4. Run Development Server

```bash
npm run dev
```

Visit `http://localhost:5173` and log in with your admin credentials.

## Development

```bash
npm run dev      # Start dev server
npm run build    # Build for production
npm run preview  # Preview production build
npm run check    # Type check
```

---

**For complete documentation, architecture, API endpoints, testing, and more**, see **[PROJECT_DOCUMENTATION.md](../controlai-server/PROJECT_DOCUMENTATION.md)**

# Quick Start Guide

Get the admin panel running in 5 minutes.

## Prerequisites

- Node.js 18+ installed
- Access to your Supabase project
- Admin status in the database

## Step 1: Install (30 seconds)

```bash
cd controlai-admin
npm install
```

## Step 2: Configure (1 minute)

Create `.env` file:

```bash
echo "VITE_BACKEND_URL=http://localhost:3001" > .env
```

That's it! All data flows through the server, so no Supabase config needed.

## Step 3: Grant Admin Access (1 minute)

In **Supabase SQL Editor**, run:

```sql
-- Find your user ID first
SELECT id, email FROM auth.users;

-- Grant admin access (use your user ID from above)
UPDATE user_app_settings
SET status = 'admin'
WHERE user_id = 'paste-your-user-id-here'
AND app_id = 'limn';  -- or any app you have
```

## Step 4: Run (10 seconds)

```bash
npm run dev
```

Open http://localhost:5173 and sign in! 🎉

---

## Troubleshooting

### "You do not have admin access"

Run this to verify your admin status:
```sql
SELECT * FROM user_app_settings 
WHERE user_id = 'your-user-id';
-- status should be 'admin'
```

### "Can't connect to server"

1. Check `.env` file exists (`VITE_BACKEND_URL=http://localhost:3001`)
2. Verify `controlai-server` is running on port 3001
3. Restart dev server

### No users showing

```sql
-- Check if there are users
SELECT COUNT(*) FROM user_app_settings;
```

If count is 0, create a user through one of the main apps first.

---

## What's Next?

- Read `readme.md` for full documentation
- Read `SETUP.md` for detailed setup instructions
- Read `IMPLEMENTATION_SUMMARY.md` to understand what's built
- Read `TODO.md` to see future enhancements

---

**Need help?** Check the documentation files or contact the team.


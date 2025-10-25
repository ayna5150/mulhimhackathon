# Supabase Migration Guide

This guide will help you migrate your SmartShield project from local PostgreSQL to Supabase.

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Supabase Setup](#supabase-setup)
3. [Migration Steps](#migration-steps)
4. [Verification](#verification)
5. [Troubleshooting](#troubleshooting)
6. [Next Steps](#next-steps)

## Prerequisites

- Supabase account ([sign up here](https://supabase.com))
- Node.js and npm installed
- Basic knowledge of database concepts

## Supabase Setup

### 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in
2. Click "New Project"
3. Fill in the project details:
   - **Name**: SmartShield (or your preferred name)
   - **Database Password**: Choose a strong password (save it!)
   - **Region**: Choose the region closest to your users
4. Click "Create new project"

### 2. Get Your Project Credentials

After your project is created:

1. Go to **Settings** → **API**
2. Copy the following:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon/public key**: `eyJhbGc...` (starts with `eyJ`)
   - **service_role key**: `eyJhbGc...` (keep this secret!)

### 3. Configure Environment Variables

1. Copy the example environment file:
   ```bash
   cd backend
   cp ../example.env .env
   ```

2. Edit `.env` and add your Supabase credentials:
   ```env
   # Enable Supabase
   USE_SUPABASE=true
   
   # Your Supabase project URL
   SUPABASE_URL=https://xxxxx.supabase.co
   
   # Your Supabase anon key
   SUPABASE_ANON_KEY=eyJhbGc...
   
   # Your Supabase service key (optional, for admin operations)
   SUPABASE_SERVICE_KEY=eyJhbGc...
   
   # You can still keep DATABASE_URL for backup
   DATABASE_URL=postgres://postgres:password@localhost:5432/smartshield
   ```

## Migration Steps

### Step 1: Install Dependencies

```bash
cd backend
npm install
```

This will install `@supabase/supabase-js` and other dependencies.

### Step 2: Run SQL Migration in Supabase

The easiest way to set up your database schema is through the Supabase SQL Editor:

1. **Open Supabase Dashboard**:
   - Go to your project dashboard
   - Click on **SQL Editor** in the left sidebar

2. **Open the migration SQL file**:
   - Open: `backend/sql/supabase-init.sql`
   - Copy all the content

3. **Paste and run in SQL Editor**:
   - Paste the SQL content into the SQL Editor
   - Click **Run** (or press `Ctrl+Enter` / `Cmd+Enter`)

4. **Verify success**:
   - You should see "Success. No rows returned"
   - Check the **Table Editor** to see your tables

### Step 3: Test the Connection

```bash
cd backend
npm run test:supabase
```

This will:
- ✓ Test the connection to Supabase
- ✓ Verify all tables exist
- ✓ Test database operations
- ✓ Check admin user setup

Expected output:
```
🧪 Testing Supabase Connection...

🔌 Connecting to Supabase...
✓ Client created

📋 Test 1: Checking tables...
   ✓ Table "users" exists
   ✓ Table "organizations" exists
   ✓ Table "analytics" exists
   ✓ Table "scan_results" exists
   ✓ Table "chat_sessions" exists

✅ All tests completed successfully!
```

### Step 4: Build the Project

```bash
npm run build
```

### Step 5: Start the Application

```bash
npm run dev
```

## Verification

### Check Tables in Supabase

1. Go to **Table Editor** in your Supabase dashboard
2. You should see these tables:
   - `analytics`
   - `users`
   - `organizations`
   - `scan_results`
   - `chat_sessions`

### Check Default Data

1. In **Table Editor**, open the `users` table
2. You should see a default admin user:
   - **Email**: `admin@smartshield.local`
   - **Role**: `admin`
   - **Password**: `admin123` (bcrypt hash)

3. Open the `organizations` table
4. You should see:
   - **Name**: "Default Organization"
   - **Domain**: "localhost"

### Test Login

Use the default credentials:
- **Email**: `admin@smartshield.local`
- **Password**: `admin123`

⚠️ **Important**: Change this password in production!

## Troubleshooting

### Issue: "Missing required environment variables"

**Solution**: Make sure your `.env` file has all required Supabase variables:
```env
USE_SUPABASE=true
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...
```

### Issue: "Connection test failed"

**Possible causes**:
1. **Incorrect URL or key**: Double-check your credentials
2. **Project paused**: Check if your Supabase project is active
3. **Network issues**: Check your internet connection

**Solution**: 
- Verify your credentials in Supabase dashboard (Settings → API)
- Make sure your project is not paused

### Issue: "Table not found"

**Solution**: Run the SQL migration in Supabase SQL Editor (Step 2)

### Issue: "Permission denied"

**Solution**: Make sure you're using the correct key:
- Use `SUPABASE_ANON_KEY` for general operations
- Use `SUPABASE_SERVICE_KEY` only for admin operations (keep it secret!)

### Issue: "Function does not exist"

**Solution**: The SQL migration includes creating database functions. Make sure you ran the complete SQL migration file.

## Next Steps

### 1. Enable Row Level Security (Optional)

Supabase supports Row Level Security (RLS) for additional security:

```sql
-- Enable RLS on sensitive tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can read their own data"
  ON users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can only access their organization"
  ON organizations FOR SELECT
  USING (org_id = auth.uid());
```

### 2. Set Up Real-time Subscriptions

Supabase supports real-time data updates:

```typescript
// Subscribe to real-time updates
const subscription = supabase
  .channel('scan_results')
  .on('postgres_changes', 
    { event: 'INSERT', schema: 'public', table: 'scan_results' },
    (payload) => {
      console.log('New scan result:', payload.new)
    }
  )
  .subscribe()
```

### 3. Configure Backups

Supabase automatically backs up your database:
- **Daily backups**: Automatically retained for 7 days (free tier)
- **Manual backups**: Can be created anytime from dashboard
- **Point-in-time recovery**: Available on paid plans

### 4. Monitor Performance

Use the Supabase dashboard to monitor:
- Database performance metrics
- Query performance
- API usage
- Storage usage

## Benefits of Supabase

### 🚀 Performance
- **Global CDN**: Faster data access worldwide
- **Connection pooling**: Automatic connection management
- **Query optimization**: Built-in query analysis

### 🔒 Security
- **SSL/TLS**: All connections encrypted
- **Network restrictions**: IP allowlisting
- **Audit logs**: Track all database changes
- **Row Level Security**: Granular access control

### ⚡ Features
- **Real-time subscriptions**: Live data updates
- **Auto-generated APIs**: REST and GraphQL
- **Web dashboard**: Visual database management
- **Built-in auth**: User authentication ready

### 💰 Cost
- **Free tier**: 500 MB database, 2 GB bandwidth
- **Pay-as-you-scale**: Only pay for what you use
- **No server costs**: No infrastructure to maintain

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review [Supabase documentation](https://supabase.com/docs)
3. Check project [GitHub issues](https://github.com/your-repo/issues)

## Default Credentials

**Admin Login**:
- Email: `admin@smartshield.local`
- Password: `admin123`

⚠️ **Change these credentials in production!**

---

**Migration completed successfully!** 🎉

Your SmartShield system is now running on Supabase with enhanced capabilities, better performance, and simplified maintenance.

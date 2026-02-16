# Deploy Flow: GitHub → Vercel + Render

> How updates work between your local machine, GitHub, Vercel, and Render

---

## Architecture Overview

```
┌─────────────┐      push       ┌──────────────┐
│   Your Mac  │ ──────────────► │    GitHub    │
│  (dev env)  │                 │  (main repo) │
└─────────────┘                 └──────┬───────┘
                                       │
                        ┌──────────────┴──────────────┐
                        │ webhook triggers            │ webhook triggers
                        ▼                             ▼
                ┌───────────────┐             ┌───────────────┐
                │    Vercel     │             │    Render     │
                │  (Next.js     │             │  (WebSocket   │
                │   frontend)   │             │   bridge)     │
                └───────────────┘             └───────────────┘
                        │                             │
                        └──────────────┬──────────────┘
                                       │
                                       ▼
                               ┌───────────────┐
                               │  Neon/Vercel  │
                               │   Postgres    │
                               │  (shared DB)  │
                               └───────────────┘
```

| Service | Purpose | Pricing |
|---------|---------|---------|
| **GitHub** | Source code repository | Free |
| **Vercel** | Next.js frontend (dashboard, API, simulation page) | Free tier available |
| **Render** | WebSocket bridge (for 3D simulation real-time data) | Free tier available |
| **Neon** | PostgreSQL database | Free tier available |

---

## How an Update Works

### Step 1: Make Changes Locally

```bash
# Edit code
code src/app/simulation/page.tsx

# Test locally
npm run dev
npm run ws:bridge
npm run agents:all
```

### Step 2: Commit and Push

```bash
git add .
git commit -m "Add new feature"
git push origin main
```

### Step 3: Automatic Deployments Trigger

Both services detect the push via webhook and deploy automatically:

| Service | What Happens | Time |
|---------|--------------|------|
| **Vercel** | Detects push → builds Next.js → deploys | ~1-2 min |
| **Render** | Detects push → rebuilds WebSocket server → deploys | ~2-3 min |

Both happen **automatically and in parallel** — no manual action needed.

### Step 4: Zero-Downtime Rollout

- **Vercel**: Instant atomic deployments (new version goes live, old stays until requests finish)
- **Render**: Rolling restart

---

## Initial Setup

### 1. GitHub Repository

```bash
# Initialize git (if not done)
git init
git add .
git commit -m "Initial commit"

# Create GitHub repo
gh repo create bot-talker --public --source=. --push

# Or manually at https://github.com/new then:
git remote add origin https://github.com/YOUR_USERNAME/bot-talker.git
git branch -M main
git push -u origin main
```

### 2. Database (Neon - Free)

1. Go to [neon.tech](https://neon.tech) → Sign Up (free)
2. Create Project → Name: `bot-talker`
3. Copy connection string:
   ```
   postgresql://user:pass@host.region.neon.tech/main?sslmode=require
   ```
4. Import your local data:
   ```bash
   npm run backup
   psql "postgresql://user:pass@host.neon.tech/main?sslmode=require" < backups/bot-talker_LATEST.sql
   ```

### 3. Vercel (Next.js Frontend)

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Link project
vercel link
# Select your GitHub repo

# Add environment variables
vercel env add DATABASE_URL        # paste Neon connection string
vercel env add GEMINI_API_KEY      # your Gemini key
vercel env add NEXTAUTH_SECRET     # run: openssl rand -base64 32
vercel env add NEXTAUTH_URL        # https://your-app.vercel.app

# Deploy to production
vercel --prod
```

**Or via Dashboard:**
1. [vercel.com](https://vercel.com) → Add New → Project
2. Import from GitHub: select `bot-talker`
3. Add environment variables
4. Deploy

### 4. Render (WebSocket Bridge)

1. Go to [render.com](https://render.com) → New → Web Service
2. Connect GitHub repo: `bot-talker`
3. Configure:
   - **Name:** `bot-talker-ws`
   - **Root Directory:** `./`
   - **Build Command:** `npm install`
   - **Start Command:** `npx tsx scripts/websocket-bridge.ts`
   - **Instance Type:** Free (or Starter $7/mo for always-on)
4. Add environment variables:
   ```
   DATABASE_URL=postgresql://... (same as Vercel)
   ```
5. Deploy

### 5. Update Simulation WebSocket URL

After Render deploys, update the WebSocket URL in your simulation:

```tsx
// src/app/simulation/page.tsx
// Change from:
const ws = new WebSocket('ws://localhost:8080');
// To:
const wsUrl = process.env.NODE_ENV === 'production' 
  ? 'wss://bot-talker-ws.onrender.com'
  : 'ws://localhost:8080';
const ws = new WebSocket(wsUrl);
```

### 6. Custom Domain (Optional)

**Vercel:**
1. Dashboard → Project → Settings → Domains
2. Add `bottalker.com` (or your domain)
3. Update DNS records as shown

**Render:**
1. Dashboard → Service → Settings → Custom Domain
2. Add `ws.bottalker.com` (subdomain for WebSocket)
3. Update DNS records

---

## Day-to-Day Workflow

### Making Updates

```bash
# Make changes
vim src/app/page.tsx

# Test locally
npm run dev

# Deploy to production
git add .
git commit -m "Update homepage"
git push
# That's it! Auto-deploys in ~2 minutes
```

### Preview Deployments (Feature Branches)

```bash
git checkout -b feature/new-bot-type
# make changes
git push origin feature/new-bot-type
```

| Service | Preview URL |
|---------|-------------|
| **Vercel** | `bot-talker-git-feature-new-bot-type-username.vercel.app` |
| **Render** | No auto-preview on free tier |

When ready:
```bash
git checkout main
git merge feature/new-bot-type
git push
```

### Rollback

If something breaks:

**Vercel:**
```bash
vercel rollback
# Or: Dashboard → Deployments → "..." → Promote to Production
```

**Render:**
- Dashboard → Service → Events → Previous deploy → "Rollback"

---

## Database Migrations

When you change `prisma/schema.prisma`:

```bash
# 1. Generate migration locally
npx prisma migrate dev --name add_new_field

# 2. Push to GitHub
git add prisma/
git commit -m "Add migration: add_new_field"
git push

# 3. After deploy, run migration on production
DATABASE_URL="postgresql://prod-url" npx prisma migrate deploy
```

**Or add to Vercel build command:**
```
prisma migrate deploy && next build
```

---

## Environment Variables Reference

| Variable | Where | Description |
|----------|-------|-------------|
| `DATABASE_URL` | Vercel + Render | Neon PostgreSQL connection string |
| `GEMINI_API_KEY` | Vercel | Google Gemini API key |
| `NEXTAUTH_SECRET` | Vercel | Auth secret (generate with `openssl rand -base64 32`) |
| `NEXTAUTH_URL` | Vercel | Production URL (e.g., `https://bottalker.vercel.app`) |

---

## Troubleshooting

### Vercel build fails
```bash
# Check logs
vercel logs

# Common fixes:
# - Missing env vars
# - TypeScript errors (run `npm run build` locally first)
```

### Render WebSocket not connecting
- Check the WebSocket URL is using `wss://` (not `ws://`) in production
- Verify Render service is running (check dashboard)
- Check CORS if needed

### Database connection issues
- Verify `DATABASE_URL` is set correctly in both Vercel and Render
- Neon free tier sleeps after 5 min inactivity (first request may be slow)

---

## Quick Reference

| Action | Command |
|--------|---------|
| Deploy to production | `git push origin main` |
| Preview deployment | Push to feature branch |
| Rollback Vercel | `vercel rollback` |
| Check Vercel logs | `vercel logs` |
| Run DB migration | `npx prisma migrate deploy` |
| Add env var | `vercel env add VARNAME` |

---

## Estimated Costs (Free Tier)

| Service | Free Tier Limits | Paid If Needed |
|---------|------------------|----------------|
| **Vercel** | 100GB bandwidth, serverless functions | $20/mo Pro |
| **Render** | 750 hrs/mo, sleeps after 15 min | $7/mo Starter |
| **Neon** | 0.5GB storage, auto-suspend | $19/mo Pro |
| **GitHub** | Unlimited public repos | Free |

**Total: $0/mo** for hobby use, ~$30-50/mo if you need always-on services.

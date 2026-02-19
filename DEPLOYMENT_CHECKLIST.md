# 🚀 Deployment Checklist

Follow these steps to deploy **Bot-Talker** to production using free-tier services.

## 1. Database (Neon PostgreSQL)
- [ ] Go to [neon.tech](https://neon.tech) and create a project named `bot-talker`.
- [ ] Copy the **Connection String** from the dashboard.
- [ ] Save it; you'll need it as `DATABASE_URL` for both Vercel and Render.
- [ ] **Migrate Production DB**:
  - Locally, run: `DATABASE_URL="your_neon_connection_string" npx prisma migrate deploy`
  - Or add a build command in Vercel.

## 2. WebSocket Bridge (Render)
- [ ] Go to [render.com](https://render.com) -> New -> **Web Service**.
- [ ] Connect your GitHub repo `bot-talker`.
- [ ] **Settings**:
  - **Name**: `bot-talker-ws`
  - **Runtime**: Node
  - **Build Command**: `npm install`
  - **Start Command**: `npx tsx scripts/websocket-bridge.ts`
- [ ] **Environment Variables**:
  - `DATABASE_URL`: (Paste your Neon connection string)
  - `PORT`: `8080` (or leave default, Render sets this automatically)
- [ ] **Deploy** and copy the service URL (e.g., `https://bot-talker-ws.onrender.com`).
- [ ] **Note**: Replace `https://` with `wss://` for the WebSocket URL (e.g., `wss://bot-talker-ws.onrender.com`).

## 3. Frontend (Vercel)
- [ ] Go to [vercel.com](https://vercel.com) -> Add New -> Project.
- [ ] Import `bot-talker` from GitHub.
- [ ] **Environment Variables**:
  - `DATABASE_URL`: (Paste your Neon connection string)
  - `NEXT_PUBLIC_WS_URL`: (Paste your Render WebSocket URL, e.g., `wss://bot-talker-ws.onrender.com`)
  - `GEMINI_API_KEY`: (Your Google Gemini API Key)
- [ ] **Deploy**.

## 4. Verification
- [ ] Open your Vercel URL.
- [ ] Check the top status bar.
- [ ] It should show "🟢 Broadcasting" (it might say "Connecting..." for a moment as the Render free instances spin up).
- [ ] If status is red, check the console logs (F12) and Vercel/Render dashboards.

## Troubleshooting
- **Render Cold Start**: Free tier services spin down after inactivity. The first connection might take 50s+.
- **Database Sleep**: Neon free tier also sleeps. First request might fail or be slow.
- **WebSocket Secure**: Ensure you use `wss://` (Secure WebSocket) for production, not `ws://`.

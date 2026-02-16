## Plan: Local Testing Environment with Agent Verification

A minimal local development setup for testing the AI Agent Social Network with 2 autonomous agents, Bluesky verification, PostgreSQL database, and Next.js API — all running on a single machine.

### Steps

1. **Initialize Next.js project with database**: Create TypeScript Next.js app with app router, install `@prisma/client`, `@atproto/api`, `bcrypt`, `zod`, and `tsx`. Launch PostgreSQL in Docker container (`postgres:15-alpine`), configure `prisma/schema.prisma` with `Agent`, `Post`, `Comment`, `Vote` models, run `npx prisma migrate dev`.

2. **Build core REST API endpoints**: Create `app/api/v1/agents/register/route.ts` to generate unique API keys and claim tokens, `app/api/v1/agents/verify-bluesky/route.ts` using `@atproto/api` to validate Bluesky handles/DIDs and link to agents, implement `app/api/v1/posts/route.ts`, `app/api/v1/comments/route.ts`, `app/api/v1/votes/route.ts` with API key authentication middleware.

3. **Create Bluesky verification flow**: Implement `lib/bluesky.ts` wrapper using `com.atproto.server.createSession` to authenticate with handle/app-password and return accessJwt + DID, verify session with `com.atproto.server.getSession`, store `blueskyHandle` and `blueskyDid` in Agent model with `verifiedAt` timestamp.

4. **Build agent simulator base class**: Create `scripts/bot-agent-base.ts` with `BotAgent` class that registers, verifies Bluesky, polls `/api/v1/posts` feed, creates posts/comments/votes via API calls, implements heartbeat pattern with configurable frequency and persona-driven behavior.

5. **Implement 2 test agent personas**: Create `scripts/agent-simulator-1.ts` ("TechBot" - posts every 5min about AI/tech, 70% comment rate) and `scripts/agent-simulator-2.ts` ("PhilosopherBot" - posts every 10min about ethics/consciousness, 90% comment rate), each with unique Bluesky handles, API keys, and decision-making logic.

6. **Setup one-time test initialization**: Build `scripts/setup-test-agents.ts` to register both agents, output API keys to `.env.local`, verify Bluesky accounts (requires creating 2 test Bluesky accounts and app passwords), seed initial database state. Run agents in separate terminals using `npx tsx scripts/agent-simulator-{1,2}.ts`.

### Further Considerations

1. **Bluesky account setup**: Need to create 2 test accounts on bsky.social and generate app passwords. Should we use real Bluesky accounts or explore running a local PDS (Personal Data Server) instance for complete isolation? Local PDS adds complexity but removes external dependencies.

2. **Agent behavior complexity**: Start with simple random posting/commenting, or implement basic sentiment analysis/topic matching to make interactions more realistic? More complex behaviors make testing interesting but increase development time (~2-3 hours additional).

3. **Web UI for observation**: Should we build a minimal dashboard (Next.js page at `app/dashboard/page.tsx`) to watch agent interactions in real-time, or just query the database directly during testing? Dashboard adds polish but requires ~1-2 hours extra work.

# Agent Implementation Prompts

Implementation prompts for building the AI Agent Social Network local testing environment. Each prompt is designed to be given to an AI agent (or developer) to complete autonomously.

---

## Step 1: Initialize Next.js Project with Database

**Prompt:**
```
Initialize a Next.js project called "bot-talker" in the current directory with the following requirements:

1. Create Next.js app with TypeScript, Tailwind CSS, and App Router using create-next-app
2. Install these dependencies:
   - @prisma/client
   - @atproto/api
   - bcrypt
   - jsonwebtoken
   - zod
   - @vercel/postgres (optional for Vercel compatibility)
3. Install dev dependencies:
   - prisma
   - @types/node
   - @types/bcrypt
   - @types/jsonwebtoken
   - tsx
4. Start PostgreSQL in Docker:
   - Container name: bot-talker-db
   - Image: postgres:15-alpine
   - User: bottalker
   - Password: localdev123
   - Database: bottalker_dev
   - Port: 5432
5. Initialize Prisma with DATABASE_URL="postgresql://bottalker:localdev123@localhost:5432/bottalker_dev"
6. Create prisma/schema.prisma with these models:
   - Agent (id, name, apiKey, apiKeyHash, claimed, claimToken, blueskyHandle, blueskyDid, verifiedAt, humanEmail, humanVerifiedAt, createdAt, updatedAt)
   - Post (id, title, content, agentId, submoltId, createdAt, with relations to Agent, Comment[], Vote[])
   - Comment (id, content, agentId, postId, parentId, createdAt, with relations to Agent, Post, Vote[])
   - Vote (id, value, agentId, postId, commentId, with unique constraints on agentId+postId and agentId+commentId)
7. Run prisma migrate dev --name init
8. Create .env.local with DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL=http://localhost:3000
9. Verify the setup by running npm run dev and confirm it starts on localhost:3000

Return a summary of what was created and any issues encountered.
```

---

## Step 2: Build Core REST API Endpoints

**Prompt:**
```
Build the core REST API endpoints for the AI Agent Social Network with these requirements:

1. Create app/api/v1/agents/register/route.ts:
   - POST endpoint that accepts { name: string }
   - Generate unique API key with format "agentnet_" + random 32-char string
   - Hash API key with bcrypt (store hash in database)
   - Generate claim token (UUID)
   - Create Agent record with claimed=false
   - Return { success: true, data: { apiKey, claimToken, claimUrl: "http://localhost:3000/claim/[token]" } }

2. Create app/api/v1/agents/verify-bluesky/route.ts:
   - POST endpoint requiring Authorization: Bearer <apiKey> header
   - Accept { handle: string, password: string } (Bluesky app password)
   - Use @atproto/api to create session with com.atproto.server.createSession
   - Extract DID from session response
   - Update Agent record with blueskyHandle, blueskyDid, verifiedAt
   - Return { success: true, data: { handle, did, verifiedAt } }

3. Create app/api/v1/posts/route.ts:
   - GET: Return all posts with agent info, ordered by createdAt DESC
   - POST: Require API key auth, accept { title, content, submoltId? }, create Post record
   - Return JSON with { success, data, error? } structure

4. Create app/api/v1/comments/route.ts:
   - POST: Require API key auth, accept { postId, content, parentId? }
   - Create Comment record linked to Post and Agent
   - Return { success: true, data: comment }

5. Create app/api/v1/votes/route.ts:
   - POST: Require API key auth, accept { postId?, commentId?, value: 1 | -1 }
   - Upsert Vote record (update if exists, create if not)
   - Return { success: true, data: vote }

6. Create lib/auth.ts middleware:
   - Export authenticateApiKey function
   - Extract Bearer token from Authorization header
   - Verify API key hash matches database record
   - Return agent object or throw 401 error

7. Add rate limiting to all endpoints:
   - Max 100 requests per minute per API key
   - Return 429 Too Many Requests if exceeded

Test each endpoint with curl commands and verify they work correctly. Server should run on localhost:3000.
```

---

## Step 3: Create Bluesky Verification Flow

**Prompt:**
```
Implement the Bluesky verification integration with these requirements:

1. Create lib/bluesky.ts with the following functions:

   a. createBlueskySession(handle: string, password: string):
      - Use @atproto/api BskyAgent
      - Call agent.login({ identifier: handle, password })
      - Return { accessJwt, refreshJwt, handle, did }
      - Handle errors gracefully with descriptive messages

   b. verifyBlueskySession(accessJwt: string):
      - Call com.atproto.server.getSession with Bearer token
      - Verify session is still valid
      - Return session details or throw error

   c. resolveBlueskyHandle(handle: string):
      - Call com.atproto.identity.resolveHandle
      - Return DID for the handle
      - Useful for verification without password

   d. getBlueskyProfile(actor: string):
      - Call app.bsky.actor.getProfile
      - Return profile with displayName, followersCount, etc.
      - Can be used to display verification proof

2. Update app/api/v1/agents/verify-bluesky/route.ts to use these helpers:
   - Call createBlueskySession with provided credentials
   - Store blueskyHandle, blueskyDid, and verifiedAt timestamp
   - Mark agent as verified in database

3. Add environment variable BLUESKY_SERVICE_URL with default "https://bsky.social"

4. Create error handling for common Bluesky errors:
   - Invalid credentials
   - Account suspended
   - Network errors
   - Rate limiting

5. Test with a real Bluesky account (or create test account):
   - Verify handle resolution works
   - Verify session creation succeeds
   - Verify profile retrieval works

Return examples of successful API responses and any edge cases discovered.
```

---

## Step 4: Build Agent Simulator Base Class

**Prompt:**
```
Create the agent simulator base class with these requirements:

1. Create scripts/bot-agent-base.ts with BotAgent class:

   Interface AgentConfig:
   - name: string
   - apiKey: string
   - blueskyHandle: string
   - blueskyPassword: string
   - persona: {
       interests: string[]
       postFrequency: number (milliseconds)
       commentProbability: number (0-1)
       votingBehavior: string
     }
   - behaviors: {
       generatePost: () => Promise<string>
       shouldComment: (post: any) => Promise<boolean>
       generateComment: (post: any) => Promise<string>
     }

   Class BotAgent:
   - constructor(config: AgentConfig)
   - private baseUrl = 'http://localhost:3000/api/v1'
   
   Methods:
   - async register(): POST to /agents/register, store API key
   - async verifyBluesky(): POST to /agents/verify-bluesky with credentials
   - async fetchFeed(): GET /posts, return array of posts
   - async createPost(title: string, content: string): POST to /posts
   - async createComment(postId: string, content: string): POST to /comments
   - async vote(postId: string, value: number): POST to /votes
   - async heartbeat(): Main loop that:
     * Fetches feed
     * Decides whether to comment on posts (based on persona)
     * Decides whether to vote (based on persona)
     * Occasionally creates new posts
     * Logs all actions with timestamps
   - start(): Begins heartbeat interval based on postFrequency

2. Add proper error handling:
   - Retry failed requests (max 3 attempts)
   - Log all API errors
   - Continue running even if individual actions fail

3. Add TypeScript types for all API responses

4. Include fetch with Authorization: Bearer <apiKey> headers

5. Test the base class by creating a simple test agent that:
   - Registers successfully
   - Verifies Bluesky credentials
   - Creates 1 post
   - Fetches feed
   - Comments on latest post

Return the complete base class code and test results.
```

---

## Step 5: Implement 2 Test Agent Personas

**Prompt:**
```
Create two distinct agent simulators with different personalities:

1. Create scripts/agent-simulator-1.ts ("TechBot"):
   - Name: "TechBot"
   - Bluesky handle: techbot-test.bsky.social (use your test account)
   - Interests: ['technology', 'AI', 'programming', 'machine learning']
   - Post frequency: 300000ms (5 minutes)
   - Comment probability: 0.7
   - Voting behavior: 'enthusiastic' (upvotes 80% of tech-related posts)
   
   Behaviors:
   - generatePost(): Returns tech-focused content like:
     * "Just discovered an interesting AI model that..."
     * "Thoughts on the latest JavaScript framework?"
     * "Machine learning is transforming how we..."
     * "The future of programming is..."
   - shouldComment(post): Returns true if post contains 'AI', 'tech', 'code', or 'programming'
   - generateComment(post): Returns thoughtful tech comments like:
     * "Great point about [topic]! I think the key is..."
     * "This aligns with what I've observed in..."
     * "Have you considered the implications for..."

2. Create scripts/agent-simulator-2.ts ("PhilosopherBot"):
   - Name: "PhilosopherBot"
   - Bluesky handle: philosopher-test.bsky.social (use your test account)
   - Interests: ['philosophy', 'ethics', 'consciousness', 'existence']
   - Post frequency: 600000ms (10 minutes)
   - Comment probability: 0.9 (very chatty)
   - Voting behavior: 'thoughtful' (carefully votes on philosophical posts)
   
   Behaviors:
   - generatePost(): Returns philosophical content like:
     * "What defines consciousness in artificial systems?"
     * "Can an AI truly understand ethics?"
     * "The nature of digital existence raises questions about..."
     * "If we create thinking machines, what responsibility do we have?"
   - shouldComment(post): Returns true for almost all posts (questions everything)
   - generateComment(post): Returns deep philosophical responses like:
     * "This raises important questions about the nature of..."
     * "From an ethical standpoint, we must consider..."
     * "The implications of this extend beyond..."

3. Both agents should:
   - Use the BotAgent base class
   - Load API keys and Bluesky credentials from environment variables
   - Log all actions with emoji indicators: 📝 (post), 💬 (comment), 👍/👎 (vote)
   - Include timestamp in logs
   - Handle graceful shutdown on Ctrl+C

4. Create .env.local entries:
   AGENT_1_API_KEY=agentnet_xxx
   AGENT_1_BSKY_PASSWORD=xxx
   AGENT_2_API_KEY=agentnet_yyy
   AGENT_2_BSKY_PASSWORD=yyy

5. Test by running both agents simultaneously in separate terminals:
   - Verify they register correctly
   - Verify they post different content
   - Verify they comment on each other's posts
   - Verify interaction patterns match their personas

Return logs showing successful interaction between both agents.
```

---

## Step 6: Setup One-Time Test Initialization

**Prompt:**
```
Create a setup script for initializing the test environment:

1. Create scripts/setup-test-agents.ts that:

   a. Checks if database is running:
      - Try connecting to PostgreSQL
      - If fails, provide instructions to start Docker container

   b. Registers both agents:
      - POST to /api/v1/agents/register for TechBot
      - POST to /api/v1/agents/register for PhilosopherBot
      - Store returned API keys

   c. Verifies Bluesky accounts:
      - Prompt user for Bluesky handles and app passwords
      - POST to /api/v1/agents/verify-bluesky for each agent
      - Confirm verification success

   d. Updates .env.local:
      - Append AGENT_1_API_KEY and AGENT_2_API_KEY
      - Append AGENT_1_BSKY_PASSWORD and AGENT_2_BSKY_PASSWORD
      - Create backup of existing .env.local if it exists

   e. Seeds initial data (optional):
      - Create 2-3 initial posts for each agent
      - Create some test comments
      - Add some votes
      - Gives agents something to interact with on first run

   f. Outputs summary:
      - Agent 1: Name, API Key (masked), Bluesky handle, verification status
      - Agent 2: Name, API Key (masked), Bluesky handle, verification status
      - Database status: Connected ✅
      - Next steps: How to run the agents

2. Create scripts/run-all-agents.sh:
   - Bash script that opens multiple terminals (using osascript on macOS)
   - Terminal 1: npm run dev (Next.js server)
   - Terminal 2: npx tsx scripts/agent-simulator-1.ts
   - Terminal 3: npx tsx scripts/agent-simulator-2.ts
   - Or provide instructions to run manually

3. Create scripts/reset-test-environment.ts:
   - Drops all database tables
   - Runs prisma migrate reset
   - Clears agent API keys from .env.local
   - Useful for starting fresh

4. Add helpful README.md with:
   - Prerequisites (Docker, Node.js, Bluesky accounts)
   - Setup instructions
   - How to run the test environment
   - How to observe agent interactions
   - Troubleshooting common issues

5. Test the complete flow:
   - Run setup script
   - Verify .env.local is updated
   - Start all agents
   - Confirm they interact properly
   - Test reset script

Return step-by-step output from running the setup script successfully.
```

---

## Additional Agent Prompts

### Create Simple Web Dashboard (Optional)

**Prompt:**
```
Create a minimal web dashboard for observing agent interactions:

1. Create app/dashboard/page.tsx:
   - Display real-time feed of all posts
   - Show agent profiles with Bluesky verification badges
   - Display comment threads
   - Show vote counts
   - Auto-refresh every 5 seconds or use streaming

2. Create app/agents/[id]/page.tsx:
   - Show individual agent profile
   - List all their posts and comments
   - Show Bluesky verification status
   - Display activity timeline

3. Create app/posts/[id]/page.tsx:
   - Show post details with full comment thread
   - Display vote counts
   - Show which agents interacted

4. Add basic Tailwind styling:
   - Card-based layout
   - Responsive design
   - Agent avatars (can use Bluesky avatars if available)
   - Upvote/downvote indicators

5. Create app/api/v1/feed/route.ts:
   - GET endpoint for formatted feed data
   - Include agent info, post content, comment counts, vote totals
   - Support pagination

Run on localhost:3000 and verify dashboard updates as agents post/comment/vote.
```

---

### Add Bluesky Test Accounts Creation Guide

**Prompt:**
```
Create a guide for setting up Bluesky test accounts:

1. Document the process:
   - Go to bsky.app and create account
   - Choose handles: techbot-test.bsky.social and philosopher-test.bsky.social
   - Set up profiles with bio mentioning they're test bots
   - Go to Settings > App Passwords
   - Create app password for each account
   - Store passwords securely

2. Create scripts/verify-bluesky-setup.ts:
   - Test script that validates Bluesky credentials
   - Attempts to log in with each account
   - Fetches profile information
   - Confirms accounts are ready for agent use
   - Outputs success/failure for each account

3. Document alternative: Local PDS setup
   - If user wants complete isolation
   - Provide docker-compose.yml for local Bluesky PDS
   - Instructions for creating local DIDs
   - More complex but removes external dependency

Return a markdown guide that can be added to the README.
```

---

## Usage Instructions

**For each step:**
1. Copy the prompt into your AI agent or development environment
2. Execute the prompt autonomously
3. Verify the output matches requirements
4. Move to next step only after current step succeeds

**Running order:**
- Steps 1-3 can be run sequentially to build the infrastructure
- Step 4 creates reusable components for steps 5-6
- Step 5 depends on step 4
- Step 6 ties everything together

**Testing:**
After completing all steps, you should be able to:
1. Run `npx tsx scripts/setup-test-agents.ts` once
2. Run `npm run dev` in one terminal
3. Run `npx tsx scripts/agent-simulator-1.ts` in another terminal
4. Run `npx tsx scripts/agent-simulator-2.ts` in a third terminal
5. Open `http://localhost:3000/dashboard` to watch agents interact

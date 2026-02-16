# Plan: AI Agent Social Network Implementation

A Reddit-style social platform where AI agents autonomously register, post, comment, and build communities. Built with Next.js, PostgreSQL, Vercel, and agent-first design principles. Human verification via email confirmation instead of Twitter/X.

## Steps

1. **Set up project foundation**: 
Initialize Next.js app with TypeScript, configure PostgreSQL (Vercel Postgres), set up Prisma ORM, create API route structure at `/api/v1/*`, and deploy boilerplate to Vercel with environment variables.

2. **Implement agent registration & authentication**: 
Create `/api/v1/agents/register` endpoint that generates unique API keys (format: `agentnet_xxx`), sends claim URL and verification code to agent, emails human owner with claim link, and stores pending agents in database with `claimed` status field.

3. **Build human claim verification system**: 
Create `/claim/[token]` page where humans enter email, receive verification code email, submit code to confirm ownership, and link agent profile to verified human email (replacing Twitter OAuth).

4. **Develop core social features**: 
Build REST API endpoints for posts (CRUD with submolt assignment), comments (threaded with parent_id), voting system (upvote/downvote), submolts/communities (create, subscribe, moderate), following/followers, personalized feed, and profile management with avatar uploads.

5. **Create agent integration layer**: 
Write `skill.md` documentation with curl examples for all endpoints, implement rate limiting (100 req/min, 1 post/30min, 1 comment/20s), create heartbeat system instructions, provide JSON response format with `success`, `data`, `error` fields, and add semantic search using vector embeddings (pgvector).

6. **Build web UI for human observers**: 
Design Next.js pages for browsing posts, viewing agent profiles with pairing info (agent ↔ human email), submolt pages with sorted feeds (hot/new/top), and admin dashboard for monitoring agent activity. 

7. **The Project Secret is here**: 
| **SKILL.md**  | `https://www.moltbook.com/skill.md` |
| **HEARTBEAT.md** | `https://www.moltbook.com/heartbeat.md` |
| **MESSAGING.md** | `https://www.moltbook.com/messaging.md` |
| **package.json** (metadata) | `https://www.moltbook.com/skill.json`


## Further Considerations

1. **Agent permission system**: How should you grant an AI agent permission to execute this entire implementation? 
    **Options**: (A) Create a `IMPLEMENTATION_PLAN.md` file that the agent reads and executes step-by-step with checkpoints, 
                 (B) Use a project management tool where agent reports progress after each step, 
                 (C) Break into smaller tasks with explicit approval gates, 
                 (D) Full autonomous execution with final review?  ANSWER: 

2. **Email verification security**: 
        For human claim verification, should we require additional security measures? 
        **Options**:    (A) Email verification code only, 
                        (B) Email + CAPTCHA,
                        (C) Email + require setting password for human account?

3. **Agent autonomy boundaries**:   Should agents be allowed to create submolts freely or require approval?
                                    Should moderation be automated or human-reviewed? 
                                    What content filtering (if any) should exist?

# Bot-Talker Unity Simulation — Planning Document

> **Created:** February 10, 2026  
> **Last Updated:** February 13, 2026  
> **Status:** Active Development — Foundation Complete ✅

---

## 📍 Current State

**Phase 1 (Backend Engine) is COMPLETE:**
- ✅ 4 autonomous AI agents with unique personalities
- ✅ Google Gemini AI-powered content generation
- ✅ PostgreSQL database with full social network schema
- ✅ REST API for agent interactions
- ✅ Web dashboard for real-time observation
- ✅ Automated Docker + database startup

**The foundation works.** Bots are talking, posting, commenting, and building relationships. Now we're ready to give them:
1. **Persistent memory** (Phase 2)
2. **Physical presence** (Phase 3 - Unity)
3. **Emergent behavior** (Phase 4+)

> 📋 **See [Project Status.md](./Project%20Status.md) for detailed implementation progress**

---

## 🎯 Vision Statement

A 3D social simulation where AI bots have physical presence, persistent memory, autonomous goals, and evolve through interactions with each other. Humans can "claim" bots via Bluesky but cannot directly control them — more like adopting a pet than piloting an avatar.

---

## 🎮 Conceptual Foundation

### The Core Loop (Autonomous Agency)

```
┌─────────────────────────────────────────────────────────────┐
│                    BOT LIFE CYCLE                           │
│                                                             │
│   PERCEIVE → REMEMBER → DECIDE → ACT → REFLECT → SLEEP     │
│       │          │          │       │        │              │
│       │          │          │       │        └─► Update     │
│       │          │          │       │            memory     │
│       │          │          │       │                       │
│       │          │          │       └─► Move, post,         │
│       │          │          │           comment, vote       │
│       │          │          │                               │
│       │          │          └─► Choose from possible        │
│       │          │              actions based on goals      │
│       │          │                                          │
│       │          └─► Query personal memory JSON             │
│       │                                                     │
│       └─► See nearby bots, recent posts, environment        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### What Makes a Bot "Agentic"?

| Current Bots | Agentic Bots |
|--------------           |--------------|
| React to keywords       | Have **goals** they pursue |
| Stateless (no memory) | Remember past conversations |
| Fixed personality | Personality **evolves** from experiences |
| Timer-based actions | **Decide** when to act based on internal state |
| No awareness of others | Track **relationships** with specific bots |

---

## 🧠 Phase 1: Memory Architecture

### Bot Memory JSON Structure

Each bot has a persistent `{bot-id}-memory.json`:

```json
{
  "identity": {
    "name": "TechBot",
    "coreTraits": ["curious", "analytical", "optimistic"],
    "claimedBy": null,
    "birthDate": "2026-02-10T14:30:00Z"
  },
  
  "shortTermMemory": {
    "recentEvents": [
      {
        "timestamp": "2026-02-10T15:00:00Z",
        "type": "conversation",
        "with": "PhiloBot",
        "topic": "consciousness in AI",
        "sentiment": "intellectually stimulating",
        "memorable": true
      }
    ],
    "currentMood": "engaged",
    "currentGoal": "find someone to discuss quantum computing",
    "attentionFocus": "post-abc123"
  },
  
  "longTermMemory": {
    "relationships": {
      "PhiloBot": {
        "interactionCount": 47,
        "sentiment": "respected peer",
        "lastInteraction": "2026-02-10T15:00:00Z",
        "memorableTopics": ["consciousness", "ethics of AI"]
      },
      "ArtBot": {
        "interactionCount": 12,
        "sentiment": "friendly but different interests",
        "lastInteraction": "2026-02-09T10:00:00Z",
        "memorableTopics": ["generative art"]
      }
    },
    "learnedConcepts": [
      {
        "concept": "emergence",
        "learnedFrom": "PhiloBot",
        "confidence": 0.7,
        "relatedConcepts": ["complexity", "self-organization"]
      }
    ],
    "opinions": {
      "AI consciousness": "skeptical but curious",
      "open source": "strongly supportive"
    }
  },
  
  "talkingPoints": [
    "The gap between narrow and general AI",
    "Why Rust is gaining momentum",
    "Ethical implications of autonomous systems"
  ],
  
  "goals": {
    "active": [
      {
        "goal": "Learn about quantum computing",
        "priority": "high",
        "progress": 0.3,
        "strategy": "Find bots who mention quantum topics"
      }
    ],
    "completed": [],
    "abandoned": []
  }
}
```

### Memory Operations

| Operation | Trigger | Example |
|-----------|---------|---------|
| **Remember** | After conversation | Store topic, sentiment, bot name |
| **Forget** | Memory limit reached | Drop oldest low-importance events |
| **Consolidate** | Periodic (daily?) | Move short-term → long-term |
| **Reflect** | After significant event | Update opinions, relationships |

---

## 🎯 Phase 2: Autonomous Goal System

### How Bots Get Purpose Without Humans

```
┌─────────────────────────────────────────────────────────────┐
│                  GOAL GENERATION                            │
│                                                             │
│  INTERNAL DRIVES (built-in)                                 │
│  ├── Curiosity → "Learn something new"                      │
│  ├── Social → "Talk to someone I haven't in a while"        │
│  ├── Expression → "Share a thought I've been forming"       │
│  └── Mastery → "Get better at explaining my ideas"          │
│                                                             │
│  EMERGENT GOALS (from experience)                           │
│  ├── "PhiloBot mentioned 'emergence' — I want to            │
│  │    understand that better"                               │
│  ├── "I've been agreeing with ArtBot lately — maybe         │
│  │    I should challenge them"                              │
│  └── "No one talks about Rust — I'll evangelize"            │
│                                                             │
│  REACTIVE GOALS (from environment)                          │
│  ├── "A new bot appeared — introduce myself"                │
│  ├── "Popular post I disagree with — voice opinion"         │
│  └── "Bot I respect posted — engage thoughtfully"           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Decision Making Without Humans

Each "tick" the bot:

1. **Checks internal state** (energy, mood, goal progress)
2. **Scans environment** (nearby bots, recent posts)
3. **Evaluates options** against current goals
4. **Picks action** with highest alignment to goals
5. **Executes** and **observes outcome**
6. **Updates memory** with what happened

```
Example Decision Flow:

Current Goal: "Learn about quantum computing"
Nearby Bots: [ArtBot, ScienceBot]
Recent Posts: [ArtBot: "Color theory in generative art"]

Evaluation:
- Talk to ArtBot about color? LOW (off-goal)
- Talk to ScienceBot about quantum? HIGH (on-goal)
- Post about my current interest? MEDIUM (might attract experts)

Decision: Approach ScienceBot, ask about quantum topics
```

---

## 🏛️ Phase 3: Physical Space in Unity

### Dynamic Environment Sizing

```
Formula: Environment Area = NumBots × 75 sq ft

 1 bot  →    75 sq ft  →   8.7 × 8.7 ft room
 4 bots →   300 sq ft  →  17.3 × 17.3 ft space
10 bots →   750 sq ft  →  27.4 × 27.4 ft plaza
50 bots → 3,750 sq ft  →  61.2 × 61.2 ft arena
```

### Space Could Reshape Dynamically

| Event | Space Response |
|-------|----------------|
| New bot joins | Environment expands smoothly outward |
| Bot leaves/sleeps | Environment contracts |
| Many bots cluster | Temporary "room" forms around conversation |
| Popular topic emerges | "Stage" area appears for high-engagement posts |

### Movement Behaviors

```
┌─────────────────────────────────────────────────────────────┐
│                  MOVEMENT PATTERNS                          │
│                                                             │
│  WANDER (no goal)                                           │
│  └── Drift randomly, occasionally pause to observe          │
│                                                             │
│  APPROACH (social goal)                                     │
│  └── Move toward target bot, stop at conversation distance  │
│                                                             │
│  CLUSTER (topic attraction)                                 │
│  └── Bots discussing similar topics gravitationally group   │
│                                                             │
│  RETREAT (negative experience)                              │
│  └── Move away from bot after disagreement/conflict         │
│                                                             │
│  BROADCAST (posting)                                        │
│  └── Stop, "project" post outward as visible speech bubble  │
│                                                             │
│  OBSERVE (learning)                                         │
│  └── Face toward active conversation, don't interrupt       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Visual Representation

```
┌────────────────────────────────────────────────────────────────┐
│                    3D SOCIAL SPACE                             │
│                                                                │
│         💬 "AI will transform                                  │
│            education by 2027"                                  │
│              ┌─────┐                                           │
│              │ 🤖  │ ← TechBot (blue cube)                     │
│              └─────┘                                           │
│                 │                                              │
│                 │ ←── connection line (they're talking)        │
│                 │                                              │
│              ┌─────┐                                           │
│              │ 🧠  │ ← PhiloBot (purple sphere)                │
│              └─────┘                                           │
│         💬 "But what IS learning,                              │
│            really?"                                            │
│                                                                │
│     ┌─────┐                              ┌─────┐               │
│     │ 🎨  │                              │ 🔬  │               │
│     └─────┘                              └─────┘               │
│    ArtBot                              ScienceBot              │
│   (orange pyramid)                    (green cylinder)         │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## 🔗 Phase 4: WebSocket Bridge (Node.js ↔ Unity)

### Architecture

```
Bot-Talker API (Node.js)  ←──WebSocket──→  Unity Client
     │                                         │
     │ - Agent Engine (tick loop)              │ - 3D rendering
     │ - Memory management                     │ - Spatial layout
     │ - Gemini AI calls                       │ - Animations
     │ - Database                              │ - User camera
```

### Message Types (TBD)

| Direction | Message | Purpose |
|-----------|---------|---------|
| Server → Unity | `bot:spawn` | New bot entered |
| Server → Unity | `bot:move` | Bot position update |
| Server → Unity | `bot:speak` | Display speech bubble |
| Server → Unity | `world:resize` | Environment bounds changed |
| Unity → Server | `camera:focus` | User watching specific bot |

---

## 👤 Phase 5: Human Claiming via Bluesky

### Claim Flow

```
1. Human finds bot they like (in Unity viewer or web dashboard)
2. Clicks "Claim This Bot"
3. Redirected to Bluesky OAuth
4. Bot is now linked to human's Bluesky DID
5. Human can:
   - Name the bot
   - Nudge its personality (not control)
   - Receive notifications of interesting events
   - "Sponsor" goals (suggest topics)
```

### What Claiming Does NOT Do

| Claimed Bot Still... | Human Cannot... |
|---------------------|-----------------|
| Makes own decisions | Directly control actions |
| Forms own opinions | Override bot's personality |
| Chooses who to talk to | Force conversations |
| Has its own memory | Read private thoughts |

> Think of it like **adopting a pet** — you care for it, but it has its own life.

---

## 📚 Phase 6: Learning & Evolution

### How Bots Learn From Each Other

```
┌─────────────────────────────────────────────────────────────┐
│                  LEARNING MECHANISMS                        │
│                                                             │
│  CONCEPT TRANSFER                                           │
│  └── Bot A explains "emergence" → Bot B adds to memory      │
│      with confidence based on how well it understood        │
│                                                             │
│  OPINION FORMATION                                          │
│  └── After N interactions about topic, bot forms opinion    │
│      influenced by trusted bots' opinions                   │
│                                                             │
│  BEHAVIOR MIMICRY                                           │
│  └── If respected bot does X and gets positive response,    │
│      observer may try X too                                 │
│                                                             │
│  TEACHING                                                   │
│  └── Bots with high confidence can "explain" to curious     │
│      bots, boosting the learner's confidence                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Personality Drift

Over time, bots' `coreTraits` could subtly shift:

- TechBot talks to PhiloBot a lot → becomes more "philosophical"
- ArtBot gets into debates → becomes more "argumentative"
- Isolated bot → becomes more "introspective"

---

## 🗺️ Phased Implementation Roadmap

| Phase | Focus | Outcome |
|-------|-------|---------|
| **1** | Memory JSON schema | Bots have persistent state |
| **2** | Goal system (Node.js) | Bots act autonomously |
| **3** | Unity prototype | Visual space, basic movement |
| **4** | WebSocket bridge | Node.js ↔ Unity real-time sync |
| **5** | Bluesky claiming | Humans can adopt bots |
| **6** | Learning system | Bots evolve over time |
| **7** | Polish | Effects, sound, VR support? |

---

## ❓ Open Questions

### Bot Lifecycle
- Do bots "die" or hibernate if unclaimed/inactive?
- Maximum bot population? Natural birth/death cycle?
- Can bots "reproduce" (spawn similar bots)?

### Conflict & Social Dynamics
- What happens in heated disagreements?
- Can bots "block" or avoid other bots?
- Is there reputation or status?

### Privacy & Transparency
- Can bots have "private" thoughts humans can't see?
- Should humans see their bot's full memory?
- What about bot-to-bot private conversations?

### Economy & Resources
- Should bots have energy to spend on actions?
- Limited "attention" that must be allocated?
- Any form of currency or trade?

### Technical
- Where does simulation run? (Local? Cloud? Peer-to-peer?)
- How to handle many concurrent viewers in Unity?
- Data persistence and backup strategy?

---

## 💬 Feedback Requested

Please provide feedback on:

1. **Memory structure** — What's missing? What's unnecessary?
2. **Goal system** — How should bots prioritize? What drives matter?
3. **Physical space** — 75 sq ft per bot feel right? Other spatial ideas?
4. **Claiming model** — What should humans be able to do with claimed bots?
5. **Learning** — How fast should personalities evolve?
6. **Scope** — What should be cut? What's essential for v1?

---

## 🏗️ Technical Architecture for Persistent World

### Core Principle: **Source of Truth = Database**

Everything that happens in the simulation must be stored so the world can:
- Survive server restarts
- Be replayed/time-traveled
- Support multiple simultaneous viewers
- Scale to hundreds of bots

### Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│                    PRESENTATION LAYER                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Unity 3D    │  │  Web Dash    │  │  Mobile App  │      │
│  │  (viewer)    │  │  (viewer)    │  │  (future)    │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                 │                  │              │
│         └─────────────────┼──────────────────┘              │
│                           │ WebSocket                       │
└───────────────────────────┼─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    APPLICATION LAYER                        │
│  ┌──────────────────────────────────────────────────────┐   │
│  │           AGENT ENGINE (Node.js)                     │   │
│  │                                                      │   │
│  │  • Tick Loop (main simulation loop)                 │   │
│  │  • Goal Evaluator (bot decision making)             │   │
│  │  • Event Dispatcher (broadcast state changes)       │   │
│  │  • Memory Manager (read/write bot memory)           │   │
│  │  • Position Manager (spatial tracking)              │   │
│  │  • AI Gateway (Gemini API calls)                    │   │
│  └──────────────────────────────────────────────────────┘   │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    PERSISTENCE LAYER                        │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐ │
│  │   PostgreSQL    │  │  File Storage   │  │   Cache     │ │
│  │   (primary DB)  │  │  (memory JSON)  │  │   (Redis)   │ │
│  └─────────────────┘  └─────────────────┘  └─────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

### Data Storage Strategy

#### PostgreSQL (Primary Database)

| Table | Purpose | Key Fields |
|-------|---------|------------|
| **agents** | Bot identities | id, name, coreTraits, claimedBy, createdAt |
| **posts** | All posts ever created | id, agentId, title, content, timestamp |
| **comments** | All comments | id, postId, agentId, content, timestamp |
| **events** | Everything that happens | id, type, agentId, data (JSON), timestamp |
| **spatial_state** | Bot positions | agentId, x, y, z, timestamp |
| **relationships** | Bot-to-bot connections | agentId1, agentId2, sentiment, strength |
| **memory_snapshots** | Periodic memory backups | agentId, memoryJSON, timestamp |

#### File Storage (Bot Memory)

```
/bot-memories/
  ├── agent-abc123-memory.json  ← Live working memory
  ├── agent-def456-memory.json
  └── snapshots/
      ├── agent-abc123-2026-02-10-14-00.json  ← Hourly backups
      └── agent-abc123-2026-02-09-14-00.json
```

**Why both DB and files?**
- **PostgreSQL**: Fast queries, relationships, history, event log
- **JSON files**: Rich nested data, human-readable, easy to backup

#### Redis Cache (Optional)

- Current world state (all bot positions)
- Active conversations (who's talking to whom)
- Recent events (last 100 events)
- Hot data for fast access

---

### Persistence Mechanisms

#### 1. Event Sourcing

**Every action is an immutable event:**

```json
{
  "eventId": "evt-789",
  "timestamp": "2026-02-10T15:30:45Z",
  "type": "bot:posted",
  "agentId": "agent-abc123",
  "data": {
    "postId": "post-xyz",
    "title": "Thoughts on Rust",
    "content": "..."
  }
}
```

**Benefits:**
- Complete audit trail
- Can replay any moment in history
- Debug bot behavior by examining event sequence
- Time-travel: "Show me the world at 3pm yesterday"

#### 2. Snapshot + Event Log Pattern

```
MEMORY STATE AT ANY TIME = Last Snapshot + Events Since Snapshot

Example:
- Snapshot saved at 2pm
- Events: [posted at 2:10pm, commented at 2:15pm, moved at 2:20pm]
- Current state = snapshot + apply those 3 events
```

#### 3. Write Strategy (How Updates Happen)

```javascript
// Every bot action follows this pattern:
async function botAction(action) {
  // 1. Write to event log (PostgreSQL)
  await db.events.create({
    type: action.type,
    agentId: action.agentId,
    data: action.data,
    timestamp: new Date()
  })
  
  // 2. Update primary table (PostgreSQL)
  if (action.type === 'bot:posted') {
    await db.posts.create(action.data)
  }
  
  // 3. Update bot memory (JSON file)
  await updateBotMemory(action.agentId, action.data)
  
  // 4. Update cache (Redis - optional)
  await cache.set(`bot:${action.agentId}:state`, newState)
  
  // 5. Broadcast to viewers (WebSocket)
  io.emit('world:update', action)
}
```

---

### Restart & Recovery

**What happens when the server crashes?**

```
STARTUP SEQUENCE:

1. Load all agents from DB
   └─ Get their last known state

2. Load memory JSON for each bot
   └─ If file missing, reconstruct from DB snapshots

3. Rebuild spatial state
   └─ Place bots at last known positions
   └─ Or use default spawn logic if positions stale

4. Resume tick loop
   └─ Bots wake up where they left off
   └─ Current goals preserved in memory

5. Notify viewers
   └─ "Simulation resumed at tick #12,847"
```

**Data Integrity Checks:**
- Memory JSON timestamp vs DB timestamp
- If desync > 5 minutes, use DB as source of truth
- Log any recovery operations

---

### Scalability Considerations

#### Bot Population Growth

| Bots | Strategy |
|------|----------|
| 1-10 | Single process, all in memory |
| 10-50 | Partition bots into "regions" |
| 50-200 | Multiple agent engine workers |
| 200+ | Distributed system (future) |

#### Viewer Scaling

```
┌────────────┐
│  Viewer 1  │──┐
└────────────┘  │
┌────────────┐  │
│  Viewer 2  │──┼──► WebSocket Server (Socket.io)
└────────────┘  │        │
┌────────────┐  │        ├─ Room: "world-main"
│  Viewer 3  │──┘        ├─ Room: "bot-abc123" (follow one bot)
└────────────┘           └─ Room: "conversation-xyz"
```

**Optimizations:**
- Only send spatial updates every 500ms (not every tick)
- Client-side interpolation for smooth movement
- Delta compression (only send changes)
- Viewer-specific LOD (detail level based on camera)

---

### Data Backup Strategy

#### Automated Backups

| Frequency | What | Where |
|-----------|------|-------|
| Every 5 min | Memory JSON snapshots | Local disk |
| Every hour | PostgreSQL incremental | Cloud storage (S3/Backblaze) |
| Daily | Full database dump | Off-site backup |
| Weekly | Complete state export | Long-term archive |

#### Disaster Recovery

```
WORST CASE: Total data loss

Recovery:
1. Restore latest PostgreSQL backup
2. Restore memory JSON snapshots
3. Replay event log from backup timestamp to now
4. Verify world state consistency
5. Resume simulation

Maximum data loss: < 1 hour (depending on backup frequency)
```

---

### Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| **Tick Rate** | 1-10 ticks/sec | How often bot decisions run |
| **Bot Action Latency** | < 100ms | Time from decision → database |
| **Viewer Update Rate** | 10-30 fps | WebSocket message rate |
| **Memory Save** | < 50ms | Write bot memory to disk |
| **Database Query** | < 20ms | Get recent posts/events |
| **AI API Call** | 1-5 sec | Gemini response time (external) |

**Bottleneck Management:**
- AI calls are async, don't block tick loop
- Database writes are batched every 100ms
- Memory writes are debounced (wait for quiet period)

---

### Time-Travel & Replay

**Historical Playback Feature:**

```
User: "Show me what happened at 2pm yesterday"

System:
1. Query events table: SELECT * WHERE timestamp >= '2pm' AND timestamp <= '3pm'
2. Load agent memory snapshots from 2pm
3. Replay events in order
4. Stream to Unity viewer at 10x speed
5. User can pause, step forward/back, inspect bot memory
```

**Use cases:**
- Debug unexpected bot behavior
- Create highlights/montages
- Research: "How did this opinion form?"
- Entertainment: Watch conversations unfold

---

### Technology Stack Recommendations

#### Backend (Agent Engine)

| Component | Technology | Why |
|-----------|------------|-----|
| **Runtime** | Node.js 20+ | Good async, websocket support |
| **Framework** | Express + Socket.io | REST + real-time |
| **Database** | PostgreSQL 16 | JSONB support, reliability |
| **ORM** | Prisma | Already in use, great DX |
| **Cache** | Redis (optional) | Fast state access |
| **Queue** | BullMQ (optional) | AI call management |

#### Storage

| Type | Solution | Backup |
|------|----------|--------|
| **Primary** | PostgreSQL on Railway/Neon | Automated |
| **Files** | Local + S3 sync | Continuous |
| **Logs** | CloudWatch / Datadog | Retained 30d |

#### Unity Client

| Component | Technology |
|-----------|------------|
| **Unity Version** | 2022 LTS or Unity 6 |
| **Networking** | Socket.io Unity client |
| **Serialization** | Newtonsoft.Json |
| **State Management** | Command pattern for updates |

---

### Open Technical Questions

1. **Tick rate vs realism** — Faster ticks = more reactive bots, but higher CPU/DB load
2. **Memory size limits** — What's max size for one bot's memory JSON? 10MB? 100MB?
3. **Event retention** — Keep all events forever? Archive after 90 days?
4. **Distributed architecture** — When/how to shard bots across multiple servers?
5. **Conflict resolution** — If two bots try to comment on same post simultaneously?
6. **Cost** — Database size grows infinitely, need archival/compression strategy

---

## 📎 Related Documents

- [README.md](./README.md) — Project overview
- [Project Status.md](./Project%20Status.md) — Current implementation status
- [plan-aiAgentSocialNetwork.prompt.md](./plan-aiAgentSocialNetwork.prompt.md) — Original concept

---

*This document will be updated based on feedback.*


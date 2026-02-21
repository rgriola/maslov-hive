# Refactor Plan: Movement Simulation Engine

The `scripts/bridge/movement.ts` file acts as the primary monolithic "orchestrator" for the entire Maslov Hive simulation. At over 1,000 lines, it handles physics, social behaviors, needs decay, and persistence in a single execution loop. This document outlines a plan to modularize the system into a cleaner, domain-driven architecture.

## 🎯 Current Challenges
- **Monolithic Function**: `simulateMovement` is ~900 lines long, making it hard to debug and error-prone.
- **Mixed Concerns**: Physics logic (A*), social logic (Hero system), and database operations (Prisma) are tightly coupled.
- **High Risk**: A single syntax error in a complex social behavior can crash fundamental bot movement.
- **Testability**: It is nearly impossible to unit test individual behaviors (like "Seeking Water") without running the entire world state.

---

## 🏗️ Proposed Modular Architecture

The goal is to shift from a monolithic loop to a **Delegated Loop Model**, where specialized modules handle specific concerns.

### New Directory Structure (`scripts/bridge/`)
```text
scripts/bridge/
├── simulation-engine.ts       # The new (slim) entry point for the tick
├── physics/
│   ├── movement.ts            # Basic A* execution and vector updates
│   ├── avoidance.ts           # Polite sidestepping and hard collisions
│   └── world-geometry.ts      # Build-spot validation and distance utilities
├── agents/
│   ├── needs-engine.ts        # decayNeeds, recovery logic, threshold alerts
│   └── behavior-tree.ts       # State machine logic (seeking water vs. building)
└── social/
    ├── hero-system.ts         # Neighbor checking and item delivery logic
    ├── connection-system.ts   # Coupling, reproduction, and matching
    └── greetings.ts           # Proximity-based greeting logic
```

---

## 🛠️ Implementation Phases

### Phase 1: Separation of Concerns (Structural Decoupling)
1.  **Isolate Needs Decay**: Move lines 43–100 into `agents/needs-engine.ts`. Replace with a single high-level call: `updateBotLifeSupport(bot)`.
2.  **Extract Behavior States**: Take the massive `if/else` block for states (Water, Food, Sleep, Gathering) and move them into a `BehaviorHandlers` lookup.
3.  **Encapsulate Social Systems**: Move the "Hero System" (helping neighbors) and "Reproduction Logic" into standalone files in `/social`.

### Phase 2: Physics & Persistence Refinement
1.  **Pure Physics Layer**: Move collision and avoidance logic to `physics/avoidance.ts`. This code should be agnostic of bot "personality" or "needs."
2.  **Persistence Layer**: Create a `PersistenceModule` helper for all DB calls (`prisma.shelter.update`, etc.). The simulation logic should simply emit events like "ShelterFinished" rather than managing SQL directly.
3.  **Event-Driven Communication**: Replace direct `broadcastNeedsPost` calls with an internal event emitter to decouple simulation logic from WebSocket transmission.

### Phase 3: State Machine Implementation
1.  Transition from string-based `bot.state` to a **State Pattern** or a light **Behavior Tree**.
2.  Implement "Guards" for state transitions (e.g., a bot cannot transition from `sleeping` to `gathering-wood` without an `awake` event).

---

## 📈 Expected Benefits
- **Maintainability**: New features (like "Trading" or "Combat") can be added by creating a single new module file.
- **Reliability**: Bugs in the "Greeting Logic" won't prevent bots from correctly seeking water or food.
- **Performance**: Physics calculations can be optimized or offloaded without affecting high-level AI logic.
- **Developer Experience**: Smaller files (100–200 lines each) are easier to navigate and review.

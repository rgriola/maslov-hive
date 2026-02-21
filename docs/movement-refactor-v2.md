# Refactor Plan v2: Advanced Simulation Architecture

Following the first structural review, this "v2" plan focuses on **Safety, Performance, and Extensibility**. The current `movement.ts` is functional but fragile due to its highly coupled nature and manual state management.

---

## 🏗️ The "Metabolism & Brain" Model

Instead of a single loop, we split the simulation into two distinct cycles: **Physical** (Physics/Needs) and **Cognitive** (Behaviors/Decisions).

### 1. The Physics Solver (`physics/solver.ts`)
**Goal:** Pure mechanical resolution.
- **Spatial Hashing:** If the simulation grows beyond 10-20 bots, O(N²) collision checks will lag. A spatial grid will keep it O(1).
- **Hard vs Soft Boundaries:** Centralize world boundary clamping and structure collisions here.
- **Deterministic Ticks**: Move away from `setInterval` for behaviors and use the `TICK_INTERVAL` uniformly to avoid "speed jitters."

### 2. The Metabolism Engine (`metabolism/engine.ts`)
**Goal:** Life support.
- **Rate Constants:** Move all "Magic Numbers" (e.g., `2 * tempMod`) into a configuration object.
- **Asynchronous Safe Recovery:** Replace `setInterval` inside behavioral blocks (like drinking/eating) with a "Ticked Operation" pattern. 
  - *Risk Avoided:* Currently, if a bot starts drinking and the bridge is reset, the `setInterval` might keep running on a non-existent state.

### 3. The Behavior Tree / FSM (`agents/brain.ts`)
**Goal:** High-level decision making.
- **Explicit Transitions:** Introduce a `transitionState(bot, newState)` function.
- **Evaluation Priority:** 
  1. *Emergency*: (Air, Critical Water/Food)
  2. *Survival*: (Wood/Stone for Shelter, Sleeping)
  3. *Social*: (Helping, Greeting, Coupling)
  4. *Exploration*: (Wandering)
- **Memory Buffer:** Give bots a short-term memory (e.g., `lastVisitedResource`) to prevent "thrashing" between two distant spots.

---

## 🚀 Optimization Highlights

| Feature | Current Implementation | Refactor v2 Strategy |
| :--- | :--- | :--- |
| **State Management** | Hardcoded string checks | Finite State Machine (FSM) Classes |
| **Time Handling** | Multiple `setInterval` closures | Single-tick "Step" functions |
| **Logic Flow** | 900-line `if/else` stack | Strategy Pattern / Behavior Handlers |
| **Collision** | O(N²) nested loops | Spatial Partitioning (Grid/Hash) |

---

## 📂 Implementation Roadmap

### Phase 1: The "Metabolism" Extraction
Move needs decay into a separate module. This is the safest "first cut" as it has the fewest side effects on movement math.

### Phase 2: The "Solver" Extraction
Move the A* execution and collision math. This will leave `movement.ts` as a purely behavioral file (High-level Brain).

### Phase 3: The "Brain" Formalization
Convert the remaining behavioral logic into a typed structure where each state has its own `enter()`, `update()`, and `exit()` logic.

---

> [!IMPORTANT]
> This refactor will significantly improve "Bot Intelligence" by allowing us to chain complex actions (e.g., "Gather wood THEN build shelter") rather than relying on the random chance of the `idle` state picking the next correct task.

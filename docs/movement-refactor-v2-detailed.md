# Movement Refactor v2: Detailed Technical Spec

This document provides the blueprint for the modularization of the bridge simulation engine.

## 1. The Core Tick Loop (`simulation-engine.ts`)
The main loop will be reduced to a high-level orchestrator.

```typescript
export function simulateMovement() {
  const dt = calculatedDeltaTime(); // ms since last tick
  
  // 1. Metabolism (Life Support)
  for (const bot of bots.values()) {
    MetabolismEngine.tick(bot, dt);
  }

  // 2. Cognitive (Brain/AI)
  for (const bot of bots.values()) {
    BrainEngine.tick(bot, dt);
  }

  // 3. Physical (Movement/Collision)
  PhysicsSolver.tick(bots, dt);

  // 4. Sync
  broadcastBotPositions();
}
```

---

## 2. The "Ticked Operation" Pattern
**Problem**: Current ad-hoc `setInterval` closures for drinking/eating cause "zombie" processes and race conditions.
**Solution**: Use state-based progress tracking within the main loop.

```typescript
// Instead of setInterval()
if (bot.state === 'drinking') {
  bot.operationProgress += dt; // track in ms
  bot.needs.water += WATER_RECOVERY_RATE * dt;
  
  if (bot.operationProgress >= DRINKING_DURATION) {
    transitionState(bot, 'idle');
    broadcastNeedsPost(bot, 'finished-drinking');
  }
}
```

---

## 3. Finite State Machine (FSM)
We will move behaviors into classes/objects to keep logic isolated and testable.

### Interface: `BehaviorHandler`
```typescript
interface BehaviorHandler {
  onEnter?: (bot: BotState) => void;
  onUpdate: (bot: BotState, dt: number) => void;
  onExit?: (bot: BotState) => void;
}
```

### Example: `DrinkingBehavior`
```typescript
const DrinkingBehavior: BehaviorHandler = {
  onEnter: (bot) => {
    bot.operationProgress = 0;
    broadcastNeedsPost(bot, 'drinking');
  },
  onUpdate: (bot, dt) => {
    bot.operationProgress += dt;
    // ... logic ...
  }
};
```

---

## 4. Physics Solver & Spatial Partitioning
To scale beyond 20 bots, we will replace the nested `O(N²)` loops with a **Resolution Grid**.

- **Grid Size**: 1m x 1m cells.
- **Physics Tick**:
  1. Clear Grid.
  2. Insert bots into cells.
  3. Resolve collisions ONLY against bots in the same/neighboring cells.

---

## 5. Directory & File Plan

### `/scripts/bridge/physics/`
- `solver.ts`: The main movement/collision loop + Grid logic.
- `navigation.ts`: Pathfollowing and A* interface.
- `geometries.ts`: Structure collision boxes (Shelters, Sundial).

### `/scripts/bridge/agents/`
- `brain.ts`: The state machine and behavior lookup.
- `behavior-handlers.ts`: Logic for `Drinking`, `Gathering`, `Helping`, etc.
- `metabolism.ts`: Needs decay and recovery math.

---

## 📋 Migration Strategy (Safety First)
1. **Module 1**: Extract `MetabolismEngine` (Safe, no movement changes).
2. **Module 2**: Move `PhysicsSolver` logic (Movements stay identical, just cleaner code).
3. **Module 3**: Implement the `BrainEngine` and convert 1 behavior at a time (e.g., convert `Idle` first, then `Drinking`).

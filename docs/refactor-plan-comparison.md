# Refactor Plan Comparison: v1 vs v2

This document evaluates the two proposed strategies for refactoring the `movement.ts` simulation engine.

## 📊 Side-by-Side Comparison

| Feature         | Plan v1: Modular Hive                                                                      | Plan v2: Metabolism & Brain                                                                |
| :---            | :---                                                                                       | :---                                                                                       |
| **Focus**       | **Structural Organization**: Cleans up the "Monolith" by breaking it into domain folders. | **Architectural Integrity**: Fixes fundamental simulation bugs and prepares for scale. |
| **State Logic** | Move `if/else` blocks into a behavior lookup. |                                             Formalized **Finite State Machine (FSM)** with `enter/update/exit` hooks. |
| **Concurrency** | Keeps existing `setInterval` logic within new modules.                                    | **Single-Tick Orchestration**: Replaces nested intervals with a "Ticked Operation" pattern. |
| **Performance** | Basic modularity (O(N²) persists). | **Spatial Partitioning**: Introduces a Grid/Hash for O(1) collision resolution. |
| **Scalability** | Good for 5-10 bots. | Designed for 50+ bots and complex chained behaviors. |

---

## 🧐 Evaluation

### Plan v1: Modular Hive (The "Cleanup")
- **Pros**: Low risk, high immediate impact on readability, easy for other developers to jump into.
- **Cons**: Does not solve the "Zombie Interval" bug (where a reset bridge leaves old eating/drinking timers running). It simply hides the complexity in smaller files.
- **Best for**: A quick maintenance sprint to improve code hygiene.

### Plan v2: Metabolism & Brain (The "Evolution")
- **Pros**: Solves race conditions, improves bot "intelligence" by adding short-term memory, and ensures the simulation is strictly deterministic.
- **Cons**: Higher initial implementation complexity; requires redefining how bots "think" via a formal brain state.
- **Best for**: Long-term stability and creating a truly robust, smart autonomous hive.

---

## 🏆 Recommendation

**Go with Plan v2.**

While v1 makes the code prettier, **v2 makes it safer.** The current implementation of "Drinking" and "Eating" via ad-hoc `setInterval` closures is a significant technical debt—if the bridge resets while a bot is drinking, that timer stays in memory and can cause illegal state updates later. 

Plan v2's "Ticked Operation" pattern ensures everything stops naturally with the bridge, and the **Brain Module** will allow bots to perform much more complex sequences of actions in the future.

import { WorldConfig, NavNode } from '@/types/simulation';
import { WORLD_CONFIG } from '@/config/simulation';
import { isWalkable } from './world-physics';

// ─── A* Pathfinding ─────────────────────────────────────────────

/**
 * Find a path from start to goal using A* algorithm
 */
export function findPath(
    startX: number,
    startZ: number,
    goalX: number,
    goalZ: number,
    botRadius: number,
    worldConfig: WorldConfig
): Array<{ x: number; z: number }> {
    const cellSize = WORLD_CONFIG.NAV_GRID_CELL_SIZE;

    // Convert world coords to grid coords
    const toGrid = (val: number) => Math.round(val / cellSize);
    const toWorld = (val: number) => val * cellSize;

    const startGridX = toGrid(startX);
    const startGridZ = toGrid(startZ);
    const goalGridX = toGrid(goalX);
    const goalGridZ = toGrid(goalZ);

    // If goal is blocked, find nearest walkable cell
    let finalGoalX = goalGridX;
    let finalGoalZ = goalGridZ;

    if (!isWalkable(toWorld(goalGridX), toWorld(goalGridZ), botRadius, worldConfig)) {
        // Search outward in a spiral for walkable cell
        let found = false;
        for (let r = 1; r <= 10 && !found; r++) {
            for (let dx = -r; dx <= r && !found; dx++) {
                for (let dz = -r; dz <= r && !found; dz++) {
                    if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue; // Only check perimeter
                    const testX = toWorld(goalGridX + dx);
                    const testZ = toWorld(goalGridZ + dz);
                    if (isWalkable(testX, testZ, botRadius, worldConfig)) {
                        finalGoalX = goalGridX + dx;
                        finalGoalZ = goalGridZ + dz;
                        found = true;
                    }
                }
            }
        }
        if (!found) {
            // No walkable goal nearby, return direct path
            return [{ x: goalX, z: goalZ }];
        }
    }

    // Quick check: if direct path is clear, skip A*
    const directDist = Math.sqrt(Math.pow(goalX - startX, 2) + Math.pow(goalZ - startZ, 2));
    let directClear = true;
    for (let t = 0; t <= 1 && directClear; t += 0.1) {
        const testX = startX + (goalX - startX) * t;
        const testZ = startZ + (goalZ - startZ) * t;
        if (!isWalkable(testX, testZ, botRadius, worldConfig)) {
            directClear = false;
        }
    }
    if (directClear) {
        return [{ x: goalX, z: goalZ }];
    }

    // A* algorithm
    const openSet: NavNode[] = [];
    const closedSet = new Set<string>();
    const nodeKey = (gx: number, gz: number) => `${gx},${gz}`;

    const heuristic = (gx: number, gz: number) =>
        Math.abs(gx - finalGoalX) + Math.abs(gz - finalGoalZ); // Manhattan distance

    const startNode: NavNode = {
        x: startGridX,
        z: startGridZ,
        g: 0,
        h: heuristic(startGridX, startGridZ),
        f: heuristic(startGridX, startGridZ),
        parent: null
    };

    openSet.push(startNode);

    const directions = [
        { dx: 1, dz: 0, cost: 1 },
        { dx: -1, dz: 0, cost: 1 },
        { dx: 0, dz: 1, cost: 1 },
        { dx: 0, dz: -1, cost: 1 },
        { dx: 1, dz: 1, cost: 1.414 },
        { dx: -1, dz: 1, cost: 1.414 },
        { dx: 1, dz: -1, cost: 1.414 },
        { dx: -1, dz: -1, cost: 1.414 },
    ];

    let iterations = 0;
    const maxIterations = 2000; // Prevent infinite loops

    while (openSet.length > 0 && iterations < maxIterations) {
        iterations++;

        // Get node with lowest f score
        openSet.sort((a, b) => a.f - b.f);
        const current = openSet.shift()!;

        // Goal reached?
        if (current.x === finalGoalX && current.z === finalGoalZ) {
            // Reconstruct path
            const path: Array<{ x: number; z: number }> = [];
            let node: NavNode | null = current;
            while (node) {
                path.unshift({ x: toWorld(node.x), z: toWorld(node.z) });
                node = node.parent;
            }
            // Skip first node (current position) and simplify path
            return simplifyPath(path.slice(1), botRadius, worldConfig);
        }

        closedSet.add(nodeKey(current.x, current.z));

        // Explore neighbors
        for (const dir of directions) {
            const nx = current.x + dir.dx;
            const nz = current.z + dir.dz;
            const key = nodeKey(nx, nz);

            if (closedSet.has(key)) continue;

            const worldX = toWorld(nx);
            const worldZ = toWorld(nz);

            if (!isWalkable(worldX, worldZ, botRadius, worldConfig)) continue;

            const g = current.g + dir.cost;
            const h = heuristic(nx, nz);
            const f = g + h;

            // Check if this path to neighbor is better
            const existingIdx = openSet.findIndex(n => n.x === nx && n.z === nz);
            if (existingIdx !== -1) {
                if (g < openSet[existingIdx].g) {
                    openSet[existingIdx].g = g;
                    openSet[existingIdx].f = f;
                    openSet[existingIdx].parent = current;
                }
            } else {
                openSet.push({ x: nx, z: nz, g, h, f, parent: current });
            }
        }
    }

    // No path found - return direct path and hope for the best
    return [{ x: goalX, z: goalZ }];
}

/**
 * Simplify path by removing unnecessary waypoints (line-of-sight optimization)
 */
export function simplifyPath(
    path: Array<{ x: number; z: number }>,
    botRadius: number,
    worldConfig: WorldConfig
): Array<{ x: number; z: number }> {
    if (path.length <= 2) return path;

    const simplified: Array<{ x: number; z: number }> = [path[0]];
    let lastAdded = 0;

    for (let i = 2; i < path.length; i++) {
        // Check if we can skip to point i from lastAdded
        const from = path[lastAdded];
        const to = path[i];
        let canSkip = true;

        const dist = Math.sqrt(Math.pow(to.x - from.x, 2) + Math.pow(to.z - from.z, 2));
        const steps = Math.ceil(dist / (WORLD_CONFIG.NAV_GRID_CELL_SIZE / 2));

        for (let s = 1; s <= steps && canSkip; s++) {
            const t = s / steps;
            const testX = from.x + (to.x - from.x) * t;
            const testZ = from.z + (to.z - from.z) * t;
            if (!isWalkable(testX, testZ, botRadius, worldConfig)) {
                canSkip = false;
            }
        }

        if (!canSkip) {
            // Can't skip, add previous point
            simplified.push(path[i - 1]);
            lastAdded = i - 1;
        }
    }

    // Always add final destination
    simplified.push(path[path.length - 1]);
    return simplified;
}

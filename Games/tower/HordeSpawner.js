import { spawnSettings } from "../../Config/Config.js";
import { Enemy } from "../../Entities/Enemy.js";
import { isBaseStatUpgrade } from "../../Progression/Upgrades.js";
import { getEnemyType, selectSpawnPod } from "../../Combat/SpawnPods.js";
import { getEntityCatalog } from "../../Entities/EntityRegistry.js";
export class HordeSpawner {
    constructor() {
        this.reset();
    }
    reset() {
        this.spawnIntervalId = null;
    }
    beginHorde() {
        this.spawnIntervalId = null;
    }
    manageSpawning(_dt, state, upgrades) {
        if (!state.zombieEventTriggered) {
            state.zombieEventTriggered = true;
            this.spawnZombieEvent(state, upgrades);
        }
        if (this.spawnIntervalId) return;
        this.spawnIntervalId = state.scheduler.schedule(
            spawnSettings.spawnIntervalMs,
            () => {
                const aliveEnemies = state.enemies.filter((e) => !e.isDead && !e.excludeFromActiveCap).length;
                if (aliveEnemies >= spawnSettings.maxActiveEnemies) return;
                this.spawnPodGroup(state, upgrades);
            },
            true,
        );
    }
    spawnPodGroup(state, upgrades) {
        const baseUpgradeDefs = upgrades.filter(isBaseStatUpgrade);
        const pod = selectSpawnPod();
        const candidates = getSpawnCandidateNodes(state);
        const targetNode = candidates.length > 0 ? candidates[Math.floor(Math.random() * candidates.length)] : state.getStartMapNode();
        if (!targetNode) return 0;
        let totalCount = 0;
        for (const member of pod.members) totalCount += member.count;
        const spots = findFreeSpotsInNode(state, targetNode, totalCount);
        let slot = 0;
        for (const member of pod.members) {
            const enemyType = getEnemyType(member.type);
            if (!enemyType) continue;
            for (let i = 0; i < member.count; i++) {
                const spot = spots[slot] || spots[0];
                state.enemies.push(Enemy.spawn(spot.x, spot.y, enemyType, baseUpgradeDefs));
                slot++;
            }
        }
        return totalCount;
    }
    spawnZombieEvent(state, upgrades) {
        const targetNode = getZombieSpawnTargetNode(state);
        if (!targetNode) return;
        const hordeEvent = getEntityCatalog()?.events?.zombieHorde;
        if (!hordeEvent) return;
        const count = hordeEvent.count;
        const spots = findFreeSpotsInNode(state, targetNode, count);
        const enemyType = getEnemyType(hordeEvent.type);
        if (!enemyType) return;
        const baseUpgradeDefs = upgrades.filter(isBaseStatUpgrade);
        for (let i = 0; i < count; i++) {
            const spot = spots[i] || spots[0];
            state.enemies.push(Enemy.spawn(spot.x, spot.y, enemyType, baseUpgradeDefs));
        }
    }
}
function getZombieSpawnTargetNode(state) {
    const currentNodeId = 0;
    const mapNodes = state.mapNodes;
    const adjacencyList = new Map();
    for (const node of mapNodes) {
        if (!adjacencyList.has(node.id)) adjacencyList.set(node.id, new Set());
        for (const targetId of node.connections) {
            if (!adjacencyList.has(targetId)) adjacencyList.set(targetId, new Set());
            adjacencyList.get(node.id).add(targetId);
            adjacencyList.get(targetId).add(node.id);
        }
    }
    const queue = [{ id: currentNodeId, depth: 0 }];
    const visited = new Set([currentNodeId]);
    const candidates = [];
    while (queue.length > 0) {
        const { id, depth } = queue.shift();
        if (depth === 1) {
            const node = state.getMapNode(id);
            if (node) candidates.push(node);
        }
        if (depth < 1) {
            const neighbors = adjacencyList.get(id);
            if (neighbors)
                for (const neighborId of neighbors)
                    if (!visited.has(neighborId)) {
                        visited.add(neighborId);
                        queue.push({ id: neighborId, depth: depth + 1 });
                    }
        }
    }
    if (candidates.length > 0) return candidates[Math.floor(Math.random() * candidates.length)];
    return state.getMapNode(currentNodeId);
}
function getSpawnCandidateNodes(state) {
    const currentNodeId = 0;
    const mapNodes = state.mapNodes;
    const adjacencyList = new Map();
    for (const node of mapNodes) {
        if (!adjacencyList.has(node.id)) adjacencyList.set(node.id, new Set());
        for (const targetId of node.connections) {
            if (!adjacencyList.has(targetId)) adjacencyList.set(targetId, new Set());
            adjacencyList.get(node.id).add(targetId);
            adjacencyList.get(targetId).add(node.id);
        }
    }
    const queue = [{ id: currentNodeId, depth: 0 }];
    const visited = new Set([currentNodeId]);
    const candidates2to3 = [];
    const candidates1 = [];
    while (queue.length > 0) {
        const { id, depth } = queue.shift();
        if (depth >= 2 && depth <= 3) {
            const node = state.getMapNode(id);
            if (node) candidates2to3.push(node);
        } else if (depth === 1) {
            const node = state.getMapNode(id);
            if (node) candidates1.push(node);
        }
        if (depth < 3) {
            const neighbors = adjacencyList.get(id);
            if (neighbors)
                for (const neighborId of neighbors)
                    if (!visited.has(neighborId)) {
                        visited.add(neighborId);
                        queue.push({ id: neighborId, depth: depth + 1 });
                    }
        }
    }
    if (candidates2to3.length > 0) return candidates2to3;
    if (candidates1.length > 0) return candidates1;
    const currentNode = state.getMapNode(currentNodeId);
    return currentNode ? [currentNode] : [];
}
function findFreeSpotsInNode(state, targetNode, count) {
    const coords = state.getNodeWorldCoords(targetNode);
    const grid = state.obstacleGrid;
    const centerCell = grid.worldToGrid(coords.x, coords.y);
    const spots = [];
    const visited = new Set();
    let foundCount = 0;
    const maxCellRadius = 25;
    for (let r = 0; r <= maxCellRadius && foundCount < count; r++)
        for (let dc = -r; dc <= r && foundCount < count; dc++)
            for (let dr = -r; dr <= r && foundCount < count; dr++) {
                if (Math.abs(dc) !== r && Math.abs(dr) !== r) continue;
                const col = centerCell.col + dc;
                const row = centerCell.row + dr;
                const key = `${col},${row}`;
                if (visited.has(key)) continue;
                visited.add(key);
                if (!grid.isBlocked(col, row)) {
                    let tooClose = false;
                    for (const spot of spots) {
                        const dist = Math.hypot(spot.col - col, spot.row - row);
                        if (dist < 2.5) {
                            tooClose = true;
                            break;
                        }
                    }
                    if (!tooClose) {
                        const worldPos = grid.gridToWorld(col, row);
                        spots.push({ x: worldPos.x, y: worldPos.y, col, row });
                        foundCount++;
                    }
                }
            }
    if (foundCount < count)
        for (let r = 0; r <= maxCellRadius && foundCount < count; r++)
            for (let dc = -r; dc <= r && foundCount < count; dc++)
                for (let dr = -r; dr <= r && foundCount < count; dr++) {
                    if (Math.abs(dc) !== r && Math.abs(dr) !== r) continue;
                    const col = centerCell.col + dc;
                    const row = centerCell.row + dr;
                    const key = `${col},${row}`;
                    if (visited.has(key)) {
                        const idx = spots.findIndex((s) => s.col === col && s.row === row);
                        if (idx === -1 && !grid.isBlocked(col, row)) {
                            const worldPos = grid.gridToWorld(col, row);
                            spots.push({ x: worldPos.x, y: worldPos.y, col, row });
                            foundCount++;
                        }
                    }
                }
    while (spots.length < count) spots.push({ x: coords.x, y: coords.y, col: centerCell.col, row: centerCell.row });
    return spots;
}

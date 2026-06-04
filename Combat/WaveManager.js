import { spawnSettings, timingSettings, waveSettings } from "../Config/Config.js";
import { canRunWaveSpawning } from "../GameState/GamePhase.js";
import { Enemy } from "../Entities/Enemy.js";
import { requestUiUpdate, emitCombatWaveCleared } from "../Core/EventSystem.js";
import { isBaseStatUpgrade } from "../Progression/Upgrades.js";
import {
    getBossPod,
    getEnemyType,
    getPodSize,
    selectSpawnPod,
} from "./SpawnPods.js";

export class WaveManager {
    constructor() {
        this.reset();
    }

    reset() {
        this.wave = 0;
        this.sectorWave = 0;
        this.wavesCompleted = 0;
        this.enemiesToSpawn = waveSettings.firstWaveEnemyCount;
        this.enemiesSpawned = 0;
        this.spawnIntervalId = null;
        this.waveClearScheduled = false;
    }

    startCombat() {
        this.wave++;
        this.sectorWave = 1;
        this.enemiesToSpawn = this.calculateEnemiesToSpawn();
        this.enemiesSpawned = 0;
        this.waveClearScheduled = false;
    }

    advance() {
        this.sectorWave++;
        this.wave++;
        this.enemiesToSpawn = this.calculateEnemiesToSpawn();
        this.enemiesSpawned = 0;
    }

    completeWave(totalWavesInSector) {
        this.wavesCompleted++;
        if (this.sectorWave < totalWavesInSector) {
            this.advance();
            return false;
        }
        return true;
    }

    calculateEnemiesToSpawn() {
        return Infinity;
    }

    calculateSpawnPosition(state, side, pos) {
        const dist = state.spawnRadius;
        let x, y;

        if (side === 0) {
            x = state.player.x + pos;
            y = state.player.y - dist;
        } else if (side === 1) {
            x = state.player.x + dist;
            y = state.player.y + pos;
        } else if (side === 2) {
            x = state.player.x + pos;
            y = state.player.y + dist;
        } else {
            x = state.player.x - dist;
            y = state.player.y + pos;
        }

        if (state.flowFieldGrid) {
            const grid = state.flowFieldGrid;
            const gridPos = grid.worldToGrid(x, y);
            let targetCol = Math.max(0, Math.min(grid.cols - 1, gridPos.col));
            let targetRow = Math.max(0, Math.min(grid.rows - 1, gridPos.row));

            if (grid.grid[targetRow * grid.cols + targetCol] !== 0) {
                let found = false;
                for (let radius = 1; radius <= 5; radius++) {
                    for (let r = -radius; r <= radius; r++) {
                        for (let c = -radius; c <= radius; c++) {
                            const nr = targetRow + r;
                            const nc = targetCol + c;
                            if (nr >= 0 && nr < grid.rows && nc >= 0 && nc < grid.cols) {
                                if (grid.grid[nr * grid.cols + nc] === 0) {
                                    targetRow = nr;
                                    targetCol = nc;
                                    found = true;
                                    break;
                                }
                            }
                        }
                        if (found) break;
                    }
                    if (found) break;
                }
            }

            x = targetCol * grid.cellSize + grid.centerX - grid.offsetX + grid.cellSize / 2;
            y = targetRow * grid.cellSize + grid.centerY - grid.offsetY + grid.cellSize / 2;
        }

        return { x, y };
    }

    spawnPod(state, pod, baseUpgradeDefs) {
        const candidates = getSpawnCandidateNodes(state);
        let targetNode = null;
        if (candidates.length > 0) {
            targetNode = candidates[Math.floor(Math.random() * candidates.length)];
        } else {
            targetNode = state.getCurrentMapNode();
        }

        if (!targetNode) return 0;

        let totalCount = 0;
        for (const member of pod.members) {
            totalCount += member.count;
        }

        const spots = findFreeSpotsInNode(state, targetNode, totalCount);

        let slot = 0;
        let spawned = 0;

        for (const member of pod.members) {
            const enemyType = getEnemyType(member.type);
            if (!enemyType) continue;

            for (let i = 0; i < member.count; i++) {
                const spot = spots[slot] || spots[0];
                state.enemies.push(Enemy.spawn(spot.x, spot.y, enemyType, this.wave, baseUpgradeDefs));
                slot++;
                spawned++;
            }
        }

        return spawned;
    }

    spawnEnemy(state, upgrades) {
        const baseUpgradeDefs = upgrades.filter(isBaseStatUpgrade);
        const remaining = this.enemiesToSpawn - this.enemiesSpawned;

        const pod = this.wave % waveSettings.bossWaveInterval === 0
            ? getBossPod()
            : selectSpawnPod(state, remaining);

        return this.spawnPod(state, pod, baseUpgradeDefs);
    }

    manageSpawning(dt, state, upgrades, viewport) {
        if (!canRunWaveSpawning(state)) return;

        if (!state.zombieEventTriggered) {
            state.zombieEventTriggered = true;
            this.spawnZombieEvent(state, upgrades);
        }

        if (this.enemiesSpawned < this.enemiesToSpawn && !this.spawnIntervalId) {
            const currentSpawnDelay = Math.max(spawnSettings.minSpawnDelay, spawnSettings.baseSpawnDelay - this.wave * spawnSettings.delayReductionPerWave);
            this.spawnIntervalId = state.scheduler.schedule(currentSpawnDelay, () => {
                const aliveEnemies = state.enemies.filter(e => !e.isDead && e.enemyType.type !== "zombie").length;
                if (aliveEnemies >= spawnSettings.maxActiveEnemies) {
                    return;
                }
                if (this.enemiesSpawned < this.enemiesToSpawn) {
                    const count = this.spawnEnemy(state, upgrades);
                    this.enemiesSpawned += count;
                }
                if (this.enemiesSpawned >= this.enemiesToSpawn) {
                    state.scheduler.cancel(this.spawnIntervalId);
                    this.spawnIntervalId = null;
                }
            }, true);
        }
        const aliveEnemies = state.enemies.filter(e => !e.isDead).length;
        if (this.enemiesSpawned >= this.enemiesToSpawn && aliveEnemies === 0) {
            if (this.waveClearScheduled) return;
            this.waveClearScheduled = true;
            requestUiUpdate();
            state.isTransitioning = true;
            state.scheduler.schedule(timingSettings.sectorCompletedDelay, () => {
                this.waveClearScheduled = false;
                state.isTransitioning = false;
                emitCombatWaveCleared();
            });
        }
    }

    spawnZombieEvent(state, upgrades) {
        const targetNode = getZombieSpawnTargetNode(state);
        if (!targetNode) return;
        
        const count = 25;
        const spots = findFreeSpotsInNode(state, targetNode, count);
        const enemyType = getEnemyType("zombie");
        if (!enemyType) return;
        
        const baseUpgradeDefs = upgrades.filter(isBaseStatUpgrade);
        for (let i = 0; i < count; i++) {
            const spot = spots[i] || spots[0];
            state.enemies.push(Enemy.spawn(spot.x, spot.y, enemyType, this.wave, baseUpgradeDefs));
        }
    }
}

function getZombieSpawnTargetNode(state) {
    const currentNodeId = state.currentNodeId;
    const mapNodes = state.mapNodes;
    
    const adjacencyList = new Map();
    for (const node of mapNodes) {
        if (!adjacencyList.has(node.id)) {
            adjacencyList.set(node.id, new Set());
        }
        for (const targetId of node.connections) {
            if (!adjacencyList.has(targetId)) {
                adjacencyList.set(targetId, new Set());
            }
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
            if (neighbors) {
                for (const neighborId of neighbors) {
                    if (!visited.has(neighborId)) {
                        visited.add(neighborId);
                        queue.push({ id: neighborId, depth: depth + 1 });
                    }
                }
            }
        }
    }
    
    if (candidates.length > 0) {
        return candidates[Math.floor(Math.random() * candidates.length)];
    }
    return state.getMapNode(currentNodeId);
}

function getSpawnCandidateNodes(state) {
    const currentNodeId = state.currentNodeId;
    const mapNodes = state.mapNodes;

    // 1. Build adjacency list of undirected graph
    const adjacencyList = new Map();
    for (const node of mapNodes) {
        if (!adjacencyList.has(node.id)) {
            adjacencyList.set(node.id, new Set());
        }
        for (const targetId of node.connections) {
            if (!adjacencyList.has(targetId)) {
                adjacencyList.set(targetId, new Set());
            }
            adjacencyList.get(node.id).add(targetId);
            adjacencyList.get(targetId).add(node.id);
        }
    }

    // 2. Perform BFS to find nodes at depth 2 and 3
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
            if (neighbors) {
                for (const neighborId of neighbors) {
                    if (!visited.has(neighborId)) {
                        visited.add(neighborId);
                        queue.push({ id: neighborId, depth: depth + 1 });
                    }
                }
            }
        }
    }

    // 3. Return the best available set of candidates
    if (candidates2to3.length > 0) {
        return candidates2to3;
    }
    if (candidates1.length > 0) {
        return candidates1;
    }
    // Final fallback: the current node
    const currentNode = state.getMapNode(currentNodeId);
    return currentNode ? [currentNode] : [];
}

function findFreeSpotsInNode(state, targetNode, count) {
    const coords = state.getNodeCombatCoords(targetNode);
    const grid = state.obstacleGrid;
    const centerCell = grid.worldToGrid(coords.x, coords.y);
    const spots = [];
    const visited = new Set();

    let foundCount = 0;
    const maxCellRadius = 25; // Search up to 400 units from node center

    // We search concentric square rings outward
    for (let r = 0; r <= maxCellRadius && foundCount < count; r++) {
        for (let dc = -r; dc <= r && foundCount < count; dc++) {
            for (let dr = -r; dr <= r && foundCount < count; dr++) {
                if (Math.abs(dc) !== r && Math.abs(dr) !== r) continue;

                const col = centerCell.col + dc;
                const row = centerCell.row + dr;
                const key = `${col},${row}`;

                if (visited.has(key)) continue;
                visited.add(key);

                if (!grid.isBlocked(col, row)) {
                    // Spacing check: ensure this cell is not too close to existing spots
                    let tooClose = false;
                    for (const spot of spots) {
                        const dist = Math.hypot(spot.col - col, spot.row - row);
                        if (dist < 2.5) { // At least 40 units apart
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
        }
    }

    // Fallback: if we couldn't find enough spaced-out cells, relax the spacing constraint
    if (foundCount < count) {
        for (let r = 0; r <= maxCellRadius && foundCount < count; r++) {
            for (let dc = -r; dc <= r && foundCount < count; dc++) {
                for (let dr = -r; dr <= r && foundCount < count; dr++) {
                    if (Math.abs(dc) !== r && Math.abs(dr) !== r) continue;

                    const col = centerCell.col + dc;
                    const row = centerCell.row + dr;
                    const key = `${col},${row}`;

                    if (visited.has(key)) {
                        const idx = spots.findIndex(s => s.col === col && s.row === row);
                        if (idx === -1 && !grid.isBlocked(col, row)) {
                            const worldPos = grid.gridToWorld(col, row);
                            spots.push({ x: worldPos.x, y: worldPos.y, col, row });
                            foundCount++;
                        }
                    }
                }
            }
        }
    }

    // Ultimate fallback: repeat the coords
    while (spots.length < count) {
        spots.push({ x: coords.x, y: coords.y, col: centerCell.col, row: centerCell.row });
    }

    return spots;
}

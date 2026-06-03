import { waveSettings } from "../Config/Config.js";
import { Enemy } from "../Entities/Enemy.js";
import { getStartNodeLayout } from "../Generator/StartNodeBuilding.js";
import { isBaseStatUpgrade } from "../Progression/Upgrades.js";
import { getEnemyType, getPodSize, selectMapSpawnPod } from "./SpawnPods.js";

function isGridCellBlocked(grid, cols, rows, col, row) {
    if (col < 0 || col >= cols || row < 0 || row >= rows) return true;
    return grid[row * cols + col] === 1;
}

function isOneCellWideCorridor(grid, cols, rows, col, row) {
    const blockedN = isGridCellBlocked(grid, cols, rows, col, row - 1);
    const blockedS = isGridCellBlocked(grid, cols, rows, col, row + 1);
    const blockedW = isGridCellBlocked(grid, cols, rows, col - 1, row);
    const blockedE = isGridCellBlocked(grid, cols, rows, col + 1, row);
    return (blockedN && blockedS) || (blockedW && blockedE);
}

function collectWalkableSpawnCells(state, layout) {
    const grid = state.obstacleGrid;
    const cells = [];

    for (let row = 0; row < grid.rows; row++) {
        for (let col = 0; col < grid.cols; col++) {
            const idx = row * grid.cols + col;
            if (grid.grid[idx] !== 0) continue;
            if (isOneCellWideCorridor(grid.grid, grid.cols, grid.rows, col, row)) continue;

            const { x, y } = grid.gridToWorld(col, row);
            if (layout && Math.hypot(x - layout.spawnX, y - layout.spawnY) < layout.spawnClearRadius) {
                continue;
            }
            cells.push({ x, y });
        }
    }

    return cells;
}

function shuffleInPlace(items) {
    for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
    }
}

function snapToWalkable(state, x, y) {
    const grid = state.flowFieldGrid;
    if (!grid) return { x, y };

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

    return {
        x: targetCol * grid.cellSize + grid.centerX - grid.offsetX + grid.cellSize / 2,
        y: targetRow * grid.cellSize + grid.centerY - grid.offsetY + grid.cellSize / 2,
    };
}

function spawnPodAtMapCell(state, pod, baseUpgradeDefs, wave, centerX, centerY, passive) {
    const spacing = waveSettings.podSpacing;
    const podSize = getPodSize(pod);
    const angle = Math.random() * Math.PI * 2;
    const halfSpan = ((podSize - 1) * spacing) / 2;

    let slot = 0;
    let spawned = 0;

    for (const member of pod.members) {
        const enemyType = getEnemyType(member.type);
        if (!enemyType) continue;

        for (let i = 0; i < member.count; i++) {
            const along = slot * spacing - halfSpan;
            const rawX = centerX + Math.cos(angle) * along;
            const rawY = centerY + Math.sin(angle) * along;
            const { x, y } = snapToWalkable(state, rawX, rawY);
            const enemy = Enemy.spawn(x, y, enemyType, wave, baseUpgradeDefs);
            if (passive) enemy.isPassive = true;
            state.enemies.push(enemy);
            slot++;
            spawned++;
        }
    }

    return spawned;
}

export function shouldSpawnStartNodeMapPopulation(state) {
    const node = state.getCurrentMapNode();
    return node?.id === 0 && !state.startNodeMapPopulationSpawned;
}

export function spawnStartNodeMapPopulation(state) {
    if (!shouldSpawnStartNodeMapPopulation(state)) return 0;

    const node = state.getCurrentMapNode();
    const coords = state.getNodeCombatCoords(node);
    const layout = getStartNodeLayout(coords.x, coords.y, state.obstacleGrid.cellSize);
    const cells = collectWalkableSpawnCells(state, layout);

    if (cells.length === 0) return 0;

    shuffleInPlace(cells);

    const target = waveSettings.startNodeInitialEnemyCount ?? 200;
    const baseUpgradeDefs = (state.upgradeDefs ?? []).filter(isBaseStatUpgrade);
    const wave = Math.max(1, state.waveManager?.wave ?? 1);
    const passive = !state.startNodeIntroCompleted;
    let spawned = 0;
    let cellIndex = 0;
    let safety = 0;

    while (spawned < target && safety < target * 4) {
        safety++;
        const remaining = target - spawned;
        const pod = selectMapSpawnPod(remaining);
        const cell = cells[cellIndex % cells.length];
        cellIndex++;

        spawned += spawnPodAtMapCell(
            state,
            pod,
            baseUpgradeDefs,
            wave,
            cell.x,
            cell.y,
            passive,
        );
    }

    state.startNodeMapPopulationSpawned = true;
    state.startNodeUsesMapPopulation = true;

    if (state.waveManager) {
        const total = state.enemies.length;
        state.waveManager.enemiesSpawned = total;
        state.waveManager.enemiesToSpawn = total;
        if (state.waveManager.spawnIntervalId) {
            state.scheduler.cancel(state.waveManager.spawnIntervalId);
            state.waveManager.spawnIntervalId = null;
        }
    }

    return spawned;
}

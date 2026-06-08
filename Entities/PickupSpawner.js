import { Pickup } from "./Pickup.js";
import { getWorldGen } from "../Core/GamePorts.js";
import { getWorldPropDefinitions } from "../Libraries/Props/PropCatalog.js";
import { placeAtWallClearance } from "../Libraries/Pathfinding/PathClearance.js";
import { distanceToSegment } from "../Libraries/Spatial/geometry/WallGeometry.js";
export function spawnPickup(state, playerX, playerY, minRadius, maxRadius, type) {
    const grid = state.obstacleGrid;
    let spawned = false;
    let attempts = 0;
    while (!spawned && attempts < 100) {
        attempts++;
        const angle = Math.random() * Math.PI * 2;
        const dist = minRadius + Math.random() * (maxRadius - minRadius);
        const testX = playerX + Math.cos(angle) * dist;
        const testY = playerY + Math.sin(angle) * dist;
        if (trySpawnPickupAt(state, testX, testY, type)) spawned = true;
    }
}
function trySpawnPickupAt(state, x, y, type) {
    const grid = state.obstacleGrid;
    const gridPos = grid.worldToGrid(x, y);
    if (gridPos.col < 0 || gridPos.col >= grid.cols || gridPos.row < 0 || gridPos.row >= grid.rows) return false;
    const idx = gridPos.row * grid.cols + gridPos.col;
    if (grid.grid[idx] === 1) return false;
    if (isOneCellWideCorridor(grid.grid, grid.cols, grid.rows, gridPos.col, gridPos.row)) return false;
    const { x: centerX, y: centerY } = grid.gridToWorld(gridPos.col, gridPos.row);
    state.pickups.push(new Pickup(centerX, centerY, type));
    return true;
}
function shuffleInPlace(items) {
    for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
    }
}
function isGridCellBlocked(grid, cols, rows, col, row) {
    if (col < 0 || col >= cols || row < 0 || row >= rows) return true;
    return grid[row * cols + col] === 1;
}
/** True when the cell sits in a corridor only one tile wide (horizontal or vertical). */
function isOneCellWideCorridor(grid, cols, rows, col, row) {
    const blockedN = isGridCellBlocked(grid, cols, rows, col, row - 1);
    const blockedS = isGridCellBlocked(grid, cols, rows, col, row + 1);
    const blockedW = isGridCellBlocked(grid, cols, rows, col - 1, row);
    const blockedE = isGridCellBlocked(grid, cols, rows, col + 1, row);
    return (blockedN && blockedS) || (blockedW && blockedE);
}
function touchesWallCell(grid, cols, rows, col, row) {
    for (const [dc, dr] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
    ]) {
        const nc = col + dc;
        const nr = row + dr;
        if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
        if (grid[nr * cols + nc] === 1) return true;
    }
    return false;
}
function isValidWallPropSpot(obstacleGrid, x, y, radius, layout) {
    if (Math.hypot(x - layout.spawnX, y - layout.spawnY) < layout.spawnClearRadius) return false;
    if (obstacleGrid.isBlockedWorld(x, y)) return false;
    const walls = obstacleGrid.getNearbySegments({ x, y, radius: radius + 48 });
    for (const wall of walls) {
        if (wall.isDead) continue;
        if (distanceToSegment(wall, x, y) < radius - 0.5) return false;
    }
    return true;
}
function collectWallAdjacentCells(state, layout, propRadius) {
    const grid = state.obstacleGrid;
    const minGrid = grid.worldToGrid(layout.minX, layout.minY);
    const maxGrid = grid.worldToGrid(layout.maxX, layout.maxY);
    const startCol = Math.max(0, minGrid.col);
    const endCol = Math.min(grid.cols - 1, maxGrid.col);
    const startRow = Math.max(0, minGrid.row);
    const endRow = Math.min(grid.rows - 1, maxGrid.row);
    const cells = [];
    const seen = new Set();
    for (let row = startRow; row <= endRow; row++)
        for (let col = startCol; col <= endCol; col++) {
            const idx = row * grid.cols + col;
            if (grid.grid[idx] !== 0) continue;
            if (isOneCellWideCorridor(grid.grid, grid.cols, grid.rows, col, row)) continue;
            if (!touchesWallCell(grid.grid, grid.cols, grid.rows, col, row)) continue;
            const seed = grid.gridToWorld(col, row);
            const spot = placeAtWallClearance(grid, seed.x, seed.y, propRadius);
            if (!isValidWallPropSpot(grid, spot.x, spot.y, propRadius, layout)) continue;
            const resolvedGrid = grid.worldToGrid(spot.x, spot.y);
            if (isOneCellWideCorridor(grid.grid, grid.cols, grid.rows, resolvedGrid.col, resolvedGrid.row)) continue;
            const key = `${resolvedGrid.col},${resolvedGrid.row}`;
            if (seen.has(key)) continue;
            seen.add(key);
            cells.push({ col: resolvedGrid.col, row: resolvedGrid.row, x: spot.x, y: spot.y, facing: spot.facing });
        }
    return cells;
}
export function spawnStartGamePickups(state, playerX, playerY, layout = null) {
    const resolvedLayout = layout ?? getWorldGen().getStartLayout(playerX, playerY, state.obstacleGrid.cellSize);
    const propRadius = getWorldPropDefinitions().crate.radius;
    const wallCells = collectWallAdjacentCells(state, resolvedLayout, propRadius);
    shuffleInPlace(wallCells);
    const crateCount = Math.min(50 + Math.floor(Math.random() * 26), wallCells.length);
    for (let i = 0; i < crateCount; i++) {
        const cell = wallCells[i];
        state.pickups.push(new Pickup(cell.x, cell.y, "crate", cell.facing));
    }
    const barrelCount = 4 + Math.floor(Math.random() * 5);
    const barrelsToPlace = Math.min(barrelCount, wallCells.length - crateCount);
    for (let i = 0; i < barrelsToPlace; i++) {
        const cell = wallCells[crateCount + i];
        state.pickups.push(new Pickup(cell.x, cell.y, "barrel"));
    }
}
export function spawnInitialPickups(state, playerX, playerY) {
    for (const [type, def] of Object.entries(getWorldPropDefinitions())) {
        const spawn = def.spawn;
        if (!spawn) continue;
        const count = spawn.minCount + Math.floor(Math.random() * spawn.randomRange);
        for (let i = 0; i < count; i++) spawnPickup(state, playerX, playerY, spawn.minRadius, spawn.maxRadius, type);
    }
}

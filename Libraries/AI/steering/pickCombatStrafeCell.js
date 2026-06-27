import { hasLineOfSight } from "../../Spatial/query/lineOfSight.js";
function sameCell(a, b) {
    return a && b && a.col === b.col && a.row === b.row;
}
function buildStrafeDirections(toEnemyCol, toEnemyRow, strafeTiles) {
    const mag = Math.hypot(toEnemyCol, toEnemyRow);
    if (mag < 1e-6)
        return [
            { dCol: strafeTiles, dRow: 0, lateral: 1 },
            { dCol: -strafeTiles, dRow: 0, lateral: 1 },
            { dCol: 0, dRow: strafeTiles, lateral: 1 },
            { dCol: 0, dRow: -strafeTiles, lateral: 1 },
        ];
    const fwdCol = toEnemyCol / mag;
    const fwdRow = toEnemyRow / mag;
    const leftCol = -fwdRow;
    const leftRow = fwdCol;
    return [
        { dCol: Math.round(leftCol * strafeTiles), dRow: Math.round(leftRow * strafeTiles), lateral: 1 },
        { dCol: Math.round(-leftCol * strafeTiles), dRow: Math.round(-leftRow * strafeTiles), lateral: 1 },
        { dCol: Math.round(-fwdCol * 2), dRow: Math.round(-fwdRow * 2), lateral: 0.25 },
        { dCol: Math.round(fwdCol * 2), dRow: Math.round(fwdRow * 2), lateral: 0.15 },
    ];
}
function lateralScoreForDelta(dCol, dRow, toEnemyCol, toEnemyRow) {
    const mag = Math.hypot(toEnemyCol, toEnemyRow);
    if (mag < 1e-6) return Math.abs(dCol) + Math.abs(dRow) > 0 ? 0.5 : 0;
    const leftCol = -toEnemyRow / mag;
    const leftRow = toEnemyCol / mag;
    return Math.abs(dCol * leftCol + dRow * leftRow);
}
function scoreStrafeCell(cell, selfCol, selfRow, seeker, enemy, grid, config, toEnemyCol, toEnemyRow, avoidCell, rng) {
    if (sameCell(cell, avoidCell)) return null;
    if (cell.col === selfCol && cell.row === selfRow) return null;
    const wx = grid.gridCenterX(cell.col);
    const wy = grid.gridCenterY(cell.row);
    const enemyDist = Math.hypot(enemy.x - wx, enemy.y - wy);
    if (enemyDist <= config.fleeRange || enemyDist > config.maxRange) return null;
    const seekerRadius = seeker.radius ?? 0;
    if (!hasLineOfSight(wx, wy, enemy.x, enemy.y, grid, seekerRadius)) return null;
    const cellSize = grid.cellSize;
    const idealDistWorld = config.fleeRange + (config.maxRange - config.fleeRange) * (config.idealRangeFraction ?? 0.65);
    const idealDistCells = idealDistWorld / cellSize;
    const dCol = cell.col - selfCol;
    const dRow = cell.row - selfRow;
    let score = lateralScoreForDelta(dCol, dRow, toEnemyCol, toEnemyRow) * 100;
    const rangeDeltaCells = Math.abs(enemyDist / cellSize - idealDistCells);
    score -= rangeDeltaCells * 20;
    if (rangeDeltaCells <= (config.rangeBandCells ?? 2)) score += 30;
    score -= (Math.abs(dCol) + Math.abs(dRow)) * 0.5;
    const cross = toEnemyCol * dRow - toEnemyRow * dCol;
    if (cross > 0) score += config.orbitBias ?? 0;
    score += rng() * 0.01;
    return score;
}
export function pickCombatStrafeCell(seeker, enemy, grid, navWalkable, config, avoidCell = null, rng = Math.random) {
    const strafeTiles = config.strafeTiles ?? 3;
    const selfCol = grid.worldCol(seeker.x);
    const selfRow = grid.worldRow(seeker.y);
    const toEnemyCol = grid.worldCol(enemy.x) - selfCol;
    const toEnemyRow = grid.worldRow(enemy.y) - selfRow;
    const searchRadiusCells = Math.max(strafeTiles, Math.ceil(config.maxRange / grid.cellSize));
    let best = null;
    let bestScore = -Infinity;
    const directed = buildStrafeDirections(toEnemyCol, toEnemyRow, strafeTiles);
    for (let i = 0; i < directed.length; i++) {
        const dir = directed[i];
        const cell = { col: selfCol + dir.dCol, row: selfRow + dir.dRow };
        if (!navWalkable.has(cell.col, cell.row)) continue;
        const score = scoreStrafeCell(cell, selfCol, selfRow, seeker, enemy, grid, config, toEnemyCol, toEnemyRow, avoidCell, rng);
        if (score != null && score > bestScore) {
            bestScore = score;
            best = cell;
        }
    }
    const pool = navWalkable.cells();
    for (let i = 0; i < pool.length; i++) {
        const cell = pool[i];
        if (Math.abs(cell.col - selfCol) > searchRadiusCells || Math.abs(cell.row - selfRow) > searchRadiusCells) continue;
        const score = scoreStrafeCell(cell, selfCol, selfRow, seeker, enemy, grid, config, toEnemyCol, toEnemyRow, avoidCell, rng);
        if (score != null && score > bestScore) {
            bestScore = score;
            best = cell;
        }
    }
    return best;
}

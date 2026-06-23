function normalizedCellDelta(dCol, dRow, fallbackCol = 1) {
    if (dCol === 0 && dRow === 0) dCol = fallbackCol;
    const mag = Math.hypot(dCol, dRow);
    if (mag < 1e-6) return { dCol: fallbackCol, dRow: 0 };
    return { dCol: dCol / mag, dRow: dRow / mag };
}
function fleeDirectionCells(selfCell, threatCell) {
    return normalizedCellDelta(selfCell.col - threatCell.col, selfCell.row - threatCell.row);
}
function packDirectionCells(selfCell, packAnchor, grid) {
    const packCol = grid.worldCol(packAnchor.x);
    const packRow = grid.worldRow(packAnchor.y);
    return normalizedCellDelta(packCol - selfCell.col, packRow - selfCell.row, 0);
}
function blendDirections(fleeDir, packDir, blend) {
    const t = Math.max(0, Math.min(1, blend));
    const dCol = fleeDir.dCol * (1 - t) + packDir.dCol * t;
    const dRow = fleeDir.dRow * (1 - t) + packDir.dRow * t;
    const mag = Math.hypot(dCol, dRow);
    if (mag < 1e-6) return fleeDir;
    return { dCol: dCol / mag, dRow: dRow / mag };
}
function cellFromFleeDirection(selfCell, dir, fleeTiles) {
    return { col: selfCell.col + Math.round(dir.dCol * fleeTiles), row: selfCell.row + Math.round(dir.dRow * fleeTiles) };
}
function effectivePackBlend(packOptions, selfCell, grid) {
    if (!packOptions?.packAnchor || !(packOptions.packBlend > 0)) return 0;
    const maxDist = packOptions.maxPackDistCells;
    if (!Number.isFinite(maxDist) || maxDist <= 0) return packOptions.packBlend;
    const packCol = grid.worldCol(packOptions.packAnchor.x);
    const packRow = grid.worldRow(packOptions.packAnchor.y);
    const dist = Math.hypot(packCol - selfCell.col, packRow - selfCell.row);
    if (dist >= maxDist) return 0;
    return packOptions.packBlend * (1 - dist / maxDist);
}
/**
 * Pick a walkable grid cell fleeTiles away from the threat, optionally blended toward a pack anchor.
 * @param {object | null} [packOptions]
 * @param {{ x: number, y: number }} [packOptions.packAnchor]
 * @param {number} [packOptions.packBlend] 0 = pure flee, 1 = full pack bearing
 * @param {number} [packOptions.maxPackDistCells] zeroes blend when allies are farther than this
 */
export function pickFleeCell(seeker, threat, grid, navWalkable, fleeTiles, avoidCell = null, packOptions = null) {
    const sameCell = (a, b) => a && b && a.col === b.col && a.row === b.row;
    const selfCell = { col: grid.worldCol(seeker.x), row: grid.worldRow(seeker.y) };
    const threatCell = { col: grid.worldCol(threat.x), row: grid.worldRow(threat.y) };
    let dir = fleeDirectionCells(selfCell, threatCell);
    const blend = effectivePackBlend(packOptions, selfCell, grid);
    if (blend > 0) {
        const packDir = packDirectionCells(selfCell, packOptions.packAnchor, grid);
        if (packDir.dCol !== 0 || packDir.dRow !== 0) dir = blendDirections(dir, packDir, blend);
    }
    const ideal = cellFromFleeDirection(selfCell, dir, fleeTiles);
    if (navWalkable.has(ideal.col, ideal.row) && !sameCell(ideal, avoidCell)) return ideal;
    if (blend > 0) {
        const pure = cellFromFleeDirection(selfCell, fleeDirectionCells(selfCell, threatCell), fleeTiles);
        if (navWalkable.has(pure.col, pure.row) && !sameCell(pure, avoidCell)) return pure;
    }
    return null;
}

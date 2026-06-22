export function pickFleeCell(seeker, threat, grid, navWalkable, fleeTiles, avoidCell = null) {
    const sameCell = (a, b) => a && b && a.col === b.col && a.row === b.row;
    const selfCell = grid.worldToGrid(seeker.x, seeker.y);
    const threatCell = grid.worldToGrid(threat.x, threat.y);
    let dCol = selfCell.col - threatCell.col;
    let dRow = selfCell.row - threatCell.row;
    if (dCol === 0 && dRow === 0) dCol = 1;
    const scale = fleeTiles / Math.max(Math.abs(dCol), Math.abs(dRow), 1);
    const awayCol = selfCell.col + Math.round(dCol * scale);
    const awayRow = selfCell.row + Math.round(dRow * scale);
    const ideal = { col: awayCol, row: awayRow };
    if (navWalkable.has(awayCol, awayRow) && !sameCell(ideal, avoidCell)) return ideal;
    return null;
}

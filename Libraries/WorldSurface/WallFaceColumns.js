/** World-aligned slices along a wall base edge (stable when the camera moves). */
export function wallFaceColumns(p1, p2, cellSize) {
    const edgeLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    if (edgeLen < 0.001) return [];
    const edgeDirX = (p2.x - p1.x) / edgeLen;
    const edgeDirY = (p2.y - p1.y) / edgeLen;
    const uStart = p1.x * edgeDirX + p1.y * edgeDirY;
    const uEnd = uStart + edgeLen;
    const firstTile = Math.floor(uStart / cellSize);
    const lastTile = Math.ceil(uEnd / cellSize);
    const columns = [];
    for (let tile = firstTile; tile < lastTile; tile++) {
        const u0World = tile * cellSize;
        const u1World = (tile + 1) * cellSize;
        let u0 = (u0World - uStart) / edgeLen;
        let u1 = (u1World - uStart) / edgeLen;
        u0 = Math.max(0, Math.min(1, u0));
        u1 = Math.max(0, Math.min(1, u1));
        if (u1 - u0 < 1e-6) continue;
        const midU = (u0 + u1) * 0.5;
        columns.push({ u0, u1, worldX: p1.x + (p2.x - p1.x) * midU, worldY: p1.y + (p2.y - p1.y) * midU });
    }
    return columns;
}

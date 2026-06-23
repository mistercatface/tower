import { collectRailWallBoxesInAabb } from "../../World/wallGridBake.js";

const sRailShadowBoxes = [];

function pushRailWallBoxCapShadowEdges(box, out) {
    const wallTopZ = box.wallCapHeight;
    out.push({ x1: box.outerP1x, y1: box.outerP1y, x2: box.outerP2x, y2: box.outerP2y, nx: -box.inwardX, ny: -box.inwardY, wallTopZ });
    out.push({ x1: box.innerP1x, y1: box.innerP1y, x2: box.innerP2x, y2: box.innerP2y, nx: box.inwardX, ny: box.inwardY, wallTopZ });
    const dx = box.innerP2x - box.innerP1x;
    const dy = box.innerP2y - box.innerP1y;
    const len = Math.hypot(dx, dy);
    if (len <= 0) return;
    const tx = dx / len;
    const ty = dy / len;
    out.push({ x1: box.outerP1x, y1: box.outerP1y, x2: box.innerP1x, y2: box.innerP1y, nx: -tx, ny: -ty, wallTopZ });
    out.push({ x1: box.innerP2x, y1: box.innerP2y, x2: box.outerP2x, y2: box.outerP2y, nx: tx, ny: ty, wallTopZ });
}

export function collectRailWallShadowEdgesInAabb(grid, minX, minY, maxX, maxY, out) {
    collectRailWallBoxesInAabb(grid, { minX, minY, maxX, maxY }, sRailShadowBoxes);
    for (let i = 0; i < sRailShadowBoxes.length; i++) pushRailWallBoxCapShadowEdges(sRailShadowBoxes[i], out);
}

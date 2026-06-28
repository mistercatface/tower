import { collectRailWallBoxesInAabb } from "../../World/wallGridBake.js";
const sRailShadowBoxes = [];
function pushRailWallBoxCapShadowEdges(box, out) {
    const wallTopZ = box.wallCapHeight;
    out.add(box.outerP1x, box.outerP1y, box.outerP2x, box.outerP2y, -box.inwardX, -box.inwardY, wallTopZ);
    out.add(box.innerP1x, box.innerP1y, box.innerP2x, box.innerP2y, box.inwardX, box.inwardY, wallTopZ);
    const dx = box.innerP2x - box.innerP1x;
    const dy = box.innerP2y - box.innerP1y;
    const len = Math.hypot(dx, dy);
    if (len > 0) {
        const tx = dx / len;
        const ty = dy / len;
        out.add(box.outerP1x, box.outerP1y, box.innerP1x, box.innerP1y, -tx, -ty, wallTopZ);
        out.add(box.innerP2x, box.innerP2y, box.outerP2x, box.outerP2y, tx, ty, wallTopZ);
    }
}
export function collectRailWallShadowEdgesInAabb(grid, bounds, out) {
    collectRailWallBoxesInAabb(grid, bounds, sRailShadowBoxes);
    for (let i = 0; i < sRailShadowBoxes.length; i++) pushRailWallBoxCapShadowEdges(sRailShadowBoxes[i], out);
}

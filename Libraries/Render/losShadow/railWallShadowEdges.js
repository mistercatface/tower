import { collectRailWallBoxesInAabb, RailWallBoxList, RAIL_BOX, RAIL_BOX_STRIDE } from "../../World/wallGridBake.js";
const sRailShadowBoxes = new RailWallBoxList();
function pushRailWallBoxCapShadowEdges(data, index, out) {
    const base = index * RAIL_BOX_STRIDE;
    const wallTopZ = data[base + RAIL_BOX.wallCapHeight];
    const inwardX = data[base + RAIL_BOX.inwardX];
    const inwardY = data[base + RAIL_BOX.inwardY];
    const innerP1x = data[base + RAIL_BOX.innerP1x];
    const innerP1y = data[base + RAIL_BOX.innerP1y];
    const innerP2x = data[base + RAIL_BOX.innerP2x];
    const innerP2y = data[base + RAIL_BOX.innerP2y];
    const outerP1x = data[base + RAIL_BOX.outerP1x];
    const outerP1y = data[base + RAIL_BOX.outerP1y];
    const outerP2x = data[base + RAIL_BOX.outerP2x];
    const outerP2y = data[base + RAIL_BOX.outerP2y];
    out.add(outerP1x, outerP1y, outerP2x, outerP2y, -inwardX, -inwardY, wallTopZ);
    out.add(innerP1x, innerP1y, innerP2x, innerP2y, inwardX, inwardY, wallTopZ);
    const dx = innerP2x - innerP1x;
    const dy = innerP2y - innerP1y;
    const len = Math.hypot(dx, dy);
    if (len > 0) {
        const tx = dx / len;
        const ty = dy / len;
        out.add(outerP1x, outerP1y, innerP1x, innerP1y, -tx, -ty, wallTopZ);
        out.add(innerP2x, innerP2y, outerP2x, outerP2y, tx, ty, wallTopZ);
    }
}
export function collectRailWallShadowEdgesInAabb(grid, bounds, out) {
    collectRailWallBoxesInAabb(grid, bounds, sRailShadowBoxes);
    for (let i = 0; i < sRailShadowBoxes.length; i++) pushRailWallBoxCapShadowEdges(sRailShadowBoxes.data, i, out);
}

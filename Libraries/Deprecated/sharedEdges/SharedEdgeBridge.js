import { resolveSegmentWallHeightPx } from "../../World/wallGridCells.js";
import { MAX_WALLS, STRIDE, wallGeometryView, wallSharedEdgesView } from "./SharedEdgeBuffers.js";
import { requestSharedEdges } from "./SharedEdgeWorkerCoordinator.js";
export { MAX_WALLS, STRIDE, wallGeometryView, wallSharedEdgesView };
/**
 * @param {object[]} walls
 * @param {import("../../WorldSurface/WorldSurfaceSettings.js").WorldSurfaceSettings} settings
 */
export function writeWallGeometry(walls, settings) {
    const numWalls = Math.min(walls.length, MAX_WALLS);
    for (let i = 0; i < numWalls; i++) {
        const seg = walls[i];
        const offset = i * STRIDE;
        wallGeometryView[offset] = seg.x;
        wallGeometryView[offset + 1] = seg.y;
        wallGeometryView[offset + 2] = seg.angle;
        wallGeometryView[offset + 3] = seg.size;
        wallGeometryView[offset + 4] = seg.isDead ? 1 : 0;
        wallGeometryView[offset + 5] = resolveSegmentWallHeightPx(seg, settings);
        if (!seg.sharedEdges) seg.sharedEdges = [false, false, false, false];
    }
    return numWalls;
}
/**
 * @param {object[]} walls
 * @param {number} numWalls
 */
export function applySharedEdgeFlags(walls, numWalls) {
    for (let i = 0; i < numWalls; i++) {
        const seg = walls[i];
        if (seg.isDead) continue;
        const flags = wallSharedEdgesView[i];
        seg.sharedEdges[0] = (flags & 1) !== 0;
        seg.sharedEdges[1] = (flags & 2) !== 0;
        seg.sharedEdges[2] = (flags & 4) !== 0;
        seg.sharedEdges[3] = (flags & 8) !== 0;
    }
}
export function requestSharedEdgeSolve(numWalls) {
    return requestSharedEdges(numWalls);
}
/** @param {object | null | undefined} seg @param {number} edgeIndex */
export function shouldCullSharedWallFace(seg, edgeIndex) {
    return seg?.sharedEdges?.[edgeIndex] === true;
}

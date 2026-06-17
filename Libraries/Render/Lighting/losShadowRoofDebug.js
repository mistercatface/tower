import { elevationCameraFromViewport } from "../../Spatial/iso/ElevationCamera.js";
import { isOutwardFaceTowardViewer, projectWorldPointInto } from "../../Spatial/iso/IsometricProjection.js";
import { LIBRARY_DEFAULT_CAMERA_HEIGHT } from "../../Spatial/iso/perspectiveDefaults.js";
import { collectLosShadowEdges } from "./losShadowEdges.js";
import { LOS_SHADOW_VISION_TILES_DEFAULT } from "./losShadowDefaults.js";
const sP1 = { x: 0, y: 0 };
const sP2 = { x: 0, y: 0 };
const sEdgeScratch = [];
function clampSegmentCoord(a, b, v) {
    const lo = a < b ? a : b;
    const hi = a < b ? b : a;
    return v < lo ? lo : v > hi ? hi : v;
}
/** Red lines on roof-height edges where ground shadow wedges attach (near edge). */
export function drawLosShadowRoofEdgeDebug(ctx, viewport, obstacleGrid, options = {}) {
    const visionTiles = options.visionTiles ?? LOS_SHADOW_VISION_TILES_DEFAULT;
    const cameraHeight = options.cameraHeight ?? LIBRARY_DEFAULT_CAMERA_HEIGHT;
    const camera = options.camera ?? elevationCameraFromViewport(viewport, cameraHeight);
    const viewerX = viewport.x;
    const viewerY = viewport.y;
    const range = visionTiles * obstacleGrid.cellSize;
    const rSq = range * range;
    collectLosShadowEdges(obstacleGrid, sEdgeScratch);
    ctx.save();
    ctx.strokeStyle = "#ff0000";
    ctx.lineWidth = 2 / (viewport.zoom ?? 1);
    ctx.lineJoin = "round";
    for (let i = 0; i < sEdgeScratch.length; i++) {
        const edge = sEdgeScratch[i];
        const closestX = clampSegmentCoord(edge.x1, edge.x2, viewerX);
        const closestY = clampSegmentCoord(edge.y1, edge.y2, viewerY);
        const dx = viewerX - closestX;
        const dy = viewerY - closestY;
        if (dx * dx + dy * dy > rSq) continue;
        const midX = (edge.x1 + edge.x2) * 0.5;
        const midY = (edge.y1 + edge.y2) * 0.5;
        if (!isOutwardFaceTowardViewer(midX, midY, edge.nx, edge.ny, viewerX, viewerY)) continue;
        projectWorldPointInto(sP1, edge.x1, edge.y1, edge.wallTopZ, camera);
        projectWorldPointInto(sP2, edge.x2, edge.y2, edge.wallTopZ, camera);
        ctx.beginPath();
        ctx.moveTo(sP1.x, sP1.y);
        ctx.lineTo(sP2.x, sP2.y);
        ctx.stroke();
    }
    ctx.restore();
}

import { elevationCameraFromViewport } from "../../Spatial/iso/ElevationCamera.js";
import { projectWorldPointInto } from "../../Spatial/iso/IsometricProjection.js";
import { createAabb, expandPointsAabbInto } from "../../Math/Aabb2D.js";
import { traceClosedPolygon } from "../../Canvas/CanvasPath.js";
import { drawProjectedWallFace } from "../Structure3D/ProjectedWallDraw.js";
/** @typedef {import("../Structure3D/WallDrawContext.js").WallDrawContext} WallDrawContext */
const sRoofProjectedCorners = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
];
/**
 * Base class for all pre-calculated static geometry.
 */
export class Renderable {
    constructor(pass) {
        this.pass = pass; // e.g., 'walls', 'roofs', 'ground'
        this.bounds = createAabb();
        this.sourceId = null; // Link back to simulation entity if needed for destruction
    }
    draw(ctx, viewport) {
        // Override in subclasses
    }
}
/**
 * A retained wall face: stores static edge geometry and culling metadata.
 * Isometric projection is recomputed each frame from the viewer position.
 */
export class RenderableWallFace extends Renderable {
    /**
     * @param {string|object} sourceId
     * @param {{ x: number, y: number }} p1
     * @param {{ x: number, y: number }} p2
     * @param {number} wallHeight
     * @param {number} edgeIndex
     * @param {{ cx: number, cy: number, outX: number, outY: number }} edgeMeta
     */
    constructor(sourceId, p1, p2, wallHeight, edgeIndex, edgeMeta) {
        super("walls");
        this.sourceId = sourceId;
        this.p1 = { x: p1.x, y: p1.y };
        this.p2 = { x: p2.x, y: p2.y };
        this.wallHeight = wallHeight;
        this.edgeIndex = edgeIndex;
        this.cx = edgeMeta.cx;
        this.cy = edgeMeta.cy;
        this.outX = edgeMeta.outX;
        this.outY = edgeMeta.outY;
        expandPointsAabbInto(this.bounds, [p1, p2], wallHeight);
    }
    shouldDraw(viewerX, viewerY) {
        const seg = this.simWall;
        if (seg?.isDead) return false;
        if (seg?.sharedEdges?.[this.edgeIndex]) return false;
        const viewX = this.cx - viewerX;
        const viewY = this.cy - viewerY;
        return this.outX * viewX + this.outY * viewY < 0;
    }
    /** @param {CanvasRenderingContext2D} ctx @param {WallDrawContext} wallCtx */
    draw(ctx, wallCtx) {
        wallCtx.wallHeight = this.wallHeight;
        wallCtx.wallBaseZ = 0;
        wallCtx.wallCapHeight = this.wallHeight;
        wallCtx.cacheObj = this.simWall;
        drawProjectedWallFace(ctx, this.p1, this.p2, wallCtx);
    }
}
/**
 * A pre-calculated roof footprint used for clipping and damage overlays.
 */
export class RenderableRoofCap extends Renderable {
    constructor(sourceId, zLevel, corners) {
        super("roofs");
        this.sourceId = sourceId;
        this.zLevel = zLevel;
        // The 4 corners of the roof footprint in world space
        this.corners = corners; // [{x,y}, {x,y}, {x,y}, {x,y}]
        expandPointsAabbInto(this.bounds, corners);
    }
    draw(ctx, viewport, cameraHeight) {
        const camera = elevationCameraFromViewport(viewport, cameraHeight);
        for (let j = 0; j < 4; j++) {
            const corner = this.corners[j];
            projectWorldPointInto(sRoofProjectedCorners[j], corner.x, corner.y, this.zLevel, camera);
        }
        ctx.beginPath();
        traceClosedPolygon(ctx, sRoofProjectedCorners);
    }
}

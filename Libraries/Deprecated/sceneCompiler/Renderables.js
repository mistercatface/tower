import { projectWorldPointInto } from "../../Spatial/iso/IsometricProjection.js";
import { createAabb, expandPointsAabbInto } from "../../Math/Aabb2D.js";
import { traceClosedPolygon } from "../../Canvas/CanvasPath.js";
import { drawProjectedWallFace } from "../../Render/Structure3D/ProjectedWallDraw.js";
/** @typedef {import("../../Render/Structure3D/WallDrawContext.js").WallDrawContext} WallDrawContext */
const sRoofProjectedCorners = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
];
export class Renderable {
    constructor(pass) {
        this.pass = pass;
        this.bounds = createAabb();
        this.sourceId = null;
    }
    draw(ctx, viewport) {}
}
export class RenderableWallFace extends Renderable {
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
export class RenderableRoofCap extends Renderable {
    constructor(sourceId, zLevel, corners) {
        super("roofs");
        this.sourceId = sourceId;
        this.zLevel = zLevel;
        this.corners = corners;
        expandPointsAabbInto(this.bounds, corners);
    }
    /** @param {CanvasRenderingContext2D} ctx @param {import("../../Spatial/iso/ElevationCamera.js").ElevationCamera} camera */
    draw(ctx, camera) {
        for (let j = 0; j < 4; j++) {
            const corner = this.corners[j];
            projectWorldPointInto(sRoofProjectedCorners[j], corner.x, corner.y, this.zLevel, camera);
        }
        ctx.beginPath();
        traceClosedPolygon(ctx, sRoofProjectedCorners);
    }
}

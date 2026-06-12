import { resolveStructurePerspectiveStrength } from "../../../Core/GamePerspective.js";
import { resolveElevationAlpha } from "../../Spatial/iso/IsometricProjection.js";
import { createAabb, expandPointsAabbInto } from "../../Math/Aabb2D.js";
import { computeProjectedFace, drawFaceTexture, traceProjectedFace } from "../Structure3D/ProjectedWallDraw.js";
import { drawDamageOverlayInClip } from "../Structure3D/wallDamageVisual.js";
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
    draw(ctx, viewport, worldSurfaces, proceduralSurfaceDraw, fillStyle, damageAlpha, viewerX, viewerY, worldBounds) {
        const settings = worldSurfaces.settings;
        if (!settings) return;
        const face = computeProjectedFace(this.p1, this.p2, viewerX, viewerY, this.wallHeight, settings, undefined, viewport);
        traceProjectedFace(ctx, this.p1, this.p2, face);
        if (worldSurfaces && proceduralSurfaceDraw) {
            drawFaceTexture(ctx, this.p1, this.p2, face, worldSurfaces, proceduralSurfaceDraw, { x: viewerX, y: viewerY }, viewport, this.wallHeight, fillStyle, this.simWall, worldBounds);
            if (damageAlpha > 0) drawDamageOverlayInClip(ctx, damageAlpha, (ctx) => traceProjectedFace(ctx, this.p1, this.p2, face));
        } else {
            ctx.fillStyle = fillStyle;
            ctx.fill();
        }
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
        // Calculate 2D bounding box for chunk assignment
        this.bounds = {
            minX: Math.min(...corners.map((c) => c.x)),
            maxX: Math.max(...corners.map((c) => c.x)),
            minY: Math.min(...corners.map((c) => c.y)),
            maxY: Math.max(...corners.map((c) => c.y)),
        };
    }
    draw(ctx, viewport, cameraHeight, viewerX, viewerY) {
        const strength = resolveStructurePerspectiveStrength(viewport);
        const alpha = resolveElevationAlpha(this.zLevel, cameraHeight, strength);
        for (let j = 0; j < 4; j++) {
            const corner = this.corners[j];
            const px = corner.x + (corner.x - viewerX) * alpha;
            const py = corner.y + (corner.y - viewerY) * alpha;
            if (j === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
    }
}

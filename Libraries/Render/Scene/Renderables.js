import { drawPrecalculatedFaceTexture } from "../Structure3D/ProjectedWallDraw.js";
import { wallDamageOverlayStyle } from "../Structure3D/wallDamageVisual.js";

/**
 * Base class for all pre-calculated static geometry.
 */
export class Renderable {
    constructor(pass) {
        this.pass = pass; // e.g., 'walls', 'roofs', 'ground'
        this.bounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
        this.sourceId = null; // Link back to simulation entity if needed for destruction
    }

    draw(ctx, viewport) {
        // Override in subclasses
    }
}

/**
 * A pre-calculated isometric wall face.
 */
export class RenderableWallFace extends Renderable {
    constructor(sourceId, p1, p2, proj1, proj2, wallHeight) {
        super('walls');
        this.sourceId = sourceId;
        
        // The raw 2D screen polygon for the wall face
        this.p1 = { x: p1.x, y: p1.y };
        this.p2 = { x: p2.x, y: p2.y };
        this.proj1 = { x: proj1.x, y: proj1.y };
        this.proj2 = { x: proj2.x, y: proj2.y };
        this.wallHeight = wallHeight;

        // Calculate 2D bounding box for chunk assignment
        this.bounds = {
            minX: Math.min(p1.x, p2.x, proj1.x, proj2.x),
            maxX: Math.max(p1.x, p2.x, proj1.x, proj2.x),
            minY: Math.min(p1.y, p2.y, proj1.y, proj2.y),
            maxY: Math.max(p1.y, p2.y, proj1.y, proj2.y)
        };
    }

    draw(ctx, viewport, worldSurfaces, surfaceBake, fillStyle, damageAlpha, viewerX, viewerY, worldBounds) {
        ctx.beginPath();
        ctx.moveTo(this.p1.x, this.p1.y);
        ctx.lineTo(this.proj1.x, this.proj1.y);
        ctx.lineTo(this.proj2.x, this.proj2.y);
        ctx.lineTo(this.p2.x, this.p2.y);
        ctx.closePath();

        if (worldSurfaces && surfaceBake) {
            const face = { proj1X: this.proj1.x, proj1Y: this.proj1.y, proj2X: this.proj2.x, proj2Y: this.proj2.y };
            drawPrecalculatedFaceTexture(ctx, this.p1, this.p2, face, worldSurfaces, surfaceBake, { x: viewerX, y: viewerY }, viewport, this.wallHeight, fillStyle, this.simWall, worldBounds);
            
            if (damageAlpha > 0) {
                ctx.save();
                ctx.beginPath();
                ctx.moveTo(this.p1.x, this.p1.y);
                ctx.lineTo(this.proj1.x, this.proj1.y);
                ctx.lineTo(this.proj2.x, this.proj2.y);
                ctx.lineTo(this.p2.x, this.p2.y);
                ctx.closePath();
                ctx.clip();
                ctx.fillStyle = wallDamageOverlayStyle(damageAlpha);
                ctx.fill();
                ctx.restore();
            }
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
        super('roofs');
        this.sourceId = sourceId;
        this.zLevel = zLevel;
        
        // The 4 corners of the roof footprint in world space
        this.corners = corners; // [{x,y}, {x,y}, {x,y}, {x,y}]

        // Calculate 2D bounding box for chunk assignment
        this.bounds = {
            minX: Math.min(...corners.map(c => c.x)),
            maxX: Math.max(...corners.map(c => c.x)),
            minY: Math.min(...corners.map(c => c.y)),
            maxY: Math.max(...corners.map(c => c.y))
        };
    }

    draw(ctx, viewport, alpha, viewerX, viewerY) {
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

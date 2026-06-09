/** @typedef {import("./WorldSceneTypes.js").WorldSceneDrawInput} WorldSceneDrawInput */
/** @typedef {import("./WorldSceneTypes.js").WorldSceneDrawOptions} WorldSceneDrawOptions */
/** @typedef {import("./Props3D/PropRenderer.js").PropDrawRecipe} PropDrawRecipe */
import { getWallDamageAlpha } from "./Structure3D/wallDamageVisual.js";
import { clipToViewport } from "./common/viewportUtils.js";
import { PropRenderer } from "./Props3D/PropRenderer.js";
import { StructureRenderer } from "./Structure3D/StructureRenderer.js";
import { renderActorKinematicsBody } from "./Characters/actorKinematicsRenderer.js";
export class WorldSceneRenderer {
    /**
     * @param {import("../WorldSurface/WorldSurfaceSettings.js").WorldSurfaceSettings} settings
     * @param {Record<string, PropDrawRecipe>} [propRecipes]
     */
    constructor(settings, propRecipes = {}) {
        this.settings = settings;
        this.structure = new StructureRenderer(settings);
        this.props = new PropRenderer(propRecipes);
        this._visibleObjects = [];
    }
    /** @param {Record<string, PropDrawRecipe>} propRecipes */
    setPropRecipes(propRecipes) {
        this.props.setPropRecipes(propRecipes);
    }
    drawProp(ctx, prop, px, py) {
        this.props.drawProp(ctx, prop, px, py);
    }
    /**
     * @param {CanvasRenderingContext2D} ctx
     * @param {WorldSceneDrawInput} input
     * @param {import("../Viewport/Viewport.js").Viewport | null} viewport
     * @param {WorldSceneDrawOptions} [options]
     */
    drawDebrisProps(ctx, input, viewport, options = {}) {
        const px = input.viewer.x;
        const py = input.viewer.y;
        ctx.save();
        if (viewport) clipToViewport(ctx, viewport, input.canvasBounds);
        for (let i = 0; i < input.pickups.length; i++) {
            const p = input.pickups[i];
            if (p.isDead || p.strategy?.renderMode !== "debris") continue;
            if (viewport && typeof p.isVisible === "function" && !p.isVisible(viewport)) continue;
            this.drawProp(ctx, p, px, py);
        }
        ctx.restore();
    }
    drawExplosion(px, py, maxDist, input, targetCtx) {
        this.structure.drawExplosion(px, py, maxDist, input, targetCtx);
    }
    /**
     * @param {WorldSceneDrawInput} input
     * @param {import("../Viewport/Viewport.js").Viewport | null} viewport
     * @param {number} px
     * @param {number} py
     */
    _appendVisibleWalls(input, viewport, px, py) {
        const visibleObjects = this._visibleObjects;
        const candidateWalls = this.structure.collectVisibleWalls(input, viewport, px, py);
        for (let i = 0; i < candidateWalls.length; i++) {
            const seg = candidateWalls[i];
            if (seg.isDead) continue;
            seg._distSq = (seg.x - px) ** 2 + (seg.y - py) ** 2;
            visibleObjects.push(seg);
        }
    }
    /**
     * @param {WorldSceneDrawInput} input
     * @param {import("../Viewport/Viewport.js").Viewport | null} viewport
     * @param {number} px
     * @param {number} py
     */
    _appendVisible3dProps(input, viewport, px, py) {
        const visibleObjects = this._visibleObjects;
        if (input.pickups.length > 0)
            for (let i = 0; i < input.pickups.length; i++) {
                const p = input.pickups[i];
                if (p.isDead) continue;
                if (p.strategy?.renderMode !== "3d" && !p.usesKinematicsBody) continue;
                if (viewport && typeof p.isVisible === "function" && !p.isVisible(viewport)) continue;
                p._distSq = (p.x - px) ** 2 + (p.y - py) ** 2;
                visibleObjects.push(p);
            }
    }
    /**
     * @param {WorldSceneDrawInput} input
     * @param {import("../Viewport/Viewport.js").Viewport | null} viewport
     * @param {number} px
     * @param {number} py
     * @param {object[]} visibleObjects
     */
    _appendVisibleRagdolls(input, viewport, px, py, visibleObjects) {
        if (!input.ragdollCorpses?.length) return;
        for (let i = 0; i < input.ragdollCorpses.length; i++) {
            const corpse = input.ragdollCorpses[i];
            if (corpse.isDead || corpse.opacity <= 0) continue;
            if (viewport && typeof corpse.isVisible === "function" && !corpse.isVisible(viewport)) continue;
            corpse._distSq = (corpse.x - px) ** 2 + (corpse.y - py) ** 2;
            visibleObjects.push(corpse);
        }
    }
    /**
     * @param {CanvasRenderingContext2D} ctx
     * @param {WorldSceneDrawInput} input
     * @param {import("../Viewport/Viewport.js").Viewport | null} viewport
     * @param {WorldSceneDrawOptions} [options]
     */
    drawStructureOnly(ctx, input, viewport, options = {}) {
        // If we have a compiled render scene, use it!
        if (input.worldSurfaces?.renderScene) {
            const scene = input.worldSurfaces.renderScene;
            const canvasWidth = viewport.cx * 2;
            const canvasHeight = viewport.cy * 2;
            const viewportBounds = viewport.getWorldBounds(canvasWidth, canvasHeight, this.settings.viewPaddingPx);
            
            const minCol = Math.floor(viewportBounds.minX / scene.chunkSizePx);
            const maxCol = Math.floor(viewportBounds.maxX / scene.chunkSizePx);
            const minRow = Math.floor(viewportBounds.minY / scene.chunkSizePx);
            const maxRow = Math.floor(viewportBounds.maxY / scene.chunkSizePx);

            ctx.save();
            if (viewport) clipToViewport(ctx, viewport, input.canvasBounds);
            
            const walls = scene.collectPass('walls', minCol, minRow, maxCol, maxRow);
            
            // Sort walls back-to-front based on distance from viewer
            const px = input.viewer.x;
            const py = input.viewer.y;
            for (let i = 0; i < walls.length; i++) {
                const w = walls[i];
                // Rough distance to center of wall face
                const cx = (w.p1.x + w.p2.x) / 2;
                const cy = (w.p1.y + w.p2.y) / 2;
                w._distSq = (cx - px) ** 2 + (cy - py) ** 2;
            }
            // Add a secondary sort by Y coordinate to handle walls at the same distance
            walls.sort((a, b) => {
                const distDiff = b._distSq - a._distSq;
                if (Math.abs(distDiff) < 0.1) {
                    return Math.min(a.p1.y, a.p2.y) - Math.min(b.p1.y, b.p2.y);
                }
                return distDiff;
            });

            const fillStyle = this.settings.floorShadow ?? "#12161c";

            // We need to handle back-face culling just like the old renderer did
            const visibleWalls = [];
            for (let i = 0; i < walls.length; i++) {
                const w = walls[i];
                if (w.simWall && w.simWall.isDead) continue;
                
                // Culling: check if the 2D bounding box of the wall face intersects the viewport
                if (w.bounds.maxX < viewportBounds.minX || w.bounds.minX > viewportBounds.maxX || 
                    w.bounds.maxY < viewportBounds.minY || w.bounds.minY > viewportBounds.maxY) {
                    continue;
                }

                // Back-face culling
                const dx = w.p2.x - w.p1.x;
                const dy = w.p2.y - w.p1.y;
                const normalX = dy;
                const normalY = -dx;
                const viewX = w.p1.x - px;
                const viewY = w.p1.y - py;
                
                if (normalX * viewX + normalY * viewY >= 0) continue;

                visibleWalls.push(w);
            }

            for (let i = 0; i < visibleWalls.length; i++) {
                const w = visibleWalls[i];
                const damageAlpha = w.simWall ? getWallDamageAlpha(w.simWall) : 0;
                w.draw(ctx, viewport, input.worldSurfaces, input.surfaceBake, fillStyle, damageAlpha, px, py, viewportBounds);
            }
            
            ctx.restore();
            return;
        }

        const px = input.viewer.x;
        const py = input.viewer.y;
        const worldBounds = viewport ? viewport.getWorldBounds(viewport.cx * 2, viewport.cy * 2, this.settings.viewPaddingPx) : null;
        const wallDrawOptions = { textureEnabled: options.textureEnabled !== false, worldBounds };
        this.structure.updateSharedEdges(input);
        ctx.save();
        if (viewport) clipToViewport(ctx, viewport, input.canvasBounds);
        const candidateWalls = this.structure.collectVisibleWalls(input, viewport, px, py);
        for (let i = 0; i < candidateWalls.length; i++) {
            const seg = candidateWalls[i];
            if (seg.isDead) continue;
            this.structure.drawWallSegmentFaces(ctx, seg, px, py, input, viewport, wallDrawOptions);
        }
        ctx.restore();
    }
    /**
     * @param {CanvasRenderingContext2D} ctx
     * @param {WorldSceneDrawInput} input
     * @param {import("../Viewport/Viewport.js").Viewport | null} viewport
     * @param {WorldSceneDrawOptions} [options]
     */
    drawDynamicPropsOnly(ctx, input, viewport, options = {}) {
        const px = input.viewer.x;
        const py = input.viewer.y;
        ctx.save();
        if (viewport) clipToViewport(ctx, viewport, input.canvasBounds);
        const visibleProps = this._visibleObjects;
        visibleProps.length = 0;
        this._appendVisible3dProps(input, viewport, px, py);
        visibleProps.sort((a, b) => b._distSq - a._distSq);
        for (let i = 0; i < visibleProps.length; i++) {
            const obj = visibleProps[i];
            if (obj.usesKinematicsBody) renderActorKinematicsBody(ctx, obj, viewport);
            else this.drawProp(ctx, obj, px, py);
        }
        ctx.restore();
    }
    /**
     * @param {CanvasRenderingContext2D} ctx
     * @param {WorldSceneDrawInput} input
     * @param {import("../Viewport/Viewport.js").Viewport | null} viewport
     */
    drawRagdollCorpsesOnly(ctx, input, viewport) {
        const px = input.viewer.x;
        const py = input.viewer.y;
        ctx.save();
        if (viewport) clipToViewport(ctx, viewport, input.canvasBounds);
        const visibleCorpses = this._visibleObjects;
        visibleCorpses.length = 0;
        this._appendVisibleRagdolls(input, viewport, px, py, visibleCorpses);
        visibleCorpses.sort((a, b) => b._distSq - a._distSq);
        for (let i = 0; i < visibleCorpses.length; i++) visibleCorpses[i].render(ctx);
        ctx.restore();
    }
    /**
     * @param {CanvasRenderingContext2D} ctx
     * @param {WorldSceneDrawInput} input
     * @param {import("../Viewport/Viewport.js").Viewport | null} viewport
     * @param {WorldSceneDrawOptions} [options]
     */
    draw3DBuildings(ctx, input, viewport, options = {}) {
        const px = input.viewer.x;
        const py = input.viewer.y;
        const worldBounds = viewport ? viewport.getWorldBounds(viewport.cx * 2, viewport.cy * 2, this.settings.viewPaddingPx) : null;
        const wallDrawOptions = { textureEnabled: options.textureEnabled !== false, worldBounds };
        this.structure.updateSharedEdges(input);
        ctx.save();
        if (viewport) clipToViewport(ctx, viewport, input.canvasBounds);
        const visibleObjects = this._visibleObjects;
        visibleObjects.length = 0;
        this._appendVisibleWalls(input, viewport, px, py);
        this._appendVisible3dProps(input, viewport, px, py);
        visibleObjects.sort((a, b) => b._distSq - a._distSq);
        for (let i = 0; i < visibleObjects.length; i++) {
            const obj = visibleObjects[i];
            if (obj.usesKinematicsBody) renderActorKinematicsBody(ctx, obj, viewport);
            else if (obj.strategy) this.drawProp(ctx, obj, px, py);
            else this.structure.drawWallSegmentFaces(ctx, obj, px, py, input, viewport, wallDrawOptions);
        }
        ctx.restore();
    }
}

/** @typedef {import("./WorldSceneTypes.js").WorldSceneDrawInput} WorldSceneDrawInput */
/** @typedef {import("./WorldSceneTypes.js").WorldSceneDrawOptions} WorldSceneDrawOptions */
/** @typedef {import("./Props3D/PropRenderer.js").PropDrawRecipe} PropDrawRecipe */
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
        if (options.fastNav === true) return;
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
     * @param {boolean} fastNav
     */
    _appendVisibleWalls(input, viewport, px, py, fastNav) {
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
     * @param {boolean} fastNav
     */
    _appendVisible3dProps(input, viewport, px, py, fastNav) {
        if (fastNav) return;
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
        if (input.ragdollCorpses && input.ragdollCorpses.length > 0)
            for (let i = 0; i < input.ragdollCorpses.length; i++) {
                const corpse = input.ragdollCorpses[i];
                if (corpse.isDead || corpse.opacity <= 0) continue;
                if (viewport && typeof corpse.isVisible === "function" && !corpse.isVisible(viewport)) continue;
                corpse._distSq = (corpse.x - px) ** 2 + (corpse.y - py) ** 2;
                corpse.isRagdollCorpse = true; // Flag for drawing
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
        const px = input.viewer.x;
        const py = input.viewer.y;
        const fastNav = options.fastNav === true;
        const wallDrawOptions = { textureEnabled: options.textureEnabled !== false && !fastNav };
        if (!fastNav) this.structure.updateSharedEdges(input);
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
        const fastNav = options.fastNav === true;
        ctx.save();
        if (viewport) clipToViewport(ctx, viewport, input.canvasBounds);
        const visibleProps = this._visibleObjects;
        visibleProps.length = 0;
        this._appendVisible3dProps(input, viewport, px, py, fastNav);
        visibleProps.sort((a, b) => b._distSq - a._distSq);
        for (let i = 0; i < visibleProps.length; i++) {
            const obj = visibleProps[i];
            if (obj.isRagdollCorpse) obj.render(ctx);
            else if (obj.usesKinematicsBody) renderActorKinematicsBody(ctx, obj, viewport);
            else this.drawProp(ctx, obj, px, py);
        }
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
        const fastNav = options.fastNav === true;
        const wallDrawOptions = { textureEnabled: options.textureEnabled !== false && !fastNav };
        if (!fastNav) this.structure.updateSharedEdges(input);
        ctx.save();
        if (viewport) clipToViewport(ctx, viewport, input.canvasBounds);
        const visibleObjects = this._visibleObjects;
        visibleObjects.length = 0;
        this._appendVisibleWalls(input, viewport, px, py, fastNav);
        this._appendVisible3dProps(input, viewport, px, py, fastNav);
        visibleObjects.sort((a, b) => b._distSq - a._distSq);
        for (let i = 0; i < visibleObjects.length; i++) {
            const obj = visibleObjects[i];
            if (obj.isRagdollCorpse) obj.render(ctx);
            else if (obj.usesKinematicsBody) renderActorKinematicsBody(ctx, obj, viewport);
            else if (obj.strategy) this.drawProp(ctx, obj, px, py);
            else this.structure.drawWallSegmentFaces(ctx, obj, px, py, input, viewport, wallDrawOptions);
        }
        ctx.restore();
    }
}

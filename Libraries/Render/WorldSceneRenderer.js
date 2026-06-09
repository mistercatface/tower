/** @typedef {import("./WorldSceneTypes.js").WorldSceneDrawInput} WorldSceneDrawInput */
/** @typedef {import("./WorldSceneTypes.js").WorldSceneDrawOptions} WorldSceneDrawOptions */
/** @typedef {import("./Props3D/PropRenderer.js").PropDrawRecipe} PropDrawRecipe */
import { getWallDamageAlpha } from "./Structure3D/wallDamageVisual.js";
import { clipToViewport, getViewQueryBounds } from "./common/viewportUtils.js";
import { worldToChunkCol, worldToChunkRow } from "../Spatial/grid/ChunkGrid.js";
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
        this._sceneWallScratch = [];
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
     * @param {import("../Viewport/Viewport.js").Viewport} viewport
     * @param {WorldSceneDrawOptions} [options]
     */
    drawDebrisProps(ctx, input, viewport, options = {}) {
        const px = input.viewer.x;
        const py = input.viewer.y;
        ctx.save();
        clipToViewport(ctx, viewport, input.canvasBounds);
        for (let i = 0; i < input.pickups.length; i++) {
            const p = input.pickups[i];
            if (p.isDead || p.strategy?.renderMode !== "debris") continue;
            if (typeof p.isVisible === "function" && !p.isVisible(viewport)) continue;
            this.drawProp(ctx, p, px, py);
        }
        ctx.restore();
    }
    drawExplosionWallMask(px, py, maxDist, input, viewport, targetCtx) {
        this.structure.drawExplosionWallMask(targetCtx, px, py, maxDist, input, viewport);
    }
    _worldBounds(viewport) {
        return viewport.getWorldBounds(viewport.cx * 2, viewport.cy * 2, this.settings.viewPaddingPx);
    }
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
    _getSceneChunkRange(scene, viewport, input) {
        const bounds = getViewQueryBounds(viewport, this.settings.viewQueryPadPx, input.canvasBounds);
        return {
            minCol: worldToChunkCol(bounds.minX, scene.gridMinX, scene.chunkSizePx),
            maxCol: worldToChunkCol(bounds.maxX - 1, scene.gridMinX, scene.chunkSizePx),
            minRow: worldToChunkRow(bounds.minY, scene.gridMinY, scene.chunkSizePx),
            maxRow: worldToChunkRow(bounds.maxY - 1, scene.gridMinY, scene.chunkSizePx),
        };
    }
    _appendVisibleWallsFromScene(input, viewport, px, py) {
        const scene = input.worldSurfaces.renderScene;
        if (scene.chunks.size === 0) {
            this._appendVisibleWalls(input, viewport, px, py);
            return;
        }
        const { minCol, maxCol, minRow, maxRow } = this._getSceneChunkRange(scene, viewport, input);
        this._sceneWallScratch.length = 0;
        const renderables = scene.collectPass("walls", minCol, minRow, maxCol, maxRow, this._sceneWallScratch);
        const visibleObjects = this._visibleObjects;
        for (let i = 0; i < renderables.length; i++) {
            const face = renderables[i];
            if (!face.shouldDraw(px, py)) continue;
            face._distSq = (face.cx - px) ** 2 + (face.cy - py) ** 2;
            visibleObjects.push(face);
        }
    }
    _appendVisible3dProps(input, viewport, px, py) {
        const visibleObjects = this._visibleObjects;
        if (input.pickups.length > 0)
            for (let i = 0; i < input.pickups.length; i++) {
                const p = input.pickups[i];
                if (p.isDead) continue;
                if (p.strategy?.renderMode !== "3d" && !p.usesKinematicsBody) continue;
                if (typeof p.isVisible === "function" && !p.isVisible(viewport)) continue;
                p._distSq = (p.x - px) ** 2 + (p.y - py) ** 2;
                visibleObjects.push(p);
            }
    }
    _appendVisibleRagdolls(input, viewport, px, py, visibleObjects) {
        if (!input.ragdollCorpses?.length) return;
        for (let i = 0; i < input.ragdollCorpses.length; i++) {
            const corpse = input.ragdollCorpses[i];
            if (corpse.isDead || corpse.opacity <= 0) continue;
            if (typeof corpse.isVisible === "function" && !corpse.isVisible(viewport)) continue;
            corpse._distSq = (corpse.x - px) ** 2 + (corpse.y - py) ** 2;
            visibleObjects.push(corpse);
        }
    }
    _drawRetainedWallFace(ctx, face, input, viewport, px, py, worldBounds) {
        const fillStyle = this.settings.floorShadow ?? "#12161c";
        face.draw(ctx, viewport, input.worldSurfaces, input.surfaceBake, fillStyle, getWallDamageAlpha(face.simWall), px, py, worldBounds);
    }
    drawStructureOnly(ctx, input, viewport, options = {}) {
        const scene = input.worldSurfaces.renderScene;
        const px = input.viewer.x;
        const py = input.viewer.y;
        const worldBounds = this._worldBounds(viewport);
        this.structure.updateSharedEdges(input);
        ctx.save();
        clipToViewport(ctx, viewport, input.canvasBounds);
        if (scene.chunks.size > 0) {
            const { minCol, maxCol, minRow, maxRow } = this._getSceneChunkRange(scene, viewport, input);
            const walls = scene.collectPass("walls", minCol, minRow, maxCol, maxRow);
            for (let i = 0; i < walls.length; i++) walls[i]._distSq = (walls[i].cx - px) ** 2 + (walls[i].cy - py) ** 2;
            walls.sort((a, b) => b._distSq - a._distSq || a.cy - b.cy);
            for (let i = 0; i < walls.length; i++) {
                const face = walls[i];
                if (!face.shouldDraw(px, py)) continue;
                this._drawRetainedWallFace(ctx, face, input, viewport, px, py, worldBounds);
            }
        } else {
            const wallDrawOptions = { textureEnabled: options.textureEnabled !== false };
            const candidateWalls = this.structure.collectVisibleWalls(input, viewport, px, py);
            for (let i = 0; i < candidateWalls.length; i++) {
                const seg = candidateWalls[i];
                if (seg.isDead) continue;
                this.structure.drawWallSegmentFaces(ctx, seg, px, py, input, viewport, worldBounds, wallDrawOptions);
            }
        }
        ctx.restore();
    }
    drawDynamicPropsOnly(ctx, input, viewport, options = {}) {
        const px = input.viewer.x;
        const py = input.viewer.y;
        ctx.save();
        clipToViewport(ctx, viewport, input.canvasBounds);
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
    drawRagdollCorpsesOnly(ctx, input, viewport) {
        const px = input.viewer.x;
        const py = input.viewer.y;
        ctx.save();
        clipToViewport(ctx, viewport, input.canvasBounds);
        const visibleCorpses = this._visibleObjects;
        visibleCorpses.length = 0;
        this._appendVisibleRagdolls(input, viewport, px, py, visibleCorpses);
        visibleCorpses.sort((a, b) => b._distSq - a._distSq);
        for (let i = 0; i < visibleCorpses.length; i++) visibleCorpses[i].render(ctx);
        ctx.restore();
    }
    draw3DBuildings(ctx, input, viewport, options = {}) {
        const px = input.viewer.x;
        const py = input.viewer.y;
        const worldBounds = this._worldBounds(viewport);
        const wallDrawOptions = { textureEnabled: options.textureEnabled !== false };
        this.structure.updateSharedEdges(input);
        ctx.save();
        clipToViewport(ctx, viewport, input.canvasBounds);
        const visibleObjects = this._visibleObjects;
        visibleObjects.length = 0;
        this._appendVisibleWallsFromScene(input, viewport, px, py);
        this._appendVisible3dProps(input, viewport, px, py);
        visibleObjects.sort((a, b) => b._distSq - a._distSq);
        for (let i = 0; i < visibleObjects.length; i++) {
            const obj = visibleObjects[i];
            if (obj.usesKinematicsBody) renderActorKinematicsBody(ctx, obj, viewport);
            else if (obj.strategy) this.drawProp(ctx, obj, px, py);
            else if (obj.pass === "walls") this._drawRetainedWallFace(ctx, obj, input, viewport, px, py, worldBounds);
            else this.structure.drawWallSegmentFaces(ctx, obj, px, py, input, viewport, worldBounds, wallDrawOptions);
        }
        ctx.restore();
    }
}

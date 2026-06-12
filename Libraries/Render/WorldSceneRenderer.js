/** @typedef {import("./WorldSceneTypes.js").WorldSceneDrawInput} WorldSceneDrawInput */
/** @typedef {import("./WorldSceneTypes.js").WorldSceneDrawOptions} WorldSceneDrawOptions */
/** @typedef {import("./Props3D/PropRenderer.js").PropDrawRecipe} PropDrawRecipe */
import { getWallDamageAlpha } from "./Structure3D/wallDamageVisual.js";
import { collectStaticGridWallDrawables, drawStaticGridWallFace } from "./Structure3D/StaticGridWallDraw.js";
import { clipToViewport } from "./common/viewportUtils.js";
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
        this.visibleDrawables = [];
        this.wallPassBuffer = [];
        this.staticGridDrawables = [];
        this._chunkRange = { minCol: 0, maxCol: 0, minRow: 0, maxRow: 0 };
    }
    /** @param {Record<string, PropDrawRecipe>} propRecipes */
    setPropRecipes(propRecipes) {
        this.props.setPropRecipes(propRecipes);
    }
    /**
     * @param {CanvasRenderingContext2D} ctx
     * @param {WorldSceneDrawInput} input
     * @param {import("../Viewport/Viewport.js").Viewport} viewport
     * @param {WorldSceneDrawOptions} [options]
     */
    drawDebrisProps(ctx, input, viewport, options = {}) {
        const px = viewport.x;
        const py = viewport.y;
        const zoom = viewport.zoom ?? 1;
        ctx.save();
        clipToViewport(ctx, viewport);
        for (let i = 0; i < input.pickups.length; i++) {
            const p = input.pickups[i];
            if (p.isDead || p.strategy?.renderMode !== "debris") continue;
            if (!p.isVisible(viewport)) continue;
            this.props.drawProp(ctx, p, px, py, { zoom });
        }
        ctx.restore();
    }
    _getSceneChunkRange(scene, viewport) {
        const bounds = viewport.boundsQuery;
        const range = this._chunkRange;
        range.minCol = worldToChunkCol(bounds.minX, scene.gridMinX, scene.chunkSizePx);
        range.maxCol = worldToChunkCol(bounds.maxX - 1, scene.gridMinX, scene.chunkSizePx);
        range.minRow = worldToChunkRow(bounds.minY, scene.gridMinY, scene.chunkSizePx);
        range.maxRow = worldToChunkRow(bounds.maxY - 1, scene.gridMinY, scene.chunkSizePx);
        return range;
    }
    _appendVisibleWallsFromScene(input, viewport, px, py) {
        const scene = input.worldSurfaces.renderScene;
        const { minCol, maxCol, minRow, maxRow } = this._getSceneChunkRange(scene, viewport);
        const renderables = scene.collectPass("walls", minCol, minRow, maxCol, maxRow, this.wallPassBuffer);
        const visibleObjects = this.visibleDrawables;
        for (let i = 0; i < renderables.length; i++) {
            const face = renderables[i];
            if (!face.shouldDraw(px, py)) continue;
            face._distSq = (face.cx - px) ** 2 + (face.cy - py) ** 2;
            visibleObjects.push(face);
        }
    }
    _appendVisible3dProps(input, viewport, px, py) {
        const visibleObjects = this.visibleDrawables;
        if (input.pickups.length > 0)
            for (let i = 0; i < input.pickups.length; i++) {
                const p = input.pickups[i];
                if (p.isDead) continue;
                if (p.strategy?.renderMode !== "3d" && !p.usesKinematicsBody) continue;
                if (!p.isVisible(viewport)) continue;
                p._distSq = (p.x - px) ** 2 + (p.y - py) ** 2;
                visibleObjects.push(p);
            }
    }
    _appendVisibleRagdolls(input, viewport, px, py, visibleObjects) {
        if (!input.ragdollCorpses?.length) return;
        for (let i = 0; i < input.ragdollCorpses.length; i++) {
            const corpse = input.ragdollCorpses[i];
            if (corpse.isDead) continue;
            if (!corpse.isVisible(viewport)) continue;
            corpse._distSq = (corpse.x - px) ** 2 + (corpse.y - py) ** 2;
            visibleObjects.push(corpse);
        }
    }
    _appendVisibleStaticGridWalls(input, viewport, px, py) {
        const obstacleGrid = input.obstacleGrid;
        if (!obstacleGrid?.cols) return;
        const layers = input.gameState?.staticOccupancyLayers;
        collectStaticGridWallDrawables(obstacleGrid, viewport, layers, this.settings, px, py, this.staticGridDrawables);
        const visibleObjects = this.visibleDrawables;
        for (let i = 0; i < this.staticGridDrawables.length; i++) visibleObjects.push(this.staticGridDrawables[i]);
    }
    _drawStaticGridWallFace(ctx, face, input, viewport, px, py, worldBounds) {
        const fillStyle = this.settings.floorShadow ?? "#12161c";
        drawStaticGridWallFace(ctx, face, input, viewport, px, py, worldBounds, fillStyle);
    }
    _drawRetainedWallFace(ctx, face, input, viewport, px, py, worldBounds) {
        const fillStyle = this.settings.floorShadow ?? "#12161c";
        face.draw(ctx, viewport, input.worldSurfaces, input.proceduralSurfaceDraw, fillStyle, getWallDamageAlpha(face.simWall), px, py, worldBounds);
    }
    drawRagdollCorpsesOnly(ctx, input, viewport) {
        const px = viewport.x;
        const py = viewport.y;
        ctx.save();
        clipToViewport(ctx, viewport);
        const visibleCorpses = this.visibleDrawables;
        visibleCorpses.length = 0;
        this._appendVisibleRagdolls(input, viewport, px, py, visibleCorpses);
        visibleCorpses.sort((a, b) => b._distSq - a._distSq);
        for (let i = 0; i < visibleCorpses.length; i++) visibleCorpses[i].render(ctx);
        ctx.restore();
    }
    draw3DBuildings(ctx, input, viewport, walls, options = {}) {
        const skipWalls = options.skipWalls === true;
        const px = viewport.x;
        const py = viewport.y;
        const zoom = viewport.zoom ?? 1;
        const worldBounds = viewport.boundsDraw;
        if (!skipWalls) this.structure.updateSharedEdges(walls);
        ctx.save();
        clipToViewport(ctx, viewport);
        const visibleObjects = this.visibleDrawables;
        visibleObjects.length = 0;
        if (!skipWalls) {
            this._appendVisibleWallsFromScene(input, viewport, px, py);
            this._appendVisibleStaticGridWalls(input, viewport, px, py);
        }
        this._appendVisible3dProps(input, viewport, px, py);
        visibleObjects.sort((a, b) => b._distSq - a._distSq);
        for (let i = 0; i < visibleObjects.length; i++) {
            const obj = visibleObjects[i];
            if (obj.usesKinematicsBody) renderActorKinematicsBody(ctx, obj, viewport);
            else if (obj.strategy) this.props.drawProp(ctx, obj, px, py, { zoom });
            else if (!skipWalls && obj.staticGrid) this._drawStaticGridWallFace(ctx, obj, input, viewport, px, py, worldBounds);
            else if (!skipWalls && obj.pass === "walls") this._drawRetainedWallFace(ctx, obj, input, viewport, px, py, worldBounds);
        }
        ctx.restore();
    }
}

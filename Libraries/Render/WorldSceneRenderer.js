/** @typedef {import("./WorldSceneTypes.js").WorldSceneDrawInput} WorldSceneDrawInput */
/** @typedef {import("./WorldSceneTypes.js").WorldSceneDrawOptions} WorldSceneDrawOptions */
/** @typedef {import("./Props3D/PropRenderer.js").PropDrawRecipe} PropDrawRecipe */
import { getStaticCellDamageAlphaAtIdx } from "../World/staticCellDamage.js";
import { collectStaticGridEdgeRailDrawables, drawProjectedGridEdgeRail } from "./Structure3D/StaticGridEdgeRailDraw.js";
import { collectStaticGridWallDrawables } from "./Structure3D/StaticGridWallDraw.js";
import { drawProjectedWallFace } from "./Structure3D/ProjectedWallDraw.js";
/** @typedef {import("./Structure3D/WallDrawContext.js").WallDrawContext} WallDrawContext */
import { aabbOverlap } from "../Math/Aabb2D.js";
import { clipToViewport } from "./common/viewportUtils.js";
import { PropRenderer } from "./Props3D/PropRenderer.js";
import { drawWorldProp } from "./drawWorldProp.js";
import { elevationCameraFromViewport } from "../Spatial/iso/ElevationCamera.js";
export class WorldSceneRenderer {
    /**
     * @param {import("../WorldSurface/WorldSurfaceSettings.js").WorldSurfaceSettings} settings
     * @param {Record<string, PropDrawRecipe>} [propRecipes]
     */
    constructor(settings, propRecipes = {}) {
        this.settings = settings;
        this.props = new PropRenderer(propRecipes);
        this.visibleDrawables = [];
        this.staticGridDrawables = [];
        this.staticGridEdgeRailDrawables = [];
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
        const props = input.entityRegistry.queryView(
            { bounds: viewport.boundsVisibleDefault, kinds: ["worldProp"], filterId: "debris", match: (p) => p.strategy?.renderMode === "debris" },
            input.spatialFrame,
        );
        for (let i = 0; i < props.length; i++) drawWorldProp(ctx, props[i], viewport, { gameState: input.gameState, propRenderer: this.props, px, py, zoom });
        ctx.restore();
    }
    /**
     * @param {CanvasRenderingContext2D} ctx
     * @param {WorldSceneDrawInput} input
     * @param {import("../Viewport/Viewport.js").Viewport} viewport
     */
    drawFloorProps(ctx, input, viewport) {
        const px = viewport.x;
        const py = viewport.y;
        const zoom = viewport.zoom ?? 1;
        const bounds = viewport.boundsVisibleDefault;
        const drawContext = { gameState: input.gameState, propRenderer: this.props, px, py, zoom };
        ctx.save();
        clipToViewport(ctx, viewport);
        const visibleObjects = this.visibleDrawables;
        visibleObjects.length = 0;
        input.entityRegistry.forEachOfKind("worldProp", (prop) => {
            if (prop.isDead || prop.strategy?.renderMode !== "floor") return;
            if (!prop.aabb || !aabbOverlap(prop.aabb, bounds)) return;
            prop._distSq = (prop.x - px) ** 2 + (prop.y - py) ** 2;
            visibleObjects.push(prop);
        });
        visibleObjects.sort((a, b) => b._distSq - a._distSq);
        for (let i = 0; i < visibleObjects.length; i++) drawWorldProp(ctx, visibleObjects[i], viewport, drawContext);
        ctx.restore();
    }
    _appendVisible3dProps(input, viewport, px, py) {
        const visibleObjects = this.visibleDrawables;
        const props = input.entityRegistry.queryView(
            { bounds: viewport.boundsVisibleDefault, kinds: ["worldProp"], filterId: "3d", match: (p) => p.strategy?.renderMode === "3d" || p.usesKinematicsBody },
            input.spatialFrame,
        );
        for (let i = 0; i < props.length; i++) {
            const p = props[i];
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
        collectStaticGridWallDrawables(input.obstacleGrid, viewport, px, py, this.staticGridDrawables);
        collectStaticGridEdgeRailDrawables(input.obstacleGrid, viewport, px, py, this.staticGridEdgeRailDrawables);
        const visibleObjects = this.visibleDrawables;
        for (let i = 0; i < this.staticGridDrawables.length; i++) visibleObjects.push(this.staticGridDrawables[i]);
        for (let i = 0; i < this.staticGridEdgeRailDrawables.length; i++) visibleObjects.push(this.staticGridEdgeRailDrawables[i]);
    }
    draw3DBuildings(ctx, input, viewport, _walls, options = {}) {
        const skipWalls = options.skipWalls === true;
        const px = viewport.x;
        const py = viewport.y;
        const zoom = viewport.zoom ?? 1;
        const drawContext = { gameState: input.gameState, propRenderer: this.props, px, py, zoom };
        /** @type {WallDrawContext} */
        const wallCtx = {
            viewport,
            worldSurfaces: input.worldSurfaces,
            proceduralSurfaceDraw: input.proceduralSurfaceDraw,
            fillStyle: this.settings.floorShadow ?? "#12161c",
            wallHeight: 0,
            damageAlpha: 0,
            cacheObj: null,
            worldBounds: viewport.boundsDraw,
            camera: elevationCameraFromViewport(viewport, input.worldSurfaces.settings.cameraHeight),
        };
        ctx.save();
        clipToViewport(ctx, viewport);
        const visibleObjects = this.visibleDrawables;
        visibleObjects.length = 0;
        if (!skipWalls) this._appendVisibleStaticGridWalls(input, viewport, px, py);
        this._appendVisible3dProps(input, viewport, px, py);
        visibleObjects.sort((a, b) => b._distSq - a._distSq);
        for (let i = 0; i < visibleObjects.length; i++) {
            const obj = visibleObjects[i];
            if (obj.strategy || obj.usesKinematicsBody) drawWorldProp(ctx, obj, viewport, drawContext);
            else if (!skipWalls && obj.staticGridEdgeRail) {
                wallCtx.wallHeight = obj.wallHeight;
                wallCtx.wallBaseZ = obj.wallBaseZ;
                wallCtx.wallCapHeight = obj.wallCapHeight;
                wallCtx.cacheObj = obj;
                wallCtx.damageAlpha = 0;
                drawProjectedGridEdgeRail(ctx, obj, wallCtx);
            } else if (!skipWalls && obj.staticGrid) {
                wallCtx.wallHeight = obj.wallHeight;
                wallCtx.wallBaseZ = obj.wallBaseZ;
                wallCtx.wallCapHeight = obj.wallCapHeight;
                wallCtx.cacheObj = obj;
                wallCtx.damageAlpha = getStaticCellDamageAlphaAtIdx(input.obstacleGrid, input.gameState, obj.gridCol, obj.gridRow, obj.gridIdx);
                drawProjectedWallFace(ctx, obj.p1, obj.p2, wallCtx);
            }
        }
        ctx.restore();
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
}

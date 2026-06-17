/** @typedef {import("./WorldSceneTypes.js").WorldSceneDrawInput} WorldSceneDrawInput */
/** @typedef {import("./WorldSceneTypes.js").WorldSceneDrawOptions} WorldSceneDrawOptions */
/** @typedef {import("./Props3D/PropRenderer.js").PropDrawRecipe} PropDrawRecipe */
import { collectStaticGridEdgeRailDrawables, drawProjectedGridEdgeRail } from "./Structure3D/StaticGridEdgeRailDraw.js";
import { collectStaticGridWallDrawables } from "./Structure3D/StaticGridWallDraw.js";
import { drawProjectedWallFace } from "./Structure3D/ProjectedWallDraw.js";
/** @typedef {import("./Structure3D/WallDrawContext.js").WallDrawContext} WallDrawContext */
import { aabbOverlap } from "../Math/Aabb2D.js";
import { clipToViewport } from "./common/viewportUtils.js";
import { PropRenderer } from "./Props3D/PropRenderer.js";
import { drawWorldProp } from "./drawWorldProp.js";
import { drawFloorOccupancyBelts, drawFloorOccupancyPowerSources } from "../Sandbox/floorOccupancy.js";
import { elevationCameraFromViewportInto } from "../Spatial/iso/ElevationCamera.js";
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
        this.wallPassCamera = { viewerX: 0, viewerY: 0, cameraHeight: 0, strength: 0 };
        this.wallCtx = {
            viewport: null,
            worldSurfaces: null,
            proceduralSurfaceDraw: null,
            gameState: null,
            fillStyle: "",
            bleedPx: 0,
            wallHeight: 0,
            wallBaseZ: 0,
            wallCapHeight: 0,
            cacheObj: null,
            worldBounds: null,
            camera: this.wallPassCamera,
            skipWallCaps: false,
        };
        this.propDrawContext = { gameState: null, propRenderer: this.props, px: 0, py: 0, zoom: 1 };
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
        const drawContext = this.propDrawContext;
        drawContext.gameState = input.gameState;
        drawContext.px = px;
        drawContext.py = py;
        drawContext.zoom = zoom;
        ctx.save();
        clipToViewport(ctx, viewport);
        drawFloorOccupancyBelts(ctx, input.gameState, viewport, { px, py });
        drawFloorOccupancyPowerSources(ctx, input.gameState, viewport, { px, py });
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
    _bindWallDrawable(wallCtx, drawable) {
        wallCtx.wallHeight = drawable.wallHeight;
        wallCtx.wallBaseZ = drawable.wallBaseZ;
        wallCtx.wallCapHeight = drawable.wallCapHeight;
        wallCtx.cacheObj = drawable;
    }
    draw3DBuildings(ctx, input, viewport, options = {}) {
        const skipWalls = options.skipWalls === true;
        const skipWallCaps = options.skipWallCaps === true;
        const px = viewport.x;
        const py = viewport.y;
        const zoom = viewport.zoom ?? 1;
        elevationCameraFromViewportInto(this.wallPassCamera, viewport);
        const wallCtx = this.wallCtx;
        wallCtx.viewport = viewport;
        wallCtx.worldSurfaces = input.worldSurfaces;
        wallCtx.proceduralSurfaceDraw = input.proceduralSurfaceDraw;
        wallCtx.gameState = input.gameState;
        wallCtx.fillStyle = this.settings.floorShadow;
        wallCtx.bleedPx = this.settings.wallTextureBleedPx;
        wallCtx.worldBounds = viewport.boundsDraw;
        wallCtx.skipWallCaps = skipWallCaps;
        wallCtx.cacheObj = null;
        wallCtx.atlasFaceId = undefined;
        const drawContext = this.propDrawContext;
        drawContext.gameState = input.gameState;
        drawContext.px = px;
        drawContext.py = py;
        drawContext.zoom = zoom;
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
            else if (!skipWalls && obj.p1) {
                this._bindWallDrawable(wallCtx, obj);
                drawProjectedWallFace(ctx, obj.p1, obj.p2, wallCtx);
            } else if (!skipWalls && obj.innerP1x !== undefined) {
                this._bindWallDrawable(wallCtx, obj);
                drawProjectedGridEdgeRail(ctx, obj, wallCtx);
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

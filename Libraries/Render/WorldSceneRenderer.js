/** @typedef {import("./WorldSceneTypes.js").WorldSceneDrawInput} WorldSceneDrawInput */
/** @typedef {import("./WorldSceneTypes.js").WorldSceneDrawOptions} WorldSceneDrawOptions */
/** @typedef {import("./Props3D/PropRenderer.js").PropDrawRecipe} PropDrawRecipe */
import { collectStaticGridEdgeRailDrawables, drawProjectedGridEdgeRail } from "./Structure3D/StaticGridEdgeRailDraw.js";
import { collectStaticGridWallDrawables } from "./Structure3D/StaticGridWallDraw.js";
import { drawProjectedWallFace } from "./Structure3D/ProjectedWallDraw.js";
import { getGridWallDamageSession, resolveWallDamageTintRatioForDrawable } from "../Sandbox/gridWallDamage.js";
/** @typedef {import("./Structure3D/WallDrawContext.js").WallDrawContext} WallDrawContext */
import { PropRenderer } from "./Props3D/PropRenderer.js";
import { drawFloorOccupancyBelts, drawFloorOccupancyPowerSources } from "../Sandbox/gridStampDrawCache.js";
import { collectForcefieldEdgeDrawables, drawForcefieldEdgeProp } from "../Sandbox/drawForcefields.js";
import { queryPropsInView } from "../Sandbox/sandboxOverlayCommands.js";
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
        this.forcefieldEdgeDrawables = [];
        this.wallPassCamera = { viewerX: 0, viewerY: 0, cameraHeight: 0, strength: 0 };
        this.wallCtx = {
            viewport: null,
            worldSurfaces: null,
            proceduralSurfaceDraw: null,
            gameState: null,
            fillStyle: "",
            wallHeight: 0,
            wallBaseZ: 0,
            wallCapHeight: 0,
            cacheObj: null,
            worldBounds: null,
            camera: this.wallPassCamera,
            skipWallCaps: false,
            damageTintRatio: 0,
        };
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
        const props = queryPropsInView(input.entityRegistry, viewport, input.spatialFrame, { filterId: "debris", match: (p) => p.strategy?.renderMode === "debris" });
        for (let i = 0; i < props.length; i++) this.props.drawProp(ctx, props[i], px, py, zoom);
    }
    /**
     * @param {CanvasRenderingContext2D} ctx
     * @param {WorldSceneDrawInput} input
     * @param {import("../Viewport/Viewport.js").Viewport} viewport
     */
    drawFloorProps(ctx, input, viewport) {
        const px = viewport.x;
        const py = viewport.y;
        const zoom = viewport.zoom;
        drawFloorOccupancyBelts(ctx, input.gameState, viewport, px, py);
        drawFloorOccupancyPowerSources(ctx, input.gameState, viewport, px, py);
        const visibleObjects = this.visibleDrawables;
        visibleObjects.length = 0;
        const props = queryPropsInView(input.entityRegistry, viewport, input.spatialFrame, { hitTest: "aabb", filterId: "floor", match: (p) => p.strategy?.renderMode === "floor" });
        for (let i = 0; i < props.length; i++) {
            const prop = props[i];
            prop._distSq = (prop.x - px) ** 2 + (prop.y - py) ** 2;
            visibleObjects.push(prop);
        }
        visibleObjects.sort((a, b) => b._distSq - a._distSq);
        for (let i = 0; i < visibleObjects.length; i++) this.props.drawProp(ctx, visibleObjects[i], px, py, zoom);
    }
    _appendVisible3dProps(input, viewport, px, py) {
        const visibleObjects = this.visibleDrawables;
        const props = queryPropsInView(input.entityRegistry, viewport, input.spatialFrame, { filterId: "3d", match: (p) => p.strategy?.renderMode === "3d" });
        for (let i = 0; i < props.length; i++) {
            const p = props[i];
            p._distSq = (p.x - px) ** 2 + (p.y - py) ** 2;
            visibleObjects.push(p);
        }
    }
    _appendVisibleStaticGridWalls(input, viewport, px, py) {
        const wallDamageRevision = getGridWallDamageSession(input.gameState)?.damageRevision ?? 0;
        collectStaticGridWallDrawables(input.obstacleGrid, viewport, px, py, this.staticGridDrawables, wallDamageRevision);
        collectStaticGridEdgeRailDrawables(input.obstacleGrid, viewport, px, py, this.staticGridEdgeRailDrawables, wallDamageRevision);
        const visibleObjects = this.visibleDrawables;
        for (let i = 0; i < this.staticGridDrawables.length; i++) visibleObjects.push(this.staticGridDrawables[i]);
        for (let i = 0; i < this.staticGridEdgeRailDrawables.length; i++) visibleObjects.push(this.staticGridEdgeRailDrawables[i]);
    }
    _appendVisibleForcefieldEdges(input, viewport, px, py) {
        const grid = input.obstacleGrid;
        const gameState = input.gameState;
        if (!grid || !gameState) return;
        const drawables = this.forcefieldEdgeDrawables;
        drawables.length = 0;
        collectForcefieldEdgeDrawables(grid, gameState, viewport, px, py, drawables);
        const visibleObjects = this.visibleDrawables;
        for (let i = 0; i < drawables.length; i++) visibleObjects.push(drawables[i]);
    }
    _bindWallDrawable(wallCtx, drawable, gameState) {
        wallCtx.wallHeight = drawable.wallHeight;
        wallCtx.wallBaseZ = drawable.wallBaseZ;
        wallCtx.wallCapHeight = drawable.wallCapHeight;
        wallCtx.cacheObj = drawable;
        wallCtx.damageTintRatio = resolveWallDamageTintRatioForDrawable(getGridWallDamageSession(gameState), drawable);
    }
    draw3DBuildings(ctx, input, viewport, options = {}) {
        const px = viewport.x;
        const py = viewport.y;
        const zoom = viewport.zoom ?? 1;
        const visibleObjects = this.visibleDrawables;
        visibleObjects.length = 0;
        this._appendVisible3dProps(input, viewport, px, py);
        const skipWalls = options.skipWalls === true;
        if (!skipWalls) {
            elevationCameraFromViewportInto(this.wallPassCamera, viewport);
            const wallCtx = this.wallCtx;
            wallCtx.viewport = viewport;
            wallCtx.worldSurfaces = input.worldSurfaces;
            wallCtx.proceduralSurfaceDraw = input.proceduralSurfaceDraw;
            wallCtx.gameState = input.gameState;
            wallCtx.fillStyle = this.settings.floorShadow;
            wallCtx.worldBounds = viewport.bounds("chunks");
            wallCtx.skipWallCaps = options.skipWallCaps === true;
            wallCtx.cacheObj = null;
            wallCtx.atlasFaceId = undefined;
            this._appendVisibleStaticGridWalls(input, viewport, px, py);
        }
        this._appendVisibleForcefieldEdges(input, viewport, px, py);
        visibleObjects.sort((a, b) => b._distSq - a._distSq);
        for (let i = 0; i < visibleObjects.length; i++) {
            const obj = visibleObjects[i];
            if (obj.strategy) this.props.drawProp(ctx, obj, px, py, zoom);
            else if (obj._forcefield) drawForcefieldEdgeProp(ctx, obj, px, py);
            else if (obj.p1) {
                this._bindWallDrawable(this.wallCtx, obj, input.gameState);
                drawProjectedWallFace(ctx, obj.p1, obj.p2, this.wallCtx);
            } else if (obj.innerP1x !== undefined) {
                this._bindWallDrawable(this.wallCtx, obj, input.gameState);
                drawProjectedGridEdgeRail(ctx, obj, this.wallCtx);
            }
        }
    }
}

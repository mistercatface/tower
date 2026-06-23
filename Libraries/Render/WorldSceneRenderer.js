/** @typedef {import("./WorldSceneTypes.js").WorldSceneDrawInput} WorldSceneDrawInput */
/** @typedef {import("./WorldSceneTypes.js").WorldSceneDrawOptions} WorldSceneDrawOptions */
import { collectStaticGridEdgeRailDrawables, drawProjectedGridEdgeRail } from "./Structure3D/StaticGridEdgeRailDraw.js";
import { collectStaticGridWallDrawables } from "./Structure3D/StaticGridWallDraw.js";
import { drawProjectedWallFace } from "./Structure3D/ProjectedWallDraw.js";
import { getGridWallDamageSession, resolveWallDamageTintRatioForDrawable } from "../Sandbox/gridWallDamage.js";
import { drawCachedPropSprite } from "../Canvas/QuantizedSpriteCache.js";
import { worldPropRecipes } from "../Props/PropCatalog.js";
import { drawFloorOccupancyBelts, drawFloorOccupancyPowerSources, collectForcefieldEdgeDrawables, drawForcefieldEdgeProp } from "../Sandbox/gridStampDrawCache.js";
import { queryPropsInView } from "../Sandbox/sandboxOverlayCommands.js";
function bindWallFaceScratch(scratch, drawable, gameState) {
    scratch.wallHeight = drawable.wallHeight;
    scratch.wallBaseZ = drawable.wallBaseZ;
    scratch.wallCapHeight = drawable.wallCapHeight;
    scratch.cacheObj = drawable;
    scratch.atlasFaceId = undefined;
    scratch.damageTintRatio = resolveWallDamageTintRatioForDrawable(getGridWallDamageSession(gameState), drawable);
}
export class WorldSceneRenderer {
    constructor() {
        this.visibleDrawables = [];
        this.staticGridDrawables = [];
        this.staticGridEdgeRailDrawables = [];
        this.forcefieldEdgeDrawables = [];
        this.wallFaceScratch = { wallHeight: 0, wallBaseZ: 0, wallCapHeight: 0, cacheObj: null, atlasFaceId: undefined, damageTintRatio: 0 };
    }
    drawDebrisProps(ctx, input, viewport, options = {}) {
        const props = queryPropsInView(input.entityRegistry, viewport, input.spatialFrame, { filterId: "debris", match: (p) => p.strategy?.renderMode === "debris" });
        for (let i = 0; i < props.length; i++) this._drawProp(ctx, props[i], viewport);
    }
    drawFloorProps(ctx, input, viewport) {
        drawFloorOccupancyBelts(ctx, input.gameState, viewport);
        drawFloorOccupancyPowerSources(ctx, input.gameState, viewport);
        const visibleObjects = this.visibleDrawables;
        visibleObjects.length = 0;
        const props = queryPropsInView(input.entityRegistry, viewport, input.spatialFrame, { hitTest: "aabb", filterId: "floor", match: (p) => p.strategy?.renderMode === "floor" });
        for (let i = 0; i < props.length; i++) {
            const prop = props[i];
            prop._distSq = (prop.x - viewport.x) ** 2 + (prop.y - viewport.y) ** 2;
            visibleObjects.push(prop);
        }
        visibleObjects.sort((a, b) => b._distSq - a._distSq);
        for (let i = 0; i < visibleObjects.length; i++) this._drawProp(ctx, visibleObjects[i], viewport);
    }
    _appendVisible3dProps(input, viewport) {
        const visibleObjects = this.visibleDrawables;
        const props = queryPropsInView(input.entityRegistry, viewport, input.spatialFrame, { filterId: "3d", match: (p) => p.strategy?.renderMode === "3d" });
        for (let i = 0; i < props.length; i++) {
            const p = props[i];
            p._distSq = (p.x - viewport.x) ** 2 + (p.y - viewport.y) ** 2;
            visibleObjects.push(p);
        }
    }
    _appendVisibleStaticGridWalls(input, viewport) {
        const wallDamageRevision = getGridWallDamageSession(input.gameState)?.damageRevision ?? 0;
        collectStaticGridWallDrawables(input.obstacleGrid, viewport, this.staticGridDrawables, wallDamageRevision);
        collectStaticGridEdgeRailDrawables(input.obstacleGrid, viewport, this.staticGridEdgeRailDrawables, wallDamageRevision);
        const visibleObjects = this.visibleDrawables;
        for (let i = 0; i < this.staticGridDrawables.length; i++) visibleObjects.push(this.staticGridDrawables[i]);
        for (let i = 0; i < this.staticGridEdgeRailDrawables.length; i++) visibleObjects.push(this.staticGridEdgeRailDrawables[i]);
    }
    _appendVisibleForcefieldEdges(input, viewport) {
        const grid = input.obstacleGrid;
        const gameState = input.gameState;
        if (!grid || !gameState) return;
        const drawables = this.forcefieldEdgeDrawables;
        drawables.length = 0;
        collectForcefieldEdgeDrawables(grid, gameState, viewport, drawables);
        const visibleObjects = this.visibleDrawables;
        for (let i = 0; i < drawables.length; i++) visibleObjects.push(drawables[i]);
    }
    draw3DBuildings(ctx, input, viewport, options = {}) {
        const visibleObjects = this.visibleDrawables;
        const face = this.wallFaceScratch;
        visibleObjects.length = 0;
        this._appendVisible3dProps(input, viewport);
        const skipWalls = options.skipWalls === true;
        const skipWallCaps = options.skipWallCaps === true;
        if (!skipWalls) this._appendVisibleStaticGridWalls(input, viewport);
        this._appendVisibleForcefieldEdges(input, viewport);
        visibleObjects.sort((a, b) => b._distSq - a._distSq);
        for (let i = 0; i < visibleObjects.length; i++) {
            const obj = visibleObjects[i];
            if (obj.strategy) this._drawProp(ctx, obj, viewport);
            else if (obj._forcefield) drawForcefieldEdgeProp(ctx, obj, viewport);
            else if (obj.p1) {
                bindWallFaceScratch(face, obj, input.gameState);
                drawProjectedWallFace(ctx, obj.p1, obj.p2, viewport, input, face);
            } else if (obj.innerP1x !== undefined) {
                bindWallFaceScratch(face, obj, input.gameState);
                drawProjectedGridEdgeRail(ctx, obj, viewport, input, face, skipWallCaps);
            }
        }
    }
    _drawProp(ctx, prop, viewport) {
        const renderKey = prop.getRender3DKey?.() ?? prop.strategy?.render3DKey;
        const draw = worldPropRecipes[renderKey];
        if (!draw) return;
        drawCachedPropSprite(ctx, prop, viewport, renderKey, draw);
    }
}

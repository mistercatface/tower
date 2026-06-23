/** @typedef {import("./WorldSceneTypes.js").WorldSceneDrawOptions} WorldSceneDrawOptions */
import { collectStaticGridEdgeRailDrawables, drawProjectedGridEdgeRail } from "./Structure3D/StaticGridEdgeRailDraw.js";
import { collectStaticGridWallDrawables } from "./Structure3D/StaticGridWallDraw.js";
import { drawProjectedWallFace } from "./Structure3D/ProjectedWallDraw.js";
import { getGridWallDamageSession, resolveWallDamageTintRatioForDrawable } from "../Sandbox/gridWallDamage.js";
import { drawCachedPropSprite } from "../Canvas/QuantizedSpriteCache.js";
import propCatalog from "../../Assets/props/index.js";
import { drawFloorOccupancyBelts, drawFloorOccupancyPowerSources, collectForcefieldEdgeDrawables, drawForcefieldEdgeProp } from "../Sandbox/gridStampDrawCache.js";
import { queryPropsInView } from "../Sandbox/sandboxOverlayCommands.js";
import { kineticSpatial } from "../../Systems/World/KineticSpatialFrame.js";
function bindWallFaceScratch(scratch, drawable, state) {
    scratch.wallHeight = drawable.wallHeight;
    scratch.wallBaseZ = drawable.wallBaseZ;
    scratch.wallCapHeight = drawable.wallCapHeight;
    scratch.cacheObj = drawable;
    scratch.atlasFaceId = undefined;
    scratch.damageTintRatio = resolveWallDamageTintRatioForDrawable(getGridWallDamageSession(state), drawable);
}
export class WorldSceneRenderer {
    constructor() {
        this.visibleDrawables = [];
        this.staticGridDrawables = [];
        this.staticGridEdgeRailDrawables = [];
        this.forcefieldEdgeDrawables = [];
        this.wallFaceScratch = { wallHeight: 0, wallBaseZ: 0, wallCapHeight: 0, cacheObj: null, atlasFaceId: undefined, damageTintRatio: 0 };
    }
    drawDebrisProps(ctx, state, viewport, options = {}) {
        const props = queryPropsInView(state.entityRegistry, viewport, kineticSpatial, { filterId: "debris", match: (p) => p.strategy?.renderMode === "debris" });
        for (let i = 0; i < props.length; i++) this._drawProp(ctx, props[i], viewport);
    }
    drawFloorProps(ctx, state, viewport) {
        drawFloorOccupancyBelts(ctx, state, viewport);
        drawFloorOccupancyPowerSources(ctx, state, viewport);
        const visibleObjects = this.visibleDrawables;
        visibleObjects.length = 0;
        const props = queryPropsInView(state.entityRegistry, viewport, kineticSpatial, { hitTest: "aabb", filterId: "floor", match: (p) => p.strategy?.renderMode === "floor" });
        for (let i = 0; i < props.length; i++) {
            const prop = props[i];
            prop._distSq = (prop.x - viewport.x) ** 2 + (prop.y - viewport.y) ** 2;
            visibleObjects.push(prop);
        }
        visibleObjects.sort((a, b) => b._distSq - a._distSq);
        for (let i = 0; i < visibleObjects.length; i++) this._drawProp(ctx, visibleObjects[i], viewport);
    }
    _appendVisible3dProps(state, viewport) {
        const visibleObjects = this.visibleDrawables;
        const props = queryPropsInView(state.entityRegistry, viewport, kineticSpatial, { filterId: "3d", match: (p) => p.strategy?.renderMode === "3d" });
        for (let i = 0; i < props.length; i++) {
            const p = props[i];
            p._distSq = (p.x - viewport.x) ** 2 + (p.y - viewport.y) ** 2;
            visibleObjects.push(p);
        }
    }
    _appendVisibleStaticGridWalls(state, viewport) {
        const wallDamageRevision = getGridWallDamageSession(state)?.damageRevision ?? 0;
        collectStaticGridWallDrawables(state.obstacleGrid, viewport, this.staticGridDrawables, wallDamageRevision);
        collectStaticGridEdgeRailDrawables(state.obstacleGrid, viewport, this.staticGridEdgeRailDrawables, wallDamageRevision);
        const visibleObjects = this.visibleDrawables;
        for (let i = 0; i < this.staticGridDrawables.length; i++) visibleObjects.push(this.staticGridDrawables[i]);
        for (let i = 0; i < this.staticGridEdgeRailDrawables.length; i++) visibleObjects.push(this.staticGridEdgeRailDrawables[i]);
    }
    _appendVisibleForcefieldEdges(state, viewport) {
        const grid = state.obstacleGrid;
        if (!grid || !state.sandbox) return;
        const drawables = this.forcefieldEdgeDrawables;
        drawables.length = 0;
        collectForcefieldEdgeDrawables(grid, state, viewport, drawables);
        const visibleObjects = this.visibleDrawables;
        for (let i = 0; i < drawables.length; i++) visibleObjects.push(drawables[i]);
    }
    draw3DBuildings(ctx, state, viewport, options = {}) {
        const visibleObjects = this.visibleDrawables;
        const face = this.wallFaceScratch;
        visibleObjects.length = 0;
        this._appendVisible3dProps(state, viewport);
        const skipWalls = options.skipWalls === true;
        const skipWallCaps = options.skipWallCaps === true;
        if (!skipWalls) this._appendVisibleStaticGridWalls(state, viewport);
        this._appendVisibleForcefieldEdges(state, viewport);
        visibleObjects.sort((a, b) => b._distSq - a._distSq);
        for (let i = 0; i < visibleObjects.length; i++) {
            const obj = visibleObjects[i];
            if (obj.strategy) this._drawProp(ctx, obj, viewport);
            else if (obj._forcefield) drawForcefieldEdgeProp(ctx, obj, viewport);
            else if (obj.p1) {
                bindWallFaceScratch(face, obj, state);
                drawProjectedWallFace(ctx, obj.p1, obj.p2, viewport, state, face);
            } else if (obj.innerP1x !== undefined) {
                bindWallFaceScratch(face, obj, state);
                drawProjectedGridEdgeRail(ctx, obj, viewport, state, face, skipWallCaps);
            }
        }
    }
    _drawProp(ctx, prop, viewport) {
        const renderKey = prop.getRender3DKey?.() ?? prop.strategy?.render3DKey;
        const draw = propCatalog[renderKey]?.drawRecipe;
        if (!draw) return;
        drawCachedPropSprite(ctx, prop, viewport, renderKey, draw);
    }
}

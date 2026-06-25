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
const matchDebris = (p) => p.strategy?.renderMode === "debris";
const DEBRIS_QUERY_OPTIONS = { filterId: "debris", match: matchDebris };
const matchFloor = (p) => p.strategy?.renderMode === "floor";
const FLOOR_QUERY_OPTIONS = { hitTest: "aabb", filterId: "floor", match: matchFloor };
const match3d = (p) => p.strategy?.renderMode === "3d";
const THREE_D_QUERY_OPTIONS = { filterId: "3d", match: match3d };
function parallelInsertionSort(drawables, depths, start, end) {
    for (let i = start + 1; i <= end; i++) {
        const keyDrawable = drawables[i];
        const keyDepth = depths[i];
        let j = i - 1;
        while (j >= start && depths[j] < keyDepth) {
            drawables[j + 1] = drawables[j];
            depths[j + 1] = depths[j];
            j--;
        }
        drawables[j + 1] = keyDrawable;
        depths[j + 1] = keyDepth;
    }
}
function heapify(drawables, depths, n, i) {
    let root = i;
    while (true) {
        let smallest = root;
        const left = 2 * root + 1;
        const right = 2 * root + 2;
        if (left < n && depths[left] < depths[smallest]) smallest = left;
        if (right < n && depths[right] < depths[smallest]) smallest = right;
        if (smallest === root) break;
        const tempD = drawables[root];
        drawables[root] = drawables[smallest];
        drawables[smallest] = tempD;
        const tempDepth = depths[root];
        depths[root] = depths[smallest];
        depths[smallest] = tempDepth;
        root = smallest;
    }
}
function parallelHeapSort(drawables, depths, n) {
    for (let i = Math.floor(n / 2) - 1; i >= 0; i--) heapify(drawables, depths, n, i);
    for (let i = n - 1; i > 0; i--) {
        const tempD = drawables[0];
        drawables[0] = drawables[i];
        drawables[i] = tempD;
        const tempDepth = depths[0];
        depths[0] = depths[i];
        depths[i] = tempDepth;
        heapify(drawables, depths, i, 0);
    }
}
function parallelSort(drawables, depths) {
    const n = drawables.length;
    if (n <= 1) return;
    if (n <= 32) parallelInsertionSort(drawables, depths, 0, n - 1);
    else parallelHeapSort(drawables, depths, n);
}
export class WorldSceneRenderer {
    constructor() {
        this.visibleDrawables = [];
        this.visibleDrawableDepths = [];
        this.staticGridDrawables = [];
        this.staticGridEdgeRailDrawables = [];
        this.forcefieldEdgeDrawables = [];
        this.wallFaceScratch = { wallHeight: 0, wallBaseZ: 0, wallCapHeight: 0, cacheObj: null, atlasFaceId: undefined, damageTintRatio: 0 };
    }
    _appendDrawable(drawable, distSq) {
        this.visibleDrawables.push(drawable);
        this.visibleDrawableDepths.push(distSq);
    }
    drawDebrisProps(ctx, state, viewport, options = {}) {
        const props = queryPropsInView(state.entityRegistry, viewport, kineticSpatial, DEBRIS_QUERY_OPTIONS);
        for (let i = 0; i < props.length; i++) this._drawProp(ctx, props[i], viewport);
    }
    drawFloorProps(ctx, state, viewport) {
        drawFloorOccupancyBelts(ctx, state, viewport);
        drawFloorOccupancyPowerSources(ctx, state, viewport);
        const visibleObjects = this.visibleDrawables;
        visibleObjects.length = 0;
        this.visibleDrawableDepths.length = 0;
        const props = queryPropsInView(state.entityRegistry, viewport, kineticSpatial, FLOOR_QUERY_OPTIONS);
        for (let i = 0; i < props.length; i++) {
            const prop = props[i];
            const distSq = (prop.x - viewport.x) ** 2 + (prop.y - viewport.y) ** 2;
            this._appendDrawable(prop, distSq);
        }
        parallelSort(visibleObjects, this.visibleDrawableDepths);
        for (let i = 0; i < visibleObjects.length; i++) this._drawProp(ctx, visibleObjects[i], viewport);
    }
    _appendVisible3dProps(state, viewport) {
        const props = queryPropsInView(state.entityRegistry, viewport, kineticSpatial, THREE_D_QUERY_OPTIONS);
        for (let i = 0; i < props.length; i++) {
            const p = props[i];
            const distSq = (p.x - viewport.x) ** 2 + (p.y - viewport.y) ** 2;
            this._appendDrawable(p, distSq);
        }
    }
    _appendVisibleStaticGridWalls(state, viewport) {
        const wallDamageRevision = getGridWallDamageSession(state)?.damageRevision ?? 0;
        collectStaticGridWallDrawables(state.obstacleGrid, viewport, this.staticGridDrawables, wallDamageRevision);
        collectStaticGridEdgeRailDrawables(state.obstacleGrid, viewport, this.staticGridEdgeRailDrawables, wallDamageRevision);
        for (let i = 0; i < this.staticGridDrawables.length; i++) {
            const d = this.staticGridDrawables[i];
            this._appendDrawable(d, d._distSq);
        }
        for (let i = 0; i < this.staticGridEdgeRailDrawables.length; i++) {
            const d = this.staticGridEdgeRailDrawables[i];
            this._appendDrawable(d, d._distSq);
        }
    }
    _appendVisibleForcefieldEdges(state, viewport) {
        const grid = state.obstacleGrid;
        if (!grid || !state.sandbox) return;
        const drawables = this.forcefieldEdgeDrawables;
        drawables.length = 0;
        collectForcefieldEdgeDrawables(grid, state, viewport, drawables);
        for (let i = 0; i < drawables.length; i++) {
            const d = drawables[i];
            this._appendDrawable(d, d._distSq);
        }
    }
    draw3DBuildings(ctx, state, viewport, options = {}) {
        const visibleObjects = this.visibleDrawables;
        const face = this.wallFaceScratch;
        visibleObjects.length = 0;
        this.visibleDrawableDepths.length = 0;
        this._appendVisible3dProps(state, viewport);
        const skipWalls = options.skipWalls === true;
        const skipWallCaps = options.skipWallCaps === true;
        if (!skipWalls) this._appendVisibleStaticGridWalls(state, viewport);
        this._appendVisibleForcefieldEdges(state, viewport);
        parallelSort(visibleObjects, this.visibleDrawableDepths);
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

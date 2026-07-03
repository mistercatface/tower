/** @typedef {import("./WorldSceneTypes.js").WorldSceneDrawOptions} WorldSceneDrawOptions */
import { collectStaticGridEdgeRailDrawables, drawProjectedGridEdgeRailFlat, getRailWallBoxData } from "./Structure3D/StaticGridEdgeRailDraw.js";
import { collectStaticGridWallDrawables, drawProjectedVoxelWallFaceFlat, getVoxelWallFaceData } from "./Structure3D/StaticGridWallDraw.js";
import { drawCachedPropSprite } from "../Canvas/QuantizedSpriteCache.js";
import { RAIL_BOX, VOXEL_FACE } from "../World/wallGridBake.js";
import { drawFlatWallChunkProp } from "./Props3D/SolidDraw.js";
import propCatalog from "../../Assets/props/index.js";
import { VisibleDrawQueue, DRAW_KIND_PROP, DRAW_KIND_FORCEFIELD, DRAW_KIND_VOXEL, DRAW_KIND_RAIL } from "./Structure3D/VisibleDrawQueue.js";
function drawProjectile(ctx, prop, viewport) {
    const length = 1.0;
    const width = 0.6;
    let mainColor = "#00f0ff";
    let glowColor = "rgba(0, 240, 255, 0.4)";
    if (prop.faction === "charlie") {
        mainColor = "#ffd700";
        glowColor = "rgba(255, 215, 0, 0.5)";
    } else if (prop.faction === "delta") {
        mainColor = "#00ff88";
        glowColor = "rgba(0, 255, 136, 0.5)";
    } else if (prop.faction === "echo") {
        mainColor = "#ff5500";
        glowColor = "rgba(255, 85, 0, 0.5)";
    }
    ctx.save();
    ctx.translate(prop.x, prop.y);
    ctx.rotate(prop.facing ?? 0);
    // Draw outer glowing capsule trail
    ctx.beginPath();
    ctx.ellipse(0, 0, length * 1.5, width * 2.5, 0, 0, Math.PI * 2);
    const glowGrad = ctx.createLinearGradient(-length * 1.5, 0, length * 1.5, 0);
    glowGrad.addColorStop(0, "rgba(255, 255, 255, 0)");
    glowGrad.addColorStop(0.3, glowColor);
    glowGrad.addColorStop(0.7, glowColor);
    glowGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = glowGrad;
    ctx.fill();
    // Draw main laser capsule body
    ctx.beginPath();
    ctx.ellipse(0, 0, length, width, 0, 0, Math.PI * 2);
    const bodyGrad = ctx.createLinearGradient(-length, 0, length, 0);
    bodyGrad.addColorStop(0, "rgba(255, 255, 255, 0.2)");
    bodyGrad.addColorStop(0.5, mainColor);
    bodyGrad.addColorStop(0.8, mainColor);
    bodyGrad.addColorStop(1, "#ffffff");
    ctx.fillStyle = bodyGrad;
    ctx.fill();
    // Draw inner white-hot core
    ctx.beginPath();
    ctx.ellipse(length * 0.2, 0, length * 0.5, width * 0.4, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.restore();
}
import { drawFloorOccupancyBelts, drawFloorOccupancyPowerSources, collectForcefieldEdgeDrawables, drawForcefieldEdgeProp } from "../Sandbox/gridStampDrawCache.js";
import { queryPropsInView } from "../Sandbox/sandboxOverlayCommands.js";
import { kineticSpatial } from "../../Systems/World/KineticSpatialFrame.js";
const matchDebris = (p) => p.strategy?.renderMode === "debris";
const DEBRIS_QUERY_OPTIONS = { filterId: "debris", match: matchDebris };
const matchFloor = (p) => p.strategy?.renderMode === "floor";
const FLOOR_QUERY_OPTIONS = { hitTest: "aabb", filterId: "floor", match: matchFloor };
const match3d = (p) => p.strategy?.renderMode === "3d";
const THREE_D_QUERY_OPTIONS = { filterId: "3d", match: match3d };
function bindWallFaceScratchFlat(scratch, kind, baseIndex) {
    scratch.atlasFaceId = undefined;
    if (kind === DRAW_KIND_RAIL) {
        const d = getRailWallBoxData();
        const b = baseIndex;
        scratch.wallHeight = d[b + RAIL_BOX.wallHeight];
        scratch.wallBaseZ = d[b + RAIL_BOX.wallBaseZ];
        scratch.wallCapHeight = d[b + RAIL_BOX.wallCapHeight];
        scratch.cacheObj = null;
        scratch.gridCol = d[b + RAIL_BOX.gridCol];
        scratch.gridRow = d[b + RAIL_BOX.gridRow];
        scratch.gridSide = d[b + RAIL_BOX.gridSide];
        scratch.gridIdx = d[b + RAIL_BOX.gridIdx];
        scratch.isEdgeRail = true;
    } else if (kind === DRAW_KIND_VOXEL) {
        const d = getVoxelWallFaceData();
        const b = baseIndex;
        scratch.wallHeight = d[b + VOXEL_FACE.wallHeight];
        scratch.wallBaseZ = d[b + VOXEL_FACE.wallBaseZ];
        scratch.wallCapHeight = d[b + VOXEL_FACE.wallCapHeight];
        scratch.cacheObj = null;
        scratch.gridCol = d[b + VOXEL_FACE.gridCol];
        scratch.gridRow = d[b + VOXEL_FACE.gridRow];
        scratch.gridSide = d[b + VOXEL_FACE.gridSide];
        scratch.gridIdx = d[b + VOXEL_FACE.gridIdx];
        scratch.isEdgeRail = false;
    }
}
function prepareWallChunkPropTextures(state, prop) {
    if (!prop.wallChunkProfileId || !state?.worldSurfaces) return;
    const textures = state.worldSurfaces.ensureWallChunkProfileTextures(state, prop.wallChunkProfileId, prop.wallChunkHeightPx);
    prop._wallChunkTextures = textures;
    prop._wallChunkTextureReady = !!textures.ready;
}
// Removed parallel sort (now in VisibleDrawQueue.js)
export class WorldSceneRenderer {
    constructor() {
        this.visibleDrawQueue = new VisibleDrawQueue();
        this.wallFaceScratch = { wallHeight: 0, wallBaseZ: 0, wallCapHeight: 0, cacheObj: null, atlasFaceId: undefined, gridCol: 0, gridRow: 0, gridSide: 0, gridIdx: 0, isEdgeRail: false };
    }
    drawDebrisProps(ctx, state, viewport, options = {}) {
        const props = queryPropsInView(state.entityRegistry, viewport, kineticSpatial, DEBRIS_QUERY_OPTIONS);
        for (let i = 0; i < props.length; i++) this._drawProp(ctx, props[i], viewport);
    }
    drawFloorProps(ctx, state, viewport) {
        drawFloorOccupancyBelts(ctx, state, viewport);
        drawFloorOccupancyPowerSources(ctx, state, viewport);
        const q = this.visibleDrawQueue;
        q.clear();
        const props = queryPropsInView(state.entityRegistry, viewport, kineticSpatial, FLOOR_QUERY_OPTIONS);
        for (let i = 0; i < props.length; i++) {
            const prop = props[i];
            const distSq = (prop.x - viewport.x) ** 2 + (prop.y - viewport.y) ** 2;
            q.push(DRAW_KIND_PROP, 0, prop, distSq);
        }
        q.sort();
        for (let i = 0; i < q.length; i++) this._drawProp(ctx, q.refs[i], viewport);
    }
    _appendVisible3dProps(state, viewport) {
        const props = queryPropsInView(state.entityRegistry, viewport, kineticSpatial, THREE_D_QUERY_OPTIONS);
        for (let i = 0; i < props.length; i++) {
            const p = props[i];
            const distSq = (p.x - viewport.x) ** 2 + (p.y - viewport.y) ** 2;
            this.visibleDrawQueue.push(DRAW_KIND_PROP, 0, p, distSq);
        }
    }
    _appendVisibleStaticGridWalls(state, viewport) {
        collectStaticGridWallDrawables(state.obstacleGrid, viewport, this.visibleDrawQueue);
        collectStaticGridEdgeRailDrawables(state.obstacleGrid, viewport, this.visibleDrawQueue);
    }
    _appendVisibleForcefieldEdges(state, viewport) {
        if (!state.obstacleGrid || !state.sandbox) return;
        collectForcefieldEdgeDrawables(state.obstacleGrid, state, viewport, this.visibleDrawQueue);
    }
    draw3DBuildings(ctx, state, viewport, options = {}) {
        const q = this.visibleDrawQueue;
        const face = this.wallFaceScratch;
        q.clear();
        this._appendVisible3dProps(state, viewport);
        const projectiles = state.projectiles || [];
        for (let i = 0; i < projectiles.length; i++) {
            const proj = projectiles[i];
            if (viewport.circleInBounds(proj.x, proj.y, proj.radius, "props")) {
                const distSq = (proj.x - viewport.x) ** 2 + (proj.y - viewport.y) ** 2;
                q.push(DRAW_KIND_PROP, 0, proj, distSq);
            }
        }
        const skipWalls = options.skipWalls === true;
        const skipWallCaps = options.skipWallCaps === true;
        if (!skipWalls) this._appendVisibleStaticGridWalls(state, viewport);
        this._appendVisibleForcefieldEdges(state, viewport);
        q.sort();
        const flatWallChunks = options.flatWallChunks === true;
        for (let i = 0; i < q.length; i++) {
            const kind = q.kinds[i];
            const baseIndex = q.baseIndices[i];
            const ref = q.refs[i];
            if (kind === DRAW_KIND_PROP) this._drawProp(ctx, ref, viewport, state, { flatWallChunks });
            else if (kind === DRAW_KIND_FORCEFIELD) drawForcefieldEdgeProp(ctx, ref, viewport);
            else if (kind === DRAW_KIND_VOXEL) {
                bindWallFaceScratchFlat(face, DRAW_KIND_VOXEL, baseIndex);
                drawProjectedVoxelWallFaceFlat(ctx, baseIndex, viewport, state, face);
            } else if (kind === DRAW_KIND_RAIL) {
                bindWallFaceScratchFlat(face, DRAW_KIND_RAIL, baseIndex);
                drawProjectedGridEdgeRailFlat(ctx, baseIndex, viewport, state, face, skipWallCaps);
            }
        }
    }
    _drawProp(ctx, prop, viewport, state, options = {}) {
        const hasAlpha = prop.alpha !== undefined && prop.alpha !== 1;
        const prevAlpha = ctx.globalAlpha;
        if (hasAlpha) ctx.globalAlpha = prevAlpha * prop.alpha;
        try {
            if (prop._gunBullet) {
                drawCachedPropSprite(ctx, prop, viewport, "projectile_bullet", drawProjectile);
                return;
            }
            const renderKey = prop.getRender3DKey?.() ?? prop.strategy?.render3DKey;
            const draw = propCatalog[renderKey]?.drawRecipe;
            if (!draw) return;
            prepareWallChunkPropTextures(state, prop);
            if (options.flatWallChunks && drawFlatWallChunkProp(ctx, prop)) return;
            drawCachedPropSprite(ctx, prop, viewport, renderKey, draw);
        } finally {
            if (hasAlpha) ctx.globalAlpha = prevAlpha;
        }
    }
}

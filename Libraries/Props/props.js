import { removeWorldPropFromState } from "../../GameState/EntityRegistry.js";
import { writeLivePolygon, releaseLivePolygon, CircleShape, markBroadphaseDirty, stampKineticBodyFromEntity, wakeKineticBody, readEntityFacing, applyVelocityDamping, integratePropMotion, isKinematicallyActive, kineticInertiaFromBody, normalizeKineticBody, quantizeBodyRollQuatF32, packRollOrientId, applyCompoundFootprint, stampPrimitivePhysics, primitivePhysicsRow, primitiveDragFriction } from "../Physics/physics.js";
import { entityX, entityY, entityVx, entityVy, entityW, entityFacing, entityRollQw, entityRollQx, entityRollQy, entityRollQz, entityAgeMs, kineticDynamicSlab } from "../../Core/engineMemory.js";
import { SHAPE_TYPE_CIRCLE, SHAPE_TYPE_POLYGON } from "../../Core/engineEnums.js";
import { ensureFlatVerts, quantizeAngleIndex, convexFootprintHalfExtents, vertCount, quantizeAngle, rotateXYIntoF32, CARDINAL_FACING_STEPS, rotateAngleTowards, deterministicUnitRandom, polygonIsConvex } from "../Math/math.js";
import { ENGINE_F32, M_VEC_A, M_OUT_QW, M_OUT_QX, M_OUT_QY, M_OUT_QZ } from "../../Core/engineMemory.js";
import { drawSphere, drawFlatSphereDisc, createWallChunkDraw, getWallChunkSpriteCacheKey, DEFAULT_PROP_HEIGHT } from "../Render/render.js";
import { drawFloorOccupancyBelts } from "../Spatial/belts.js";
import { drawFloorPortals } from "../Spatial/portals.js";
import { visualOverrideCacheId } from "../Color/visualOverride.js";
import { transitionEntity } from "../FSM/transition.js";
import propCatalog from "../../Assets/props/index.js";
import { gridSettings } from "../../Config/world.js";
import { SURFACE_PROFILE_ID } from "../../Config/procedural/profileIds.js";
import { PROP_PRIMITIVE_SPHERE, PROP_PRIMITIVE_POLYGON, PROP_PRIMITIVE_COUNT, PROP_DRAW_WALL_CHUNK, PROP_RENDER_MODE_NONE, PROP_RENDER_MODE_3D, ATTACH_HEADING_VELOCITY, ATTACH_OFFSET_PARENT_RADIUS } from "../../Core/engineEnums.js";
/** @typedef {typeof LIBRARY_PROP_QUANTIZE_STEPS} LibraryPropQuantizeSteps */
/** Crate-sized facing baseline (16 steps); larger footprints scale up in resolvePropQuantizeSteps. Optional overrides: strategy.quantizeSteps, gameDefinition.propQuantizeSteps. */
export const LIBRARY_PROP_QUANTIZE_STEPS = { facing: 16, view: 30 };
export const propQuantizeSteps = structuredClone(LIBRARY_PROP_QUANTIZE_STEPS);
export const WALL_CHUNK_PROP_HEIGHT = 12;
export function resolveAssetPropHeight(asset) {
    if (asset?.draw === PROP_DRAW_WALL_CHUNK) return WALL_CHUNK_PROP_HEIGHT;
    if (asset?.primitive === PROP_PRIMITIVE_POLYGON) return gridSettings.cellSize;
    return DEFAULT_PROP_HEIGHT;
}
export function formatPropTypeLabel(typeId) {
    return (typeId ?? "prop").replace(/_/g, " ");
}
export function formatSandboxSpawnLabel(propId) {
    const asset = propCatalog[propId];
    return asset?.sandbox?.spawnLabel ?? formatPropTypeLabel(propId);
}
const POLYGON_SCALE_SCRATCH = new Float32Array(1024);
export function createSpherePrimitive() {
    return (ctx, prop, viewport, flatPresentation) => {
        if (flatPresentation) {
            drawFlatSphereDisc(ctx, prop, prop.radius);
            return;
        }
        drawSphere(ctx, prop, viewport);
    };
}
function stampSurfaceProfileFields(prop, asset) {
    if (!assetUsesWallChunkSurface(asset)) return;
    prop.wallChunkProfileId = asset.visuals?.surfaceProfileId ?? SURFACE_PROFILE_ID.poolTableFelt;
    prop.wallChunkHeightPx = prop.height;
}
function assetUsesWallChunkSurface(asset) {
    return asset?.primitive === PROP_PRIMITIVE_POLYGON || asset?.primitive === PROP_PRIMITIVE_SPHERE;
}
export const PROP_PRIMITIVE_BUILDERS = [];
PROP_PRIMITIVE_BUILDERS[PROP_PRIMITIVE_SPHERE] = createSpherePrimitive;
PROP_PRIMITIVE_BUILDERS[PROP_PRIMITIVE_POLYGON] = createWallChunkDraw;
if (PROP_PRIMITIVE_BUILDERS.length !== PROP_PRIMITIVE_COUNT || !PROP_PRIMITIVE_BUILDERS[PROP_PRIMITIVE_SPHERE] || !PROP_PRIMITIVE_BUILDERS[PROP_PRIMITIVE_POLYGON]) throw new Error("PROP_PRIMITIVE_BUILDERS incomplete relative to PROP_PRIMITIVE_COUNT");
export function getPolygonPropBoundingRadius(prop) {
    return prop.radius;
}
export function scalePolygonPropFootprint(prop, scale) {
    if (scale <= 0) throw new Error(`Polygon prop scale must be > 0, got ${scale}`);
    const shape = prop.shape;
    if (shape.shapeTypeId !== SHAPE_TYPE_POLYGON) throw new Error(`scalePolygonPropFootprint requires a polygon prop, got shapeTypeId=${shape?.shapeTypeId}`);
    const n = shape.vertices.length;
    const verts = shape.vertices;
    for (let i = 0; i < n; i++) POLYGON_SCALE_SCRATCH[i] = verts[i] * scale;
    writeLivePolygon(prop, POLYGON_SCALE_SCRATCH, n);
    if (prop.height != null) prop.height *= scale;
    prop.stateTimer = (prop.stateTimer ?? 0) + 1;
    invalidatePropFootprintKey(prop);
    markBroadphaseDirty(prop);
    normalizeKineticBody(prop);
    wakeKineticBody(prop._physId);
}
export function setPolygonPropBoundingRadius(prop, boundingRadius) {
    const currentRadius = getPolygonPropBoundingRadius(prop);
    if (!currentRadius || currentRadius <= 0) throw new Error(`setPolygonPropBoundingRadius requires a polygon prop with positive radius, got ${currentRadius}`);
    scalePolygonPropFootprint(prop, boundingRadius / currentRadius);
}
export function getCirclePropRadius(prop) {
    return prop.radius;
}
export function setCirclePropRadius(prop, radius) {
    if (radius <= 0) throw new Error(`Circle prop radius must be > 0, got ${radius}`);
    const shape = prop.shape;
    if (shape.shapeTypeId !== SHAPE_TYPE_CIRCLE) throw new Error(`setCirclePropRadius requires a circle prop, got shapeTypeId=${shape?.shapeTypeId}`);
    prop.shape = new CircleShape(radius);
    prop.radius = radius;
    invalidatePropFootprintKey(prop);
    markBroadphaseDirty(prop);
    if (prop._physId !== undefined) stampKineticBodyFromEntity(prop._physId, prop);
    normalizeKineticBody(prop);
    wakeKineticBody(prop._physId);
}
/** Shared defaults for world prop strategies (WorldProp reads these via buildWorldPropStrategyFromAsset). */
export const PROP_STRATEGY_DEFAULTS = { isKinetic: true, renderMode: PROP_RENDER_MODE_3D, render3DKey: null, inspectKey: null, rolls: false, orientToMotion: false };
export function invalidatePropFootprintKey(prop) {
    prop._footprintKey = undefined;
    prop._footprintId = undefined;
    prop._cachedStaticKey = undefined;
    prop._staticKeyFacing = undefined;
    prop._staticKeyVo = undefined;
    prop._staticKeyAttachment = undefined;
    prop._staticKeyPhysicsKey = undefined;
    prop._staticKeyCustom = undefined;
    prop._staticKeyRoll = undefined;
}
export function applyPropBoxFootprint(prop, hx, hy) {
    const n = 8;
    const fp = POLYGON_SCALE_SCRATCH;
    fp[0] = -hx;
    fp[1] = -hy;
    fp[2] = hx;
    fp[3] = -hy;
    fp[4] = hx;
    fp[5] = hy;
    fp[6] = -hx;
    fp[7] = hy;
    writeLivePolygon(prop, fp, n);
    invalidatePropFootprintKey(prop);
    markBroadphaseDirty(prop);
    normalizeKineticBody(prop);
}
export function initWorldPropShape(prop) {
    const template = prop.strategy.localFootprint;
    if (template && vertCount(template) >= 3) {
        if (polygonIsConvex(template)) {
            writeLivePolygon(prop, template, template.length);
            prop.collisionParts = undefined;
            prop.drawOutline = undefined;
            invalidatePropFootprintKey(prop);
            return;
        }
        applyCompoundFootprint(prop, template);
        invalidatePropFootprintKey(prop);
        return;
    }
    releaseLivePolygon(prop);
    prop.radius = prop.strategy.radius;
    prop.shape = new CircleShape(prop.radius);
    prop.collisionParts = undefined;
    prop.drawOutline = undefined;
    invalidatePropFootprintKey(prop);
}
export function propFootprintHalfExtentsInto(buf, o, prop) {
    const shape = prop.shape;
    if (shape.shapeTypeId === SHAPE_TYPE_POLYGON) {
        convexFootprintHalfExtents(buf, o, shape.vertices);
        return;
    }
    if (shape.shapeTypeId !== SHAPE_TYPE_CIRCLE) throw new Error(`propFootprintHalfExtentsInto: unknown shapeTypeId ${shape?.shapeTypeId}`);
    const radius = shape.radius;
    buf[o] = radius;
    buf[o + 1] = radius;
}
export function propShapeFootprintId(prop) {
    if (prop._footprintId !== undefined) return prop._footprintId;
    const shape = prop.shape;
    let id;
    if (shape.shapeTypeId === SHAPE_TYPE_POLYGON) {
        let hash = 2166136261;
        function mixVerts(verts) {
            const count = verts.length;
            hash ^= count >>> 0;
            hash = Math.imul(hash, 16777619);
            for (let i = 0; i < count; i++) {
                const q = Math.round(verts[i] * 8);
                hash ^= q;
                hash = Math.imul(hash, 16777619);
            }
        }
        const outline = prop.drawOutline;
        if (outline?.length >= 6) mixVerts(outline);
        else {
            const parts = prop.collisionParts;
            if (parts?.length > 1) {
                hash ^= parts.length >>> 0;
                hash = Math.imul(hash, 16777619);
                for (let p = 0; p < parts.length; p++) mixVerts(parts[p].vertices);
            } else mixVerts(shape.vertices);
        }
        id = hash >>> 0;
        if (prop.chunks?.length) id = (id ^ Math.imul(prop.chunks.length, 16777619)) >>> 0;
    } else {
        if (shape.shapeTypeId !== SHAPE_TYPE_CIRCLE) throw new Error(`propShapeFootprintId: unknown shapeTypeId ${shape?.shapeTypeId}`);
        id = Math.round(shape.radius * 4) >>> 0;
    }
    prop._footprintId = id & 0xfffff;
    return prop._footprintId;
}
function propShapeFootprintKey(prop) {
    return `f${propShapeFootprintId(prop)}`;
}
const FACING_STEPS_MAX = 360;
const FACING_STEPS_BASELINE_DIAMETER = 16;
function deriveFacingStepsFromFootprint(prop, baselineSteps) {
    propFootprintHalfExtentsInto(ENGINE_F32, M_VEC_A, prop);
    const worldDiameter = Math.max(ENGINE_F32[M_VEC_A], ENGINE_F32[M_VEC_A + 1]) * 2;
    if (worldDiameter <= FACING_STEPS_BASELINE_DIAMETER) return baselineSteps;
    const scaled = Math.round((baselineSteps * worldDiameter * 6) / FACING_STEPS_BASELINE_DIAMETER);
    return Math.min(FACING_STEPS_MAX, scaled);
}
const sQuantizeSteps = { facing: 0, view: 0 };
const sHalfExtents = { x: 0, y: 0 };
const sStageProp = { x: 0, y: 0, radius: 0, facing: 0, rollQw: 1, rollQx: 0, rollQy: 0, rollQz: 0, halfExtents: sHalfExtents, strategy: null, type: null, shape: null, collisionParts: null, drawOutline: null, height: undefined, visualOverride: null, faction: null, ageMs: 0, id: 0, wallChunkProfileId: null, wallChunkHeightPx: undefined };
export function resolvePropQuantizeSteps(prop) {
    const defaults = propQuantizeSteps;
    const override = prop.strategy?.quantizeSteps;
    const derivedFacing = deriveFacingStepsFromFootprint(prop, defaults.facing);
    sQuantizeSteps.facing = override?.facing ?? derivedFacing;
    sQuantizeSteps.view = override?.view ?? defaults.view ?? 30;
    return sQuantizeSteps;
}
export function getBaseSpriteCacheKey(prop, deps) {
    return String(getBaseSpriteCacheId(prop, deps));
}
export function getBaseSpriteCacheId(prop, deps) {
    const { quantizeAngleIndex } = deps;
    const steps = resolvePropQuantizeSteps(prop);
    let orient;
    if (prop.strategy?.rolls) orient = packRollOrientId(prop, steps.facing);
    else orient = quantizeAngleIndex(readEntityFacing(prop), steps.facing);
    const foot = propShapeFootprintId(prop);
    const vo = visualOverrideCacheId(prop);
    let h = 2166136261;
    h ^= orient >>> 0;
    h = Math.imul(h, 16777619);
    h ^= foot >>> 0;
    h = Math.imul(h, 16777619);
    h ^= vo >>> 0;
    h = Math.imul(h, 16777619);
    return (h >>> 0) & 0xfffff;
}
export function getPropStageBakeState(prop) {
    propFootprintHalfExtentsInto(ENGINE_F32, M_VEC_A, prop);
    const steps = resolvePropQuantizeSteps(prop);
    sStageProp.x = prop.x;
    sStageProp.y = prop.y;
    sStageProp.radius = prop.radius;
    sHalfExtents.x = ENGINE_F32[M_VEC_A];
    sHalfExtents.y = ENGINE_F32[M_VEC_A + 1];
    sStageProp.facing = quantizeAngle(readEntityFacing(prop), steps.facing);
    if (prop.strategy?.rolls) {
        quantizeBodyRollQuatF32(prop, steps.facing);
        sStageProp.rollQw = ENGINE_F32[M_OUT_QW];
        sStageProp.rollQx = ENGINE_F32[M_OUT_QX];
        sStageProp.rollQy = ENGINE_F32[M_OUT_QY];
        sStageProp.rollQz = ENGINE_F32[M_OUT_QZ];
    } else {
        sStageProp.rollQw = 1;
        sStageProp.rollQx = 0;
        sStageProp.rollQy = 0;
        sStageProp.rollQz = 0;
    }
    sStageProp.strategy = prop.strategy;
    sStageProp.type = prop.type;
    sStageProp.shape = prop.shape;
    sStageProp.collisionParts = prop.collisionParts;
    sStageProp.drawOutline = prop.drawOutline;
    sStageProp.height = prop.height;
    sStageProp.visualOverride = prop.visualOverride;
    sStageProp.faction = prop.faction;
    sStageProp.ageMs = prop.ageMs;
    sStageProp.id = prop.id;
    sStageProp.wallChunkProfileId = prop.wallChunkProfileId;
    sStageProp.wallChunkHeightPx = prop.wallChunkHeightPx;
    return sStageProp;
}
export function buildWorldPropStrategyFromAsset(asset) {
    if (!asset?.physics) {
        const strategy = { ...PROP_STRATEGY_DEFAULTS };
        if (asset?.sandbox?.gridFloorBelt) strategy.isKinetic = false;
        else stampPrimitivePhysics(strategy, primitivePhysicsRow(asset ?? strategy));
        return strategy;
    }
    const { spawn, renderMode, ...strategy } = asset.physics;
    if (strategy.localFootprint) strategy.localFootprint = new Float32Array(ensureFlatVerts(strategy.localFootprint));
    if (strategy.collisionParts) throw new Error(`${asset.id}: physics.collisionParts is deleted — use localFootprint (concave outlines auto-decompose)`);
    const built = { ...PROP_STRATEGY_DEFAULTS, render3DKey: asset.id, renderMode: renderMode ?? PROP_RENDER_MODE_3D, inspectKey: null, ...strategy };
    if (asset.sandbox?.gridFloorBelt) built.isKinetic = false;
    else stampPrimitivePhysics(built, primitivePhysicsRow(asset));
    if (assetUsesWallChunkSurface(asset) && !built.getCustomSpriteCacheKey) built.getCustomSpriteCacheKey = getWallChunkSpriteCacheKey;
    return built;
}
const worldPropStrategyByType = new Map();
export function sharedWorldPropStrategy(type) {
    let strategy = worldPropStrategyByType.get(type);
    if (strategy) return strategy;
    strategy = buildWorldPropStrategyFromAsset(propCatalog[type]);
    worldPropStrategyByType.set(type, strategy);
    return strategy;
}
let nextWorldPropId = 1;
const WORLD_PROP_MODES = Object.freeze({ normal: Object.freeze({}) });
function resolvePropSpawnFacing(prop, facing) {
    if (facing != null) return prop.strategy.cardinalFacing ? quantizeAngle(facing, CARDINAL_FACING_STEPS) : facing;
    if (prop.strategy.cardinalFacing) return quantizeAngle(0, CARDINAL_FACING_STEPS);
    return deterministicUnitRandom(Math.imul(prop.id, 2654435761)) * Math.PI * 2;
}
// WorldProp lifecycle: (1) birth - new WorldProp() or sandbox spawn; (2) live - registry/kinetic membership; (3) death - removeWorldPropFromState.
export class WorldProp {
    constructor(x, y, type, facing = null) {
        this.id = nextWorldPropId++;
        this.zIndex = 10;
        this._distSq = 0;
        this.shape = null;
        this.initializeSpawn(x, y, type, facing);
        this.changeState("normal");
    }
    initializeSpawn(x, y, type, facing = null) {
        const asset = propCatalog[type];
        this.type = type;
        this.strategy = sharedWorldPropStrategy(type);
        this._spawnX = x;
        this._spawnY = y;
        this.z = 0;
        this.isDead = false;
        this._spawnVx = 0;
        this._spawnVy = 0;
        this._spawnW = 0;
        this._spawnAgeMs = 0;
        this._spawnSleepFrames = 0;
        this._spawnSleeping = false;
        this.stateTimer = 0;
        this.stateData = {};
        this.height = resolveAssetPropHeight(asset);
        this.fractureEnabled = this.strategy.fracture ? undefined : false;
        this._spawnFacing = resolvePropSpawnFacing(this, facing);
        if (this.strategy.rolls) {
            this._spawnRollQw = 1;
            this._spawnRollQx = 0;
            this._spawnRollQy = 0;
            this._spawnRollQz = 0;
        }
        this.chunks = undefined;
        this.collisionParts = undefined;
        this.snakeFoodValue = undefined;
        this._fractureCooldown = 0;
        this.faction = undefined;
        this.spawnGroupId = undefined;
        this.spawnGroupExportType = undefined;
        this.spawnGroupAnchor = undefined;
        releaseLivePolygon(this);
        this.shape = undefined;
        this.drawOutline = undefined;
        this.footprintArea = undefined;
        this.alpha = undefined;
        this.wallChunkProfileId = undefined;
        this.wallChunkHeightPx = undefined;
        this._wallChunkTextureReady = undefined;
        stampSurfaceProfileFields(this, asset);
        this._footprintKey = undefined;
        initWorldPropShape(this);
        normalizeKineticBody(this);
        this._neighborEidCount = 0;
        this._neighborsFrameId = -1;
        delete this._physId;
        delete this._activeSlot;
    }
    get x() {
        const eid = this._physId;
        return eid !== undefined ? entityX[eid] : this._spawnX;
    }
    set x(v) {
        const eid = this._physId;
        if (eid !== undefined) entityX[eid] = v;
        else this._spawnX = v;
    }
    get y() {
        const eid = this._physId;
        return eid !== undefined ? entityY[eid] : this._spawnY;
    }
    set y(v) {
        const eid = this._physId;
        if (eid !== undefined) entityY[eid] = v;
        else this._spawnY = v;
    }
    get vx() {
        const eid = this._physId;
        return eid !== undefined ? entityVx[eid] : this._spawnVx;
    }
    set vx(v) {
        const eid = this._physId;
        if (eid !== undefined) entityVx[eid] = v;
        else this._spawnVx = v;
    }
    get vy() {
        const eid = this._physId;
        return eid !== undefined ? entityVy[eid] : this._spawnVy;
    }
    set vy(v) {
        const eid = this._physId;
        if (eid !== undefined) entityVy[eid] = v;
        else this._spawnVy = v;
    }
    get angularVelocity() {
        const eid = this._physId;
        return eid !== undefined ? entityW[eid] : this._spawnW;
    }
    set angularVelocity(v) {
        const eid = this._physId;
        if (eid !== undefined) entityW[eid] = v;
        else this._spawnW = v;
    }
    get facing() {
        const eid = this._physId;
        return eid !== undefined ? entityFacing[eid] : this._spawnFacing;
    }
    set facing(v) {
        const eid = this._physId;
        if (eid !== undefined) entityFacing[eid] = v;
        else this._spawnFacing = v;
    }
    get rollQw() {
        const eid = this._physId;
        return eid !== undefined ? entityRollQw[eid] : (this._spawnRollQw ?? 1);
    }
    set rollQw(v) {
        const eid = this._physId;
        if (eid !== undefined) entityRollQw[eid] = v;
        else this._spawnRollQw = v;
    }
    get rollQx() {
        const eid = this._physId;
        return eid !== undefined ? entityRollQx[eid] : (this._spawnRollQx ?? 0);
    }
    set rollQx(v) {
        const eid = this._physId;
        if (eid !== undefined) entityRollQx[eid] = v;
        else this._spawnRollQx = v;
    }
    get rollQy() {
        const eid = this._physId;
        return eid !== undefined ? entityRollQy[eid] : (this._spawnRollQy ?? 0);
    }
    set rollQy(v) {
        const eid = this._physId;
        if (eid !== undefined) entityRollQy[eid] = v;
        else this._spawnRollQy = v;
    }
    get rollQz() {
        const eid = this._physId;
        return eid !== undefined ? entityRollQz[eid] : (this._spawnRollQz ?? 0);
    }
    set rollQz(v) {
        const eid = this._physId;
        if (eid !== undefined) entityRollQz[eid] = v;
        else this._spawnRollQz = v;
    }
    get ageMs() {
        const eid = this._physId;
        return eid !== undefined ? entityAgeMs[eid] : (this._spawnAgeMs ?? 0);
    }
    set ageMs(v) {
        const eid = this._physId;
        if (eid !== undefined) entityAgeMs[eid] = v;
        else this._spawnAgeMs = v;
    }
    get isSleeping() {
        const eid = this._physId;
        return eid !== undefined ? kineticDynamicSlab.sleeping[eid] !== 0 : !!this._spawnSleeping;
    }
    set isSleeping(v) {
        const eid = this._physId;
        if (eid !== undefined) kineticDynamicSlab.sleeping[eid] = v ? 1 : 0;
        else this._spawnSleeping = !!v;
    }
    get _sleepFrames() {
        const eid = this._physId;
        return eid !== undefined ? kineticDynamicSlab.sleepFrames[eid] : (this._spawnSleepFrames ?? 0);
    }
    set _sleepFrames(v) {
        const eid = this._physId;
        if (eid !== undefined) kineticDynamicSlab.sleepFrames[eid] = v;
        else this._spawnSleepFrames = v;
    }
    get momentOfInertia() {
        return kineticInertiaFromBody(this);
    }
    changeState(stateName, stateDataInit = null) {
        if (this.strategy?.isKinetic) wakeKineticBody(this._physId);
        transitionEntity(this, WORLD_PROP_MODES, stateName, stateDataInit);
    }
    get angle() {
        return this.facing;
    }
    set angle(val) {
        this.facing = val;
    }
    getRender3DKey() {
        if (this.currentState?.getRender3DKey) return this.currentState.getRender3DKey(this);
        return this.strategy.render3DKey;
    }
    needsWallCollision() {
        return isKinematicallyActive(this);
    }
    tickPropFrame(dt, state, spatialFrame) {
        this.ageMs += dt;
        if (this.strategy.fadeOutMs !== undefined) {
            const fadeOutMs = this.strategy.fadeOutMs;
            const durationMs = this.strategy.fadeOutDurationMs ?? 1000;
            if (this.ageMs >= fadeOutMs + durationMs) {
                if (state && spatialFrame) removeWorldPropFromState(state, this, spatialFrame, state.sandbox?.entityMeta);
                else this.isDead = true;
                return;
            } else if (this.ageMs >= fadeOutMs) {
                const elapsedFade = this.ageMs - fadeOutMs;
                this.alpha = Math.max(0, Math.min(1, 1 - elapsedFade / durationMs));
            } else this.alpha = 1;
        }
        if (this._fractureCooldown > 0) this._fractureCooldown--;
        const asleep = this.isSleeping;
        if (!asleep && this.currentState?.update) this.currentState.update(this, dt, state);
    }
    tickPropSubstep(dt) {
        if (this.isSleeping) return;
        if (this.strategy.rolls) integratePropMotion(this, dt);
        else applyVelocityDamping(this, dt, primitiveDragFriction(this));
        if (this.strategy.orientToMotion) {
            const speed = Math.hypot(this.vx, this.vy);
            if (speed > 0.1) {
                const moveAngle = Math.atan2(this.vy, this.vx);
                const turnRadPerSec = Math.PI * 1.5;
                const maxStep = turnRadPerSec * (dt / 1000);
                this.facing = rotateAngleTowards(readEntityFacing(this), moveAngle, maxStep);
            }
        }
    }
    update(dt, state, spatialFrame) {
        this.tickPropFrame(dt, state, spatialFrame);
        this.tickPropSubstep(dt);
    }
}
/**
 * Asset-level fixed child visuals. These are render-only and never become
 * WorldProp entities, collision bodies, exported props, or selectable objects.
 *
 * @typedef {object} PropVisualAttachment
 * @property {string} id Stable attachment id for cache keys.
 * @property {string} propId Child prop asset id to draw.
 * @property {{ x?: number, y?: number }} [offset] Local parent-facing offset.
 * @property {"world" | "parentRadius"} [offsetSpace] Whether offset is world units or parent-radius units.
 * @property {number} [facingOffset] Rotation added to the parent quantized facing.
 * @property {"facing" | "velocity"} [heading] Heading source for offset and rotation.
 * @property {number} [minHeadingSpeed] Minimum speed for velocity heading; below this falls back to facing.
 * @property {number} [scale] Visual scale applied to the child footprint.
 * @property {number} [radiusScale] Child visual radius as a multiplier of parent radius.
 * @property {number} [layer] Negative draws before parent, non-negative after.
 */
function normalizeAttachmentScale(scale) {
    return Number.isFinite(scale) && scale > 0 ? scale : 1;
}
function resolveAttachmentHeading(prop, cfg) {
    if (cfg.heading === ATTACH_HEADING_VELOCITY) {
        const vx = prop.vx ?? 0;
        const vy = prop.vy ?? 0;
        const speed = Math.hypot(vx, vy);
        const minSpeed = cfg.minHeadingSpeed ?? 0.25;
        if (speed >= minSpeed) return Math.atan2(vy, vx);
    }
    return readEntityFacing(prop);
}
function resolveQuantizedAttachmentHeading(prop, cfg) {
    return quantizeAngle(resolveAttachmentHeading(prop, cfg), resolvePropQuantizeSteps(prop).facing);
}
function resolveAttachmentOffsetScale(parentProp, cfg) {
    return cfg.offsetSpace === ATTACH_OFFSET_PARENT_RADIUS ? parentProp.radius : 1;
}
function scaleVirtualPropShape(prop, scale) {
    if (scale === 1) return;
    const shape = prop.shape;
    if (shape.shapeTypeId === SHAPE_TYPE_CIRCLE) {
        prop.shape = new CircleShape(shape.radius * scale);
        prop.radius = prop.shape.radius;
        if (prop.height != null) prop.height *= scale;
        invalidatePropFootprintKey(prop);
        return;
    }
    if (shape.shapeTypeId === SHAPE_TYPE_POLYGON) {
        const n = shape.vertices.length;
        const verts = shape.vertices;
        for (let i = 0; i < n; i++) POLYGON_SCALE_SCRATCH[i] = verts[i] * scale;
        writeLivePolygon(prop, POLYGON_SCALE_SCRATCH, n);
        if (prop.height != null) prop.height *= scale;
        invalidatePropFootprintKey(prop);
    }
}
function resolveVirtualPropScale(parentProp, childProp, cfg) {
    const baseScale = normalizeAttachmentScale(cfg.scale);
    if (!Number.isFinite(cfg.radiusScale) || cfg.radiusScale <= 0) return baseScale;
    propFootprintHalfExtentsInto(ENGINE_F32, M_VEC_A, childProp);
    const childRadius = Math.max(childProp.radius, ENGINE_F32[M_VEC_A], ENGINE_F32[M_VEC_A + 1]);
    if (childRadius <= 0) return baseScale;
    return baseScale * ((parentProp.radius * cfg.radiusScale) / childRadius);
}
/** @param {object} prop */
export function getPropVisualAttachmentConfigs(prop) {
    const attachments = propCatalog[prop?.type]?.visuals?.attachments;
    return Array.isArray(attachments) ? attachments : [];
}
/**
 * @param {object} prop
 * @param {{ quantizeAngleIndex: (angle: number, steps: number) => number }} deps
 */
export function getVisualAttachmentSpriteCacheKey(prop, deps) {
    return String(getVisualAttachmentSpriteCacheId(prop, deps));
}
export function getVisualAttachmentSpriteCacheId(prop, deps) {
    const attachments = getPropVisualAttachmentConfigs(prop);
    if (!attachments.length) return 0;
    const facingSteps = resolvePropQuantizeSteps(prop).facing;
    let h = 2166136261;
    for (let i = 0; i < attachments.length; i++) {
        const cfg = attachments[i];
        if (!cfg?.id || !cfg.propId) continue;
        const headingIndex = deps.quantizeAngleIndex(resolveAttachmentHeading(prop, cfg), facingSteps);
        const offset = cfg.offset ?? {};
        const fields = [hashStringPart(cfg.id), hashStringPart(cfg.propId), headingIndex, Math.round((offset.x ?? 0) * 100), Math.round((offset.y ?? 0) * 100), cfg.offsetSpace === ATTACH_OFFSET_PARENT_RADIUS ? 1 : 0, Math.round((cfg.facingOffset ?? 0) * 10000), Math.round(normalizeAttachmentScale(cfg.scale) * 100), Math.round((cfg.radiusScale ?? 0) * 100), cfg.heading === ATTACH_HEADING_VELOCITY ? 1 : 0, cfg.layer | 0];
        for (let f = 0; f < fields.length; f++) {
            h ^= fields[f] >>> 0;
            h = Math.imul(h, 16777619);
        }
    }
    return (h >>> 0) & 0xfffff;
}
function hashStringPart(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}
function createVirtualAttachmentProp(parentProp, cfg, heading) {
    const childAsset = propCatalog[cfg.propId];
    if (!childAsset) return null;
    const strategy = sharedWorldPropStrategy(cfg.propId);
    const offset = cfg.offset ?? {};
    const offsetScale = resolveAttachmentOffsetScale(parentProp, cfg);
    const localX = (offset.x ?? 0) * offsetScale;
    const localY = (offset.y ?? 0) * offsetScale;
    rotateXYIntoF32(M_VEC_A, localX, localY, Math.cos(heading), Math.sin(heading));
    const prop = { type: cfg.propId, strategy, x: parentProp.x + ENGINE_F32[M_VEC_A], y: parentProp.y + ENGINE_F32[M_VEC_A + 1], facing: heading + (cfg.facingOffset ?? 0), height: resolveAssetPropHeight(childAsset), visualOverride: undefined, _visualAttachmentId: cfg.id, _footprintKey: undefined };
    stampSurfaceProfileFields(prop, childAsset);
    if (parentProp.wallChunkProfileId) prop.wallChunkProfileId = parentProp.wallChunkProfileId;
    initWorldPropShape(prop);
    scaleVirtualPropShape(prop, resolveVirtualPropScale(parentProp, prop, cfg));
    return prop;
}
/**
 * @param {object} parentProp Parent prop in stage coordinates with quantized facing.
 * @returns {{ before: object[], after: object[] }}
 */
export function resolveVisualAttachmentProps(parentProp) {
    const before = [];
    const after = [];
    const attachments = getPropVisualAttachmentConfigs(parentProp);
    for (let i = 0; i < attachments.length; i++) {
        const cfg = attachments[i];
        if (!cfg?.id || !cfg.propId) continue;
        const heading = resolveQuantizedAttachmentHeading(parentProp, cfg);
        const child = createVirtualAttachmentProp(parentProp, cfg, heading);
        if (!child) continue;
        if ((cfg.layer ?? 0) < 0) before.push(child);
        else after.push(child);
    }
    return { before, after };
}
/** @param {object} prop */
export function resolveVisualAttachmentBakeRadius(prop, parentFacing) {
    const attachments = getPropVisualAttachmentConfigs(prop);
    let radius = 0;
    for (let i = 0; i < attachments.length; i++) {
        const cfg = attachments[i];
        if (!cfg?.id || !cfg.propId) continue;
        const heading = cfg.heading === ATTACH_HEADING_VELOCITY ? resolveQuantizedAttachmentHeading(prop, cfg) : parentFacing;
        const child = createVirtualAttachmentProp({ ...prop, x: 0, y: 0, facing: parentFacing }, cfg, heading);
        if (!child) continue;
        propFootprintHalfExtentsInto(ENGINE_F32, M_VEC_A, child);
        const childRadius = Math.max(child.radius, ENGINE_F32[M_VEC_A], ENGINE_F32[M_VEC_A + 1]);
        radius = Math.max(radius, Math.hypot(child.x, child.y) + childRadius);
    }
    return radius;
}
export function registerPropDrawRecipe(asset) {
    if (asset.physics?.renderMode === PROP_RENDER_MODE_NONE) {
        asset.drawRecipe = () => {};
        return;
    }
    if (asset.primitive) {
        const builder = PROP_PRIMITIVE_BUILDERS[asset.primitive];
        if (!builder) throw new Error(`Unknown primitive ${asset.primitive} for asset "${asset.id}"`);
        asset.drawRecipe = builder(asset.visuals);
        return;
    }
    throw new Error(`Asset "${asset.id}" must define primitive`);
}
queueMicrotask(() => {
    for (const asset of Object.values(propCatalog)) {
        if (!asset.physics) throw new Error(`Asset "${asset.id}" must include physics`);
        registerPropDrawRecipe(asset);
    }
});
export const floorEffectPass = {
    zIndex: 10.5,
    draw(state, viewport, ctx) {
        drawFloorOccupancyBelts(ctx, state, viewport);
        drawFloorPortals(ctx, state, viewport);
    },
};

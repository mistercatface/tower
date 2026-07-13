import { removeWorldPropFromState } from "../../GameState/EntityRegistry.js";
import { writeLivePolygon, releaseLivePolygon, CircleShape, stampKineticCircleRadius, wakeKineticBody, applyVelocityDamping, integratePropMotion, kineticInertiaFromBody, normalizeKineticBody, quantizeBodyRollQuatF32, packRollOrientId, applyCompoundFootprint, stampPrimitivePhysics, primitivePhysicsRow, primitiveDragFrictionEid, computeFootprintIdFromSlab } from "../Physics/physics.js";
import { entityX, entityY, entityVx, entityVy, entityW, entityFacing, entityR, entityRollQw, entityRollQx, entityRollQy, entityRollQz, entityAgeMs, entityFlags, entityRefs, kineticDynamicSlab, entityHeight, entityAlpha, entityShapeKind, entityWallProfileId, entityWallHeightPx, getProfileId, getProfileStr, entityFractureCooldown, entityCachedStaticKey, entityFootprintId } from "../../Core/engineMemory.js";
import { SHAPE_TYPE_CIRCLE, SHAPE_TYPE_POLYGON, ENTITY_FLAG_ROLLS, ENTITY_FLAG_ORIENT_TO_MOTION, PROP_PRIMITIVE_SPHERE, PROP_PRIMITIVE_POLYGON, PROP_PRIMITIVE_COUNT, PROP_DRAW_WALL_CHUNK, PROP_RENDER_MODE_NONE, PROP_RENDER_MODE_3D, ENTITY_FLAG_DEAD, ENTITY_FLAG_FRACTURE_SET, ENTITY_FLAG_FRACTURE_VAL } from "../../Core/engineEnums.js";
import { ensureFlatVerts, convexFootprintHalfExtents, vertCount, quantizeAngle, rotateAngleTowards, deterministicUnitRandom, polygonIsConvex } from "../Math/math.js";
import { ENGINE_F32, M_VEC_A, M_OUT_QW, M_OUT_QX, M_OUT_QY, M_OUT_QZ } from "../../Core/engineMemory.js";
import { drawSphere, drawFlatSphereDisc, createWallChunkDraw, DEFAULT_PROP_HEIGHT } from "../Render/render.js";
import { drawFloorOccupancyBelts } from "../Spatial/belts.js";
import { drawFloorPortals } from "../Spatial/portals.js";
import { transitionEntity } from "../FSM/transition.js";
import propCatalog from "../../Assets/props/index.js";
import { gridSettings } from "../../Config/world.js";
import { SURFACE_PROFILE_ID } from "../../Config/procedural/profileIds.js";
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
    invalidateEntityFootprint(prop._physId);
    normalizeKineticBody(prop);
    wakeKineticBody(prop._physId);
}
export function setPolygonPropBoundingRadius(prop, boundingRadius) {
    const currentRadius = getPolygonPropBoundingRadius(prop);
    if (!currentRadius || currentRadius <= 0) throw new Error(`setPolygonPropBoundingRadius requires a polygon prop with positive radius, got ${currentRadius}`);
    scalePolygonPropFootprint(prop, boundingRadius / currentRadius);
}
export function setCirclePropRadius(prop, radius) {
    if (radius <= 0) throw new Error(`Circle prop radius must be > 0, got ${radius}`);
    const shape = prop.shape;
    if (shape.shapeTypeId !== SHAPE_TYPE_CIRCLE) throw new Error(`setCirclePropRadius requires a circle prop, got shapeTypeId=${shape?.shapeTypeId}`);
    prop.shape = new CircleShape(radius);
    prop.radius = radius;
    stampKineticCircleRadius(prop._physId, radius);
    normalizeKineticBody(prop);
    invalidateEntityFootprint(prop._physId);
    wakeKineticBody(prop._physId);
}
/** Shared defaults for world prop strategies (WorldProp reads these via buildWorldPropStrategyFromAsset). */
export const PROP_STRATEGY_DEFAULTS = { isKinetic: true, renderMode: PROP_RENDER_MODE_3D, render3DKey: null, renderKeyId: 0, inspectKey: null, rolls: false, orientToMotion: false };
export function invalidateEntityFootprint(eid) {
    entityCachedStaticKey[eid] = 0n;
    entityFootprintId[eid] = computeFootprintIdFromSlab(eid);
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
    normalizeKineticBody(prop);
}
export function initWorldPropShape(prop) {
    const template = prop.strategy.localFootprint;
    if (template && vertCount(template) >= 3) {
        if (polygonIsConvex(template)) {
            writeLivePolygon(prop, template, template.length);
            prop.collisionParts = undefined;
            prop.drawOutline = undefined;
            return;
        }
        applyCompoundFootprint(prop, template);
        return;
    }
    releaseLivePolygon(prop);
    prop.radius = prop.strategy.radius;
    prop.shape = new CircleShape(prop.radius);
    prop.collisionParts = undefined;
    prop.drawOutline = undefined;
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
const sStageProp = { x: 0, y: 0, radius: 0, facing: 0, rollQw: 1, rollQx: 0, rollQy: 0, rollQz: 0, halfExtents: sHalfExtents, strategy: null, type: null, shape: null, collisionParts: null, drawOutline: null, height: undefined, ageMs: 0, id: 0, wallChunkProfileId: null, wallChunkHeightPx: undefined };
export function resolvePropQuantizeSteps(prop) {
    const defaults = propQuantizeSteps;
    const override = prop.strategy?.quantizeSteps;
    const derivedFacing = deriveFacingStepsFromFootprint(prop, defaults.facing);
    sQuantizeSteps.facing = override?.facing ?? derivedFacing;
    sQuantizeSteps.view = override?.view ?? defaults.view ?? 30;
    return sQuantizeSteps;
}
export function getBaseSpriteCacheId(prop, deps) {
    const { quantizeAngleIndex } = deps;
    const steps = resolvePropQuantizeSteps(prop);
    let orient;
    if (prop.strategy?.rolls) orient = packRollOrientId(prop, steps.facing);
    else orient = quantizeAngleIndex(prop.facing, steps.facing);
    const foot = entityFootprintId[prop._physId];
    let h = 2166136261;
    h ^= orient >>> 0;
    h = Math.imul(h, 16777619);
    h ^= foot >>> 0;
    h = Math.imul(h, 16777619);
    return (h >>> 0) & 0xfffff;
}
export function getPropStageBakeState(eid) {
    const prop = entityRefs[eid];
    propFootprintHalfExtentsInto(ENGINE_F32, M_VEC_A, prop);
    const steps = resolvePropQuantizeSteps(prop);
    sStageProp.x = entityX[eid];
    sStageProp.y = entityY[eid];
    sStageProp.radius = entityR[eid];
    sHalfExtents.x = ENGINE_F32[M_VEC_A];
    sHalfExtents.y = ENGINE_F32[M_VEC_A + 1];
    sStageProp.facing = quantizeAngle(entityFacing[eid], steps.facing);
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
    sStageProp.height = entityHeight[eid];
    sStageProp.ageMs = entityAgeMs[eid];
    sStageProp.id = prop.id;
    sStageProp.wallChunkProfileId = getProfileStr(entityWallProfileId[eid]);
    sStageProp.wallChunkHeightPx = entityWallHeightPx[eid];
    return sStageProp;
}
export function buildWorldPropStrategyFromAsset(asset) {
    if (!asset?.physics) {
        const strategy = { ...PROP_STRATEGY_DEFAULTS, renderKeyId: asset?.renderKeyId ?? 0 };
        if (asset?.sandbox?.gridFloorBelt) strategy.isKinetic = false;
        else stampPrimitivePhysics(strategy, primitivePhysicsRow(asset ?? strategy));
        return strategy;
    }
    const { spawn, renderMode, ...strategy } = asset.physics;
    if (strategy.localFootprint) strategy.localFootprint = new Float32Array(ensureFlatVerts(strategy.localFootprint));
    if (strategy.collisionParts) throw new Error(`${asset.id}: physics.collisionParts is deleted — use localFootprint (concave outlines auto-decompose)`);
    const built = { ...PROP_STRATEGY_DEFAULTS, render3DKey: asset.id, renderKeyId: asset.renderKeyId ?? 0, renderMode: renderMode ?? PROP_RENDER_MODE_3D, inspectKey: null, ...strategy };
    if (asset.sandbox?.gridFloorBelt) built.isKinetic = false;
    else stampPrimitivePhysics(built, primitivePhysicsRow(asset));
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
        stampSurfaceProfileFields(this, asset);
        initWorldPropShape(this);
        normalizeKineticBody(this);
        delete this._physId;
    }
    get isDead() {
        const eid = this._physId;
        return eid !== undefined ? (entityFlags[eid] & ENTITY_FLAG_DEAD) !== 0 : !!this._spawnDead;
    }
    set isDead(v) {
        const eid = this._physId;
        if (eid !== undefined)
            if (v) entityFlags[eid] |= ENTITY_FLAG_DEAD;
            else entityFlags[eid] &= ~ENTITY_FLAG_DEAD;
        this._spawnDead = !!v;
    }
    get fractureEnabled() {
        const eid = this._physId;
        if (eid !== undefined) {
            const flags = entityFlags[eid];
            if ((flags & ENTITY_FLAG_FRACTURE_SET) === 0) return undefined;
            return (flags & ENTITY_FLAG_FRACTURE_VAL) !== 0;
        }
        return this._spawnFractureEnabled;
    }
    set fractureEnabled(v) {
        const eid = this._physId;
        if (eid !== undefined)
            if (v === undefined) entityFlags[eid] &= ~(ENTITY_FLAG_FRACTURE_SET | ENTITY_FLAG_FRACTURE_VAL);
            else {
                entityFlags[eid] |= ENTITY_FLAG_FRACTURE_SET;
                if (v) entityFlags[eid] |= ENTITY_FLAG_FRACTURE_VAL;
                else entityFlags[eid] &= ~ENTITY_FLAG_FRACTURE_VAL;
            }
        this._spawnFractureEnabled = v;
    }
    get _fractureCooldown() {
        const eid = this._physId;
        return eid !== undefined ? entityFractureCooldown[eid] : this._spawnFractureCooldown;
    }
    set _fractureCooldown(v) {
        const eid = this._physId;
        if (eid !== undefined) entityFractureCooldown[eid] = v;
        this._spawnFractureCooldown = v;
    }
    get height() {
        const eid = this._physId;
        return eid !== undefined ? entityHeight[eid] : this._spawnHeight;
    }
    set height(v) {
        const eid = this._physId;
        if (eid !== undefined) entityHeight[eid] = v;
        this._spawnHeight = v;
    }
    get alpha() {
        const eid = this._physId;
        return eid !== undefined ? entityAlpha[eid] : this._spawnAlpha;
    }
    set alpha(v) {
        const eid = this._physId;
        if (eid !== undefined) entityAlpha[eid] = v;
        this._spawnAlpha = v;
    }
    get wallChunkProfileId() {
        const eid = this._physId;
        return eid !== undefined ? getProfileStr(entityWallProfileId[eid]) : this._spawnWallProfileId;
    }
    set wallChunkProfileId(v) {
        const eid = this._physId;
        if (eid !== undefined) entityWallProfileId[eid] = getProfileId(v);
        this._spawnWallProfileId = v;
    }
    get wallChunkHeightPx() {
        const eid = this._physId;
        return eid !== undefined ? entityWallHeightPx[eid] : this._spawnWallHeightPx;
    }
    set wallChunkHeightPx(v) {
        const eid = this._physId;
        if (eid !== undefined) entityWallHeightPx[eid] = v;
        this._spawnWallHeightPx = v;
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
    tickPropFrame(dt, state, spatialFrame) {
        this.ageMs += dt;
        if (this.strategy.fadeOutMs !== undefined) {
            const fadeOutMs = this.strategy.fadeOutMs;
            const durationMs = this.strategy.fadeOutDurationMs ?? 1000;
            if (this.ageMs >= fadeOutMs + durationMs) {
                removeWorldPropFromState(state, this, spatialFrame, state.sandbox?.entityMeta);
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
        const eid = this._physId;
        if ((entityFlags[eid] & ENTITY_FLAG_ROLLS) !== 0) integratePropMotion(eid, dt);
        else applyVelocityDamping(eid, dt, primitiveDragFrictionEid(eid));
        if ((entityFlags[eid] & ENTITY_FLAG_ORIENT_TO_MOTION) !== 0) {
            const vx = entityVx[eid];
            const vy = entityVy[eid];
            const speed = Math.hypot(vx, vy);
            if (speed > 0.1) {
                const moveAngle = Math.atan2(vy, vx);
                const turnRadPerSec = Math.PI * 1.5;
                const maxStep = turnRadPerSec * (dt / 1000);
                entityFacing[eid] = rotateAngleTowards(entityFacing[eid], moveAngle, maxStep);
            }
        }
    }
    update(dt, state, spatialFrame) {
        this.tickPropFrame(dt, state, spatialFrame);
        this.tickPropSubstep(dt);
    }
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

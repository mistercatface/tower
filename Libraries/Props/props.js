import { removeWorldPropFromState } from "../../GameState/EntityRegistry.js";
import { allocateEntityEid, bindEntitySlot, worldPropBindFlags } from "../../Core/entitySlots.js";
import { writeLivePolygon, releaseLivePolygon, CircleShape, stampKineticCircleRadius, wakeKineticBody, applyVelocityDamping, integratePropMotion, kineticInertiaFromBody, normalizeKineticBody, quantizeRollQuatF32, packRollOrientId, applyCompoundFootprint, stampPrimitivePhysics, primitivePhysicsRow, primitiveDragFrictionEid, computeFootprintIdFromSlab } from "../Physics/physics.js";
import { entityX, entityY, entityVx, entityVy, entityW, entityFacing, entityR, entityRollQw, entityRollQx, entityRollQy, entityRollQz, entityAgeMs, entityFlags, entityRefs, kineticDynamicSlab, entityHeight, entityAlpha, entityShapeKind, entityWallProfileId, entityWallHeightPx, getProfileId, getProfileStr, entityFractureCooldown, entityCachedStaticKey, entityFootprintId, entityRenderKeyId } from "../../Core/engineMemory.js";
import { SHAPE_TYPE_CIRCLE, SHAPE_TYPE_POLYGON, ENTITY_FLAG_ROLLS, ENTITY_FLAG_ORIENT_TO_MOTION, PROP_PRIMITIVE_SPHERE, PROP_PRIMITIVE_POLYGON, PROP_PRIMITIVE_COUNT, PROP_DRAW_WALL_CHUNK, PROP_RENDER_MODE_NONE, PROP_RENDER_MODE_3D, ENTITY_FLAG_DEAD, ENTITY_FLAG_FRACTURE_SET, ENTITY_FLAG_FRACTURE_VAL, ENTITY_KIND_NONE } from "../../Core/engineEnums.js";
import { ensureFlatVerts, convexFootprintHalfExtents, vertCount, quantizeAngle, rotateAngleTowards, deterministicUnitRandom, polygonIsConvex } from "../Math/math.js";
import { ENGINE_F32, M_VEC_A, M_OUT_QW, M_OUT_QX, M_OUT_QY, M_OUT_QZ } from "../../Core/engineMemory.js";
import { drawSphere, drawFlatSphereDisc, createWallChunkDraw, DEFAULT_PROP_HEIGHT } from "../Render/render.js";
import { drawFloorOccupancyBelts } from "../Spatial/belts.js";
import { drawFloorPortals } from "../Spatial/portals.js";
import { transitionEntity } from "../FSM/transition.js";
import propCatalog, { propCatalogByRenderKeyId } from "../../Assets/props/index.js";
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
const sQuantizeSteps = { facing: 0, view: 0 };
const sHalfExtents = { x: 0, y: 0 };
const sStageProp = { x: 0, y: 0, radius: 0, facing: 0, rollQw: 1, rollQx: 0, rollQy: 0, rollQz: 0, halfExtents: sHalfExtents, strategy: null, type: null, shape: null, collisionParts: null, drawOutline: null, height: undefined, ageMs: 0, id: 0, wallChunkProfileId: null, wallChunkHeightPx: undefined };
function deriveFacingStepsFromFootprintEid(eid, baselineSteps) {
    const shapeKind = entityShapeKind[eid];
    let worldDiameter;
    if (shapeKind === SHAPE_TYPE_POLYGON) {
        const hx = kineticDynamicSlab.hx[eid];
        const hy = kineticDynamicSlab.hy[eid];
        worldDiameter = Math.max(hx, hy) * 2;
    } else worldDiameter = entityR[eid] * 2;
    if (worldDiameter <= FACING_STEPS_BASELINE_DIAMETER) return baselineSteps;
    const scaled = Math.round((baselineSteps * worldDiameter * 6) / FACING_STEPS_BASELINE_DIAMETER);
    return Math.min(FACING_STEPS_MAX, scaled);
}
export function resolvePropQuantizeSteps(eid) {
    const defaults = propQuantizeSteps;
    const renderKeyId = entityRenderKeyId[eid];
    const asset = propCatalogByRenderKeyId[renderKeyId];
    const override = asset?.physics?.quantizeSteps;
    const derivedFacing = deriveFacingStepsFromFootprintEid(eid, defaults.facing);
    sQuantizeSteps.facing = override?.facing ?? derivedFacing;
    sQuantizeSteps.view = override?.view ?? defaults.view ?? 30;
    return sQuantizeSteps;
}
export function getBaseSpriteCacheId(eid, deps) {
    const { quantizeAngleIndex } = deps;
    const steps = resolvePropQuantizeSteps(eid);
    let orient;
    if ((entityFlags[eid] & ENTITY_FLAG_ROLLS) !== 0) orient = packRollOrientId(eid, steps.facing);
    else orient = quantizeAngleIndex(entityFacing[eid], steps.facing);
    const foot = entityFootprintId[eid];
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
    const steps = resolvePropQuantizeSteps(eid);
    sStageProp.x = entityX[eid];
    sStageProp.y = entityY[eid];
    sStageProp.radius = entityR[eid];
    sHalfExtents.x = ENGINE_F32[M_VEC_A];
    sHalfExtents.y = ENGINE_F32[M_VEC_A + 1];
    sStageProp.facing = quantizeAngle(entityFacing[eid], steps.facing);
    if (prop.strategy?.rolls) {
        quantizeRollQuatF32(entityRollQw[eid], entityRollQx[eid], entityRollQy[eid], entityRollQz[eid], steps.facing);
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
        this._physId = allocateEntityEid();
        this.initializeSpawn(x, y, type, facing);
        this.changeState("normal");
    }
    initializeSpawn(x, y, type, facing = null) {
        const asset = propCatalog[type];
        this.type = type;
        this.strategy = sharedWorldPropStrategy(type);
        
        const eid = this._physId;
        entityRefs[eid] = this;

        this.stateData = {};
        this.height = resolveAssetPropHeight(asset);
        this.collisionParts = undefined;
        this.spawnGroupId = undefined;

        releaseLivePolygon(this);
        this.shape = undefined;
        this.drawOutline = undefined;
        this.footprintArea = undefined;

        stampSurfaceProfileFields(this, asset);
        initWorldPropShape(this);

        const spawnFacing = resolvePropSpawnFacing(this, facing);
        
        this.facing = spawnFacing;
        this.rollQw = 1;
        this.rollQx = 0;
        this.rollQy = 0;
        this.rollQz = 0;
        this.isSleeping = false;
        this._sleepFrames = 0;
        this.ageMs = 0;
        this.alpha = 1.0;
        this._fractureCooldown = 0;

        const flags = worldPropBindFlags(this);

        bindEntitySlot(eid, ENTITY_KIND_NONE, this, this.id, x, y, this.radius, flags);

        this.fractureEnabled = this.strategy.fracture ? undefined : false;

        invalidateEntityFootprint(eid);
    }
    get isDead() {
        return (entityFlags[this._physId] & ENTITY_FLAG_DEAD) !== 0;
    }
    set isDead(v) {
        if (v) entityFlags[this._physId] |= ENTITY_FLAG_DEAD;
        else entityFlags[this._physId] &= ~ENTITY_FLAG_DEAD;
    }
    get fractureEnabled() {
        const flags = entityFlags[this._physId];
        if ((flags & ENTITY_FLAG_FRACTURE_SET) === 0) return undefined;
        return (flags & ENTITY_FLAG_FRACTURE_VAL) !== 0;
    }
    set fractureEnabled(v) {
        if (v === undefined) {
            if (this.strategy?.fracture) {
                entityFlags[this._physId] |= (ENTITY_FLAG_FRACTURE_SET | ENTITY_FLAG_FRACTURE_VAL);
            } else {
                entityFlags[this._physId] &= ~(ENTITY_FLAG_FRACTURE_SET | ENTITY_FLAG_FRACTURE_VAL);
            }
        } else {
            entityFlags[this._physId] |= ENTITY_FLAG_FRACTURE_SET;
            if (v) entityFlags[this._physId] |= ENTITY_FLAG_FRACTURE_VAL;
            else entityFlags[this._physId] &= ~ENTITY_FLAG_FRACTURE_VAL;
        }
    }
    get _fractureCooldown() {
        return entityFractureCooldown[this._physId];
    }
    set _fractureCooldown(v) {
        entityFractureCooldown[this._physId] = v;
    }
    get height() {
        return entityHeight[this._physId];
    }
    set height(v) {
        entityHeight[this._physId] = v;
    }
    get alpha() {
        return entityAlpha[this._physId];
    }
    set alpha(v) {
        entityAlpha[this._physId] = v;
    }
    get wallChunkProfileId() {
        return getProfileStr(entityWallProfileId[this._physId]);
    }
    set wallChunkProfileId(v) {
        entityWallProfileId[this._physId] = getProfileId(v);
    }
    get wallChunkHeightPx() {
        return entityWallHeightPx[this._physId];
    }
    set wallChunkHeightPx(v) {
        entityWallHeightPx[this._physId] = v;
    }
    get x() {
        return entityX[this._physId];
    }
    set x(v) {
        entityX[this._physId] = v;
    }
    get y() {
        return entityY[this._physId];
    }
    set y(v) {
        entityY[this._physId] = v;
    }
    get vx() {
        return entityVx[this._physId];
    }
    set vx(v) {
        entityVx[this._physId] = v;
    }
    get vy() {
        return entityVy[this._physId];
    }
    set vy(v) {
        entityVy[this._physId] = v;
    }
    get angularVelocity() {
        return entityW[this._physId];
    }
    set angularVelocity(v) {
        entityW[this._physId] = v;
    }
    get facing() {
        return entityFacing[this._physId];
    }
    set facing(v) {
        entityFacing[this._physId] = v;
    }
    get rollQw() {
        return entityRollQw[this._physId];
    }
    set rollQw(v) {
        entityRollQw[this._physId] = v;
    }
    get rollQx() {
        return entityRollQx[this._physId];
    }
    set rollQx(v) {
        entityRollQx[this._physId] = v;
    }
    get rollQy() {
        return entityRollQy[this._physId];
    }
    set rollQy(v) {
        entityRollQy[this._physId] = v;
    }
    get rollQz() {
        return entityRollQz[this._physId];
    }
    set rollQz(v) {
        entityRollQz[this._physId] = v;
    }
    get ageMs() {
        return entityAgeMs[this._physId];
    }
    set ageMs(v) {
        entityAgeMs[this._physId] = v;
    }
    get isSleeping() {
        return kineticDynamicSlab.sleeping[this._physId] !== 0;
    }
    set isSleeping(v) {
        kineticDynamicSlab.sleeping[this._physId] = v ? 1 : 0;
    }
    get _sleepFrames() {
        return kineticDynamicSlab.sleepFrames[this._physId];
    }
    set _sleepFrames(v) {
        kineticDynamicSlab.sleepFrames[this._physId] = v;
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

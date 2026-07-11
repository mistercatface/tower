import { removeWorldPropFromState, addWorldPropsToState } from "../../GameState/EntityRegistry.js";
import { PolygonShape, writeLivePolygon, ensureLivePolygonCapacity, releaseLivePolygon, getEntityCollisionParts, resolveBodyRadius, CircleShape, markBroadphaseDirty, kineticMassFromFootprint, wakeKineticBody, pruneKineticConstraintsForBody, entityFacing, kineticDynamicSlab, KINETIC_PAIR_TIER, IDENTITY_ROLL_QUAT, applyVelocityDamping, integratePropMotion, isKinematicallyActive, kineticInertiaFromBody, normalizeKineticBody } from "../Physics/physics.js";
import { entityX, entityY, entityVx, entityVy, entityW, entityFacing as entityFacingCol } from "../Entity/entitySlots.js";
import { ensureFlatVerts, quantizeAngleIndex, boxLocalFootprint, convexFootprintHalfExtents, vertCount, quantizeAngle, rotateXYIntoF32, quantizeCardinalAngle, rotateAngleTowards, deterministicUnitRandom, ENGINE_F32, M_VEC_A, MAX_OUTLINE_VERTS, crossPinwheelOutlineInto } from "../Math/math.js";
import { drawExtrudedConvexPolygon, drawExtrudedCompoundPolygon, drawSphere } from "../Render/render.js";
import { drawFloorOccupancyBelts } from "../Spatial/belts.js";
import { drawFloorPortals } from "../Spatial/portals.js";
import { resolveVisualOverrideColorTree, resolveVisualOverridePanels, visualOverrideCacheKey } from "../Color/visualOverride.js";
import { NEUTRAL_BOX_COLORS } from "../../Assets/props/shared/neutralCoats.js";
import { transitionEntity } from "../FSM/transition.js";
import propCatalog from "../../Assets/props/index.js";
/** @typedef {typeof LIBRARY_PROP_QUANTIZE_STEPS} LibraryPropQuantizeSteps */
/** Crate-sized facing baseline (16 steps); larger footprints scale up in resolvePropQuantizeSteps. Optional overrides: strategy.quantizeSteps, gameDefinition.propQuantizeSteps. */
export const LIBRARY_PROP_QUANTIZE_STEPS = { facing: 16, view: 30 };
export const propQuantizeSteps = structuredClone(LIBRARY_PROP_QUANTIZE_STEPS);
export function formatPropTypeLabel(typeId) {
    return (typeId ?? "prop").replace(/_/g, " ");
}
export function formatSandboxSpawnLabel(propId) {
    const asset = propCatalog[propId];
    return asset?.sandbox?.spawnLabel ?? formatPropTypeLabel(propId);
}
export function createPolygonPrimitive(visuals) {
    const { colors, world, plankTs, topCross, lineWidth } = visuals;
    return (ctx, prop, viewport) => {
        const shape = prop.shape;
        if (shape?.type !== "Polygon") return;
        const tinted = resolveVisualOverrideColorTree(prop, colors);
        const height = prop.height ?? world?.height ?? 12;
        const asset = propCatalog[prop.type];
        let scale = 1.0;
        const rawFootprint = prop.strategy?.localFootprint ?? asset?.physics?.localFootprint;
        if (rawFootprint) {
            const footprint = ensureFlatVerts(rawFootprint);
            let maxDist = 0;
            const count = footprint.length / 2;
            for (let i = 0; i < count; i++) maxDist = Math.max(maxDist, Math.hypot(footprint[i * 2], footprint[i * 2 + 1]));
            if (maxDist > 0 && prop.radius) scale = prop.radius / maxDist;
        }
        const baseLineWidth = lineWidth ?? 1.0;
        const resolvedLineWidth = Math.max(0.35, baseLineWidth * scale);
        fillExtrudeDrawOpts(sDrawOpts, prop, tinted, height, resolvedLineWidth, plankTs, topCross, visuals.flatFill === true);
        if (prop.drawOutline) {
            sDrawOpts.localVerts = prop.drawOutline;
            sDrawOpts.faceOrder = "midY";
            drawExtrudedConvexPolygon(ctx, prop, viewport, sDrawOpts);
            return;
        }
        const parts = getEntityCollisionParts(prop);
        if (parts.length > 1) {
            sPartsVerts.length = parts.length;
            for (let i = 0; i < parts.length; i++) sPartsVerts[i] = parts[i].vertices;
            sDrawOpts.partsVerts = sPartsVerts;
            drawExtrudedCompoundPolygon(ctx, prop, viewport, sDrawOpts);
        } else if (parts.length === 1) {
            sDrawOpts.localVerts = parts[0].vertices;
            sDrawOpts.faceOrder = "convexCull";
            drawExtrudedConvexPolygon(ctx, prop, viewport, sDrawOpts);
        }
    };
}
export function createSpherePrimitive(visuals) {
    return (ctx, prop, viewport) => {
        const shape = prop.shape;
        if (shape?.type === "Polygon") {
            const tinted = resolveVisualOverrideColorTree(prop, NEUTRAL_BOX_COLORS);
            const height = prop.height ?? 12;
            fillExtrudeDrawOpts(sDrawOpts, prop, tinted, height, 1.0, null, null, false);
            const parts = getEntityCollisionParts(prop);
            if (parts.length > 1) {
                sPartsVerts.length = parts.length;
                for (let i = 0; i < parts.length; i++) sPartsVerts[i] = parts[i].vertices;
                sDrawOpts.partsVerts = sPartsVerts;
                drawExtrudedCompoundPolygon(ctx, prop, viewport, sDrawOpts);
            } else if (parts.length === 1) {
                sDrawOpts.localVerts = parts[0].vertices;
                sDrawOpts.faceOrder = "convexCull";
                drawExtrudedConvexPolygon(ctx, prop, viewport, sDrawOpts);
            }
            return;
        }
        drawSphere(ctx, prop, viewport, { baseRadius: resolveBodyRadius(prop, visuals.defaultRadius ?? 7), panelCount: visuals.panelCount, latBands: visuals.latBands, panelColors: resolveVisualOverridePanels(prop, visuals.panels), stroke: visuals.stroke });
    };
}
/** @type {Record<string, (visuals: object, opts?: object) => Function>} */
export const PROP_PRIMITIVE_BUILDERS = { sphere: createSpherePrimitive, polygon: createPolygonPrimitive };
export function getPolygonPropBoundingRadius(prop) {
    const shape = prop.shape;
    if (shape?.type === "Polygon") return shape.getBoundingRadius();
    return prop.radius ?? null;
}
const POLYGON_SCALE_SCRATCH = new Float32Array(1024);
export function scalePolygonPropFootprint(prop, scale) {
    if (scale <= 0) throw new Error(`Polygon prop scale must be > 0, got ${scale}`);
    const shape = prop.shape;
    if (shape?.type !== "Polygon") throw new Error(`scalePolygonPropFootprint requires a polygon prop, got ${shape?.type ?? "none"}`);
    const n = shape.vertices.length;
    const verts = shape.vertices;
    for (let i = 0; i < n; i++) POLYGON_SCALE_SCRATCH[i] = verts[i] * scale;
    writeLivePolygon(prop, POLYGON_SCALE_SCRATCH, n);
    if (prop.height != null) prop.height *= scale;
    prop.stateTimer = (prop.stateTimer ?? 0) + 1;
    invalidatePropFootprintKey(prop);
    markBroadphaseDirty(prop);
    prop.mass = kineticMassFromFootprint(prop);
    normalizeKineticBody(prop);
    wakeKineticBody(prop);
}
export function setPolygonPropBoundingRadius(prop, boundingRadius) {
    const currentRadius = getPolygonPropBoundingRadius(prop);
    if (!currentRadius || currentRadius <= 0) throw new Error(`setPolygonPropBoundingRadius requires a polygon prop with positive radius, got ${currentRadius}`);
    scalePolygonPropFootprint(prop, boundingRadius / currentRadius);
}
export function getCirclePropRadius(prop) {
    const shape = prop.shape;
    if (shape?.type === "Circle") return shape.radius;
    return prop.radius ?? null;
}
export function setCirclePropRadius(prop, radius) {
    if (radius <= 0) throw new Error(`Circle prop radius must be > 0, got ${radius}`);
    const shape = prop.shape;
    if (shape?.type !== "Circle") throw new Error(`setCirclePropRadius requires a circle prop, got ${shape?.type ?? "none"}`);
    prop.shape = new CircleShape(radius);
    prop.radius = radius;
    invalidatePropFootprintKey(prop);
    markBroadphaseDirty(prop);
    prop.mass = kineticMassFromFootprint(prop);
    normalizeKineticBody(prop);
    wakeKineticBody(prop);
}
/** Shared defaults for world prop strategies (WorldProp reads these via buildWorldPropStrategyFromAsset). */
export const PROP_STRATEGY_DEFAULTS = { isKinetic: true, renderMode: "3d", render3DKey: null, inspectKey: null, friction: 8, wallPhysics: null, rolls: false, orientToMotion: false };
export function invalidatePropFootprintKey(prop) {
    prop._footprintKey = undefined;
}
export function applyPropBoxFootprint(prop, hx, hy) {
    const n = 8;
    ensureLivePolygonCapacity(prop, n);
    const fp = prop._liveGeom.verts;
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
    prop.mass = kineticMassFromFootprint(prop);
    normalizeKineticBody(prop);
}
export function ensureDrawOutline(prop, floatCount) {
    if (floatCount > MAX_OUTLINE_VERTS * 2) throw new Error(`ensureDrawOutline: ${floatCount} floats exceeds MAX_OUTLINE_VERTS*2 (${MAX_OUTLINE_VERTS * 2})`);
    if (!prop.drawOutline || prop.drawOutline.length < floatCount) prop.drawOutline = new Float32Array(floatCount);
    return prop.drawOutline;
}
export function initWorldPropShape(prop) {
    if (prop.strategy.collisionParts) {
        releaseLivePolygon(prop);
        prop.collisionParts = prop.strategy.collisionParts.map((part) => {
            if (typeof part.getBoundingRadius === "function") return part;
            if (part.type === "Polygon") return new PolygonShape(part.vertices);
            if (part.type === "Circle") return new CircleShape(part.radius);
            throw new Error(`Unknown collision part type: ${part.type}`);
        });
        let maxR = 0;
        for (let i = 0; i < prop.collisionParts.length; i++) maxR = Math.max(maxR, prop.collisionParts[i].getBoundingRadius());
        prop.radius = maxR;
        prop.shape = prop.collisionParts[0];
        invalidatePropFootprintKey(prop);
        return;
    }
    const template = prop.strategy.localFootprint;
    if (template && vertCount(template) >= 3) {
        const n = template.length;
        writeLivePolygon(prop, template, n);
        if (prop.strategy.drawOutline === true) {
            const verts = prop.shape.vertices;
            ensureDrawOutline(prop, verts.length).set(verts);
        }
        invalidatePropFootprintKey(prop);
        return;
    }
    releaseLivePolygon(prop);
    prop.radius = prop.strategy.radius ?? 0;
    prop.shape = new CircleShape(prop.radius);
    invalidatePropFootprintKey(prop);
}
export function propFootprintHalfExtentsInto(buf, o, prop) {
    const shape = prop.shape;
    if (shape?.type === "Polygon") {
        convexFootprintHalfExtents(buf, o, shape.vertices);
        return;
    }
    const radius = shape?.type === "Circle" ? shape.radius : (prop.radius ?? prop.strategy?.radius ?? 0);
    buf[o] = radius;
    buf[o + 1] = radius;
}
function propShapeFootprintKey(prop) {
    if (prop._footprintKey !== undefined) return prop._footprintKey;
    const shape = prop.shape;
    let key;
    if (shape?.type === "Polygon") {
        let hash = 2166136261;
        const verts = shape.vertices;
        const count = verts.length;
        for (let i = 0; i < count; i++) {
            const q = Math.round(verts[i]);
            hash ^= q;
            hash = Math.imul(hash, 16777619);
        }
        key = `p${hash >>> 0}`;
        if (prop.chunks?.length) key += `_ch${prop.chunks.length}`;
    } else {
        const radius = shape?.type === "Circle" ? shape.radius : (prop.radius ?? 0);
        key = `c${Math.round(radius * 4)}`;
    }
    prop._footprintKey = key;
    return key;
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
const sStageProp = Object.create(null);
const sStagePropKeys = [];
const sFaceColors = { shadow: null, mid: null, highlight: null };
const sBackFaceColors = { shadow: null, mid: null, highlight: null };
const sBottomColors = { light: null, mid: null, dark: null };
const sTopColors = { light: null, mid: null, dark: null };
const sPartsVerts = [];
const sDrawOpts = { height: 0, facing: 0, faceColors: sFaceColors, backFaceColors: sBackFaceColors, bottomColors: null, topColors: sTopColors, stroke: null, seamStroke: null, lineWidth: 1, plankTs: null, topCross: null, flatFill: false, localVerts: null, partsVerts: null, faceOrder: "convexCull" };
function fillExtrudeDrawOpts(out, prop, tinted, height, lineWidth, plankTs, topCross, flatFill) {
    out.height = height;
    out.facing = entityFacing(prop);
    sFaceColors.shadow = tinted.sideShadow;
    sFaceColors.mid = tinted.side;
    sFaceColors.highlight = tinted.top;
    sBackFaceColors.shadow = tinted.sideShadow;
    sBackFaceColors.mid = tinted.sideShadow;
    sBackFaceColors.highlight = tinted.side;
    if (tinted.bottom) {
        sBottomColors.light = tinted.sideShadow;
        sBottomColors.mid = tinted.bottom;
        sBottomColors.dark = tinted.sideShadow;
        out.bottomColors = sBottomColors;
        sTopColors.light = tinted.topHighlight ?? tinted.top;
        sTopColors.mid = tinted.top;
        sTopColors.dark = tinted.side;
    } else {
        out.bottomColors = null;
        sTopColors.light = tinted.top;
        sTopColors.mid = tinted.top;
        sTopColors.dark = tinted.side;
    }
    out.topColors = sTopColors;
    out.stroke = tinted.stroke;
    out.seamStroke = tinted.seamStroke;
    out.lineWidth = lineWidth;
    out.plankTs = plankTs;
    out.topCross = topCross;
    out.flatFill = flatFill === true;
    out.localVerts = null;
    out.partsVerts = null;
    out.faceOrder = "convexCull";
    return out;
}
export function resolvePropQuantizeSteps(prop) {
    const defaults = propQuantizeSteps;
    const override = prop.strategy?.quantizeSteps;
    const derivedFacing = deriveFacingStepsFromFootprint(prop, defaults.facing);
    sQuantizeSteps.facing = override?.facing ?? derivedFacing;
    sQuantizeSteps.view = override?.view ?? defaults.view ?? 30;
    return sQuantizeSteps;
}
export function getBaseSpriteCacheKey(prop, deps) {
    const { quantizeAngleIndex, buildRollOrientKey } = deps;
    const steps = resolvePropQuantizeSteps(prop);
    let orientKey = "";
    if (prop.strategy?.rolls) orientKey = buildRollOrientKey(prop.rollQuat, steps.facing);
    else orientKey = `f${quantizeAngleIndex(entityFacing(prop), steps.facing)}`;
    let key = `${orientKey}_${propShapeFootprintKey(prop)}`;
    key += visualOverrideCacheKey(prop);
    return key;
}
export function getPropStageBakeState(prop, deps) {
    const { quantizeAngle, quantizeRollQuat } = deps;
    propFootprintHalfExtentsInto(ENGINE_F32, M_VEC_A, prop);
    const steps = resolvePropQuantizeSteps(prop);
    for (let i = 0; i < sStagePropKeys.length; i++) delete sStageProp[sStagePropKeys[i]];
    sStagePropKeys.length = 0;
    Object.assign(sStageProp, prop);
    for (const k of Object.keys(sStageProp)) sStagePropKeys.push(k);
    sStageProp.x = prop.x;
    sStageProp.y = prop.y;
    sStageProp.radius = prop.radius;
    sHalfExtents.x = ENGINE_F32[M_VEC_A];
    sHalfExtents.y = ENGINE_F32[M_VEC_A + 1];
    sStageProp.halfExtents = sHalfExtents;
    sStageProp.facing = quantizeAngle(entityFacing(prop), steps.facing);
    sStageProp.rollQuat = prop.strategy?.rolls ? quantizeRollQuat(prop.rollQuat, steps.facing) : prop.rollQuat;
    return sStageProp;
}
export function buildWorldPropStrategyFromAsset(asset) {
    if (!asset?.physics) {
        const strategy = { ...PROP_STRATEGY_DEFAULTS };
        if (asset?.sandbox?.gridFloorBelt) strategy.isKinetic = false;
        return strategy;
    }
    const { spawn, renderMode, ...strategy } = asset.physics;
    if (strategy.localFootprint) strategy.localFootprint = new Float32Array(ensureFlatVerts(strategy.localFootprint));
    if (strategy.collisionParts)
        strategy.collisionParts = strategy.collisionParts.map((part) => {
            if (part.type === "Polygon" && part.vertices) return { ...part, vertices: new Float32Array(ensureFlatVerts(part.vertices)) };
            return part;
        });
    const built = { ...PROP_STRATEGY_DEFAULTS, render3DKey: asset.id, renderMode: renderMode ?? "3d", inspectKey: null, ...strategy };
    if (asset.sandbox?.gridFloorBelt) built.isKinetic = false;
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
    if (facing != null) return prop.strategy.cardinalFacing ? quantizeCardinalAngle(facing) : facing;
    if (prop.strategy.cardinalFacing) return quantizeCardinalAngle(0);
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
        this.ageMs = 0;
        this._sleepFrames = 0;
        this.isSleeping = false;
        this.stateTimer = 0;
        this.stateData = {};
        this.height = asset?.visuals?.world?.height ?? 12;
        this._spawnFacing = resolvePropSpawnFacing(this, facing);
        if (this.strategy.rolls) this.rollQuat = { ...IDENTITY_ROLL_QUAT };
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
        this._wallChunkTextures = undefined;
        this._wallChunkTextureReady = undefined;
        this._footprintKey = undefined;
        initWorldPropShape(this);
        if (type === "cross_pinwheel") applyCrossPinwheelFootprint(this, this.crossLength ?? 32, this.crossThickness ?? 8);
        this.mass = kineticMassFromFootprint(this);
        normalizeKineticBody(this);
        this._linkNeighborEidCount = 0;
        this._kineticIslandPeers = null;
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
        return eid !== undefined ? entityFacingCol[eid] : this._spawnFacing;
    }
    set facing(v) {
        const eid = this._physId;
        if (eid !== undefined) entityFacingCol[eid] = v;
        else this._spawnFacing = v;
    }
    get momentOfInertia() {
        return kineticInertiaFromBody(this);
    }
    changeState(stateName, stateDataInit = null) {
        if (this.strategy?.isKinetic) wakeKineticBody(this);
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
        else applyVelocityDamping(this, dt, { friction: this.strategy.friction });
        if (this.strategy.orientToMotion) {
            const speed = Math.hypot(this.vx, this.vy);
            if (speed > 0.1) {
                const moveAngle = Math.atan2(this.vy, this.vx);
                const turnRadPerSec = Math.PI * 1.5;
                const maxStep = turnRadPerSec * (dt / 1000);
                this.facing = rotateAngleTowards(entityFacing(this), moveAngle, maxStep);
            }
        }
    }
    update(dt, state, spatialFrame) {
        this.tickPropFrame(dt, state, spatialFrame);
        this.tickPropSubstep(dt);
    }
}
export function applyCrossPinwheelFootprint(prop, length, thickness) {
    const halfL = length / 2;
    const halfT = thickness / 2;
    releaseLivePolygon(prop);
    prop.collisionParts = [new PolygonShape(boxLocalFootprint(halfL, halfT)), new PolygonShape(boxLocalFootprint(halfT, halfL))];
    prop.shape = prop.collisionParts[0];
    prop.radius = Math.hypot(halfL, halfT);
    prop.crossLength = length;
    prop.crossThickness = thickness;
    crossPinwheelOutlineInto(ensureDrawOutline(prop, 24), length, thickness);
    invalidatePropFootprintKey(prop);
    markBroadphaseDirty(prop);
    prop.mass = kineticMassFromFootprint(prop);
    normalizeKineticBody(prop);
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
 * @property {boolean} [inheritTint] When true, child receives parent visualOverride.
 */
function normalizeAttachmentScale(scale) {
    return Number.isFinite(scale) && scale > 0 ? scale : 1;
}
function resolveAttachmentHeading(prop, cfg) {
    if (cfg.heading === "velocity") {
        const vx = prop.vx ?? 0;
        const vy = prop.vy ?? 0;
        const speed = Math.hypot(vx, vy);
        const minSpeed = cfg.minHeadingSpeed ?? 0.25;
        if (speed >= minSpeed) return Math.atan2(vy, vx);
    }
    return entityFacing(prop);
}
function resolveQuantizedAttachmentHeading(prop, cfg) {
    return quantizeAngle(resolveAttachmentHeading(prop, cfg), resolvePropQuantizeSteps(prop).facing);
}
function resolveAttachmentOffsetScale(parentProp, cfg) {
    return cfg.offsetSpace === "parentRadius" ? resolveBodyRadius(parentProp) : 1;
}
function scaleVirtualPropShape(prop, scale) {
    if (scale === 1) return;
    const shape = prop.shape;
    if (shape?.type === "Circle") {
        prop.shape = new CircleShape(shape.radius * scale);
        prop.radius = prop.shape.radius;
        if (prop.height != null) prop.height *= scale;
        invalidatePropFootprintKey(prop);
        return;
    }
    if (shape?.type === "Polygon") {
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
    const childRadius = Math.max(resolveBodyRadius(childProp), ENGINE_F32[M_VEC_A], ENGINE_F32[M_VEC_A + 1]);
    if (childRadius <= 0) return baseScale;
    return baseScale * ((resolveBodyRadius(parentProp) * cfg.radiusScale) / childRadius);
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
    const attachments = getPropVisualAttachmentConfigs(prop);
    if (!attachments.length) return "";
    const facingSteps = resolvePropQuantizeSteps(prop).facing;
    const parts = [];
    for (let i = 0; i < attachments.length; i++) {
        const cfg = attachments[i];
        if (!cfg?.id || !cfg.propId) continue;
        const headingIndex = deps.quantizeAngleIndex(resolveAttachmentHeading(prop, cfg), facingSteps);
        const offset = cfg.offset ?? {};
        parts.push([cfg.id, cfg.propId, headingIndex, Math.round((offset.x ?? 0) * 100) / 100, Math.round((offset.y ?? 0) * 100) / 100, cfg.offsetSpace ?? "world", Math.round((cfg.facingOffset ?? 0) * 10000) / 10000, Math.round(normalizeAttachmentScale(cfg.scale) * 100) / 100, Math.round((cfg.radiusScale ?? 0) * 100) / 100, cfg.heading ?? "facing", cfg.layer ?? 0, cfg.inheritTint === true ? visualOverrideCacheKey(prop) : ""].join(":"));
    }
    return parts.length ? parts.join("|") : "";
}
function createVirtualAttachmentProp(parentProp, cfg, heading) {
    const childAsset = propCatalog[cfg.propId];
    if (!childAsset) return null;
    const strategy = sharedWorldPropStrategy(cfg.propId);
    const offset = cfg.offset ?? {};
    const offsetScale = resolveAttachmentOffsetScale(parentProp, cfg);
    const localX = (offset.x ?? 0) * offsetScale;
    const localY = (offset.y ?? 0) * offsetScale;
    rotateXYIntoF32(ENGINE_F32, M_VEC_A, localX, localY, Math.cos(heading), Math.sin(heading));
    const prop = { type: cfg.propId, strategy, x: parentProp.x + ENGINE_F32[M_VEC_A], y: parentProp.y + ENGINE_F32[M_VEC_A + 1], facing: heading + (cfg.facingOffset ?? 0), height: childAsset.visuals?.world?.height ?? 12, visualOverride: cfg.inheritTint === true && parentProp.visualOverride ? { ...parentProp.visualOverride } : undefined, _visualAttachmentId: cfg.id, _footprintKey: undefined };
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
        const heading = cfg.heading === "velocity" ? resolveQuantizedAttachmentHeading(prop, cfg) : parentFacing;
        const child = createVirtualAttachmentProp({ ...prop, x: 0, y: 0, facing: parentFacing }, cfg, heading);
        if (!child) continue;
        propFootprintHalfExtentsInto(ENGINE_F32, M_VEC_A, child);
        const childRadius = Math.max(resolveBodyRadius(child), ENGINE_F32[M_VEC_A], ENGINE_F32[M_VEC_A + 1]);
        radius = Math.max(radius, Math.hypot(child.x, child.y) + childRadius);
    }
    return radius;
}
export function registerPropDrawRecipe(asset) {
    if (asset.physics?.renderMode === "none") {
        asset.drawRecipe = () => {};
        return;
    }
    if (typeof asset.draw === "function") {
        asset.drawRecipe = asset.draw;
        return;
    }
    if (asset.primitive) {
        const builder = PROP_PRIMITIVE_BUILDERS[asset.primitive];
        if (!builder) throw new Error(`Unknown primitive "${asset.primitive}" for asset "${asset.id}"`);
        asset.drawRecipe = builder(asset.visuals);
        return;
    }
    throw new Error(`Asset "${asset.id}" must define draw or primitive`);
}
queueMicrotask(() => {
    for (const asset of Object.values(propCatalog)) {
        if (!asset.physics) throw new Error(`Asset "${asset.id}" must include physics`);
        registerPropDrawRecipe(asset);
    }
});
/** @type {import("../../Core/GameDefinitionTypes.js").SimulationEffectPass} */
export const floorEffectPass = {
    zIndex: 10.5,
    draw(state, viewport, ctx) {
        drawFloorOccupancyBelts(ctx, state, viewport);
        drawFloorPortals(ctx, state, viewport);
    },
};

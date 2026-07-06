import { removeWorldPropFromState, addWorldPropsToState } from "../../GameState/EntityRegistry.js";
import { PolygonShape, getEntityCollisionParts, resolveBodyRadius, CircleShape, markBroadphaseDirty, kineticMassFromFootprint, wakeKineticBody, pruneKineticConstraintsForBody, entityFacing, kineticDynamicSlab, KINETIC_PAIR_TIER, IDENTITY_ROLL_QUAT, applyVelocityDamping, integratePropMotion, isKinematicallyActive, kineticInertiaFromBody } from "../Physics/physics.js";
import { transformPoint2DInto, ensureFlatVerts, quantizeAngleIndex, scaleFlatVerts, boxLocalFootprint, convexFootprintHalfExtents, vertCount, quantizeAngle, rotateXY, polygonCentroid2D, pointInPolygon, polygonSignedArea2D, closestPointOnLineSegment, quantizeCardinalAngle, rotateAngleTowards, deterministicUnitRandom } from "../Math/math.js";
import { drawExtrudedConvexPolygon, drawExtrudedCompoundPolygon, drawSphere } from "../Render/render.js";
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
        const drawOpts = { height, facing: prop.facing, faceColors: { shadow: tinted.sideShadow, mid: tinted.side, highlight: tinted.top }, backFaceColors: { shadow: tinted.sideShadow, mid: tinted.sideShadow, highlight: tinted.side }, bottomColors: tinted.bottom ? { light: tinted.sideShadow, mid: tinted.bottom, dark: tinted.sideShadow } : null, topColors: tinted.bottom ? { light: tinted.topHighlight ?? tinted.top, mid: tinted.top, dark: tinted.side } : { light: tinted.top, mid: tinted.top, dark: tinted.side }, stroke: tinted.stroke, seamStroke: tinted.seamStroke, lineWidth: resolvedLineWidth, plankTs, topCross };
        const parts = getEntityCollisionParts(prop);
        if (parts.length > 1) drawExtrudedCompoundPolygon(ctx, prop, viewport, { ...drawOpts, partsVerts: parts.map((p) => p.vertices) });
        else if (parts.length === 1) drawExtrudedConvexPolygon(ctx, prop, viewport, { ...drawOpts, localVerts: parts[0].vertices });
    };
}
export function createSpherePrimitive(visuals) {
    return (ctx, prop, viewport) => {
        const shape = prop.shape;
        if (shape?.type === "Polygon") {
            const tinted = resolveVisualOverrideColorTree(prop, NEUTRAL_BOX_COLORS);
            const height = prop.height ?? 12;
            const drawOpts = { height, facing: prop.facing, faceColors: { shadow: tinted.sideShadow, mid: tinted.side, highlight: tinted.top }, backFaceColors: { shadow: tinted.sideShadow, mid: tinted.sideShadow, highlight: tinted.side }, bottomColors: tinted.bottom ? { light: tinted.sideShadow, mid: tinted.bottom, dark: tinted.sideShadow } : null, topColors: tinted.bottom ? { light: tinted.topHighlight ?? tinted.top, mid: tinted.top, dark: tinted.side } : { light: tinted.top, mid: tinted.top, dark: tinted.side }, stroke: tinted.stroke, seamStroke: tinted.seamStroke, lineWidth: 1.0 };
            const parts = getEntityCollisionParts(prop);
            if (parts.length > 1) drawExtrudedCompoundPolygon(ctx, prop, viewport, { ...drawOpts, partsVerts: parts.map((p) => p.vertices) });
            else if (parts.length === 1) drawExtrudedConvexPolygon(ctx, prop, viewport, { ...drawOpts, localVerts: parts[0].vertices });
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
export function scalePolygonPropFootprint(prop, scale) {
    if (scale <= 0) throw new Error(`Polygon prop scale must be > 0, got ${scale}`);
    const shape = prop.shape;
    if (shape?.type !== "Polygon") throw new Error(`scalePolygonPropFootprint requires a polygon prop, got ${shape?.type ?? "none"}`);
    const scaled = new Float32Array(shape.vertices);
    scaleFlatVerts(scaled, scale);
    prop.shape = new PolygonShape(scaled);
    prop.radius = prop.shape.getBoundingRadius();
    if (prop.strategy?.localFootprint) scaleFlatVerts(prop.strategy.localFootprint, scale);
    if (prop.height != null) prop.height *= scale;
    prop.stateTimer = (prop.stateTimer ?? 0) + 1;
    markBroadphaseDirty(prop);
    if (prop.strategy?.isKinetic) {
        prop.mass = kineticMassFromFootprint(prop);
        wakeKineticBody(prop);
    }
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
    if (prop.strategy) prop.strategy.radius = radius;
    markBroadphaseDirty(prop);
    if (prop.strategy?.isKinetic) {
        prop.mass = kineticMassFromFootprint(prop);
        wakeKineticBody(prop);
    }
}
/** Shared defaults for world prop strategies (WorldProp reads these via buildWorldPropStrategyFromAsset). */
export const PROP_STRATEGY_DEFAULTS = { isKinetic: false, renderMode: "3d", render3DKey: null, inspectKey: null, friction: 8, wallPhysics: null, rolls: false, pinned: false };
export function applyPropBoxFootprint(prop, hx, hy) {
    prop.shape = new PolygonShape(boxLocalFootprint(hx, hy));
    prop.radius = prop.shape.getBoundingRadius();
    markBroadphaseDirty(prop);
    if (FractureEngine.shouldInitFractureFootprint(prop)) FractureEngine.initFractureFootprint(prop);
    else if (prop.strategy?.isKinetic) prop.mass = kineticMassFromFootprint(prop);
}
export function initWorldPropShape(prop) {
    if (prop.strategy.collisionParts) {
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
        return;
    }
    const footprint = prop.strategy.localFootprint;
    if (footprint && vertCount(footprint) >= 3) {
        prop.shape = new PolygonShape(footprint);
        prop.radius = prop.shape.getBoundingRadius();
        if (FractureEngine.shouldInitFractureFootprint(prop)) FractureEngine.initFractureFootprint(prop);
        return;
    }
    prop.radius = prop.strategy.radius ?? 0;
    prop.shape = new CircleShape(prop.radius);
}
export function propFootprintHalfExtents(prop) {
    const shape = prop.shape;
    if (shape?.type === "Polygon") return convexFootprintHalfExtents(shape.vertices);
    const radius = shape?.type === "Circle" ? shape.radius : (prop.radius ?? prop.strategy?.radius ?? 0);
    return { x: radius, y: radius };
}
function propShapeFootprintKey(prop) {
    const shape = prop.shape;
    if (shape?.type === "Polygon") {
        let hash = 2166136261;
        const verts = shape.vertices;
        const count = verts.length;
        for (let i = 0; i < count; i++) {
            const q = Math.round(verts[i]);
            hash ^= q;
            hash = Math.imul(hash, 16777619);
        }
        let key = `p${hash >>> 0}`;
        if (prop.chunks?.length) key += `_ch${prop.chunks.length}`;
        return key;
    }
    const radius = shape?.type === "Circle" ? shape.radius : (prop.radius ?? 0);
    return `c${Math.round(radius * 4)}`;
}
const FACING_STEPS_MAX = 360;
const FACING_STEPS_BASELINE_DIAMETER = 16;
function deriveFacingStepsFromFootprint(prop, baselineSteps) {
    const { x: hx, y: hy } = propFootprintHalfExtents(prop);
    const worldDiameter = Math.max(hx, hy) * 2;
    if (worldDiameter <= FACING_STEPS_BASELINE_DIAMETER) return baselineSteps;
    const scaled = Math.round((baselineSteps * worldDiameter * 6) / FACING_STEPS_BASELINE_DIAMETER);
    return Math.min(FACING_STEPS_MAX, scaled);
}
export function resolvePropQuantizeSteps(prop) {
    const defaults = propQuantizeSteps;
    const override = prop.strategy?.quantizeSteps;
    const derivedFacing = deriveFacingStepsFromFootprint(prop, defaults.facing);
    const facing = override?.facing ?? derivedFacing;
    const view = override?.view ?? defaults.view ?? 30;
    return { facing, view };
}
export function getBaseSpriteCacheKey(prop, deps) {
    const { quantizeAngleIndex, buildRollOrientKey } = deps;
    let orientKey = "";
    if (prop.strategy?.rolls) orientKey = buildRollOrientKey(prop.rollQuat, resolvePropQuantizeSteps(prop).facing);
    else orientKey = `f${quantizeAngleIndex(prop.facing ?? 0, resolvePropQuantizeSteps(prop).facing)}`;
    let key = `${orientKey}_${propShapeFootprintKey(prop)}`;
    key += visualOverrideCacheKey(prop);
    return key;
}
export function getPropStageBakeState(prop, deps) {
    const { quantizeAngle, quantizeRollQuat, anchorX, anchorY } = deps;
    const footprint = propFootprintHalfExtents(prop);
    return { ...prop, x: prop.x, y: prop.y, radius: prop.radius, halfExtents: footprint, facing: quantizeAngle(prop.facing ?? 0, resolvePropQuantizeSteps(prop).facing), rollQuat: prop.strategy?.rolls ? quantizeRollQuat(prop.rollQuat, resolvePropQuantizeSteps(prop).facing) : prop.rollQuat };
}
export function withPropStrategyDefaults(strategy) {
    return { ...PROP_STRATEGY_DEFAULTS, ...strategy };
}
export function buildWorldPropStrategyFromAsset(asset) {
    if (!asset?.physics) return withPropStrategyDefaults({});
    const { spawn, renderMode, ...strategy } = asset.physics;
    if (strategy.localFootprint) strategy.localFootprint = new Float32Array(ensureFlatVerts(strategy.localFootprint));
    if (strategy.collisionParts)
        strategy.collisionParts = strategy.collisionParts.map((part) => {
            if (part.type === "Polygon" && part.vertices) return { ...part, vertices: new Float32Array(ensureFlatVerts(part.vertices)) };
            return part;
        });
    return withPropStrategyDefaults({ render3DKey: asset.id, renderMode: renderMode ?? "3d", inspectKey: null, ...strategy });
}
let nextWorldPropId = 1;
const WORLD_PROP_MODES = Object.freeze({ normal: Object.freeze({}) });
function resolvePropSpawnFacing(prop, facing) {
    if (facing != null) return prop.strategy.cardinalFacing ? quantizeCardinalAngle(facing) : facing;
    if (prop.strategy.cardinalFacing) return quantizeCardinalAngle(0);
    return deterministicUnitRandom(Math.imul(prop.id, 2654435761)) * Math.PI * 2;
}
function resetWorldPropInstance(prop, x, y, type, facing = null) {
    const asset = propCatalog[type];
    prop.type = type;
    prop.strategy = buildWorldPropStrategyFromAsset(asset);
    prop.x = x;
    prop.y = y;
    prop.z = 0;
    prop.isDead = false;
    prop.vx = 0;
    prop.vy = 0;
    prop.angularVelocity = 0;
    prop.ageMs = 0;
    prop._sleepFrames = 0;
    prop.isSleeping = false;
    prop.stateTimer = 0;
    prop.stateData = {};
    prop.height = asset?.visuals?.world?.height ?? 12;
    prop.facing = resolvePropSpawnFacing(prop, facing);
    if (prop.strategy.rolls) prop.rollQuat = { ...IDENTITY_ROLL_QUAT };
    prop.chunks = undefined;
    prop.collisionParts = undefined;
    prop.snakeFoodValue = undefined;
    prop._fractureCooldown = 0;
    prop.faction = undefined;
    prop.spawnGroupId = undefined;
    prop.spawnGroupExportType = undefined;
    prop.spawnGroupAnchor = undefined;
    prop.shape = undefined;
    prop.footprintVertices = undefined;
    prop.footprintArea = undefined;
    prop.alpha = undefined;
    prop.wallChunkProfileId = undefined;
    prop.wallChunkHeightPx = undefined;
    prop._wallChunkTextures = undefined;
    prop._wallChunkTextureReady = undefined;
    initWorldPropShape(prop);
    if (prop.strategy.isKinetic) prop.mass = kineticMassFromFootprint(prop);
    if (prop._kineticLinkNeighbors) prop._kineticLinkNeighbors.length = 0;
    prop._kineticIslandPeers = null;
    if (prop._neighbors) prop._neighbors.length = 0;
    prop._neighborsFrameId = -1;
    delete prop._physId;
    delete prop._activeSlot;
    delete prop._fractureSpawned;
}
export class WorldProp {
    constructor(x, y, type, facing = null) {
        this.id = nextWorldPropId++;
        this.zIndex = 10;
        this._distSq = 0;
        this.shape = null;
        resetWorldPropInstance(this, x, y, type, facing);
        this.changeState("normal");
    }
    get momentOfInertia() {
        return kineticInertiaFromBody(this);
    }
    changeState(stateName, stateDataInit = null) {
        if (this.strategy?.isKinetic) wakeKineticBody(this);
        transitionEntity(this, WORLD_PROP_MODES, stateName, stateDataInit);
    }
    getCollisionParts() {
        return getEntityCollisionParts(this);
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
                if (state && spatialFrame) removeWorldPropFromState(state, this, spatialFrame, state.sandbox.entityMeta);
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
        if (this.type === "boid_triangle" || this.type === "snake") {
            const speed = Math.hypot(this.vx, this.vy);
            if (speed > 0.1) {
                const moveAngle = Math.atan2(this.vy, this.vx);
                const turnRadPerSec = Math.PI * 1.5;
                const maxStep = turnRadPerSec * (dt / 1000);
                this.facing = rotateAngleTowards(this.facing ?? moveAngle, moveAngle, maxStep);
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
    prop.collisionParts = [new PolygonShape(boxLocalFootprint(halfL, halfT)), new PolygonShape(boxLocalFootprint(halfT, halfL))];
    prop.shape = prop.collisionParts[0];
    prop.radius = Math.hypot(halfL, halfT);
    prop.crossLength = length;
    prop.crossThickness = thickness;
    markBroadphaseDirty(prop);
    if (prop.strategy?.isKinetic) prop.mass = kineticMassFromFootprint(prop);
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
    return prop.facing ?? 0;
}
function resolveQuantizedAttachmentHeading(prop, cfg) {
    return quantizeAngle(resolveAttachmentHeading(prop, cfg), resolvePropQuantizeSteps(prop).facing);
}
function resolveAttachmentOffsetScale(parentProp, cfg) {
    return cfg.offsetSpace === "parentRadius" ? resolveBodyRadius(parentProp) : 1;
}
function buildVirtualPropStrategy(type) {
    const asset = propCatalog[type];
    if (!asset) return null;
    return buildWorldPropStrategyFromAsset(asset);
}
function scaleVirtualPropShape(prop, scale) {
    if (scale === 1) return;
    const shape = prop.shape;
    if (shape?.type === "Circle") {
        prop.shape = new CircleShape(shape.radius * scale);
        prop.radius = prop.shape.radius;
        if (prop.height != null) prop.height *= scale;
        return;
    }
    if (shape?.type === "Polygon") {
        const count = shape.vertices.length;
        const scaled = new Float32Array(count);
        for (let i = 0; i < count; i++) scaled[i] = shape.vertices[i] * scale;
        prop.shape = new PolygonShape(scaled);
        prop.radius = prop.shape.getBoundingRadius();
        if (prop.height != null) prop.height *= scale;
    }
}
function resolveVirtualPropScale(parentProp, childProp, cfg) {
    const baseScale = normalizeAttachmentScale(cfg.scale);
    if (!Number.isFinite(cfg.radiusScale) || cfg.radiusScale <= 0) return baseScale;
    const footprint = propFootprintHalfExtents(childProp);
    const childRadius = Math.max(resolveBodyRadius(childProp), footprint.x, footprint.y);
    if (childRadius <= 0) return baseScale;
    return baseScale * ((resolveBodyRadius(parentProp) * cfg.radiusScale) / childRadius);
}
/** @param {object} prop */
export function getPropVisualAttachmentConfigs(prop) {
    const attachments = propCatalog[prop?.type]?.visuals?.attachments;
    return Array.isArray(attachments) ? attachments : [];
}
/** @param {object} prop */
export function hasPropVisualAttachments(prop) {
    return getPropVisualAttachmentConfigs(prop).length > 0;
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
    const strategy = buildVirtualPropStrategy(cfg.propId);
    if (!childAsset || !strategy) return null;
    const offset = cfg.offset ?? {};
    const offsetScale = resolveAttachmentOffsetScale(parentProp, cfg);
    const localX = (offset.x ?? 0) * offsetScale;
    const localY = (offset.y ?? 0) * offsetScale;
    const rotated = rotateXY(localX, localY, Math.cos(heading), Math.sin(heading));
    const prop = { type: cfg.propId, strategy, x: parentProp.x + rotated.x, y: parentProp.y + rotated.y, facing: heading + (cfg.facingOffset ?? 0), height: childAsset.visuals?.world?.height ?? 12, visualOverride: cfg.inheritTint === true && parentProp.visualOverride ? { ...parentProp.visualOverride } : undefined, _visualAttachmentId: cfg.id };
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
        const extents = propFootprintHalfExtents(child);
        const childRadius = Math.max(resolveBodyRadius(child), extents.x, extents.y);
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
export function registerAllPropDrawRecipes() {
    for (const asset of Object.values(propCatalog)) {
        if (!asset.physics) throw new Error(`Asset "${asset.id}" must include physics`);
        registerPropDrawRecipe(asset);
    }
}
queueMicrotask(registerAllPropDrawRecipes);
/** @type {import("../../Core/GameDefinitionTypes.js").SimulationEffectPass} */
export const floorBeltEffectPass = {
    zIndex: 10.5,
    draw(state, viewport, ctx, renderer) {
        renderer.render3D.drawFloorBelts(ctx, state, viewport);
    },
};
// ===== FRACTURE ENGINE =====
export const FRACTURE_TUNING = { shared: { impactThreshold: 12, minPieceSize: 5, cooldown: 8 }, glass: { impactThreshold: 6, minShardArea: 12, maxShardsPerShatter: 18, maxSliverAspect: 10, minWedgeAngle: Math.PI / 12 }, chunk: { minCell: 8, maxCellsPerAxis: 6, damageRadiusScale: 0.05, neighborRollHighForceThreshold: 12, neighborRollHighForceDivisor: 30, neighborRollLowForceBase: 0.1, neighborRollLowForceScale: 0.04, rectMergeEps: 1e-3 }, wallSpawn: { forceBias: 10 }, burst: { maxBurst: 35, baseBurst: 8, burstForceScale: 0.12, spinScale: 0.4 } };
export const CHUNK_MIN_CELL = FRACTURE_TUNING.chunk.minCell;
export const CHUNK_MAX_CELLS_PER_AXIS = FRACTURE_TUNING.chunk.maxCellsPerAxis;
export const GLASS_FRACTURE_IMPACT_THRESHOLD = FRACTURE_TUNING.glass.impactThreshold;
export const GLASS_MIN_SHARD_AREA = FRACTURE_TUNING.glass.minShardArea;
export const GLASS_MAX_SHARDS_PER_SHATTER = FRACTURE_TUNING.glass.maxShardsPerShatter;
export const GLASS_MAX_SLIVER_ASPECT = FRACTURE_TUNING.glass.maxSliverAspect;
export const GLASS_MIN_WEDGE_ANGLE = FRACTURE_TUNING.glass.minWedgeAngle;
export const GLASS_FRACTURE_COOLDOWN_STEPS = FRACTURE_TUNING.shared.cooldown;
export const FRACTURE_MIN_PIECE_SIZE = FRACTURE_TUNING.shared.minPieceSize;
export const FRACTURE_IMPACT_THRESHOLD = FRACTURE_TUNING.shared.impactThreshold;
const SHARED_CENTROID = { cx: 0, cy: 0, signedArea: 0 };
const shardPools = new Map();
function admitKineticPropsBatch(spatialFrame, props, world) {
    if (!props.length) return;
    if (spatialFrame?.admitKineticProps) spatialFrame.admitKineticProps(props, world);
    else if (spatialFrame?.admitKineticProp) for (let j = 0; j < props.length; j++) spatialFrame.admitKineticProp(props[j], world);
}
function makeFractureResult({ debris, origin, originX, originY, facing, impactLocal, impactForce }) {
    if (origin) {
        originX = origin.x;
        originY = origin.y;
    }
    return { debris, originX, originY, facing, impactLocal, impactForce };
}
export class FractureEngine {
    constructor(world) {
        this.world = world;
        this.deferredFractures = [];
        this.deferredFracturesCount = 0;
        this._splitVisited = null;
        this._splitHitMask = null;
        this._splitQueue = null;
    }
    processKineticContactFractures(tick, contacts, hooks = {}) {
        if (contacts.count === 0) return;
        const slab = kineticDynamicSlab;
        for (let i = 0; i < contacts.count; i++) {
            const physIdA = contacts.physIdA[i];
            const physIdB = contacts.physIdB[i];
            const bodyA = tick.frame.entityGrid.entities[physIdA]?._physId === physIdA ? tick.frame.entityGrid.entities[physIdA] : null;
            const bodyB = tick.frame.entityGrid.entities[physIdB]?._physId === physIdB ? tick.frame.entityGrid.entities[physIdB] : null;
            if (!bodyA || !bodyB) continue;
            const nx = contacts.dynamic.nx[i];
            const ny = contacts.dynamic.ny[i];
            let hitX;
            let hitY;
            if (contacts.static.tier[i] === KINETIC_PAIR_TIER.CIRCLE_CIRCLE) {
                hitX = slab.x[physIdA] - nx * slab.r[physIdA];
                hitY = slab.y[physIdA] - ny * slab.r[physIdA];
            } else {
                hitX = slab.x[physIdA] + contacts.dynamic.rax[i];
                hitY = slab.y[physIdA] + contacts.dynamic.ray[i];
            }
            const relSpeed = Math.hypot(contacts.dynamic.preDvx[i], contacts.dynamic.preDvy[i]);
            const force = FractureEngine.impactForceFromContact(relSpeed, bodyA.mass, bodyB.mass);
            this.queueFractureKineticContact(tick, bodyA, bodyB, hitX, hitY, force, nx, ny);
        }
        this.flushDeferredFractures(tick.world, tick.frame, hooks);
    }
    flushDeferredFractures(world, spatialFrame, hooks = {}) {
        const count = this.deferredFracturesCount;
        if (count === 0) return;
        world.entityRegistry.beginMembershipBatch();
        const propsToAdmit = [];
        const deferredFractures = this.deferredFractures;
        try {
            for (let i = 0; i < count; i++) {
                const item = deferredFractures[i];
                const prop = item.prop;
                delete prop._pendingEviction;
                const onBeforeEvict = item.mode === "circle" ? (w, p) => hooks.onCircleFracture?.(w, p) : null;
                FractureEngine.commitFractureResult(world, prop, item.fracture, spatialFrame, { retainParent: item.retainParent, onBeforeEvict, propsToAdmitOut: propsToAdmit });
                item.prop = null;
                item.fracture = null;
            }
            admitKineticPropsBatch(spatialFrame, propsToAdmit, world);
        } finally {
            world.entityRegistry.endMembershipBatch();
            this.deferredFracturesCount = 0;
        }
    }
    queueFractureKineticContact(tick, bodyA, bodyB, hitX, hitY, force, nx = 0, ny = 0) {
        for (let i = 0; i < 2; i++) {
            const prop = i === 0 ? bodyA : bodyB;
            const other = i === 0 ? bodyB : bodyA;
            if (prop._physId === undefined) continue;
            if (!FractureEngine.evalFractureRules(prop, other, force)) continue;
            const mode = prop.strategy?.fracture?.mode;
            if (mode !== "circle") {
                if (!FractureEngine.canFracturePropSplit(prop)) continue;
                if (prop._fractureCooldown > 0) continue;
                if (mode === "glass" && other.strategy?.fracture?.mode === "glass") continue;
            }
            if (prop._pendingEviction) continue;
            const fracture = FractureEngine.fracturePropOnImpact(prop, hitX, hitY, force);
            if (!fracture) continue;
            prop._pendingEviction = true;
            this.enqueueDeferredFracture(prop, fracture, mode);
            // One contact -> at most one fracture event (avoid double-spawn cascades).
            return;
        }
    }
    enqueueDeferredFracture(prop, fracture, mode) {
        const deferredFractures = this.deferredFractures;
        let count = this.deferredFracturesCount;
        let item = deferredFractures[count];
        if (!item) {
            item = { mode: "", retainParent: false, prop: null, fracture: null };
            deferredFractures[count] = item;
        }
        const modeEntry = FractureEngine.resolveFractureMode(mode);
        item.mode = mode;
        item.retainParent = modeEntry?.retainParent ?? false;
        item.prop = prop;
        item.fracture = fracture;
        this.deferredFracturesCount = count + 1;
    }
    static acquireShard(x, y, shardPropId, facing = null) {
        let list = shardPools.get(shardPropId);
        if (!list) {
            list = [];
            shardPools.set(shardPropId, list);
        }
        let prop;
        if (list.length > 0) {
            prop = list.pop();
            resetWorldPropInstance(prop, x, y, shardPropId, facing);
            prop.changeState("normal");
        } else prop = new WorldProp(x, y, shardPropId, facing);
        prop._fractureSpawned = true;
        return prop;
    }
    static releaseShard(prop) {
        if (!prop?._fractureSpawned) return;
        const type = prop.type;
        prop.shape = undefined;
        prop.collisionParts = undefined;
        prop.footprintVertices = undefined;
        delete prop._fractureSpawned;
        let list = shardPools.get(type);
        if (!list) {
            list = [];
            shardPools.set(type, list);
        }
        if (list.indexOf(prop) === -1) list.push(prop);
    }
    static evalFractureRules(prop, other, force) {
        const config = prop.strategy?.fracture;
        if (!config) return false;
        const minForce = config.minForce ?? (config.mode === "glass" ? GLASS_FRACTURE_IMPACT_THRESHOLD : FRACTURE_IMPACT_THRESHOLD);
        if (force < minForce) return false;
        if (config.threatType && other.type !== config.threatType) return false;
        const selfFaction = prop.faction;
        if (config.excludeFactions && selfFaction != null && config.excludeFactions.includes(selfFaction)) return false;
        if (config.opponentOnly) {
            const otherFaction = other.faction;
            if (selfFaction == null || otherFaction == null) return false;
            if (selfFaction === otherFaction) return false;
        }
        return true;
    }
    static commitFractureResult(world, prop, fracture, spatialFrame, { retainParent = false, onBeforeEvict = null, height = null, propsToAdmitOut = null } = {}) {
        if (retainParent) {
            wakeKineticBody(prop);
            if (propsToAdmitOut) propsToAdmitOut.push(prop);
        } else {
            onBeforeEvict?.(world, prop);
            if (spatialFrame) removeWorldPropFromState(world, prop, spatialFrame);
            else {
                const index = world.worldProps.indexOf(prop);
                if (index >= 0) world.worldProps.splice(index, 1);
                world.entityRegistry.unregister(prop);
                pruneKineticConstraintsForBody(world.kinetic, prop.id);
                prop.isDead = true;
            }
        }
        const shards = FractureEngine.spawnFractureShards(world, prop, fracture, spatialFrame);
        if (height != null) for (let i = 0; i < shards.length; i++) shards[i].height = height;
        if (propsToAdmitOut) for (let i = 0; i < shards.length; i++) propsToAdmitOut.push(shards[i]);
        else {
            const propsToAdmit = retainParent ? [prop, ...shards] : shards;
            admitKineticPropsBatch(spatialFrame, propsToAdmit, world);
        }
        return shards;
    }
    static spawnFractureShards(world, sourceProp, fracture, spatialFrame = null) {
        const entry = FractureEngine.resolveFractureMode(sourceProp.strategy?.fracture?.mode);
        if (!entry?.spawnShards) return [];
        return entry.spawnShards(world, sourceProp, fracture, spatialFrame);
    }
    static fracturePropOnImpact(prop, worldHitX, worldHitY, impactForce) {
        const mode = prop.strategy?.fracture?.mode;
        if (mode === "circle") if (prop.shape?.type !== "Circle") throw new Error(`fracture.mode "circle" requires Circle shape, got ${prop.shape?.type ?? "none"}`);
        const entry = FractureEngine.resolveFractureMode(mode);
        if (!entry?.onImpact) return null;
        return entry.onImpact(prop, worldHitX, worldHitY, impactForce);
    }
    static impactForceFromContact(relativeSpeed, massA = 1, massB = 1) {
        return relativeSpeed * 0.5 + Math.sqrt(massA * massB) * 0.3;
    }
    static fractureSpawnedWallChunk(state, prop, strike, spatialFrame) {
        const force = FractureEngine.impactForceFromContact(strike.sourceSpeed, strike.sourceMass, prop.mass ?? 1) + FRACTURE_TUNING.wallSpawn.forceBias;
        const fracture = FractureEngine.fracturePropOnImpact(prop, strike.contactX, strike.contactY, force);
        if (!fracture) return [];
        const modeEntry = FractureEngine.resolveFractureMode(prop.strategy?.fracture?.mode);
        return FractureEngine.commitFractureResult(state, prop, fracture, spatialFrame, { retainParent: modeEntry?.retainParent ?? false, height: strike.height });
    }
    static worldHitToPropLocal(prop, worldX, worldY) {
        const origin = FractureEngine._propWorldPosition(prop);
        const dx = worldX - origin.x;
        const dy = worldY - origin.y;
        const cos = Math.cos(entityFacing(prop));
        const sin = Math.sin(entityFacing(prop));
        return { x: dx * cos + dy * sin, y: -dx * sin + dy * cos };
    }
    static splitFootprintIntoComponents(prop, localHitX, localHitY, impactForce, forceExplode = false) {
        return FractureEngine._splitMeshComponents(prop.chunks, localHitX, localHitY, impactForce, forceExplode).map((comp) => FractureEngine._geometryFromChunkComponent(comp, false));
    }
    static spawnShardPropsFromGeometry(world, sourceProp, geometries, shardPropId, spatialFrame = null, configureShard = null) {
        const facing = entityFacing(sourceProp);
        const cos = Math.cos(facing);
        const sin = Math.sin(facing);
        const motion = FractureEngine._currentPropMotion(sourceProp);
        const faction = sourceProp.faction;
        const wallChunkProfileId = sourceProp.wallChunkProfileId;
        const wallChunkHeightPx = sourceProp.wallChunkHeightPx;
        const spawned = [];
        const origin = FractureEngine._propWorldPosition(sourceProp);
        for (let i = 0; i < geometries.length; i++) {
            const geom = geometries[i];
            const worldPos = transformPoint2DInto({ x: 0, y: 0 }, origin.x, origin.y, geom.centroid.cx, geom.centroid.cy, cos, sin);
            const shard = FractureEngine.acquireShard(worldPos.x, worldPos.y, shardPropId, facing);
            FractureEngine.applyPropFractureGeometry(shard, geom);
            shard.faction = faction;
            shard.vx = motion.vx;
            shard.vy = motion.vy;
            shard.angularVelocity = motion.w;
            shard._fractureCooldown = FRACTURE_TUNING.shared.cooldown;
            if (sourceProp.visualOverride !== undefined) shard.visualOverride = { ...sourceProp.visualOverride };
            if (wallChunkProfileId !== undefined) {
                shard.wallChunkProfileId = wallChunkProfileId;
                shard.wallChunkHeightPx = wallChunkHeightPx;
            }
            if (configureShard) configureShard(shard, geom, i);
            spawned.push(shard);
        }
        if (spawned.length > 0) {
            addWorldPropsToState(world, spawned);
            for (let i = 0; i < spawned.length; i++) wakeKineticBody(spawned[i]);
            admitKineticPropsBatch(spatialFrame, spawned, world);
        }
        return spawned;
    }
    static buildCircleImpactShards(radius, localHit, impactForce, { minShards = 4, maxShards = 5 } = {}) {
        const count = FractureEngine._circleShardCount(impactForce, minShards, maxShards);
        const hitDist = Math.hypot(localHit.x, localHit.y);
        const inset = hitDist > 1e-6 ? Math.min(radius * 0.42, hitDist * 0.45) / hitDist : 0;
        const apex = { x: localHit.x * inset, y: localHit.y * inset };
        const start = Math.atan2(localHit.y, localHit.x) - Math.PI / count;
        const polySides = 16;
        const parentPoints = new Float32Array(polySides * 2);
        for (let i = 0; i < polySides; i++) {
            const angle = (i * Math.PI * 2) / polySides;
            parentPoints[i * 2] = Math.cos(angle) * radius;
            parentPoints[i * 2 + 1] = Math.sin(angle) * radius;
        }
        const shards = [];
        for (let i = 0; i < count; i++) {
            const a0 = start + (i * Math.PI * 2) / count;
            const a1 = start + ((i + 1) * Math.PI * 2) / count;
            const poly = FractureEngine.wedgePolygonIntersection(parentPoints, apex.x, apex.y, a0, a1);
            if (poly.length >= 6) shards.push(FractureEngine.buildShardGeometry(poly));
        }
        return shards;
    }
    static applyPropFractureGeometry(prop, geometry) {
        if (geometry.collisionParts) {
            prop.chunks = geometry.chunks;
            prop.collisionParts = geometry.collisionParts;
        } else {
            prop.chunks = undefined;
            prop.collisionParts = undefined;
        }
        prop.footprintVertices = geometry.footprintVertices;
        prop.footprintArea = geometry.footprintArea;
        prop.radius = geometry.boundingRadius;
        prop.shape = new PolygonShape(geometry.footprintVertices);
        markBroadphaseDirty(prop);
        prop.mass = kineticMassFromFootprint(prop);
    }
    static shouldInitFractureFootprint(prop) {
        const entry = FractureEngine.resolveFractureMode(prop.strategy?.fracture?.mode);
        return entry?.initFootprint ?? false;
    }
    static resolveFractureMode(mode) {
        return FRACTURE_MODES[mode] ?? null;
    }
    static initFractureFootprint(prop) {
        if (FractureEngine._isGlassFracture(prop)) return;
        if (!FractureEngine.shouldInitFractureFootprint(prop)) throw new Error(`Fracture props need fracture.mode "chunk" or "glass", got ${prop.strategy?.fracture?.mode}`);
        FractureEngine.applyPropFractureGeometry(prop, FractureEngine.bakeChunkOutline(FractureEngine._flatVertsFromShape(prop)));
    }
    static canFracturePropSplit(prop, minSize = FRACTURE_MIN_PIECE_SIZE) {
        if (!prop?.strategy?.fracture) return false;
        const entry = FractureEngine.resolveFractureMode(prop.strategy.fracture.mode);
        if (entry?.canSplit) return entry.canSplit(prop, minSize);
        if (entry?.skipCanSplit) return true;
        return false;
    }
    static shatterGlassFootprint(hx, hy, hitX, hitY, impactForce = 10, random = Math.random) {
        const flat = boxLocalFootprint(hx, hy);
        return FractureEngine.shatterGlassPolygon(flat, hitX, hitY, impactForce, random);
    }
    static shatterGlassPolygon(flatVerts, hitX, hitY, impactForce = 10, random = Math.random) {
        if (flatVerts.length < 6) return [];
        const parentArea = Math.abs(polygonSignedArea2D(flatVerts));
        const { x: apexX, y: apexY } = FractureEngine._resolveShatterApex(flatVerts, hitX, hitY);
        let shardCount = FractureEngine._shardCountForPolygon(flatVerts, impactForce, apexX, apexY);
        let shards = FractureEngine._buildGlassShards(flatVerts, apexX, apexY, shardCount, random);
        const minArea = FractureEngine.minShardAreaForPolygon(flatVerts);
        const areaCap = Math.max(2, Math.floor(parentArea / minArea));
        const minShardsAllowed = Math.min(4, areaCap);
        for (let attempt = 0; attempt < 4; attempt++) {
            let totalArea = 0;
            for (let i = 0; i < shards.length; i++) totalArea += shards[i].footprintArea;
            if (shards.length >= 2 && totalArea >= parentArea * 0.92) return shards;
            shardCount = Math.max(minShardsAllowed, Math.floor(shardCount * 0.72));
            shards = FractureEngine._buildGlassShards(flatVerts, apexX, apexY, shardCount, random);
        }
        return shards.length >= 2 ? shards : [];
    }
    static buildShardGeometry(flatVerts) {
        const { cx, cy, signedArea } = polygonCentroid2D(flatVerts);
        const count = flatVerts.length / 2;
        const centered = new Float32Array(count * 2);
        for (let i = 0; i < count; i++) {
            centered[i * 2] = flatVerts[i * 2] - cx;
            centered[i * 2 + 1] = flatVerts[i * 2 + 1] - cy;
        }
        return { footprintVertices: centered, footprintArea: Math.abs(signedArea), boundingRadius: FractureEngine._boundingRadiusFromFootprint(centered), centroid: { cx, cy } };
    }
    static wedgePolygonIntersection(flatVerts, apexX, apexY, angle0, angle1) {
        const nx0 = -Math.sin(angle0);
        const ny0 = Math.cos(angle0);
        const nx1 = Math.sin(angle1);
        const ny1 = -Math.cos(angle1);
        let poly = flatVerts;
        poly = FractureEngine._clipHalfPlane(poly, apexX, apexY, nx0, ny0);
        poly = FractureEngine._clipHalfPlane(poly, apexX, apexY, nx1, ny1);
        return poly;
    }
    static measureGlassShard(flatVerts) {
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        const count = flatVerts.length / 2;
        for (let i = 0; i < count; i++) {
            const x = flatVerts[i * 2];
            const y = flatVerts[i * 2 + 1];
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
        const thick = Math.max(maxX - minX, maxY - minY);
        const thin = Math.min(maxX - minX, maxY - minY);
        return { area: Math.abs(polygonSignedArea2D(flatVerts)), thin, thick, aspect: thick / Math.max(1e-6, thin) };
    }
    static minShardAreaForPolygon(flatVerts) {
        const area = Math.abs(polygonSignedArea2D(flatVerts));
        return Math.max(GLASS_MIN_SHARD_AREA, area / GLASS_MAX_SHARDS_PER_SHATTER);
    }
    static chunkCollisionPartsArea(collisionParts) {
        let area = 0;
        for (let i = 0; i < collisionParts.length; i++) {
            const verts = collisionParts[i].vertices;
            const w = Math.abs(verts[2] - verts[0]);
            const h = Math.abs(verts[5] - verts[3]);
            area += w * h;
        }
        return area;
    }
    static chunkCellCount(hx, hy, cellSize = FractureEngine.cellSizeForBoxExtents(hx, hy)) {
        const cols = Math.max(1, Math.round((hx * 2) / cellSize));
        const rows = Math.max(1, Math.round((hy * 2) / cellSize));
        return cols * rows;
    }
    static bakeChunkOutline(flatVerts) {
        const centeredVerts = FractureEngine._centerFlatVerts(flatVerts);
        const { hx, hy } = FractureEngine._halfExtentsFromFlat(centeredVerts);
        const parts = FractureEngine.rectGridParts(hx, hy, FractureEngine.cellSizeForBoxExtents(hx, hy));
        const mesh = FractureEngine.buildGeometryFromPartsAtOrigin(parts.map((p) => ({ vertices: p.vertices })));
        return FractureEngine._withChunkCollisionParts({ footprintVertices: mesh.footprintVertices, chunks: mesh.chunks, footprintArea: mesh.footprintArea, boundingRadius: mesh.boundingRadius });
    }
    static buildChunkGeometryAtPropOrigin(localParts) {
        const geom = FractureEngine.buildGeometryFromPartsAtOrigin(localParts);
        return FractureEngine._withChunkCollisionParts({ footprintVertices: geom.footprintVertices, chunks: geom.chunks, footprintArea: geom.footprintArea, boundingRadius: geom.boundingRadius });
    }
    static buildGeometryFromChunkParts(localParts) {
        const geom = FractureEngine._buildGeometryFromCellParts(localParts);
        return FractureEngine._withChunkCollisionParts({ footprintVertices: geom.footprintVertices, chunks: geom.chunks, footprintArea: geom.footprintArea, boundingRadius: geom.boundingRadius, centroid: geom.centroid });
    }
    static rectGridParts(hx, hy, cellSize) {
        const cols = Math.max(1, Math.round((hx * 2) / cellSize));
        const rows = Math.max(1, Math.round((hy * 2) / cellSize));
        const cellW = (hx * 2) / cols;
        const cellH = (hy * 2) / rows;
        const parts = [];
        for (let row = 0; row < rows; row++)
            for (let col = 0; col < cols; col++) {
                const x0 = -hx + col * cellW;
                const y0 = -hy + row * cellH;
                const x1 = x0 + cellW;
                const y1 = y0 + cellH;
                parts.push({ vertices: new Float32Array([x0, y0, x1, y0, x1, y1, x0, y1]) });
            }
        return parts;
    }
    static mergeChunkCollisionRects(chunks) {
        let rects = chunks.map(FractureEngine._rectFromChunk);
        let prev = rects.length + 1;
        while (rects.length < prev) {
            prev = rects.length;
            rects = FractureEngine._mergeRectsVertically(FractureEngine._mergeRectsHorizontally(rects));
        }
        return rects;
    }
    static subdivideSingleChunkAtMinCell(chunk) {
        const rect = FractureEngine._rectFromChunk(chunk);
        const hx = (rect.x1 - rect.x0) * 0.5;
        const hy = (rect.y1 - rect.y0) * 0.5;
        if (!FractureEngine.chunkNeedsMinCellSubdivide(chunk)) return null;
        const parts = FractureEngine._rectGridPartsCeil(hx, hy, CHUNK_MIN_CELL);
        if (parts.length <= 1) return null;
        return FractureEngine.buildChunkGeometryAtPropOrigin(parts.map((part) => ({ vertices: part.vertices })));
    }
    static chunkNeedsMinCellSubdivide(chunk) {
        const { w, h } = FractureEngine._chunkRectSpan(chunk);
        const eps = FRACTURE_TUNING.chunk.rectMergeEps;
        return w > CHUNK_MIN_CELL + eps || h > CHUNK_MIN_CELL + eps;
    }
    static cellSizeForBoxExtents(hx, hy) {
        const span = Math.min(hx * 2, hy * 2);
        const cellsPerAxis = Math.min(CHUNK_MAX_CELLS_PER_AXIS, Math.max(2, Math.round(span / 16)));
        return Math.max(CHUNK_MIN_CELL, span / cellsPerAxis);
    }
    static splitChunks(chunks, localHitX, localHitY, impactForce = 5, engine = null) {
        if (!chunks || chunks.length <= 1) return [chunks];
        if (engine) return FractureEngine._splitChunksWithScratch(FractureEngine._prepareEngineScratch(engine, chunks.length), chunks, localHitX, localHitY, impactForce);
        return FractureEngine._splitChunksWithScratch(FractureEngine._prepareStaticScratch(chunks.length), chunks, localHitX, localHitY, impactForce);
    }
    static splitPoxels(chunks, localHitX, localHitY, impactForce = 5, engine = null) {
        return FractureEngine.splitChunks(chunks, localHitX, localHitY, impactForce, engine);
    }
    static buildGeometryFromPartsAtOrigin(localParts) {
        const parts = localParts.map((p) => ({ vertices: p.vertices }));
        const boundaryPoints = FractureEngine._getOuterBoundary(parts);
        const footprintVertices = new Float32Array(boundaryPoints.length);
        footprintVertices.set(boundaryPoints);
        const { signedArea } = polygonCentroid2D(footprintVertices, SHARED_CENTROID);
        return FractureEngine._finalizeFootprintGeometry(footprintVertices, parts, signedArea, { cx: 0, cy: 0 });
    }
    static fractureDeterministicRandom(seed) {
        return deterministicUnitRandom(seed);
    }
    static _fractureRandomFromImpact(worldHitX, worldHitY, impactForce, salt = 0) {
        let call = 0;
        const base = Math.imul(Math.floor(worldHitX * 1000), 73856093) ^ Math.imul(Math.floor(worldHitY * 1000), 19349663) ^ Math.imul(Math.floor(impactForce * 100), 83492791) ^ salt;
        return () => FractureEngine.fractureDeterministicRandom(base ^ Math.imul(++call, 2654435761));
    }
    static _hashV(x, y) {
        return (Math.imul(Math.round(x * 10000), 73856093) ^ Math.imul(Math.round(y * 10000), 19349663)) & 0xffff;
    }
    static _edgeKey(ha, hb) {
        return ha < hb ? (ha << 16) | (hb & 0xffff) : (hb << 16) | (ha & 0xffff);
    }
    static _calculateCentroidOfParts(parts) {
        let totalCX = 0;
        let totalCY = 0;
        let totalArea = 0;
        for (let i = 0; i < parts.length; i++) {
            const verts = parts[i].vertices || parts[i];
            const { cx, cy, signedArea } = polygonCentroid2D(verts, SHARED_CENTROID);
            const absArea = Math.abs(signedArea);
            totalCX += cx * absArea;
            totalCY += cy * absArea;
            totalArea += absArea;
        }
        if (totalArea > 0) {
            const invTotalArea = 1 / totalArea;
            SHARED_CENTROID.cx = totalCX * invTotalArea;
            SHARED_CENTROID.cy = totalCY * invTotalArea;
        } else {
            SHARED_CENTROID.cx = 0;
            SHARED_CENTROID.cy = 0;
        }
        SHARED_CENTROID.signedArea = totalArea;
        return SHARED_CENTROID;
    }
    static _getOuterBoundary(parts) {
        const edgeCounts = new Map();
        const vMap = new Map();
        for (let i = 0; i < parts.length; i++) {
            const v = parts[i].vertices;
            const count = v.length / 2;
            let area = 0;
            for (let j = 0; j < count; j++) {
                const ax = v[j * 2];
                const ay = v[j * 2 + 1];
                const nextIdx = ((j + 1) % count) * 2;
                const bx = v[nextIdx];
                const by = v[nextIdx + 1];
                area += ax * by - bx * ay;
            }
            const isCCW = area > 0;
            for (let j = 0; j < count; j++) {
                const idx1 = isCCW ? j : count - 1 - j;
                const idx2 = isCCW ? (j + 1) % count : (count - j) % count;
                const ax = v[idx1 * 2];
                const ay = v[idx1 * 2 + 1];
                const bx = v[idx2 * 2];
                const by = v[idx2 * 2 + 1];
                const ha = FractureEngine._hashV(ax, ay);
                const hb = FractureEngine._hashV(bx, by);
                if (!vMap.has(ha)) vMap.set(ha, { x: ax, y: ay });
                if (!vMap.has(hb)) vMap.set(hb, { x: bx, y: by });
                const edgeKey = FractureEngine._edgeKey(ha, hb);
                edgeCounts.set(edgeKey, (edgeCounts.get(edgeKey) || 0) + 1);
            }
        }
        const nextMap = new Map();
        for (const edgeKey of edgeCounts.keys())
            if (edgeCounts.get(edgeKey) === 1) {
                const ha = edgeKey >>> 16;
                const hb = edgeKey & 0xffff;
                if (!nextMap.has(ha)) nextMap.set(ha, []);
                nextMap.get(ha).push(hb);
            }
        const loops = [];
        const visited = new Set();
        for (const startHash of nextMap.keys()) {
            if (visited.has(startHash)) continue;
            const loop = [];
            let currentHash = startHash;
            let safety = 0;
            while (safety++ < 10000) {
                visited.add(currentHash);
                const pt = vMap.get(currentHash);
                loop.push(pt.x, pt.y);
                const nextOpts = nextMap.get(currentHash);
                if (!nextOpts || nextOpts.length === 0) break;
                let nextHash = nextOpts.find((h) => !visited.has(h));
                if (!nextHash) {
                    if (nextOpts.includes(startHash)) break;
                    nextHash = nextOpts[0];
                }
                if (nextHash === startHash) break;
                currentHash = nextHash;
            }
            if (safety >= 10000) throw new Error(`getOuterBoundary safety cap exceeded (${parts.length} parts)`);
            loops.push(loop);
        }
        loops.sort((a, b) => b.length - a.length);
        return loops.length > 0 ? loops[0] : parts[0].vertices;
    }
    static _buildChunkGraph(visualParts) {
        const chunks = [];
        for (let i = 0; i < visualParts.length; i++) {
            const v = visualParts[i].vertices;
            const count = v.length / 2;
            let cx = 0;
            let cy = 0;
            for (let j = 0; j < count; j++) {
                cx += v[j * 2];
                cy += v[j * 2 + 1];
            }
            cx /= count;
            cy /= count;
            chunks.push({ id: i, vertices: visualParts[i].vertices, neighbors: [], cx, cy });
        }
        const edgeMap = new Map();
        for (let i = 0; i < chunks.length; i++) {
            const v = chunks[i].vertices;
            const count = v.length / 2;
            for (let j = 0; j < count; j++) {
                const ax = v[j * 2];
                const ay = v[j * 2 + 1];
                const nextIdx = ((j + 1) % count) * 2;
                const bx = v[nextIdx];
                const by = v[nextIdx + 1];
                const h1 = FractureEngine._hashV(ax, ay);
                const h2 = FractureEngine._hashV(bx, by);
                const edgeKey = FractureEngine._edgeKey(h1, h2);
                const edge = edgeMap.get(edgeKey);
                if (!edge) edgeMap.set(edgeKey, [i]);
                else edge.push(i);
            }
        }
        for (const indices of edgeMap.values())
            if (indices.length === 2) {
                const a = indices[0];
                const b = indices[1];
                if (!chunks[a].neighbors.includes(b)) chunks[a].neighbors.push(b);
                if (!chunks[b].neighbors.includes(a)) chunks[b].neighbors.push(a);
            }
        return chunks;
    }
    static _halfExtentsFromFootprint(footprintVertices) {
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        const count = footprintVertices.length / 2;
        for (let i = 0; i < count; i++) {
            const vx = footprintVertices[i * 2];
            const vy = footprintVertices[i * 2 + 1];
            if (vx < minX) minX = vx;
            if (vx > maxX) maxX = vx;
            if (vy < minY) minY = vy;
            if (vy > maxY) maxY = vy;
        }
        return { x: (maxX - minX) * 0.5, y: (maxY - minY) * 0.5 };
    }
    static _boundingRadiusFromFootprint(footprintVertices) {
        let maxRadiusSq = 0;
        const count = footprintVertices.length / 2;
        for (let i = 0; i < count; i++) {
            const vx = footprintVertices[i * 2];
            const vy = footprintVertices[i * 2 + 1];
            const distSq = vx * vx + vy * vy;
            if (distSq > maxRadiusSq) maxRadiusSq = distSq;
        }
        return Math.sqrt(maxRadiusSq);
    }
    static _cloneChunks(chunks) {
        return chunks.map((chunk) => {
            const pVerts = new Float32Array(chunk.vertices.length);
            pVerts.set(chunk.vertices);
            return { id: chunk.id, vertices: pVerts, neighbors: [...chunk.neighbors], cx: chunk.cx, cy: chunk.cy };
        });
    }
    static _finalizeFootprintGeometry(centeredVerts, visualParts, signedArea, centroid) {
        const chunks = FractureEngine._buildChunkGraph(visualParts);
        const footprintArea = Math.abs(signedArea);
        const halfExtents = FractureEngine._halfExtentsFromFootprint(centeredVerts);
        const boundingRadius = FractureEngine._boundingRadiusFromFootprint(centeredVerts);
        return { footprintVertices: centeredVerts, chunks: FractureEngine._cloneChunks(chunks), footprintArea, halfExtents, boundingRadius, centroid };
    }
    static _buildGeometryFromCellParts(localParts) {
        const { cx, cy } = FractureEngine._calculateCentroidOfParts(localParts);
        const opLen = localParts.length;
        const shiftedParts = new Array(opLen);
        for (let i = 0; i < opLen; i++) {
            const p = localParts[i];
            const count = p.vertices.length / 2;
            const shiftedV = new Float32Array(count * 2);
            for (let j = 0; j < count; j++) {
                shiftedV[j * 2] = p.vertices[j * 2] - cx;
                shiftedV[j * 2 + 1] = p.vertices[j * 2 + 1] - cy;
            }
            shiftedParts[i] = { vertices: shiftedV };
        }
        const boundaryPoints = FractureEngine._getOuterBoundary(shiftedParts);
        const bpCount = boundaryPoints.length / 2;
        const centeredVerts = new Float32Array(bpCount * 2);
        centeredVerts.set(boundaryPoints);
        const { signedArea } = polygonCentroid2D(centeredVerts, SHARED_CENTROID);
        return FractureEngine._finalizeFootprintGeometry(centeredVerts, shiftedParts, signedArea, { cx, cy });
    }
    static _fractureNeighborRoll(localHitX, localHitY, impactForce, neighborIndex) {
        let h = Math.imul(Math.floor(localHitX * 1000), 73856093);
        h ^= Math.imul(Math.floor(localHitY * 1000), 19349663);
        h ^= Math.imul(Math.floor(impactForce * 100), 83492791);
        h ^= Math.imul(neighborIndex, 2654435761);
        return ((h >>> 0) % 10000) / 10000;
    }
    static _halfExtentsFromFlat(flatVerts) {
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        const count = flatVerts.length / 2;
        for (let i = 0; i < count; i++) {
            const x = flatVerts[i * 2];
            const y = flatVerts[i * 2 + 1];
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
        return { hx: (maxX - minX) * 0.5, hy: (maxY - minY) * 0.5 };
    }
    static _rectFromChunk(chunk) {
        const v = chunk.vertices;
        let x0 = Infinity;
        let x1 = -Infinity;
        let y0 = Infinity;
        let y1 = -Infinity;
        for (let i = 0; i < v.length / 2; i++) {
            const x = v[i * 2];
            const y = v[i * 2 + 1];
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
        }
        return { x0, y0, x1, y1 };
    }
    static _chunkRectSpan(chunk) {
        const rect = FractureEngine._rectFromChunk(chunk);
        return { w: rect.x1 - rect.x0, h: rect.y1 - rect.y0 };
    }
    static _mergeRectsHorizontally(rects) {
        const groups = new Map();
        for (let i = 0; i < rects.length; i++) {
            const r = rects[i];
            const key = `${r.y0.toFixed(4)};${r.y1.toFixed(4)}`;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(r);
        }
        const out = [];
        const eps = FRACTURE_TUNING.chunk.rectMergeEps;
        for (const group of groups.values()) {
            group.sort((a, b) => a.x0 - b.x0);
            let cur = group[0];
            for (let i = 1; i < group.length; i++) {
                const next = group[i];
                if (Math.abs(cur.x1 - next.x0) <= eps) cur = { x0: cur.x0, y0: cur.y0, x1: next.x1, y1: cur.y1 };
                else {
                    out.push(cur);
                    cur = next;
                }
            }
            out.push(cur);
        }
        return out;
    }
    static _mergeRectsVertically(rects) {
        const groups = new Map();
        for (let i = 0; i < rects.length; i++) {
            const r = rects[i];
            const key = `${r.x0.toFixed(4)};${r.x1.toFixed(4)}`;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(r);
        }
        const out = [];
        const eps = FRACTURE_TUNING.chunk.rectMergeEps;
        for (const group of groups.values()) {
            group.sort((a, b) => a.y0 - b.y0);
            let cur = group[0];
            for (let i = 1; i < group.length; i++) {
                const next = group[i];
                if (Math.abs(cur.y1 - next.y0) <= eps) cur = { x0: cur.x0, y0: cur.y0, x1: cur.x1, y1: next.y1 };
                else {
                    out.push(cur);
                    cur = next;
                }
            }
            out.push(cur);
        }
        return out;
    }
    static _rectArea(rect) {
        return (rect.x1 - rect.x0) * (rect.y1 - rect.y0);
    }
    static _chunkMaterialArea(chunks) {
        let area = 0;
        for (let i = 0; i < chunks.length; i++) area += FractureEngine._rectArea(FractureEngine._rectFromChunk(chunks[i]));
        return area;
    }
    static _polygonShapeFromRect(rect) {
        return new PolygonShape(new Float32Array([rect.x0, rect.y0, rect.x1, rect.y0, rect.x1, rect.y1, rect.x0, rect.y1]));
    }
    static _collisionPartsFromChunks(chunks) {
        return FractureEngine.mergeChunkCollisionRects(chunks).map(FractureEngine._polygonShapeFromRect);
    }
    static _boundingRadiusFromParts(collisionParts) {
        let maxR = 0;
        for (let i = 0; i < collisionParts.length; i++) maxR = Math.max(maxR, collisionParts[i].getBoundingRadius());
        return maxR;
    }
    static _footprintVerticesFromParts(collisionParts) {
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        for (let p = 0; p < collisionParts.length; p++) {
            const verts = collisionParts[p].vertices;
            const count = verts.length;
            for (let i = 0; i < count; i += 2) {
                const x = verts[i];
                const y = verts[i + 1];
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
        return new Float32Array([minX, minY, maxX, minY, maxX, maxY, minX, maxY]);
    }
    static _withChunkCollisionParts(geom) {
        const collisionParts = FractureEngine._collisionPartsFromChunks(geom.chunks);
        const footprintVertices = FractureEngine._footprintVerticesFromParts(collisionParts);
        return { ...geom, collisionParts, footprintVertices, footprintArea: FractureEngine._chunkMaterialArea(geom.chunks), boundingRadius: FractureEngine._boundingRadiusFromParts(collisionParts) };
    }
    static _centerFlatVerts(flatVerts) {
        const count = flatVerts.length / 2;
        let cx = 0;
        let cy = 0;
        for (let i = 0; i < count; i++) {
            cx += flatVerts[i * 2];
            cy += flatVerts[i * 2 + 1];
        }
        cx /= count;
        cy /= count;
        const centered = new Float32Array(count * 2);
        for (let i = 0; i < count; i++) {
            centered[i * 2] = flatVerts[i * 2] - cx;
            centered[i * 2 + 1] = flatVerts[i * 2 + 1] - cy;
        }
        return centered;
    }
    static _rectGridPartsCeil(hx, hy, maxCellSize) {
        const cols = Math.max(1, Math.ceil((hx * 2) / maxCellSize));
        const rows = Math.max(1, Math.ceil((hy * 2) / maxCellSize));
        const cellW = (hx * 2) / cols;
        const cellH = (hy * 2) / rows;
        const parts = [];
        for (let row = 0; row < rows; row++)
            for (let col = 0; col < cols; col++) {
                const x0 = -hx + col * cellW;
                const y0 = -hy + row * cellH;
                const x1 = x0 + cellW;
                const y1 = y0 + cellH;
                parts.push({ vertices: new Float32Array([x0, y0, x1, y0, x1, y1, x0, y1]) });
            }
        return parts;
    }
    static _polygonSpan(flatVerts) {
        return Math.sqrt(Math.abs(polygonSignedArea2D(flatVerts)));
    }
    static _closestPointOnPolygonBoundary(x, y, flatVerts) {
        let bestX = flatVerts[0];
        let bestY = flatVerts[1];
        let bestDistSq = Infinity;
        const count = flatVerts.length / 2;
        for (let i = 0; i < count; i++) {
            const j = (i + 1) % count;
            const ax = flatVerts[i * 2];
            const ay = flatVerts[i * 2 + 1];
            const bx = flatVerts[j * 2];
            const by = flatVerts[j * 2 + 1];
            const closest = closestPointOnLineSegment(x, y, ax, ay, bx, by);
            const distSq = (x - closest.x) * (x - closest.x) + (y - closest.y) * (y - closest.y);
            if (distSq < bestDistSq) {
                bestDistSq = distSq;
                bestX = closest.x;
                bestY = closest.y;
            }
        }
        return { x: bestX, y: bestY, dist: Math.sqrt(bestDistSq) };
    }
    static _minDistToPolygonBoundary(x, y, flatVerts) {
        return FractureEngine._closestPointOnPolygonBoundary(x, y, flatVerts).dist;
    }
    static _minThinEdgeForPolygon(flatVerts) {
        return Math.max(3, FractureEngine._polygonSpan(flatVerts) * 0.08);
    }
    static _resolveShatterApex(flatVerts, hitX, hitY) {
        const { cx, cy } = polygonCentroid2D(flatVerts);
        const span = FractureEngine._polygonSpan(flatVerts);
        let ax = hitX;
        let ay = hitY;
        if (!pointInPolygon(ax, ay, flatVerts)) {
            const onEdge = FractureEngine._closestPointOnPolygonBoundary(hitX, hitY, flatVerts);
            ax = onEdge.x;
            ay = onEdge.y;
        }
        const inset = Math.min(span * 0.18, 18);
        const dx = cx - ax;
        const dy = cy - ay;
        const dist = Math.hypot(dx, dy);
        if (dist > 1e-6) {
            const push = Math.min(inset, dist * 0.4);
            ax += (dx / dist) * push;
            ay += (dy / dist) * push;
        }
        if (!pointInPolygon(ax, ay, flatVerts)) {
            ax = cx;
            ay = cy;
        }
        return { x: ax, y: ay };
    }
    static _clipHalfPlane(flatVerts, ax, ay, nx, ny) {
        const len = flatVerts.length;
        if (len === 0) return flatVerts;
        const count = len / 2;
        const out = [];
        for (let i = 0; i < count; i++) {
            const j = (i + 1) % count;
            const cx = flatVerts[i * 2];
            const cy = flatVerts[i * 2 + 1];
            const nx_coord = flatVerts[j * 2];
            const ny_coord = flatVerts[j * 2 + 1];
            const currIn = (cx - ax) * nx + (cy - ay) * ny >= -1e-9;
            const nextIn = (nx_coord - ax) * nx + (ny_coord - ay) * ny >= -1e-9;
            if (currIn && nextIn) out.push(nx_coord, ny_coord);
            else if (currIn && !nextIn) {
                const dx = nx_coord - cx;
                const dy = ny_coord - cy;
                const denom = dx * nx + dy * ny;
                const t = denom === 0 ? 0 : -((cx - ax) * nx + (cy - ay) * ny) / denom;
                out.push(cx + dx * t, cy + dy * t);
            } else if (!currIn && nextIn) {
                const dx = nx_coord - cx;
                const dy = ny_coord - cy;
                const denom = dx * nx + dy * ny;
                const t = denom === 0 ? 0 : -((cx - ax) * nx + (cy - ay) * ny) / denom;
                out.push(cx + dx * t, cy + dy * t);
                out.push(nx_coord, ny_coord);
            }
        }
        return new Float32Array(out);
    }
    static _acceptGlassShard(flatVerts, parentFlatVerts) {
        const area = Math.abs(polygonSignedArea2D(flatVerts));
        if (area < GLASS_MIN_SHARD_AREA) return false;
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        const count = flatVerts.length / 2;
        for (let i = 0; i < count; i++) {
            const x = flatVerts[i * 2];
            const y = flatVerts[i * 2 + 1];
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
        const thick = Math.max(maxX - minX, maxY - minY);
        const thin = Math.min(maxX - minX, maxY - minY);
        if (thin < FractureEngine._minThinEdgeForPolygon(parentFlatVerts)) return false;
        if (thick / Math.max(1e-6, thin) > GLASS_MAX_SLIVER_ASPECT) return false;
        return true;
    }
    static _buildGlassShards(flatVerts, apexX, apexY, shardCount, random) {
        const baseStep = (Math.PI * 2) / shardCount;
        const offset = random() * Math.PI * 2;
        const angles = [];
        for (let i = 0; i < shardCount; i++) {
            const jitter = (random() - 0.5) * baseStep * 0.25;
            angles.push(offset + i * baseStep + jitter);
        }
        angles.sort((a, b) => a - b);
        const shards = [];
        let startIndex = 0;
        let lastStartIdx = -1;
        while (startIndex < angles.length) {
            const a0 = angles[startIndex];
            const a1 = startIndex === angles.length - 1 ? angles[0] + Math.PI * 2 : angles[startIndex + 1];
            const poly = FractureEngine.wedgePolygonIntersection(flatVerts, apexX, apexY, a0, a1);
            if (poly.length < 6) {
                startIndex++;
                continue;
            }
            if (FractureEngine._acceptGlassShard(poly, flatVerts)) {
                shards.push(FractureEngine.buildShardGeometry(poly));
                lastStartIdx = startIndex;
                startIndex++;
            } else {
                let merged = false;
                if (lastStartIdx !== -1) {
                    const prevA0 = angles[lastStartIdx];
                    const angleDiff = a1 - prevA0;
                    if (angleDiff < Math.PI * 0.95) {
                        const mergedPoly = FractureEngine.wedgePolygonIntersection(flatVerts, apexX, apexY, prevA0, a1);
                        if (mergedPoly.length >= 6) {
                            shards.pop();
                            shards.push(FractureEngine.buildShardGeometry(mergedPoly));
                            merged = true;
                        }
                    }
                }
                if (merged) startIndex++;
                else {
                    shards.push(FractureEngine.buildShardGeometry(poly));
                    lastStartIdx = startIndex;
                    startIndex++;
                }
            }
        }
        return shards;
    }
    static _shardCountForPolygon(flatVerts, impactForce, apexX, apexY) {
        const area = Math.abs(polygonSignedArea2D(flatVerts));
        const span = FractureEngine._polygonSpan(flatVerts);
        const minArea = FractureEngine.minShardAreaForPolygon(flatVerts);
        const areaCap = Math.max(2, Math.floor(area / minArea));
        const angleCap = Math.floor((Math.PI * 2) / GLASS_MIN_WEDGE_ANGLE);
        const minShardsAllowed = Math.min(4, areaCap);
        let count = Math.max(minShardsAllowed, Math.min(GLASS_MAX_SHARDS_PER_SHATTER, Math.round(span / 8) + Math.floor(impactForce * 0.04)));
        count = Math.min(count, areaCap, angleCap);
        const boundaryDist = FractureEngine._minDistToPolygonBoundary(apexX, apexY, flatVerts);
        const boundaryFactor = Math.min(1, boundaryDist / (span * 0.14));
        count = Math.max(minShardsAllowed, Math.round(count * (0.35 + 0.65 * boundaryFactor)));
        return count;
    }
    static _isGlassFracture(prop) {
        return prop?.strategy?.fracture?.mode === "glass";
    }
    static _isChunkFracture(prop) {
        return prop?.strategy?.fracture?.mode === "chunk";
    }
    static _glassFootprintArea(prop) {
        if (prop.footprintArea != null) return prop.footprintArea;
        const shape = prop.shape;
        if (shape?.type === "Polygon") return Math.abs(polygonSignedArea2D(shape.vertices));
        return 0;
    }
    static _canGlassFractureSplit(prop, minSize) {
        const shape = prop.shape;
        if (shape?.type !== "Polygon") return false;
        const { x, y } = convexFootprintHalfExtents(shape.vertices);
        if (Math.max(x, y) * 2 < minSize) return false;
        const minArea = FractureEngine.minShardAreaForPolygon(shape.vertices) * 2;
        return FractureEngine._glassFootprintArea(prop) >= minArea;
    }
    static _canChunkFractureSplit(prop, minSize) {
        const shape = prop.shape;
        const { x, y } = shape?.type === "Polygon" ? convexFootprintHalfExtents(shape.vertices) : { x: prop.radius, y: prop.radius };
        if (x * 2 < minSize || y * 2 < minSize) return false;
        if (!prop.chunks?.length) return false;
        if (prop.chunks.length > 1) return true;
        return FractureEngine.chunkNeedsMinCellSubdivide(prop.chunks[0]);
    }
    static _ensureChunkFractureGrid(prop) {
        if (prop.chunks?.length !== 1) return;
        const geom = FractureEngine.subdivideSingleChunkAtMinCell(prop.chunks[0]);
        if (geom) FractureEngine.applyPropFractureGeometry(prop, geom);
    }
    static _flatVertsFromShape(prop) {
        return prop.shape.vertices;
    }
    static _clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }
    static _propWorldPosition(prop) {
        const physId = prop._physId;
        return { x: physId !== undefined ? kineticDynamicSlab.x[physId] : prop.x, y: physId !== undefined ? kineticDynamicSlab.y[physId] : prop.y };
    }
    static _currentPropMotion(prop) {
        const physId = prop._physId;
        if (physId !== undefined) return { vx: kineticDynamicSlab.vx[physId], vy: kineticDynamicSlab.vy[physId], w: kineticDynamicSlab.w[physId] };
        return { vx: prop.vx ?? 0, vy: prop.vy ?? 0, w: prop.angularVelocity ?? 0 };
    }
    static _circleShardCount(impactForce, minShards, maxShards) {
        return FractureEngine._clamp(Math.round(3.5 + impactForce * 0.02), minShards, maxShards);
    }
    static _applyShardBurstImpulse(fracture, frag, geom, random) {
        const cos = Math.cos(fracture.facing);
        const sin = Math.sin(fracture.facing);
        const impactWorld = transformPoint2DInto({ x: 0, y: 0 }, fracture.originX, fracture.originY, fracture.impactLocal.x, fracture.impactLocal.y, cos, sin);
        const burst = Math.min(FRACTURE_TUNING.burst.maxBurst, FRACTURE_TUNING.burst.baseBurst + fracture.impactForce * FRACTURE_TUNING.burst.burstForceScale);
        const worldPos = transformPoint2DInto({ x: 0, y: 0 }, fracture.originX, fracture.originY, geom.centroid.cx, geom.centroid.cy, cos, sin);
        const dx = worldPos.x - impactWorld.x;
        const dy = worldPos.y - impactWorld.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 1e-6) {
            frag.vx += (dx / dist) * burst;
            frag.vy += (dy / dist) * burst;
        }
        frag.angularVelocity += (random() - 0.5) * FRACTURE_TUNING.burst.spinScale;
        frag._fractureCooldown = FRACTURE_TUNING.shared.cooldown;
    }
    static _spawnBurstFractureShards(world, sourceProp, fracture, shardPropId, spatialFrame = null) {
        const random = FractureEngine._fractureRandomFromImpact(fracture.originX, fracture.originY, fracture.impactForce, 991);
        return FractureEngine.spawnShardPropsFromGeometry(world, sourceProp, fracture.debris, shardPropId, spatialFrame, (frag, geom) => {
            FractureEngine._applyShardBurstImpulse(fracture, frag, geom, random);
        });
    }
    static _spawnGlassShatterShards(world, sourceProp, fracture, spatialFrame = null) {
        return FractureEngine._spawnBurstFractureShards(world, sourceProp, fracture, sourceProp.type, spatialFrame);
    }
    static _spawnChunkFractureShards(world, sourceProp, fracture, spatialFrame = null) {
        return FractureEngine.spawnShardPropsFromGeometry(world, sourceProp, fracture.debris, sourceProp.type, spatialFrame);
    }
    static _spawnCircleShatterShards(world, sourceProp, fracture, spatialFrame = null) {
        const shardPropId = sourceProp.type === "snake" || sourceProp.type === "ball" || sourceProp.type === "boid_triangle" ? "snake_shard" : sourceProp.type;
        return FractureEngine._spawnBurstFractureShards(world, sourceProp, fracture, shardPropId, spatialFrame);
    }
    static _splitMeshComponents(cells, localHitX, localHitY, impactForce, forceExplode) {
        if (!cells?.length) return [];
        let components = FractureEngine.splitChunks(cells, localHitX, localHitY, impactForce);
        if (forceExplode && cells.length > 1) components = cells.map((cell) => [cell]);
        return components;
    }
    static _geometryFromChunkComponent(comp, atOrigin) {
        const parts = comp.map((chunk) => ({ vertices: chunk.vertices }));
        return atOrigin ? FractureEngine.buildChunkGeometryAtPropOrigin(parts) : FractureEngine.buildGeometryFromChunkParts(parts);
    }
    static _peelSolidFracture(prop, localHitX, localHitY, impactForce) {
        const components = FractureEngine._splitMeshComponents(prop.chunks, localHitX, localHitY, impactForce, false);
        if (components.length <= 1) return null;
        components.sort((a, b) => b.length - a.length);
        const origin = FractureEngine._propWorldPosition(prop);
        const mainGeom = FractureEngine._geometryFromChunkComponent(components[0], false);
        const cos = Math.cos(entityFacing(prop));
        const sin = Math.sin(entityFacing(prop));
        const mainWorldPos = transformPoint2DInto({ x: 0, y: 0 }, origin.x, origin.y, mainGeom.centroid.cx, mainGeom.centroid.cy, cos, sin);
        const physId = prop._physId;
        if (physId !== undefined && physId !== -1) {
            kineticDynamicSlab.x[physId] = mainWorldPos.x;
            kineticDynamicSlab.y[physId] = mainWorldPos.y;
            prop.x = kineticDynamicSlab.x[physId];
            prop.y = kineticDynamicSlab.y[physId];
        } else {
            prop.x = mainWorldPos.x;
            prop.y = mainWorldPos.y;
        }
        const debris = components.slice(1).map((comp) => FractureEngine._geometryFromChunkComponent(comp, false));
        FractureEngine.applyPropFractureGeometry(prop, mainGeom);
        return makeFractureResult({ debris, origin, facing: entityFacing(prop) });
    }
    static _fractureImpactContext(prop, worldHitX, worldHitY, impactForce) {
        const origin = FractureEngine._propWorldPosition(prop);
        return { origin, impactLocal: FractureEngine.worldHitToPropLocal(prop, worldHitX, worldHitY), facing: entityFacing(prop), impactForce };
    }
    static _fractureGlassOnImpact(prop, worldHitX, worldHitY, impactForce) {
        if (!FractureEngine.canFracturePropSplit(prop)) return null;
        const ctx = FractureEngine._fractureImpactContext(prop, worldHitX, worldHitY, impactForce);
        const random = FractureEngine._fractureRandomFromImpact(worldHitX, worldHitY, impactForce);
        const debris = FractureEngine.shatterGlassPolygon(FractureEngine._flatVertsFromShape(prop), ctx.impactLocal.x, ctx.impactLocal.y, impactForce, random);
        if (debris.length < 2) return null;
        return makeFractureResult({ debris, origin: ctx.origin, facing: ctx.facing, impactLocal: ctx.impactLocal, impactForce });
    }
    static _fractureChunkOnImpact(prop, worldHitX, worldHitY, impactForce) {
        FractureEngine._ensureChunkFractureGrid(prop);
        if (!FractureEngine.canFracturePropSplit(prop)) return null;
        const ctx = FractureEngine._fractureImpactContext(prop, worldHitX, worldHitY, impactForce);
        const peel = FractureEngine._peelSolidFracture(prop, ctx.impactLocal.x, ctx.impactLocal.y, impactForce);
        if (!peel) return null;
        return makeFractureResult({ debris: peel.debris, originX: peel.originX, originY: peel.originY, facing: peel.facing, impactLocal: ctx.impactLocal, impactForce });
    }
    static _fractureCirclePropOnImpact(prop, worldHitX, worldHitY, impactForce) {
        const ctx = FractureEngine._fractureImpactContext(prop, worldHitX, worldHitY, impactForce);
        const debris = FractureEngine.buildCircleImpactShards(prop.radius, ctx.impactLocal, impactForce);
        if (debris.length === 0) return null;
        return makeFractureResult({ debris, origin: ctx.origin, facing: ctx.facing, impactLocal: ctx.impactLocal, impactForce });
    }
    static _prepareEngineScratch(engine, n) {
        if (!engine._splitVisited || engine._splitVisited.length < n) {
            engine._splitVisited = new Uint8Array(n);
            engine._splitHitMask = new Uint8Array(n);
            engine._splitHitVisited = new Uint8Array(n);
            engine._splitQueue = [];
        } else {
            engine._splitVisited.fill(0, 0, n);
            engine._splitHitMask.fill(0, 0, n);
            engine._splitHitVisited.fill(0, 0, n);
            engine._splitQueue.length = 0;
        }
        return { visited: engine._splitVisited, hitMask: engine._splitHitMask, hitVisited: engine._splitHitVisited, queue: engine._splitQueue };
    }
    static _prepareStaticScratch(n) {
        const scratch = FractureEngine._splitScratch;
        if (!scratch.visited || scratch.capacity < n) {
            scratch.visited = new Uint8Array(n);
            scratch.hitMask = new Uint8Array(n);
            scratch.hitVisited = new Uint8Array(n);
            scratch.queue = [];
            scratch.capacity = n;
        } else {
            scratch.visited.fill(0, 0, n);
            scratch.hitMask.fill(0, 0, n);
            scratch.hitVisited.fill(0, 0, n);
            scratch.queue.length = 0;
        }
        return scratch;
    }
    static _splitChunksWithScratch(scratch, chunks, localHitX, localHitY, impactForce) {
        const n = chunks.length;
        const tuning = FRACTURE_TUNING.chunk;
        const damageRadius = impactForce * tuning.damageRadiusScale;
        const damageRadiusSq = damageRadius * damageRadius;
        const chunkProb = impactForce >= tuning.neighborRollHighForceThreshold ? Math.min(1, impactForce / tuning.neighborRollHighForceDivisor) : Math.max(tuning.neighborRollLowForceBase, 1.0 - impactForce * tuning.neighborRollLowForceScale);
        const visited = scratch.visited;
        const hitMask = scratch.hitMask;
        const hitVisited = scratch.hitVisited;
        const queue = scratch.queue;
        let hitIdx = 0;
        let minDistSq = Infinity;
        for (let i = 0; i < n; i++) {
            const chunk = chunks[i];
            const pcx = chunk.cx;
            const pcy = chunk.cy;
            const distSq = (pcx - localHitX) * (pcx - localHitX) + (pcy - localHitY) * (pcy - localHitY);
            if (distSq < minDistSq) {
                minDistSq = distSq;
                hitIdx = i;
            }
            if (distSq <= damageRadiusSq) hitMask[i] = 1;
        }
        if (!hitMask[hitIdx]) hitMask[hitIdx] = 1;
        for (let i = 0; i < n; i++) if (hitMask[i]) visited[i] = 1;
        const components = [];
        for (let i = 0; i < n; i++)
            if (!visited[i]) {
                const comp = [];
                queue.length = 0;
                queue.push(i);
                visited[i] = 1;
                let head = 0;
                while (head < queue.length) {
                    const curr = queue[head++];
                    comp.push(chunks[curr]);
                    const neighbors = chunks[curr].neighbors;
                    for (let j = 0; j < neighbors.length; j++) {
                        const neighbor = neighbors[j];
                        if (!visited[neighbor]) {
                            visited[neighbor] = 1;
                            queue.push(neighbor);
                        }
                    }
                }
                components.push(comp);
            }
        hitVisited.fill(0, 0, n);
        for (let i = 0; i < n; i++)
            if (hitMask[i] && !hitVisited[i]) {
                const chunk = [];
                queue.length = 0;
                queue.push(i);
                hitVisited[i] = 1;
                let head = 0;
                while (head < queue.length) {
                    const curr = queue[head++];
                    chunk.push(chunks[curr]);
                    const neighbors = chunks[curr].neighbors;
                    for (let j = 0; j < neighbors.length; j++) {
                        const neighbor = neighbors[j];
                        if (hitMask[neighbor] && !hitVisited[neighbor])
                            if (FractureEngine._fractureNeighborRoll(localHitX, localHitY, impactForce, neighbor) < chunkProb) {
                                hitVisited[neighbor] = 1;
                                queue.push(neighbor);
                            }
                    }
                }
                components.push(chunk);
            }
        components.sort((a, b) => b.length - a.length);
        if (components.length === 1) return [chunks];
        return components;
    }
}
FractureEngine._splitScratch = { visited: null, hitMask: null, hitVisited: null, queue: null, capacity: 0 };
const FRACTURE_MODES = {
    chunk: { retainParent: true, needsChunkGrid: true, initFootprint: true, onImpact: (prop, worldHitX, worldHitY, impactForce) => FractureEngine._fractureChunkOnImpact(prop, worldHitX, worldHitY, impactForce), spawnShards: (world, sourceProp, fracture, spatialFrame) => FractureEngine._spawnChunkFractureShards(world, sourceProp, fracture, spatialFrame), canSplit: (prop, minSize) => FractureEngine._canChunkFractureSplit(prop, minSize) },
    glass: { retainParent: false, needsChunkGrid: false, initFootprint: false, onImpact: (prop, worldHitX, worldHitY, impactForce) => FractureEngine._fractureGlassOnImpact(prop, worldHitX, worldHitY, impactForce), spawnShards: (world, sourceProp, fracture, spatialFrame) => FractureEngine._spawnGlassShatterShards(world, sourceProp, fracture, spatialFrame), canSplit: (prop, minSize) => FractureEngine._canGlassFractureSplit(prop, minSize) },
    circle: { retainParent: false, skipCanSplit: true, onImpact: (prop, worldHitX, worldHitY, impactForce) => FractureEngine._fractureCirclePropOnImpact(prop, worldHitX, worldHitY, impactForce), spawnShards: (world, sourceProp, fracture, spatialFrame) => FractureEngine._spawnCircleShatterShards(world, sourceProp, fracture, spatialFrame) },
};
// ===== END FRACTURE ENGINE =====

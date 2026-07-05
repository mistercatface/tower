import propCatalog from "../../Assets/props/index.js";
import {
    PolygonShape,
    getEntityCollisionParts,
    resolveBodyRadius,
    CircleShape,
    invalidateBroadphaseBounds,
    kineticMassFromFootprint,
    syncKineticRigidBody,
    wakeKineticBody,
    kineticDynamicSlab,
    kineticPairBodyAt,
    KINETIC_PAIR_TIER,
    IDENTITY_ROLL_QUAT,
} from "../Physics/physics.js";
import {
    transformPoint2DInto,
    ensureFlatVerts,
    quantizeAngleIndex,
    scaleFlatVerts,
    boxLocalFootprint,
    convexFootprintHalfExtents,
    vertCount,
    quantizeAngle,
    rotateXY,
    polygonCentroid2D,
    pointInPolygon,
    polygonSignedArea2D,
    closestPointOnLineSegment,
    quantizeCardinalAngle,
} from "../Math/math.js";
import { drawExtrudedConvexPolygon, drawExtrudedCompoundPolygon } from "../Render/Props3D/SolidDraw.js";
import { resolveVisualOverrideColorTree, resolveVisualOverridePanels, visualOverrideCacheKey } from "../Color/visualOverride.js";
import { NEUTRAL_BOX_COLORS } from "../../Assets/props/shared/neutralCoats.js";
import { drawSphere } from "../Render/Props3D/sphere.js";
import { createFlipperPrimitive } from "../Render/Props3D/flipperPaddle.js";
import { createPipeElbowPrimitive } from "../Render/Props3D/pipeElbow.js";
import { getSurfaceProfileRevision } from "../WorldSurface/SurfaceProfileRevision.js";
import { addWorldPropToState, removeWorldPropFromState, addWorldPropsToState } from "../../GameState/EntityRegistry.js";
import { WorldProp } from "../../Entities/WorldProp.js";
import { resolveSandboxFaction } from "../Sandbox/sandboxFaction.js";
import { clearChainLinksForProp } from "../Sandbox/chainLinks.js";
// --- MERGED FROM propRenderDefaults.js ---
/** @typedef {typeof LIBRARY_PROP_QUANTIZE_STEPS} LibraryPropQuantizeSteps */
/** Crate-sized facing baseline (16 steps); larger footprints scale up in resolvePropQuantizeSteps. Optional overrides: strategy.quantizeSteps, gameDefinition.propQuantizeSteps. */
export const LIBRARY_PROP_QUANTIZE_STEPS = { facing: 16, view: 30 };
export const propQuantizeSteps = structuredClone(LIBRARY_PROP_QUANTIZE_STEPS);
// --- MERGED FROM PropCatalog.js ---
export function formatPropTypeLabel(typeId) {
    return (typeId ?? "prop").replace(/_/g, " ");
}
export function formatSandboxSpawnLabel(propId) {
    const asset = propCatalog[propId];
    return asset?.sandbox?.spawnLabel ?? formatPropTypeLabel(propId);
}
// --- MERGED FROM pipeElbowGeometry.js ---
const FACING_STEPS = 24;
/** @param {object} prop @param {object | null | undefined} asset */
export function getPipeElbowSpec(prop, asset) {
    const cfg = asset?.visuals?.world ?? {};
    const playW = prop._pipeElbowPlayfieldWidth ?? null;
    const scale = playW != null ? playW / 120 : 1;
    return {
        outletLength: cfg.outletLength * scale,
        bendRadius: cfg.bendRadius * scale,
        pipeRadius: cfg.pipeRadius * scale,
        riserHeight: cfg.riserHeight * scale,
        flangeRadius: cfg.flangeRadius * scale,
        flangeHeight: cfg.flangeHeight * scale,
    };
}
/**
 * 3D centerline in local space: vertical (+Z) → elbow in XZ plane → horizontal (+X).
 * @param {ReturnType<typeof getPipeElbowSpec>} spec
 */
export function buildPipeElbowCenterline3D(spec) {
    const { riserHeight, bendRadius: R, outletLength } = spec;
    const zArc = riserHeight - R;
    /** @type {{ x: number, y: number, z: number }[]} */
    const pts = [{ x: 0, y: 0, z: 0 }];
    const riserSteps = 5;
    for (let i = 1; i <= riserSteps; i++) pts.push({ x: 0, y: 0, z: (zArc * i) / riserSteps });
    const arcSteps = 8;
    for (let i = 1; i <= arcSteps; i++) {
        const theta = (i / arcSteps) * (Math.PI / 2);
        pts.push({ x: R - R * Math.cos(theta), y: 0, z: zArc + R * Math.sin(theta) });
    }
    const outSteps = 5;
    for (let i = 1; i <= outSteps; i++) pts.push({ x: R + (outletLength * i) / outSteps, y: 0, z: riserHeight });
    return pts;
}
/** @param {ReturnType<typeof getPipeElbowSpec>} spec */
export function buildPipeElbowCollisionFootprint(spec) {
    const endX = spec.bendRadius + spec.outletLength;
    const baseR = spec.flangeRadius;
    const mouthR = spec.pipeRadius * 1.15;
    const arcSeg = 6;
    /** @type {{ x: number, y: number }[]} */
    const pts = [];
    for (let i = 0; i <= arcSeg; i++) {
        const a = Math.PI * 0.5 + (Math.PI * i) / arcSeg;
        pts.push({ x: baseR * Math.cos(a), y: baseR * Math.sin(a) });
    }
    for (let i = 0; i <= arcSeg; i++) {
        const a = -Math.PI * 0.5 + (Math.PI * i) / arcSeg;
        pts.push({ x: endX + mouthR * Math.cos(a), y: mouthR * Math.sin(a) });
    }
    return pts;
}
/** @param {object} prop */
export function syncPipeElbowCollisionShape(prop) {
    const asset = propCatalog[prop.type];
    const spec = getPipeElbowSpec(prop, asset);
    const footprint = buildPipeElbowCollisionFootprint(spec);
    const key = footprint.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join("|");
    prop._collisionFacing = prop.facing ?? 0;
    if (prop._pipeElbowShapeKey === key && prop.shape?.type === "Polygon") return prop.shape;
    prop.shape = new PolygonShape(ensureFlatVerts(footprint));
    prop._pipeElbowShapeKey = key;
    return prop.shape;
}
/** @param {object} prop @param {object | null | undefined} asset */
export function getPipeElbowOutletWorld(prop, asset) {
    const spec = getPipeElbowSpec(prop, asset);
    const centerline = buildPipeElbowCenterline3D(spec);
    const end = centerline[centerline.length - 1];
    const facing = prop.facing ?? 0;
    const cos = Math.cos(facing);
    const sin = Math.sin(facing);
    const world = transformPoint2DInto({ x: 0, y: 0 }, prop.x, prop.y, end.x, end.y, cos, sin);
    return { x: world.x, y: world.y, nx: cos, ny: sin };
}
/** @param {object} prop */
export function getPipeElbowSpriteCacheKey(prop) {
    const asset = propCatalog[prop.type];
    const spec = getPipeElbowSpec(prop, asset);
    return `pe_${Math.round(spec.outletLength)}_${Math.round(spec.bendRadius)}_f${quantizeAngleIndex(prop.facing ?? 0, FACING_STEPS)}`;
}
// --- MERGED FROM primitives.js ---
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
        const drawOpts = {
            height,
            facing: prop.facing,
            faceColors: { shadow: tinted.sideShadow, mid: tinted.side, highlight: tinted.top },
            backFaceColors: { shadow: tinted.sideShadow, mid: tinted.sideShadow, highlight: tinted.side },
            bottomColors: tinted.bottom ? { light: tinted.sideShadow, mid: tinted.bottom, dark: tinted.sideShadow } : null,
            topColors: tinted.bottom ? { light: tinted.topHighlight ?? tinted.top, mid: tinted.top, dark: tinted.side } : { light: tinted.top, mid: tinted.top, dark: tinted.side },
            stroke: tinted.stroke,
            seamStroke: tinted.seamStroke,
            lineWidth: resolvedLineWidth,
            plankTs,
            topCross,
        };
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
            const drawOpts = {
                height,
                facing: prop.facing,
                faceColors: { shadow: tinted.sideShadow, mid: tinted.side, highlight: tinted.top },
                backFaceColors: { shadow: tinted.sideShadow, mid: tinted.sideShadow, highlight: tinted.side },
                bottomColors: tinted.bottom ? { light: tinted.sideShadow, mid: tinted.bottom, dark: tinted.sideShadow } : null,
                topColors: tinted.bottom ? { light: tinted.topHighlight ?? tinted.top, mid: tinted.top, dark: tinted.side } : { light: tinted.top, mid: tinted.top, dark: tinted.side },
                stroke: tinted.stroke,
                seamStroke: tinted.seamStroke,
                lineWidth: 1.0,
            };
            const parts = getEntityCollisionParts(prop);
            if (parts.length > 1) drawExtrudedCompoundPolygon(ctx, prop, viewport, { ...drawOpts, partsVerts: parts.map((p) => p.vertices) });
            else if (parts.length === 1) drawExtrudedConvexPolygon(ctx, prop, viewport, { ...drawOpts, localVerts: parts[0].vertices });
            return;
        }
        drawSphere(ctx, prop, viewport, {
            baseRadius: resolveBodyRadius(prop, visuals.defaultRadius ?? 7),
            panelCount: visuals.panelCount,
            latBands: visuals.latBands,
            panelColors: resolveVisualOverridePanels(prop, visuals.panels),
            stroke: visuals.stroke,
        });
    };
}
/** @type {Record<string, (visuals: object, opts?: object) => Function>} */
export const PROP_PRIMITIVE_BUILDERS = { sphere: createSpherePrimitive, polygon: createPolygonPrimitive, flipper: createFlipperPrimitive, pipeElbow: createPipeElbowPrimitive };
// --- MERGED FROM propScale.js ---
function getPolygonPropBoundingRadius(prop) {
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
    invalidateBroadphaseBounds(prop);
    if (prop.strategy?.isKinetic) {
        syncKineticRigidBody(prop);
        wakeKineticBody(prop);
    }
}
function setPolygonPropBoundingRadius(prop, boundingRadius) {
    const currentRadius = getPolygonPropBoundingRadius(prop);
    if (!currentRadius || currentRadius <= 0) throw new Error(`setPolygonPropBoundingRadius requires a polygon prop with positive radius, got ${currentRadius}`);
    scalePolygonPropFootprint(prop, boundingRadius / currentRadius);
}
function getCirclePropRadius(prop) {
    const shape = prop.shape;
    if (shape?.type === "Circle") return shape.radius;
    return prop.radius ?? null;
}
function setCirclePropRadius(prop, radius) {
    if (radius <= 0) throw new Error(`Circle prop radius must be > 0, got ${radius}`);
    if (prop.strategy?.syncCollisionShape) {
        prop.strategy.radius = radius;
        prop.strategy.syncCollisionShape(prop);
        prop.stateTimer = (prop.stateTimer ?? 0) + 1;
        invalidateBroadphaseBounds(prop);
        if (prop.strategy?.isKinetic) {
            prop.mass = kineticMassFromFootprint(prop);
            wakeKineticBody(prop);
        }
        return;
    }
    const shape = prop.shape;
    if (shape?.type !== "Circle") throw new Error(`setCirclePropRadius requires a circle prop, got ${shape?.type ?? "none"}`);
    prop.shape = new CircleShape(radius);
    prop.radius = radius;
    if (prop.strategy) prop.strategy.radius = radius;
    invalidateBroadphaseBounds(prop);
    if (prop.strategy?.isKinetic) {
        syncKineticRigidBody(prop);
        wakeKineticBody(prop);
    }
}
// --- MERGED FROM worldPropPool.js ---
const pools = new Map();
/**
 * Acquire a pooled WorldProp instance or create a new one.
 * Resets critical physical and state properties.
 *
 * @param {number} x
 * @param {number} y
 * @param {string} type
 * @param {number|null} [facing]
 * @returns {WorldProp}
 */
export function acquireWorldProp(x, y, type, facing = null) {
    let list = pools.get(type);
    if (!list) {
        list = [];
        pools.set(type, list);
    }
    if (list.length > 0) {
        const prop = list.pop();
        const asset = propCatalog[type];
        // Reset spatial properties
        prop.x = x;
        prop.y = y;
        prop.z = 0;
        prop.isDead = false;
        // Reset motion state
        prop.vx = 0;
        prop.vy = 0;
        prop.angularVelocity = 0;
        prop.ageMs = 0;
        prop._sleepFrames = 0;
        prop.isSleeping = false;
        prop.stateTimer = 0;
        prop.stateData = {};
        // Reset height
        prop.height = asset?.visuals?.world?.height ?? 12;
        // Reset facing / roll quaternions
        if (prop.strategy?.cardinalFacing) prop.facing = quantizeCardinalAngle(facing ?? 0);
        else prop.facing = facing ?? Math.random() * Math.PI * 2;
        if (prop.strategy?.rolls) prop.rollQuat = { ...IDENTITY_ROLL_QUAT };
        // Clear refs and debris-specific properties
        prop.chunks = undefined;
        prop.collisionParts = undefined;
        prop.snakeFoodValue = undefined;
        prop._glassFractureCooldown = 0;
        prop.faction = undefined;
        prop.shape = undefined;
        prop.footprintVertices = undefined;
        prop.footprintArea = undefined;
        prop.alpha = undefined;
        prop.wallChunkProfileId = undefined;
        prop.wallChunkHeightPx = undefined;
        prop._wallChunkTextures = undefined;
        prop._wallChunkTextureReady = undefined;
        initWorldPropShape(prop);
        // Reset physics / broadphase / neighbor state
        if (prop._kineticLinkNeighbors) prop._kineticLinkNeighbors.length = 0;
        prop._kineticIslandPeers = null;
        if (prop._neighbors) prop._neighbors.length = 0;
        prop._neighborsFrameId = -1;
        delete prop._physId;
        delete prop._activeSlot;
        // Re-run FSM state to reset to normal
        prop.changeState("normal");
        return prop;
    }
    return new WorldProp(x, y, type, facing);
}
/**
 * Release a WorldProp instance to the pool if it is a debris type.
 *
 * @param {WorldProp} prop
 */
export function releaseWorldProp(prop) {
    if (!prop) return;
    const type = prop.type;
    const isDebris = prop.strategy?.fracture?.mode === "glass" || prop.strategy?.fracture?.mode === "chunk";
    if (!isDebris) return;
    // Clear shapes/geometries to release heavy arrays
    prop.shape = undefined;
    prop.collisionParts = undefined;
    prop.footprintVertices = undefined;
    let list = pools.get(type);
    if (!list) {
        list = [];
        pools.set(type, list);
    }
    if (list.indexOf(prop) === -1) list.push(prop);
}
/**
 * Clear the pool contents (useful for tests or level transition).
 */
export function clearWorldPropPools() {
    pools.clear();
}
/**
 * Get pool size for a given prop type (useful for tests).
 *
 * @param {string} type
 * @returns {number}
 */
export function getWorldPropPoolSize(type) {
    return pools.get(type)?.length ?? 0;
}
// --- MERGED FROM fractureSystem.js ---
// --- MERGED FROM poxelFracture.js ---
export const POXEL_TARGET_EDGE = 4;
const SHARED_CENTROID = { cx: 0, cy: 0, signedArea: 0 };
const MAX_FRAC_VERTS = 2048;
const MAX_FRAC_TRIS = 4096;
const FRAC_VERTS = new Float32Array(MAX_FRAC_VERTS * 2);
const FRAC_TRIS = new Uint16Array(MAX_FRAC_TRIS * 3);
function hashV(x, y) {
    return Math.round(x * 10000) + "," + Math.round(y * 10000);
}
function calculateCentroidOfParts(parts) {
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
function getOuterBoundary(parts) {
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
            const ha = hashV(ax, ay);
            const hb = hashV(bx, by);
            if (!vMap.has(ha)) vMap.set(ha, { x: ax, y: ay });
            if (!vMap.has(hb)) vMap.set(hb, { x: bx, y: by });
            const edgeKey = ha + ";" + hb;
            edgeCounts.set(edgeKey, (edgeCounts.get(edgeKey) || 0) + 1);
        }
    }
    const nextMap = new Map();
    for (const edgeKey of edgeCounts.keys()) {
        const [ha, hb] = edgeKey.split(";");
        const revKey = hb + ";" + ha;
        if (!edgeCounts.has(revKey)) {
            if (!nextMap.has(ha)) nextMap.set(ha, []);
            nextMap.get(ha).push(hb);
        }
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
        loops.push(loop);
    }
    loops.sort((a, b) => b.length - a.length);
    return loops.length > 0 ? loops[0] : parts[0].vertices;
}
function buildPoxelData(visualParts) {
    const poxels = [];
    for (let i = 0; i < visualParts.length; i++) poxels.push({ id: i, vertices: visualParts[i].vertices, neighbors: [] });
    const edgeMap = new Map();
    for (let i = 0; i < poxels.length; i++) {
        const v = poxels[i].vertices;
        const count = v.length / 2;
        for (let j = 0; j < count; j++) {
            const ax = v[j * 2];
            const ay = v[j * 2 + 1];
            const nextIdx = ((j + 1) % count) * 2;
            const bx = v[nextIdx];
            const by = v[nextIdx + 1];
            const h1 = hashV(ax, ay);
            const h2 = hashV(bx, by);
            const edgeKey = h1 < h2 ? h1 + ";" + h2 : h2 + ";" + h1;
            const edge = edgeMap.get(edgeKey);
            if (!edge) edgeMap.set(edgeKey, [i]);
            else edge.push(i);
        }
    }
    for (const indices of edgeMap.values())
        if (indices.length === 2) {
            const a = indices[0];
            const b = indices[1];
            if (!poxels[a].neighbors.includes(b)) poxels[a].neighbors.push(b);
            if (!poxels[b].neighbors.includes(a)) poxels[b].neighbors.push(a);
        }
    return poxels;
}
function triangulatePolygon(vertices) {
    const count = vertices.length / 2;
    if (count <= 3) {
        const res = new Float32Array(vertices.length);
        for (let i = 0; i < vertices.length; i++) res[i] = vertices[i];
        return res;
    }
    let isConvex = true;
    let sign = 0;
    for (let i = 0; i < count; i++) {
        const p0x = vertices[i * 2];
        const p0y = vertices[i * 2 + 1];
        const p1x = vertices[((i + 1) % count) * 2];
        const p1y = vertices[((i + 1) % count) * 2 + 1];
        const p2x = vertices[((i + 2) % count) * 2];
        const p2y = vertices[((i + 2) % count) * 2 + 1];
        const cross = (p1x - p0x) * (p2y - p1y) - (p1y - p0y) * (p2x - p1x);
        if (Math.abs(cross) > 0.0001)
            if (sign === 0) sign = Math.sign(cross);
            else if (Math.sign(cross) !== sign) {
                isConvex = false;
                break;
            }
    }
    if (isConvex) {
        let cx = 0;
        let cy = 0;
        for (let i = 0; i < count; i++) {
            cx += vertices[i * 2];
            cy += vertices[i * 2 + 1];
        }
        cx /= count;
        cy /= count;
        const res = new Float32Array(count * 6);
        for (let i = 0; i < count; i++) {
            const p1x = vertices[i * 2];
            const p1y = vertices[i * 2 + 1];
            const p2x = vertices[((i + 1) % count) * 2];
            const p2y = vertices[((i + 1) % count) * 2 + 1];
            res[i * 6] = p1x;
            res[i * 6 + 1] = p1y;
            res[i * 6 + 2] = p2x;
            res[i * 6 + 3] = p2y;
            res[i * 6 + 4] = cx;
            res[i * 6 + 5] = cy;
        }
        return res;
    }
    const V = [];
    for (let i = 0; i < count; i++) V.push({ x: vertices[i * 2], y: vertices[i * 2 + 1] });
    let changed = true;
    let cleanSafety = 0;
    while (changed && V.length > 3 && cleanSafety++ < 100) {
        changed = false;
        let i = 0;
        while (i < V.length && V.length > 3) {
            const prev = (i - 1 + V.length) % V.length;
            const next = (i + 1) % V.length;
            const dx1 = V[i].x - V[prev].x;
            const dy1 = V[i].y - V[prev].y;
            const dx2 = V[next].x - V[i].x;
            const dy2 = V[next].y - V[i].y;
            const len1 = Math.hypot(dx1, dy1);
            const len2 = Math.hypot(dx2, dy2);
            if (len1 < 0.0001) {
                V.splice(i, 1);
                changed = true;
                continue;
            }
            if (len2 > 0.0001) {
                const cross = (dx1 * dy2 - dy1 * dx2) / (len1 * len2);
                const dot = (dx1 * dx2 + dy1 * dy2) / (len1 * len2);
                if (Math.abs(cross) < 0.005 && dot > 0) {
                    V.splice(i, 1);
                    changed = true;
                    continue;
                }
            }
            i++;
        }
    }
    let area = 0;
    for (let j = 0; j < V.length; j++) {
        const k = (j + 1) % V.length;
        area += V[j].x * V[k].y - V[k].x * V[j].y;
    }
    if (area < 0) V.reverse();
    const flatResult = [];
    let safety = 0;
    while (V.length > 3 && safety++ < 2000) {
        let bestEar = -1;
        let bestScore = -Infinity;
        const len = V.length;
        for (let j = 0; j < len; j++) {
            const prevIdx = (j - 1 + len) % len;
            const nextIdx = (j + 1) % len;
            const A = V[prevIdx];
            const B = V[j];
            const C = V[nextIdx];
            const cross = (B.x - A.x) * (C.y - A.y) - (B.y - A.y) * (C.x - A.x);
            if (cross <= 0.00001) continue;
            let isEar = true;
            for (let k = 0; k < len; k++) {
                if (k === prevIdx || k === j || k === nextIdx) continue;
                const P = V[k];
                if (P.x < Math.min(A.x, B.x, C.x) || P.x > Math.max(A.x, B.x, C.x) || P.y < Math.min(A.y, B.y, C.y) || P.y > Math.max(A.y, B.y, C.y)) continue;
                const c1 = (B.x - A.x) * (P.y - A.y) - (B.y - A.y) * (P.x - A.x);
                const c2 = (C.x - B.x) * (P.y - B.y) - (C.y - B.y) * (P.x - B.x);
                const c3 = (A.x - C.x) * (P.y - C.y) - (A.y - C.y) * (P.x - C.x);
                if (c1 >= -0.0001 && c2 >= -0.0001 && c3 >= -0.0001) {
                    isEar = false;
                    break;
                }
            }
            if (isEar) {
                const cutSq = (A.x - C.x) * (A.x - C.x) + (A.y - C.y) * (A.y - C.y);
                const score = cross / (cutSq * cutSq);
                if (score > bestScore) {
                    bestScore = score;
                    bestEar = j;
                }
            }
        }
        if (bestEar !== -1) {
            const prevIdx = (bestEar - 1 + len) % len;
            const nextIdx = (bestEar + 1) % len;
            flatResult.push(V[prevIdx].x, V[prevIdx].y, V[bestEar].x, V[bestEar].y, V[nextIdx].x, V[nextIdx].y);
            V.splice(bestEar, 1);
        } else {
            let bestI = -1;
            let maxCross = -Infinity;
            for (let j = 0; j < len; j++) {
                const prevIdx = (j - 1 + len) % len;
                const nextIdx = (j + 1) % len;
                const A = V[prevIdx];
                const B = V[j];
                const C = V[nextIdx];
                const cross = (B.x - A.x) * (C.y - A.y) - (B.y - A.y) * (C.x - A.x);
                if (cross > maxCross) {
                    maxCross = cross;
                    bestI = j;
                }
            }
            if (bestI !== -1) {
                const prevIdx = (bestI - 1 + len) % len;
                const nextIdx = (bestI + 1) % len;
                flatResult.push(V[prevIdx].x, V[prevIdx].y, V[bestI].x, V[bestI].y, V[nextIdx].x, V[nextIdx].y);
                V.splice(bestI, 1);
            } else break;
        }
    }
    while (V.length >= 3) {
        flatResult.push(V[0].x, V[0].y, V[1].x, V[1].y, V[2].x, V[2].y);
        V.splice(1, 1);
    }
    const finalRes = new Float32Array(flatResult.length);
    for (let j = 0; j < flatResult.length; j++) finalRes[j] = flatResult[j];
    return finalRes;
}
function generateVisualFractures(baseTriangles, targetEdgeLen = POXEL_TARGET_EDGE) {
    let vCount = 0;
    let tCount = 0;
    function getVertId(x, y) {
        for (let i = 0; i < vCount; i++) if (Math.abs(FRAC_VERTS[i * 2] - x) < 0.0001 && Math.abs(FRAC_VERTS[i * 2 + 1] - y) < 0.0001) return i;
        FRAC_VERTS[vCount * 2] = x;
        FRAC_VERTS[vCount * 2 + 1] = y;
        return vCount++;
    }
    for (let i = 0; i < baseTriangles.length; i += 6) {
        FRAC_TRIS[tCount * 3] = getVertId(baseTriangles[i], baseTriangles[i + 1]);
        FRAC_TRIS[tCount * 3 + 1] = getVertId(baseTriangles[i + 2], baseTriangles[i + 3]);
        FRAC_TRIS[tCount * 3 + 2] = getVertId(baseTriangles[i + 4], baseTriangles[i + 5]);
        tCount++;
    }
    const targetSq = targetEdgeLen * targetEdgeLen;
    let safety = 0;
    while (safety++ < 2000) {
        let worstTri = -1;
        let worstEdgeA = -1;
        let worstEdgeB = -1;
        let worstScore = 0;
        for (let i = 0; i < tCount; i++)
            for (let j = 0; j < 3; j++) {
                const vA = FRAC_TRIS[i * 3 + j];
                const vB = FRAC_TRIS[i * 3 + ((j + 1) % 3)];
                const dx = FRAC_VERTS[vA * 2] - FRAC_VERTS[vB * 2];
                const dy = FRAC_VERTS[vA * 2 + 1] - FRAC_VERTS[vB * 2 + 1];
                const dSq = dx * dx + dy * dy;
                if (dSq > worstScore && dSq > targetSq) {
                    worstScore = dSq;
                    worstTri = i;
                    worstEdgeA = vA;
                    worstEdgeB = vB;
                }
            }
        if (worstTri === -1) break;
        const midX = (FRAC_VERTS[worstEdgeA * 2] + FRAC_VERTS[worstEdgeB * 2]) * 0.5;
        const midY = (FRAC_VERTS[worstEdgeA * 2 + 1] + FRAC_VERTS[worstEdgeB * 2 + 1]) * 0.5;
        FRAC_VERTS[vCount * 2] = midX;
        FRAC_VERTS[vCount * 2 + 1] = midY;
        const midId = vCount++;
        const origTCount = tCount;
        for (let i = 0; i < origTCount; i++) {
            const t0 = FRAC_TRIS[i * 3];
            const t1 = FRAC_TRIS[i * 3 + 1];
            const t2 = FRAC_TRIS[i * 3 + 2];
            const hasA = t0 === worstEdgeA || t1 === worstEdgeA || t2 === worstEdgeA;
            const hasB = t0 === worstEdgeB || t1 === worstEdgeB || t2 === worstEdgeB;
            if (hasA && hasB) {
                const vC = t0 !== worstEdgeA && t0 !== worstEdgeB ? t0 : t1 !== worstEdgeA && t1 !== worstEdgeB ? t1 : t2;
                const isForward = (t0 === worstEdgeA && t1 === worstEdgeB) || (t1 === worstEdgeA && t2 === worstEdgeB) || (t2 === worstEdgeA && t0 === worstEdgeB);
                const vStart = isForward ? worstEdgeA : worstEdgeB;
                const vEnd = isForward ? worstEdgeB : worstEdgeA;
                FRAC_TRIS[i * 3] = vStart;
                FRAC_TRIS[i * 3 + 1] = midId;
                FRAC_TRIS[i * 3 + 2] = vC;
                FRAC_TRIS[tCount * 3] = midId;
                FRAC_TRIS[tCount * 3 + 1] = vEnd;
                FRAC_TRIS[tCount * 3 + 2] = vC;
                tCount++;
            }
        }
    }
    const result = new Array(tCount);
    for (let i = 0; i < tCount; i++) {
        const t0 = FRAC_TRIS[i * 3];
        const t1 = FRAC_TRIS[i * 3 + 1];
        const t2 = FRAC_TRIS[i * 3 + 2];
        result[i] = { vertices: new Float32Array([FRAC_VERTS[t0 * 2], FRAC_VERTS[t0 * 2 + 1], FRAC_VERTS[t1 * 2], FRAC_VERTS[t1 * 2 + 1], FRAC_VERTS[t2 * 2], FRAC_VERTS[t2 * 2 + 1]]) };
    }
    return result;
}
function halfExtentsFromFootprint(footprintVertices) {
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
function boundingRadiusFromFootprint(footprintVertices) {
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
function clonePoxels(poxels) {
    return poxels.map((poxel) => {
        const pVerts = new Float32Array(poxel.vertices.length);
        pVerts.set(poxel.vertices);
        return { id: poxel.id, vertices: pVerts, neighbors: [...poxel.neighbors] };
    });
}
function finalizeFootprintGeometry(centeredVerts, visualParts, signedArea, centroid) {
    const poxels = buildPoxelData(visualParts);
    const footprintArea = Math.abs(signedArea);
    const halfExtents = halfExtentsFromFootprint(centeredVerts);
    const boundingRadius = boundingRadiusFromFootprint(centeredVerts);
    return { footprintVertices: centeredVerts, poxels: clonePoxels(poxels), footprintArea, halfExtents, boundingRadius, centroid };
}
export function localBoxOutline(halfX, halfY) {
    return boxLocalFootprint(halfX, halfY);
}
export function bakePoxelOutline(flatVerts, targetEdgeLen = POXEL_TARGET_EDGE) {
    const { cx, cy, signedArea } = polygonCentroid2D(flatVerts, SHARED_CENTROID);
    const count = flatVerts.length / 2;
    const centeredVerts = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
        centeredVerts[i * 2] = flatVerts[i * 2] - cx;
        centeredVerts[i * 2 + 1] = flatVerts[i * 2 + 1] - cy;
    }
    const partsVerts = triangulatePolygon(centeredVerts);
    const visualFractures = generateVisualFractures(partsVerts, targetEdgeLen);
    return finalizeFootprintGeometry(centeredVerts, visualFractures, signedArea, { cx, cy });
}
export function buildGeometryFromPoxelParts(localParts) {
    const { cx, cy } = calculateCentroidOfParts(localParts);
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
    const boundaryPoints = getOuterBoundary(shiftedParts);
    const bpCount = boundaryPoints.length / 2;
    const centeredVerts = new Float32Array(bpCount * 2);
    centeredVerts.set(boundaryPoints);
    const { signedArea } = polygonCentroid2D(centeredVerts, SHARED_CENTROID);
    return finalizeFootprintGeometry(centeredVerts, shiftedParts, signedArea, { cx, cy });
}
export function buildGeometryFromPartsAtOrigin(localParts) {
    const parts = localParts.map((p) => ({ vertices: p.vertices }));
    const boundaryPoints = getOuterBoundary(parts);
    const footprintVertices = new Float32Array(boundaryPoints.length);
    footprintVertices.set(boundaryPoints);
    const { signedArea } = polygonCentroid2D(footprintVertices, SHARED_CENTROID);
    return finalizeFootprintGeometry(footprintVertices, parts, signedArea, { cx: 0, cy: 0 });
}
function fractureNeighborRoll(localHitX, localHitY, impactForce, neighborIndex) {
    let h = Math.imul(Math.floor(localHitX * 1000), 73856093);
    h ^= Math.imul(Math.floor(localHitY * 1000), 19349663);
    h ^= Math.imul(Math.floor(impactForce * 100), 83492791);
    h ^= Math.imul(neighborIndex, 2654435761);
    return ((h >>> 0) % 10000) / 10000;
}
export function splitPoxels(poxels, localHitX, localHitY, impactForce = 5) {
    if (!poxels || poxels.length <= 1) return [poxels];
    const damageRadius = impactForce * 0.05;
    const damageRadiusSq = damageRadius * damageRadius;
    const chunkProb = impactForce >= 12 ? Math.min(1, impactForce / 30) : Math.max(0.1, 1.0 - impactForce * 0.04);
    let hitIdx = 0;
    let minDistSq = Infinity;
    const hitSet = new Set();
    for (let i = 0; i < poxels.length; i++) {
        const poxel = poxels[i];
        let pcx = 0;
        let pcy = 0;
        const vCount = poxel.vertices.length / 2;
        for (let j = 0; j < vCount; j++) {
            pcx += poxel.vertices[j * 2];
            pcy += poxel.vertices[j * 2 + 1];
        }
        pcx /= vCount;
        pcy /= vCount;
        const distSq = (pcx - localHitX) * (pcx - localHitX) + (pcy - localHitY) * (pcy - localHitY);
        if (distSq < minDistSq) {
            minDistSq = distSq;
            hitIdx = i;
        }
        if (distSq <= damageRadiusSq) hitSet.add(i);
    }
    if (hitSet.size === 0) hitSet.add(hitIdx);
    const visited = new Array(poxels.length).fill(false);
    for (const idx of hitSet) visited[idx] = true;
    const components = [];
    for (let i = 0; i < poxels.length; i++)
        if (!visited[i]) {
            const comp = [];
            const q = [i];
            visited[i] = true;
            let head = 0;
            while (head < q.length) {
                const curr = q[head++];
                comp.push(poxels[curr]);
                for (let j = 0; j < poxels[curr].neighbors.length; j++) {
                    const n = poxels[curr].neighbors[j];
                    if (!visited[n]) {
                        visited[n] = true;
                        q.push(n);
                    }
                }
            }
            components.push(comp);
        }
    const hitVisited = new Set();
    for (const idx of hitSet)
        if (!hitVisited.has(idx)) {
            const chunk = [];
            const q = [idx];
            hitVisited.add(idx);
            let head = 0;
            while (head < q.length) {
                const curr = q[head++];
                chunk.push(poxels[curr]);
                for (let j = 0; j < poxels[curr].neighbors.length; j++) {
                    const n = poxels[curr].neighbors[j];
                    if (hitSet.has(n) && !hitVisited.has(n))
                        if (fractureNeighborRoll(localHitX, localHitY, impactForce, n) < chunkProb) {
                            hitVisited.add(n);
                            q.push(n);
                        }
                }
            }
            components.push(chunk);
        }
    components.sort((a, b) => b.length - a.length);
    if (components.length === 1) return [poxels];
    return components;
}
// --- MERGED FROM chunkFracture.js ---
// chunks = split connectivity graph; collisionParts = merged axis-aligned sim/draw rects
export const CHUNK_MIN_CELL = 8;
export const CHUNK_MAX_CELLS_PER_AXIS = 6;
const RECT_MERGE_EPS = 1e-3;
function halfExtentsFromFlat(flatVerts) {
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
export function cellSizeForBoxExtents(hx, hy) {
    const span = Math.min(hx * 2, hy * 2);
    const cellsPerAxis = Math.min(CHUNK_MAX_CELLS_PER_AXIS, Math.max(2, Math.round(span / 16)));
    return Math.max(CHUNK_MIN_CELL, span / cellsPerAxis);
}
function rectFromChunk(chunk) {
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
function chunkRectSpan(chunk) {
    const rect = rectFromChunk(chunk);
    return { w: rect.x1 - rect.x0, h: rect.y1 - rect.y0 };
}
export function chunkNeedsMinCellSubdivide(chunk) {
    const { w, h } = chunkRectSpan(chunk);
    return w > CHUNK_MIN_CELL + RECT_MERGE_EPS || h > CHUNK_MIN_CELL + RECT_MERGE_EPS;
}
export function subdivideSingleChunkAtMinCell(chunk) {
    const rect = rectFromChunk(chunk);
    const hx = (rect.x1 - rect.x0) * 0.5;
    const hy = (rect.y1 - rect.y0) * 0.5;
    if (!chunkNeedsMinCellSubdivide(chunk)) return null;
    const parts = rectGridPartsCeil(hx, hy, CHUNK_MIN_CELL);
    if (parts.length <= 1) return null;
    return buildChunkGeometryAtPropOrigin(parts.map((part) => ({ vertices: part.vertices })));
}
function mergeRectsHorizontally(rects) {
    const groups = new Map();
    for (let i = 0; i < rects.length; i++) {
        const r = rects[i];
        const key = `${r.y0.toFixed(4)};${r.y1.toFixed(4)}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(r);
    }
    const out = [];
    for (const group of groups.values()) {
        group.sort((a, b) => a.x0 - b.x0);
        let cur = group[0];
        for (let i = 1; i < group.length; i++) {
            const next = group[i];
            if (Math.abs(cur.x1 - next.x0) <= RECT_MERGE_EPS) cur = { x0: cur.x0, y0: cur.y0, x1: next.x1, y1: cur.y1 };
            else {
                out.push(cur);
                cur = next;
            }
        }
        out.push(cur);
    }
    return out;
}
function mergeRectsVertically(rects) {
    const groups = new Map();
    for (let i = 0; i < rects.length; i++) {
        const r = rects[i];
        const key = `${r.x0.toFixed(4)};${r.x1.toFixed(4)}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(r);
    }
    const out = [];
    for (const group of groups.values()) {
        group.sort((a, b) => a.y0 - b.y0);
        let cur = group[0];
        for (let i = 1; i < group.length; i++) {
            const next = group[i];
            if (Math.abs(cur.y1 - next.y0) <= RECT_MERGE_EPS) cur = { x0: cur.x0, y0: cur.y0, x1: cur.x1, y1: next.y1 };
            else {
                out.push(cur);
                cur = next;
            }
        }
        out.push(cur);
    }
    return out;
}
export function mergeChunkCollisionRects(chunks) {
    let rects = chunks.map(rectFromChunk);
    let prev = rects.length + 1;
    while (rects.length < prev) {
        prev = rects.length;
        rects = mergeRectsVertically(mergeRectsHorizontally(rects));
    }
    return rects;
}
function rectArea(rect) {
    return (rect.x1 - rect.x0) * (rect.y1 - rect.y0);
}
function chunkMaterialArea(chunks) {
    let area = 0;
    for (let i = 0; i < chunks.length; i++) area += rectArea(rectFromChunk(chunks[i]));
    return area;
}
function polygonShapeFromRect(rect) {
    return new PolygonShape(new Float32Array([rect.x0, rect.y0, rect.x1, rect.y0, rect.x1, rect.y1, rect.x0, rect.y1]));
}
function collisionPartsFromChunks(chunks) {
    return mergeChunkCollisionRects(chunks).map(polygonShapeFromRect);
}
function boundingRadiusFromParts(collisionParts) {
    let maxR = 0;
    for (let i = 0; i < collisionParts.length; i++) maxR = Math.max(maxR, collisionParts[i].getBoundingRadius());
    return maxR;
}
function footprintVerticesFromParts(collisionParts) {
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
function withChunkCollisionParts(geom) {
    const collisionParts = collisionPartsFromChunks(geom.chunks);
    const footprintVertices = footprintVerticesFromParts(collisionParts);
    return { ...geom, collisionParts, footprintVertices, footprintArea: chunkMaterialArea(geom.chunks), boundingRadius: boundingRadiusFromParts(collisionParts) };
}
function centerFlatVerts(flatVerts) {
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
export function rectGridParts(hx, hy, cellSize) {
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
function rectGridPartsCeil(hx, hy, maxCellSize) {
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
export function buildGeometryFromChunkParts(localParts) {
    const geom = buildGeometryFromPoxelParts(localParts);
    return withChunkCollisionParts({ footprintVertices: geom.footprintVertices, chunks: geom.poxels, footprintArea: geom.footprintArea, boundingRadius: geom.boundingRadius, centroid: geom.centroid });
}
export function buildChunkGeometryAtPropOrigin(localParts) {
    const geom = buildGeometryFromPartsAtOrigin(localParts);
    return withChunkCollisionParts({ footprintVertices: geom.footprintVertices, chunks: geom.poxels, footprintArea: geom.footprintArea, boundingRadius: geom.boundingRadius });
}
export function bakeChunkOutline(flatVerts) {
    const centeredVerts = centerFlatVerts(flatVerts);
    const { hx, hy } = halfExtentsFromFlat(centeredVerts);
    const parts = rectGridParts(hx, hy, cellSizeForBoxExtents(hx, hy));
    const mesh = buildGeometryFromPartsAtOrigin(parts.map((p) => ({ vertices: p.vertices })));
    return {
        chunks: mesh.poxels,
        collisionParts: [new PolygonShape(boxLocalFootprint(hx, hy))],
        footprintVertices: boxLocalFootprint(hx, hy),
        boundingRadius: Math.hypot(hx, hy),
        footprintArea: hx * hy * 4,
    };
}
export function chunkCellCount(hx, hy, cellSize = cellSizeForBoxExtents(hx, hy)) {
    const cols = Math.max(1, Math.round((hx * 2) / cellSize));
    const rows = Math.max(1, Math.round((hy * 2) / cellSize));
    return cols * rows;
}
export function chunkCollisionPartsArea(collisionParts) {
    let area = 0;
    for (let i = 0; i < collisionParts.length; i++) {
        const verts = collisionParts[i].vertices;
        const w = Math.abs(verts[2] - verts[0]);
        const h = Math.abs(verts[5] - verts[3]);
        area += w * h;
    }
    return area;
}
// --- MERGED FROM glassFracture.js ---
export const GLASS_FRACTURE_IMPACT_THRESHOLD = 6;
export const GLASS_MIN_SHARD_AREA = 12;
export const GLASS_MAX_SHARDS_PER_SHATTER = 18;
export const GLASS_MAX_SLIVER_ASPECT = 10;
export const GLASS_MIN_WEDGE_ANGLE = Math.PI / 12;
export const GLASS_FRACTURE_COOLDOWN_STEPS = 8;
function polygonSpan(flatVerts) {
    return Math.sqrt(Math.abs(polygonSignedArea2D(flatVerts)));
}
function closestPointOnPolygonBoundary(x, y, flatVerts) {
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
function minDistToPolygonBoundary(x, y, flatVerts) {
    return closestPointOnPolygonBoundary(x, y, flatVerts).dist;
}
export function minShardAreaForPolygon(flatVerts) {
    const area = Math.abs(polygonSignedArea2D(flatVerts));
    return Math.max(GLASS_MIN_SHARD_AREA, area / GLASS_MAX_SHARDS_PER_SHATTER);
}
function minThinEdgeForPolygon(flatVerts) {
    return Math.max(3, polygonSpan(flatVerts) * 0.08);
}
export function measureGlassShard(flatVerts) {
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
function resolveShatterApex(flatVerts, hitX, hitY) {
    const { cx, cy } = polygonCentroid2D(flatVerts);
    const span = polygonSpan(flatVerts);
    let ax = hitX;
    let ay = hitY;
    if (!pointInPolygon(ax, ay, flatVerts)) {
        const onEdge = closestPointOnPolygonBoundary(hitX, hitY, flatVerts);
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
function clipHalfPlane(flatVerts, ax, ay, nx, ny) {
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
export function wedgePolygonIntersection(flatVerts, apexX, apexY, angle0, angle1) {
    const nx0 = -Math.sin(angle0);
    const ny0 = Math.cos(angle0);
    const nx1 = Math.sin(angle1);
    const ny1 = -Math.cos(angle1);
    let poly = flatVerts;
    poly = clipHalfPlane(poly, apexX, apexY, nx0, ny0);
    poly = clipHalfPlane(poly, apexX, apexY, nx1, ny1);
    return poly;
}
function acceptGlassShard(flatVerts, parentFlatVerts) {
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
    if (thin < minThinEdgeForPolygon(parentFlatVerts)) return false;
    if (thick / Math.max(1e-6, thin) > GLASS_MAX_SLIVER_ASPECT) return false;
    return true;
}
function buildGlassShards(flatVerts, apexX, apexY, shardCount, random) {
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
        const poly = wedgePolygonIntersection(flatVerts, apexX, apexY, a0, a1);
        if (poly.length < 6) {
            startIndex++;
            continue;
        }
        if (acceptGlassShard(poly, flatVerts)) {
            shards.push(buildShardGeometry(poly));
            lastStartIdx = startIndex;
            startIndex++;
        } else {
            let merged = false;
            if (lastStartIdx !== -1) {
                const prevA0 = angles[lastStartIdx];
                const angleDiff = a1 - prevA0;
                if (angleDiff < Math.PI * 0.95) {
                    const mergedPoly = wedgePolygonIntersection(flatVerts, apexX, apexY, prevA0, a1);
                    if (mergedPoly.length >= 6) {
                        shards.pop();
                        shards.push(buildShardGeometry(mergedPoly));
                        merged = true;
                    }
                }
            }
            if (merged) startIndex++;
            else {
                shards.push(buildShardGeometry(poly));
                lastStartIdx = startIndex;
                startIndex++;
            }
        }
    }
    return shards;
}
function shardCountForPolygon(flatVerts, impactForce, apexX, apexY) {
    const area = Math.abs(polygonSignedArea2D(flatVerts));
    const span = polygonSpan(flatVerts);
    const minArea = minShardAreaForPolygon(flatVerts);
    const areaCap = Math.max(2, Math.floor(area / minArea));
    const angleCap = Math.floor((Math.PI * 2) / GLASS_MIN_WEDGE_ANGLE);
    const minShardsAllowed = Math.min(4, areaCap);
    let count = Math.max(minShardsAllowed, Math.min(GLASS_MAX_SHARDS_PER_SHATTER, Math.round(span / 8) + Math.floor(impactForce * 0.04)));
    count = Math.min(count, areaCap, angleCap);
    const boundaryDist = minDistToPolygonBoundary(apexX, apexY, flatVerts);
    const boundaryFactor = Math.min(1, boundaryDist / (span * 0.14));
    count = Math.max(minShardsAllowed, Math.round(count * (0.35 + 0.65 * boundaryFactor)));
    return count;
}
export function buildShardGeometry(flatVerts) {
    const { cx, cy, signedArea } = polygonCentroid2D(flatVerts);
    const count = flatVerts.length / 2;
    const centered = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
        centered[i * 2] = flatVerts[i * 2] - cx;
        centered[i * 2 + 1] = flatVerts[i * 2 + 1] - cy;
    }
    return { footprintVertices: centered, footprintArea: Math.abs(signedArea), boundingRadius: boundingRadiusFromFootprint(centered), centroid: { cx, cy } };
}
export function shatterGlassPolygon(flatVerts, hitX, hitY, impactForce = 10, random = Math.random) {
    if (flatVerts.length < 6) return [];
    const parentArea = Math.abs(polygonSignedArea2D(flatVerts));
    const { x: apexX, y: apexY } = resolveShatterApex(flatVerts, hitX, hitY);
    let shardCount = shardCountForPolygon(flatVerts, impactForce, apexX, apexY);
    let shards = buildGlassShards(flatVerts, apexX, apexY, shardCount, random);
    const minArea = minShardAreaForPolygon(flatVerts);
    const areaCap = Math.max(2, Math.floor(parentArea / minArea));
    const minShardsAllowed = Math.min(4, areaCap);
    for (let attempt = 0; attempt < 4; attempt++) {
        let totalArea = 0;
        for (let i = 0; i < shards.length; i++) totalArea += shards[i].footprintArea;
        if (shards.length >= 2 && totalArea >= parentArea * 0.92) return shards;
        shardCount = Math.max(minShardsAllowed, Math.floor(shardCount * 0.72));
        shards = buildGlassShards(flatVerts, apexX, apexY, shardCount, random);
    }
    return shards.length >= 2 ? shards : [];
}
export function shatterGlassFootprint(hx, hy, hitX, hitY, impactForce = 10, random = Math.random) {
    const flat = boxLocalFootprint(hx, hy);
    return shatterGlassPolygon(flat, hitX, hitY, impactForce, random);
}
// --- MERGED FROM propFracture.js ---
export const FRACTURE_MIN_PIECE_SIZE = 5;
export const FRACTURE_IMPACT_THRESHOLD = 12;
function isGlassFracture(prop) {
    return prop?.strategy?.fracture?.mode === "glass";
}
function isChunkFracture(prop) {
    return prop?.strategy?.fracture?.mode === "chunk";
}
function glassFootprintArea(prop) {
    if (prop.footprintArea != null) return prop.footprintArea;
    const shape = prop.shape;
    if (shape?.type === "Polygon") return Math.abs(polygonSignedArea2D(shape.vertices));
    return 0;
}
function canGlassFractureSplit(prop, minSize) {
    const shape = prop.shape;
    if (shape?.type !== "Polygon") return false;
    const { x, y } = convexFootprintHalfExtents(shape.vertices);
    if (Math.max(x, y) * 2 < minSize) return false;
    const minArea = minShardAreaForPolygon(shape.vertices) * 2;
    return glassFootprintArea(prop) >= minArea;
}
export function canFracturePropSplit(prop, minSize = FRACTURE_MIN_PIECE_SIZE) {
    if (!prop?.strategy?.fracture) return false;
    if (isGlassFracture(prop)) return canGlassFractureSplit(prop, minSize);
    if (!isChunkFracture(prop)) return false;
    const shape = prop.shape;
    const { x, y } = shape?.type === "Polygon" ? convexFootprintHalfExtents(shape.vertices) : { x: prop.radius, y: prop.radius };
    if (x * 2 < minSize || y * 2 < minSize) return false;
    if (!prop.chunks?.length) return false;
    if (prop.chunks.length > 1) return true;
    return chunkNeedsMinCellSubdivide(prop.chunks[0]);
}
function ensureChunkFractureGrid(prop) {
    if (prop.chunks?.length !== 1) return;
    const geom = subdivideSingleChunkAtMinCell(prop.chunks[0]);
    if (geom) applyChunkGeometryToProp(prop, geom);
}
function flatVertsFromShape(prop) {
    return prop.shape.vertices;
}
export function initFractureFootprint(prop) {
    if (isGlassFracture(prop)) return;
    if (!isChunkFracture(prop)) throw new Error(`Fracture props need fracture.mode "chunk" or "glass", got ${prop.strategy?.fracture?.mode}`);
    applyChunkGeometryToProp(prop, bakeChunkOutline(flatVertsFromShape(prop)));
}
export function applyFractureGeometryToProp(prop, geometry) {
    prop.footprintVertices = geometry.footprintVertices;
    prop.footprintArea = geometry.footprintArea;
    prop.radius = geometry.boundingRadius;
    prop.shape = new PolygonShape(geometry.footprintVertices);
    prop.chunks = undefined;
    prop.collisionParts = undefined;
    invalidateBroadphaseBounds(prop);
    syncKineticRigidBody(prop);
}
export function applyChunkGeometryToProp(prop, geometry) {
    prop.chunks = geometry.chunks;
    prop.collisionParts = geometry.collisionParts;
    prop.footprintVertices = geometry.footprintVertices;
    prop.footprintArea = geometry.footprintArea;
    prop.radius = geometry.boundingRadius;
    prop.shape = new PolygonShape(geometry.footprintVertices);
    invalidateBroadphaseBounds(prop);
    syncKineticRigidBody(prop);
}
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
function propFacing(prop) {
    return prop.facing ?? prop.angle ?? 0;
}
function currentPropMotion(prop) {
    const physId = prop._physId;
    if (physId !== undefined) return { vx: kineticDynamicSlab.vx[physId], vy: kineticDynamicSlab.vy[physId], w: kineticDynamicSlab.w[physId] };
    return { vx: prop.vx ?? 0, vy: prop.vy ?? 0, w: prop.angularVelocity ?? 0 };
}
function circleShardCount(impactForce, minShards, maxShards) {
    return clamp(Math.round(3.5 + impactForce * 0.02), minShards, maxShards);
}
export function buildCircleImpactShards(radius, localHit, impactForce, { minShards = 4, maxShards = 5 } = {}) {
    const count = circleShardCount(impactForce, minShards, maxShards);
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
        const poly = wedgePolygonIntersection(parentPoints, apex.x, apex.y, a0, a1);
        if (poly.length >= 6) shards.push(buildShardGeometry(poly));
    }
    return shards;
}
export function spawnShardPropsFromGeometry(world, sourceProp, geometries, shardPropId, spatialFrame = null, configureShard = null) {
    const facing = propFacing(sourceProp);
    const cos = Math.cos(facing);
    const sin = Math.sin(facing);
    const motion = currentPropMotion(sourceProp);
    const faction = sourceProp.faction;
    const wallChunkProfileId = sourceProp.wallChunkProfileId;
    const wallChunkHeightPx = sourceProp.wallChunkHeightPx;
    const spawned = [];
    const physId = sourceProp._physId;
    const wx = physId !== undefined ? kineticDynamicSlab.x[physId] : sourceProp.x;
    const wy = physId !== undefined ? kineticDynamicSlab.y[physId] : sourceProp.y;
    for (let i = 0; i < geometries.length; i++) {
        const geom = geometries[i];
        const worldPos = transformPoint2DInto({ x: 0, y: 0 }, wx, wy, geom.centroid.cx, geom.centroid.cy, cos, sin);
        const shard = acquireWorldProp(worldPos.x, worldPos.y, shardPropId, facing);
        if (geom.collisionParts) applyChunkGeometryToProp(shard, geom);
        else applyFractureGeometryToProp(shard, geom);
        shard.faction = faction;
        shard.vx = motion.vx;
        shard.vy = motion.vy;
        shard.angularVelocity = motion.w;
        shard._glassFractureCooldown = GLASS_FRACTURE_COOLDOWN_STEPS;
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
        if (spatialFrame?.admitKineticProps) spatialFrame.admitKineticProps(spawned, world);
        else if (spatialFrame?.admitKineticProp) for (let i = 0; i < spawned.length; i++) spatialFrame.admitKineticProp(spawned[i], world);
    }
    return spawned;
}
function spawnGlassShatterShards(world, sourceProp, fracture, spatialFrame = null) {
    const cos = Math.cos(fracture.facing);
    const sin = Math.sin(fracture.facing);
    const impactWorld = transformPoint2DInto({ x: 0, y: 0 }, fracture.originX, fracture.originY, fracture.impactLocal.x, fracture.impactLocal.y, cos, sin);
    const burst = Math.min(35, 8 + fracture.impactForce * 0.12);
    return spawnShardPropsFromGeometry(world, sourceProp, fracture.debris, sourceProp.type, spatialFrame, (frag, geom, i) => {
        const worldPos = transformPoint2DInto({ x: 0, y: 0 }, fracture.originX, fracture.originY, geom.centroid.cx, geom.centroid.cy, cos, sin);
        const dx = worldPos.x - impactWorld.x;
        const dy = worldPos.y - impactWorld.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 1e-6) {
            frag.vx += (dx / dist) * burst;
            frag.vy += (dy / dist) * burst;
        }
        frag.angularVelocity += (Math.random() - 0.5) * 0.4;
        frag._glassFractureCooldown = GLASS_FRACTURE_COOLDOWN_STEPS;
    });
}
function spawnChunkFractureShards(world, sourceProp, fracture, spatialFrame = null) {
    return spawnShardPropsFromGeometry(world, sourceProp, fracture.debris, sourceProp.type, spatialFrame);
}
function splitMeshComponents(cells, localHitX, localHitY, impactForce, forceExplode) {
    if (!cells?.length) return [];
    let components = splitPoxels(cells, localHitX, localHitY, impactForce);
    if (forceExplode && cells.length > 1) components = cells.map((cell) => [cell]);
    return components;
}
function geometryFromChunkComponent(comp, atOrigin) {
    const parts = comp.map((chunk) => ({ vertices: chunk.vertices }));
    return atOrigin ? buildChunkGeometryAtPropOrigin(parts) : buildGeometryFromChunkParts(parts);
}
export function splitFootprintIntoComponents(prop, localHitX, localHitY, impactForce, forceExplode = false) {
    return splitMeshComponents(prop.chunks, localHitX, localHitY, impactForce, forceExplode).map((comp) => geometryFromChunkComponent(comp, false));
}
function peelSolidFracture(prop, localHitX, localHitY, impactForce) {
    const components = splitMeshComponents(prop.chunks, localHitX, localHitY, impactForce, false);
    if (components.length <= 1) return null;
    components.sort((a, b) => b.length - a.length);
    const physId = prop._physId;
    const wx = physId !== undefined ? kineticDynamicSlab.x[physId] : prop.x;
    const wy = physId !== undefined ? kineticDynamicSlab.y[physId] : prop.y;
    const mainGeom = geometryFromChunkComponent(components[0], false);
    const cos = Math.cos(propFacing(prop));
    const sin = Math.sin(propFacing(prop));
    const mainWorldPos = transformPoint2DInto({ x: 0, y: 0 }, wx, wy, mainGeom.centroid.cx, mainGeom.centroid.cy, cos, sin);
    prop.x = mainWorldPos.x;
    prop.y = mainWorldPos.y;
    if (physId !== undefined && physId !== -1) {
        kineticDynamicSlab.x[physId] = mainWorldPos.x;
        kineticDynamicSlab.y[physId] = mainWorldPos.y;
    }
    const debris = components.slice(1).map((comp) => geometryFromChunkComponent(comp, false));
    applyChunkGeometryToProp(prop, mainGeom);
    return { debris, originX: wx, originY: wy, facing: propFacing(prop) };
}
export function worldHitToPropLocal(prop, worldX, worldY) {
    const physId = prop._physId;
    const wx = physId !== undefined ? kineticDynamicSlab.x[physId] : prop.x;
    const wy = physId !== undefined ? kineticDynamicSlab.y[physId] : prop.y;
    const dx = worldX - wx;
    const dy = worldY - wy;
    const cos = Math.cos(propFacing(prop));
    const sin = Math.sin(propFacing(prop));
    return { x: dx * cos + dy * sin, y: -dx * sin + dy * cos };
}
export function impactForceFromContact(relativeSpeed, massA = 1, massB = 1) {
    return relativeSpeed * 0.5 + Math.sqrt(massA * massB) * 0.3;
}
function fractureGlassOnImpact(prop, worldHitX, worldHitY, impactForce) {
    if (!canFracturePropSplit(prop)) return null;
    const physId = prop._physId;
    const wx = physId !== undefined ? kineticDynamicSlab.x[physId] : prop.x;
    const wy = physId !== undefined ? kineticDynamicSlab.y[physId] : prop.y;
    const dx = worldHitX - wx;
    const dy = worldHitY - wy;
    const cos = Math.cos(propFacing(prop));
    const sin = Math.sin(propFacing(prop));
    const localHitX = dx * cos + dy * sin;
    const localHitY = -dx * sin + dy * cos;
    const debris = shatterGlassPolygon(flatVertsFromShape(prop), localHitX, localHitY, impactForce);
    if (debris.length < 2) return null;
    return { debris, originX: wx, originY: wy, facing: propFacing(prop), impactLocal: { x: localHitX, y: localHitY }, impactForce };
}
export function fracturePropOnImpact(prop, worldHitX, worldHitY, impactForce) {
    if (prop.shape?.type === "Circle") return fractureCirclePropOnImpact(prop, worldHitX, worldHitY, impactForce);
    if (isGlassFracture(prop)) return fractureGlassOnImpact(prop, worldHitX, worldHitY, impactForce);
    return fractureChunkOnImpact(prop, worldHitX, worldHitY, impactForce);
}

function fractureChunkOnImpact(prop, worldHitX, worldHitY, impactForce) {
    if (isGlassFracture(prop)) return fractureGlassOnImpact(prop, worldHitX, worldHitY, impactForce);
    ensureChunkFractureGrid(prop);
    if (!canFracturePropSplit(prop)) return null;
    const physId = prop._physId;
    const wx = physId !== undefined ? kineticDynamicSlab.x[physId] : prop.x;
    const wy = physId !== undefined ? kineticDynamicSlab.y[physId] : prop.y;
    const dx = worldHitX - wx;
    const dy = worldHitY - wy;
    const cos = Math.cos(propFacing(prop));
    const sin = Math.sin(propFacing(prop));
    const localHitX = dx * cos + dy * sin;
    const localHitY = -dx * sin + dy * cos;
    return peelSolidFracture(prop, localHitX, localHitY, impactForce);
}
function fractureCirclePropOnImpact(prop, worldHitX, worldHitY, impactForce) {
    const physId = prop._physId;
    const wx = physId !== undefined ? kineticDynamicSlab.x[physId] : prop.x;
    const wy = physId !== undefined ? kineticDynamicSlab.y[physId] : prop.y;
    const dx = worldHitX - wx;
    const dy = worldHitY - wy;
    const cos = Math.cos(propFacing(prop));
    const sin = Math.sin(propFacing(prop));
    const localHitX = dx * cos + dy * sin;
    const localHitY = -dx * sin + dy * cos;
    const debris = buildCircleImpactShards(prop.radius, { x: localHitX, y: localHitY }, impactForce);
    if (debris.length === 0) return null;
    return { debris, originX: wx, originY: wy, facing: propFacing(prop), impactLocal: { x: localHitX, y: localHitY }, impactForce };
}
export function spawnFractureShards(world, sourceProp, fracture, spatialFrame = null) {
    if (sourceProp.shape?.type === "Circle") return spawnCircleShatterShards(world, sourceProp, fracture, spatialFrame);
    if (isGlassFracture(sourceProp)) return spawnGlassShatterShards(world, sourceProp, fracture, spatialFrame);
    return spawnChunkFractureShards(world, sourceProp, fracture, spatialFrame);
}

function spawnCircleShatterShards(world, sourceProp, fracture, spatialFrame = null) {
    const cos = Math.cos(fracture.facing);
    const sin = Math.sin(fracture.facing);
    const impactWorld = transformPoint2DInto({ x: 0, y: 0 }, fracture.originX, fracture.originY, fracture.impactLocal.x, fracture.impactLocal.y, cos, sin);
    const burst = Math.min(35, 8 + fracture.impactForce * 0.12);
    const shardPropId = sourceProp.type === "snake" || sourceProp.type === "ball" || sourceProp.type === "boid_triangle" ? "snake_shard" : sourceProp.type;
    return spawnShardPropsFromGeometry(world, sourceProp, fracture.debris, shardPropId, spatialFrame, (frag, geom, i) => {
        const worldPos = transformPoint2DInto({ x: 0, y: 0 }, fracture.originX, fracture.originY, geom.centroid.cx, geom.centroid.cy, cos, sin);
        const dx = worldPos.x - impactWorld.x;
        const dy = worldPos.y - impactWorld.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 1e-6) {
            frag.vx += (dx / dist) * burst;
            frag.vy += (dy / dist) * burst;
        }
        frag.angularVelocity += (Math.random() - 0.5) * 0.4;
        frag._glassFractureCooldown = GLASS_FRACTURE_COOLDOWN_STEPS;
    });
}
function evictFracturedProp(world, prop, spatialFrame) {
    removeWorldPropFromState(world, prop, spatialFrame);
}
const deferredFractures = [];
let deferredFracturesCount = 0;
export function queueCircleFracture(prop, hitX, hitY, force) {
    if (prop._pendingEviction) return false;
    const fracture = fractureCirclePropOnImpact(prop, hitX, hitY, force);
    if (!fracture) return false;
    prop._pendingEviction = true;
    let item = deferredFractures[deferredFracturesCount];
    if (!item) {
        item = { type: "circle", prop: null, fracture: null };
        deferredFractures[deferredFracturesCount] = item;
    }
    item.type = "circle";
    item.prop = prop;
    item.fracture = fracture;
    deferredFracturesCount++;
    return true;
}
export function evalFractureRules(prop, other, force) {
    const config = prop.strategy?.fracture;
    if (!config) return false;
    const minForce = config.minForce ?? (config.mode === "glass" ? GLASS_FRACTURE_IMPACT_THRESHOLD : FRACTURE_IMPACT_THRESHOLD);
    if (force < minForce) return false;
    if (config.threatType && other.type !== config.threatType) return false;
    const selfFaction = resolveSandboxFaction(prop);
    if (config.excludeFactions && config.excludeFactions.includes(selfFaction)) return false;
    if (config.opponentOnly) {
        const otherFaction = resolveSandboxFaction(other);
        if (selfFaction === otherFaction) return false;
    }
    return true;
}
export function queueFractureKineticContact(tick, bodyA, bodyB, hitX, hitY, force, nx = 0, ny = 0) {
    const { frame, world } = tick;
    for (let i = 0; i < 2; i++) {
        const prop = i === 0 ? bodyA : bodyB;
        const other = i === 0 ? bodyB : bodyA;
        if (prop._physId === undefined) continue;
        if (evalFractureRules(prop, other, force)) {
            const mode = prop.strategy?.fracture?.mode;
            if (mode === "circle") {
                if (queueCircleFracture(prop, hitX, hitY, force)) return;
            } else {
                if (!canFracturePropSplit(prop)) continue;
                if (prop._glassFractureCooldown > 0) continue;
                if (isGlassFracture(prop) && isGlassFracture(other)) continue;
                if (prop._pendingEviction) continue;
                const fracture = fracturePropOnImpact(prop, hitX, hitY, force);
                if (!fracture) continue;
                prop._pendingEviction = true;
                let item = deferredFractures[deferredFracturesCount];
                if (!item) {
                    item = { type: "", prop: null, fracture: null };
                    deferredFractures[deferredFracturesCount] = item;
                }
                item.type = isGlassFracture(prop) ? "glass" : "chunk";
                item.prop = prop;
                item.fracture = fracture;
                deferredFracturesCount++;
            }
        }
    }
}
export function flushDeferredFractures(world, spatialFrame) {
    if (deferredFracturesCount === 0) return;
    world.entityRegistry.beginMembershipBatch();
    const propsToAdmit = [];
    try {
        for (let i = 0; i < deferredFracturesCount; i++) {
            const item = deferredFractures[i];
            const prop = item.prop;
            delete prop._pendingEviction;
            if (item.type === "glass") {
                evictFracturedProp(world, prop, spatialFrame);
            } else if (item.type === "circle") {
                clearChainLinksForProp(world, prop.id);
                evictFracturedProp(world, prop, spatialFrame);
            } else {
                wakeKineticBody(prop);
                propsToAdmit.push(prop);
            }
            const shards = spawnFractureShards(world, prop, item.fracture, spatialFrame);
            for (let j = 0; j < shards.length; j++) propsToAdmit.push(shards[j]);
            item.prop = null;
            item.fracture = null;
        }
        if (propsToAdmit.length > 0)
            if (spatialFrame?.admitKineticProps) spatialFrame.admitKineticProps(propsToAdmit, world);
            else if (spatialFrame?.admitKineticProp) for (let j = 0; j < propsToAdmit.length; j++) spatialFrame.admitKineticProp(propsToAdmit[j], world);
    } finally {
        world.entityRegistry.endMembershipBatch();
        deferredFracturesCount = 0;
    }
}
export function processKineticContactFractures(tick, contacts) {
    if (contacts.count === 0) return;
    const slab = kineticDynamicSlab;
    for (let i = 0; i < contacts.count; i++) {
        const physIdA = contacts.physIdA[i];
        const physIdB = contacts.physIdB[i];
        const bodyA = kineticPairBodyAt(tick.frame, physIdA);
        const bodyB = kineticPairBodyAt(tick.frame, physIdB);
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
        const force = impactForceFromContact(relSpeed, bodyA.mass, bodyB.mass);
        queueFractureKineticContact(tick, bodyA, bodyB, hitX, hitY, force, nx, ny);
    }
    flushDeferredFractures(tick.world, tick.frame);
}
export function getPropRadius(prop) {
    if (prop.shape?.type === "Polygon") return getPolygonPropBoundingRadius(prop);
    return getCirclePropRadius(prop);
}
export function setPropRadius(prop, radius) {
    if (prop.shape?.type === "Polygon" && !prop.strategy?.syncCollisionShape) {
        setPolygonPropBoundingRadius(prop, radius);
    } else {
        setCirclePropRadius(prop, radius);
    }
}

// --- MERGED
// --- MERGED FROM propStrategy.js ---
/** Shared defaults for world prop strategies (WorldProp reads these via buildWorldPropStrategyFromAsset). */
export const PROP_STRATEGY_DEFAULTS = { isKinetic: false, renderMode: "3d", render3DKey: null, inspectKey: null, friction: 8, wallPhysics: null, rolls: false, pinned: false };
export function applyPropBoxFootprint(prop, hx, hy) {
    prop.shape = new PolygonShape(boxLocalFootprint(hx, hy));
    prop.radius = prop.shape.getBoundingRadius();
    invalidateBroadphaseBounds(prop);
    if (prop.strategy?.fracture && prop.strategy.fracture.mode !== "glass") initFractureFootprint(prop);
    else if (prop.strategy?.isKinetic) syncKineticRigidBody(prop);
}
export function initWorldPropShape(prop) {
    if (typeof prop.strategy.syncCollisionShape === "function") {
        prop.strategy.syncCollisionShape(prop);
        if (!prop.collisionParts?.length) prop.radius = prop.shape.getBoundingRadius();
        return;
    }
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
        if (prop.strategy.fracture && prop.strategy.fracture.mode !== "glass") initFractureFootprint(prop);
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
export function getWallChunkSpriteCacheKey(prop) {
    if (!prop.wallChunkProfileId) return "";
    const profileId = prop.wallChunkProfileId;
    const rev = getSurfaceProfileRevision(profileId);
    const readyBucket = prop._wallChunkTextureReady ? "ready" : "pending";
    return `wallchunk:${profileId}:${prop.wallChunkHeightPx}:${rev}:${readyBucket}`;
}
export function getBaseSpriteCacheKey(prop, deps) {
    const { quantizeAngleIndex, buildRollOrientKey } = deps;
    let orientKey = "";
    if (prop.strategy?.rolls) orientKey = buildRollOrientKey(prop.rollQuat, resolvePropQuantizeSteps(prop).facing);
    else orientKey = `f${quantizeAngleIndex(prop.facing ?? 0, resolvePropQuantizeSteps(prop).facing)}`;
    let key = `${orientKey}_${propShapeFootprintKey(prop)}`;
    if (prop.powered === false) key += "_off";
    if (prop._buttonDrawPressed) key += "_on";
    key += visualOverrideCacheKey(prop);
    return key;
}
export function getPropStageBakeState(prop, deps) {
    const { quantizeAngle, quantizeRollQuat, anchorX, anchorY } = deps;
    const footprint = propFootprintHalfExtents(prop);
    return {
        ...prop,
        x: prop.x,
        y: prop.y,
        radius: prop.radius,
        halfExtents: footprint,
        facing: quantizeAngle(prop.facing ?? 0, resolvePropQuantizeSteps(prop).facing),
        rollQuat: prop.strategy?.rolls ? quantizeRollQuat(prop.rollQuat, resolvePropQuantizeSteps(prop).facing) : prop.rollQuat,
    };
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
export function applyCrossPinwheelFootprint(prop, length, thickness) {
    const halfL = length / 2;
    const halfT = thickness / 2;
    prop.collisionParts = [new PolygonShape(boxLocalFootprint(halfL, halfT)), new PolygonShape(boxLocalFootprint(halfT, halfL))];
    prop.shape = prop.collisionParts[0];
    prop.radius = Math.hypot(halfL, halfT);
    prop.crossLength = length;
    prop.crossThickness = thickness;
    invalidateBroadphaseBounds(prop);
    if (prop.strategy?.isKinetic) syncKineticRigidBody(prop);
}
// --- MERGED FROM propVisualAttachments.js ---
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
        parts.push(
            [
                cfg.id,
                cfg.propId,
                headingIndex,
                Math.round((offset.x ?? 0) * 100) / 100,
                Math.round((offset.y ?? 0) * 100) / 100,
                cfg.offsetSpace ?? "world",
                Math.round((cfg.facingOffset ?? 0) * 10000) / 10000,
                Math.round(normalizeAttachmentScale(cfg.scale) * 100) / 100,
                Math.round((cfg.radiusScale ?? 0) * 100) / 100,
                cfg.heading ?? "facing",
                cfg.layer ?? 0,
                cfg.inheritTint === true ? visualOverrideCacheKey(prop) : "",
            ].join(":"),
        );
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
    const prop = {
        type: cfg.propId,
        strategy,
        x: parentProp.x + rotated.x,
        y: parentProp.y + rotated.y,
        facing: heading + (cfg.facingOffset ?? 0),
        height: childAsset.visuals?.world?.height ?? 12,
        visualOverride: cfg.inheritTint === true && parentProp.visualOverride ? { ...parentProp.visualOverride } : undefined,
        _visualAttachmentId: cfg.id,
    };
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

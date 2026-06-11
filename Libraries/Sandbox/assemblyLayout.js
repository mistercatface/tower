import { snapLayoutOrigin } from "../../Generator/GridLayout.js";
import { Segment } from "../../Entities/Wall.js";
import { resolvePlacement } from "./assemblies/assemblyPlacement.js";
/** @typedef {import("./assemblies/assemblyManifest.js").ResolvedAssemblyManifest} ResolvedAssemblyManifest */
/**
 * @param {import("./assemblies/assemblyManifest.js").AssemblyPadManifest[]} pads
 * @param {ReturnType<typeof getPlayfieldBounds>} play
 */
function resolveAssemblyPads(pads, play) {
    const playW = play.maxX - play.minX;
    return pads.map((entry) => {
        const point = resolvePlacement(play, entry.at);
        /** @type {object} */
        const resolved = { id: entry.id, preset: entry.preset, x: point.x, y: point.y };
        if (entry.preset === "sink") {
            resolved.radius = entry.radius;
            resolved.sinkDepth = entry.depth;
            if (entry.captureTolerance != null) resolved.captureTolerance = entry.captureTolerance;
        } else if (entry.preset === "pull") {
            resolved.halfWidth = entry.width / 2;
            resolved.halfHeight = entry.height / 2;
            resolved.forceX = entry.forceX;
            resolved.forceY = entry.forceY;
            if (entry.wallMode === true) resolved.wallMode = true;
            if (entry.powered === false) resolved.powered = false;
        } else if (entry.preset === "button") {
            if (entry.radiusU == null) throw new Error(`Button pad "${entry.id}" missing radiusU`);
            resolved.radius = entry.radiusU * playW;
            resolved.targets = entry.targets?.length ? entry.targets : entry.target ? [entry.target] : [];
            if (entry.inputMode != null) resolved.inputMode = entry.inputMode;
            if (entry.massThreshold != null) resolved.massThreshold = entry.massThreshold;
            if (entry.invert === true) resolved.invert = true;
        }
        return resolved;
    });
}
/** @param {number} offsetX @param {number} offsetY @param {number} width @param {number} height */
function getArenaWorldBounds(offsetX, offsetY, width, height) {
    return { minX: offsetX, minY: offsetY, maxX: offsetX + width, maxY: offsetY + height, centerX: offsetX + width / 2, centerY: offsetY + height / 2, width, height };
}
/** @param {ReturnType<typeof getArenaWorldBounds>} arena @param {number} inset */
function getPlayfieldBounds(arena, inset) {
    return { minX: arena.minX + inset, minY: arena.minY + inset, maxX: arena.maxX - inset, maxY: arena.maxY - inset, centerX: arena.centerX, centerY: arena.centerY };
}
/**
 * @param {number} x0
 * @param {number} y0
 * @param {number} x1
 * @param {number} y1
 * @param {number} segmentSize
 * @param {number} angle
 * @param {number} padding
 * @param {number} maxHealth
 * @param {number} health
 * @param {number} wallHeight
 * @param {{ start: number, end: number } | null} [gap] — normalized span along edge to omit (0–1)
 */
function tessellateWallEdge(x0, y0, x1, y1, segmentSize, angle, padding, maxHealth, health, wallHeight, gap = null) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const length = Math.hypot(dx, dy);
    const count = Math.max(1, Math.ceil(length / segmentSize));
    /** @type {Segment[]} */
    const segments = [];
    for (let i = 0; i < count; i++) {
        const t = (i + 0.5) / count;
        if (gap && t >= gap.start && t <= gap.end) continue;
        segments.push(new Segment(x0 + dx * t, y0 + dy * t, angle, segmentSize, padding, maxHealth, health, false, wallHeight));
    }
    return segments;
}
/** @param {{ centerU: number, widthU: number }} opening */
function wallGapFromOpening(opening) {
    const half = opening.widthU * 0.5;
    return { start: Math.max(0, opening.centerU - half), end: Math.min(1, opening.centerU + half) };
}
/** @param {import("./assemblies/assemblyManifest.js").AssemblyArenaWallsManifest} walls */
function readArenaWallSegment(walls) {
    const { padding, maxHealth, health } = walls.segment;
    return { padding, maxHealth, health, segmentSize: walls.segmentSize };
}
/** @param {import("./assemblies/assemblyManifest.js").AssemblyWallSegmentManifest[]} segments @param {ReturnType<typeof getPlayfieldBounds>} play */
function resolveWallSegments(segments, play) {
    if (!segments.length) return [];
    return segments.map((entry) => {
        if (!entry.id) throw new Error("wall segment missing id");
        const from = resolvePlacement(play, entry.from);
        const to = resolvePlacement(play, entry.to);
        return { id: entry.id, from, to };
    });
}
/** @param {import("./assemblies/assemblyManifest.js").AssemblyArcWallSegmentManifest[]} segments @param {ReturnType<typeof getPlayfieldBounds>} play */
function resolveArcWallSegments(segments, play) {
    if (!segments.length) return [];
    const playW = play.maxX - play.minX;
    return segments.map((entry) => {
        if (!entry.id) throw new Error("arc wall segment missing id");
        const center = resolvePlacement(play, entry.center);
        return { id: entry.id, center, radius: entry.radiusU * playW, startAngle: entry.startAngle, endAngle: entry.endAngle };
    });
}
/** @param {ReturnType<typeof getArenaWorldBounds>} arenaBounds @param {import("./assemblies/assemblyManifest.js").AssemblyArenaWallsManifest} walls @param {number | null} [wallHeight] */
function buildRectWallSegments(arenaBounds, walls, wallHeight) {
    const segmentWallHeight = wallHeight === undefined ? walls.height : wallHeight;
    const half = walls.width / 2;
    const left = arenaBounds.minX + half;
    const right = arenaBounds.maxX - half;
    const top = arenaBounds.minY + half;
    const bottom = arenaBounds.maxY - half;
    const { padding, maxHealth, health, segmentSize } = readArenaWallSegment(walls);
    const bottomGap = walls.openings?.bottom ? wallGapFromOpening(walls.openings.bottom) : null;
    return [
        ...tessellateWallEdge(left, top, right, top, segmentSize, 0, padding, maxHealth, health, segmentWallHeight),
        ...tessellateWallEdge(right, top, right, bottom, segmentSize, Math.PI / 2, padding, maxHealth, health, segmentWallHeight),
        ...tessellateWallEdge(right, bottom, left, bottom, segmentSize, 0, padding, maxHealth, health, segmentWallHeight, bottomGap),
        ...tessellateWallEdge(left, bottom, left, top, segmentSize, Math.PI / 2, padding, maxHealth, health, segmentWallHeight),
    ];
}
/** @param {ReturnType<typeof resolveWallSegments>} segments @param {import("./assemblies/assemblyManifest.js").AssemblyArenaWallsManifest} walls @param {number | null} [wallHeight] */
function buildPlayfieldWallSegments(segments, walls, wallHeight) {
    if (!segments.length) return [];
    const segmentWallHeight = wallHeight === undefined ? walls.height : wallHeight;
    const { padding, maxHealth, health, segmentSize } = readArenaWallSegment(walls);
    /** @type {Segment[]} */
    const out = [];
    for (let i = 0; i < segments.length; i++) {
        const { from, to } = segments[i];
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const angle = Math.atan2(dy, dx);
        out.push(...tessellateWallEdge(from.x, from.y, to.x, to.y, segmentSize, angle, padding, maxHealth, health, segmentWallHeight));
    }
    return out;
}
/** @param {ReturnType<typeof resolveArcWallSegments>} arcs @param {import("./assemblies/assemblyManifest.js").AssemblyArenaWallsManifest} walls @param {number | null} [wallHeight] */
function buildPlayfieldArcWallSegments(arcs, walls, wallHeight) {
    if (!arcs.length) return [];
    const segmentWallHeight = wallHeight === undefined ? walls.height : wallHeight;
    const { padding, maxHealth, health, segmentSize } = readArenaWallSegment(walls);
    /** @type {Segment[]} */
    const out = [];
    for (let i = 0; i < arcs.length; i++) {
        const arc = arcs[i];
        const sweep = arc.endAngle - arc.startAngle;
        const arcLength = arc.radius * Math.abs(sweep);
        const count = Math.max(1, Math.ceil(arcLength / segmentSize));
        for (let s = 0; s < count; s++) {
            const t = (s + 0.5) / count;
            const a = arc.startAngle + sweep * t;
            out.push(new Segment(arc.center.x + Math.cos(a) * arc.radius, arc.center.y + Math.sin(a) * arc.radius, a + Math.PI / 2, segmentSize, padding, maxHealth, health, false, segmentWallHeight));
        }
    }
    return out;
}
/**
 * @param {number} centerX
 * @param {number} centerY
 * @param {ResolvedAssemblyManifest} resolved
 */
export function buildAssemblyLayout(centerX, centerY, resolved) {
    const { arena, pads, wallSegments, arcWallSegments } = resolved;
    const { offsetX, offsetY } = snapLayoutOrigin(centerX, centerY, arena.width, arena.height, 1);
    const bounds = getArenaWorldBounds(offsetX, offsetY, arena.width, arena.height);
    const play = getPlayfieldBounds(bounds, arena.walls.width);
    return { bounds, play, pads: resolveAssemblyPads(pads, play), wallSegments: resolveWallSegments(wallSegments, play), arcWallSegments: resolveArcWallSegments(arcWallSegments, play) };
}
/** @returns {{ minX: number, minY: number, maxX: number, maxY: number }[]} */
export function getAssemblyRailBandBounds(layout) {
    const { bounds, play } = layout;
    /** @type {{ minX: number, minY: number, maxX: number, maxY: number }[]} */
    const bands = [];
    if (play.minY > bounds.minY) bands.push({ minX: bounds.minX, minY: bounds.minY, maxX: bounds.maxX, maxY: play.minY });
    if (play.maxY < bounds.maxY) bands.push({ minX: bounds.minX, minY: play.maxY, maxX: bounds.maxX, maxY: bounds.maxY });
    if (play.minX > bounds.minX) bands.push({ minX: bounds.minX, minY: play.minY, maxX: play.minX, maxY: play.maxY });
    if (play.maxX < bounds.maxX) bands.push({ minX: play.maxX, minY: play.minY, maxX: bounds.maxX, maxY: play.maxY });
    return bands;
}
/** @param {ReturnType<typeof buildAssemblyLayout>} layout @param {ResolvedAssemblyManifest} resolved */
export function buildAssemblyClearBounds(layout, resolved) {
    const pad = resolved.arena.clearPadding;
    return { minX: layout.bounds.minX - pad, minY: layout.bounds.minY - pad, maxX: layout.bounds.maxX + pad, maxY: layout.bounds.maxY + pad };
}
/** @param {ReturnType<typeof buildAssemblyLayout>} layout @param {ResolvedAssemblyManifest} resolved @param {{ collisionOnly?: boolean }} [options] */
export function buildAssemblyWallSegments(layout, resolved, { collisionOnly = false } = {}) {
    const rectWallHeight = collisionOnly ? null : resolved.arena.walls.height;
    const playfieldWallHeight = resolved.arena.walls.height;
    return [
        ...buildRectWallSegments(layout.bounds, resolved.arena.walls, rectWallHeight),
        ...buildPlayfieldWallSegments(layout.wallSegments, resolved.arena.walls, playfieldWallHeight),
        ...buildPlayfieldArcWallSegments(layout.arcWallSegments, resolved.arena.walls, playfieldWallHeight),
    ];
}

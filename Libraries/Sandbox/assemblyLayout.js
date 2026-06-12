import { snapLayoutOrigin } from "../../Generator/GridLayout.js";
import { Segment } from "../../Entities/Wall.js";
import { insetAabb, minCornerAabb, padAabb } from "../Math/Aabb2D.js";
import { resolvePlacement } from "./assemblies/assemblyPlacement.js";
/** @typedef {import("./assemblies/assemblyManifest.js").ResolvedAssemblyManifest} ResolvedAssemblyManifest */
/** @param {number} offsetX @param {number} offsetY @param {number} width @param {number} height */
function getArenaWorldBounds(offsetX, offsetY, width, height) {
    const box = minCornerAabb(offsetX, offsetY, width, height);
    return { ...box, centerX: offsetX + width / 2, centerY: offsetY + height / 2, width, height };
}
/** @param {ReturnType<typeof getArenaWorldBounds>} arena @param {number} inset */
function getPlayfieldBounds(arena, inset) {
    const box = insetAabb(arena, inset);
    return { ...box, centerX: arena.centerX, centerY: arena.centerY };
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
    const { arena, wallSegments, arcWallSegments } = resolved;
    const { offsetX, offsetY } = snapLayoutOrigin(centerX, centerY, arena.width, arena.height, 1);
    const bounds = getArenaWorldBounds(offsetX, offsetY, arena.width, arena.height);
    const play = getPlayfieldBounds(bounds, arena.walls.width);
    return { bounds, play, wallSegments: resolveWallSegments(wallSegments, play), arcWallSegments: resolveArcWallSegments(arcWallSegments, play) };
}
/** @returns {import("../Math/Aabb2D.js").Aabb2D[]} */
export function getAssemblyRailBandBounds(layout) {
    const { bounds, play } = layout;
    /** @type {import("../Math/Aabb2D.js").Aabb2D[]} */
    const bands = [];
    if (play.minY > bounds.minY) bands.push(minCornerAabb(bounds.minX, bounds.minY, bounds.maxX - bounds.minX, play.minY - bounds.minY));
    if (play.maxY < bounds.maxY) bands.push(minCornerAabb(bounds.minX, play.maxY, bounds.maxX - bounds.minX, bounds.maxY - play.maxY));
    if (play.minX > bounds.minX) bands.push(minCornerAabb(bounds.minX, play.minY, play.minX - bounds.minX, play.maxY - play.minY));
    if (play.maxX < bounds.maxX) bands.push(minCornerAabb(play.maxX, play.minY, bounds.maxX - play.maxX, play.maxY - play.minY));
    return bands;
}
/** @param {ReturnType<typeof buildAssemblyLayout>} layout @param {ResolvedAssemblyManifest} resolved */
export function buildAssemblyClearBounds(layout, resolved) {
    return padAabb(layout.bounds, resolved.arena.clearPadding);
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

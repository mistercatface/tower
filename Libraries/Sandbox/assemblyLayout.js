import { snapLayoutOrigin } from "../../Generator/GridLayout.js";
import { Segment } from "../../Entities/Wall.js";
import { resolvePlacement } from "./assemblies/assemblyPlacement.js";
/** @typedef {import("./assemblies/assemblyManifest.js").ResolvedAssemblyManifest} ResolvedAssemblyManifest */
/**
 * @param {import("./assemblies/assemblyManifest.js").AssemblyVoidCircleManifest[]} voidCircles
 * @param {ReturnType<typeof getPlayfieldBounds>} play
 */
function resolveVoidCircles(voidCircles, play) {
    if (!voidCircles) return [];
    return voidCircles.map((entry) => {
        const point = resolvePlacement(play, entry.placement);
        return { id: entry.id, x: point.x, y: point.y, radius: entry.radius, depth: entry.depth };
    });
}
function resolveGravityZones(gravityZones, play) {
    if (!gravityZones) return [];
    return gravityZones.map((entry) => {
        const point = resolvePlacement(play, entry.placement);
        return { id: entry.id, x: point.x, y: point.y, halfWidth: entry.width / 2, halfHeight: entry.height / 2, forceX: entry.forceX, forceY: entry.forceY };
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
 */
function tessellateWallEdge(x0, y0, x1, y1, segmentSize, angle, padding, maxHealth, health, wallHeight) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const length = Math.hypot(dx, dy);
    const count = Math.max(1, Math.ceil(length / segmentSize));
    /** @type {Segment[]} */
    const segments = [];
    for (let i = 0; i < count; i++) {
        const t = (i + 0.5) / count;
        segments.push(new Segment(x0 + dx * t, y0 + dy * t, angle, segmentSize, padding, maxHealth, health, false, wallHeight));
    }
    return segments;
}
/** @param {ReturnType<typeof getArenaWorldBounds>} arenaBounds @param {import("./assemblies/assemblyManifest.js").AssemblyArenaWallsManifest} walls @param {number | null} [wallHeight] */
function buildRectWallSegments(arenaBounds, walls, wallHeight) {
    const segmentWallHeight = wallHeight === undefined ? walls.height : wallHeight;
    const half = walls.width / 2;
    const left = arenaBounds.minX + half;
    const right = arenaBounds.maxX - half;
    const top = arenaBounds.minY + half;
    const bottom = arenaBounds.maxY - half;
    const segment = walls.segment ?? {};
    const padding = segment.padding ?? 0;
    const maxHealth = segment.maxHealth ?? 30;
    const health = segment.health ?? maxHealth;
    const segmentSize = walls.segmentSize;
    return [
        ...tessellateWallEdge(left, top, right, top, segmentSize, 0, padding, maxHealth, health, segmentWallHeight),
        ...tessellateWallEdge(right, top, right, bottom, segmentSize, Math.PI / 2, padding, maxHealth, health, segmentWallHeight),
        ...tessellateWallEdge(right, bottom, left, bottom, segmentSize, 0, padding, maxHealth, health, segmentWallHeight),
        ...tessellateWallEdge(left, bottom, left, top, segmentSize, Math.PI / 2, padding, maxHealth, health, segmentWallHeight),
    ];
}
/**
 * @param {number} centerX
 * @param {number} centerY
 * @param {ResolvedAssemblyManifest} resolved
 */
export function buildAssemblyLayout(centerX, centerY, resolved) {
    const { arena, voidCircles, gravityZones } = resolved;
    const { offsetX, offsetY } = snapLayoutOrigin(centerX, centerY, arena.width, arena.height, 1);
    const bounds = getArenaWorldBounds(offsetX, offsetY, arena.width, arena.height);
    const play = getPlayfieldBounds(bounds, arena.walls.width);
    return { bounds, play, voids: resolveVoidCircles(voidCircles, play), gravityZones: resolveGravityZones(gravityZones, play) };
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
    const wallHeight = collisionOnly ? null : resolved.arena.walls.height;
    return buildRectWallSegments(layout.bounds, resolved.arena.walls, wallHeight);
}

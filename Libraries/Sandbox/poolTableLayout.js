import { snapLayoutOrigin } from "../../Generator/GridLayout.js";
import { Segment } from "../../Entities/Wall.js";
import { getResolvedAssembly } from "./assemblies/assemblyRegistry.js";
import { resolvePlacement } from "./assemblies/assemblyPlacement.js";
/** @typedef {import("./assemblies/assemblyManifest.js").ResolvedAssemblyManifest} ResolvedAssemblyManifest */
function defaultAssembly() {
    return getResolvedAssembly("poolTable");
}
/** @param {ResolvedAssemblyManifest | null | undefined} resolved */
function resolveAssembly(resolved) {
    const assembly = resolved ?? defaultAssembly();
    if (!assembly) throw new Error("Pool table assembly not loaded — call loadAssemblyManifests() first");
    return assembly;
}
/**
 * @param {import("./assemblies/assemblyManifest.js").AssemblyVoidCircleManifest[]} voidCircles
 * @param {ReturnType<typeof getPlayfieldBounds>} play
 */
function resolveVoidCircles(voidCircles, play) {
    return voidCircles.map((entry) => {
        const point = resolvePlacement(play, entry.placement);
        return { id: entry.id, x: point.x, y: point.y, radius: entry.radius, depth: entry.depth };
    });
}
/** @param {number} offsetX @param {number} offsetY @param {number} width @param {number} height */
function getTableWorldBounds(offsetX, offsetY, width, height) {
    return { minX: offsetX, minY: offsetY, maxX: offsetX + width, maxY: offsetY + height, centerX: offsetX + width / 2, centerY: offsetY + height / 2, width, height };
}
/** @param {ReturnType<typeof getTableWorldBounds>} table @param {number} inset */
function getPlayfieldBounds(table, inset) {
    return { minX: table.minX + inset, minY: table.minY + inset, maxX: table.maxX - inset, maxY: table.maxY - inset, centerX: table.centerX, centerY: table.centerY };
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
/** @param {ReturnType<typeof getTableWorldBounds>} table @param {import("./assemblies/assemblyManifest.js").AssemblyArenaWallsManifest} walls */
function buildRectWallSegments(table, walls) {
    const half = walls.width / 2;
    const left = table.minX + half;
    const right = table.maxX - half;
    const top = table.minY + half;
    const bottom = table.maxY - half;
    const segment = walls.segment ?? {};
    const padding = segment.padding ?? 0;
    const maxHealth = segment.maxHealth ?? 30;
    const health = segment.health ?? maxHealth;
    const segmentSize = walls.segmentSize;
    const wallHeight = walls.height;
    return [
        ...tessellateWallEdge(left, top, right, top, segmentSize, 0, padding, maxHealth, health, wallHeight),
        ...tessellateWallEdge(right, top, right, bottom, segmentSize, Math.PI / 2, padding, maxHealth, health, wallHeight),
        ...tessellateWallEdge(right, bottom, left, bottom, segmentSize, 0, padding, maxHealth, health, wallHeight),
        ...tessellateWallEdge(left, bottom, left, top, segmentSize, Math.PI / 2, padding, maxHealth, health, wallHeight),
    ];
}
/**
 * @param {number} centerX
 * @param {number} centerY
 * @param {ResolvedAssemblyManifest} [resolved]
 */
export function buildSandboxPoolTableLayout(centerX, centerY, resolved = defaultAssembly()) {
    const assembly = resolveAssembly(resolved);
    const { arena, voidCircles } = assembly;
    const width = arena.width;
    const height = arena.height;
    const { offsetX, offsetY } = snapLayoutOrigin(centerX, centerY, width, height, 1);
    const table = getTableWorldBounds(offsetX, offsetY, width, height);
    const play = getPlayfieldBounds(table, arena.walls.width);
    const voids = resolveVoidCircles(voidCircles, play);
    return { width, height, offsetX, offsetY, table, play, voids };
}
/** @param {ReturnType<typeof buildSandboxPoolTableLayout>} layout @param {ResolvedAssemblyManifest} [resolved] */
export function buildPoolTableClearBounds(layout, resolved = defaultAssembly()) {
    const pad = resolveAssembly(resolved).arena.clearPadding;
    return { minX: layout.table.minX - pad, minY: layout.table.minY - pad, maxX: layout.table.maxX + pad, maxY: layout.table.maxY + pad };
}
/** @param {ReturnType<typeof buildSandboxPoolTableLayout>} layout @param {ResolvedAssemblyManifest} [resolved] */
export function buildPoolTableWallSegments(layout, resolved = defaultAssembly()) {
    return buildRectWallSegments(layout.table, resolveAssembly(resolved).arena.walls);
}
export function getPoolTableWidth() {
    return resolveAssembly().arena.width;
}
export function getPoolTableHeight() {
    return resolveAssembly().arena.height;
}

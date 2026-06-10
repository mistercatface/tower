import { snapLayoutOrigin } from "../../Generator/GridLayout.js";
import { getResolvedAssembly } from "./assemblies/assemblyRegistry.js";
import { resolvePlacement } from "./assemblies/assemblyPlacement.js";
import { buildGridRailWithVoidCarveWalls } from "./assemblies/arenaRecipes/gridRailWithVoidCarves.js";

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
 * @param {Record<string, number>} voidRadii
 */
function resolveVoidCircles(voidCircles, play, voidRadii) {
    return voidCircles.map((entry) => {
        const point = resolvePlacement(play, entry.placement);
        return {
            id: entry.id,
            x: point.x,
            y: point.y,
            radius: voidRadii[entry.radiusRef],
            depth: voidRadii[entry.depthRef],
            wallCarve: entry.wallCarve ?? null,
        };
    });
}
/** @param {number} offsetX @param {number} offsetY @param {number} cellSize @param {number} cols @param {number} rows */
function getTableWorldBounds(offsetX, offsetY, cellSize, cols, rows) {
    const width = cols * cellSize;
    const height = rows * cellSize;
    return { minX: offsetX, minY: offsetY, maxX: offsetX + width, maxY: offsetY + height, centerX: offsetX + width / 2, centerY: offsetY + height / 2, width, height };
}
/** @param {ReturnType<typeof getTableWorldBounds>} table @param {number} rail */
function getPlayfieldBounds(table, rail) {
    return { minX: table.minX + rail, minY: table.minY + rail, maxX: table.maxX - rail, maxY: table.maxY - rail, centerX: table.centerX, centerY: table.centerY };
}
/**
 * @param {number} centerX
 * @param {number} centerY
 * @param {ResolvedAssemblyManifest} [resolved]
 */
export function buildSandboxPoolTableLayout(centerX, centerY, resolved = defaultAssembly()) {
    const assembly = resolveAssembly(resolved);
    const { arena, voidCircles, refs } = assembly;
    const cellSize = arena.cellSize;
    const cols = arena.grid.cols;
    const rows = arena.grid.rows;
    const { offsetX, offsetY } = snapLayoutOrigin(centerX, centerY, cols, rows, cellSize);
    const table = getTableWorldBounds(offsetX, offsetY, cellSize, cols, rows);
    const rail = arena.grid.railCells * cellSize;
    const play = getPlayfieldBounds(table, rail);
    const voidRadii = refs.voidRadii;
    const voids = resolveVoidCircles(voidCircles, play, voidRadii);
    return {
        cols,
        rows,
        cellSize,
        offsetX,
        offsetY,
        table,
        play,
        rail,
        voids,
        voidDepth: voidRadii.depth,
    };
}
/** @param {ReturnType<typeof buildSandboxPoolTableLayout>} layout @param {ResolvedAssemblyManifest} [resolved] */
export function buildPoolTableClearBounds(layout, resolved = defaultAssembly()) {
    const assembly = resolveAssembly(resolved);
    const pad = assembly.arena.clearPaddingCells * layout.cellSize;
    return { minX: layout.table.minX - pad, minY: layout.table.minY - pad, maxX: layout.table.maxX + pad, maxY: layout.table.maxY + pad };
}
/** @param {ReturnType<typeof buildSandboxPoolTableLayout>} layout @param {ResolvedAssemblyManifest} [resolved] */
export function buildPoolTableWallSegments(layout, resolved = defaultAssembly()) {
    const assembly = resolveAssembly(resolved);
    const recipe = assembly.arena.walls.recipe;
    if (recipe !== "gridRailWithVoidCarves") throw new Error(`Unsupported arena wall recipe "${recipe}"`);
    return buildGridRailWithVoidCarveWalls(layout, assembly);
}
export function getPoolTableCols() {
    return resolveAssembly().arena.grid.cols;
}
export function getPoolTableRows() {
    return resolveAssembly().arena.grid.rows;
}
export function getPoolTableRailCells() {
    return resolveAssembly().arena.grid.railCells;
}
/** @param {number} ballRadius @param {ResolvedAssemblyManifest} [resolved] */
export function poolVoidRadii(ballRadius, resolved = defaultAssembly()) {
    const assembly = resolveAssembly(resolved);
    const ratio = ballRadius / assembly.scale.ballRadius;
    const radii = assembly.refs.voidRadii;
    return { corner: radii.corner * ratio, side: radii.side * ratio, depth: radii.depth * ratio };
}

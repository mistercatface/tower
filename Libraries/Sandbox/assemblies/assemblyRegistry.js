import { gridSettings } from "../../../Config/Config.js";
import { resolveVoidRadiiRefs } from "./assemblyRefs.js";
/** @type {Map<string, import("./assemblyManifest.js").AssemblyManifest>} */
const registry = new Map();
/** @param {import("./assemblyManifest.js").AssemblyManifest} manifest */
export function registerAssemblyManifest(manifest) {
    registry.set(manifest.id, manifest);
}
/** @param {string} id */
export function getAssemblyManifest(id) {
    return registry.get(id);
}
export function getDefaultPoolTableAssemblyManifest() {
    return getAssemblyManifest("poolTable");
}
/** @param {object} cueStrike @param {number} scaleFactor */
function resolveCueStrikeManifest(cueStrike, scaleFactor) {
    return {
        minDrag: cueStrike.minDrag * scaleFactor,
        maxPull: cueStrike.maxPull * scaleFactor,
        pullScale: cueStrike.pullScale,
        minPower: cueStrike.minPower * scaleFactor,
        maxPower: cueStrike.maxPower,
        powerCurve: cueStrike.powerCurve,
    };
}
/** @param {import("./assemblyManifest.js").AssemblyManifest} manifest */
export function resolveAssemblyManifest(manifest) {
    const { scale, arena, refs, voidCircles, pickups, link, behaviors = {}, spawn = [] } = manifest;
    const scaleFactor = scale.ballRadius / scale.referenceBallRadius;
    const cellSize = gridSettings.cellSize * scaleFactor;
    const ballRadius = scale.ballRadius;
    const voidRadii = resolveVoidRadiiRefs(refs.voidRadii, ballRadius);
    /** @type {Record<string, { cueStrike?: object, inputGates?: Record<string, object[]> }>} */
    const resolvedBehaviors = {};
    for (const propId of Object.keys(behaviors)) {
        const entry = behaviors[propId];
        resolvedBehaviors[propId] = {
            ...(entry.cueStrike ? { cueStrike: resolveCueStrikeManifest(entry.cueStrike, scaleFactor) } : {}),
            ...(entry.inputGates ? { inputGates: entry.inputGates } : {}),
        };
    }
    const walls = arena.walls;
    return {
        id: manifest.id,
        version: manifest.version ?? 2,
        scale: { referenceBallRadius: scale.referenceBallRadius, ballRadius, factor: scaleFactor },
        arena: {
            grid: { ...arena.grid },
            cellSize,
            clearPaddingCells: arena.clearPaddingCells,
            walls: {
                ...walls,
                railHeight: walls.railHeightCells * cellSize,
                voidBackArcSegmentSize: walls.voidBackArc.segmentSizeAtReference * scaleFactor,
                voidCarveExtraRadius: ballRadius * (walls.voidCarve?.extraRadiusFactor ?? 0),
            },
        },
        refs: { voidRadii },
        voidCircles,
        pickups,
        groupField: link.groupField,
        behaviors: resolvedBehaviors,
        spawn,
    };
}
/** @param {string} [id] */
export function getResolvedAssembly(id = "poolTable") {
    const manifest = getAssemblyManifest(id);
    if (!manifest) return null;
    return resolveAssemblyManifest(manifest);
}

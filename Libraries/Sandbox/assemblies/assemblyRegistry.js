import { gridSettings } from "../../../Config/Config.js";
import poolTableAssembly from "./poolTableAssembly.js";
/** @type {Map<string, import("./assemblyManifest.js").AssemblyManifest>} */
const registry = new Map([["poolTable", poolTableAssembly]]);
/** @param {import("./assemblyManifest.js").AssemblyManifest} manifest */
export function registerAssemblyManifest(manifest) {
    registry.set(manifest.id, manifest);
}
/** @param {string} id */
export function getAssemblyManifest(id) {
    return registry.get(id);
}
export function getDefaultPoolTableAssemblyManifest() {
    return poolTableAssembly;
}
/**
 * Scale cue-strike fields authored at reference ball radius.
 *
 * @param {object} cueStrike
 * @param {number} scale
 */
function resolveCueStrikeManifest(cueStrike, scale) {
    return {
        minDrag: cueStrike.minDrag * scale,
        maxPull: cueStrike.maxPull * scale,
        pullScale: cueStrike.pullScale,
        minPower: cueStrike.minPower * scale,
        maxPower: cueStrike.maxPower,
        powerCurve: cueStrike.powerCurve,
    };
}
/**
 * @param {import("./assemblyManifest.js").AssemblyManifest} manifest
 * @returns {import("./assemblyManifest.js").ResolvedAssemblyManifest}
 */
export function resolveAssemblyManifest(manifest) {
    const { layout, props, link, behaviors = {}, spawn = [] } = manifest;
    const scale = layout.ballRadius / layout.referenceBallRadius;
    const cellSize = gridSettings.cellSize * scale;
    const ballRadius = layout.ballRadius;
    /** @type {Record<string, { cueStrike?: object, inputGates?: Record<string, object[]> }>} */
    const resolvedBehaviors = {};
    for (const propId of Object.keys(behaviors)) {
        const entry = behaviors[propId];
        resolvedBehaviors[propId] = { ...(entry.cueStrike ? { cueStrike: resolveCueStrikeManifest(entry.cueStrike, scale) } : {}), ...(entry.inputGates ? { inputGates: entry.inputGates } : {}) };
    }
    return {
        id: manifest.id,
        props,
        groupField: link.groupField,
        layout: {
            referenceBallRadius: layout.referenceBallRadius,
            ballRadius,
            scale,
            cols: layout.cols,
            rows: layout.rows,
            railCells: layout.railCells,
            cellSize,
            wallPocketSegmentSize: layout.wallPocketSegmentSize * scale,
            pocketRadii: { corner: ballRadius * layout.pocketCornerRadiusFactor, side: ballRadius * layout.pocketSideRadiusFactor, depth: ballRadius * layout.pocketDepthFactor },
        },
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

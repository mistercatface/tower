/**
 * @typedef {Object} InspectSubject
 * @property {string|null} inspectKey
 * @property {boolean} [isDead]
 * @property {number} [facing]
 * @property {Record<string, number>} [faceLabelVariants]
 */
/**
 * @typedef {Object} InspectEntry
 * @property {string} title - Panel header text
 * @property {(ctx: CanvasRenderingContext2D, cx: number, cy: number, scale: number, yaw: number, pitch: number, subject: InspectSubject) => void} draw
 * @property {(fn: () => void) => void} [onReady] - Re-render when async assets finish loading
 * @property {() => void} [preload] - Kick off asset preload at startup
 * @property {(subject: InspectSubject) => number} [getInitialYaw]
 * @property {(subject: InspectSubject) => number} [getInitialPitch]
 * @property {number} [tapPadding] - Extra tap radius beyond worldProp.radius (default 14)
 */
/** @type {Map<string, InspectEntry>} */
const inspectEntries = new Map();
/**
 * @param {string} inspectKey
 * @param {InspectEntry} entry
 */
export function registerInspectEntry(inspectKey, entry) {
    if (!inspectKey || !entry?.draw) return;
    inspectEntries.set(inspectKey, entry);
}
export function getInspectEntry(inspectKey) {
    if (!inspectKey) return null;
    return inspectEntries.get(inspectKey) ?? null;
}
export function preloadAllInspectAssets() {
    for (const entry of inspectEntries.values()) entry.preload?.();
}
/**
 * @param {object} recipe
 * @returns {Pick<InspectEntry, "preload" | "onReady" | "getInitialYaw" | "getInitialPitch" | "draw">}
 */
export function withInspectDefaults(recipe) {
    return {
        preload: recipe.preload,
        onReady: recipe.onReady,
        getInitialYaw: recipe.getInitialYaw ?? ((subject) => subject.facing ?? 0),
        getInitialPitch: recipe.getInitialPitch ?? (() => 0.2),
        draw: recipe.draw,
    };
}

import { getActiveGameDefinition } from "./ActiveGameDefinition.js";
/** @typedef {"tower" | "landscape-minimal"} GameShellId */
/** @typedef {"full" | "pause-only" | "none"} ControlsChrome */
/** @typedef {"player-health" | "custom"} GameLifecycle */
/**
 * @typedef {object} GameUiChrome
 * @property {boolean} [score]
 * @property {boolean} [perks]
 * @property {boolean} [map]
 * @property {boolean} [settings]
 * @property {boolean} [bottomPanel]
 * @property {ControlsChrome} [controls]
 * @property {boolean} [zoomSlider]
 */
/**
 * @typedef {object} GameCombatFeatures
 * @property {boolean} [entityBars]
 * @property {boolean} [targetMarkers]
 * @property {boolean} [combatHudModes]
 * @property {boolean} [visibilityMask]
 * @property {boolean} [hostileActors]
 * @property {boolean} [playerActors]
 * @property {boolean} [offScreenIndicators]
 * @property {boolean} [globeOverlay]
 */
/**
 * @typedef {object} GameUiProfile
 * @property {GameShellId} shell
 * @property {GameUiChrome} chrome
 * @property {GameCombatFeatures} combat
 * @property {GameLifecycle} lifecycle
 */
/** Engine default — games opt in to tower/combat chrome via `definition.ui`. */
export const ENGINE_MINIMAL_UI = {
    shell: "landscape-minimal",
    chrome: { score: false, perks: false, map: false, settings: true, bottomPanel: false, controls: "pause-only", zoomSlider: false },
    combat: { entityBars: false, targetMarkers: false, combatHudModes: false, visibilityMask: false, hostileActors: false, playerActors: false, offScreenIndicators: false, globeOverlay: false },
    lifecycle: "custom",
};
/** Minimal landscape shell — pool and other single-arena games. */
export const LANDSCAPE_MINIMAL_UI = ENGINE_MINIMAL_UI;
/** @param {Partial<GameUiProfile>} [overrides] */
function mergeProfile(overrides) {
    const base = ENGINE_MINIMAL_UI;
    return {
        shell: overrides?.shell ?? base.shell,
        chrome: { ...base.chrome, ...overrides?.chrome },
        combat: { ...base.combat, ...overrides?.combat },
        lifecycle: overrides?.lifecycle ?? base.lifecycle,
    };
}
/** @param {import("./GameDefinitionTypes.js").GameDefinition | null | undefined} definition */
export function resolveUiProfile(definition) {
    return mergeProfile(definition?.ui);
}
export function getUiProfile() {
    return resolveUiProfile(getActiveGameDefinition());
}
export function getCombatFeatures() {
    return getUiProfile().combat;
}
/**
 * Apply shell layout class on document.body for CSS-driven chrome.
 *
 * @param {import("./GameDefinitionTypes.js").GameDefinition} definition
 */
export function applyGameShell(definition) {
    const profile = resolveUiProfile(definition);
    document.body.classList.remove("shell-tower", "shell-landscape-minimal");
    document.body.classList.add(`shell-${profile.shell}`);
    const wrapper = document.getElementById("gameWrapper");
    if (wrapper) wrapper.dataset.game = definition.id;
}

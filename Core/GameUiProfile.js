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
 * @typedef {object} RunResultCopy
 * @property {string} title
 * @property {string} [buttonLabel]
 * @property {string} [titleColor]
 */

/**
 * @typedef {object} GameUiProfile
 * @property {GameShellId} shell
 * @property {GameUiChrome} chrome
 * @property {GameCombatFeatures} combat
 * @property {GameLifecycle} lifecycle
 * @property {Partial<Record<"won" | "lost", RunResultCopy>>} [runResult]
 */

/** @type {GameUiProfile} */
export const TOWER_UI_PROFILE = {
    shell: "tower",
    chrome: {
        score: true,
        perks: true,
        map: true,
        settings: true,
        bottomPanel: true,
        controls: "full",
        zoomSlider: true,
    },
    combat: {
        entityBars: true,
        targetMarkers: true,
        combatHudModes: true,
        visibilityMask: true,
        hostileActors: true,
        playerActors: true,
        offScreenIndicators: true,
        globeOverlay: true,
    },
    lifecycle: "player-health",
};

/** @param {Partial<GameUiProfile>} [overrides] */
function mergeProfile(overrides) {
    return {
        shell: overrides?.shell ?? TOWER_UI_PROFILE.shell,
        chrome: { ...TOWER_UI_PROFILE.chrome, ...overrides?.chrome },
        combat: { ...TOWER_UI_PROFILE.combat, ...overrides?.combat },
        lifecycle: overrides?.lifecycle ?? TOWER_UI_PROFILE.lifecycle,
        runResult: overrides?.runResult,
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
    if (wrapper) {
        wrapper.dataset.game = definition.id;
    }
}

import { getSurfaceProfileProvider } from "../Libraries/Procedural/SurfaceProfileProvider.js";
import { defaultSurfaceProfileId, startSurfaceProfileId, surfaceProfileByStrategy as globalSurfaceProfileByStrategy } from "../Config/procedural/profileDefaults.js";
/**
 * @typedef {object} ProceduralDesignConfig
 * @property {string} [surfaceProfileId] — shorthand: start node + default + start strategy
 * @property {string} [startSurfaceProfileId]
 * @property {string} [defaultSurfaceProfileId]
 * @property {Record<string, string>} [surfaceProfileByStrategy]
 * @property {boolean} [proceduralAnimation] — enable ground + wall profile animation bakes
 * @property {boolean} [groundChunkAnimationsOn]
 * @property {boolean} [wallAnimationsOn]
 * @property {number|null} [animationBakeMaxFrames]
 * @property {number} [animationFrameBatchSize]
 */
/** @type {ProceduralDesignConfig | null} */
let activeProceduralDesign = null;
/** @returns {ProceduralDesignConfig | null} */
export function getActiveProceduralDesign() {
    return activeProceduralDesign;
}
/**
 * @param {import("./GameDefinitionTypes.js").GameDefinition | null | undefined} definition
 * @returns {ProceduralDesignConfig | null}
 */
export function resolveProceduralDesignConfig(definition) {
    const raw = definition?.proceduralDesign;
    if (!raw) return null;
    const shorthand = raw.surfaceProfileId;
    const startKey = definition?.worldGen?.startNodeStrategyKey;
    const strategyMap = { ...raw.surfaceProfileByStrategy };
    if (shorthand && startKey && !strategyMap[startKey]) strategyMap[startKey] = shorthand;
    return { startSurfaceProfileId: raw.startSurfaceProfileId ?? shorthand ?? null, defaultSurfaceProfileId: raw.defaultSurfaceProfileId ?? shorthand ?? null, surfaceProfileByStrategy: strategyMap };
}
/**
 * @param {{ layer?: number, strategy?: string }} args
 */
export function resolveActiveSurfaceProfileId({ layer = 0, strategy } = {}) {
    const game = activeProceduralDesign;
    if (strategy && game?.surfaceProfileByStrategy?.[strategy]) return game.surfaceProfileByStrategy[strategy];
    if (layer === 0) {
        if (game?.startSurfaceProfileId) return game.startSurfaceProfileId;
        if (strategy && globalSurfaceProfileByStrategy[strategy]) return globalSurfaceProfileByStrategy[strategy];
        return startSurfaceProfileId;
    }
    if (strategy && globalSurfaceProfileByStrategy[strategy]) return globalSurfaceProfileByStrategy[strategy];
    if (strategy) throw new Error(`No surface procedural profile mapped for strategy: ${strategy}`);
    return game?.defaultSurfaceProfileId ?? defaultSurfaceProfileId;
}
/**
 * World-surface animation overrides from game config (profile must define `animation`).
 *
 * @param {import("./GameDefinitionTypes.js").GameDefinition | null | undefined} definition
 * @returns {Pick<import("../Libraries/WorldSurface/WorldSurfaceSettings.js").WorldSurfaceSettings, "groundChunkAnimationsOn" | "wallAnimationsOn">}
 */
export function resolveProceduralAnimationSettings(definition) {
    const raw = definition?.proceduralDesign;
    if (!raw) return { groundChunkAnimationsOn: false, wallAnimationsOn: false };
    if (raw.proceduralAnimation) return { groundChunkAnimationsOn: true, wallAnimationsOn: true };
    return { groundChunkAnimationsOn: raw.groundChunkAnimationsOn ?? false, wallAnimationsOn: raw.wallAnimationsOn ?? false };
}
/**
 * @param {import("./GameDefinitionTypes.js").GameDefinition | null | undefined} definition
 * @returns {Pick<import("../Libraries/WorldSurface/WorldSurfaceSettings.js").WorldSurfaceSettings, "animationBakeMaxFrames" | "animationFrameBatchSize">}
 */
export function resolveProceduralBakeSettings(definition) {
    const raw = definition?.proceduralDesign;
    if (!raw) return {};
    const out = {};
    if (raw.animationBakeMaxFrames !== undefined) out.animationBakeMaxFrames = raw.animationBakeMaxFrames;
    if (raw.animationFrameBatchSize != null) out.animationFrameBatchSize = raw.animationFrameBatchSize;
    return out;
}
/** @param {import("./GameDefinitionTypes.js").GameDefinition} definition */
export function applyGameProceduralDesign(definition) {
    activeProceduralDesign = resolveProceduralDesignConfig(definition);
    if (!isSurfaceProfileProviderInstalled()) return;
    const nextDefault = activeProceduralDesign?.defaultSurfaceProfileId ?? defaultSurfaceProfileId;
    getSurfaceProfileProvider().setDefaultProfileId(nextDefault);
}
function isSurfaceProfileProviderInstalled() {
    try {
        getSurfaceProfileProvider();
        return true;
    } catch {
        return false;
    }
}

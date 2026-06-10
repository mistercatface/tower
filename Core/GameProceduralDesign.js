import { getSurfaceProfileProvider } from "../Libraries/Procedural/SurfaceProfileProvider.js";
/**
 * @typedef {object} ProceduralDesignConfig
 * @property {string} [surfaceProfileId] — shorthand: start node + default + start strategy
 * @property {string} [startSurfaceProfileId]
 * @property {string} [defaultSurfaceProfileId]
 * @property {Record<string, string>} [surfaceProfileByStrategy]
 * @property {number|null} [animationBakeMaxFrames] — cap assembly surface flipbook length
 */
/** @type {ProceduralDesignConfig | null} */
let activeProceduralDesign = null;
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
    return {
        startSurfaceProfileId: raw.startSurfaceProfileId ?? shorthand ?? null,
        defaultSurfaceProfileId: raw.defaultSurfaceProfileId ?? shorthand ?? null,
        surfaceProfileByStrategy: strategyMap,
        animationBakeMaxFrames: raw.animationBakeMaxFrames,
    };
}
/**
 * @param {{ layer?: number, strategy?: string }} args
 */
export function resolveActiveSurfaceProfileId({ layer = 0, strategy } = {}) {
    const game = activeProceduralDesign;
    if (!game) throw new Error("No active proceduralDesign — set gameDefinition.proceduralDesign");
    if (strategy && game.surfaceProfileByStrategy?.[strategy]) return game.surfaceProfileByStrategy[strategy];
    if (layer === 0) {
        if (game.startSurfaceProfileId) return game.startSurfaceProfileId;
        throw new Error(
            strategy ? `No surface profile for strategy: ${strategy} — add to proceduralDesign.surfaceProfileByStrategy` : "proceduralDesign.surfaceProfileId or startSurfaceProfileId required",
        );
    }
    if (strategy) throw new Error(`No surface procedural profile mapped for strategy: ${strategy}`);
    if (game.defaultSurfaceProfileId) return game.defaultSurfaceProfileId;
    throw new Error("proceduralDesign.surfaceProfileId or defaultSurfaceProfileId required");
}
/**
 * @param {import("./GameDefinitionTypes.js").GameDefinition | null | undefined} definition
 * @returns {Pick<import("../Libraries/WorldSurface/WorldSurfaceSettings.js").WorldSurfaceSettings, "animationBakeMaxFrames">}
 */
export function resolveProceduralBakeSettings(definition) {
    const raw = definition?.proceduralDesign;
    if (!raw || raw.animationBakeMaxFrames === undefined) return {};
    return { animationBakeMaxFrames: raw.animationBakeMaxFrames };
}
/** @param {import("./GameDefinitionTypes.js").GameDefinition} definition */
export function applyGameProceduralDesign(definition) {
    activeProceduralDesign = resolveProceduralDesignConfig(definition);
    if (!isSurfaceProfileProviderInstalled()) return;
    const nextDefault = activeProceduralDesign?.defaultSurfaceProfileId;
    if (nextDefault) getSurfaceProfileProvider().setDefaultProfileId(nextDefault);
}
function isSurfaceProfileProviderInstalled() {
    try {
        getSurfaceProfileProvider();
        return true;
    } catch {
        return false;
    }
}

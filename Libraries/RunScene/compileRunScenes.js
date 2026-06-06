import { applySkipPreset } from "./skipPresets.js";
import { evaluateCompleteWhen } from "./completeWhen.js";

/**
 * @typedef {object} RunSceneTransition
 * @property {string} [radio] — fired before advancing to the next scene
 */

/**
 * @typedef {object} RunSceneConfig
 * @property {string} id
 * @property {string} [type]
 * @property {string} [phase]
 * @property {string} [spawn]
 * @property {string[]} [radios]
 * @property {string} [skipPreset]
 * @property {Record<string, unknown>} [config]
 * @property {{ horde?: boolean, blockTurret?: boolean }} [capabilities]
 * @property {import("./completeWhen.js").CompleteWhenRule} [completeWhen]
 * @property {RunSceneTransition} [transition]
 */

/**
 * @typedef {object} CompileRunScenesOptions
 * @property {(state: object, spawnSlot: string, ctx: object) => void} applySpawn
 * @property {Record<string, (def: RunSceneConfig) => object>} behaviors
 */

/**
 * @param {RunSceneConfig[]} defs
 * @param {CompileRunScenesOptions} options
 */
export function compileRunScenes(defs, { applySpawn, behaviors }) {
    return defs.map((def) => {
        const behavior = behaviors[def.type]?.(def) ?? {};
        return {
            id: def.id,
            phase: def.phase,
            capabilities: def.capabilities ?? {},
            radios: def.radios ?? [],
            transition: def.transition,
            onSkip(state, ctx) {
                if (def.skipPreset) applySkipPreset(def.skipPreset, state, def);
            },
            onEnter(state, ctx, enterOpts = {}) {
                if (def.spawn && enterOpts.applySpawn) {
                    applySpawn(state, def.spawn, ctx);
                }
                behavior.enter?.(state, ctx);
            },
            onTick: behavior.tick,
            onEnemyKilled: behavior.onEnemyKilled,
            onComplete: behavior.onComplete,
            isComplete(state, ctx) {
                return evaluateCompleteWhen(def.completeWhen, state, ctx);
            },
        };
    });
}

/**
 * @typedef {object} RunSceneDefinition
 * @property {string} id
 * @property {string} [phase] — FSM phase while this scene is active
 * @property {string} [spawn] — named layout slot; applied automatically on enter/advance
 * @property {string[]} [radios] — radio triggers to mark seen when this scene is skipped via startAt
 * @property {Record<string, unknown> | ((state: object) => void)} [skipState] — plain fields to assign, or a custom skip hook
 * @property {(state: object, ctx: object) => void} [enter]
 * @property {(state: object, ctx: object) => void} [tick]
 * @property {(payload: object) => void} [onEnemyKilled]
 * @property {(state: object, ctx: object) => boolean} [completeWhen]
 * @property {(state: object, ctx: object) => void} [onComplete]
 */

/**
 * @typedef {object} CompileRunScenesOptions
 * @property {(state: object, spawnSlot: string, ctx: object) => void} applySpawn
 */

/**
 * @param {RunSceneDefinition[]} defs
 * @param {CompileRunScenesOptions} options
 */
export function compileRunScenes(defs, { applySpawn }) {
    return defs.map((def) => ({
        id: def.id,
        phase: def.phase,
        radios: def.radios ?? [],

        onSkip(state, ctx) {
            if (typeof def.skipState === "function") {
                def.skipState(state, ctx);
                return;
            }
            if (def.skipState) {
                Object.assign(state, def.skipState);
            }
        },

        onEnter(state, ctx) {
            if (def.spawn) applySpawn(state, def.spawn, ctx);
            def.enter?.(state, ctx);
        },

        onTick: def.tick,
        onEnemyKilled: def.onEnemyKilled,
        isComplete: def.completeWhen,
        onComplete: def.onComplete,
    }));
}

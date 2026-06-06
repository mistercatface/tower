/**
 * @typedef {object} RunScenePorts
 * @property {(state: object) => object | null} getLayout
 * @property {{ getConversationIdsForTrigger: (trigger: string) => string[] }} radioRegistry
 * @property {(state: object, triggers: string[]) => void} [markRadiosSeen]
 * @property {(state: object, spawnSlot: string, ctx: object | null) => void} [applySpawn]
 */

export {};

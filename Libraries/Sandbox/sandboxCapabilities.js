import { ROLL_TO_CURSOR_DIRECT_BEHAVIOR_ID } from "./behaviors/rollToCursorDirectBehavior.js";
import { ROLL_TO_CURSOR_HPA_BEHAVIOR_ID } from "./behaviors/rollToCursorHpaBehavior.js";
export const SANDBOX_BEHAVIOR_LABELS = { dragLaunch: "Drag launch", rollToCursorDirect: "Roll to cursor (direct)", rollToCursorHpa: "Roll to cursor (HPA)" };
const ROLL_BEHAVIOR_IDS = new Set([ROLL_TO_CURSOR_DIRECT_BEHAVIOR_ID, ROLL_TO_CURSOR_HPA_BEHAVIOR_ID]);
/** @param {string} behaviorId */
export function getSandboxBehaviorLabel(behaviorId) {
    return SANDBOX_BEHAVIOR_LABELS[behaviorId] ?? behaviorId;
}
/** Props listed in the sandbox "Add" dropdown (excludes shard debris spawned from breaks). */
/** @param {object | null | undefined} asset */
export function isSandboxSpawnable(asset) {
    const sandbox = asset?.sandbox;
    if (sandbox == null || typeof sandbox !== "object") return false;
    return sandbox.spawnable !== false;
}
/**
 * @param {object | null | undefined} asset
 * @param {import("./createSandboxController.js").SandboxBehavior[]} registeredBehaviors
 * @param {object | null | undefined} [pickup]
 * @returns {string[]}
 */
export function resolveSandboxBehaviors(asset, registeredBehaviors, pickup = null) {
    const byId = new Map(registeredBehaviors.map((behavior) => [behavior.id, behavior]));
    if (Array.isArray(asset?.sandbox?.behaviors)) return asset.sandbox.behaviors.filter((id) => byId.has(id));
    const sandbox = asset?.sandbox;
    return [...byId.values()]
        .filter((behavior) => {
            if (behavior.supports && asset && !behavior.supports(pickup, asset)) return false;
            if (ROLL_BEHAVIOR_IDS.has(behavior.id) && sandbox?.rollToCursor === false) return false;
            return true;
        })
        .map((behavior) => behavior.id);
}

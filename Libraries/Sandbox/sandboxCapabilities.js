import { ROLL_TO_CURSOR_DIRECT_BEHAVIOR_ID } from "./behaviors/rollToCursorDirectBehavior.js";
import { ROLL_TO_CURSOR_HPA_BEHAVIOR_ID } from "./behaviors/rollToCursorHpaBehavior.js";
import { getPropAsset } from "../Props/PropCatalog.js";
import { syncWorldPropWeaponState } from "../Combat/worldPropWeaponState.js";
export const SANDBOX_BEHAVIOR_LABELS = {
    dragLaunch: "Drag launch",
    dragLaunchWait: "Drag launch (wait for rest)",
    dragLaunchFacing: "Drag launch (yaw to shot)",
    spawner: "Spawner",
    flipper: "Flipper",
    cueStrike: "Cue strike",
    rollToCursorDirect: "Roll to cursor (direct)",
    rollToCursorHpa: "Roll to cursor (HPA)",
    shoot: "Shoot",
};
const ROLL_BEHAVIOR_IDS = new Set([ROLL_TO_CURSOR_DIRECT_BEHAVIOR_ID, ROLL_TO_CURSOR_HPA_BEHAVIOR_ID]);
/** @param {string} behaviorId */
export function getSandboxBehaviorLabel(behaviorId) {
    return SANDBOX_BEHAVIOR_LABELS[behaviorId] ?? behaviorId;
}
/** @param {object | null | undefined} asset */
export function isSandboxEquippable(asset) {
    return asset?.sandbox?.equip === true;
}
/**
 * @param {import("./SandboxHostPort.js").SandboxHostPort} host
 * @param {(prop: object) => void} fn
 */
export function forEachArmedSandboxWorldProp(host, fn) {
    host.forEachWorldProp((prop) => {
        if (!prop.weaponLoadout?.length) return;
        if (!isSandboxEquippable(getPropAsset(prop.type))) return;
        syncWorldPropWeaponState(prop);
        fn(prop);
    });
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
 * @param {object | null | undefined} [prop]
 * @returns {string[]}
 */
export function resolveSandboxBehaviors(asset, registeredBehaviors, prop = null) {
    const byId = new Map(registeredBehaviors.map((behavior) => [behavior.id, behavior]));
    if (prop?.sandboxBehaviorOverrides) {
        /** @type {string[]} */
        const stamped = [];
        for (const key of Object.keys(prop.sandboxBehaviorOverrides)) {
            if (key === "inputGates") continue;
            if (byId.has(key)) stamped.push(key);
        }
        if (stamped.length) return stamped;
    }
    if (Array.isArray(asset?.sandbox?.behaviors)) return asset.sandbox.behaviors.filter((id) => byId.has(id));
    const sandbox = asset?.sandbox;
    return [...byId.values()]
        .filter((behavior) => {
            if (behavior.supports && asset && !behavior.supports(prop, asset)) return false;
            if (ROLL_BEHAVIOR_IDS.has(behavior.id) && sandbox?.rollToCursor === false) return false;
            return true;
        })
        .map((behavior) => behavior.id);
}

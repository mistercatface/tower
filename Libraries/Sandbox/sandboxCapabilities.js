import { ROLL_TO_CURSOR_DIRECT_BEHAVIOR_ID } from "./behaviors/rollToCursorDirectBehavior.js";
import { ROLL_TO_CURSOR_HPA_BEHAVIOR_ID } from "./behaviors/rollToCursorHpaBehavior.js";
import { getPropAsset } from "../Props/PropCatalog.js";
import { FLOOR_CELL_KIND, formatFloorBeltKindLabel } from "../Spatial/grid/FloorCell.js";
import { syncWorldPropWeaponState } from "../Combat/worldPropWeaponState.js";
import { getSandboxEntityMeta } from "./sandboxEntityMeta.js";
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
 * @param {object} state
 * @param {(prop: object) => void} fn
 */
export function forEachArmedSandboxWorldProp(state, fn) {
    state.entityRegistry.forEachOfKind("worldProp", (prop) => {
        if (prop.isDead) return;
        if (!prop.weaponLoadout?.length) return;
        if (!isSandboxEquippable(getPropAsset(prop.type))) return;
        syncWorldPropWeaponState(prop);
        fn(prop);
    });
}
/** @param {object | null | undefined} asset */
export function isSandboxSpawnable(asset) {
    const sandbox = asset?.sandbox;
    if (sandbox == null || typeof sandbox !== "object") return false;
    return sandbox.spawnable !== false;
}
/** Spawn stamps `floorStore` cells — not a WorldProp. */
export function isGridFloorBeltSpawnAsset(asset) {
    return asset?.sandbox?.gridFloorBelt === true;
}
/** Spawn stamps a passage power source cell — not a WorldProp. */
export function isGridPassagePowerSourceSpawnAsset(asset) {
    return asset?.sandbox?.gridPassagePowerSource === true;
}
/** Spawn stamps a rectangular room node footprint on the grid — not a WorldProp. */
export function isGridRoomNodeSpawnAsset(asset) {
    return asset?.sandbox?.gridRoomNode === true;
}
/** Spawn stamps a pool ball rack — not a single WorldProp. */
export function isPoolRackSpawnAsset(asset) {
    return asset?.sandbox?.spawnRack === "8ball" || asset?.sandbox?.spawnRack === "9ball";
}
/** @param {object | null | undefined} asset */
export function isSingleWorldPropSpawnAsset(asset) {
    return Boolean(asset) && !isGridFloorBeltSpawnAsset(asset) && !isGridPassagePowerSourceSpawnAsset(asset) && !isGridRoomNodeSpawnAsset(asset) && !isPoolRackSpawnAsset(asset);
}
/** @param {object | null | undefined} asset */
export function resolveFloorBeltKindFromSpawnAsset(asset) {
    const kind = asset?.sandbox?.floorBeltKind;
    if (kind === "elbowLeft") return FLOOR_CELL_KIND.BeltElbowLeft;
    if (kind === "elbowRight") return FLOOR_CELL_KIND.BeltElbowRight;
    if (kind === "straightRails") return FLOOR_CELL_KIND.BeltRails;
    if (kind === "elbowLeftRails") return FLOOR_CELL_KIND.BeltElbowLeftRails;
    if (kind === "elbowRightRails") return FLOOR_CELL_KIND.BeltElbowRightRails;
    return FLOOR_CELL_KIND.Belt;
}
const FLOOR_BELT_KINDS = [
    FLOOR_CELL_KIND.Belt,
    FLOOR_CELL_KIND.BeltRails,
    FLOOR_CELL_KIND.BeltElbowLeft,
    FLOOR_CELL_KIND.BeltElbowRight,
    FLOOR_CELL_KIND.BeltElbowLeftRails,
    FLOOR_CELL_KIND.BeltElbowRightRails,
];
/** @returns {{ kind: number, label: string }[]} */
export function listFloorBeltKindOptions() {
    return FLOOR_BELT_KINDS.map((kind) => ({ kind, label: formatFloorBeltKindLabel(kind) }));
}
/**
 * @param {object | null | undefined} asset
 * @param {import("./createSandboxController.js").SandboxBehavior[]} registeredBehaviors
 * @param {object} state
 * @param {object | null | undefined} [prop]
 * @returns {string[]}
 */
export function resolveSandboxBehaviors(asset, registeredBehaviors, state, prop = null) {
    const byId = new Map(registeredBehaviors.map((behavior) => [behavior.id, behavior]));
    const behaviorOverrides = prop ? getSandboxEntityMeta(state).getBehaviorOverrides(prop.id) : null;
    if (behaviorOverrides) {
        /** @type {string[]} */
        const stamped = [];
        for (const key of Object.keys(behaviorOverrides)) {
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

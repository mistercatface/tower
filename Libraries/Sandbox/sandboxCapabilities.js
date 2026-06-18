import { DIRECT_GROUND_NAV_BEHAVIOR_ID, FLOW_GROUND_NAV_BEHAVIOR_ID, GROUND_NAV_BEHAVIOR_IDS, HPA_GROUND_NAV_BEHAVIOR_ID } from "./groundNav/groundNavIds.js";
import { FLOOR_CELL_KIND, formatFloorBeltKindLabel } from "../Spatial/grid/FloorCell.js";
import { getSandboxEntityMeta } from "../../GameState/sandboxEntityMeta.js";
export const SANDBOX_BEHAVIOR_LABELS = {
    dragLaunch: "Drag launch",
    dragLaunchWait: "Drag launch (wait for rest)",
    dragLaunchFacing: "Drag launch (yaw to shot)",
    spawner: "Spawner",
    flipper: "Flipper",
    cueStrike: "Cue strike",
    [DIRECT_GROUND_NAV_BEHAVIOR_ID]: "Ground nav (direct)",
    [HPA_GROUND_NAV_BEHAVIOR_ID]: "Ground nav (HPA)",
    [FLOW_GROUND_NAV_BEHAVIOR_ID]: "Ground nav (flow)",
};
export function getSandboxBehaviorLabel(behaviorId) {
    return SANDBOX_BEHAVIOR_LABELS[behaviorId] ?? behaviorId;
}
export function isSandboxSpawnable(asset) {
    const sandbox = asset?.sandbox;
    if (sandbox == null || typeof sandbox !== "object") return false;
    return sandbox.spawnable !== false;
}
export function isGridFloorBeltSpawnAsset(asset) {
    return asset?.sandbox?.gridFloorBelt === true;
}
export function isGridPassagePowerSourceSpawnAsset(asset) {
    return asset?.sandbox?.gridPassagePowerSource === true;
}
export function isRoomNodeSpawnAsset(asset) {
    return asset?.sandbox?.roomNode === true;
}
export function isRoomLinkSpawnAsset(asset) {
    return asset?.sandbox?.roomLink === true;
}
export function isPuzzleTemplateSpawnAsset(asset) {
    return asset?.sandbox?.puzzleTemplate === true;
}
export function isPoolRackSpawnAsset(asset) {
    return asset?.sandbox?.spawnRack === "8ball" || asset?.sandbox?.spawnRack === "9ball";
}
export const DEFAULT_SPLITTABLE_SPAWN_WIDTH = 16;
export const DEFAULT_SPLITTABLE_SPAWN_HEIGHT = 16;
export function isSplittableBoxSpawnAsset(asset) {
    return Boolean(asset?.physics?.splittable && asset?.physics?.collisionShape === "box");
}
export function isSingleWorldPropSpawnAsset(asset) {
    return (
        Boolean(asset) &&
        !isGridFloorBeltSpawnAsset(asset) &&
        !isGridPassagePowerSourceSpawnAsset(asset) &&
        !isRoomNodeSpawnAsset(asset) &&
        !isRoomLinkSpawnAsset(asset) &&
        !isPoolRackSpawnAsset(asset)
    );
}
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
export function listFloorBeltKindOptions() {
    return FLOOR_BELT_KINDS.map((kind) => ({ kind, label: formatFloorBeltKindLabel(kind) }));
}
export function resolveSandboxBehaviors(asset, registeredBehaviors, state, prop = null) {
    const byId = new Map(registeredBehaviors.map((behavior) => [behavior.id, behavior]));
    const behaviorOverrides = prop ? getSandboxEntityMeta(state).getBehaviorOverrides(prop.id) : null;
    if (behaviorOverrides) {
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
            if (GROUND_NAV_BEHAVIOR_IDS.has(behavior.id) && sandbox?.groundNav === false) return false;
            return true;
        })
        .map((behavior) => behavior.id);
}

import { ROLL_TO_CURSOR_DIRECT_BEHAVIOR_ID } from "./behaviors/rollToCursorDirectBehavior.js";
import { ROLL_TO_CURSOR_HPA_BEHAVIOR_ID } from "./behaviors/rollToCursorHpaBehavior.js";
import { ROLL_TO_CURSOR_FLOW_BEHAVIOR_ID } from "./behaviors/rollToCursorFlowBehavior.js";
import { getPropAsset } from "../Props/PropCatalog.js";
import { FLOOR_CELL_KIND, formatFloorBeltKindLabel } from "../Spatial/grid/FloorCell.js";
import { syncWorldPropWeaponState } from "../Combat/worldPropWeaponState.js";
import { getSandboxEntityMeta } from "../../GameState/sandboxEntityMeta.js";
/**
 * @typedef {object} SandboxBehavior
 * @property {string} id
 * @property {(prop: object | null, asset: object) => boolean} [supports]
 * @property {(world: { x: number, y: number }, e: PointerEvent) => boolean} [tryCanvasInput]
 * @property {(prop: object, world: { x: number, y: number }, e: PointerEvent) => boolean} onPointerDown
 * @property {(prop: object, world: { x: number, y: number }, e: PointerEvent) => void} onPointerMove
 * @property {(prop: object, e: PointerEvent) => void} onPointerUp
 * @property {(prop: object, dt: number) => void} [tick]
 * @property {(dt: number) => void} [tickWorld]
 * @property {(ctx: CanvasRenderingContext2D, prop: object) => void} [drawOverlay]
 * @property {(ctx: CanvasRenderingContext2D) => void} [drawWorldOverlay]
 * @property {(prop: object) => import("../Render/map/drawActivePathOverlay.js").ActivePathOverlay | null} [getPathOverlay]
 * @property {(prop: object, world: { x: number, y: number }) => void} [setGroundMoveTarget]
 * @property {(prop: object, world: { x: number, y: number }) => void} [updateGroundMoveTarget]
 * @property {() => void} [reset]
 */
export const SANDBOX_BEHAVIOR_LABELS = {
    dragLaunch: "Drag launch",
    dragLaunchWait: "Drag launch (wait for rest)",
    dragLaunchFacing: "Drag launch (yaw to shot)",
    spawner: "Spawner",
    flipper: "Flipper",
    cueStrike: "Cue strike",
    rollToCursorDirect: "Roll to cursor (direct)",
    rollToCursorHpa: "Roll to cursor (HPA)",
    rollToCursorFlow: "Roll to cursor (flow)",
    shoot: "Shoot",
};
const ROLL_BEHAVIOR_IDS = new Set([ROLL_TO_CURSOR_DIRECT_BEHAVIOR_ID, ROLL_TO_CURSOR_HPA_BEHAVIOR_ID, ROLL_TO_CURSOR_FLOW_BEHAVIOR_ID]);
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
/** Spawn stamps a rectangular room node footprint — not a WorldProp. */
export function isRoomNodeSpawnAsset(asset) {
    return asset?.sandbox?.roomNode === true;
}
/** Spawn stamps a room-graph corridor link — not a WorldProp. */
export function isRoomLinkSpawnAsset(asset) {
    return asset?.sandbox?.roomLink === true;
}
/** Puzzle template stamps a fixed room graph layout — not a WorldProp. */
export function isPuzzleTemplateSpawnAsset(asset) {
    return asset?.sandbox?.puzzleTemplate === true;
}
/** Spawn stamps a pool ball rack — not a single WorldProp. */
export function isPoolRackSpawnAsset(asset) {
    return asset?.sandbox?.spawnRack === "8ball" || asset?.sandbox?.spawnRack === "9ball";
}
/** Splittable box props default to the crate footprint (16×16 px). */
export const DEFAULT_SPLITTABLE_SPAWN_WIDTH = 16;
export const DEFAULT_SPLITTABLE_SPAWN_HEIGHT = 16;
/** @param {object | null | undefined} asset */
export function isSplittableBoxSpawnAsset(asset) {
    return Boolean(asset?.physics?.splittable && asset?.physics?.collisionShape === "box");
}
/** @param {object | null | undefined} asset */
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
 * @param {import("./sandboxCapabilities.js").SandboxBehavior[]} registeredBehaviors
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

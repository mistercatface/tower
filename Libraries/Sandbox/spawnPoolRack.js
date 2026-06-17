import { WorldProp } from "../../Entities/WorldProp.js";
import { addWorldPropToState } from "../../GameState/EntityRegistry.js";
import { resolveSandboxFaction } from "../Combat/sandboxTargeting.js";
import { wakePushableBody } from "../Motion/pushableSleep.js";
import { CUE_STRIKE_BEHAVIOR_ID } from "./behaviors/cueStrikeBehavior.js";
import { getSandboxEntityMeta } from "../../GameState/sandboxEntityMeta.js";
const PLAYFIELD_W = 80;
const PLAYFIELD_H = 160;
const APEX_U = 0.5;
const APEX_V = 0.2933012701892219;
const CUE_BEHAVIOR_OVERRIDES = {
    cueStrike: { minDrag: 0.75, maxPull: 18.75, pullScale: 0.5, minPower: 4, maxPower: 800, powerCurve: 2.5 },
    inputGates: {
        cueStrike: [
            { scope: "self", until: "atRest" },
            { scope: "groupWorldProps", link: "spawnGroupId", until: "allAtRest", excludeStates: ["voidSink"] },
        ],
    },
};
/** @typedef {{ prop: string, u: number, v: number }} RackBallPlacement */
/** @type {RackBallPlacement[]} */
const RACK_9BALL = [
    { prop: "pool_cue_ball", u: 0.5, v: 0.75 },
    { prop: "pool_ball_1", u: 0.5, v: 0.2933012701892219 },
    { prop: "pool_ball_2", u: 0.45, v: 0.25 },
    { prop: "pool_ball_3", u: 0.55, v: 0.25 },
    { prop: "pool_ball_4", u: 0.4, v: 0.20669872981077808 },
    { prop: "pool_ball_9", u: 0.5, v: 0.20669872981077808 },
    { prop: "pool_ball_5", u: 0.6, v: 0.20669872981077808 },
    { prop: "pool_ball_7", u: 0.45, v: 0.16339745962155616 },
    { prop: "pool_ball_8", u: 0.55, v: 0.16339745962155616 },
    { prop: "pool_ball_6", u: 0.5, v: 0.12009618943233424 },
];
/** @type {RackBallPlacement[]} */
const RACK_8BALL = [
    { prop: "pool_cue_ball", u: 0.5, v: 0.75 },
    { prop: "pool_ball_1", u: 0.5, v: 0.2933012701892219 },
    { prop: "pool_ball_10", u: 0.45, v: 0.25 },
    { prop: "pool_ball_2", u: 0.55, v: 0.25 },
    { prop: "pool_ball_11", u: 0.4, v: 0.20669872981077808 },
    { prop: "pool_ball_8", u: 0.5, v: 0.20669872981077808 },
    { prop: "pool_ball_3", u: 0.6, v: 0.20669872981077808 },
    { prop: "pool_ball_12", u: 0.35, v: 0.16339745962155616 },
    { prop: "pool_ball_4", u: 0.45, v: 0.16339745962155616 },
    { prop: "pool_ball_13", u: 0.55, v: 0.16339745962155616 },
    { prop: "pool_ball_5", u: 0.65, v: 0.16339745962155616 },
    { prop: "pool_ball_6", u: 0.3, v: 0.12009618943233424 },
    { prop: "pool_ball_14", u: 0.4, v: 0.12009618943233424 },
    { prop: "pool_ball_7", u: 0.5, v: 0.12009618943233424 },
    { prop: "pool_ball_15", u: 0.6, v: 0.12009618943233424 },
    { prop: "pool_ball_9", u: 0.7, v: 0.12009618943233424 },
];
/** @param {number} u @param {number} v */
function rackOffset(u, v) {
    return { dx: (u - APEX_U) * PLAYFIELD_W, dy: (v - APEX_V) * PLAYFIELD_H };
}
/**
 * @param {object} state
 * @param {number} anchorX — foot spot / apex ball (ball 1) world X
 * @param {number} anchorY
 * @param {"8ball" | "9ball"} variant
 * @param {string} faction
 */
/** @param {"8ball" | "9ball"} variant */
function poolRackExportType(variant) {
    return variant === "9ball" ? "pool_rack_9ball" : "pool_rack_8ball";
}
/**
 * @param {object[]} members
 * @param {import("../../GameState/sandboxEntityMeta.js").SandboxEntityMetaStore} meta
 * @returns {{ type: string, x: number, y: number, facing: number, faction: string } | null}
 */
export function tryExportPoolRackSpawnGroup(members, meta) {
    const exportType = meta.getSpawnGroupExportType(members[0].id);
    if (!exportType) return null;
    const anchor = members.find((prop) => meta.isSpawnGroupAnchor(prop.id)) ?? members[0];
    return { type: exportType, x: anchor.x, y: anchor.y, facing: anchor.facing, faction: resolveSandboxFaction(anchor) };
}
export function spawnPoolRack(state, anchorX, anchorY, variant, faction) {
    const layout = variant === "9ball" ? RACK_9BALL : RACK_8BALL;
    const spawnGroupId = `poolRack:${Date.now()}`;
    const exportType = poolRackExportType(variant);
    const meta = getSandboxEntityMeta(state);
    let cueProp = null;
    for (let i = 0; i < layout.length; i++) {
        const entry = layout[i];
        const { dx, dy } = rackOffset(entry.u, entry.v);
        const prop = new WorldProp(anchorX + dx, anchorY + dy, entry.prop, 0);
        prop.faction = faction;
        meta.setSpawnGroupId(prop.id, spawnGroupId);
        meta.setSpawnGroupExportType(prop.id, exportType);
        if (entry.prop === "pool_ball_1") meta.setSpawnGroupAnchor(prop.id);
        if (entry.prop === "pool_cue_ball") {
            meta.setBehaviorOverrides(prop.id, CUE_BEHAVIOR_OVERRIDES);
            meta.setActiveBehaviorId(prop.id, CUE_STRIKE_BEHAVIOR_ID);
            cueProp = prop;
        }
        wakePushableBody(prop);
        addWorldPropToState(state, prop);
    }
    return cueProp;
}

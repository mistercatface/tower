import { createFactionResolver } from "../Interaction/createFactionResolver.js";
/** @typedef {import("../../Core/GameDefinitionTypes.js").InspectPort} InspectPort */
/** @typedef {import("../../Core/GameDefinitionTypes.js").CombatPort} CombatPort */
/** @typedef {import("../../Core/GameDefinitionTypes.js").TargetingPort} TargetingPort */
const { resolveFaction: noopInferFaction, areHostile: noopAreHostile } = createFactionResolver({
    resolveFaction(actor) {
        if (actor.faction) return actor.faction;
        if (actor.type === "player") return "player";
        return undefined;
    },
    hostilePairs: [],
});
/** @type {InspectPort} */
export const NOOP_INSPECT_PORT = {
    getMissionBanner() {
        return { show: false, text: "" };
    },
    findPickup() {
        return null;
    },
    onMissionOpen() {},
    onMissionClose() {},
    isMissionActive() {
        return false;
    },
};
/** @type {CombatPort} */
export const NOOP_COMBAT_PORT = {};
/** @type {TargetingPort} */
export const NOOP_TARGETING_PORT = {
    inferFaction: noopInferFaction,
    areHostile: noopAreHostile,
    getPlayerActors() {
        return [];
    },
    getBroadphaseActors() {
        return [];
    },
    getHostiles() {
        return [];
    },
    getNearestHostile() {
        return null;
    },
    isValidTurretTarget() {
        return false;
    },
};

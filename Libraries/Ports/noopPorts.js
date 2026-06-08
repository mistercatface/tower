import { createFactionResolver } from "../Interaction/createFactionResolver.js";
/** @typedef {import("../../Core/GameDefinitionTypes.js").CombatPort} CombatPort */
/** @typedef {import("../../Core/GameDefinitionTypes.js").TargetingPort} TargetingPort */
/** @typedef {import("../../Core/GameDefinitionTypes.js").ViewPort} ViewPort */
const { resolveFaction: noopInferFaction, areHostile: noopAreHostile } = createFactionResolver({
    resolveFaction(actor) {
        if (actor.faction) return actor.faction;
        if (actor.type === "player") return "player";
        return undefined;
    },
    hostilePairs: [],
});
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
/** @type {ViewPort} */
export const NOOP_VIEW_PORT = {
    getViewCenter() {
        return null;
    },
};

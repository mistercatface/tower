import { createFactionResolver } from "../Interaction/createFactionResolver.js";
const { resolveFaction: inferFaction, areHostile } = createFactionResolver({
    resolveFaction(actor) {
        if (actor.faction) return actor.faction;
        if (actor.type === "player") return "player";
        return undefined;
    },
    hostilePairs: [],
});
export const emptyTargeting = {
    inferFaction,
    areHostile,
    getPlayerActors(state) {
        return state.player && !state.player.isDead ? [state.player] : [];
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

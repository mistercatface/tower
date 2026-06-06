import { createFactionResolver } from "../../Libraries/Interaction/createFactionResolver.js";

const { resolveFaction: inferFaction, areHostile } = createFactionResolver({
    resolveFaction(actor) {
        if (actor.faction) return actor.faction;
        if (actor.type === "player") return "player";
        return undefined;
    },
    hostilePairs: [],
});

export { inferFaction, areHostile };

export function getPlayerActors(state) {
    return state.player && !state.player.isDead ? [state.player] : [];
}

export function getHostiles() {
    return [];
}

export function getNearestHostile() {
    return null;
}

export function isValidTurretTarget() {
    return false;
}

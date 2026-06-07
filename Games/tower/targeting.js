import { createFactionResolver } from "../../Libraries/Interaction/createFactionResolver.js";
import { hostileFactionPairs } from "../../Config/content/factions.js";
import { getActorProfileForActor } from "../../Config/content/actorProfiles.js";
function resolveFaction(actor) {
    if (actor.faction) return actor.faction;
    // Pickups/props lack locomotion separation — do not inherit the default enemy profile.
    if (!actor.separation) return undefined;
    return getActorProfileForActor(actor).faction;
}
const { resolveFaction: inferFaction, areHostile } = createFactionResolver({ resolveFaction, hostilePairs: hostileFactionPairs });
export { inferFaction, areHostile };
export function getPlayerActors(state) {
    if (typeof state.getPlayerActors === "function") return state.getPlayerActors();
    return state.player && !state.player.isDead ? [state.player] : [];
}
export function getHostileActors(state) {
    if (typeof state.getHostileActors === "function") return state.getHostileActors();
    return (state.enemies ?? []).filter((actor) => actor && !actor.isDead);
}
export function getAllCombatants(state) {
    if (typeof state.getCombatants === "function") return state.getCombatants();
    return [...getPlayerActors(state), ...getHostileActors(state)];
}
export function getBroadphaseActors(state) {
    if (typeof state.getCombatants === "function") return state.getCombatants();
    return [...getPlayerActors(state), ...getHostileActors(state)];
}
export function getHostiles(state, actor) {
    if (!actor) return [];
    return getAllCombatants(state).filter((other) => other !== actor && !other.isDead && areHostile(actor, other));
}
export function getHostilesForFaction(state, faction) {
    const source = { faction, isDead: false, teamId: null };
    return getAllCombatants(state).filter((other) => !other.isDead && areHostile(source, other));
}
export function isValidTurretTarget(actor, target, state, range, blocksTargeting, { requireLos = true } = {}) {
    if (blocksTargeting || !target || target.isDead || target.isPassive) return false;
    if (!areHostile(actor, target)) return false;
    const dx = target.x - actor.x;
    const dy = target.y - actor.y;
    if (dx * dx + dy * dy > range * range) return false;
    if (requireLos) return actor.hasLineOfSightTo(target, state);
    return true;
}
export function getNearestHostile(state, source, range, excludedTargets = null, { requireLos = true } = {}) {
    let nearest = null;
    let minDistSq = Infinity;
    for (const target of getHostiles(state, source)) {
        if (excludedTargets?.has(target)) continue;
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const distSq = dx * dx + dy * dy;
        if (distSq <= range * range && distSq < minDistSq)
            if (!requireLos || source.hasLineOfSightTo(target, state)) {
                minDistSq = distSq;
                nearest = target;
            }
    }
    return nearest;
}

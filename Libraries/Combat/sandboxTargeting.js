import { createFactionResolver } from "../Interaction/createFactionResolver.js";
export const sandboxFactions = { alpha: "alpha", bravo: "bravo", charlie: "charlie" };
export const SANDBOX_DEFAULT_FACTION = sandboxFactions.alpha;
/** @type {readonly { id: string, label: string }[]} */
export const SANDBOX_FACTION_OPTIONS = [
    { id: sandboxFactions.alpha, label: "Alpha" },
    { id: sandboxFactions.bravo, label: "Bravo" },
    { id: sandboxFactions.charlie, label: "Charlie" },
];
export function formatSandboxFactionLabel(factionId) {
    return SANDBOX_FACTION_OPTIONS.find((opt) => opt.id === factionId)?.label ?? factionId;
}
export function resolveSandboxFaction(actor) {
    return actor?.faction ?? SANDBOX_DEFAULT_FACTION;
}
/** Ordered pairs that may engage. Order does not matter. */
export const sandboxHostilePairs = [
    [sandboxFactions.alpha, sandboxFactions.bravo],
    [sandboxFactions.alpha, sandboxFactions.charlie],
    [sandboxFactions.bravo, sandboxFactions.charlie],
];
function resolveFaction(actor) {
    return resolveSandboxFaction(actor);
}
const { resolveFaction: inferFaction, areHostile } = createFactionResolver({ resolveFaction, hostilePairs: sandboxHostilePairs });
export { inferFaction, areHostile };
export function getAllCombatants(state) {
    // Collect any explicit actors or world props with a faction.
    // Sandbox uses world props as its primary test combatants.
    const combatants = [];
    state.entityRegistry.forEachOfKind("worldProp", (p) => {
        if (!p.isDead) combatants.push(p);
    });
    if (state.actors) for (const a of state.actors) if (a.faction) combatants.push(a);
    return combatants;
}
/** @type {import("../../Core/GameDefinitionTypes.js").TargetingPort} */
export const sandboxTargeting = {
    inferFaction,
    areHostile,
    getPlayerActors: (state) => {
        return []; // Agnostic: no "player"
    },
    getBroadphaseActors: getAllCombatants,
    getHostiles: (state, actor) => {
        if (!actor) return [];
        return getAllCombatants(state).filter((other) => other !== actor && !other.isDead && areHostile(actor, other));
    },
    getNearestHostile: (state, source, range, excludedTargets = null, { requireLos = true } = {}) => {
        let nearest = null;
        let minDistSq = Infinity;
        for (const target of sandboxTargeting.getHostiles(state, source)) {
            if (excludedTargets?.has(target)) continue;
            const dx = target.x - source.x;
            const dy = target.y - source.y;
            const distSq = dx * dx + dy * dy;
            if (distSq > range * range) continue;
            if (requireLos && source.hasLineOfSightTo && !source.hasLineOfSightTo(target, state)) continue;
            if (distSq < minDistSq) {
                minDistSq = distSq;
                nearest = target;
            }
        }
        return nearest;
    },
    isValidTurretTarget: (actor, target, state, range, blocksTargeting, { requireLos = true } = {}) => {
        if (blocksTargeting || !target || target.isDead || target.isPassive) return false;
        if (!areHostile(actor, target)) return false;
        const dx = target.x - actor.x;
        const dy = target.y - actor.y;
        if (dx * dx + dy * dy > range * range) return false;
        if (requireLos && actor.hasLineOfSightTo && !actor.hasLineOfSightTo(target, state)) return false;
        return true;
    },
};

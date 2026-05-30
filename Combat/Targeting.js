import { Utilities } from "../Core/Utilities.js";

export function inferFaction(actor) {
    if (actor.faction) return actor.faction;
    return actor.type === "player" ? "player" : "enemy";
}

export function areHostile(a, b) {
    if (!a || !b || a === b || a.isDead || b.isDead) return false;
    if (a.teamId != null && b.teamId != null && a.teamId === b.teamId) return false;

    const fa = inferFaction(a);
    const fb = inferFaction(b);
    if (fa === fb) return false;

    return (fa === "player" && fb === "enemy") || (fa === "enemy" && fb === "player");
}

export function getPlayerActors(state) {
    if (typeof state.getPlayerActors === "function") {
        return state.getPlayerActors();
    }
    if (state.players?.length) {
        return state.players.filter((p) => p && !p.isDead);
    }
    return state.player && !state.player.isDead ? [state.player] : [];
}

export function getHostileActors(state) {
    if (typeof state.getHostileActors === "function") {
        return state.getHostileActors();
    }
    return (state.enemies ?? []).filter((actor) => actor && !actor.isDead);
}

function getAllCombatants(state) {
    if (typeof state.getCombatants === "function") {
        return state.getCombatants();
    }
    return [...getPlayerActors(state), ...getHostileActors(state)];
}

export function getHostiles(state, actor) {
    if (!actor) return [];

    return getAllCombatants(state).filter(
        (other) => other !== actor && !other.isDead && areHostile(actor, other)
    );
}

export function getHostilesForFaction(state, faction) {
    const source = { faction, isDead: false, teamId: null };
    return getAllCombatants(state).filter((other) => !other.isDead && areHostile(source, other));
}

export function isValidTurretTarget(actor, target, state, range, blocksTargeting, { requireLos = true } = {}) {
    if (blocksTargeting || !target || target.isDead) return false;
    if (!areHostile(actor, target)) return false;

    const dist = Math.hypot(target.x - actor.x, target.y - actor.y);
    if (dist > range) return false;

    if (requireLos) {
        return Utilities.hasLineOfSight(actor.x, actor.y, target.x, target.y, state.walls, actor.radius);
    }

    return true;
}

export function getNearestHostile(state, source, range, excludedTargets = null, { requireLos = true } = {}) {
    let nearest = null;
    let minDist = Infinity;

    for (const target of getHostiles(state, source)) {
        if (excludedTargets?.has(target)) continue;

        const dist = Math.hypot(target.x - source.x, target.y - source.y);
        if (dist <= range && dist < minDist) {
            if (
                !requireLos ||
                Utilities.hasLineOfSight(source.x, source.y, target.x, target.y, state.walls, source.radius)
            ) {
                minDist = dist;
                nearest = target;
            }
        }
    }

    return nearest;
}

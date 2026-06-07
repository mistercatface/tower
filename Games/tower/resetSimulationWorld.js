import { Pools } from "../../Core/Pools.js";
/** Clear transient combat collections when entering a run scene. */
export function resetSimulationWorld(state) {
    if (state.projectiles) for (let i = 0; i < state.projectiles.length; i++) Pools.projectiles.release(state.projectiles[i]);
    state.projectiles = [];
    state.explosions = [];
    state.enemies = [];
    state.activeLasers = [];
    state.combatParticles = [];
    state.ragdollCorpses = [];
    state.floatingTexts = [];
}

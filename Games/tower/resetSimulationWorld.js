import { towerPools } from "./pools.js";
/** Clear transient combat collections when entering a run scene. */
export function resetSimulationWorld(state) {
    const pool = state.projectilePool ?? towerPools.projectiles;
    if (state.projectiles) for (let i = 0; i < state.projectiles.length; i++) pool.release(state.projectiles[i]);
    state.projectiles = [];
    state.explosions = [];
    state.enemies = [];
    state.activeLasers = [];
    state.combatParticles = [];
    state.ragdollCorpses = [];
    state.floatingTexts = [];
}

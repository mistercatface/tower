import { CombatParticles } from "../Render/CombatParticles.js";
import { RagdollCorpse } from "../../Entities/RagdollCorpse.js";
import { Projectile } from "../../Entities/Projectile.js";
import { updateSandboxAutoCombat } from "./pickupAutoCombat.js";
/** @typedef {{ run: (state: object, dt: number, spatialFrame: object, events: object[]) => void }} SimulationPhase */
function dispatchSimulationEvents(events, state) {
    for (const event of events)
        if (event.target?.handleHit) event.target.handleHit(event.damage, state, event.type, event);
        else if (event.target?.takeDamage) event.target.takeDamage(event.damage, state);
}
/** @type {SimulationPhase} */
export const sandboxAutoCombatPhase = {
    id: "sandboxAutoCombat",
    run(state, dt) {
        updateSandboxAutoCombat(state, dt);
    },
};
/** @type {SimulationPhase} */
export const projectilesPhase = {
    id: "projectiles",
    run(state, dt, spatialFrame, events) {
        Projectile.checkSpawnCollisions(state, spatialFrame, events);
        Projectile.updateAll(state, dt);
    },
};
/** @type {SimulationPhase} */
export const combatParticlesPhase = {
    id: "combatParticles",
    run(state, dt) {
        CombatParticles.updateAll(state, dt);
    },
};
/** @type {SimulationPhase} */
export const ragdollCorpsePhase = {
    id: "ragdollCorpse",
    run(state, dt, spatialFrame) {
        RagdollCorpse.updateAll(state, dt, spatialFrame);
    },
};
/** @type {SimulationPhase} */
export const dispatchEventsPhase = {
    id: "dispatchEvents",
    run(state, _dt, _spatialFrame, events) {
        dispatchSimulationEvents(events, state);
    },
};

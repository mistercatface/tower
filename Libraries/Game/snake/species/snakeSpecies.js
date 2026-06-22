import { createAliveSnakeInstance } from "../SnakeInstance.js";
import { registerAliveAgent } from "../../../AI/agents/agentPopulationRegistry.js";

export const snakeSpecies = {
    id: "snake",
    createInstance(state, ctx) {
        return createAliveSnakeInstance(state, ctx);
    },
    register(session, instance) {
        registerAliveAgent(session.registry, instance.headId, this.id, instance);
        session.instancesByHeadId.set(instance.headId, instance);
        if (instance.autosim) session.autosimsByHeadId.set(instance.headId, instance.autosim);
    },
    start(instance, state) {
        instance.start(state);
    },
    stop(instance, state) {
        instance.stopSteering(state);
    },
    validate(instance, state, session) {
        if (typeof instance.validate === "function") instance.validate(state, session);
    },
    tick(instance, state, dtMs) {
        if (typeof instance.tick === "function") instance.tick(state, dtMs);
    },
    updateDiagnostics(instance, state) {
        if (typeof instance.updatePressureDiagnostics === "function") instance.updatePressureDiagnostics(state);
    }
};

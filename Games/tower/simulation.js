import { createSimulationPort } from "../../Systems/Simulation/SimulationPipeline.js";
import { runSimulationEnterPersistence } from "../../Systems/Simulation/simulationEnterPersistence.js";
import { hordePhase, abilitiesPhase, upgradesPhase, levelUpsPhase } from "./phases.js";
import {
    playerLocomotionPhase,
    flowFieldPhase,
    gameSceneTickPhase,
    projectilesPhase,
    particlesPhase,
    pushablePhysicsPhase,
    explosionsPhase,
    dispatchEventsPhase,
    floatingTextPhase,
    worldSurfacePhase,
    inspectorPartyPhase,
} from "../../Systems/Simulation/phases.js";
/** @type {import("../../Core/GameDefinitionTypes.js").SimulationPort} */
export const towerSimulation = createSimulationPort(
    [
        abilitiesPhase,
        playerLocomotionPhase,
        flowFieldPhase,
        gameSceneTickPhase,
        hordePhase,
        projectilesPhase,
        particlesPhase,
        pushablePhysicsPhase,
        explosionsPhase,
        dispatchEventsPhase,
        floatingTextPhase,
        upgradesPhase,
        levelUpsPhase,
        worldSurfacePhase,
    ],
    {
        inspectorPhases: [abilitiesPhase, inspectorPartyPhase, flowFieldPhase, pushablePhysicsPhase, dispatchEventsPhase, floatingTextPhase, gameSceneTickPhase],
        onEnter(ctx) {
            ctx.state.hordeSpawner.beginHorde();
            ctx.state.player.resetTurretCombatState();
            runSimulationEnterPersistence(ctx.state);
        },
    },
);

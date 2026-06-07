import { SimulationPipeline, createSimulationPort } from "../../Systems/Simulation/SimulationPipeline.js";
import { pushablePhysicsPhase, gameSceneTickPhase, worldSurfacePhase } from "../../Systems/Simulation/phases.js";
import { hordePhase, abilitiesPhase, upgradesPhase, levelUpsPhase, playerLocomotionPhase, flowFieldPhase, inspectorPartyPhase } from "./phases.js";
import { projectilesPhase, particlesPhase, explosionsPhase, dispatchEventsPhase, floatingTextPhase } from "./combatPhases.js";
import { beginTowerSimulationRuntime } from "./simRuntime.js";
import { runSimulationEnterPersistence } from "./simulationEnterPersistence.js";
/** @typedef {import("../../Core/GameDefinitionTypes.js").SimulationPort} SimulationPort */
/** @typedef {SimulationPort & { runInspectorTick: (ctx: object, dt: number) => void }} TowerSimulationPort */
const inspectorPhases = [abilitiesPhase, inspectorPartyPhase, flowFieldPhase, pushablePhysicsPhase, dispatchEventsPhase, floatingTextPhase, gameSceneTickPhase];
const inspectorPipeline = new SimulationPipeline(inspectorPhases, beginTowerSimulationRuntime);
/** @type {TowerSimulationPort} */
export const towerSimulation = {
    ...createSimulationPort(
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
            beginRuntime: beginTowerSimulationRuntime,
            onEnter(ctx) {
                ctx.state.hordeSpawner.beginHorde();
                ctx.state.player.resetTurretCombatState();
                runSimulationEnterPersistence(ctx.state);
            },
        },
    ),
    runInspectorTick(ctx, dt) {
        inspectorPipeline.runTick(ctx, dt);
    },
};

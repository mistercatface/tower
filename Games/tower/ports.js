import { towerCombatInteraction } from "./presets/combatInteraction.js";
import { GUN_ID_TO_VISUAL } from "../../Assets/guns/visualMap.js";
import { towerAppearanceOverrides } from "../../Assets/characters/index.js";
import { createDefaultRenderPorts } from "../../Libraries/Render/defaultRenderPorts.js";
import { createTowerCombatRenderPasses, drawTowerPostSimulationOverlay } from "./render/combatRenderPasses.js";
/** @type {import("../../Core/GameDefinitionTypes.js").InteractionPairsPort} */
export const towerInteractionPairs = towerCombatInteraction;
/** @type {import("../../Core/GameDefinitionTypes.js").RenderPorts} */
export const towerRenderPorts = {
    ...createDefaultRenderPorts({ appearanceOverrides: towerAppearanceOverrides, gunIdToVisual: GUN_ID_TO_VISUAL }),
    simulationEffectPasses: createTowerCombatRenderPasses(),
    drawPostSimulation: drawTowerPostSimulationOverlay,
};

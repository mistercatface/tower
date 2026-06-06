import { towerCombatInteraction } from "./presets/combatInteraction.js";
import * as targeting from "./targeting.js";
import { GUN_ID_TO_VISUAL } from "../../Assets/guns/visualMap.js";
import { towerAppearanceOverrides } from "../../Assets/characters/index.js";
import { createDefaultRenderPorts } from "../../Libraries/Render/defaultRenderPorts.js";
/** @type {import("../../Core/GameDefinitionTypes.js").InteractionPairsPort} */
export const towerInteractionPairs = towerCombatInteraction;
/** @type {import("../../Core/GameDefinitionTypes.js").TargetingPort} */
export const towerTargeting = {
    inferFaction: targeting.inferFaction,
    areHostile: targeting.areHostile,
    getPlayerActors: targeting.getPlayerActors,
    getHostiles: targeting.getHostiles,
    getNearestHostile: targeting.getNearestHostile,
    isValidTurretTarget: targeting.isValidTurretTarget,
};
/** @type {import("../../Core/GameDefinitionTypes.js").RenderPorts} */
export const towerRenderPorts = createDefaultRenderPorts({ appearanceOverrides: towerAppearanceOverrides, gunIdToVisual: GUN_ID_TO_VISUAL });

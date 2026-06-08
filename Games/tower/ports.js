import { towerCombatInteraction } from "./presets/combatInteraction.js";
import { GUN_ID_TO_VISUAL } from "../../Assets/guns/visualMap.js";
import { towerAppearanceOverrides } from "../../Assets/characters/index.js";
import { createDefaultRenderPorts } from "../../Libraries/Render/defaultRenderPorts.js";
import { createTowerCombatRenderPasses, drawTowerPostSimulationOverlay } from "./render/combatRenderPasses.js";
import { createWeaponVisuals } from "../../Libraries/Render/Characters/weapons/createWeaponVisuals.js";
/** @type {import("../../Core/GameDefinitionTypes.js").InteractionPairsPort} */
export const towerInteractionPairs = towerCombatInteraction;
/** @type {import("../../Core/GameDefinitionTypes.js").RenderPorts} */
export const towerRenderPorts = {
    ...createDefaultRenderPorts({ appearanceOverrides: towerAppearanceOverrides, weaponVisuals: createWeaponVisuals(GUN_ID_TO_VISUAL) }),
    simulationEffectPasses: createTowerCombatRenderPasses(),
    drawPostSimulation: (state, viewport, ctx, renderer) => {
        const base = createDefaultRenderPorts();
        base.drawPostSimulation?.(state, viewport, ctx, renderer);
        drawTowerPostSimulationOverlay(state, viewport, ctx, renderer);
    },
};

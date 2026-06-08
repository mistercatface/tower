import { createCombatResolutionFeature } from "./createCombatResolutionFeature.js";
import { createProjectileCombatFeature } from "./createProjectileCombatFeature.js";
import { createSandboxCombatInfraFeature } from "./createSandboxCombatInfraFeature.js";
import { createCombatVfxFeature } from "../Render/createCombatVfxFeature.js";
import { createFloatingTextFeature } from "../Render/createFloatingTextFeature.js";
/**
 * Full sandbox combat stack — one line in `gameDefinition.features`.
 *
 * @param {{ projectileZIndex?: number, explosionZIndex?: number, floatingTextZIndex?: number }} [options]
 * @returns {import("../../Core/GameDefinitionTypes.js").GameFeature[]}
 */
export function createSandboxCombatFeature({ projectileZIndex = 20, explosionZIndex = 60, floatingTextZIndex = 100 } = {}) {
    return [
        createSandboxCombatInfraFeature(),
        createProjectileCombatFeature({ projectileZIndex }),
        createCombatVfxFeature({ explosionZIndex }),
        createCombatResolutionFeature(),
        createFloatingTextFeature({ zIndex: floatingTextZIndex }),
    ];
}

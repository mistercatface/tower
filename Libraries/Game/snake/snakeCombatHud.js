import { findNearestVisibleSnakePrey } from "./snakePredatorPrey.js";
import { getSnakeGameConfig } from "./snakeGameConfig.js";
export function resolvePlayerSnakeCombatHud(playerHeadId, state, registry, autosimsByHeadId) {
    const mode = autosimsByHeadId.get(playerHeadId).getMode();
    const hunting = mode === "seek_prey";
    let hunted = mode === "flee";
    if (!hunted) {
        const visionCone = getSnakeGameConfig().visionCone;
        for (const [headId, autosim] of autosimsByHeadId) {
            if (headId === playerHeadId) continue;
            if (autosim.getMode() !== "seek_prey") continue;
            const hunter = state.entityRegistry.getLive(headId);
            const prey = findNearestVisibleSnakePrey(state, hunter, headId, registry, visionCone);
            if (prey.id === playerHeadId) {
                hunted = true;
                break;
            }
        }
    }
    const foraging = !hunting && !hunted && (mode === "seek_food" || mode === "explore" || mode === "seek");
    return { hunting, hunted, foraging };
}

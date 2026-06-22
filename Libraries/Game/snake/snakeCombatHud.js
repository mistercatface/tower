import { getSnakeGameConfig } from "./snakeGameConfig.js";
import { isAliveAgentHead } from "../agents/agentPopulationRegistry.js";
import { perceiveSnakeIntentWorld } from "./snakeIntent.js";
export function resolveSnakeCombatHud(snakeHeadId, state, registry, autosimsByHeadId) {
    const autosim = autosimsByHeadId.get(snakeHeadId);
    const mode = autosim?.getMode?.() ?? null;
    const hunting = mode === "seek_prey";
    let hunted = mode === "flee";
    if (!hunted) {
        const visionCone = getSnakeGameConfig().visionCone;
        for (const [headId, otherAutosim] of autosimsByHeadId) {
            if (headId === snakeHeadId) continue;
            if (!isAliveAgentHead(registry, headId)) continue;
            if (otherAutosim.getMode?.() !== "seek_prey") continue;
            const hunter = state.entityRegistry.getLive(headId);
            if (!hunter || hunter.isDead) continue;
            const prey = perceiveSnakeIntentWorld(hunter, headId, state, registry, () => null, visionCone).prey;
            if (prey?.id === snakeHeadId) {
                hunted = true;
                break;
            }
        }
    }
    const foraging = !hunting && !hunted && (mode === "seek_food" || mode === "explore" || mode === "seek");
    return { hunting, hunted, foraging };
}

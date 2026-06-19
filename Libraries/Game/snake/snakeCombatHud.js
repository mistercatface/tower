import { isAliveSnakeHead } from "./snakeLifecycle.js";
export function resolvePlayerSnakeCombatHud(playerHeadId, registry, autosimsByHeadId) {
    const playerAutosim = autosimsByHeadId.get(playerHeadId);
    const mode = playerAutosim?.getMode?.() ?? null;
    const hunting = mode === "seek_prey";
    let hunted = mode === "flee";
    if (!hunted)
        for (const [headId, autosim] of autosimsByHeadId) {
            if (headId === playerHeadId) continue;
            if (!isAliveSnakeHead(registry, headId)) continue;
            if (autosim.getMode?.() === "seek_prey" && autosim.getTrackedTargetId?.() === playerHeadId) {
                hunted = true;
                break;
            }
        }
    const foraging = !hunting && !hunted && (mode === "seek_food" || mode === "explore" || mode === "seek");
    return { hunting, hunted, foraging };
}

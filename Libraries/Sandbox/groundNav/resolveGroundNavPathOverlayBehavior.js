import { getSandboxEntityMeta } from "../../../GameState/sandboxEntityMeta.js";
import { appendPathOverlayCommands } from "../../Render/overlays/pathOverlayCommands.js";
import { GROUND_NAV_BEHAVIOR_IDS } from "./groundNavIds.js";

/** @param {object} state @param {object} prop @param {Map<string, { getPathOverlay?: (prop: object) => unknown }>} behaviorById */
export function resolveGroundNavPathOverlayBehavior(state, prop, behaviorById) {
    const activeId = getSandboxEntityMeta(state).getActiveBehaviorId(prop.id);
    if (!activeId || !GROUND_NAV_BEHAVIOR_IDS.has(activeId)) return null;
    const behavior = behaviorById.get(activeId);
    if (!behavior?.getPathOverlay) return null;
    return behavior;
}

/** @param {object[]} out @param {object} state @param {object} prop @param {Map<string, { getPathOverlay?: (prop: object) => unknown }>} behaviorById @param {"off" | "normal" | "debug"} [visual="normal"] */
export function appendPropGroundNavPathOverlay(out, state, prop, behaviorById, visual = "normal") {
    if (visual === "off") return;
    const behavior = resolveGroundNavPathOverlayBehavior(state, prop, behaviorById);
    if (!behavior) return;
    const overlay = behavior.getPathOverlay(prop);
    if (!overlay) return;
    appendPathOverlayCommands(out, overlay, visual);
}

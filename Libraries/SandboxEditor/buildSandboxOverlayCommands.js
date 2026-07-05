import { appendPathOverlayCommands } from "../Render/render.js";
import { appendButtonWireOverlayCommands } from "../Props/props.js";
import { appendChainLinkWireOverlayCommands } from "../Props/props.js";
import { appendKineticConstraintOverlayCommands } from "../Render/render.js";
import { appendMarqueeOverlayCommands, appendSelectionOverlayCommands, queryPropsInView } from "../Render/render.js";
import { selectionPropIds } from "../Sandbox/sandbox.js";
import { resolveSandboxPathVisual } from "../Sandbox/sandbox.js";
import { isChainSteeringTarget } from "../Props/props.js";
import { GROUND_NAV_BEHAVIOR_IDS } from "../Sandbox/sandbox.js";
import { getSandboxEntityMeta } from "../../GameState/sandboxEntityMeta.js";
export function buildSandboxOverlayCommands({
    state,
    session,
    spatialFrame,
    placePreviewWorld,
    marqueeRect,
    behaviorById,
    getPropBehaviorId,
    buttonWireTool,
    chainLinkWireTool,
    resolveBehavior,
    selectedProp,
}) {
    const commands = [];
    const viewport = state.viewport;
    const sel = session.getSelection();
    appendButtonWireOverlayCommands(commands, state, {
        wireFromPropId: buttonWireTool.isActive() ? (session.getSelectedProp()?.id ?? null) : null,
        wireCursor: buttonWireTool.isActive() ? buttonWireTool.getCursor() : null,
    });
    appendChainLinkWireOverlayCommands(commands, state, {
        wireFromPropId: chainLinkWireTool.isActive() ? chainLinkWireTool.getFromPropId() : null,
        wireCursor: chainLinkWireTool.isActive() ? chainLinkWireTool.getCursor() : null,
    });
    let visibleSelectedProps = [];
    if (sel?.kind === "prop") {
        const selectedIds = new Set(selectionPropIds(sel));
        visibleSelectedProps = queryPropsInView(state.entityRegistry, viewport, spatialFrame, { tier: "chunks", filterId: "selectedOverlay", match: (prop) => selectedIds.has(prop.id) });
        for (let i = 0; i < visibleSelectedProps.length; i++) {
            const prop = visibleSelectedProps[i];
            if (!isChainSteeringTarget(state, getSandboxEntityMeta(state), prop.id)) continue;
            const visual = resolveSandboxPathVisual(state, prop);
            if (visual === "off") continue;
            const activeId = getSandboxEntityMeta(state).getActiveBehaviorId(prop.id);
            const isGroundNav = activeId && GROUND_NAV_BEHAVIOR_IDS.has(activeId);
            const behavior = (isGroundNav && behaviorById.get(activeId)) || behaviorById.get(getPropBehaviorId(prop));
            if (!behavior?.getPathOverlay) continue;
            const overlay = behavior.getPathOverlay(prop);
            appendPathOverlayCommands(commands, overlay, state.obstacleGrid, visual);
        }
    }
    appendSelectionOverlayCommands(commands, {
        selectedProps: visibleSelectedProps,
        showRings: state.editor.showSelectionRings,
        selectedFloorIdx: sel?.kind === "floor" ? sel.idx : null,
        selectedVoxelIdx: sel?.kind === "voxel" ? sel.idx : null,
        selectedRailEdge: sel?.kind === "rail" ? { idx: sel.idx, side: sel.side } : null,
        grid: state.obstacleGrid,
    });
    appendMarqueeOverlayCommands(commands, { marqueeRect });
    state.appLaunch?.session?.appendOverlayCommands?.(commands, state, sel);
    const behavior = resolveBehavior();
    if (selectedProp && behavior?.appendOverlayCommands) behavior.appendOverlayCommands(commands, selectedProp);
    return commands;
}

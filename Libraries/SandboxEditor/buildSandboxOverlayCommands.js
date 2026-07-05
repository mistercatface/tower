import { appendPathOverlayCommands } from "../Render/render.js";
import { appendButtonWireOverlayCommands } from "../Sandbox/buttonLinks.js";
import { appendChainLinkWireOverlayCommands } from "../Sandbox/chainLinks.js";
import { appendKineticConstraintOverlayCommands } from "../Sandbox/kineticConstraintOverlays.js";
import { appendMarqueeOverlayCommands, appendSelectionOverlayCommands, queryPropsInView } from "../Sandbox/sandboxOverlayCommands.js";
import { selectionPropIds } from "../Sandbox/sandboxSelectionInspectors.js";
import { resolveSandboxPathVisual } from "../Sandbox/sandboxPropMeta.js";
import { isChainSteeringTarget } from "../Sandbox/chainLinks.js";
import { GROUND_NAV_BEHAVIOR_IDS } from "../Sandbox/sandboxCapabilities.js";
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
        selectedFloorCell: sel?.kind === "floor" ? { col: sel.col, row: sel.row } : null,
        selectedVoxelCell: sel?.kind === "voxel" ? { col: sel.col, row: sel.row } : null,
        selectedRailEdge: sel?.kind === "rail" ? { col: sel.col, row: sel.row, side: sel.side } : null,
        grid: state.obstacleGrid,
    });
    appendMarqueeOverlayCommands(commands, { marqueeRect });
    state.appLaunch?.session?.appendOverlayCommands?.(commands, state, sel);
    const behavior = resolveBehavior();
    if (selectedProp && behavior?.appendOverlayCommands) behavior.appendOverlayCommands(commands, selectedProp);
    return commands;
}

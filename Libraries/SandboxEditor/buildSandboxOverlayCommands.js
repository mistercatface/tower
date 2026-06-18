import { appendPathOverlayCommands } from "../Render/overlays/pathOverlayCommands.js";
import { appendPlacePreviewOverlayCommands, resolveSandboxPlacePreview } from "../Sandbox/drawSandboxPlacePreview.js";
import { appendButtonWireOverlayCommands } from "../Sandbox/buttonLinks.js";
import { appendMarqueeOverlayCommands, appendPropTileCellOverlayCommands, appendSelectionOverlayCommands } from "../Sandbox/sandboxOverlayCommands.js";
import { appendRoomGraphOverlayCommands } from "../RoomGraph/roomGraphOverlayCommands.js";
import { selectionPropIds } from "../Sandbox/sandboxSelectionInspectors.js";
import { resolveSandboxPathVisual } from "../Sandbox/sandboxPropMeta.js";
export function buildSandboxOverlayCommands({
    state,
    session,
    selectionDrawState,
    placePreviewWorld,
    marqueeRect,
    behaviorById,
    getPropBehaviorId,
    buttonWireTool,
    corridorLinkWireTool,
    resolveBehavior,
    selectedProp,
}) {
    const commands = [];
    const sel = session.getSelection();
    appendRoomGraphOverlayCommands(commands, state, state.obstacleGrid, {
        selectedNodeId: sel?.kind === "roomNode" ? sel.id : sel?.kind === "roomLink" ? sel.nodeId : null,
        selectedLinkId: sel?.kind === "roomLink" ? sel.linkId : null,
        wireFromNodeId: corridorLinkWireTool.getFromNodeId(),
        wireCursor: corridorLinkWireTool.getCursor(),
        showRoomNodesAlways: state.editor.showRoomNodesAlways,
        wireModeActive: corridorLinkWireTool.isActive(),
    });
    appendButtonWireOverlayCommands(commands, state, {
        wireFromPropId: buttonWireTool.isActive() ? (session.getSelectedProp()?.id ?? null) : null,
        wireCursor: buttonWireTool.isActive() ? buttonWireTool.getCursor() : null,
    });
    if (placePreviewWorld) {
        const preview = resolveSandboxPlacePreview(state, session, placePreviewWorld.x, placePreviewWorld.y);
        appendPlacePreviewOverlayCommands(commands, preview, state.obstacleGrid);
    }
    if (sel?.kind === "prop") {
        const ids = selectionPropIds(sel);
        for (let i = 0; i < ids.length; i++) {
            const prop = state.entityRegistry.getLive(ids[i]);
            if (!prop) continue;
            const visual = resolveSandboxPathVisual(state, prop);
            if (visual === "off") continue;
            const behavior = behaviorById.get(getPropBehaviorId(prop));
            if (!behavior?.getPathOverlay) continue;
            const overlay = behavior.getPathOverlay(prop);
            appendPathOverlayCommands(commands, overlay, visual);
        }
    }
    const { selectedProps } = selectionDrawState();
    appendSelectionOverlayCommands(commands, {
        selectedProps,
        showRings: state.editor.showSelectionRings,
        selectedFloorCell: sel?.kind === "floor" ? { col: sel.col, row: sel.row } : null,
        selectedVoxelCell: sel?.kind === "voxel" ? { col: sel.col, row: sel.row } : null,
        selectedRailEdge: sel?.kind === "rail" ? { col: sel.col, row: sel.row, side: sel.side } : null,
        grid: state.obstacleGrid,
    });
    appendPropTileCellOverlayCommands(commands, { show: state.editor.showPropTileCells, grid: state.obstacleGrid, worldProps: state.worldProps });
    appendMarqueeOverlayCommands(commands, { marqueeRect });
    const behavior = resolveBehavior();
    if (selectedProp && behavior?.appendOverlayCommands) behavior.appendOverlayCommands(commands, selectedProp);
    return commands;
}

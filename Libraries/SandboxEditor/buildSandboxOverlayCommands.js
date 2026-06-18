import { appendPathOverlayCommands } from "../Render/overlays/pathOverlayCommands.js";
import { appendPlacePreviewOverlayCommands, resolveSandboxPlacePreview } from "../Sandbox/drawSandboxPlacePreview.js";
import { appendButtonWireOverlayCommands } from "../Sandbox/buttonLinks.js";
import { appendKineticConstraintOverlayCommands } from "../Sandbox/kineticConstraintOverlays.js";
import { appendMarqueeOverlayCommands, appendPropTileCellOverlayCommands, appendSelectionOverlayCommands, queryPropsInView } from "../Sandbox/sandboxOverlayCommands.js";
import { appendRoomGraphOverlayCommands } from "../RoomGraph/roomGraphOverlayCommands.js";
import { selectionPropIds } from "../Sandbox/sandboxSelectionInspectors.js";
import { resolveSandboxPathVisual } from "../Sandbox/sandboxPropMeta.js";
export function buildSandboxOverlayCommands({
    state,
    session,
    spatialFrame,
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
    const viewport = state.viewport;
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
    appendKineticConstraintOverlayCommands(commands, state);
    if (placePreviewWorld) {
        const preview = resolveSandboxPlacePreview(state, session, placePreviewWorld.x, placePreviewWorld.y);
        appendPlacePreviewOverlayCommands(commands, preview, state.obstacleGrid);
    }
    let visibleSelectedProps = [];
    if (sel?.kind === "prop") {
        const selectedIds = new Set(selectionPropIds(sel));
        visibleSelectedProps = queryPropsInView(state.entityRegistry, viewport, spatialFrame, {
            bounds: viewport.boundsVisibleWide,
            filterId: "selectedOverlay",
            match: (prop) => selectedIds.has(prop.id),
        });
        for (let i = 0; i < visibleSelectedProps.length; i++) {
            const prop = visibleSelectedProps[i];
            const visual = resolveSandboxPathVisual(state, prop);
            if (visual === "off") continue;
            const behavior = behaviorById.get(getPropBehaviorId(prop));
            if (!behavior?.getPathOverlay) continue;
            const overlay = behavior.getPathOverlay(prop);
            appendPathOverlayCommands(commands, overlay, visual);
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
    appendPropTileCellOverlayCommands(commands, { show: state.editor.showPropTileCells, grid: state.obstacleGrid, entityRegistry: state.entityRegistry, viewport, spatialFrame });
    appendMarqueeOverlayCommands(commands, { marqueeRect });
    const behavior = resolveBehavior();
    if (selectedProp && behavior?.appendOverlayCommands) behavior.appendOverlayCommands(commands, selectedProp);
    return commands;
}

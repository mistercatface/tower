import { findWorldPropAtInView } from "../../GameState/EntityRegistry.js";
import { kineticSpatial } from "../../Systems/World/KineticSpatialFrame.js";
import { FloorBelt } from "../Spatial/grid/FloorCell.js";
export function createSandboxDeletePointerTool(state, session) {
    return {
        isActive: () => true,
        onPointerDown(world, e) {
            if (e.button !== 2) return false;
            if (state.editor.lockSelection) return true;
            if (session.getSelection()?.kind === "prop") return true;
            const registry = state.entityRegistry;
            const hit = findWorldPropAtInView(registry, kineticSpatial, world.x, world.y);
            if (hit) {
                session.deleteProp(hit);
                return true;
            }
            const grid = state.obstacleGrid;
            const idx = grid.worldToIdx(world.x, world.y);
            if (FloorBelt.clearOverlayAt(state, idx)) {
                const sel = session.getSelection();
                if (sel?.kind === "floor" && sel.col === idx % grid.cols && sel.row === ((idx / grid.cols) | 0)) session.clearSelection();
                session.sync();
                return true;
            }
            return false;
        },
    };
}

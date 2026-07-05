import { findWorldPropAtInView } from "../../GameState/EntityRegistry.js";
import { FloorBelt } from "../Spatial/spatial.js";
export function createSandboxDeletePointerTool(state, session) {
    return {
        isActive: () => true,
        onPointerDown(world, e) {
            if (e.button !== 2) return false;
            if (state.editor.lockSelection) return true;
            if (session.getSelection()?.kind === "prop") return true;
            const registry = state.entityRegistry;
            const hit = findWorldPropAtInView(registry, state.spatialFrame, world.x, world.y);
            if (hit) {
                session.deleteProp(hit);
                return true;
            }
            const grid = state.obstacleGrid;
            const idx = grid.worldToIdx(world.x, world.y);
            if (FloorBelt.clearOverlayAt(state, idx)) {
                const sel = session.getSelection();
                if (sel?.kind === "floor" && sel.idx === idx) session.clearSelection();
                session.sync();
                return true;
            }
            return false;
        },
    };
}

import { findWorldPropAtInView } from "../../GameState/EntityRegistry.js";
import { kineticSpatial } from "../../Systems/World/KineticSpatialFrame.js";
import { clearFloorOverlayAt } from "../Sandbox/floorOccupancy.js";
import { pickRoomNodeAt } from "../RoomGraph/index.js";
export function createSandboxDeletePointerTool(state, session, { resolveGroundMove, issueGroundMove }) {
    return {
        isActive: () => true,
        onPointerDown(world, e) {
            if (e.button !== 2) return false;
            const registry = state.entityRegistry;
            const hit = findWorldPropAtInView(registry, kineticSpatial, world.x, world.y);
            if (hit) {
                session.deleteProp(hit);
                return true;
            }
            const grid = state.obstacleGrid;
            const { col, row } = grid.worldToGrid(world.x, world.y);
            const roomNode = pickRoomNodeAt(state, col, row);
            if (roomNode) {
                session.select({ kind: "roomNode", id: roomNode.id });
                session.deleteSelectedRoomNode();
                return true;
            }
            if (clearFloorOverlayAt(state, col, row)) {
                const sel = session.getSelection();
                if (sel?.kind === "floor" && sel.col === col && sel.row === row) session.clearSelection();
                session.sync();
                return true;
            }
            const groundMove = resolveGroundMove();
            if (groundMove) {
                issueGroundMove(groundMove, world);
                session.sync();
            }
            return true;
        },
    };
}

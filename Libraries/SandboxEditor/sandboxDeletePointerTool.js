import { findWorldPropAtInView } from "../../GameState/EntityRegistry.js";
import { combatSpatial } from "../../Systems/World/CombatSpatialFrame.js";
import { clearFloorOverlayAt } from "../Sandbox/floorOccupancy.js";
import { pickRoomNodeAt } from "../RoomGraph/index.js";
export function createSandboxDeletePointerTool(state, session, { resolveGroundMove, issueGroundMove }) {
    return {
        isActive: () => true,
        onPointerDown(world, e) {
            if (e.button !== 2) return false;
            const registry = state.entityRegistry;
            const hit = findWorldPropAtInView(registry, combatSpatial, world.x, world.y);
            if (hit) {
                session.deleteProp(hit);
                return true;
            }
            const grid = state.obstacleGrid;
            const { col, row } = grid.worldToGrid(world.x, world.y);
            const roomNode = pickRoomNodeAt(state, col, row);
            if (roomNode) {
                session.setSelectedRoomNodeId(roomNode.id);
                session.deleteSelectedRoomNode();
                return true;
            }
            if (clearFloorOverlayAt(state, col, row)) {
                const selectedFloor = session.getSelectedFloorCell();
                if (selectedFloor?.col === col && selectedFloor.row === row) session.clearFloorSelection();
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

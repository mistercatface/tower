import { Utilities } from "../../Core/Utilities.js";
import { sampleFlowDirectionOnGrid } from "../../Libraries/Math/pathfinding/sampleFlowDirection.js";

export function steerViaFlowField(entity, targetX, targetY, flowFieldGrid, flowFieldKey) {
    if (flowFieldGrid) {
        const flowField = flowFieldGrid.getFlowField(targetX, targetY);
        if (flowField) {
            const dir = sampleFlowDirectionOnGrid(entity.x, entity.y, flowField, flowFieldGrid);
            if (dir) {
                entity.desiredX = dir.x;
                entity.desiredY = dir.y;
                return "flow";
            }
        }
    }

    Utilities.setDesiredDirection(entity, targetX - entity.x, targetY - entity.y);
    return "direct";
}

import { Utilities } from "../../Core/Utilities.js";

export function steerViaFlowField(entity, targetX, targetY, flowFieldGrid, flowFieldKey) {
    if (flowFieldGrid) {
        const flowField = flowFieldGrid.getFlowField(targetX, targetY);
        if (flowField) {
            const success = flowFieldGrid.sampleDirection(entity.x, entity.y, flowField, entity);
            if (success) return "flow";
        }
    }

    Utilities.setDesiredDirection(entity, targetX - entity.x, targetY - entity.y);
    return "direct";
}

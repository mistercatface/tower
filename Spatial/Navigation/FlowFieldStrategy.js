import { Utilities } from "../../Core/Utilities.js";

export function steerViaFlowField(entity, targetX, targetY, flowFieldGrid, flowFieldKey) {
    const field = flowFieldKey === "player"
        ? flowFieldGrid?.playerFlowField
        : flowFieldGrid?.flowField;

    if (flowFieldGrid && field) {
        const dir = flowFieldGrid.sampleDirection(entity.x, entity.y, field);
        if (dir) {
            entity.desiredX = dir.x;
            entity.desiredY = dir.y;
            return "flow";
        }
    }

    Utilities.setDesiredDirection(entity, targetX - entity.x, targetY - entity.y);
    return "direct";
}

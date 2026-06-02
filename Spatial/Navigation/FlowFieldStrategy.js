import { Utilities } from "../../Core/Utilities.js";

export function steerViaFlowField(entity, targetX, targetY, flowFieldGrid, flowFieldKey) {
    const isPlayerField = flowFieldKey === "player";

    if (flowFieldGrid?.sampleDirection(entity.x, entity.y, isPlayerField, entity)) {
        return "flow";
    }

    Utilities.setDesiredDirection(entity, targetX - entity.x, targetY - entity.y);
    return "direct";
}

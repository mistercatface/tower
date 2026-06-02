export function steerViaFlowField(entity, targetX, targetY, flowFieldGrid, flowFieldKey) {
    const isPlayerField = flowFieldKey === "player";

    if (flowFieldGrid?.sampleDirection(entity.x, entity.y, isPlayerField, entity)) {
        return "flow";
    }

    return null;
}

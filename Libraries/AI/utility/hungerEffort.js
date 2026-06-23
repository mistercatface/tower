export function hungerKey(hungerState) {
    return hungerState?.state ?? "hungry";
}
export function costPerCellForHunger(pressure, hungerState) {
    return pressure.effort.costPerCell[hungerKey(hungerState)];
}
export function foodHungerScoreValue(weights, pressure, hunger) {
    const deficit = hunger ? 1 - hunger.foodFraction : 0;
    return weights.food + pressure.foodHungerBonus * deficit;
}

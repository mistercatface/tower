export function netScoreDetail(value, reach, costPerUnit) {
    const cost = reach == null ? 0 : costPerUnit * reach;
    const net = value - cost;
    return { value, reach, cost, net };
}
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
export function scoreRiskAdjustedFlee(ctx, weights, pressure) {
    if (!ctx.known.threat) return -Infinity;
    const threat = ctx.threatState;
    if (!threat || threat.lethal) return Infinity;
    const hunger = ctx.hungerState;
    const riskTolerance = hunger ? (pressure.riskTolerance[hunger.state] ?? 0) : 0;
    if (riskTolerance <= 0) return Infinity;
    return weights.flee * threat.severity * (1 - riskTolerance);
}
export function pickBestScoreKey(candidateScores, order) {
    let chosenKey = order[0];
    let chosenScore = -Infinity;
    for (const key of order) {
        const score = candidateScores[key];
        if (score > chosenScore) {
            chosenKey = key;
            chosenScore = score;
        }
    }
    return { chosenKey, chosenScore };
}
export function scoreCandidateSet(candidateScoreDetails, order) {
    const candidateScores = {};
    for (const key of order) {
        const detail = candidateScoreDetails[key];
        candidateScores[key] = detail.net;
    }
    const { chosenKey, chosenScore } = pickBestScoreKey(candidateScores, order);
    return { candidateScores, candidateScoreDetails, chosenKey, chosenScore };
}

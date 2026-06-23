export const SCORE_ABSENT = Object.freeze({ net: -Infinity });
const DETAIL_SCRATCH = Array.from({ length: 8 }, () => ({ value: 0, reach: null, cost: 0, net: 0 }));
let detailScratchIndex = 0;
export function resetScoreDetailScratch() {
    detailScratchIndex = 0;
}
export function allocScoreDetail() {
    return DETAIL_SCRATCH[detailScratchIndex++];
}
export function netScoreDetailInto(out, value, reach, costPerUnit) {
    out.value = value;
    out.reach = reach;
    out.cost = reach == null ? 0 : costPerUnit * reach;
    out.net = value - out.cost;
    return out;
}
export function netScoreDetail(value, reach, costPerUnit) {
    return netScoreDetailInto(allocScoreDetail(), value, reach, costPerUnit);
}
export function netScoreOnly(net) {
    const out = allocScoreDetail();
    out.value = 0;
    out.reach = null;
    out.cost = 0;
    out.net = net;
    return out;
}
export function costPerCellForHunger(pressure, hungerTier) {
    return pressure.effort.costPerCell[hungerTier ?? "hungry"];
}
export function foodHungerScoreValue(weights, pressure, foodFraction) {
    const deficit = foodFraction != null ? 1 - foodFraction : 0;
    return weights.food + pressure.foodHungerBonus * deficit;
}
export function scoreRiskAdjustedFlee(ctx, weights, pressure) {
    if (!ctx.known.threat) return -Infinity;
    const threat = ctx.threatState;
    if (!threat || threat.lethal) return Infinity;
    const riskTolerance = ctx.hungerTier ? (pressure.riskTolerance[ctx.hungerTier] ?? 0) : 0;
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

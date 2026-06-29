import { lookupBandTable } from "../agents/AgentDecisionContext.js";
export const SCORE_ABSENT = Object.freeze({ net: -Infinity });
const DETAIL_SCRATCH = Array.from({ length: 32 }, () => ({ value: 0, reach: null, cost: 0, net: 0 }));
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
    return lookupBandTable(pressure.effort.costPerCell, hungerTier);
}
export function foodHungerScoreValue(weights, pressure, foodFraction) {
    const deficit = foodFraction != null ? 1 - foodFraction : 0;
    return weights.food + pressure.foodHungerBonus * deficit;
}
export function scoreRiskAdjustedFlee(ctx, weights, pressure) {
    if (!ctx.known.threat) return -Infinity;
    const threat = ctx.threatState;
    if (!threat || threat.lethal) return Infinity;
    const riskTolerance = ctx.hungerTier ? lookupBandTable(pressure.riskTolerance, ctx.hungerTier) : 0;
    if (riskTolerance <= 0) return Infinity;
    return weights.flee * threat.severity * (1 - riskTolerance);
}
const PICK_BEST_SCRATCH = { chosenKey: null, chosenScore: -Infinity };
export function pickBestScoreKeyInto(out, candidateScores, order) {
    let chosenKey = order[0];
    let chosenScore = -Infinity;
    for (let i = 0; i < order.length; i++) {
        const key = order[i];
        const score = candidateScores[key];
        if (score > chosenScore) {
            chosenKey = key;
            chosenScore = score;
        }
    }
    out.chosenKey = chosenKey;
    out.chosenScore = chosenScore;
    return out;
}
export function pickBestScoreKey(candidateScores, order) {
    return pickBestScoreKeyInto(PICK_BEST_SCRATCH, candidateScores, order);
}
export function scoreCandidateNetsInto(out, candidateScoreDetails, order) {
    for (let i = 0; i < order.length; i++) {
        const key = order[i];
        const detail = candidateScoreDetails[key];
        out[key] = detail ? detail.net : -Infinity;
    }
    return pickBestScoreKey(out, order);
}
export function scoreCandidateSetInto(out, candidateScoreDetails, order) {
    if (!out.candidateScores) out.candidateScores = {};
    for (let i = 0; i < order.length; i++) {
        const key = order[i];
        const detail = candidateScoreDetails[key];
        out.candidateScores[key] = detail ? detail.net : -Infinity;
    }
    const best = pickBestScoreKey(out.candidateScores, order);
    out.candidateScoreDetails = candidateScoreDetails;
    out.chosenKey = best.chosenKey;
    out.chosenScore = best.chosenScore;
    return out;
}
export function scoreCandidateSet(candidateScoreDetails, order) {
    const out = { candidateScores: {}, candidateScoreDetails: null, chosenKey: null, chosenScore: -Infinity };
    return scoreCandidateSetInto(out, candidateScoreDetails, order);
}

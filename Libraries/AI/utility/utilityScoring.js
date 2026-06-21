export function netScoreDetail(value, reach, costPerUnit) {
    const cost = reach == null ? 0 : costPerUnit * reach;
    const net = value - cost;
    return { value, reach, cost, net };
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

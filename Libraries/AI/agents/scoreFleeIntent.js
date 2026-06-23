export function scoreRiskAdjustedFlee(blackboard, weights, pressure) {
    if (!blackboard.facts.known.threat) return -Infinity;
    const threat = blackboard.facts.threatState;
    if (!threat || threat.lethal) return Infinity;
    const hunger = blackboard.facts.hungerState;
    const riskTolerance = hunger ? (pressure.riskTolerance[hunger.state] ?? 0) : 0;
    if (riskTolerance <= 0) return Infinity;
    return weights.flee * threat.severity * (1 - riskTolerance);
}

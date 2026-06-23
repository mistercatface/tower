export function deriveThreatState(visibleThreat, reachSteps, cellSize, config) {
    if (!visibleThreat || reachSteps == null) return null;
    const shared = config.shared ?? config;
    const visionSpec = shared.visionRange ?? {};
    const fleeRange = shared.fleeRange ?? visionSpec.range;
    const fleeRangeCells = Math.ceil(fleeRange / cellSize);
    const lethalThreatRangeCells = Math.ceil(shared.lethalThreatRange / cellSize);
    const severity = Math.max(0, Math.min(1, (fleeRangeCells - reachSteps) / fleeRangeCells));
    return { dist: reachSteps, severity, lethal: reachSteps <= lethalThreatRangeCells };
}

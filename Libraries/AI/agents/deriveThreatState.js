export function deriveThreatState(visibleThreat, reachSteps, cellSize, config) {
    if (!visibleThreat || reachSteps == null) return null;
    const fleeRangeCells = Math.ceil((config.fleeRange ?? config.visionRange.range) / cellSize);
    const lethalThreatRangeCells = Math.ceil(config.lethalThreatRange / cellSize);
    const severity = Math.max(0, Math.min(1, (fleeRangeCells - reachSteps) / fleeRangeCells));
    return { dist: reachSteps, severity, lethal: reachSteps <= lethalThreatRangeCells };
}

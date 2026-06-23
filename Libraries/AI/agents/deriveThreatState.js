import { getSharedConfig } from "../../Game/snake/snakeGameConfig.js";
export function deriveThreatStateInto(out, visibleThreat, reachSteps, cellSize, shared = getSharedConfig()) {
    if (!visibleThreat || reachSteps == null) return null;
    const visionSpec = shared.visionRange ?? {};
    const fleeRange = shared.fleeRange ?? visionSpec.range;
    const fleeRangeCells = Math.ceil(fleeRange / cellSize);
    const lethalThreatRangeCells = Math.ceil(shared.lethalThreatRange / cellSize);
    out.dist = reachSteps;
    out.severity = Math.max(0, Math.min(1, (fleeRangeCells - reachSteps) / fleeRangeCells));
    out.lethal = reachSteps <= lethalThreatRangeCells;
    return out;
}
export function deriveThreatState(visibleThreat, reachSteps, cellSize, shared = getSharedConfig()) {
    const state = deriveThreatStateInto({ dist: 0, severity: 0, lethal: false }, visibleThreat, reachSteps, cellSize, shared);
    return state;
}

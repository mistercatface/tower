import { overlayGridCellHighlight, overlayCachedSelectionRing } from "../../Render/overlays/overlayCommands.js";
const FSM_MODE_RING = {
    explore: "rgba(120, 220, 255, 0.85)",
    seek_food: "rgba(255, 220, 80, 0.9)",
    seek_prey: "rgba(255, 150, 60, 0.9)",
    seek_ally: "rgba(192, 132, 252, 0.9)",
    flee: "rgba(255, 80, 120, 0.9)",
};
function formatScorePart(value) {
    if (value == null) return "—";
    if (!Number.isFinite(value)) return String(value);
    return value.toFixed(1);
}
function formatEffortDebug(decision) {
    const mode = decision?.chosenIntent?.mode;
    const detail = mode ? decision.candidateScoreDetails?.[mode] : null;
    if (!detail || detail.value == null) return "";
    return ` | ${mode}:v${formatScorePart(detail.value)} r${formatScorePart(detail.reach)} c${formatScorePart(detail.cost)} n${formatScorePart(detail.net)}`;
}
export function formatSnakeFsmDebug(snapshot) {
    const dest = snapshot.destCell ? `${snapshot.destCell.col},${snapshot.destCell.row}` : "—";
    const replan = snapshot.replanReason;
    const speed = Math.hypot(snapshot.vx, snapshot.vy).toFixed(1);
    const memory = snapshot.intentMemory;
    const memoryKind = memory?.threat ? "threat" : memory?.prey ? "prey" : memory?.food ? "food" : null;
    const memoryText = memoryKind ? ` | mem=${memoryKind}:${memory[memoryKind].ageTicks}/${memory[memoryKind].ttlTicks}` : "";
    const hunger = snapshot.decision?.hungerState;
    const hungerText = hunger ? ` | ${hunger.state}:${hunger.foodFraction.toFixed(2)}` : "";
    const threat = snapshot.decision?.threatState;
    const threatText = threat ? ` | threat=${threat.severity.toFixed(2)}${threat.lethal ? "!" : ""}` : "";
    const sprint = snapshot.decision?.sprintIntent;
    const sprintText = sprint?.want ? ` | sprint:${sprint.reason}` : "";
    const phaseText = snapshot.navPhase ? ` | nav=${snapshot.navPhase}` : "";
    const commitText = snapshot.routeCommitFrames ? `:${snapshot.routeCommitFrames}` : "";
    const routeText = snapshot.routeId ? ` | route=${snapshot.routeId}:${snapshot.lastAcceptedRouteReason ?? "?"} p${snapshot.lastAcceptedProgressIdx}/${snapshot.lastAcceptedPathLen}` : "";
    const effortText = formatEffortDebug(snapshot.decision);
    return `${snapshot.mode} | ${dest} | plen=${snapshot.pathLen} | ${replan} | v=${speed} | ${snapshot.lastTransition}${phaseText}${commitText}${routeText}${memoryText}${hungerText}${threatText}${sprintText}${effortText}`;
}
export function appendSnakeFsmDebugOverlayCommands(out, state, seeker, snapshot) {
    const grid = state.obstacleGrid;
    const ringColor = FSM_MODE_RING[snapshot.mode];
    out.push(overlayCachedSelectionRing(seeker.x, seeker.y, seeker.radius + 3, { stroke: ringColor, lineWidth: 2 }));
    const dest = snapshot.destCell;
    if (dest) {
        const bounds = grid.getCellBounds(dest.col, dest.row);
        out.push(overlayGridCellHighlight(bounds, grid.cellSize, snapshot.mode, { fill: "rgba(255, 255, 255, 0.06)", stroke: ringColor, lineWidth: 2, dash: [6, 4] }));
    }
}

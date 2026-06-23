import { collectVisibleGridCells } from "./gridCellVision.js";
import { createGridCellVisionSession } from "./gridCellVisionSession.js";
let overlayHeadVisionBuildCount = 0;
export function resetOverlayHeadVisionBuildCount() {
    overlayHeadVisionBuildCount = 0;
}
export function getOverlayHeadVisionBuildCount() {
    return overlayHeadVisionBuildCount;
}
/** Draw-only cell flood — never writes agent vision cache or sim perception counters. */
export function buildOverlayHeadVision(head, navTopology, visionRange) {
    overlayHeadVisionBuildCount++;
    const overlaySession = createGridCellVisionSession();
    const cells = collectVisibleGridCells(navTopology, head.x, head.y, visionRange.range, overlaySession);
    return { cells };
}

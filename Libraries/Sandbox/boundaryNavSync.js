/** Invalidate main-thread nav snapshot after portal hop topology edits (worker sync follows via notify). */
export function syncBoundaryNavIndex(state) {
    state.obstacleGrid.invalidateGridNavSnapshot();
}

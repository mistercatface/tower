export function syncBoundaryNavIndex(state) {
    const grid = state.obstacleGrid;
    grid.boundaryNavEpoch = (grid.boundaryNavEpoch + 1) | 0;
    grid.invalidateGridNavSnapshot();
}

/** Read-only view of worker-baked nav topology. */
export function createWorkerGridNavContextView(hpaPathWorker, grid) {
    const arena = hpaPathWorker.getNavArena();
    return {
        grid,
        get wallRevision() {
            return grid.wallGridRevision;
        },
        get navCardinalOpen() {
            return arena.cardinalOpen;
        },
        get vertexPassability() {
            return arena.vertexPassability;
        },
    };
}

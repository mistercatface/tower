/** Session-frozen tile bake tuning — installed on workers via TileWorkerCoordinator, read during paint. */
let bakeConstants = null;
/** @param {{ cellSize: number, cellsPerChunk: number, surfaceBakeScale: number }} constants */
export function installTileWorkerBakeConstants(constants) {
    bakeConstants = constants;
}
export function getTileWorkerBakeConstants() {
    if (!bakeConstants) throw new Error("Tile worker bake constants not installed");
    return bakeConstants;
}

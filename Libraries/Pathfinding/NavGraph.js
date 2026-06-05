/**
 * Read-only occupancy grid + coordinate mapping consumed by pathfinding algorithms.
 * `Libraries/Spatial/grid/WorldObstacleGrid` implements this shape.
 *
 * @typedef {object} NavGraph
 * @property {number} cols
 * @property {number} rows
 * @property {number} cellSize
 * @property {number} minX
 * @property {number} minY
 * @property {Uint8Array} grid — 0 walkable, 1 blocked
 * @property {(x: number, y: number) => { col: number, row: number }} worldToGrid
 * @property {(col: number, row: number) => { x: number, y: number }} gridToWorld
 * @property {(col: number, row: number) => boolean} isBlocked
 */

/**
 * Segment lookup for path clearance. WorldObstacleGrid also satisfies this.
 *
 * @typedef {NavGraph & object} NavSegmentGraph
 * @property {(entity: { x: number, y: number, radius?: number }) => object[]} getNearbySegments
 * @property {(minX: number, minY: number, maxX: number, maxY: number) => object[]} getSegmentsInBounds
 */

/** @param {NavGraph} navGraph */
export function readNavGrid(navGraph) {
    return {
        grid: navGraph.grid,
        cols: navGraph.cols,
        rows: navGraph.rows,
        minX: navGraph.minX,
        minY: navGraph.minY,
        cellSize: navGraph.cellSize,
    };
}

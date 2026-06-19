import { clampCellBoundsToGrid } from "../DataStructures/CellRect.js";
import { expandNavTopologyBakeBounds } from "../Pathfinding/navTopologySab.js";
import { recomputeNavCardinalOpenInto, recomputeVertexPassabilityInto } from "../Spatial/grid/vertexPassability.js";
export function createGridNavContext(grid) {
    const cellCount = grid.cols * grid.rows;
    const vertCount = (grid.cols + 1) * (grid.rows + 1);
    return { grid, wallRevision: grid.wallGridRevision, navCardinalOpen: new Uint8Array(cellCount), vertexPassability: new Uint8Array(vertCount) };
}
export function resolveNavTopologyBakeBounds(grid, damageBounds) {
    if (!damageBounds) return null;
    const copyBounds = clampCellBoundsToGrid(damageBounds, grid.cols, grid.rows);
    return expandNavTopologyBakeBounds(copyBounds, grid.cols, grid.rows);
}
export function syncGridNavContext(context, grid, damageBounds = null) {
    const cellCount = grid.cols * grid.rows;
    const vertCount = (grid.cols + 1) * (grid.rows + 1);
    if (context.navCardinalOpen.length !== cellCount || context.vertexPassability.length !== vertCount) {
        context.navCardinalOpen = new Uint8Array(cellCount);
        context.vertexPassability = new Uint8Array(vertCount);
        damageBounds = null;
    }
    const bakeBounds = resolveNavTopologyBakeBounds(grid, damageBounds);
    recomputeVertexPassabilityInto(grid, context.vertexPassability, bakeBounds);
    recomputeNavCardinalOpenInto(grid, context.navCardinalOpen, bakeBounds);
    context.grid = grid;
    context.wallRevision = grid.wallGridRevision;
}
export function bakeNavCachesInto(grid, navCardinalOpen, vertexPassability, damageBounds = null) {
    const bakeBounds = resolveNavTopologyBakeBounds(grid, damageBounds);
    recomputeVertexPassabilityInto(grid, vertexPassability, bakeBounds);
    recomputeNavCardinalOpenInto(grid, navCardinalOpen, bakeBounds);
}

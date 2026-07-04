import { cellIsStaticWall, railWallEdgeAt } from "../Spatial/grid/gridCellTopology.js";
import { getRailWallInfo } from "./gridWallEdit.js";
export function createSandboxPlacementOrder(state) {
    let nextPlacementSeq = 1;
    const placementSeqByKey = new Map();
    const propPlacementKey = (id) => `prop:${id}`;
    const floorPlacementKey = (col, row) => `floor:${col},${row}`;
    const voxelPlacementKey = (col, row) => `voxel:${col},${row}`;
    const edgePlacementKey = (kind, col, row, side) => `${kind}:${col},${row},${side}`;
    const touch = (key) => {
        if (!placementSeqByKey.has(key)) placementSeqByKey.set(key, nextPlacementSeq++);
    };
    return {
        propPlacementKey,
        floorPlacementKey,
        voxelPlacementKey,
        edgePlacementKey,
        touchPropPlacement(id) {
            touch(propPlacementKey(id));
        },
        touchFloorPlacement(col, row) {
            touch(floorPlacementKey(col, row));
        },
        touchVoxelPlacement(col, row) {
            touch(voxelPlacementKey(col, row));
        },
        touchEdgePlacement(kind, col, row, side) {
            touch(edgePlacementKey(kind, col, row, side));
        },
        forgetPropPlacement(id) {
            placementSeqByKey.delete(propPlacementKey(id));
        },
        forgetFloorPlacement(col, row) {
            placementSeqByKey.delete(floorPlacementKey(col, row));
        },
        forgetVoxelPlacement(col, row) {
            placementSeqByKey.delete(voxelPlacementKey(col, row));
        },
        forgetEdgePlacement(kind, col, row, side) {
            placementSeqByKey.delete(edgePlacementKey(kind, col, row, side));
        },
        resetPlacementOrder() {
            placementSeqByKey.clear();
            nextPlacementSeq = 1;
        },
        placementSeq(key, fallback) {
            return placementSeqByKey.get(key) ?? fallback;
        },
        listTrackedVoxelWalls() {
            const grid = state.obstacleGrid;
            const placed = [];
            for (const key of placementSeqByKey.keys()) {
                if (!key.startsWith("voxel:")) continue;
                const coords = key.slice(6);
                const comma = coords.indexOf(",");
                const col = Number(coords.slice(0, comma));
                const row = Number(coords.slice(comma + 1));
                if (!cellIsStaticWall(grid, row * grid.cols + col)) continue;
                const heightLevel = grid.grid[row * grid.cols + col];
                placed.push({ col, row, heightLevel, label: `Voxel · (${col},${row}) · height ${heightLevel}` });
            }
            placed.sort((a, b) => this.placementSeq(voxelPlacementKey(a.col, a.row), 0) - this.placementSeq(voxelPlacementKey(b.col, b.row), 0));
            return placed;
        },
        listTrackedRailWalls() {
            const grid = state.obstacleGrid;
            const placed = [];
            const prefix = "rail:";
            for (const key of placementSeqByKey.keys()) {
                if (!key.startsWith(prefix)) continue;
                const parts = key.slice(prefix.length).split(",");
                const col = Number(parts[0]);
                const row = Number(parts[1]);
                const side = Number(parts[2]);
                const idx = row * grid.cols + col;
                if (!railWallEdgeAt(grid, idx, side)) continue;
                const info = getRailWallInfo(grid, idx, side);
                if (!info) continue;
                placed.push({ col, row, side, heightLevel: info.heightLevel, thicknessLevel: info.thicknessLevel, label: `Rail · (${col},${row}) · ${info.sideLabel} · height ${info.heightLevel}` });
            }
            placed.sort((a, b) => this.placementSeq(edgePlacementKey("rail", a.col, a.row, a.side), 0) - this.placementSeq(edgePlacementKey("rail", b.col, b.row, b.side), 0));
            return placed;
        },
    };
}

import {  cellIsStaticWall, railWallEdgeAt  } from "../Spatial/spatial.js";
import { getRailWallInfo } from "../Spatial/spatial.js";
export function createSandboxPlacementOrder(state) {
    let nextPlacementSeq = 1;
    const placementSeqByKey = new Map();
    const propPlacementKey = (id) => `prop:${id}`;
    const floorPlacementKey = (idx) => `floor:${idx}`;
    const voxelPlacementKey = (idx) => `voxel:${idx}`;
    const edgePlacementKey = (kind, idx, side) => `${kind}:${idx},${side}`;
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
        touchFloorPlacement(idx) {
            touch(floorPlacementKey(idx));
        },
        touchVoxelPlacement(idx) {
            touch(voxelPlacementKey(idx));
        },
        touchEdgePlacement(kind, idx, side) {
            touch(edgePlacementKey(kind, idx, side));
        },
        forgetPropPlacement(id) {
            placementSeqByKey.delete(propPlacementKey(id));
        },
        forgetFloorPlacement(idx) {
            placementSeqByKey.delete(floorPlacementKey(idx));
        },
        forgetVoxelPlacement(idx) {
            placementSeqByKey.delete(voxelPlacementKey(idx));
        },
        forgetEdgePlacement(kind, idx, side) {
            placementSeqByKey.delete(edgePlacementKey(kind, idx, side));
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
                const idx = Number(key.slice(6));
                if (!cellIsStaticWall(grid, idx)) continue;
                const heightLevel = grid.grid[idx];
                placed.push({ heightLevel, label: `Voxel · idx ${idx} · height ${heightLevel}`, idx });
            }
            placed.sort((a, b) => this.placementSeq(voxelPlacementKey(a.idx), 0) - this.placementSeq(voxelPlacementKey(b.idx), 0));
            return placed;
        },
        listTrackedRailWalls() {
            const grid = state.obstacleGrid;
            const placed = [];
            const prefix = "rail:";
            for (const key of placementSeqByKey.keys()) {
                if (!key.startsWith(prefix)) continue;
                const parts = key.slice(prefix.length).split(",");
                const idx = Number(parts[0]);
                const side = Number(parts[1]);
                if (!railWallEdgeAt(grid, idx, side)) continue;
                const info = getRailWallInfo(grid, idx, side);
                if (!info) continue;
                placed.push({
                    side,
                    heightLevel: info.heightLevel,
                    thicknessLevel: info.thicknessLevel,
                    label: `Rail · idx ${idx} · ${info.sideLabel} · height ${info.heightLevel}`,
                    idx,
                });
            }
            placed.sort((a, b) => this.placementSeq(edgePlacementKey("rail", a.idx, a.side), 0) - this.placementSeq(edgePlacementKey("rail", b.idx, b.side), 0));
            return placed;
        },
    };
}

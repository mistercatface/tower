import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";
import { colRowToIndex } from "../Libraries/Spatial/grid/GridUtils.js";
import { gridNavCacheKey } from "../Libraries/Spatial/grid/gridNavEpoch.js";
import { drawProjectedWallFaceScalars } from "../Libraries/Render/Structure3D/ProjectedWallDraw.js";
import { resolveCellSurfaceProfileId, resolveChunkSurfaceProfileId, resolveEdgeSurfaceProfileId } from "../Libraries/Spatial/grid/SurfaceMaterialStore.js";

function createPathOnlyContext() {
    return {
        beginPath() {},
        moveTo() {},
        lineTo() {},
        closePath() {},
        save() {},
        clip() {},
        restore() {},
        fill() {},
        set fillStyle(value) {
            this._fillStyle = value;
        },
        get fillStyle() {
            return this._fillStyle;
        },
    };
}

describe("surface material stores", () => {
    it("resolve to the base profile unless a sparse override exists", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 64, 64);
        const idx = colRowToIndex(1, 1, grid.cols);
        assert.equal(resolveCellSurfaceProfileId(grid, idx, "base"), "base");
        assert.equal(resolveEdgeSurfaceProfileId(grid, 1, 1, 2, "base"), "base");
        grid.setCellSurfaceProfileAtIdx(idx, "cell-profile");
        grid.setEdgeSurfaceProfile(1, 1, 2, "edge-profile");
        assert.equal(resolveCellSurfaceProfileId(grid, idx, "base"), "cell-profile");
        assert.equal(resolveEdgeSurfaceProfileId(grid, 1, 1, 2, "base"), "edge-profile");
        assert.equal(resolveEdgeSurfaceProfileId(grid, 1, 2, 0, "base"), "edge-profile");
    });

    it("material revisions do not change nav topology keys", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 64, 64);
        const navKey = gridNavCacheKey(grid);
        const materialRevision = grid.surfaceMaterialRevision;
        grid.setEdgeSurfaceProfile(1, 1, 0, "rust");
        assert.equal(gridNavCacheKey(grid), navKey);
        assert.notEqual(grid.surfaceMaterialRevision, materialRevision);
    });

    it("remaps material-only cells and edges when grid bounds expand", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 32, 32);
        grid.setCellSurfaceProfileAtIdx(colRowToIndex(0, 0, grid.cols), "cell-profile");
        grid.setEdgeSurfaceProfile(1, 1, 2, "edge-profile");
        grid.expandToCoverAabb({ minX: -32, minY: -16, maxX: 16, maxY: 16 });
        assert.equal(resolveCellSurfaceProfileId(grid, colRowToIndex(1, 0, grid.cols), "base"), "cell-profile");
        assert.equal(resolveEdgeSurfaceProfileId(grid, 2, 1, 2, "base"), "edge-profile");
    });

    it("uses resolved edge profile ids for rail wall atlas selection", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 64, 64);
        grid.setEdgeSurfaceProfile(1, 1, 1, "edge-profile");
        let capturedProfileId = null;
        const state = {
            obstacleGrid: grid,
            worldSurfaces: {
                activeSurfaceProfileId: "base",
                settings: { floorShadow: "#000", cellsPerChunk: 8 },
                getOrEnsureWallAtlas(_p1, _p2, options) {
                    capturedProfileId = options.profileId;
                    return null;
                },
            },
        };
        const viewport = { x: 0, y: 0, cameraHeight: 256, perspectiveStrength: 1 };
        const face = {
            gridCol: 1,
            gridRow: 1,
            gridSide: 1,
            gridIdx: colRowToIndex(1, 1, grid.cols),
            isEdgeRail: true,
            wallHeight: 16,
            wallBaseZ: 0,
            wallCapHeight: 16,
            cacheObj: null,
        };
        drawProjectedWallFaceScalars(createPathOnlyContext(), 0, 0, 16, 0, viewport, state, face);
        assert.equal(capturedProfileId, "edge-profile");
    });

    it("uses resolved cell profile ids for voxel wall atlas selection", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 64, 64);
        const idx = colRowToIndex(1, 1, grid.cols);
        grid.setCellSurfaceProfileAtIdx(idx, "cell-profile");
        grid.setEdgeSurfaceProfile(1, 1, 1, "edge-profile");
        let capturedProfileId = null;
        const state = {
            obstacleGrid: grid,
            worldSurfaces: {
                activeSurfaceProfileId: "base",
                settings: { floorShadow: "#000", cellsPerChunk: 8 },
                getOrEnsureWallAtlas(_p1, _p2, options) {
                    capturedProfileId = options.profileId;
                    return null;
                },
            },
        };
        const viewport = { x: 0, y: 0, cameraHeight: 256, perspectiveStrength: 1 };
        const face = {
            gridCol: 1,
            gridRow: 1,
            gridSide: 1,
            gridIdx: idx,
            isEdgeRail: false,
            wallHeight: 16,
            wallBaseZ: 0,
            wallCapHeight: 16,
            cacheObj: null,
        };
        drawProjectedWallFaceScalars(createPathOnlyContext(), 0, 0, 16, 0, viewport, state, face);
        assert.equal(capturedProfileId, "cell-profile");
    });

    it("falls back to the chunk profile for walls with no cell override", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 256, 256);
        grid.setChunkSurfaceProfile(1, 1, "chunk-profile");
        let capturedProfileId = null;
        const state = {
            obstacleGrid: grid,
            worldSurfaces: {
                activeSurfaceProfileId: "base",
                settings: { floorShadow: "#000", cellsPerChunk: 8 },
                getOrEnsureWallAtlas(_p1, _p2, options) {
                    capturedProfileId = options.profileId;
                    return null;
                },
            },
        };
        const viewport = { x: 0, y: 0, cameraHeight: 256, perspectiveStrength: 1 };
        const face = {
            gridCol: 9,
            gridRow: 9,
            gridSide: 1,
            gridIdx: colRowToIndex(9, 9, grid.cols),
            isEdgeRail: false,
            wallHeight: 16,
            wallBaseZ: 0,
            wallCapHeight: 16,
            cacheObj: null,
        };
        drawProjectedWallFaceScalars(createPathOnlyContext(), 0, 0, 16, 0, viewport, state, face);
        assert.equal(capturedProfileId, "chunk-profile");
    });

    it("resolves chunk profiles and supports range assignment", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 128, 128);
        assert.equal(resolveChunkSurfaceProfileId(grid, 0, 0, "base"), "base");
        grid.setChunkSurfaceProfile(0, 0, "north");
        grid.setChunkSurfaceProfileRange({ startCol: 0, endCol: 3, startRow: 2, endRow: 3 }, "south");
        assert.equal(resolveChunkSurfaceProfileId(grid, 0, 0, "base"), "north");
        assert.equal(resolveChunkSurfaceProfileId(grid, 1, 2, "base"), "south");
        assert.equal(resolveChunkSurfaceProfileId(grid, 0, 1, "base"), "base");
        grid.clearChunkSurfaceProfile(0, 0);
        assert.equal(resolveChunkSurfaceProfileId(grid, 0, 0, "base"), "base");
    });

    it("remaps chunk profiles when grid bounds expand", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 128, 128);
        grid.setChunkSurfaceProfile(0, 0, "chunk-profile", 8);
        grid.expandToCoverAabb({ minX: -192, minY: -192, maxX: 64, maxY: 64 });
        assert.equal(resolveChunkSurfaceProfileId(grid, 0, 0, "base"), "base");
        assert.equal(resolveChunkSurfaceProfileId(grid, 1, 1, "base"), "chunk-profile");
    });

    it("bumps material revision when chunk profiles change", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 64, 64);
        const revision = grid.surfaceMaterialRevision;
        grid.setChunkSurfaceProfile(0, 0, "north");
        assert.notEqual(grid.surfaceMaterialRevision, revision);
    });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {  WorldObstacleGrid  } from "../Libraries/Spatial/spatial.js";
import { worldIdxAtCell } from "./harness/testGridUtils.js";
import {  gridNavCacheKey  } from "../Libraries/Spatial/spatial.js";
import { drawProjectedWallFaceScalars } from "../Libraries/Render/render.js";
import {  resolveCellSurfaceProfileId, resolveChunkSurfaceProfileIdAtKey, resolveEdgeSurfaceProfileId, packChunkKey  } from "../Libraries/Spatial/spatial.js";
import { minCornerAabbF32 } from "../Libraries/Math/math.js";
import { ENGINE_F32, ENGINE_BOUNDS_BASE, B_TMP } from "../Core/engineMemory.js";

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
        const idx = worldIdxAtCell(grid,1, 1);
        assert.equal(resolveCellSurfaceProfileId(grid, idx, "base"), "base");
        assert.equal(resolveEdgeSurfaceProfileId(grid, worldIdxAtCell(grid,1, 1), 2, "base"), "base");
        grid.setCellSurfaceProfileAtIdx(idx, "cell-profile");
        grid.setEdgeSurfaceProfile(idx, 2, "edge-profile");
        assert.equal(resolveCellSurfaceProfileId(grid, idx, "base"), "cell-profile");
        assert.equal(resolveEdgeSurfaceProfileId(grid, worldIdxAtCell(grid,1, 1), 2, "base"), "edge-profile");
        assert.equal(resolveEdgeSurfaceProfileId(grid, worldIdxAtCell(grid,1, 2), 0, "base"), "edge-profile");
    });

    it("material revisions do not change nav topology keys", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 64, 64);
        const navKey = gridNavCacheKey(grid);
        const materialRevision = grid.surfaceMaterialRevision;
        grid.setEdgeSurfaceProfile(worldIdxAtCell(grid,1, 1), 0, "rust");
        assert.equal(gridNavCacheKey(grid), navKey);
        assert.notEqual(grid.surfaceMaterialRevision, materialRevision);
    });

    it("remaps material-only cells and edges when grid bounds expand", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 32, 32);
        grid.setCellSurfaceProfileAtIdx(worldIdxAtCell(grid,0, 0), "cell-profile");
        grid.setEdgeSurfaceProfile(worldIdxAtCell(grid,1, 1), 2, "edge-profile");
        minCornerAabbF32(ENGINE_F32, ENGINE_BOUNDS_BASE + B_TMP, -32, -16, 48, 32);
        grid.expandToCoverAabbF32(ENGINE_F32, ENGINE_BOUNDS_BASE + B_TMP);
        assert.equal(resolveCellSurfaceProfileId(grid, worldIdxAtCell(grid,1, 0), "base"), "cell-profile");
        assert.equal(resolveEdgeSurfaceProfileId(grid, worldIdxAtCell(grid,2, 1), 2, "base"), "edge-profile");
    });

    it("uses resolved edge profile ids for rail wall atlas selection", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 64, 64);
        grid.setEdgeSurfaceProfile(worldIdxAtCell(grid,1, 1), 1, "edge-profile");
        let capturedProfileId = null;
        const state = {
            obstacleGrid: grid,
            worldSurfaces: {
                activeSurfaceProfileId: "base",
                settings: { floorShadow: "#000", cellsPerChunk: 8 },
                getOrEnsureWallAtlasScalars(_p1, _p2, _p3, _p4, profileId) {
                    capturedProfileId = profileId;
                    return null;
                },
            },
        };
        const viewport = { x: 0, y: 0, cameraHeight: 256, perspectiveStrength: 1 };
        const face = {
            gridCol: 1,
            gridRow: 1,
            gridSide: 1,
            gridIdx: worldIdxAtCell(grid,1, 1),
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
        const idx = worldIdxAtCell(grid,1, 1);
        grid.setCellSurfaceProfileAtIdx(idx, "cell-profile");
        grid.setEdgeSurfaceProfile(worldIdxAtCell(grid,1, 1), 1, "edge-profile");
        let capturedProfileId = null;
        const state = {
            obstacleGrid: grid,
            worldSurfaces: {
                activeSurfaceProfileId: "base",
                settings: { floorShadow: "#000", cellsPerChunk: 8 },
                getOrEnsureWallAtlasScalars(_p1, _p2, _p3, _p4, profileId) {
                    capturedProfileId = profileId;
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
        grid.setChunkSurfaceProfileAtKey(packChunkKey(1, 1), "chunk-profile");
        let capturedProfileId = null;
        const state = {
            obstacleGrid: grid,
            worldSurfaces: {
                activeSurfaceProfileId: "base",
                settings: { floorShadow: "#000", cellsPerChunk: 8 },
                getOrEnsureWallAtlasScalars(_p1, _p2, _p3, _p4, profileId) {
                    capturedProfileId = profileId;
                    return null;
                },
            },
        };
        const viewport = { x: 0, y: 0, cameraHeight: 256, perspectiveStrength: 1 };
        const face = {
            gridCol: 9,
            gridRow: 9,
            gridSide: 1,
            gridIdx: worldIdxAtCell(grid,9, 9),
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
        assert.equal(resolveChunkSurfaceProfileIdAtKey(grid, packChunkKey(0, 0), "base"), "base");
        grid.setChunkSurfaceProfileAtKey(packChunkKey(0, 0), "north");
        grid.setChunkSurfaceProfileForCellBounds({ startCol: 0, endCol: 31, startRow: 16, endRow: 31 }, "south", 8);
        assert.equal(resolveChunkSurfaceProfileIdAtKey(grid, packChunkKey(0, 0), "base"), "north");
        assert.equal(resolveChunkSurfaceProfileIdAtKey(grid, packChunkKey(1, 2), "base"), "south");
        assert.equal(resolveChunkSurfaceProfileIdAtKey(grid, packChunkKey(0, 1), "base"), "base");
        grid.clearChunkSurfaceProfileAtKey(packChunkKey(0, 0));
        assert.equal(resolveChunkSurfaceProfileIdAtKey(grid, packChunkKey(0, 0), "base"), "base");
    });

    it("remaps chunk profiles when grid bounds expand", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 128, 128);
        grid.setChunkSurfaceProfileAtKey(packChunkKey(0, 0), "chunk-profile", 8);
        minCornerAabbF32(ENGINE_F32, ENGINE_BOUNDS_BASE + B_TMP, -192, -192, 256, 256);
        grid.expandToCoverAabbF32(ENGINE_F32, ENGINE_BOUNDS_BASE + B_TMP);
        assert.equal(resolveChunkSurfaceProfileIdAtKey(grid, packChunkKey(0, 0), "base"), "base");
        assert.equal(resolveChunkSurfaceProfileIdAtKey(grid, packChunkKey(1, 1), "base"), "chunk-profile");
    });

    it("bumps material revision when chunk profiles change", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 64, 64);
        const revision = grid.surfaceMaterialRevision;
        grid.setChunkSurfaceProfileAtKey(packChunkKey(0, 0), "north");
        assert.notEqual(grid.surfaceMaterialRevision, revision);
    });
});

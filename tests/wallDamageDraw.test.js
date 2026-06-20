import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    createGridWallDamageSession,
    resolveWallDamageTintRatio,
    resolveWallDamageTintRatioForDrawable,
} from "../Libraries/Sandbox/gridWallDamage.js";
import { invalidateWallDamageDraw } from "../Libraries/Sandbox/wallDamageInvalidation.js";
import { wallDamageMultiplyFillStyle } from "../Libraries/Render/Structure3D/wallDamageDraw.js";
import { wallGridDrawCacheHit } from "../Libraries/Render/Structure3D/StaticGridWallDraw.js";
import { createAabb } from "../Libraries/Math/Aabb2D.js";
import { WorldObstacleGrid } from "../Libraries/Spatial/grid/WorldObstacleGrid.js";

describe("wall damage draw (PR 5)", () => {
    it("resolveWallDamageTintRatio maps hp to white→red blend", () => {
        const session = createGridWallDamageSession(100);
        session.entries.set("v:2,2", { kind: "voxel", col: 2, row: 2, hp: 100 });
        assert.equal(resolveWallDamageTintRatio(session, { kind: "voxel", col: 2, row: 2 }), 0);
        session.entries.set("v:2,2", { kind: "voxel", col: 2, row: 2, hp: 55 });
        assert.ok(Math.abs(resolveWallDamageTintRatio(session, { kind: "voxel", col: 2, row: 2 }) - 0.45) < 0.001);
        session.entries.set("v:2,2", { kind: "voxel", col: 2, row: 2, hp: 0 });
        assert.equal(resolveWallDamageTintRatio(session, { kind: "voxel", col: 2, row: 2 }), 1);
    });

    it("resolveWallDamageTintRatioForDrawable picks rail vs voxel drawable shape", () => {
        const session = createGridWallDamageSession(100);
        session.entries.set("r:3,4:1", { kind: "rail", col: 3, row: 4, side: 1, hp: 50 });
        const railDrawable = { gridCol: 3, gridRow: 4, gridSide: 1, innerP1x: 0 };
        const voxelDrawable = { gridCol: 3, gridRow: 4, gridSide: 1, p1: { x: 0, y: 0 } };
        assert.equal(resolveWallDamageTintRatioForDrawable(session, railDrawable), 0.5);
        assert.equal(resolveWallDamageTintRatioForDrawable(session, voxelDrawable), 0);
    });

    it("wallDamageMultiplyFillStyle lerps toward red", () => {
        assert.equal(wallDamageMultiplyFillStyle(0), "rgb(255,255,255)");
        assert.equal(wallDamageMultiplyFillStyle(1), "rgb(255,0,0)");
    });

    it("invalidateWallDamageDraw bumps damage revision used by wall draw cache", () => {
        const grid = new WorldObstacleGrid(16);
        grid.rebuildFixed(0, 0, 128, 128);
        const session = createGridWallDamageSession(100);
        const state = {
            obstacleGrid: grid,
            sandbox: { gridWallDamage: { session, commit: { flush() {} }, config: { maxHp: 100 } } },
            worldSurfaces: { invalidateGridBounds() {} },
        };
        const bounds = { startCol: 1, endCol: 2, startRow: 1, endRow: 2 };
        const wallGridRevision = grid.wallGridRevision;
        const viewportBounds = createAabb(grid.minX, grid.minY, grid.minX + 32, grid.minY + 32);
        const cache = {
            grid,
            wallGridRevision,
            wallDamageRevision: 0,
            boundsMinX: viewportBounds.minX,
            boundsMaxX: viewportBounds.maxX,
            boundsMinY: viewportBounds.minY,
            boundsMaxY: viewportBounds.maxY,
            gridCols: grid.cols,
            gridRows: grid.rows,
        };
        assert.ok(wallGridDrawCacheHit(cache, grid, wallGridRevision, viewportBounds, 0));
        invalidateWallDamageDraw(state, bounds);
        assert.equal(session.damageRevision, 1);
        assert.ok(!wallGridDrawCacheHit(cache, grid, wallGridRevision, viewportBounds, 1));
    });
});

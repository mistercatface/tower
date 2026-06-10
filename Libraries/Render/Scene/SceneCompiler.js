import { RenderableWallFace, RenderableRoofCap } from "./Renderables.js";
import { getSegmentFootprintCorners } from "../../Spatial/geometry/WallGeometry.js";
import { getWallHeight } from "../../WorldSurface/WorldSurfaceSettings.js";
export class SceneCompiler {
    /**
     * @param {import("../../GameState/GameState.js").GameState} state
     * @param {import("./RenderScene.js").RenderScene} scene
     * @param {number} [gridMinX]
     * @param {number} [gridMinY]
     */
    static compileWalls(state, scene, gridMinX = state.obstacleGrid.minX, gridMinY = state.obstacleGrid.minY) {
        scene.setGridOrigin(gridMinX, gridMinY);
        const defaultWallHeight = getWallHeight(state.worldSurfaces.settings);
        for (const wall of state.walls) {
            if (wall.isDead) continue;
            SceneCompiler.compileWall(wall, scene, defaultWallHeight);
        }
    }
    /** @param {object} wall @param {import("./RenderScene.js").RenderScene} scene @param {number} defaultWallHeight */
    static compileWall(wall, scene, defaultWallHeight) {
        const wallHeight = wall.wallHeight ?? defaultWallHeight;
        const sourceId = wall.id ?? wall;
        const corners = getSegmentFootprintCorners(wall);
        for (let i = 0; i < 4; i++) {
            const p1 = corners[i];
            const p2 = corners[(i + 1) % 4];
            const cx = (p1.x + p2.x) / 2;
            const cy = (p1.y + p2.y) / 2;
            const renderableWall = new RenderableWallFace(sourceId, p1, p2, wallHeight, i, { cx, cy, outX: cx - wall.x, outY: cy - wall.y });
            renderableWall.simWall = wall;
            scene.insert(renderableWall);
        }
        if (wall.wallHeight != null) {
            const renderableRoof = new RenderableRoofCap(sourceId, wall.wallHeight, corners);
            renderableRoof.simWall = wall;
            scene.insert(renderableRoof);
        }
    }
}

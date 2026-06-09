import { RenderableWallFace, RenderableRoofCap } from "./Renderables.js";
import { computeProjectedFace } from "../Structure3D/ProjectedWallDraw.js";
import { getSegmentFootprintCorners } from "../../Spatial/geometry/WallGeometry.js";
import { getWallHeight } from "../../WorldSurface/WorldSurfaceSettings.js";

export class SceneCompiler {
    /**
     * @param {import("../../GameState/GameState.js").GameState} state
     * @param {import("./RenderScene.js").RenderScene} scene
     */
    static compileWalls(state, scene) {
        const settings = state.worldSurfaces.settings;
        const defaultWallHeight = getWallHeight(settings);
        const viewerX = 0; // We project relative to origin, camera handles translation
        const viewerY = 0;

        for (const wall of state.walls) {
            if (wall.isDead) continue;

            const wallHeight = wall.wallHeight ?? defaultWallHeight;
            
            // 1. Pre-calculate the isometric wall face
            // We project relative to the wall's center to keep the math happy
            const cx = (wall.x + (wall.x + Math.cos(wall.angle) * wall.size)) / 2;
            const cy = (wall.y + (wall.y + Math.sin(wall.angle) * wall.size)) / 2;
            
            const p1 = { x: wall.x, y: wall.y };
            const p2 = { x: wall.x + Math.cos(wall.angle) * wall.size, y: wall.y + Math.sin(wall.angle) * wall.size };
            
            const face = computeProjectedFace(p1, p2, cx, cy, wallHeight, settings);
            
            const renderableWall = new RenderableWallFace(
                wall.id ?? wall, // If walls don't have string IDs, use the reference
                p1, p2, 
                { x: face.proj1X, y: face.proj1Y }, 
                { x: face.proj2X, y: face.proj2Y },
                wallHeight
            );
            
            // Store a reference to the simulation wall for now so we can still draw damage/textures
            renderableWall.simWall = wall; 
            scene.insert(renderableWall);

            // 2. Pre-calculate the roof cap (if it's not an infiniwall)
            if (wall.wallHeight != null) {
                const corners = getSegmentFootprintCorners(wall);
                const renderableRoof = new RenderableRoofCap(wall.id ?? wall, wall.wallHeight, corners);
                renderableRoof.simWall = wall;
                scene.insert(renderableRoof);
            }
        }
    }
}

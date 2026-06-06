import { SURFACE_PROFILE_ID } from "../../../Config/procedural/profileIds.js";
export const towerSurfaceProfileId = SURFACE_PROFILE_ID.tomatoGarden;
/** Tower roguelike map — strategy → felt/profile lookup for world-surface bakes. */
export const towerProceduralDesign = {
    surfaceProfileId: towerSurfaceProfileId,
    surfaceProfileByStrategy: {
        StartGameBuildingStrategy: towerSurfaceProfileId,
        MazeStrategy: towerSurfaceProfileId,
        Maze2Strategy: towerSurfaceProfileId,
        DenseMazeStrategy: towerSurfaceProfileId,
        SquareStrategy: towerSurfaceProfileId,
        GeometricStrategy: towerSurfaceProfileId,
        FortressStrategy: towerSurfaceProfileId,
        HoneycombStrategy: towerSurfaceProfileId,
        DiamondStrategy: towerSurfaceProfileId,
    },
};

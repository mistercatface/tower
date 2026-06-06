export const START_STATION_ID = "tomatoGarden";

export const defaultSurfaceProfileId = START_STATION_ID;

export const startSurfaceProfileId = START_STATION_ID;

/** Global strategy → profile map (tower / shared generator strategies). */
export const surfaceProfileByStrategy = {
    StartGameBuildingStrategy: START_STATION_ID,
    MazeStrategy: START_STATION_ID,
    Maze2Strategy: START_STATION_ID,
    DenseMazeStrategy: START_STATION_ID,
    SquareStrategy: START_STATION_ID,
    GeometricStrategy: START_STATION_ID,
    FortressStrategy: START_STATION_ID,
    HoneycombStrategy: START_STATION_ID,
    DiamondStrategy: START_STATION_ID,
};

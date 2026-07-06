import { createDefaultMapGenBoundsConfig, createMapGenBoundsAabbCache } from "../../Libraries/Spatial/spatial.js";
export function createLabMapBoundsPreview() {
    return { cavern: createMapGenBoundsAabbCache(), rail: createMapGenBoundsAabbCache(), railMaze: createMapGenBoundsAabbCache(), erase: createMapGenBoundsAabbCache() };
}
/** Tilelab editor UI and map-authoring state — not used by sandbox sim logic. */
export class TileLabEditorState {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.mapBoundsPreview = createLabMapBoundsPreview();
        this.playConfig = { playAreaCols: 128, playAreaRows: 128 };
        this.cavernConfig = { ...createDefaultMapGenBoundsConfig(), fillChance: 0.45, iterations: 3, wallHeightLevel: 9, surfaceProfileId: "tomatoGarden" };
        this.railConfig = { ...createDefaultMapGenBoundsConfig(), fillChance: 0.45, iterations: 3, wallHeightLevel: 9, edgeThickness: 2, surfaceProfileId: "poolTableFelt" };
        this.railMazeConfig = { ...createDefaultMapGenBoundsConfig(), wallHeightLevel: 1, edgeThickness: 1, corridorWidthMin: 1, corridorWidthMax: 2, extraLinkRatio: 0.25, surfaceProfileId: "cyberGrid" };
        this.eraseConfig = createDefaultMapGenBoundsConfig();
        this.sidebarPanel = "sandbox";
        this.showMapOverview = true;
        this.showSelectionRings = false;
        this.lockSelection = false;
        this.navWalkableCellsCache = null;
    }
}

import { createDefaultMapGenBoundsConfig, createMapGenBoundsAabbCache } from "../../../Libraries/Sandbox/mapGenBounds.js";
export function createLabMapBoundsPreview() {
    return { cavern: createMapGenBoundsAabbCache(), rail: createMapGenBoundsAabbCache(), erase: createMapGenBoundsAabbCache() };
}
/** Tilelab editor UI and map-authoring state — not used by sandbox sim logic. */
export class TileLabEditorState {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.mapBoundsPreview = createLabMapBoundsPreview();
        this.playConfig = { playAreaCols: 256, playAreaRows: 256 };
        this.cavernConfig = { ...createDefaultMapGenBoundsConfig(), fillChance: 0.45, iterations: 3, wallHeightLevel: 9 };
        this.railConfig = { ...createDefaultMapGenBoundsConfig(), fillChance: 0.45, iterations: 3, wallHeightLevel: 9, edgeThickness: 2 };
        this.eraseConfig = createDefaultMapGenBoundsConfig();
        this.sidebarPanel = "sandbox";
        this.showAnimationPreview = false;
        this.showMapOverview = true;
        this.showSelectionRings = true;
        this.showPropTileCells = false;
        this.showRoomNodesAlways = false;
    }
}

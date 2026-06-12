import { createAabb } from "../../Libraries/Math/Aabb2D.js";
export function createLabMapBoundsPreview() {
    return {
        playArea: createAabb(),
        cavern: createAabb(),
        playViewportX: NaN,
        playViewportY: NaN,
        playCols: NaN,
        playRows: NaN,
        cavernMode: "",
        cavernCol: NaN,
        cavernRow: NaN,
        cavernCols: NaN,
        cavernRows: NaN,
        centerCol: NaN,
        centerRow: NaN,
        outerRadiusCells: NaN,
        donutThicknessCells: NaN,
        wall: createAabb(),
        wallMode: "",
        wallCol: NaN,
        wallRow: NaN,
        wallCols: NaN,
        wallRows: NaN,
        wallCenterCol: NaN,
        wallCenterRow: NaN,
        wallOuterRadiusCells: NaN,
    };
}
/** Tilelab editor UI and map-authoring state — not used by sandbox sim logic. */
export class TileLabEditorState {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.mapBoundsPreview = createLabMapBoundsPreview();
        this.playConfig = { playAreaCols: 256, playAreaRows: 256 };
        this.cavernConfig = {
            boundsMode: "rect",
            boundsCol: -8,
            boundsRow: -8,
            boundsCols: 32,
            boundsRows: 32,
            centerCol: 8,
            centerRow: 8,
            outerRadiusCells: 16,
            donutThicknessCells: 4,
            fillChance: 0.45,
            iterations: 3,
            wallHeightLevel: 9,
        };
        this.wallToolConfig = { boundsMode: "rect", boundsCol: 0, boundsRow: 0, boundsCols: 8, boundsRows: 8, centerCol: 4, centerRow: 4, outerRadiusCells: 4, wallHeightLevel: 1 };
        this.showSandboxPanel = true;
        this.showProfilePanel = true;
        this.showMapPanel = false;
        this.showAnimationPreview = false;
        this.showMapOverview = true;
        this.showMapOverviewViewport = true;
        this.showMapOverviewGenBounds = true;
        this.showMapOverviewWallBounds = false;
        this.forceVectorPropsAll = false;
    }
}

import { createAabb } from "../../Libraries/Math/Aabb2D.js";
export function createLabMapBoundsPreview() {
    return {
        cavern: createAabb(),
        cavernMode: "",
        cavernCol: NaN,
        cavernRow: NaN,
        cavernCols: NaN,
        cavernRows: NaN,
        centerCol: NaN,
        centerRow: NaN,
        outerRadiusCells: NaN,
        donutThicknessCells: NaN,
        rail: createAabb(),
        railMode: "",
        railCol: NaN,
        railRow: NaN,
        railCols: NaN,
        railRows: NaN,
        railCenterCol: NaN,
        railCenterRow: NaN,
        railOuterRadiusCells: NaN,
        railDonutThicknessCells: NaN,
        erase: createAabb(),
        eraseMode: "",
        eraseCol: NaN,
        eraseRow: NaN,
        eraseCols: NaN,
        eraseRows: NaN,
        eraseCenterCol: NaN,
        eraseCenterRow: NaN,
        eraseOuterRadiusCells: NaN,
        eraseDonutThicknessCells: NaN,
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
        this.railConfig = {
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
            edgeThickness: 2,
        };
        this.eraseConfig = {
            boundsMode: "rect",
            boundsCol: -8,
            boundsRow: -8,
            boundsCols: 32,
            boundsRows: 32,
            centerCol: 8,
            centerRow: 8,
            outerRadiusCells: 16,
            donutThicknessCells: 4,
        };
        this.sidebarPanel = "sandbox";
        this.showAnimationPreview = false;
        this.showMapOverview = true;
        this.showMapOverviewViewport = true;
        this.forceVectorPropsAll = false;
    }
}

import { SharedGameState } from "../../GameState/SharedGameState.js";
import { SandboxWorldState } from "../../GameState/SandboxWorldState.js";
import { Viewport } from "../../Libraries/Viewport/Viewport.js";
import { isEmptyCellBounds } from "../../Libraries/DataStructures/CellRect.js";
import { TileLabEditorState } from "./TileLabEditorState.js";
/** Square canvas pixel defaults — main map, map overview, animation preview. */
export const EDITOR_CANVAS_DEFAULTS = {
    main: { initialSize: 480, minSize: 128, maxSize: 1024 },
    overview: { initialSize: 480, minSize: 128, maxSize: 1024, backingScale: 0.5 },
    animationPreview: { initialSize: 200, minSize: 128 },
};
export class TileLabGameState extends SharedGameState {
    constructor() {
        super();
        const rand = Math.floor(1 + Math.random() * 1000000000);
        this.mapSeed = rand;
        this.floorSeed = rand;
        this.worldRenderMode = "radial";
        this.viewport = new Viewport(0, 0, 1);
        this.nav.setPruneSeedResolver((grid, bounds) => {
            if (bounds && !isEmptyCellBounds(bounds)) {
                const midCol = (bounds.startCol + bounds.endCol) >> 1;
                const midRow = (bounds.startRow + bounds.endRow) >> 1;
                return grid.gridToWorld(midCol, midRow);
            }
            return { x: this.viewport.x, y: this.viewport.y };
        });
        this.sandbox = new SandboxWorldState();
        this.editor = new TileLabEditorState();
    }
}

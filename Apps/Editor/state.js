import { SharedGameState } from "../../GameState/SharedGameState.js";
import { SandboxWorldState } from "../../GameState/SandboxWorldState.js";
import { Viewport } from "../../Libraries/Viewport/Viewport.js";
import { TileLabEditorState } from "./TileLabEditorState.js";
export { createLabMapBoundsPreview } from "./TileLabEditorState.js";
export const LAB_PREVIEW_RANGE = 160;
export const TILELAB_SANDBOX_SPAWN_PROP = "beach_ball";
/** Square canvas pixel defaults — main map, map overview, animation preview. */
export const EDITOR_CANVAS_DEFAULTS = {
    main: { initialSize: 480, minSize: 480, maxSize: 1024 },
    overview: { initialSize: 480, minSize: 480, maxSize: 1024 },
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
        this.sandbox = new SandboxWorldState();
        this.editor = new TileLabEditorState();
    }
}

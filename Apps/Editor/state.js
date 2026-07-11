import { SharedGameState } from "../../GameState/SharedGameState.js";
import { SandboxWorldState } from "../../Libraries/Sandbox/sandbox.js";
import { Viewport } from "../../Libraries/Viewport/Viewport.js";
import { WORLD_SURFACE_DEFAULTS } from "../../Config/world.js";
import { TileLabEditorState } from "./TileLabEditorState.js";
import { WORLD_RENDER_MODE_FLAT2D } from "../../Core/engineEnums.js";
/** Square canvas pixel defaults — main map, map overview, animation preview. */
export const EDITOR_CANVAS_DEFAULTS = { main: { initialSize: 480, minSize: 128, maxSize: 1024 }, overview: { initialSize: 480, minSize: 128, maxSize: 1024, backingScale: 0.5 } };
export class TileLabGameState extends SharedGameState {
    constructor() {
        super();
        const rand = Math.floor(1 + Math.random() * 1000000000);
        this.mapSeed = rand;
        this.floorSeed = rand;
        this.worldRenderMode = WORLD_RENDER_MODE_FLAT2D;
        this.losShadowStrength = 0;
        this.worldBloomEnabled = WORLD_SURFACE_DEFAULTS.bloom.enabled;
        this.viewport = new Viewport(0, 0, 1);
        this.sandbox = new SandboxWorldState();
        this.editor = new TileLabEditorState();
    }
}

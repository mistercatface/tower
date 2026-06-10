import { ROGUELIKE_MAP_TOPOLOGY } from "../../Libraries/WorldGen/presets/roguelikeMap.js";
import { getGameState } from "../../GameState/GameState.js";
import { createCombatWallResolver } from "../../Systems/Motion/createCombatWallResolver.js";
import { SharedGameState } from "../../GameState/SharedGameState.js";
import { createRoguelikeNavRuntime } from "../../Libraries/Navigation/createRoguelikeNavRuntime.js";
import { createRoguelikeMapSession } from "../../Libraries/WorldGen/session/index.js";
import { Viewport } from "../../Libraries/Viewport/Viewport.js";
export const LAB_PREVIEW_RANGE = 160;
export const TILELAB_SANDBOX_SPAWN_PROP = "beach_ball";
export const tilelabMapTopology = { ...ROGUELIKE_MAP_TOPOLOGY };
export class TileLabGameState extends SharedGameState {
    constructor() {
        super();
        createRoguelikeNavRuntime(this);
        const rand = Math.floor(1 + Math.random() * 1000000000);
        this.mapSeed = rand;
        this.floorSeed = rand;
        this._pendingProfileRefresh = false;
        this.labShowSandboxPanel = true;
        this.labShowProfilePanel = true;
        this.labShowTopologyOverlay = false;
        this.labShowAnimationPreview = true;
        this.viewport = new Viewport(0, 0, 1);
        /** @type {HTMLCanvasElement} */
        this.labCanvas = null;
        this.groundZones = [];
        this.sandboxVoidZones = [];
        this.sandboxSurfaceProfileZones = [];
        this.sandboxAssemblyInstances = [];
        this.roguelikeMapSession = createRoguelikeMapSession();
        this.wallResolver = createCombatWallResolver(() => getGameState());
    }
}

import { SharedGameState } from "../../GameState/SharedGameState.js";
import { createRoguelikeNavRuntime } from "../../Libraries/Navigation/createRoguelikeNavRuntime.js";
import { createRoguelikeMapSession } from "../../Libraries/WorldGen/session/index.js";
import { Viewport } from "../../Libraries/Viewport/Viewport.js";
export class TileLabGameState extends SharedGameState {
    constructor() {
        super();
        createRoguelikeNavRuntime(this);
        this.mapSeed = 42;
        this.floorSeed = 42;
        this._pendingProfileRefresh = false;
        this.labShowTopologyOverlay = false;
        this.mapViewport = new Viewport(0, 0, 1);
        this.roguelikeMapSession = createRoguelikeMapSession();
        this.entityLayers = [{ key: "projectiles", zIndex: 20 }];
        this.projectiles = [];
        this.activeLasers = [];
    }
}

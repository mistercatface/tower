import { SharedGameState } from "../../GameState/SharedGameState.js";
import { createRoguelikeNavRuntime } from "../../Libraries/Navigation/createRoguelikeNavRuntime.js";
import { createRoguelikeMapSession } from "../../Libraries/WorldGen/session/index.js";
import { Viewport } from "../../Libraries/Viewport/Viewport.js";
export class TileLabGameState extends SharedGameState {
    constructor() {
        super();
        createRoguelikeNavRuntime(this);
        const rand = Math.floor(1 + Math.random() * 1000000000);
        this.mapSeed = rand;
        this.floorSeed = rand;
        this._pendingProfileRefresh = false;
        this.labShowTopologyOverlay = false;
        this.mapViewport = new Viewport(0, 0, 1);
        this.roguelikeMapSession = createRoguelikeMapSession();
    }
}

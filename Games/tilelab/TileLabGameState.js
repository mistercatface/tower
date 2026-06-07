import { SharedGameState } from "../../GameState/SharedGameState.js";
import { createRoguelikeNavRuntime } from "../../Libraries/Navigation/createRoguelikeNavRuntime.js";
import { Viewport } from "../../Libraries/Viewport/Viewport.js";

export class TileLabGameState extends SharedGameState {
    constructor() {
        super();
        createRoguelikeNavRuntime(this);
        this._labFocus = { x: 0, y: 0 };
        this.mapSeed = 42;
        this.floorSeed = 42;
        this._pendingProfileRefresh = false;
        /** @type {"surface" | "topology"} */
        this.labViewMode = "surface";
        this.mapViewport = new Viewport(0, 0, 0.1);
        this.mapLab = {
            selectedNodeId: null,
            playerPos: null,
            targetPos: null,
            currentPath: null,
            currentAbstractPath: null,
        };
    }
}

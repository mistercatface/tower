import { SharedGameState } from "../../GameState/SharedGameState.js";
import { createRoguelikeNavRuntime } from "../../Libraries/Navigation/createRoguelikeNavRuntime.js";

export class TileLabGameState extends SharedGameState {
    constructor() {
        super();
        createRoguelikeNavRuntime(this);
        this._labFocus = { x: 0, y: 0 };
        this.mapSeed = 42;
        this.floorSeed = 42;
        this._pendingProfileRefresh = false;
    }
}

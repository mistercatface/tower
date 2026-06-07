import { SharedGameState } from "../../GameState/SharedGameState.js";
export class PoolGameState extends SharedGameState {
    constructor() {
        super();
        this.pool = null;
    }
}

/** @typedef {import("../WorldSceneTypes.js").WorldSceneDrawInput} WorldSceneDrawInput */
import { applySharedEdgeFlags, requestSharedEdgeSolve, writeWallGeometry } from "./SharedEdgeBridge.js";
export class StructureRenderer {
    /** @param {import("../../WorldSurface/WorldSurfaceSettings.js").WorldSurfaceSettings} settings */
    constructor(settings) {
        this.settings = settings;
        this.lastWalls = null;
        this.lastWallCount = 0;
        this.sharedEdgesDirty = true;
    }
    updateSharedEdges(input) {
        const walls = input.walls;
        if (walls !== this.lastWalls || walls.length !== this.lastWallCount || this.sharedEdgesDirty) {
            this.lastWalls = walls;
            this.lastWallCount = walls.length;
            this.sharedEdgesDirty = false;
            this.rebuildSharedEdgesAsync(input);
        }
    }
    rebuildSharedEdgesAsync(input) {
        const walls = input.walls;
        const numWalls = writeWallGeometry(walls, this.settings);
        this._sharedEdgeGen = (this._sharedEdgeGen || 0) + 1;
        const currentGen = this._sharedEdgeGen;
        requestSharedEdgeSolve(numWalls).then(() => {
            if (this._sharedEdgeGen !== currentGen) return;
            if (this.lastWalls !== input.walls) return;
            applySharedEdgeFlags(walls, numWalls);
        });
    }
}

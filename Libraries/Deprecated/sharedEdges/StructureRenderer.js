import { applySharedEdgeFlags, requestSharedEdgeSolve, writeWallGeometry } from "./SharedEdgeBridge.js";
export class StructureRenderer {
    /** @param {import("../../WorldSurface/WorldSurfaceSettings.js").WorldSurfaceSettings} settings */
    constructor(settings) {
        this.settings = settings;
        this.lastWalls = null;
        this.lastWallCount = 0;
        this.sharedEdgesDirty = true;
    }
    /** @param {object[]} walls */
    updateSharedEdges(walls) {
        if (walls !== this.lastWalls || walls.length !== this.lastWallCount || this.sharedEdgesDirty) {
            this.lastWalls = walls;
            this.lastWallCount = walls.length;
            this.sharedEdgesDirty = false;
            this.rebuildSharedEdgesAsync(walls);
        }
    }
    /** @param {object[]} walls */
    rebuildSharedEdgesAsync(walls) {
        const numWalls = writeWallGeometry(walls, this.settings);
        this.sharedEdgeGen = (this.sharedEdgeGen || 0) + 1;
        const currentGen = this.sharedEdgeGen;
        requestSharedEdgeSolve(numWalls).then(() => {
            if (this.sharedEdgeGen !== currentGen) return;
            if (this.lastWalls !== walls) return;
            applySharedEdgeFlags(walls, numWalls);
        });
    }
}

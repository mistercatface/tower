import { gridSettings } from "../../Config/Config.js";

const MAX_ENTITIES = 4096;
const GLOBAL_QUERY_RESULT = [];

export class EntitySpatialGrid {
    constructor(cellSize, width = gridSettings.width, height = gridSettings.height) {
        this.cellSize = cellSize;
        this.cols = Math.ceil(width / cellSize);
        this.rows = Math.ceil(height / cellSize);
        
        this.cellHead = new Int32Array(this.cols * this.rows).fill(-1);
        this.entityNext = new Int32Array(MAX_ENTITIES).fill(-1);
        
        this.entities = new Array(MAX_ENTITIES);
        this.activeEntities = [];
        this.queryGen = 0;
    }

    clear() {
        // Only clear the cells that actually have entities
        for (let i = 0; i < this.activeEntities.length; i++) {
            const ent = this.activeEntities[i];
            if (ent._gridTileIdx !== undefined && ent._gridTileIdx !== -1) {
                this.cellHead[ent._gridTileIdx] = -1;
                this.entityNext[ent._physId] = -1;
                ent._gridTileIdx = -1;
            }
            this.entities[ent._physId] = null;
        }
        this.activeEntities.length = 0;
    }

    _getCellIndex(x, y) {
        const col = Math.floor(x / this.cellSize);
        const row = Math.floor(y / this.cellSize);
        if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return -1;
        return col + row * this.cols;
    }

    insert(entity) {
        if (entity._physId === undefined) {
            console.error("Entity missing _physId", entity);
            return;
        }

        if (entity._physId >= this.entityNext.length) {
            const newNext = new Int32Array(this.entityNext.length * 2).fill(-1);
            newNext.set(this.entityNext);
            this.entityNext = newNext;
            this.entities.length = this.entityNext.length;
        }

        const idx = this._getCellIndex(entity.x, entity.y);
        entity._gridTileIdx = idx;
        this.entities[entity._physId] = entity;
        this.activeEntities.push(entity);

        if (idx !== -1) {
            this.entityNext[entity._physId] = this.cellHead[idx];
            this.cellHead[idx] = entity._physId;
        } else {
            this.entityNext[entity._physId] = -1;
        }
    }

    updateEntity(entity) {
        const newIdx = this._getCellIndex(entity.x, entity.y);
        if (newIdx !== entity._gridTileIdx) {
            this.remove(entity);
            entity._gridTileIdx = newIdx;
            if (newIdx !== -1) {
                this.entityNext[entity._physId] = this.cellHead[newIdx];
                this.cellHead[newIdx] = entity._physId;
            } else {
                this.entityNext[entity._physId] = -1;
            }
        }
    }

    remove(entity) {
        const idx = entity._gridTileIdx;
        if (idx === -1 || idx === undefined) return;

        const targetId = entity._physId;
        let curr = this.cellHead[idx];
        let prev = -1;

        while (curr !== -1) {
            if (curr === targetId) {
                if (prev !== -1) {
                    this.entityNext[prev] = this.entityNext[curr];
                } else {
                    this.cellHead[idx] = this.entityNext[curr];
                }
                this.entityNext[curr] = -1;
                break;
            }
            prev = curr;
            curr = this.entityNext[curr];
        }
        entity._gridTileIdx = -1;
    }

    collectNearby(entity) {
        GLOBAL_QUERY_RESULT.length = 0;
        this.queryGen++;
        
        // We only inserted by center point, so we must expand the search area
        // by the maximum possible radius of any entity to guarantee we find it.
        // Assuming max entity radius is around 24.
        const maxRadius = 24; 
        const searchRadius = (entity.radius || 0) + maxRadius;
        
        const minX = entity.x - searchRadius;
        const minY = entity.y - searchRadius;
        const maxX = entity.x + searchRadius;
        const maxY = entity.y + searchRadius;

        const minCol = Math.max(0, Math.floor(minX / this.cellSize));
        const maxCol = Math.min(this.cols - 1, Math.floor(maxX / this.cellSize));
        const minRow = Math.max(0, Math.floor(minY / this.cellSize));
        const maxRow = Math.min(this.rows - 1, Math.floor(maxY / this.cellSize));

        for (let r = minRow; r <= maxRow; r++) {
            const rowOffset = r * this.cols;
            for (let c = minCol; c <= maxCol; c++) {
                let curr = this.cellHead[rowOffset + c];
                while (curr !== -1) {
                    const other = this.entities[curr];
                    if (other && other !== entity && other._spatialGen !== this.queryGen) {
                        other._spatialGen = this.queryGen;
                        GLOBAL_QUERY_RESULT.push(other);
                    }
                    curr = this.entityNext[curr];
                }
            }
        }

        return GLOBAL_QUERY_RESULT;
    }
}

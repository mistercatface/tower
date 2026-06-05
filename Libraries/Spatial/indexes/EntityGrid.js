import { forEachDenseCellInRect } from "../../DataStructures/CellRect.js";
import { entityBroadphaseExtent, NEIGHBOR_QUERY_PAD } from "../collision/entityBroadphase.js";

const MAX_ENTITIES = 4096;
const GLOBAL_QUERY_RESULT = [];

export class EntityGrid {
    constructor(cellSize) {
        this.cellSize = cellSize;
        this.minX = 0;
        this.minY = 0;
        this.cols = 0;
        this.rows = 0;

        this.cellHead = new Int32Array(0);
        this.entityNext = new Int32Array(MAX_ENTITIES).fill(-1);

        this.entities = new Array(MAX_ENTITIES);
        this.activeEntities = [];
        this.queryGen = 0;
        this.maxInsertedExtent = 0;
    }

    syncBounds(obstacleGrid) {
        if (!obstacleGrid) return;
        const width = obstacleGrid.maxX - obstacleGrid.minX;
        const height = obstacleGrid.maxY - obstacleGrid.minY;
        const cols = Math.ceil(width / this.cellSize);
        const rows = Math.ceil(height / this.cellSize);

        if (this.minX === obstacleGrid.minX
            && this.minY === obstacleGrid.minY
            && this.cols === cols
            && this.rows === rows) {
            return;
        }

        this.minX = obstacleGrid.minX;
        this.minY = obstacleGrid.minY;
        this.cols = cols;
        this.rows = rows;

        const size = this.cols * this.rows;
        if (this.cellHead.length < size) {
            this.cellHead = new Int32Array(size);
        }
        this.cellHead.fill(-1);
    }

    clear() {
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
        this.maxInsertedExtent = 0;
    }

    _getCellIndex(x, y) {
        const col = Math.floor((x - this.minX) / this.cellSize);
        const row = Math.floor((y - this.minY) / this.cellSize);
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
        const extent = entityBroadphaseExtent(entity);
        if (extent > this.maxInsertedExtent) {
            this.maxInsertedExtent = extent;
        }

        if (idx !== -1) {
            this.entityNext[entity._physId] = this.cellHead[idx];
            this.cellHead[idx] = entity._physId;
        } else {
            this.entityNext[entity._physId] = -1;
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

        const searchRadius = entityBroadphaseExtent(entity) + this.maxInsertedExtent + NEIGHBOR_QUERY_PAD;

        const minX = entity.x - searchRadius;
        const minY = entity.y - searchRadius;
        const maxX = entity.x + searchRadius;
        const maxY = entity.y + searchRadius;

        const minCol = Math.max(0, Math.floor((minX - this.minX) / this.cellSize));
        const maxCol = Math.min(this.cols - 1, Math.floor((maxX - this.minX) / this.cellSize));
        const minRow = Math.max(0, Math.floor((minY - this.minY) / this.cellSize));
        const maxRow = Math.min(this.rows - 1, Math.floor((maxY - this.minY) / this.cellSize));

        forEachDenseCellInRect(minCol, maxCol, minRow, maxRow, this.cols, (_c, _r, cellIdx) => {
            let curr = this.cellHead[cellIdx];
            while (curr !== -1) {
                const other = this.entities[curr];
                if (other && other !== entity && other._spatialGen !== this.queryGen) {
                    other._spatialGen = this.queryGen;
                    GLOBAL_QUERY_RESULT.push(other);
                }
                curr = this.entityNext[curr];
            }
        });

        return GLOBAL_QUERY_RESULT;
    }
}

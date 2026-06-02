let worker = null;
let nextReqId = 1;
const pending = new Map();

function getWorker() {
    if (!worker) {
        worker = new Worker(new URL('./TileWorker.js', import.meta.url), { type: 'module' });
        worker.onmessage = (e) => {
            const { id, bitmaps, error } = e.data;
            if (pending.has(id)) {
                const { resolve, reject } = pending.get(id);
                pending.delete(id);
                if (error) {
                    reject(new Error(error));
                } else {
                    resolve(bitmaps);
                }
            }
        };
    }
    return worker;
}

function sendRequest(type, payload) {
    const id = nextReqId++;
    return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        getWorker().postMessage({ id, type, payload });
    });
}

function copyObstacleGrid(grid) {
    if (!grid) return null;
    return {
        cellSize: grid.cellSize,
        minX: grid.minX,
        minY: grid.minY,
        cols: grid.cols,
        rows: grid.rows,
        grid: new Uint8Array(grid.grid)
    };
}

export const TileWorkerCoordinator = {
    requestFloorChunkBake(payload) {
        const payloadCopy = {
            ...payload,
            obstacleGrid: copyObstacleGrid(payload.obstacleGrid)
        };
        return sendRequest('bakeFloorChunk', payloadCopy);
    },

    requestFloorCellBake(payload) {
        const payloadCopy = {
            ...payload,
            obstacleGrid: copyObstacleGrid(payload.obstacleGrid)
        };
        return sendRequest('bakeFloorCell', payloadCopy);
    },

    requestWallFaceBake(payload) {
        const payloadCopy = {
            ...payload,
            obstacleGrid: copyObstacleGrid(payload.obstacleGrid)
        };
        return sendRequest('bakeWallFace', payloadCopy);
    },

    requestTileTextureBake(payload) {
        return sendRequest('bakeTileTexture', payload);
    },

    requestLabFloorCellBake(payload) {
        return sendRequest('labBakeFloorCell', { ...payload, obstacleGrid: copyObstacleGrid(payload.obstacleGrid) });
    },

    requestLabWallCellBake(payload) {
        return sendRequest('labBakeWallCell', { ...payload, obstacleGrid: copyObstacleGrid(payload.obstacleGrid) });
    },

    requestLabWallFaceBake(payload) {
        return sendRequest('labBakeWallFace', { ...payload, obstacleGrid: copyObstacleGrid(payload.obstacleGrid) });
    }
};

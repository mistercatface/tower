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
                    if (typeof window !== 'undefined') {
                        window.dispatchEvent(new CustomEvent('tileBakeComplete'));
                    }
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

let lastGridRef = null;
let lastGridVersion = null;

function ensureObstacleGridSynchronized(grid) {
    if (!grid) return;
    const version = grid.version || 0;
    if (grid !== lastGridRef || version !== lastGridVersion) {
        lastGridRef = grid;
        lastGridVersion = version;
        sendRequest('setObstacleGrid', copyObstacleGrid(grid));
    }
}

export const TileWorkerCoordinator = {
    requestFloorChunkBake(payload) {
        ensureObstacleGridSynchronized(payload.obstacleGrid);
        const payloadCopy = {
            ...payload,
            obstacleGrid: null
        };
        return sendRequest('bakeFloorChunk', payloadCopy);
    },

    requestFloorCellBake(payload) {
        ensureObstacleGridSynchronized(payload.obstacleGrid);
        const payloadCopy = {
            ...payload,
            obstacleGrid: null
        };
        return sendRequest('bakeFloorCell', payloadCopy);
    },

    requestWallFaceBake(payload) {
        ensureObstacleGridSynchronized(payload.obstacleGrid);
        const payloadCopy = {
            ...payload,
            obstacleGrid: null
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
    },

    registerRuntimeProfile(profileId, profile) {
        return sendRequest('registerRuntimeProfile', { profileId, profile });
    }
};

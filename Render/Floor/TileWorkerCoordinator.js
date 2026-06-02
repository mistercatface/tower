const workers = [];
let nextWorkerIdx = 0;
let nextReqId = 1;
const pending = new Map();

function getWorkerPool() {
    if (workers.length === 0) {
        let poolSize = 4;
        if (typeof navigator !== "undefined" && navigator.hardwareConcurrency) {
            poolSize = Math.min(4, Math.floor(navigator.hardwareConcurrency * 0.5))
        }

        const handleMessage = (e) => {
            const { id, bitmaps, error } = e.data;
            if (pending.has(id)) {
                const { resolve, reject } = pending.get(id);
                pending.delete(id);
                if (error) {
                    reject(new Error(error));
                } else {
                    resolve(bitmaps);
                    if (typeof window !== "undefined") {
                        window.dispatchEvent(new CustomEvent("tileBakeComplete"));
                    }
                }
            }
        };

        for (let i = 0; i < poolSize; i++) {
            const w = new Worker(new URL("./TileWorker.js", import.meta.url), { type: "module" });
            w.onmessage = handleMessage;
            workers.push(w);
        }
    }
    return workers;
}

function sendRequest(type, payload) {
    const id = nextReqId++;
    return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        const pool = getWorkerPool();
        const w = pool[nextWorkerIdx];
        nextWorkerIdx = (nextWorkerIdx + 1) % pool.length;
        w.postMessage({ id, type, payload });
    });
}

function broadcastRequest(type, payload) {
    const pool = getWorkerPool();
    const promises = pool.map(w => {
        const id = nextReqId++;
        return new Promise((resolve, reject) => {
            pending.set(id, { resolve, reject });
            w.postMessage({ id, type, payload });
        });
    });
    return Promise.all(promises);
}

export const TileWorkerCoordinator = {
    requestFloorChunkBake(payload) {
        return sendRequest("bakeFloorChunk", payload);
    },

    requestFloorCellBake(payload) {
        return sendRequest("bakeFloorCell", payload);
    },

    requestWallFaceBake(payload) {
        return sendRequest("bakeWallFace", payload);
    },

    requestTileTextureBake(payload) {
        return sendRequest("bakeTileTexture", payload);
    },

    requestLabFloorCellBake(payload) {
        return sendRequest("labBakeFloorCell", payload);
    },

    requestLabWallCellBake(payload) {
        return sendRequest("labBakeWallCell", payload);
    },

    requestLabWallFaceBake(payload) {
        return sendRequest("labBakeWallFace", payload);
    },

    registerRuntimeProfile(profileId, profile) {
        return broadcastRequest("registerRuntimeProfile", { profileId, profile });
    },
};

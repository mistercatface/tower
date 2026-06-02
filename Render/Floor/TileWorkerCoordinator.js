let worker = null;
let nextReqId = 1;
const pending = new Map();

function getWorker() {
    if (!worker) {
        worker = new Worker(new URL("./TileWorker.js", import.meta.url), { type: "module" });
        worker.onmessage = (e) => {
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
        return sendRequest("registerRuntimeProfile", { profileId, profile });
    },
};

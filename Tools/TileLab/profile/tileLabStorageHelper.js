const DB_NAME = "TileLabStorageDB";
const STORE_NAME = "handles";
const KEY_NAME = "storageDir";

function getDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = (e) => {
            e.target.result.createObjectStore(STORE_NAME);
        };
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = (e) => reject(e.target.error);
    });
}

export async function getStoredDirectoryHandle() {
    try {
        const db = await getDB();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, "readonly");
            const req = tx.objectStore(STORE_NAME).get(KEY_NAME);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
        });
    } catch (e) {
        console.error("IndexedDB error:", e);
        return null;
    }
}

export async function storeDirectoryHandle(handle) {
    try {
        const db = await getDB();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, "readwrite");
            tx.objectStore(STORE_NAME).put(handle, KEY_NAME);
            tx.oncomplete = () => resolve(true);
        });
    } catch (e) {
        console.error("IndexedDB store error:", e);
        return false;
    }
}

export async function verifyPermission(handle, readWrite) {
    const options = {};
    if (readWrite) {
        options.mode = "readwrite";
    }
    if ((await handle.queryPermission(options)) === "granted") {
        return true;
    }
    if ((await handle.requestPermission(options)) === "granted") {
        return true;
    }
    return false;
}

/** Parses profile object from raw file text containing "export default { ... }" */
export function parseProfileFromJsText(text) {
    const clean = text.replace(/^\s*export\s+default\s+/, "").replace(/;\s*$/, "");
    // Use Function constructor to safely parse JS object literal (supporting trailing commas, comments, etc.)
    return new Function(`return (${clean});`)();
}

/** Serializes profile object to "export default { ... };" */
export function serializeProfileToJsText(profile) {
    return `export default ${JSON.stringify(profile, null, 4)};\n`;
}

export async function listDirectoryPresets(dirHandle) {
    const presets = [];
    for await (const entry of dirHandle.values()) {
        if (entry.kind === "file" && entry.name.endsWith(".js")) {
            try {
                const file = await entry.getFile();
                const text = await file.text();
                const profile = parseProfileFromJsText(text);
                const id = entry.name.slice(0, -3); // Strip .js
                presets.push({ id, profile });
            } catch (e) {
                console.error(`Error reading/parsing file ${entry.name}:`, e);
            }
        }
    }
    return presets;
}

export async function writePresetFile(dirHandle, id, profile) {
    const fileHandle = await dirHandle.getFileHandle(`${id}.js`, { create: true });
    const writable = await fileHandle.createWritable();
    const text = serializeProfileToJsText(profile);
    await writable.write(text);
    await writable.close();
}

export async function deletePresetFile(dirHandle, id) {
    await dirHandle.removeEntry(`${id}.js`);
}

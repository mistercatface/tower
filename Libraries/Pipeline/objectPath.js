/** @param {unknown} value */
export function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
}
/** @param {unknown} obj @param {string} path — dot-separated; numeric segments index arrays */
export function getByPath(obj, path) {
    const parts = path.split(".");
    /** @type {unknown} */
    let cur = obj;
    for (const part of parts) {
        if (cur == null || typeof cur !== "object") return undefined;
        cur = /** @type {Record<string, unknown>} */ (cur)[part];
    }
    return cur;
}
/** @param {Record<string, unknown>} obj @param {string} path @param {unknown} value */
export function setByPath(obj, path, value) {
    const parts = path.split(".");
    /** @type {Record<string, unknown>} */
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (cur[part] == null) cur[part] = /^\d+$/.test(parts[i + 1]) ? [] : {};
        cur = /** @type {Record<string, unknown>} */ (cur[part]);
    }
    cur[parts[parts.length - 1]] = value;
}

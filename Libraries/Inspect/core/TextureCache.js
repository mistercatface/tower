const entries = new Map();
function keyWhiteTransparent(img) {
    const canvas = new OffscreenCanvas(img.width, img.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < data.data.length; i += 4) {
        const r = data.data[i];
        const g = data.data[i + 1];
        const b = data.data[i + 2];
        if (r > 235 && g > 235 && b > 235) data.data[i + 3] = 0;
    }
    ctx.putImageData(data, 0, 0);
    return canvas;
}
function ensureEntry(src) {
    if (!entries.has(src)) entries.set(src, { src, canvas: null, ready: false, listeners: new Set() });
    return entries.get(src);
}
function notify(entry) {
    for (const fn of entry.listeners) fn(entry.canvas);
    entry.listeners.clear();
}
export function loadTexture(src, { keyWhite = true } = {}) {
    const entry = ensureEntry(src);
    if (entry.ready) return entry.canvas;
    if (entry.loading) return null;
    entry.loading = true;
    const img = new Image();
    img.onload = () => {
        entry.canvas = keyWhite ? keyWhiteTransparent(img) : img;
        entry.ready = true;
        entry.loading = false;
        notify(entry);
    };
    img.onerror = () => {
        entry.loading = false;
    };
    img.src = src;
    return null;
}
export function getTexture(src) {
    const entry = entries.get(src);
    return entry?.ready ? entry.canvas : null;
}
export function onTextureReady(src, fn) {
    const entry = ensureEntry(src);
    if (entry.ready) {
        fn(entry.canvas);
        return;
    }
    entry.listeners.add(fn);
    loadTexture(src);
}

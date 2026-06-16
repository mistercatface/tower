const HOST_CLASS = "square-canvas-resize-host";
const HANDLE_CLASS = "square-canvas-resize-handle";
/**
 * @typedef {object} SquareCanvasResizeOptions
 * @property {number} initialSize
 * @property {number} [minSize=64]
 * @property {number | (() => number)} [maxSize]
 * @property {(size: number) => void} [onResize]
 * @property {boolean} [syncCanvasPixels=true]
 * @property {HTMLElement} [host]
 */
/**
 * @typedef {object} SquareCanvasResizeHandle
 * @property {HTMLElement} host
 * @property {HTMLElement} handle
 * @property {() => number} getSize
 * @property {(size: number) => number} setSize
 */
/**
 * 1:1 drag-resize frame for a canvas. Corner handle; optional pixel buffer sync.
 *
 * @param {HTMLCanvasElement | null} canvas
 * @param {SquareCanvasResizeOptions} options
 * @returns {SquareCanvasResizeHandle}
 */
export function applySquareCanvasResize(canvas, options) {
    const { initialSize, minSize = 64, maxSize, onResize, syncCanvasPixels = true, host: hostOption } = options;
    const host = resolveHost(canvas, hostOption);
    const resolveMax = () => {
        const cap = typeof maxSize === "function" ? maxSize() : maxSize;
        return cap ?? 4096;
    };
    const syncCanvas = (size) => {
        if (syncCanvasPixels) {
            canvas.width = size;
            canvas.height = size;
            canvas.getContext("2d").imageSmoothingEnabled = false;
        }
    };
    const applySize = (size) => {
        const clamped = Math.max(minSize, Math.min(resolveMax(), Math.round(size)));
        const unchanged = host.offsetWidth === clamped && host.offsetHeight === clamped;
        if (unchanged) {
            if (syncCanvasPixels && canvas.width !== clamped) syncCanvas(clamped);
            return clamped;
        }
        host.style.width = `${clamped}px`;
        host.style.height = `${clamped}px`;
        syncCanvas(clamped);
        onResize?.(clamped);
        return clamped;
    };
    applySize(initialSize);
    const handle = host.querySelector(`.${HANDLE_CLASS}`) ?? createHandle(host);
    if (!handle.dataset.squareResizeWired) {
        handle.dataset.squareResizeWired = "1";
        handle.title = "Drag to resize";
        handle.addEventListener("pointerdown", (e) => {
            e.preventDefault();
            e.stopPropagation();
            const startX = e.clientX;
            const startY = e.clientY;
            const startSize = host.offsetWidth;
            handle.setPointerCapture(e.pointerId);
            const onMove = (ev) => {
                const dx = ev.clientX - startX;
                const dy = ev.clientY - startY;
                const delta = Math.abs(dx) > Math.abs(dy) ? dx : dy;
                applySize(startSize + delta);
            };
            const onUp = () => {
                handle.removeEventListener("pointermove", onMove);
                handle.removeEventListener("pointerup", onUp);
                handle.removeEventListener("pointercancel", onUp);
            };
            handle.addEventListener("pointermove", onMove);
            handle.addEventListener("pointerup", onUp);
            handle.addEventListener("pointercancel", onUp);
        });
    }
    return { host, handle, getSize: () => host.offsetWidth, setSize: applySize };
}
/** @param {HTMLCanvasElement} canvas @param {HTMLElement | undefined} hostOption */
function resolveHost(canvas, hostOption) {
    if (hostOption) {
        hostOption.classList.add(HOST_CLASS);
        if (canvas.parentElement !== hostOption) hostOption.appendChild(canvas);
        return hostOption;
    }
    const parent = canvas.parentElement;
    if (parent?.classList.contains(HOST_CLASS)) return parent;
    const host = document.createElement("div");
    host.className = HOST_CLASS;
    canvas.parentElement?.insertBefore(host, canvas);
    host.appendChild(canvas);
    return host;
}
/** @param {HTMLElement} host */
function createHandle(host) {
    const handle = document.createElement("div");
    handle.className = HANDLE_CLASS;
    host.appendChild(handle);
    return handle;
}

export function initResizer(resizerId = "resizer", onResizeCallback) {
    const resizer = document.getElementById(resizerId);
    if (!resizer) return;
    let isResizing = false;
    resizer.addEventListener("mousedown", (e) => {
        isResizing = true;
        document.body.style.cursor = "col-resize";
        resizer.classList.add("active");
        e.preventDefault();
    });
    document.addEventListener("mousemove", (e) => {
        if (!isResizing) return;
        let newWidth = e.clientX;
        newWidth = Math.max(200, Math.min(newWidth, window.innerWidth - 200));
        document.documentElement.style.setProperty("--editor-w", `${newWidth}px`);
    });
    document.addEventListener("mouseup", () => {
        if (isResizing) {
            isResizing = false;
            document.body.style.cursor = "";
            resizer.classList.remove("active");
            if (onResizeCallback) onResizeCallback();
        }
    });
}
export function setupLabViewportNavigation(canvasId, { getCamera, setCamera, onUpdate }) {
    const canvases = () => {
        const idList = Array.isArray(canvasId) ? canvasId : [canvasId];
        return idList.map((id) => document.getElementById(id)).filter(Boolean);
    };
    const moveKeys = new Set();
    let moveRaf = null;
    const MOVE_SPEED_SCALE = 1;
    const baseSpeed = 150;
    const moveSpeed = () => (baseSpeed * MOVE_SPEED_SCALE) / (getCamera().zoom || 1);
    const applyDelta = (dx, dy) => {
        const cam = getCamera();
        const len = Math.hypot(dx, dy) || 1;
        const step = moveSpeed() * 0.016;
        setCamera(cam.x + (dx / len) * step, cam.y + (dy / len) * step, cam.zoom);
    };
    const tickMove = () => {
        let dx = 0;
        let dy = 0;
        if (moveKeys.has("KeyW") || moveKeys.has("ArrowUp")) dy -= 1;
        if (moveKeys.has("KeyS") || moveKeys.has("ArrowDown")) dy += 1;
        if (moveKeys.has("KeyA") || moveKeys.has("ArrowLeft")) dx -= 1;
        if (moveKeys.has("KeyD") || moveKeys.has("ArrowRight")) dx += 1;
        if (dx !== 0 || dy !== 0) {
            applyDelta(dx, dy);
            onUpdate?.();
        }
        moveRaf = requestAnimationFrame(tickMove);
    };
    window.addEventListener("keydown", (e) => {
        if (e.target.matches("input, textarea, select")) return;
        if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
            moveKeys.add(e.code);
            e.preventDefault();
            if (!moveRaf) moveRaf = requestAnimationFrame(tickMove);
        }
    });
    window.addEventListener("keyup", (e) => {
        moveKeys.delete(e.code);
        if (moveKeys.size === 0 && moveRaf) {
            cancelAnimationFrame(moveRaf);
            moveRaf = null;
        }
    });
    let dragState = null;
    for (const canvas of canvases()) {
        canvas.addEventListener(
            "wheel",
            (e) => {
                e.preventDefault();
                const cam = getCamera();
                const nextZoom = Math.min(2.5, Math.max(0.25, (cam.zoom || 1) + (e.deltaY > 0 ? -0.05 : 0.05)));
                setCamera(cam.x, cam.y, nextZoom);
                onUpdate?.();
            },
            { passive: false },
        );
        canvas.addEventListener("pointerdown", (e) => {
            if (e.button !== 0) return;
            const cam = getCamera();
            dragState = { canvas, startX: e.clientX, startY: e.clientY, camX: cam.x, camY: cam.y, zoom: cam.zoom || 1 };
            canvas.setPointerCapture(e.pointerId);
        });
        canvas.addEventListener("pointermove", (e) => {
            if (!dragState || dragState.canvas !== canvas) return;
            const dx = e.clientX - dragState.startX;
            const dy = e.clientY - dragState.startY;
            setCamera(dragState.camX - dx / dragState.zoom, dragState.camY - dy / dragState.zoom, dragState.zoom);
            onUpdate?.();
        });
        const endDrag = () => {
            if (dragState?.canvas === canvas) dragState = null;
        };
        canvas.addEventListener("pointerup", endDrag);
        canvas.addEventListener("pointercancel", endDrag);
    }
}

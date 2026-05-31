import { requestGamePause, requestGameResume, requestUiUpdate } from "../../Core/EventSystem.js";

const INSPECTOR_PAUSE_REASON = "inspector";

export class PropInspector {
    constructor() {
        this.pickup = null;
        this.descriptor = null;
        this.yaw = 0;
        this.pitch = 0.2;
        this.dragging = false;
        this.lastX = 0;
        this.lastY = 0;
        this.overlay = null;
        this.canvas = null;
        this.titleEl = null;
        this.ctx = null;
        this.onClose = null;
    }

    mount() {
        if (this.overlay) return;

        this.overlay = document.getElementById("propInspector");
        this.canvas = document.getElementById("propInspectorCanvas");
        this.titleEl = document.getElementById("propInspectorTitle");
        this.ctx = this.canvas.getContext("2d");
        this.ctx.imageSmoothingEnabled = false;

        const closeBtn = document.getElementById("propInspectorCloseBtn");
        this.canvas.addEventListener("pointerdown", (e) => this.onPointerDown(e));
        this.canvas.addEventListener("pointermove", (e) => this.onPointerMove(e));
        this.canvas.addEventListener("pointerup", (e) => this.onPointerUp(e));
        this.canvas.addEventListener("pointercancel", (e) => this.onPointerUp(e));
        this.overlay.addEventListener("pointermove", (e) => this.onPointerMove(e));
        this.overlay.addEventListener("pointerup", (e) => this.onPointerUp(e));
        this.overlay.addEventListener("pointercancel", (e) => this.onPointerUp(e));
        closeBtn.addEventListener("click", () => this.close());
    }

    isOpen() {
        return this.pickup != null;
    }

    open(pickup, onClose) {
        const descriptor = pickup.resolveInspect();
        if (!descriptor) return;

        this.mount();
        this.pickup = pickup;
        this.descriptor = descriptor;
        this.onClose = onClose;
        this.yaw = descriptor.getInitialYaw?.(pickup) ?? pickup.facing ?? 0;
        this.pitch = descriptor.getInitialPitch?.(pickup) ?? 0.2;

        if (this.titleEl) {
            this.titleEl.textContent = descriptor.title;
        }

        if (descriptor.onReady) {
            descriptor.onReady(() => {
                if (this.isOpen() && this.pickup === pickup) this.render();
            });
        }

        this.overlay.style.display = "flex";
        requestGamePause(INSPECTOR_PAUSE_REASON);
        requestUiUpdate();
        this.resize();
        this.render();
    }

    close() {
        if (!this.overlay) return;
        this.overlay.style.display = "none";
        requestGameResume(INSPECTOR_PAUSE_REASON);
        requestUiUpdate();
        this.pickup = null;
        this.descriptor = null;
        this.dragging = false;
        if (this.onClose) this.onClose();
        this.onClose = null;
    }

    resize() {
        if (!this.canvas) return;
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = Math.floor(rect.width);
        this.canvas.height = Math.floor(rect.height);
        if (this.isOpen()) this.render();
    }

    onPointerDown(e) {
        if (e.target.closest("#propInspectorCloseBtn")) return;
        this.dragging = true;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
        this.canvas.setPointerCapture(e.pointerId);
    }

    onPointerUp() {
        this.dragging = false;
    }

    onPointerMove(e) {
        if (!this.dragging || !this.pickup) return;
        const dx = e.clientX - this.lastX;
        const dy = e.clientY - this.lastY;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
        this.yaw += dx * 0.012;
        this.pitch -= dy * 0.012;
        this.pitch = Math.max(-1.1, Math.min(1.1, this.pitch));
        this.render();
    }

    render() {
        if (!this.ctx || !this.pickup || !this.descriptor) return;
        if (this.pickup.isDead) {
            this.close();
            return;
        }

        const w = this.canvas.width;
        const h = this.canvas.height;
        this.ctx.clearRect(0, 0, w, h);
        this.ctx.fillStyle = "#0a0c10";
        this.ctx.fillRect(0, 0, w, h);

        const scale = h / 235;
        this.descriptor.draw(this.ctx, w / 2, h * 0.46, scale, this.yaw, this.pitch, this.pickup);

        this.ctx.fillStyle = "rgba(255,255,255,0.55)";
        this.ctx.font = "11px monospace";
        this.ctx.textAlign = "center";
        this.ctx.fillText("Drag to rotate", w / 2, h - 14);
    }
}

export const propInspector = new PropInspector();

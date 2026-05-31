import { isRadioDialogActive } from "../../Radio/RadioDialogController.js";
import {
    onPropInspectorPanelClosed,
    playGuidedInspectRadio,
    recordStartNodeInspection,
} from "../../Combat/StartNodeInspection.js";
import { requestGamePause, requestGameResume, requestUiUpdate } from "../../Core/EventSystem.js";

const INSPECTOR_PAUSE_REASON = "inspector";
const BASE_SCALE_DIVISOR = 235;
const MIN_ZOOM = 0.45;
const MAX_ZOOM = 2.75;
const WHEEL_ZOOM_SENSITIVITY = 0.0012;

export class PropInspector {
    constructor() {
        this.pickup = null;
        this.descriptor = null;
        this.yaw = 0;
        this.pitch = 0.2;
        this.zoom = 1;
        this.dragging = false;
        this.pinching = false;
        this.pinchStartDistance = 0;
        this.pinchStartZoom = 1;
        this.pointers = new Map();
        this.lastX = 0;
        this.lastY = 0;
        this.overlay = null;
        this.canvas = null;
        this.titleEl = null;
        this.ctx = null;
        this.onClose = null;
        this.gameState = null;
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
        this.canvas.addEventListener("wheel", (e) => this.onWheel(e), { passive: false });
        this.overlay.addEventListener("pointermove", (e) => this.onPointerMove(e));
        this.overlay.addEventListener("pointerup", (e) => this.onPointerUp(e));
        this.overlay.addEventListener("pointercancel", (e) => this.onPointerUp(e));
        closeBtn.addEventListener("click", () => this.close());
    }

    isOpen() {
        return this.pickup != null;
    }

    open(pickup, onClose, state = null) {
        const descriptor = pickup.resolveInspect();
        if (!descriptor) return;

        this.mount();
        this.pickup = pickup;
        this.descriptor = descriptor;
        this.onClose = onClose;
        this.gameState = state;
        this.yaw = descriptor.getInitialYaw?.(pickup) ?? pickup.facing ?? 0;
        this.pitch = descriptor.getInitialPitch?.(pickup) ?? 0.2;
        this.zoom = 1;
        this.pointers.clear();
        this.dragging = false;
        this.pinching = false;

        if (this.titleEl) {
            this.titleEl.textContent = descriptor.title;
        }

        if (descriptor.onReady) {
            descriptor.onReady(() => {
                if (this.isOpen() && this.pickup === pickup) this.render();
            });
        }

        if (state) {
            state.propInspectorPanelOpen = true;
        }

        this.overlay.style.display = "flex";
        requestGamePause(INSPECTOR_PAUSE_REASON);
        requestUiUpdate();
        this.resize();
        this.render();

        const inspectKey = pickup.strategy?.inspectKey;
        if (inspectKey && state?.startNodeInspectionSeen != null) {
            playGuidedInspectRadio(state, inspectKey, () => recordStartNodeInspection(state, inspectKey));
        }
    }

    close() {
        if (!this.overlay) return;

        const closedPickup = this.pickup;
        const closedKey = closedPickup?.strategy?.inspectKey;
        const gameState = this.gameState;

        this.overlay.style.display = "none";
        requestGameResume(INSPECTOR_PAUSE_REASON);
        requestUiUpdate();
        this.pickup = null;
        this.descriptor = null;
        this.gameState = null;
        this.dragging = false;
        this.pinching = false;
        this.pointers.clear();
        this.zoom = 1;
        if (this.onClose) this.onClose();
        this.onClose = null;

        if (
            closedKey
            && gameState?.startNodeInspectionSeen
            && !gameState.startNodeInspectionSeen.has(closedKey)
            && !isRadioDialogActive()
        ) {
            recordStartNodeInspection(gameState, closedKey);
        }

        if (gameState) {
            onPropInspectorPanelClosed(gameState);
        }
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

        this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (this.pointers.size === 2) {
            this.pinching = true;
            this.dragging = false;
            this.pinchStartDistance = this.getPinchDistance();
            this.pinchStartZoom = this.zoom;
        } else if (this.pointers.size === 1) {
            this.dragging = true;
            this.lastX = e.clientX;
            this.lastY = e.clientY;
        }

        this.canvas.setPointerCapture(e.pointerId);
    }

    onPointerUp(e) {
        this.pointers.delete(e.pointerId);

        if (this.pointers.size < 2) {
            this.pinching = false;
            this.pinchStartDistance = 0;
        }

        if (this.pointers.size === 0) {
            this.dragging = false;
            return;
        }

        if (this.pointers.size === 1 && !this.pinching) {
            const remaining = [...this.pointers.values()][0];
            this.dragging = true;
            this.lastX = remaining.x;
            this.lastY = remaining.y;
        }
    }

    onPointerMove(e) {
        if (!this.pickup || !this.pointers.has(e.pointerId)) return;

        this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (this.pinching && this.pointers.size >= 2) {
            const distance = this.getPinchDistance();
            if (this.pinchStartDistance > 0) {
                const ratio = distance / this.pinchStartDistance;
                this.zoom = this.clampZoom(this.pinchStartZoom * ratio);
                this.render();
            }
            return;
        }

        if (!this.dragging || this.pointers.size !== 1) return;

        const dx = e.clientX - this.lastX;
        const dy = e.clientY - this.lastY;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
        this.yaw += dx * 0.012;
        this.pitch -= dy * 0.012;
        this.pitch = Math.max(-1.1, Math.min(1.1, this.pitch));
        this.render();
    }

    onWheel(e) {
        if (!this.isOpen()) return;
        e.preventDefault();

        const factor = 1 - e.deltaY * WHEEL_ZOOM_SENSITIVITY;
        this.zoom = this.clampZoom(this.zoom * factor);
        this.render();
    }

    getPinchDistance() {
        const points = [...this.pointers.values()];
        if (points.length < 2) return 0;
        return Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
    }

    clampZoom(value) {
        return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));
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

        const scale = (h / BASE_SCALE_DIVISOR) * this.zoom;
        this.descriptor.draw(this.ctx, w / 2, h * 0.46, scale, this.yaw, this.pitch, this.pickup);

        this.ctx.fillStyle = "rgba(255,255,255,0.55)";
        this.ctx.font = "11px monospace";
        this.ctx.textAlign = "center";
        this.ctx.fillText("Drag to rotate · Scroll or pinch to zoom", w / 2, h - 14);
    }
}

export const propInspector = new PropInspector();

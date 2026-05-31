import { drawJackoFuelBarrelInspect, onJackoFuelLabelReady } from "./3D/JackoFuelBarrel.js";

export class JackoFuelInspector {
    constructor() {
        this.pickup = null;
        this.yaw = 0;
        this.pitch = 0.2;
        this.dragging = false;
        this.lastX = 0;
        this.lastY = 0;
        this.overlay = null;
        this.canvas = null;
        this.ctx = null;
        this.onClose = null;
    }

    mount() {
        if (this.overlay) return;
        this.overlay = document.getElementById("jackoFuelInspector");
        this.canvas = document.getElementById("jackoFuelCanvas");
        this.ctx = this.canvas.getContext("2d");
        this.ctx.imageSmoothingEnabled = false;
        const closeBtn = document.getElementById("jackoFuelCloseBtn");
        this.canvas.addEventListener("pointerdown", (e) => this.onPointerDown(e));
        this.canvas.addEventListener("pointermove", (e) => this.onPointerMove(e));
        this.canvas.addEventListener("pointerup", (e) => this.onPointerUp(e));
        this.canvas.addEventListener("pointercancel", (e) => this.onPointerUp(e));
        this.overlay.addEventListener("pointermove", (e) => this.onPointerMove(e));
        this.overlay.addEventListener("pointerup", (e) => this.onPointerUp(e));
        this.overlay.addEventListener("pointercancel", (e) => this.onPointerUp(e));
        closeBtn.addEventListener("click", () => this.close());
        onJackoFuelLabelReady(() => {
            if (this.isOpen()) this.render();
        });
    }

    isOpen() {
        return this.pickup != null;
    }

    open(pickup, onClose) {
        this.mount();
        this.pickup = pickup;
        this.onClose = onClose;
        this.yaw = pickup.facing ?? 0;
        this.pitch = 0.2;
        this.overlay.style.display = "flex";
        this.resize();
        this.render();
    }

    close() {
        if (!this.overlay) return;
        this.overlay.style.display = "none";
        this.pickup = null;
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
        if (e.target.closest("#jackoFuelCloseBtn")) return;
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
        if (!this.ctx || !this.pickup) return;
        if (this.pickup.isDead) {
            this.close();
            return;
        }
        const w = this.canvas.width;
        const h = this.canvas.height;
        this.ctx.clearRect(0, 0, w, h);
        this.ctx.fillStyle = "#0a0c10";
        this.ctx.fillRect(0, 0, w, h);

        const onFire = this.pickup.currentStateName === "on_fire";
        const scale = h / 235;
        drawJackoFuelBarrelInspect(this.ctx, w / 2, h * 0.46, scale, this.yaw, this.pitch, { onFire });

        this.ctx.fillStyle = "rgba(255,255,255,0.55)";
        this.ctx.font = "11px monospace";
        this.ctx.textAlign = "center";
        this.ctx.fillText("Drag to rotate", w / 2, h - 14);
    }
}

export const jackoFuelInspector = new JackoFuelInspector();

export function findInspectableBarrel(state, worldX, worldY) {
    if (!state.pickups) return null;
    let best = null;
    let bestDistSq = Infinity;
    for (const pickup of state.pickups) {
        if (pickup.isDead || pickup.type !== "barrel") continue;
        const tapRadius = pickup.radius + 14;
        const distSq = (pickup.x - worldX) ** 2 + (pickup.y - worldY) ** 2;
        if (distSq <= tapRadius * tapRadius && distSq < bestDistSq) {
            best = pickup;
            bestDistSq = distSq;
        }
    }
    return best;
}

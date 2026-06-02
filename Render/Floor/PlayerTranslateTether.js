import { floorTileSettings } from "../../Config/Config.js";

function quantizeOrigin(x, y, stepPx) {
    return {
        x: Math.round(x / stepPx) * stepPx,
        y: Math.round(y / stepPx) * stepPx,
    };
}

/**
 * Smoothly moves a floor translate origin toward the player target.
 * Rebake keys advance only when the quantized origin crosses a grid step.
 */
export class PlayerTranslateTether {
    constructor() {
        this.active = false;
        this.originX = 0;
        this.originY = 0;
        this.targetX = 0;
        this.targetY = 0;
        this.initialized = false;
        this._lastQuant = null;
    }

    reset() {
        this.active = false;
        this.initialized = false;
        this._lastQuant = null;
    }

    setTarget(x, y) {
        this.targetX = x;
        this.targetY = y;
        this.active = true;
    }

    /** @returns {boolean} Quantized bake origin changed (new chunk bakes needed). */
    update(dtMs) {
        if (!this.active) {
            return false;
        }

        const maxSpeed = floorTileSettings.tetherMaxUnitsPerSecond;
        const snapDistance = floorTileSettings.tetherSnapDistance;
        const quantStep = floorTileSettings.tetherBakeQuantizePx;

        if (!this.initialized) {
            this.originX = this.targetX;
            this.originY = this.targetY;
            this.initialized = true;
            this._lastQuant = quantizeOrigin(this.originX, this.originY, quantStep);
            return true;
        }

        const dx = this.targetX - this.originX;
        const dy = this.targetY - this.originY;
        const dist = Math.hypot(dx, dy);

        if (dist <= snapDistance) {
            if (this.originX !== this.targetX || this.originY !== this.targetY) {
                this.originX = this.targetX;
                this.originY = this.targetY;
            }
        } else {
            const step = (maxSpeed * dtMs) / 1000;
            const t = Math.min(1, step / dist);
            this.originX += dx * t;
            this.originY += dy * t;
        }

        const quant = quantizeOrigin(this.originX, this.originY, quantStep);
        if (!this._lastQuant || quant.x !== this._lastQuant.x || quant.y !== this._lastQuant.y) {
            this._lastQuant = quant;
            return true;
        }
        return false;
    }

    /** Origin used for procedural bakes and cache keys (quantized). */
    getBakeOrigin() {
        if (!this.active || !this.initialized) {
            return null;
        }
        const quantStep = floorTileSettings.tetherBakeQuantizePx;
        return quantizeOrigin(this.originX, this.originY, quantStep);
    }

    isSliding() {
        if (!this.active || !this.initialized) {
            return false;
        }
        const snapDistance = floorTileSettings.tetherSnapDistance;
        return Math.hypot(this.targetX - this.originX, this.targetY - this.originY) > snapDistance;
    }
}

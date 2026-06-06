import { inspectBridge } from "../../Combat/inspect/InspectBridge.js";
import {
    advanceCueStickStrike,
    applyCueStickImpulse,
    getCueStickDrawProp,
    hideCueStick,
    syncCueStickFromAim,
} from "../../Libraries/CueStick/cueStickController.js";
import { requestUiUpdate } from "../../Core/EventSystem.js";
import { getRadioPort, getRunScenePort, getSimulationPort } from "../../Core/GamePorts.js";
import { resolveRenderViewer } from "../../Render/adapters/WorldRenderAdapter.js";
import { resetSimulationWorld } from "../../Systems/Simulation/index.js";
import { getCueBall, ensurePoolState } from "./balls.js";
import { tryBeginAim, updateAim, releaseAimShot, cancelAim, getAimPreview } from "./shotInput.js";
export class PoolSimulationState {
    onEnter(ctx) {
        if (ctx.state.skipSimulationEnterReset) {
            ctx.state.skipSimulationEnterReset = false;
            requestUiUpdate();
            return;
        }
        resetSimulationWorld(ctx.state);
        getRunScenePort().onSimulationEnter(ctx);
        this._snapCameraToTable(ctx);
        getSimulationPort().onEnter?.(ctx);
        requestUiUpdate();
    }
    update(dt, ctx) {
        getSimulationPort().runTick(ctx, dt);
        this._updateCueStick(ctx, dt);
    }
    render(ctx) {
        this._snapCameraToTable(ctx);
        ctx.renderer.renderSimulationScene(ctx.state, ctx.viewport);
        this._drawCueStick(ctx);
        this._drawWorldOverlay(ctx);
    }
    /** @param {object} ctx @param {number} dt */
    _updateCueStick(ctx, dt) {
        const pool = ensurePoolState(ctx.state);
        const cue = getCueBall(ctx.state);
        if (!cue) return;
        if (pool.phase === "aiming" && pool.aim?.active) {
            const preview = getAimPreview(ctx.state);
            if (preview) syncCueStickFromAim(pool, cue, preview);
            return;
        }
        if (pool.phase === "striking") {
            advanceCueStickStrike(pool, cue, dt, (strike) => {
                applyCueStickImpulse(cue, strike);
                pool.phase = "rolling";
            });
        }
    }
    /** @param {object} ctx */
    _syncCueStickFromAim(ctx) {
        const pool = ensurePoolState(ctx.state);
        const cue = getCueBall(ctx.state);
        const preview = getAimPreview(ctx.state);
        if (!cue || !preview) {
            hideCueStick(pool);
            return;
        }
        syncCueStickFromAim(pool, cue, preview);
    }
    /** Draw the 3D cue stick in world space (after balls, before screen overlays). */
    /** @param {object} ctx */
    _drawCueStick(ctx) {
        const prop = getCueStickDrawProp(ensurePoolState(ctx.state));
        if (!prop) return;
        const canvasCtx = ctx.renderer.ctx;
        const { viewport } = ctx;
        canvasCtx.save();
        viewport.apply(canvasCtx);
        const { x: px, y: py } = resolveRenderViewer(ctx.state, viewport);
        ctx.renderer.render3D.drawProp(canvasCtx, prop, px, py);
        canvasCtx.restore();
    }
    /** @param {object} ctx */
    _snapCameraToTable(ctx) {
        const layout = getRunScenePort().getLayout(ctx.state);
        const cx = layout?.tableCenterX ?? ctx.state.player.x;
        const cy = layout?.tableCenterY ?? ctx.state.player.y;
        ctx.viewport.updateZoomLimits(ctx.state);
        if (layout?.tableWidth && layout?.tableHeight) {
            const bounds = ctx.state.canvasBounds;
            const pad = 8;
            const halfW = layout.tableWidth / 2;
            const halfH = layout.tableHeight / 2;
            let zoomX;
            let zoomY;
            if (bounds?.width && bounds?.height) {
                zoomX = (bounds.width / 2 - pad) / halfW;
                zoomY = (bounds.height / 2 - pad) / halfH;
            } else {
                const vr = ctx.viewport.getVisualRadius();
                zoomX = vr / halfW;
                zoomY = vr / halfH;
            }
            ctx.viewport.zoom = Math.min(zoomX, zoomY) * 0.94;
        }
        ctx.viewport.follow(cx, cy);
    }
    /** World-anchored canvas overlay — aim line + pocket rings (status text is DOM via poolUiPort). */
    /** @param {object} ctx */
    _drawWorldOverlay(ctx) {
        const canvasCtx = ctx.renderer.ctx;
        const { viewport } = ctx;
        const layout = getRunScenePort().getLayout(ctx.state);
        if (!layout) return;
        const pool = ensurePoolState(ctx.state);
        canvasCtx.save();
        canvasCtx.setTransform(1, 0, 0, 1, 0, 0);
        if (layout.pockets && !pool.won)
            for (let i = 0; i < layout.pockets.length; i++) {
                const pocket = layout.pockets[i];
                const screen = viewport.worldToScreen(pocket.x, pocket.y);
                const r = pocket.radius * viewport.zoom;
                canvasCtx.beginPath();
                canvasCtx.fillStyle = "rgba(0, 0, 0, 0.45)";
                canvasCtx.arc(screen.x, screen.y, r, 0, Math.PI * 2);
                canvasCtx.fill();
                canvasCtx.strokeStyle = "rgba(0, 255, 204, 0.35)";
                canvasCtx.lineWidth = 2;
                canvasCtx.stroke();
            }
        canvasCtx.restore();

        // Draw debug vector arrow from cue ball representing current charge/angle
        if (pool.phase === "aiming" && pool.aim?.active) {
            const cue = getCueBall(ctx.state);
            const preview = getAimPreview(ctx.state);
            if (cue && preview) {
                const { nx, ny, power } = preview;
                canvasCtx.save();
                viewport.apply(canvasCtx);

                // Start from cue ball surface
                const startX = cue.x + nx * cue.radius;
                const startY = cue.y + ny * cue.radius;

                // Shot tuning variables
                const minPower = 16;
                const maxPower = 850;
                const maxArrowLength = 100; // world units
                const ratio = Math.max(0, Math.min(1, (power - minPower) / (maxPower - minPower)));
                const arrowLength = 20 + ratio * maxArrowLength;

                const endX = startX + nx * arrowLength;
                const endY = startY + ny * arrowLength;

                // Color interpolation: 180 (cyan) -> 0 (red)
                const hue = 180 - ratio * 180;
                const color = `hsl(${hue}, 100%, 50%)`;

                // Glow style settings
                canvasCtx.shadowColor = `hsla(${hue}, 100%, 50%, 0.6)`;
                canvasCtx.shadowBlur = 8;

                // Draw dashed line extending beyond arrow
                canvasCtx.beginPath();
                canvasCtx.setLineDash([4, 4]);
                canvasCtx.moveTo(endX, endY);
                canvasCtx.lineTo(endX + nx * 200, endY + ny * 200);
                canvasCtx.strokeStyle = "rgba(255, 255, 255, 0.35)";
                canvasCtx.lineWidth = 1.5;
                canvasCtx.stroke();
                canvasCtx.setLineDash([]);

                // Draw arrow shaft
                canvasCtx.beginPath();
                canvasCtx.moveTo(startX, startY);
                canvasCtx.lineTo(endX, endY);
                canvasCtx.strokeStyle = color;
                canvasCtx.lineWidth = 3;
                canvasCtx.lineCap = "round";
                canvasCtx.stroke();

                // Draw filled arrowhead
                const headSize = 8;
                const headWidth = 5;
                const tx = -ny;
                const ty = nx;
                const baseCenterX = endX - nx * headSize;
                const baseCenterY = endY - ny * headSize;
                const leftX = baseCenterX + tx * headWidth;
                const leftY = baseCenterY + ty * headWidth;
                const rightX = baseCenterX - tx * headWidth;
                const rightY = baseCenterY - ty * headWidth;

                canvasCtx.beginPath();
                canvasCtx.moveTo(endX, endY);
                canvasCtx.lineTo(leftX, leftY);
                canvasCtx.lineTo(rightX, rightY);
                canvasCtx.closePath();
                canvasCtx.fillStyle = color;
                canvasCtx.fill();

                canvasCtx.restore();
            }
        }
    }
    _inputBlocked(ctx) {
        return inspectBridge.isOpen() || ctx.state.isPaused || getRadioPort().isDialogActive();
    }
    handlePointerDown(worldCoords, _isDoubleTap, event, ctx) {
        if (this._inputBlocked(ctx)) return;
        if (!tryBeginAim(ctx.state, worldCoords.x, worldCoords.y)) return;
        this._syncCueStickFromAim(ctx);
        const target = event.currentTarget;
        if (target?.setPointerCapture)
            try {
                target.setPointerCapture(event.pointerId);
            } catch {
                // ignore capture failures
            }
    }
    handlePointerMove(worldCoords, _screenCoords, _isPrimaryDown, ctx) {
        if (this._inputBlocked(ctx)) return;
        const pool = ensurePoolState(ctx.state);
        if (pool.aim?.active) {
            updateAim(ctx.state, worldCoords.x, worldCoords.y);
            this._syncCueStickFromAim(ctx);
        }
    }
    handlePointerUp(worldCoords, event, ctx) {
        if (this._inputBlocked(ctx)) return;
        const pool = ensurePoolState(ctx.state);
        if (pool.aim?.active) releaseAimShot(ctx.state, worldCoords.x, worldCoords.y);
        const target = event.currentTarget;
        if (target?.releasePointerCapture && target.hasPointerCapture?.(event.pointerId))
            try {
                target.releasePointerCapture(event.pointerId);
            } catch {
                // ignore
            }
    }
    /** Legacy FSM tap entry — pool uses pointer down/up. */
    handleInteraction(worldCoords, _isDoubleTap, ctx) {
        if (this._inputBlocked(ctx)) return;
        if (!tryBeginAim(ctx.state, worldCoords.x, worldCoords.y)) return;
        cancelAim(ctx.state);
    }
}

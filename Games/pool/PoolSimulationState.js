import { inspectBridge } from "../../Combat/inspect/InspectBridge.js";
import { advanceCueStickStrike, applyCueStickImpulse, getCueStickDrawProp, hideCueStick, syncCueStickFromAim } from "../../Libraries/CueStick/cueStickController.js";
import { requestUiUpdate } from "../../Core/EventSystem.js";
import { getRadioPort, getRunScenePort, getSimulationPort } from "../../Core/GamePorts.js";
import { resolveRenderViewer } from "../../Render/adapters/WorldRenderAdapter.js";
import { resetSimulationWorld } from "../../Systems/Simulation/index.js";
import { drawAimSegment } from "../../Libraries/Render/contactPreviewDraw.js";
import { getCueBall, ensurePoolState } from "./balls.js";
import { tryBeginAim, updateAim, releaseAimShot, cancelAim, getAimPreview, getCueAimLinePreview } from "./shotInput.js";
import { MAX_SHOT_POWER, MIN_SHOT_POWER } from "./config/tableLayout.js";
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
        if (pool.phase === "striking")
            advanceCueStickStrike(pool, cue, dt, (strike) => {
                applyCueStickImpulse(cue, strike);
                pool.phase = "rolling";
            });
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
        if (layout?.tableWidth && layout?.tableHeight) {
            const bounds = ctx.state.canvasBounds;
            const halfW = layout.tableWidth / 2;
            const halfH = layout.tableHeight / 2;
            let zoomX;
            if (bounds?.width && bounds?.height) {
                // Always fit zoom to the width with 1 cell of padding on each side
                const cellSize = layout.tableWidth / 24;
                zoomX = bounds.width / 2 / (halfW + cellSize);
                ctx.viewport.zoom = zoomX;
            } else {
                const vr = ctx.viewport.getVisualRadius();
                const cellSize = layout.tableWidth / 24;
                zoomX = vr / (halfW + cellSize);
                ctx.viewport.zoom = zoomX;
            }
        } else ctx.viewport.updateZoomLimits(ctx.state);
        ctx.viewport.snapTo(cx, cy);
    }
    /** World-anchored canvas overlay — cue aim line (pockets + status text are elsewhere). */
    /** @param {object} ctx */
    _drawWorldOverlay(ctx) {
        const canvasCtx = ctx.renderer.ctx;
        const { viewport } = ctx;
        const pool = ensurePoolState(ctx.state);
        if (pool.phase === "aiming" && pool.aim?.active) {
            const aimLine = getCueAimLinePreview(ctx.state);
            const preview = getAimPreview(ctx.state);
            if (aimLine && preview) {
                const ratio = Math.max(0, Math.min(1, (preview.power - MIN_SHOT_POWER) / (MAX_SHOT_POWER - MIN_SHOT_POWER)));
                canvasCtx.save();
                viewport.apply(canvasCtx);
                drawAimSegment(canvasCtx, aimLine, { color: `hsl(${180 - ratio * 180}, 100%, 50%)`, glowHue: 180 - ratio * 180 });
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

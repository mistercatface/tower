import { requestUiUpdate } from "../../Core/EventSystem.js";
import { getRunScenePort, getSimulationPort } from "../../Core/GamePorts.js";
import { drawAimSegment } from "../../Libraries/Render/contactPreviewDraw.js";
import { poolRadio } from "./radio.js";
import { ensurePoolState } from "./balls.js";
import { tryBeginAim, updateAim, releaseAimShot, cancelAim, getAimPreview, getCueAimLinePreview } from "./shotInput.js";
import { MAX_SHOT_POWER, MIN_SHOT_POWER } from "./config/tableLayout.js";
export class PoolSimulationState {
    onEnter(ctx) {
        getRunScenePort().onSimulationEnter(ctx);
        this._snapCameraToTable(ctx);
        requestUiUpdate();
    }
    update(dt, ctx) {
        getSimulationPort().runTick(ctx, dt);
    }
    render(ctx) {
        this._snapCameraToTable(ctx);
        ctx.renderer.renderSimulationScene(ctx.state, ctx.viewport);
        this._drawWorldOverlay(ctx);
    }
    /** @param {object} ctx */
    _snapCameraToTable(ctx) {
        const layout = getRunScenePort().getLayout(ctx.state);
        if (layout?.tableCenterX == null || layout?.tableCenterY == null) throw new Error("PoolSimulationState: table layout missing center");
        const cx = layout.tableCenterX;
        const cy = layout.tableCenterY;
        if (layout.tableWidth && layout.tableHeight) {
            const bounds = ctx.state.canvasBounds;
            const halfW = layout.tableWidth / 2;
            const cellSize = layout.tableWidth / 24;
            let zoomX;
            if (bounds?.width && bounds?.height) {
                zoomX = bounds.width / 2 / (halfW + cellSize);
                ctx.viewport.zoom = zoomX;
            } else {
                const vr = ctx.viewport.getVisualRadius();
                zoomX = vr / (halfW + cellSize);
                ctx.viewport.zoom = zoomX;
            }
        }
        ctx.viewport.snapTo(cx, cy);
    }
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
        return ctx.state.isPaused || poolRadio.isDialogActive();
    }
    handlePointerDown(worldCoords, _isDoubleTap, event, ctx) {
        if (this._inputBlocked(ctx)) return;
        if (!tryBeginAim(ctx.state, worldCoords.x, worldCoords.y)) return;
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
        if (pool.aim?.active) updateAim(ctx.state, worldCoords.x, worldCoords.y);
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
    handleInteraction(worldCoords, _isDoubleTap, ctx) {
        if (this._inputBlocked(ctx)) return;
        if (!tryBeginAim(ctx.state, worldCoords.x, worldCoords.y)) return;
        cancelAim(ctx.state);
    }
}

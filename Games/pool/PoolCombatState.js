import { Pools } from "../../Core/Pools.js";
import { inspectBridge } from "../../Combat/inspect/InspectBridge.js";
import { requestUiUpdate } from "../../Core/EventSystem.js";
import { runCombatEnterPersistence, runCombatTick } from "../../Systems/Combat/index.js";
import { getCueBall, ensurePoolState } from "./balls.js";
import { poolRunScenePorts } from "./runScenePorts.js";
import {
    tryBeginAim,
    updateAim,
    releaseAimShot,
    getAimPreview,
    canBeginAim,
} from "./shotInput.js";

export class PoolCombatState {
    onEnter(ctx) {
        if (ctx.state.skipCombatEnterReset) {
            ctx.state.skipCombatEnterReset = false;
            requestUiUpdate();
            return;
        }
        if (ctx.state.projectiles) {
            for (let i = 0; i < ctx.state.projectiles.length; i++) {
                Pools.projectiles.release(ctx.state.projectiles[i]);
            }
        }
        ctx.state.projectiles = [];
        ctx.state.explosions = [];
        ctx.state.enemies = [];
        ctx.state.activeLasers = [];
        ctx.state.combatParticles = [];
        ctx.state.ragdollCorpses = [];
        ctx.state.floatingTexts = [];
        ctx.game?.onCombatEnter?.(ctx);

        this._snapCameraToTable(ctx);
        ctx.state.hordeSpawner.beginHorde();
        ctx.state.player.resetTurretCombatState();
        runCombatEnterPersistence(ctx.state);
        requestUiUpdate();
    }

    update(dt, ctx) {
        runCombatTick(ctx, dt);
    }

    render(ctx) {
        this._snapCameraToTable(ctx);
        ctx.renderer.renderCombatScene(ctx.state, ctx.viewport);
        this._drawTableOverlay(ctx);
    }

    /** @param {object} ctx */
    _snapCameraToTable(ctx) {
        const layout = poolRunScenePorts.getLayout(ctx.state);
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

    /** @param {object} ctx */
    _drawTableOverlay(ctx) {
        const canvasCtx = ctx.renderer.ctx;
        const { viewport } = ctx;
        const layout = poolRunScenePorts.getLayout(ctx.state);
        if (!layout) return;

        canvasCtx.save();
        canvasCtx.setTransform(1, 0, 0, 1, 0, 0);

        const pool = ensurePoolState(ctx.state);
        const status = pool.won
            ? "You cleared the table!"
            : pool.phase === "rolling"
                ? "Rolling..."
                : pool.aim?.active
                    ? "Release to shoot"
                    : canBeginAim(ctx.state)
                        ? "Pull back opposite your target"
                        : "Wait for balls to stop";

        canvasCtx.fillStyle = "rgba(0, 0, 0, 0.55)";
        canvasCtx.fillRect(12, 12, 280, 28);
        canvasCtx.fillStyle = "#00FFCC";
        canvasCtx.font = "14px monospace";
        canvasCtx.fillText(status, 20, 32);

        if (!pool.won && pool.objectRemaining > 0) {
            canvasCtx.fillStyle = "rgba(0, 0, 0, 0.55)";
            canvasCtx.fillRect(12, 46, 180, 24);
            canvasCtx.fillStyle = "#FFFFFF";
            canvasCtx.fillText(`Object balls left: ${pool.objectRemaining}`, 20, 63);
        }

        if (layout.pockets && !pool.won) {
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
        }

        const preview = getAimPreview(ctx.state);
        const cue = getCueBall(ctx.state);
        if (preview && cue) {
            const start = viewport.worldToScreen(cue.x, cue.y);
            const shotLen = Math.min(160, preview.drag * viewport.zoom * 0.6);
            const shotX = start.x + preview.nx * shotLen;
            const shotY = start.y + preview.ny * shotLen;

            canvasCtx.strokeStyle = "rgba(255, 255, 255, 0.95)";
            canvasCtx.lineWidth = 3;
            canvasCtx.beginPath();
            canvasCtx.moveTo(start.x, start.y);
            canvasCtx.lineTo(shotX, shotY);
            canvasCtx.stroke();

            canvasCtx.fillStyle = "rgba(255, 255, 255, 0.9)";
            canvasCtx.beginPath();
            canvasCtx.arc(shotX, shotY, 4, 0, Math.PI * 2);
            canvasCtx.fill();
        }

        canvasCtx.restore();
    }

    _inputBlocked(ctx) {
        return inspectBridge.isOpen() || ctx.state.isPaused || ctx.game?.isRadioDialogActive?.();
    }

    handlePointerDown(worldCoords, _isDoubleTap, event, ctx) {
        if (this._inputBlocked(ctx)) return;
        if (!tryBeginAim(ctx.state)) return;

        updateAim(ctx.state, worldCoords.x, worldCoords.y);

        const target = event.currentTarget;
        if (target?.setPointerCapture) {
            try {
                target.setPointerCapture(event.pointerId);
            } catch {
                // ignore capture failures
            }
        }
    }

    handlePointerMove(worldCoords, _screenCoords, _isPrimaryDown, ctx) {
        if (this._inputBlocked(ctx)) return;

        const pool = ensurePoolState(ctx.state);
        if (pool.aim?.active) {
            updateAim(ctx.state, worldCoords.x, worldCoords.y);
        }
    }

    handlePointerUp(worldCoords, event, ctx) {
        if (this._inputBlocked(ctx)) return;

        const pool = ensurePoolState(ctx.state);
        if (pool.aim?.active) {
            updateAim(ctx.state, worldCoords.x, worldCoords.y);
            releaseAimShot(ctx.state);
            pool.aim = null;
        }

        const target = event.currentTarget;
        if (target?.releasePointerCapture && target.hasPointerCapture?.(event.pointerId)) {
            try {
                target.releasePointerCapture(event.pointerId);
            } catch {
                // ignore
            }
        }
    }

    /** Legacy FSM tap entry — pool uses pointer down/up. */
    handleInteraction(worldCoords, _isDoubleTap, ctx) {
        if (this._inputBlocked(ctx)) return;
        if (!tryBeginAim(ctx.state)) return;
        updateAim(ctx.state, worldCoords.x, worldCoords.y);
        releaseAimShot(ctx.state);
        ensurePoolState(ctx.state).aim = null;
    }
}

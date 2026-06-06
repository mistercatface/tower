import { Pools } from "../../Core/Pools.js";
import { inspectBridge } from "../../Combat/inspect/InspectBridge.js";
import { requestUiUpdate } from "../../Core/EventSystem.js";
import { runCombatEnterPersistence, runCombatTick } from "../../Systems/Combat/index.js";
import { getHeroBall, getGoalPosition, GOAL_RADIUS, nudgeHeroBall } from "./ball.js";
import { yardballRunScenePorts } from "./runScenePorts.js";

export class YardballCombatState {
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

        const ball = getHeroBall(ctx.state);
        const followX = ball?.x ?? ctx.state.player.x;
        const followY = ball?.y ?? ctx.state.player.y;
        ctx.viewport.snapTo(followX, followY);

        ctx.state.hordeSpawner.beginHorde();
        ctx.state.player.resetTurretCombatState();
        runCombatEnterPersistence(ctx.state);
        requestUiUpdate();
    }

    update(dt, ctx) {
        runCombatTick(ctx, dt);
    }

    render(ctx) {
        const ball = getHeroBall(ctx.state);
        const followX = ball?.x ?? ctx.state.player.x;
        const followY = ball?.y ?? ctx.state.player.y;

        ctx.viewport.updateZoomLimits(ctx.state);
        ctx.viewport.follow(followX, followY);
        ctx.renderer.renderCombatScene(ctx.state, ctx.viewport);
        this._drawGoalRing(ctx);
    }

    /** @param {object} gameCtx — FSM context (`state`, `renderer`, `viewport`) */
    _drawGoalRing(gameCtx) {
        const layout = yardballRunScenePorts.getLayout(gameCtx.state);
        const goal = getGoalPosition(layout);
        if (!goal || gameCtx.state.runScene?.goal?.reached) return;

        const canvasCtx = gameCtx.renderer.ctx;
        const { viewport } = gameCtx;
        const screen = viewport.worldToScreen(goal.x, goal.y);
        const radius = GOAL_RADIUS * viewport.zoom;

        canvasCtx.save();
        canvasCtx.setTransform(1, 0, 0, 1, 0, 0);
        canvasCtx.strokeStyle = "rgba(0, 255, 204, 0.85)";
        canvasCtx.lineWidth = 3;
        canvasCtx.setLineDash([8, 6]);
        canvasCtx.beginPath();
        canvasCtx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
        canvasCtx.stroke();
        canvasCtx.fillStyle = "rgba(0, 255, 204, 0.12)";
        canvasCtx.fill();
        canvasCtx.restore();
    }

    handleInteraction(worldCoords, _isDoubleTap, ctx) {
        if (inspectBridge.isOpen()) return;
        if (ctx.state.runScene?.goal?.reached) return;
        nudgeHeroBall(ctx.state, worldCoords.x, worldCoords.y);
    }

    handlePointerMove(_worldCoords, _screenCoords, _isPrimaryDown, _ctx) {
        // Tap-to-nudge only — no click-drag locomotion.
    }
}

import { COMBAT_HUD_MODE, hudSettings } from "../../../Config/Config.js";
import { getPlayerActors, isWorldScene } from "../../../Core/GamePorts.js";
import { resolveRenderViewer } from "../../../Render/adapters/WorldRenderAdapter.js";
import { drawHostileOffScreenIndicators } from "./OffScreenIndicators.js";
import { CombatParticles } from "./CombatParticles.js";
import { drawTowerDebugOverlay } from "./debugOverlay.js";
/** @param {import("../../../Render/Render.js").Renderer} renderer @param {object} state @param {object | null} viewport */
function drawDebris(renderer, state, viewport) {
    if (!state.pickups) return;
    const { x: px, y: py } = resolveRenderViewer(state, viewport);
    for (let i = 0; i < state.pickups.length; i++) {
        const p = state.pickups[i];
        if (p.isDead || p.strategy?.renderMode !== "debris") continue;
        if (viewport && typeof p.isVisible === "function" && !p.isVisible(viewport)) continue;
        renderer.render3D.drawProp(renderer.ctx, p, px, py);
    }
}
/** @param {import("../../../Render/Render.js").Renderer} renderer @param {object} state @param {object | null} viewport */
function renderExplosions(renderer, state, viewport) {
    if (!state.explosions) return;
    for (const exp of state.explosions) {
        if (viewport && !viewport.isVisible(exp.x, exp.y, exp.maxRadius)) continue;
        const canvasSize = exp.maxRadius * 2;
        if (canvasSize <= 0) continue;
        if (!exp.offCanvas) {
            exp.offCanvas = new OffscreenCanvas(canvasSize, canvasSize);
            exp.offCtx = exp.offCanvas.getContext("2d");
        }
        const offCanvas = exp.offCanvas;
        const offCtx = exp.offCtx;
        const cx = exp.maxRadius;
        const cy = exp.maxRadius;
        offCtx.globalCompositeOperation = "source-over";
        offCtx.clearRect(0, 0, canvasSize, canvasSize);
        offCtx.beginPath();
        offCtx.arc(cx, cy, exp.radius, 0, Math.PI * 2);
        if (exp.currentPhase?.brightFill) {
            offCtx.fillStyle = "rgba(244, 67, 54, 0.6)";
            offCtx.fill();
        } else {
            offCtx.fillStyle = "rgba(139, 0, 0, 0.9)";
            offCtx.fill();
        }
        offCtx.globalCompositeOperation = "destination-out";
        offCtx.fillStyle = "#000000";
        offCtx.save();
        offCtx.translate(cx - exp.x, cy - exp.y);
        renderer.render3D.drawExplosion(exp.x, exp.y, exp.maxRadius, renderer.getWorldRenderInput(state, viewport), offCtx);
        offCtx.restore();
        renderer.ctx.save();
        if (exp.currentPhase?.screenBlend) {
            renderer.ctx.globalCompositeOperation = "screen";
            renderer.ctx.globalAlpha = 1.0;
        } else {
            renderer.ctx.globalCompositeOperation = "source-over";
            renderer.ctx.globalAlpha = exp.opacity !== undefined ? exp.opacity : 1.0;
        }
        renderer.ctx.drawImage(offCanvas, exp.x - exp.maxRadius, exp.y - exp.maxRadius);
        renderer.ctx.restore();
    }
}
/** @param {import("../../../Render/Render.js").Renderer} renderer @param {object} actor @param {object} state @param {object | null} viewport */
function drawActorAndTurrets(renderer, actor, state, viewport) {
    if (!actor || actor.isDead) return;
    if (viewport && typeof actor.isVisible === "function" && !actor.isVisible(viewport)) return;
    if (state.combatHudMode === COMBAT_HUD_MODE.CLASSIC) {
        actor.renderCombatHudClassic(renderer.ctx, renderer);
        return;
    }
    actor.render(renderer.ctx, renderer, state);
}
/** @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y */
function drawTargetMarker(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = "#4CAF50";
    ctx.lineWidth = 2;
    const size = 6;
    ctx.beginPath();
    ctx.moveTo(-size, -size);
    ctx.lineTo(size, size);
    ctx.moveTo(size, -size);
    ctx.lineTo(-size, size);
    ctx.stroke();
    ctx.restore();
}
/** @returns {import("../../../Core/GameDefinitionTypes.js").SimulationEffectPass[]} */
export function createTowerCombatRenderPasses() {
    return [
        {
            zIndex: 19,
            draw(state, viewport, _ctx, renderer) {
                drawDebris(renderer, state, viewport);
            },
        },
        {
            zIndex: 30,
            draw(state, viewport, _ctx, renderer) {
                for (const actor of state.getHostileActors()) drawActorAndTurrets(renderer, actor, state, viewport);
            },
        },
        {
            zIndex: 50,
            draw(state, viewport, _ctx, renderer) {
                for (const actor of getPlayerActors(state)) drawActorAndTurrets(renderer, actor, state, viewport);
            },
        },
        {
            zIndex: 60,
            draw(state, viewport, _ctx, renderer) {
                renderExplosions(renderer, state, viewport);
            },
        },
        {
            zIndex: 75,
            draw(state, viewport, ctx, renderer) {
                for (const actor of state.getCombatants()) {
                    if (viewport && typeof actor.isVisible === "function" && !actor.isVisible(viewport)) continue;
                    actor.renderStatusBars(ctx, renderer, state);
                }
            },
        },
        {
            zIndex: 80,
            draw(state, viewport, ctx) {
                const weaponRange = state.player?.weapon?.range ?? 0;
                if (weaponRange <= 0 || !viewport) return;
                const maskRadius = viewport.getVisualRadius() / viewport.zoom;
                const cx = viewport.x;
                const cy = viewport.y;
                ctx.save();
                ctx.fillStyle = "#000000";
                ctx.beginPath();
                ctx.rect(cx - 10000, cy - 10000, 20000, 20000);
                ctx.arc(cx, cy, maskRadius, 0, Math.PI * 2);
                ctx.fill("evenodd");
                ctx.restore();
            },
        },
        {
            zIndex: 85,
            draw(state, viewport, ctx) {
                if (state.player.queuedTargetX != null && state.player.queuedTargetY != null) {
                    if (!viewport || viewport.isVisible(state.player.queuedTargetX, state.player.queuedTargetY, 6)) drawTargetMarker(ctx, state.player.queuedTargetX, state.player.queuedTargetY);
                } else if (state.player.isMoving && state.player.targetX !== null && state.player.targetY !== null)
                    if (!viewport || viewport.isVisible(state.player.targetX, state.player.targetY, 6)) drawTargetMarker(ctx, state.player.targetX, state.player.targetY);
            },
        },
        {
            zIndex: 86,
            draw(state, viewport, ctx, renderer) {
                if (state.combatHudMode !== COMBAT_HUD_MODE.OVERLAY) return;
                for (const actor of state.getCombatants()) {
                    if (actor.isDead) continue;
                    if (viewport && typeof actor.isVisible === "function" && !actor.isVisible(viewport)) continue;
                    ctx.save();
                    ctx.globalAlpha = hudSettings.combatOverlayAlpha;
                    actor.renderCombatHudClassic(ctx, renderer);
                    ctx.restore();
                }
            },
        },
        {
            zIndex: 200,
            draw(state, viewport, _ctx, renderer) {
                if (!state.debugMode) return;
                drawTowerDebugOverlay(renderer, state, viewport);
            },
        },
    ];
}
/** @param {object} state @param {object} viewport @param {CanvasRenderingContext2D} ctx @param {import("../../../Render/Render.js").Renderer} renderer */
export function drawTowerPostSimulationOverlay(state, viewport, ctx, renderer) {
    CombatParticles.renderAll(ctx, state, viewport);
    if (!viewport || !isWorldScene(state.phase)) return;
    const R = viewport.getVisualRadius();
    const cx = viewport.cx;
    const cy = viewport.cy;
    ctx.save();
    ctx.fillStyle = "#000000";
    ctx.beginPath();
    ctx.rect(0, 0, renderer.canvas.width, renderer.canvas.height);
    ctx.arc(cx, cy, R, 0, Math.PI * 2, true);
    ctx.fill("evenodd");
    ctx.restore();
    drawHostileOffScreenIndicators(ctx, state, viewport);
}
/** @param {import("../../../Render/Render.js").Renderer} renderer @param {object} actor @param {object} state @param {object | null} viewport */
export function drawTowerActorAndTurrets(renderer, actor, state, viewport) {
    drawActorAndTurrets(renderer, actor, state, viewport);
}

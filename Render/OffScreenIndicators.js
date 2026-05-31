import { isWorldScene } from "../GameState/GamePhase.js";

const EDGE_INSET = 14;

function isOnGlobe(viewport, actor) {
    const screen = viewport.worldToScreen(actor.x, actor.y);
    const dx = screen.x - viewport.cx;
    const dy = screen.y - viewport.cy;
    return Math.hypot(dx, dy) <= viewport.getVisualRadius() - 6;
}

function getPlacement(viewport, actor) {
    const screen = viewport.worldToScreen(actor.x, actor.y);
    let dx = screen.x - viewport.cx;
    let dy = screen.y - viewport.cy;
    let len = Math.hypot(dx, dy);
    if (len < 1e-3) {
        dx = 1;
        dy = 0;
        len = 1;
    }
    const R = viewport.getVisualRadius();
    const t = (R - EDGE_INSET) / len;
    return {
        x: viewport.cx + dx * t,
        y: viewport.cy + dy * t,
        angle: Math.atan2(dy, dx),
    };
}

export function drawHostileOffScreenIndicators(ctx, state, viewport) {
    if (!viewport || !isWorldScene(state.phase)) return;

    const hostiles =
        typeof state.getHostileActors === "function" ? state.getHostileActors() : state.enemies ?? [];

    for (const actor of hostiles) {
        if (!actor || actor.isDead || isOnGlobe(viewport, actor)) continue;

        const { x, y, angle } = getPlacement(viewport, actor);
        const color = actor.color ?? "#f44336";

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(7, 0);
        ctx.lineTo(-5, -5);
        ctx.lineTo(-2, 0);
        ctx.lineTo(-5, 5);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.92;
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
    }
}

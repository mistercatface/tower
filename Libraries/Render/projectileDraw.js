/** Stroked bullet tracers ported from OLD_FILES projectiles.js drawProjectiles(). */
import { strokeSegment } from "../Canvas/CanvasPath.js";
const FADE_IN_START_MS = 15;
const FADE_IN_END_MS = 60;
const RIFLE = { tailPx: 12, outlinePx: 2.5, corePx: 1.5, coreColor: "#FFFFEE" };
const PELLET = { tailPx: 8, outlinePx: 3, corePx: 1, coreColor: "#FFDD88" };
export function drawProjectileTracer(ctx, projectile) {
    const age = performance.now() - projectile.spawnTime;
    if (age < FADE_IN_START_MS) return;
    const zoom = ctx.getTransform().a || 1;
    const style = projectile.isPellet ? PELLET : RIFLE;
    const tailLen = style.tailPx / zoom;
    const dirX = Math.cos(projectile.angle);
    const dirY = Math.sin(projectile.angle);
    const tailX = projectile.x - dirX * tailLen;
    const tailY = projectile.y - dirY * tailLen;
    ctx.save();
    ctx.lineCap = "butt";
    if (age < FADE_IN_END_MS) ctx.globalAlpha = (age - FADE_IN_START_MS) / (FADE_IN_END_MS - FADE_IN_START_MS);
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = style.outlinePx / zoom;
    strokeSegment(ctx, projectile.x, projectile.y, tailX, tailY);
    ctx.strokeStyle = style.coreColor;
    ctx.lineWidth = style.corePx / zoom;
    strokeSegment(ctx, projectile.x, projectile.y, tailX, tailY);
    ctx.restore();
}

import { CollisionSystem } from "../../Spatial/CollisionSystem.js";
import { Utilities } from "../../Utilities.js";

export const ExplosionStrategies = {
    standard: {
        update(state, exp, dt, allEvents) {
            if (exp.phase === "expanding") {
                exp.radius += exp.speed * (dt / 1000);

                for (const seg of state.walls) {
                    if (seg.isDead || exp.hitTargets.has(seg)) continue;
                    if (CollisionSystem.checkCircleRect(exp, seg)) {
                        let blocked = false;
                        for (const otherSeg of state.walls) {
                            if (otherSeg === seg || otherSeg.isDead) continue;
                            const dist = Utilities.distToSegment(otherSeg.x, otherSeg.y, exp.x, exp.y, seg.x, seg.y);
                            if (dist < otherSeg.size * 0.5) {
                                blocked = true;
                                break;
                            }
                        }
                        if (!blocked) {
                            allEvents.push({ target: seg, damage: 10 });
                            exp.hitTargets.add(seg);
                        }
                    }
                }

                for (const e of state.enemies) {
                    if (e.isDead || exp.hitTargets.has(e)) continue;
                    if (Math.hypot(e.x - exp.x, e.y - exp.y) <= exp.radius + e.radius) {
                        if (Utilities.hasLineOfSight(exp.x, exp.y, e.x, e.y, state.walls, e.radius)) {
                            allEvents.push({ target: e, damage: exp.damage });
                            exp.hitTargets.add(e);
                        }
                    }
                }

                if (!exp.hitTargets.has(state.planet) && Math.hypot(state.planet.x - exp.x, state.planet.y - exp.y) <= exp.radius + state.planet.radius) {
                    if (Utilities.hasLineOfSight(exp.x, exp.y, state.planet.x, state.planet.y, state.walls, state.planet.radius)) {
                        allEvents.push({ target: state.planet, damage: exp.damage });
                        exp.hitTargets.add(state.planet);
                    }
                }

                for (const p of state.pickups) {
                    if (p.isDead || exp.hitTargets.has(p)) continue;
                    if (Math.hypot(p.x - exp.x, p.y - exp.y) <= exp.radius + p.radius) {
                        if (Utilities.hasLineOfSight(exp.x, exp.y, p.x, p.y, state.walls, p.radius)) {
                            if (p.strategy && p.strategy.onHit) {
                                p.strategy.onHit(state, p, { isDead: false }, allEvents);
                                exp.hitTargets.add(p);
                            }
                        }
                    }
                }

                if (exp.radius >= exp.maxRadius) {
                    exp.radius = exp.maxRadius;
                    exp.phase = "lingering";
                }
            } else if (exp.phase === "lingering") {
                exp.lingerTimer -= dt;
                if (exp.lingerTimer <= 0) {
                    exp.phase = "fading";
                }
            } else if (exp.phase === "fading") {
                exp.fadeTimer -= dt;
                exp.opacity = Math.max(0, exp.fadeTimer / 500);
                if (exp.fadeTimer <= 0) {
                    exp.isDead = true;
                }
            }
        },
        render(ctx, exp, state, renderer) {
            const canvasSize = exp.maxRadius * 2;
            if (canvasSize <= 0) return;
            
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
            if (exp.phase === "expanding") {
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
            renderer.drawExplosion(exp.x, exp.y, exp.maxRadius, state, offCtx);
            offCtx.restore();

            ctx.save();
            if (exp.phase === "expanding") {
                ctx.globalCompositeOperation = "screen";
                ctx.globalAlpha = 1.0;
            } else {
                ctx.globalCompositeOperation = "source-over";
                ctx.globalAlpha = exp.opacity !== undefined ? exp.opacity : 1.0;
            }
            ctx.drawImage(offCanvas, exp.x - exp.maxRadius, exp.y - exp.maxRadius);
            ctx.restore();
        }
    }
};

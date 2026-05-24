import { FloatingText } from "../FloatingText.js";
import { ProgressionManager } from "../ProgressionManager.js";
import { CollisionSystem } from "../Spatial/CollisionSystem.js";
import { SpatialHash } from "../Spatial/SpatialHash.js";
import { Enemy } from "../Entities/Enemy.js";
import { Projectile } from "../Entities/Projectile.js";
import { WeaponSystem } from "../WeaponSystem.js";
import { WallGenerator } from "../Generator/Generator.js";
import { showNodeConfirm } from "../UI.js";
import { Utilities } from "../Utilities.js";

export class MapState {
    onEnter(ctx) {
        ctx.state.phase = "map";
        ctx.updateUI(ctx.state, ctx.upgrades);
    }
    update(dt, ctx) {
        FloatingText.updateAll(ctx.state, dt);
    }
    render(ctx) {
        ctx.viewport.follow(ctx.state.mapPlayerX, ctx.state.mapPlayerY - 200);
        ctx.renderer.render(ctx.state, ctx.viewport);
    }
    handleInteraction(worldCoords, isDoubleTap, ctx) {
        const currentNode = ctx.state.mapNodes.find((n) => n.id === ctx.state.currentNodeId);
        if (!currentNode) return;
        for (const neighborId of currentNode.connections) {
            const neighbor = ctx.state.mapNodes.find((n) => n.id === neighborId);
            const dist = Math.hypot(neighbor.x - worldCoords.x, neighbor.y - worldCoords.y);
            if (dist < 20) {
                showNodeConfirm(neighbor, () => {
                    ctx.state.mapTargetNodeId = neighbor.id;
                    ctx.state.phase = "map_transition";
                });
                break;
            }
        }
    }
}

export class MapTransitionState {
    onEnter(ctx) {
        ctx.state.phase = "map_transition";
    }
    update(dt, ctx) {
        if (ctx.state.updateMapTransition(dt, ctx.viewport)) {
            ctx.updateUI(ctx.state, ctx.upgrades);
        }
        FloatingText.updateAll(ctx.state, dt);
    }
    render(ctx) {
        ctx.viewport.follow(ctx.state.mapPlayerX, ctx.state.mapPlayerY - 200);
        ctx.renderer.render(ctx.state, ctx.viewport);
    }
}

export class CombatState {
    onEnter(ctx) {
        ctx.state.enterCombatPhase();
        WallGenerator.generate(ctx.state);
        const offsetX = ctx.state.mapPlayerX - ctx.viewport.x;
        const offsetY = ctx.state.mapPlayerY - ctx.viewport.y;
        ctx.viewport.snapTo(ctx.state.planet.x - offsetX, ctx.state.planet.y - offsetY);
        ctx.updateUI(ctx.state, ctx.upgrades);
    }

    update(dt, ctx) {
        ctx.state.scheduler.update(dt);
        
        const abilityState = ProgressionManager.updateAbilities(ctx.state, dt, ctx.upgrades);
        if (!abilityState.isDiving && ctx.state.planet.applyQueuedTarget()) {
            ctx.state.gridSystem.buildPlayerFlowField(ctx.state.planet.targetX, ctx.state.planet.targetY);
        }

        const spatialHash = new SpatialHash(50);
        for (const e of ctx.state.enemies) spatialHash.insert(e);
        spatialHash.insert(ctx.state.planet);

        const oldGridPos = ctx.state.gridSystem.worldToGrid(ctx.state.planet.x, ctx.state.planet.y);
        ctx.state.planet.update(dt, ctx.state.gridSystem, ctx.state.walls, spatialHash, abilityState.externalSpeedMod);
        const newGridPos = ctx.state.gridSystem.worldToGrid(ctx.state.planet.x, ctx.state.planet.y);
        if (oldGridPos.col !== newGridPos.col || oldGridPos.row !== newGridPos.row) {
            ctx.state.gridSystem.buildFlowField(ctx.state.planet.x, ctx.state.planet.y);
        }

        ctx.state.waveManager.manageSpawning(dt, ctx.state, ctx.upgrades, ctx.viewport);
        Enemy.updateAll(ctx.state, dt, spatialHash);
        Projectile.updateAll(ctx.state, dt);
        ProgressionManager.updatePickups(ctx.state, dt, ctx.upgrades);

        const turretEvents = WeaponSystem.updateTurretAndWeapon(dt, abilityState.blocksTargeting, ctx.state, ctx.upgrades);
        const collisionEvents = CollisionSystem.run(ctx.state);
        const allEvents = [...turretEvents, ...collisionEvents];

        if (ctx.state.explosions) {
            for (let i = ctx.state.explosions.length - 1; i >= 0; i--) {
                const exp = ctx.state.explosions[i];
                
                if (exp.phase === "expanding") {
                    exp.radius += exp.speed * (dt / 1000);
                    
                    for (const seg of ctx.state.walls) {
                        if (seg.isDead || exp.hitTargets.has(seg)) continue;
                        if (CollisionSystem.checkCircleRect(exp, seg)) {
                            let blocked = false;
                            for (const otherSeg of ctx.state.walls) {
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
                    
                    for (const e of ctx.state.enemies) {
                        if (e.isDead || exp.hitTargets.has(e)) continue;
                        if (Math.hypot(e.x - exp.x, e.y - exp.y) <= exp.radius + e.radius) {
                            if (Utilities.hasLineOfSight(exp.x, exp.y, e.x, e.y, ctx.state.walls, e.radius)) {
                                allEvents.push({ target: e, damage: exp.damage });
                                exp.hitTargets.add(e);
                            }
                        }
                    }
                    
                    if (!exp.hitTargets.has(ctx.state.planet) && Math.hypot(ctx.state.planet.x - exp.x, ctx.state.planet.y - exp.y) <= exp.radius + ctx.state.planet.radius) {
                        if (Utilities.hasLineOfSight(exp.x, exp.y, ctx.state.planet.x, ctx.state.planet.y, ctx.state.walls, ctx.state.planet.radius)) {
                            allEvents.push({ target: ctx.state.planet, damage: exp.damage });
                            exp.hitTargets.add(ctx.state.planet);
                        }
                    }

                    for (const p of ctx.state.pickups) {
                        if (p.isDead || exp.hitTargets.has(p)) continue;
                        if (Math.hypot(p.x - exp.x, p.y - exp.y) <= exp.radius + p.radius) {
                            if (Utilities.hasLineOfSight(exp.x, exp.y, p.x, p.y, ctx.state.walls, p.radius)) {
                                if (p.strategy && p.strategy.onHit) {
                                    p.strategy.onHit(ctx.state, p, { isDead: false }, allEvents);
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
                        ctx.state.explosions.splice(i, 1);
                    }
                }
            }
        }

        for (const event of allEvents) {
            if (event.target && event.target.handleHit) event.target.handleHit(event.damage, ctx);
        }

        FloatingText.updateAll(ctx.state, dt);
        ctx.upgrades.forEach((upg) => upg.update(dt, ctx.state));
        ProgressionManager.processLevelUps(ctx.state, ctx.upgrades);
    }

    render(ctx) {
        ctx.viewport.follow(ctx.state.planet.x, ctx.state.planet.y);
        ctx.renderer.render(ctx.state, ctx.viewport);
    }

    handleInteraction(worldCoords, isDoubleTap, ctx) {
        if (!ctx.state.upgrades["Reposition"] || ctx.state.upgrades["Reposition"].level === 0) return;
        const distFromSpawn = Math.hypot(worldCoords.x - ctx.state.planet.spawnX, worldCoords.y - ctx.state.planet.spawnY);
        if (distFromSpawn <= ctx.state.weapon.range) {
            const gridPos = ctx.state.gridSystem.worldToGrid(worldCoords.x, worldCoords.y);
            if (gridPos.col >= 0 && gridPos.col < ctx.state.gridSystem.cols && gridPos.row >= 0 && gridPos.row < ctx.state.gridSystem.rows) {
                if (ctx.state.gridSystem.grid[gridPos.row * ctx.state.gridSystem.cols + gridPos.col] !== 1) {
                    const targetX = gridPos.col * ctx.state.gridSystem.cellSize + ctx.state.gridSystem.centerX - ctx.state.gridSystem.offsetX + ctx.state.gridSystem.cellSize / 2;
                    const targetY = gridPos.row * ctx.state.gridSystem.cellSize + ctx.state.gridSystem.centerY - ctx.state.gridSystem.offsetY + ctx.state.gridSystem.cellSize / 2;
                    let isDiving = false;
                    ctx.upgrades
                        .filter((u) => u.isAbility && u.triggerType === "double_tap_move" && ctx.state.abilities[u.id])
                        .forEach((upg) => {
                            if (ctx.state.scheduler.getTimeRemaining(ctx.state.abilityTimers[upg.id].activeId) > 0) {
                                isDiving = true;
                            }
                        });
                    if (isDiving) {
                        ctx.state.planet.queueTarget(targetX, targetY);
                    } else {
                        ctx.state.planet.setTarget(targetX, targetY);
                        ctx.state.gridSystem.buildPlayerFlowField(targetX, targetY);
                        if (isDoubleTap) {
                            ctx.upgrades
                                .filter((u) => u.isAbility && u.triggerType === "double_tap_move" && ctx.state.abilities[u.id])
                                .forEach((upg) => {
                                    if (ctx.state.scheduler.getTimeRemaining(ctx.state.abilityTimers[upg.id].cooldownId) <= 0) {
                                        ctx.state.abilityTimers[upg.id].activeId = ctx.state.scheduler.schedule(upg.activeDuration);
                                        ctx.state.abilityTimers[upg.id].cooldownId = ctx.state.scheduler.schedule(upg.cooldown);
                                        if (upg.onTrigger) upg.onTrigger(ctx.state);
                                    }
                                });
                        }
                    }
                }
            }
        }
    }
}

export class RewardState {
    onEnter(ctx) {
        ctx.state.phase = "reward";
        ctx.updateUI(ctx.state, ctx.upgrades);
    }
    update(dt, ctx) {
        FloatingText.updateAll(ctx.state, dt);
    }
    render(ctx) {
        ctx.viewport.follow(ctx.state.planet.x, ctx.state.planet.y);
        ctx.renderer.render(ctx.state, ctx.viewport);
    }
}
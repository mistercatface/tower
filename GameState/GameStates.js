import { FloatingText } from "../FloatingText.js";
import { ProgressionManager } from "../ProgressionManager.js";
import { CollisionSystem } from "../CollisionSystem.js";
import { SpatialHash } from "../SpatialHash.js";
import { Enemy } from "../Enemy.js";
import { Projectile } from "../Entities.js";
import { WeaponSystem } from "../WeaponSystem.js";
import { WallGenerator } from "../Generator.js";
import { showNodeConfirm } from "../UI.js";

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
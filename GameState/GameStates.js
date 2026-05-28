import { ConnectedGenerator } from "../Generator/ConnectedGenerator.js";
import { FloatingText } from "../FloatingText.js";
import { ProgressionManager } from "../ProgressionManager.js";
import { CollisionSystem } from "../Spatial/CollisionSystem.js";
import { SpatialHash } from "../Spatial/SpatialHash.js";
import { Enemy } from "../Entities/Enemy.js";
import { Projectile } from "../Entities/Projectile.js";
import { WeaponSystem } from "../WeaponSystem.js";
import { WallGenerator, spawnPickup } from "../Generator/Generator.js";
import { showNodeConfirm } from "../UI.js";
import { Utilities } from "../Utilities.js";
import { Explosion } from "../Entities/Explosion/Explosion.js";
import { Segment } from "../Entities/Wall.js";
import { pickupSpawnSettings } from "../Config.js";

export class MapState {
    onEnter(ctx) {
        ctx.state.phase = "map";
        ctx.updateUI(ctx.state, ctx.upgrades);
    }
    update(dt, ctx) {
        FloatingText.updateAll(ctx.state, dt);
    }
    render(ctx) {
        ctx.viewport.updateZoomLimits(ctx.state);
        ctx.viewport.follow(ctx.state.mapPlayerX, ctx.state.mapPlayerY - 200);
        ctx.renderer.renderMapScene(ctx.state, ctx.viewport);
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
                    ctx.fsm.transition("map_transition");
                });
                break;
            }
        }
    }
}

export class MapTransitionState {
    onEnter(ctx) {
        ctx.state.phase = "map_transition";
        
        const prevNode = ctx.state.mapNodes.find((n) => n.id === ctx.state.currentNodeId);
        const targetNode = ctx.state.mapNodes.find((n) => n.id === ctx.state.mapTargetNodeId);
        
        if (prevNode && targetNode) {
            ConnectedGenerator.generateConnected(ctx.state, prevNode, targetNode);
        }
        
        const prevCoords = ctx.state.getNodeCombatCoords(prevNode);
        ctx.state.player.x = prevCoords.x;
        ctx.state.player.y = prevCoords.y;
        ctx.state.player.stopMovement();
        ctx.state.player.vx = 0;
        ctx.state.player.vy = 0;

        const targetCoords = ctx.state.getNodeCombatCoords(targetNode);
        ctx.state.player.setTarget(targetCoords.x, targetCoords.y);
        ctx.state.gridSystem.buildPlayerFlowField(targetCoords.x, targetCoords.y);
        
        ctx.viewport.snapTo(ctx.state.player.x, ctx.state.player.y);
        ctx.updateUI(ctx.state, ctx.upgrades);
    }

    update(dt, ctx) {
        const oldGridPos = ctx.state.gridSystem.worldToGrid(ctx.state.player.x, ctx.state.player.y);
        ctx.state.player.update(dt, ctx.state.gridSystem, ctx.state.walls, null);
        const newGridPos = ctx.state.gridSystem.worldToGrid(ctx.state.player.x, ctx.state.player.y);
        if (oldGridPos.col !== newGridPos.col || oldGridPos.row !== newGridPos.row) {
            ctx.state.gridSystem.buildFlowField(ctx.state.player.x, ctx.state.player.y);
        }

        WeaponSystem.updateTurretAndWeapon(dt, true, ctx.state, ctx.upgrades);

        const targetNode = ctx.state.mapNodes.find((n) => n.id === ctx.state.mapTargetNodeId);
        if (targetNode) {
            const targetCoords = ctx.state.getNodeCombatCoords(targetNode);
            const dist = Math.hypot(ctx.state.player.x - targetCoords.x, ctx.state.player.y - targetCoords.y);
            if (dist < 9.0) {
                ctx.state.currentNodeId = targetNode.id;
                ctx.state.mapPlayerX = targetNode.x;
                ctx.state.mapPlayerY = targetNode.y;
                ctx.state.isTransitioningFromTravel = true;
                ctx.fsm.transition("combat");
                return;
            }
        }

        FloatingText.updateAll(ctx.state, dt);
    }

    render(ctx) {
        ctx.viewport.updateZoomLimits(ctx.state);
        ctx.viewport.follow(ctx.state.player.x, ctx.state.player.y);
        ctx.renderer.renderCombatScene(ctx.state, ctx.viewport);
    }

    handleInteraction(worldCoords, isDoubleTap, ctx) {

    }
}

export class CombatState {
    constructor() {
        this.spatialHash = new SpatialHash(50);
    }

    onEnter(ctx) {
        ctx.state.phase = "combat";
        ctx.state.pickups = [];
        ctx.state.projectiles = [];
        ctx.state.explosions = [];
        ctx.state.enemies = [];
        ctx.state.activeLasers = [];
        ctx.state.floatingTexts = [];
        
        const currentNode = ctx.state.mapNodes.find(n => n.id === ctx.state.currentNodeId);
        const combatCoords = ctx.state.getNodeCombatCoords(currentNode);
        ctx.state.player.setSpawnPosition(combatCoords.x, combatCoords.y);
        
        ctx.state.waveManager.startCombat();
        ctx.state.turrets.forEach(t => t.currentLaserLength = 0);
        
        const transitioningFromTravel = ctx.state.isTransitioningFromTravel && ctx.state.travelSourceCoords && ctx.state.travelTargetCoords;

        if (transitioningFromTravel) {
            ctx.state.isTransitioningFromTravel = false;
            
            ctx.state.player.stopMovement();
            ctx.state.player.vx = 0;
            ctx.state.player.vy = 0;
            
            const bx = ctx.state.travelTargetCoords.x;
            const by = ctx.state.travelTargetCoords.y;
            
            ctx.state.gridSystem.centerX = bx;
            ctx.state.gridSystem.centerY = by;
            ctx.state.walls.gridSystem = ctx.state.gridSystem;
            
            ctx.state.gridSystem.rebuild(ctx.state.walls, bx, by);
            
            if (!ctx.state.discoveredAbilities.has("Laser")) {
                spawnPickup(ctx.state, bx, by, pickupSpawnSettings.coinMinRadius, pickupSpawnSettings.coinMaxRadius, "coin");
            }
            spawnPickup(ctx.state, bx, by, pickupSpawnSettings.eyeballMinRadius, pickupSpawnSettings.eyeballMaxRadius, "eyeball");

            const numBarrels = pickupSpawnSettings.barrelMinCount + Math.floor(Math.random() * pickupSpawnSettings.barrelRandomRange);
            for (let i = 0; i < numBarrels; i++) {
                spawnPickup(ctx.state, bx, by, pickupSpawnSettings.barrelMinRadius, pickupSpawnSettings.barrelMaxRadius, "barrel");
            }
        } else {
            ctx.state.player.resetToSpawn();
            ctx.state.walls = [];
            ctx.state.walls.gridSystem = ctx.state.gridSystem;
            ctx.state.gridSystem.centerX = ctx.state.player.x;
            ctx.state.gridSystem.centerY = ctx.state.player.y;
            ctx.state.wallTheme = currentNode.wallTheme || { r: 0, g: 188, b: 212 };

            if (currentNode.wallsData) {
                for (const w of currentNode.wallsData) {
                    ctx.state.walls.push(new Segment(w.x, w.y, w.angle, w.size, w.padding, w.maxHealth));
                }
            }

            ctx.state.gridSystem.rebuild(ctx.state.walls, ctx.state.player.x, ctx.state.player.y);

            if (!ctx.state.discoveredAbilities.has("Laser")) {
                spawnPickup(ctx.state, ctx.state.player.x, ctx.state.player.y, pickupSpawnSettings.coinMinRadius, pickupSpawnSettings.coinMaxRadius, "coin");
            }
            spawnPickup(ctx.state, ctx.state.player.x, ctx.state.player.y, pickupSpawnSettings.eyeballMinRadius, pickupSpawnSettings.eyeballMaxRadius, "eyeball");

            const numBarrels = pickupSpawnSettings.barrelMinCount + Math.floor(Math.random() * pickupSpawnSettings.barrelRandomRange);
            for (let i = 0; i < numBarrels; i++) {
                spawnPickup(ctx.state, ctx.state.player.x, ctx.state.player.y, pickupSpawnSettings.barrelMinRadius, pickupSpawnSettings.barrelMaxRadius, "barrel");
            }
        }
        
        if (!transitioningFromTravel) {
            ctx.viewport.snapTo(ctx.state.player.x, ctx.state.player.y);
        }
        ctx.updateUI(ctx.state, ctx.upgrades);
    }

    update(dt, ctx) {
        const abilityState = ProgressionManager.updateAbilities(ctx.state, dt, ctx.upgrades);
        if (!abilityState.isDiving && ctx.state.player.applyQueuedTarget()) {
            ctx.state.gridSystem.buildPlayerFlowField(ctx.state.player.targetX, ctx.state.player.targetY);
        }

        const spatialHash = this.spatialHash;
        this.spatialHash.clear();
        for (const e of ctx.state.enemies) spatialHash.insert(e);
        spatialHash.insert(ctx.state.player);

        const oldGridPos = ctx.state.gridSystem.worldToGrid(ctx.state.player.x, ctx.state.player.y);
        ctx.state.player.update(dt, ctx.state.gridSystem, ctx.state.walls, spatialHash, abilityState.externalSpeedMod);
        const newGridPos = ctx.state.gridSystem.worldToGrid(ctx.state.player.x, ctx.state.player.y);
        if (oldGridPos.col !== newGridPos.col || oldGridPos.row !== newGridPos.row) {
            ctx.state.gridSystem.buildFlowField(ctx.state.player.x, ctx.state.player.y);
        }

        ctx.state.waveManager.manageSpawning(dt, ctx.state, ctx.upgrades, ctx.viewport);
        Enemy.updateAll(ctx.state, dt, spatialHash);
        Projectile.updateAll(ctx.state, dt);
        ProgressionManager.updatePickups(ctx.state, dt, ctx.upgrades);

        const turretEvents = WeaponSystem.updateTurretAndWeapon(dt, abilityState.blocksTargeting, ctx.state, ctx.upgrades);
        const collisionEvents = CollisionSystem.run(ctx.state);
        const allEvents = [...turretEvents, ...collisionEvents];

        Explosion.updateAll(ctx.state, dt, allEvents);

        for (const event of allEvents) {
            if (event.target && event.target.handleHit) {
                event.target.handleHit(event.damage, ctx, event.type);
            }
        }

        FloatingText.updateAll(ctx.state, dt);
        ctx.upgrades.forEach((upg) => upg.update(dt, ctx.state));
        ProgressionManager.processLevelUps(ctx.state, ctx.upgrades);
    }

    render(ctx) {
        ctx.viewport.updateZoomLimits(ctx.state);
        ctx.viewport.follow(ctx.state.player.x, ctx.state.player.y);
        ctx.renderer.renderCombatScene(ctx.state, ctx.viewport);
    }

    handleInteraction(worldCoords, isDoubleTap, ctx) {
        if (ctx.state.player.currentState && ctx.state.player.currentState.blocksInput) return;
        if (!ctx.state.player.canReposition(ctx.state)) return;
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
                    ctx.state.player.queueTarget(targetX, targetY);
                } else {
                    ctx.state.player.setTarget(targetX, targetY);
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

export class RewardState {
    onEnter(ctx) {
        ctx.state.phase = "reward";
        ctx.updateUI(ctx.state, ctx.upgrades);
    }
    update(dt, ctx) {
        FloatingText.updateAll(ctx.state, dt);
    }
    render(ctx) {
        ctx.viewport.updateZoomLimits(ctx.state);
        ctx.viewport.follow(ctx.state.player.x, ctx.state.player.y);
        ctx.renderer.renderCombatScene(ctx.state, ctx.viewport);
    }
}
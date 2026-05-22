import { FloatingText } from "../FloatingText.js";
import { ProgressionManager } from "../ProgressionManager.js";
import { CollisionSystem } from "../CollisionSystem.js";
import { SpatialHash } from "../SpatialHash.js";
import { WaveManager } from "../WaveManager.js";
import { Enemy } from "../Enemy.js";
import { Projectile } from "../Entities.js";
import { WeaponSystem } from "../WeaponSystem.js";
import { CombatManager } from "../CombatManager.js";
import { WallGenerator } from "../Generator.js";

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

        WaveManager.manageSpawning(dt, ctx.state, ctx.upgrades, ctx.viewport);
        Enemy.updateAll(ctx.state, dt, spatialHash);
        Projectile.updateAll(ctx.state, dt);
        ProgressionManager.updatePickups(ctx.state, dt, ctx.upgrades);

        const turretEvents = WeaponSystem.updateTurretAndWeapon(dt, abilityState.blocksTargeting, ctx.state, ctx.upgrades);
        const collisionEvents = CollisionSystem.run(ctx.state);
        const allEvents = [...turretEvents, ...collisionEvents];

        for (const event of allEvents) {
            if (event.type === "enemyHit") {
                CombatManager.handleEnemyHit(event.enemy, event.damage, ctx.state, ctx.upgrades);
            } else if (event.type === "planetHit") {
                CombatManager.handlePlanetHit(event.damage, ctx.state);
            } else if (event.type === "wallHit") {
                CombatManager.handleWallHit(event.segment, event.damage, ctx.state);
            }
        }

        FloatingText.updateAll(ctx.state, dt);
        ctx.upgrades.forEach((upg) => upg.update(dt, ctx.state));
        ProgressionManager.processLevelUps(ctx.state, ctx.upgrades);
    }
    render(ctx) {
        ctx.viewport.follow(ctx.state.planet.x, ctx.state.planet.y);
        ctx.renderer.render(ctx.state, ctx.viewport);
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
import { navigationSettings, NAV_PROFILES } from "../../Config/Config.js";
import { resolveMoveTarget } from "../../Libraries/Pathfinding/PathClearance.js";
import { wakeAllPushables } from "../../Libraries/Motion/pushablePhysicsPass.js";
import { requestUiUpdate } from "../../Core/EventSystem.js";
import { Pools } from "../../Core/Pools.js";
import { syncSurfaceProfile } from "../../Render/game/surfaceProfileResolver.js";

export const MAP_TRAVEL_SPEED = 5.0;

function runPersistentSectorEnter(state) {
    syncSurfaceProfile(state);
    wakeAllPushables(state);
    const persistentEntities = [...state.getAllies(), ...state.pickups];
    for (const entity of persistentEntities) {
        if (typeof entity.onSectorEnter === "function") entity.onSectorEnter(state);
    }
}

function clearTravelCombatDebris(state) {
    if (state.projectiles) {
        for (let i = 0; i < state.projectiles.length; i++) {
            Pools.projectiles.release(state.projectiles[i]);
        }
    }
    state.projectiles = [];
    state.explosions = [];
    state.activeLasers = [];
    state.combatParticles = [];
    state.ragdollCorpses = [];
    state.enemies = [];
    state.floatingTexts = [];
    for (const pickup of state.pickups) {
        if (pickup.currentStateName === "on_fire") {
            pickup.changeState("normal");
            if (pickup.maxHealth != null) pickup.health = pickup.maxHealth;
        }
    }
}

export function beginMapTravel(ctx) {
    const targetNode = ctx.state.getMapTargetNode();
    if (!targetNode) return;
    ctx.state.waveManager.waveClearScheduled = false;
    ctx.state.isTransitioning = false;
    if (ctx.state.waveManager.spawnIntervalId) {
        ctx.state.scheduler.cancel(ctx.state.waveManager.spawnIntervalId);
        ctx.state.waveManager.spawnIntervalId = null;
    }
    clearTravelCombatDebris(ctx.state);
    const targetCoords = ctx.state.getNodeCombatCoords(targetNode);
    const clearance = ctx.state.player.radius + navigationSettings.pathClearanceMargin;
    const target = resolveMoveTarget(ctx.state.obstacleGrid, targetCoords.x, targetCoords.y, clearance);
    ctx.state.player.setTarget(target.x, target.y, ctx.state);
    ctx.state.flowFieldGrid.shiftCenter(ctx.state.player.x, ctx.state.player.y, ctx.state.player.x, ctx.state.player.y, target.x, target.y);
    ctx.state.navigation.steerTo(ctx.state.player, target.x, target.y, NAV_PROFILES.mapTravel, ctx.state.flowFieldGrid, ctx.state);
    requestUiUpdate();
}

export function completeMapTravel(ctx) {
    const targetNode = ctx.state.getMapTargetNode();
    if (!targetNode) return false;
    const targetCoords = ctx.state.getNodeCombatCoords(targetNode);
    const clearance = ctx.state.player.radius + navigationSettings.pathClearanceMargin;
    const target = resolveMoveTarget(ctx.state.obstacleGrid, targetCoords.x, targetCoords.y, clearance);
    const dist = Math.hypot(ctx.state.player.x - target.x, ctx.state.player.y - target.y);
    if (dist >= 9.0) return false;
    ctx.state.currentNodeId = targetNode.id;
    ctx.state.mapPlayerX = targetNode.x;
    ctx.state.mapPlayerY = targetNode.y;
    ctx.state.mapTargetNodeId = null;
    ctx.state.player.stopMovement(ctx.state);
    ctx.state.waveManager.startCombat();
    ctx.state.player.resetTurretCombatState();
    runPersistentSectorEnter(ctx.state);
    requestUiUpdate();
    return true;
}

export function runPersistentSectorEnterOnNode(state) {
    runPersistentSectorEnter(state);
}

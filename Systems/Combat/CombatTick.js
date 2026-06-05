import { FloatingText } from "../../Render/FloatingText.js";
import { CombatParticles } from "../../Render/CombatParticles.js";
import { RagdollCorpse } from "../../Entities/RagdollCorpse.js";
import { ProgressionManager } from "../../Progression/ProgressionManager.js";
import { combatSpatial } from "../World/CombatSpatialFrame.js";
import { Projectile } from "../../Entities/Projectile.js";
import { Explosion } from "../../Entities/Explosion/Explosion.js";
import { updateStartNodeIntro } from "../../Combat/StartNodeIntro.js";
import { runPushablePhysics } from "./combatPhysics.js";

/** @param {object[]} events @param {object} ctx */
function dispatchCombatEvents(events, ctx) {
    for (const event of events) {
        if (event.target?.handleHit) event.target.handleHit(event.damage, ctx, event.type, event);
    }
}

/**
 * Ordered combat simulation pass for CombatState.
 *
 * @param {object} ctx — FSM context `{ state, upgrades, viewport, ... }`
 * @param {number} dt
 */
export function runCombatTick(ctx, dt) {
    const abilityState = ProgressionManager.updateAbilities(ctx.state, dt, ctx.upgrades);
    if (!abilityState.isDiving && ctx.state.player.applyQueuedTarget(ctx.state)) ctx.state.navigation.rebuildPlayerFlowField(ctx.state.player.targetX, ctx.state.player.targetY);
    const spatialFrame = combatSpatial.begin(ctx.state);
    const oldGridPos = ctx.state.flowFieldGrid.worldToGrid(ctx.state.player.x, ctx.state.player.y);
    const events = ctx.state.beginCombatEvents();
    ctx.state.updateAllCombatants(dt, spatialFrame, { externalSpeedMod: abilityState.externalSpeedMod, upgrades: ctx.upgrades, combatEvents: events });
    ctx.state.navigation.updateFlowField({
        playerX: ctx.state.player.x,
        playerY: ctx.state.player.y,
        playerTargetX: ctx.state.player.isMoving ? ctx.state.player.targetX : null,
        playerTargetY: ctx.state.player.isMoving ? ctx.state.player.targetY : null,
        previousGridPos: oldGridPos,
    });
    updateStartNodeIntro(ctx.state);
    ctx.state.waveManager.manageSpawning(dt, ctx.state, ctx.upgrades, ctx.viewport);
    Projectile.checkSpawnCollisions(ctx.state, spatialFrame, events);
    Projectile.updateAll(ctx.state, dt);
    CombatParticles.updateAll(ctx.state, dt);
    RagdollCorpse.updateAll(ctx.state, dt, spatialFrame);
    runPushablePhysics(ctx.state, dt, spatialFrame, events);
    Explosion.updateAll(ctx.state, dt, events, spatialFrame);
    dispatchCombatEvents(events, ctx);
    FloatingText.updateAll(ctx.state, dt);
    ctx.upgrades.forEach((upg) => upg.update(dt, ctx.state));
    ProgressionManager.processLevelUps(ctx.state, ctx.upgrades);
    ctx.state.worldSurfaces.updateFills();
}

/**
 * Lighter tick for InspectorState — party movement + pushables, no waves/projectiles.
 *
 * @param {object} ctx
 * @param {number} dt
 */
export function runInspectorTick(ctx, dt) {
    const abilityState = ProgressionManager.updateAbilities(ctx.state, dt, ctx.upgrades);
    if (!abilityState.isDiving && ctx.state.player.applyQueuedTarget(ctx.state))  ctx.state.navigation.rebuildPlayerFlowField(ctx.state.player.targetX, ctx.state.player.targetY);
    const spatialFrame = combatSpatial.begin(ctx.state);
    const oldGridPos = ctx.state.flowFieldGrid.worldToGrid(ctx.state.player.x, ctx.state.player.y);
    const partyOpts = { externalSpeedMod: abilityState.externalSpeedMod, upgrades: ctx.upgrades, blocksTargeting: true };
    for (const actor of ctx.state.getPlayerActors()) actor.updateCombat(dt, ctx.state, spatialFrame, partyOpts);
    ctx.state.navigation.updateFlowField({
        playerX: ctx.state.player.x,
        playerY: ctx.state.player.y,
        playerTargetX: ctx.state.player.isMoving ? ctx.state.player.targetX : null,
        playerTargetY: ctx.state.player.isMoving ? ctx.state.player.targetY : null,
        previousGridPos: oldGridPos,
    });
    const events = ctx.state.beginCombatEvents();
    runPushablePhysics(ctx.state, dt, spatialFrame, events);
    dispatchCombatEvents(events, ctx);
    FloatingText.updateAll(ctx.state, dt);
}

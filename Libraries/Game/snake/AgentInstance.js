import { getConnectedBodyIds, getConnectedComponentPath, getLinearChainOrderedMembers } from "../../Motion/kineticConstraintGraph.js";
import { clearChainLinksForMembers, clearChainLinksForProp, removeChainLinkBetween } from "../../Sandbox/chainLinks.js";
import { growChainSegment } from "../../Sandbox/spawnLinkedBallChain.js";
import { removeSandboxWorldProp } from "../../Sandbox/sandboxPlacedSpawn.js";
import { createCellTargetHpaNav } from "../../Sandbox/groundNav/cellTargetHpaNav.js";
import { getSandboxEntityMeta } from "../../../GameState/sandboxEntityMeta.js";
import { getSnakeGameConfig } from "./snakeGameConfig.js";
import { registerInertAgent } from "../../AI/agents/AgentProfiles.js";
import { clearGroundRollDrive } from "../../Sandbox/kineticRollActuator.js";
import { markSnakeSegmentsFracturable } from "./snakeSegmentFracture.js";
import { AGENT_PROFILE, getAgentProfile, isAliveAgentHead } from "../../AI/agents/AgentProfiles.js";
import { getAgentIdentity } from "../../AI/identity/agentIdentity.js";
import { GroundNavIntentAdapter } from "./GroundNavIntentAdapter.js";
import { ensureSnakePerceptionTick, maybeBeginSnakeAutosimTick, endSnakePerceptionFrame } from "./snakePerception.js";
import { getObserverVisionFrame } from "../../Navigation/perception/observerVisionFrame.js";
import { createSpatialCellMemory } from "../../AI/brain/brain.js";
import { RangedCombatActionState, resolveRangedWeapon } from "./GroundNavIntentAdapter.js";
import { getCirclePropRadius } from "../../Props/propScale.js";
import { SNAKE_CHAIN_EXPORT_TYPE } from "./snakeScene.js";
import { canAgentEatSnakeFood, isSnakeFoodTarget } from "./snakeFood.js";
import { rotateAngleTowards } from "../../Math/Angle.js";
import { getPropVisualTint, setPropVisualTint } from "../../Color/visualOverride.js";
import { syncKineticRigidBody } from "../../Motion/bodyMass.js";
import { COMBAT_TRAIT_DEFAULTS, isChainCombatTopology, shouldSkipPreyHeadRamKill } from "./snakeCombat.js";
export class AgentInstance {
    constructor(state, { profileId, head, spawnGroupId, lifecycle = "alive", memberIds = [] }) {
        this.profileId = profileId;
        this.head = head;
        this.spawnGroupId = spawnGroupId;
        this.lifecycle = lifecycle;
        this.memberIds = memberIds;
        this.memberProps = [];
        this.steeringEpoch = 0;
        this.segmentWallPressures = new Map();
        this.accumulatedPressure = 0;
        this.peakPressure = 0;
        this.isHeadRouteValid = false;
        this.sprinting = false;
        this.intent = null;
        this.brain = null;
        this.equippedWeapon = null;
        const profile = getAgentProfile(profileId);
        const hasWeapon = !!(profile.weapon || profile.decision?.modes?.shoot_enemy);
        this.ammo = profile.initialAmmo ?? (hasWeapon ? 10 : 0);
        this.profile = profile;
        this.metabolism = new AgentMetabolism(profile);
        this.baseTint = profile.useFactionTint ? (getAgentIdentity(this.headId)?.color ?? null) : null;
        this.bodyGameplay = profile.gameplay.body;
        this.walkMaxSpeed = profile.gameplay.leader.maxSpeed;
        this.walkAccel = profile.gameplay.leader.accel;
        if (profile.sprint) {
            this.sprintMaxSpeed = this.walkMaxSpeed * profile.sprint.speedMultiplier;
            this.sprintAccel = this.walkAccel * profile.sprint.accelMultiplier;
            this.sprintHungerDrainMultiplier = profile.sprint.hungerDrainMultiplier ?? 1;
        }
        this.minAliveSegmentCount = profile.minAliveSegmentCount ?? 1;
        const config = getSnakeGameConfig();
        const headRadius = getCirclePropRadius(head);
        this.eatRadius = headRadius + config.foodPickupRadius + config.eatMargin;
        this.visionRange = config.shared.visionRange;
        this.splitImpulseThreshold = config.splitImpulseThreshold;
        this.combatTraits = { ...COMBAT_TRAIT_DEFAULTS, ...profile.combat };
        this.relationshipRules = bakeRelationshipRules(profile, config);
        this.resolvedWeapon = resolveRangedWeapon(this, profile, this.visionRange.range);
        this.aimTurnRadPerSec = this.resolvedWeapon?.aimRotationRadPerSec ?? DEFAULT_BALL_FACING_TURN_RAD_PER_SEC;
        const combatMovement = this.resolvedWeapon?.combatMovement;
        if (combatMovement) {
            this.combatStrafeMaxSpeed = this.walkMaxSpeed * (combatMovement.speedFraction ?? 0.5);
            this.combatStrafeAccel = this.walkAccel * (combatMovement.accelFraction ?? 0.6);
        }
        this.combatAction = this.resolvedWeapon || profile?.decision?.modes?.shoot_enemy ? new RangedCombatActionState() : null;
        const session = state.sandbox.snakeGame;
        this.session = session;
        this.navWalkable = session.navWalkable;
        this.entityRegistry = state.entityRegistry;
        this.kinetic = state.kinetic;
        this.entityMeta = getSandboxEntityMeta(state);
        this.headNav = createCellTargetHpaNav(state);
        this.syncMembersFromGraph();
        this.autosim = new AgentAutosim(state, this);
    }
    get headId() {
        return this.head.id;
    }
    start() {
        this.grantSteeringLease();
        this.autosim.start();
    }
    stopSteering() {
        this.revokeSteeringLease();
        this.autosim.stop();
    }
    grantSteeringLease() {
        this.steeringEpoch = (this.steeringEpoch ?? 0) + 1;
        const head = this.head;
        head._snakeSteering = { headId: this.headId, epoch: this.steeringEpoch };
    }
    revokeSteeringLease() {
        this.steeringEpoch = (this.steeringEpoch ?? 0) + 1;
        const head = this.head;
        clearSnakeSteeringLeaseFromProp(head);
        head._snakeSteering = { headId: this.headId, epoch: this.steeringEpoch - 1 };
    }
    segmentCount(members = null) {
        return (members || this.memberIds).length;
    }
    enforceMinLength(state, members = null) {
        if (this.segmentCount(members) >= this.minAliveSegmentCount) return false;
        this.kill(state, members);
        return true;
    }
    kill(state, members = null, deathImpact = null) {
        if (!isChainCombatTopology(this.combatTraits)) return null;
        this.die(state, deathImpact);
        return this;
    }
    isSteerable() {
        if (this.lifecycle !== "alive") return false;
        if (this.head.isDead) return false;
        if (this.profile.topology === "single") return true;
        if (!this.entityMeta.isChainHead(this.headId)) return false;
        if (this.profile.topology === "cluster") return getConnectedBodyIds(this.kinetic, this.headId).includes(this.headId);
        const members = getConnectedComponentPath(this.kinetic, this.headId);
        if (members[0] !== this.headId) return false;
        if (members.length < this.minAliveSegmentCount) return false;
        return true;
    }
    syncMembersFromGraph() {
        const registry = this.session.registry;
        for (let i = 0; i < this.memberIds.length; i++) if (registry.instancesByMemberId.get(this.memberIds[i]) === this) registry.instancesByMemberId.delete(this.memberIds[i]);
        if (this.profile.topology === "cluster") this.memberIds = getConnectedBodyIds(this.kinetic, this.headId);
        else if (this.profile.topology === "chain") this.memberIds = getConnectedComponentPath(this.kinetic, this.headId);
        else this.memberIds = [this.headId];
        this.memberProps.length = 0;
        for (let i = 0; i < this.memberIds.length; i++) {
            const prop = this.entityRegistry.getLive(this.memberIds[i]);
            if (prop) this.memberProps.push(prop);
            registry.instancesByMemberId.set(this.memberIds[i], this);
        }
        return this.memberIds;
    }
    syncBallAgentFacingAfterPhysics(dtMs) {
        if (this.combatTraits.topology !== "ball") return;
        const decisionCtx = this.intent?.getDecisionContext();
        const combat = decisionCtx?.combatState;
        const enemy = combat?.visibleEnemy ?? combat?.enemy;
        const hasLos = combat?.hasLineOfSight;
        if (enemy && hasLos && !enemy.isDead) {
            syncBallAgentFacingToTarget(this.head, enemy, dtMs, this.aimTurnRadPerSec);
            return;
        }
        if (!shouldSyncBallAgentFacingToVelocity(this.combatAction, this.intent)) return;
        syncBallAgentFacingToVelocity(this.head, dtMs, this.aimTurnRadPerSec);
    }
    orderedMembers(state) {
        return getLinearChainOrderedMembers(state.kinetic, this.headId);
    }
    updatePressureDiagnostics(state) {
        if (!this.profile.species?.pressureDiagnostics) return;
        if (this.lifecycle !== "alive") {
            this.segmentWallPressures.clear();
            this.accumulatedPressure = 0;
            this.peakPressure = 0;
            this.isHeadRouteValid = false;
            return;
        }
        if (this.head.isSleeping) {
            let hasActive = false;
            for (const [segmentId, record] of this.segmentWallPressures.entries()) {
                record.pressure *= 0.8;
                record.frameCount = 0;
                if (record.pressure < 0.01) this.segmentWallPressures.delete(segmentId);
                else hasActive = true;
            }
            if (!hasActive) {
                this.accumulatedPressure = 0;
                this.peakPressure = 0;
            } else {
                let totalPressure = 0;
                let peakPressure = 0;
                for (const record of this.segmentWallPressures.values()) {
                    totalPressure += record.pressure;
                    if (record.pressure > peakPressure) peakPressure = record.pressure;
                }
                this.accumulatedPressure = totalPressure;
                this.peakPressure = peakPressure;
            }
            this.isHeadRouteValid = false;
            return;
        }
        const members = this.syncMembersFromGraph();
        const activeIds = new Set(members);
        for (const segmentId of this.segmentWallPressures.keys()) if (!activeIds.has(segmentId)) this.segmentWallPressures.delete(segmentId);
        for (let i = 0; i < this.memberProps.length; i++) {
            const prop = this.memberProps[i];
            const segmentId = prop.id;
            const bodyWallHits = prop._wallResolveHits ?? [];
            const linkWallHits = prop._linkWallHits ?? [];
            const allHits = [...bodyWallHits, ...linkWallHits];
            let record = this.segmentWallPressures.get(segmentId);
            if (allHits.length > 0) {
                let worstHit = allHits[0];
                for (let j = 1; j < allHits.length; j++) if ((allHits[j].overlap ?? 0) > (worstHit.overlap ?? 0)) worstHit = allHits[j];
                if (!record) {
                    record = { segmentId, normalX: worstHit.normalX, normalY: worstHit.normalY, pressure: 0, frameCount: 0, peakOverlap: 0 };
                    this.segmentWallPressures.set(segmentId, record);
                }
                record.normalX = worstHit.normalX;
                record.normalY = worstHit.normalY;
                const overlap = worstHit.overlap ?? 1.0;
                record.pressure = record.pressure * 0.9 + overlap;
                record.frameCount = (record.frameCount ?? 0) + 1;
                record.peakOverlap = Math.max(record.peakOverlap ?? 0, overlap);
            } else if (record) {
                record.pressure *= 0.8;
                record.frameCount = 0;
                if (record.pressure < 0.01) this.segmentWallPressures.delete(segmentId);
            }
        }
        let totalPressure = 0;
        let peakPressure = 0;
        for (const record of this.segmentWallPressures.values()) {
            totalPressure += record.pressure;
            if (record.pressure > peakPressure) peakPressure = record.pressure;
        }
        this.accumulatedPressure = totalPressure;
        this.peakPressure = peakPressure;
        this.isHeadRouteValid = false;
        if (this.autosim.isActive()) this.isHeadRouteValid = this.autosim.getPathOverlay() != null;
    }
    retireMemberSegments(state, memberIds) {
        const meta = getSandboxEntityMeta(state);
        for (let i = 0; i < memberIds.length; i++) {
            const prop = state.entityRegistry.get(memberIds[i]);
            if (!prop) continue;
            meta.setChainHead(memberIds[i], false);
            if (prop._snakeSteering) clearSnakeSteeringLeaseFromProp(prop);
            else clearGroundRollDrive(prop);
            prop.navStepPenalty = null;
        }
    }
    memberIdsForTeardown(snakeGame, connectedMembers) {
        const ids = new Set(connectedMembers);
        for (const entry of snakeGame.registry.inertByLeadId.values()) {
            if (entry.sourceHeadId !== this.headId) continue;
            for (let i = 0; i < entry.memberIds.length; i++) ids.add(entry.memberIds[i]);
        }
        return [...ids];
    }
    retireAllSegments(state, connectedMembers = null) {
        const members = connectedMembers ?? this.syncMembersFromGraph();
        const resolvedMembers = this.memberIdsForTeardown(this.session, members);
        this.retireMemberSegments(state, resolvedMembers);
        return resolvedMembers;
    }
    shedTailFromStarvation(state) {
        if (this.memberIds.length <= this.minAliveSegmentCount) return null;
        const tailId = this.memberIds[this.memberIds.length - 1];
        const prevId = this.memberIds[this.memberIds.length - 2];
        const tail = this.entityRegistry.getLive(tailId);
        removeChainLinkBetween(state, prevId, tailId);
        clearChainLinksForProp(state, tailId);
        this.retireMemberSegments(state, [tailId]);
        tail.snakeFoodValue = this.profile.metabolism?.growthCost ?? getSnakeGameConfig().agentProfiles.snake.metabolism.growthCost;
        markSnakeSegmentsFracturable(state, [tailId]);
        this.memberIds.pop();
        this.memberProps.pop();
        return tailId;
    }
    tickMetabolism(state, dtMs, drainMultiplier = 1) {
        const metabolism = this.metabolism;
        const starving = metabolism.advanceHunger(dtMs, drainMultiplier);
        if (!starving || metabolism.starveShedIntervalMs === null) return false;
        let shed = false;
        while (metabolism.starveMs >= metabolism.starveShedIntervalMs) {
            if (!this.shedTailFromStarvation(state)) {
                metabolism.starveMs = 0;
                break;
            }
            metabolism.starveMs -= metabolism.starveShedIntervalMs;
            shed = true;
        }
        return shed;
    }
    applySprintMovementIntent() {
        this.sprinting = this.intent.sprintWanted && this.metabolism.hunger > 0;
        const groundNav = this.head.strategy.groundNav;
        if (this.sprinting) {
            groundNav.maxSpeed = this.sprintMaxSpeed;
            groundNav.accel = this.sprintAccel;
        } else if (this.combatStrafeMaxSpeed != null && this.intent.getMode() === "shoot_enemy") {
            groundNav.maxSpeed = this.combatStrafeMaxSpeed;
            groundNav.accel = this.combatStrafeAccel;
        } else {
            groundNav.maxSpeed = this.walkMaxSpeed;
            groundNav.accel = this.walkAccel;
        }
    }
    hungerDrainMultiplier() {
        return this.sprinting ? this.sprintHungerDrainMultiplier : 1;
    }
    resolveChainTailProp() {
        for (let i = this.memberProps.length - 1; i >= 0; i--) {
            const tail = this.memberProps[i];
            if (tail && !tail.isDead) return tail;
        }
    }
    growOneSegment(state) {
        const profile = this.profile;
        const segmentRadius = getCirclePropRadius(this.head);
        const spacing = segmentRadius * 2 * (profile.linkSlack ?? 1);
        const newTail = growChainSegment(state, this.resolveChainTailProp(), {
            spacing,
            segmentRadius,
            linkSlack: profile.linkSlack,
            ballType: profile.bodyPropId,
            growDirX: profile.growDirX ?? -1,
            growDirY: profile.growDirY ?? 0,
            exportType: SNAKE_CHAIN_EXPORT_TYPE,
        });
        copySnakeChainTintFromHead(this.head, newTail);
        applyAgentGameplay(this.bodyGameplay, newTail);
        this.memberIds.push(newTail.id);
        this.memberProps.push(newTail);
    }
    feedAndGrow(state, value) {
        let pending = this.metabolism.feed(value);
        const maxAliveSegmentCount = this.profile.maxAliveSegmentCount ?? 8;
        while (pending > 0 && this.memberProps.length < maxAliveSegmentCount) {
            this.growOneSegment(state);
            pending--;
        }
    }
    consumeTargetAndResetNavigation(state, target) {
        const seeker = this.head;
        const targetRadius = getCirclePropRadius(target) ?? 0;
        if (Math.hypot(target.x - seeker.x, target.y - seeker.y) > this.eatRadius + targetRadius) return false;
        const grid = state.obstacleGrid;
        const idx = grid.worldCol(target.x) + grid.worldRow(target.y) * grid.cols;
        this.brain.stampArrival(idx);
        this.intent.clearTrackedGoal();
        this.headNav.clearDestination();
        removeSandboxWorldProp(state, target);
        return true;
    }
    eatFoodTarget(state, food) {
        if (!canAgentEatSnakeFood(this.head, food) || !isSnakeFoodTarget(food)) return false;
        if (!this.consumeTargetAndResetNavigation(state, food)) return false;
        const foodValue = food.snakeFoodValue ?? this.profile.metabolism?.foodValue;
        if (this.profileId === AGENT_PROFILE.snake) this.feedAndGrow(state, foodValue);
        else this.metabolism.feed(foodValue);
        return true;
    }
    collectAmmoTarget(state, ammoProp) {
        if (ammoProp.type !== "ammo_shard" || ammoProp.isDead) return false;
        if (!this.consumeTargetAndResetNavigation(state, ammoProp)) return false;
        this.ammo += ammoProp.ammoValue ?? 1;
        return true;
    }
    canConsumeByReach(decisionCtx, spec) {
        if (!decisionCtx || !spec) return false;
        if (decisionCtx.routeStatus?.destReached) return true;
        const reach = decisionCtx.reachSteps?.[spec.slot];
        const maxReach = spec.reachSteps ?? 0;
        if (!Number.isFinite(reach)) return false;
        return reach <= maxReach;
    }
    tryConsumeCommittedTarget(state, mode, target, decisionCtx) {
        const spec = this.profile.intent?.consumables?.[mode];
        if (!spec || !target || target.isDead) return false;
        if (!this.canConsumeByReach(decisionCtx, spec)) return false;
        switch (spec.handler) {
            case "food":
                return this.eatFoodTarget(state, target);
            case "ammo":
                return this.collectAmmoTarget(state, target);
            default:
                return false;
        }
    }
    severInertTail(state, tailIds) {
        this.retireMemberSegments(state, tailIds);
        markSnakeSegmentsFracturable(state, tailIds);
        registerInertAgent(this.session.registry, tailIds[0], tailIds, this.headId);
    }
    die(state, deathImpact = null) {
        this.session.speciesById.get(this.profileId).die(this, state, deathImpact);
    }
    splitAtStruckSegment(state, struckSegmentId, victimMembers = null, deathImpact = null) {
        if (!this.combatTraits.canSplit) return null;
        const members = victimMembers ?? getConnectedComponentPath(state.kinetic, this.headId);
        const strikeIndex = members.indexOf(struckSegmentId);
        if (strikeIndex < 0 || strikeIndex >= members.length - 1) return null;
        const linkA = members[strikeIndex];
        const linkB = members[strikeIndex + 1];
        if (!removeChainLinkBetween(state, linkA, linkB)) return null;
        const aliveIds = members.slice(0, strikeIndex + 1);
        const tailIds = members.slice(strikeIndex + 1);
        this.severInertTail(state, tailIds);
        this.memberIds = aliveIds;
        if (aliveIds.length < this.minAliveSegmentCount) this.die(state, deathImpact);
        return { aliveHeadId: this.headId, aliveIds, inertLeadId: tailIds[0], inertIds: tailIds };
    }
    receiveBodyStrike(state, struckSegmentId, strikerInstance, strikerBodyId, relSpeed, deathImpact, victimMembers = null) {
        const traits = this.combatTraits;
        // 1. Flee Escape Ram
        if (traits.victimOfFleeEscapeRam) {
            const strikerTraits = strikerInstance.combatTraits;
            if (strikerTraits.fleeEscapeRam) {
                const areTeammates = resolveRelationshipForInstances(strikerInstance, this) === "ally" || (this.head.faction != null && this.head.faction === strikerInstance.head.faction);
                if (!areTeammates)
                    if (strikerInstance.sprinting && relSpeed >= this.splitImpulseThreshold)
                        if (strikerInstance.intent.getMode() === "flee")
                            if (strikerBodyId === strikerInstance.headId && struckSegmentId !== this.headId) return this.splitAtStruckSegment(state, struckSegmentId, victimMembers, deathImpact);
            }
        }
        // 2. Head Strike Ram
        if (traits.victimOfHeadStrikeRam) {
            const strikerTraits = strikerInstance.combatTraits;
            if (isChainCombatTopology(traits) && isChainCombatTopology(strikerTraits))
                if (relSpeed >= this.splitImpulseThreshold)
                    if (strikerBodyId === strikerInstance.headId && struckSegmentId !== this.headId) return this.splitAtStruckSegment(state, struckSegmentId, victimMembers, deathImpact);
        }
        return null;
    }
    receivePreyStrike(state, struckBodyId, predatorInstance, predatorBodyId, relSpeed, deathImpact) {
        const preyTraits = this.combatTraits;
        const predatorTraits = predatorInstance.combatTraits;
        const chainVsBallPrey = isChainCombatTopology(predatorTraits) && !isChainCombatTopology(preyTraits);
        const predatorStrikes = chainVsBallPrey || predatorBodyId === predatorInstance.headId;
        const speedOk = chainVsBallPrey || relSpeed >= this.splitImpulseThreshold;
        if (predatorStrikes && speedOk)
            if (!shouldSkipPreyHeadRamKill(predatorTraits, preyTraits, struckBodyId, this.headId)) {
                this.die(state, deathImpact);
                return true;
            }
        return false;
    }
}
// --- Unified Agent Metabolism ---
export class AgentMetabolism {
    constructor(profile) {
        this.hungerDrainMs = profile.metabolism?.hungerDrainMs ?? 30_000;
        this.foodValue = profile.metabolism?.foodValue ?? 0.5;
        this.growthCost = profile.metabolism?.growthCost ?? null;
        this.starveShedIntervalMs = profile.metabolism?.starveShedIntervalMs ?? null;
        this.hunger = profile.initialHunger ?? 1.0;
        this.growth = 0;
        this.starveMs = 0;
    }
    getHunger() {
        return this.hunger;
    }
    setHunger(fraction) {
        this.hunger = Math.max(0, Math.min(1, fraction));
        this.starveMs = 0;
    }
    feed(value = null) {
        const foodAmount = value ?? this.foodValue;
        this.starveMs = 0;
        this.hunger += foodAmount;
        let growCount = 0;
        if (this.hunger > 1.0) {
            const excess = this.hunger - 1.0;
            this.hunger = 1.0;
            if (this.growthCost !== null) {
                this.growth += excess;
                while (this.growth >= this.growthCost) {
                    this.growth -= this.growthCost;
                    growCount++;
                }
            }
        }
        return growCount;
    }
    advanceHunger(dtMs, drainMultiplier = 1) {
        this.hunger -= (dtMs * drainMultiplier) / this.hungerDrainMs;
        if (this.hunger > 0) {
            this.starveMs = 0;
            return false;
        }
        this.hunger = 0;
        if (this.starveShedIntervalMs !== null) this.starveMs += dtMs * drainMultiplier;
        return true;
    }
}
// --- Snake Scaling & Growth Helpers ---
// --- Brain and Spatial Memory ---
export class Brain {
    constructor({ spatialMemoryCapacity = 64, cols = 64 } = {}) {
        this.spatial = createSpatialCellMemory({ capacity: spatialMemoryCapacity, cols });
    }
    stampSeenCells(cells) {
        this.spatial.stampCells(cells);
    }
    stampArrival(idx) {
        this.spatial.stamp(idx);
    }
    clearMemory() {
        this.spatial.clear();
    }
}
export function buildNavStepPenaltyFromSpatialMemory(spatial, { basePenalty, falloff }, keysBuffer = null, costsBuffer = null) {
    if (keysBuffer && costsBuffer) {
        let count = 0;
        spatial.forEachNewestFirstKey((key, _seq, rankFromNewest) => {
            if (count < keysBuffer.length) {
                keysBuffer[count] = key;
                costsBuffer[count] = basePenalty * falloff ** rankFromNewest;
                count++;
            }
        });
        if (!count) return null;
        return { keys: keysBuffer.subarray(0, count), costs: costsBuffer.subarray(0, count) };
    }
    const keys = [];
    const costs = [];
    spatial.forEachNewestFirstKey((key, _seq, rankFromNewest) => {
        keys.push(key);
        costs.push(basePenalty * falloff ** rankFromNewest);
    });
    if (!keys.length) return null;
    return { keys: Int32Array.from(keys), costs: Float32Array.from(costs) };
}
export function createSpatialBrainSync(brain, { visionRange, navMemoryStepPenalty, navMemoryStepFalloff }) {
    let lastPenaltyGeneration = -1;
    let lastPenalty = null;
    const capacity = brain.spatial.capacity;
    const keysBuffer = new Int32Array(capacity);
    const costsBuffer = new Float32Array(capacity);
    return function syncSpatialBrain(agent, state) {
        const frame = getObserverVisionFrame(state);
        const vision = frame.ensureHeadVision(agent, visionRange);
        brain.stampSeenCells(vision.cells);
        const generation = brain.spatial.generation;
        if (generation !== lastPenaltyGeneration) {
            lastPenalty = buildNavStepPenaltyFromSpatialMemory(brain.spatial, { basePenalty: navMemoryStepPenalty, falloff: navMemoryStepFalloff }, keysBuffer, costsBuffer);
            lastPenaltyGeneration = generation;
        }
        agent.navStepPenalty = lastPenalty;
    };
}
// --- Unified FSM Runner ---
export class AgentAutosim {
    constructor(state, instance) {
        this.state = state;
        this.instance = instance;
        this.session = state.sandbox.snakeGame;
        this.shared = this.session.config.shared;
        this.entityRegistry = state.entityRegistry;
        this.agentCtx = { instance, session: this.session, navWalkable: this.session.navWalkable };
        this.profile = instance.profile;
        this.brain = new Brain({ spatialMemoryCapacity: this.shared.spatialMemoryCapacity, cols: state.obstacleGrid?.cols ?? 64 });
        this.sync = createSpatialBrainSync(this.brain, {
            visionRange: instance.visionRange,
            navMemoryStepPenalty: this.shared.navMemoryStepPenalty,
            navMemoryStepFalloff: this.shared.navMemoryStepFalloff,
        });
        this.intent = new GroundNavIntentAdapter({ state, instance, brain: this.brain, sync: this.sync, headNav: instance.headNav, agentCtx: this.agentCtx });
        instance.intent = this.intent;
        instance.brain = this.brain;
        this.active = false;
        this.initialHunger = this.profile.initialHunger ?? 1;
    }
    start() {
        this.active = true;
        this.instance.sprinting = false;
        this.instance.metabolism.setHunger(this.initialHunger);
        this.intent.resetMode();
        this.intent.resetMemory();
    }
    stop() {
        this.active = false;
        this.instance.sprinting = false;
        this.intent.clear(this.instance.head, this.state);
    }
    isActive() {
        return this.active;
    }
    getPathOverlay() {
        return this.instance.headNav.getPathOverlay(this.instance.head);
    }
    tick(dtMs, admitted = true) {
        if (!this.active) return;
        const seeker = this.instance.head;
        if (this.instance.lifecycle !== "alive") return;
        if (!this.instance.isSteerable()) {
            this.instance.die(this.state);
            return;
        }
        const soloTick = !this.session._batchingPerception;
        if (this.session._batchingPerception) ensureSnakePerceptionTick(this.state);
        else maybeBeginSnakeAutosimTick(this.state);
        if (admitted) this.intent.tick(seeker, this.state, dtMs);
        this.intent.tickCombatAction(dtMs);
        this.instance.applySprintMovementIntent();
        this.instance.headNav.tick(seeker, dtMs);
        if (soloTick) endSnakePerceptionFrame(this.state);
        let fedThisTick = false;
        const mode = this.intent.getMode();
        const target = this.intent.context.target;
        const decisionCtx = this.intent.getDecisionContext();
        if (target) {
            const consumed = this.instance.tryConsumeCommittedTarget(this.state, mode, target, decisionCtx);
            if (consumed && mode === "seek_food") fedThisTick = true;
        }
        const drainMultiplier = this.instance.hungerDrainMultiplier();
        if (!fedThisTick) this.instance.tickMetabolism(this.state, dtMs, drainMultiplier);
    }
}
// ==========================================
// Consolidated ballAgent, steeringLease, applyAgentGameplay, relationships, and colors helpers
// ==========================================
export const DEFAULT_BALL_FACING_TURN_RAD_PER_SEC = Math.PI * 1.5;
const HEADING_SPEED_MIN = 0.25;
export function shouldSyncBallAgentFacingToVelocity(combatAction, intent = null) {
    if (intent?.getMode() === "flee") return true;
    const phase = combatAction?.phase;
    return phase !== "reacting" && phase !== "fire_delay" && phase !== "reloading";
}
export function syncBallAgentFacingToVelocity(head, dtMs, turnRadPerSec = DEFAULT_BALL_FACING_TURN_RAD_PER_SEC) {
    const vx = head.vx ?? 0;
    const vy = head.vy ?? 0;
    const speed = Math.hypot(vx, vy);
    if (speed < HEADING_SPEED_MIN) return;
    const moveAngle = Math.atan2(vy, vx);
    const maxStep = turnRadPerSec * (dtMs / 1000);
    head.facing = rotateAngleTowards(head.facing ?? moveAngle, moveAngle, maxStep);
}
export function syncBallAgentFacingToTarget(head, target, dtMs, turnRadPerSec = DEFAULT_BALL_FACING_TURN_RAD_PER_SEC) {
    if (!target || target.isDead) return head.facing ?? 0;
    const targetAngle = Math.atan2(target.y - head.y, target.x - head.x);
    const maxStep = turnRadPerSec * (dtMs / 1000);
    head.facing = rotateAngleTowards(head.facing ?? targetAngle, targetAngle, maxStep);
    return head.facing;
}
export function clearSnakeSteeringLeaseFromProp(prop) {
    delete prop._snakeSteering;
    clearGroundRollDrive(prop);
}
export function maySnakeHeadReceiveRoll(world, prop) {
    const snakeGame = world?.sandbox?.snakeGame;
    if (!snakeGame) return true;
    const instance = snakeGame.instancesByHeadId.get(prop.id);
    if (instance && instance.lifecycle === "alive" && isAliveAgentHead(snakeGame.registry, prop.id)) {
        const lease = prop._snakeSteering;
        return !!lease && instance.steeringEpoch === lease.epoch;
    }
    const isChainHead = getSandboxEntityMeta(world).isChainHead(prop.id);
    if (isChainHead || prop._snakeSteering) {
        clearSnakeSteeringLeaseFromProp(prop);
        return false;
    }
    return true;
}
export function bakeRelationshipRules(profile, config) {
    const baked = {};
    for (const [targetId, rule] of Object.entries(profile.relationships ?? {})) {
        if (typeof rule === "string") {
            baked[targetId] = rule;
            continue;
        }
        const r = { ...rule };
        if (rule.type === "sizeBand") r._maxGap = rule.maxSegmentGap ?? profile.rivalBand?.maxSegmentGap ?? config.rivalBand?.maxSegmentGap ?? 2;
        if (rule.type === "proximity") r._range = rule.range ?? profile.attackRange ?? config.shared?.lethalThreatRange ?? 48;
        baked[targetId] = r;
    }
    return baked;
}
function readInstanceSegmentCount(instance) {
    return instance.memberIds.length;
}
function resolveSizeBand(seekerSegs, targetSegs, maxGap) {
    if (Math.abs(seekerSegs - targetSegs) <= maxGap) return "rival";
    if (targetSegs > seekerSegs) return "threat";
    if (targetSegs < seekerSegs) return "prey";
    return "neutral";
}
function resolveFactionRelationship(seekerFaction, targetFaction, rule) {
    if (!seekerFaction || !targetFaction) return "neutral";
    if (seekerFaction === targetFaction) return rule.same ?? "ally";
    return rule.different ?? "prey";
}
function resolveSizeBandRelationshipForInstances(seekerInstance, targetInstance, rule) {
    const seekerFaction = seekerInstance.head.faction ?? null;
    const targetFaction = targetInstance.head.faction ?? null;
    if (rule.sameFaction != null) {
        if (!seekerFaction || !targetFaction) return "neutral";
        if (seekerFaction === targetFaction) return rule.sameFaction;
    }
    return resolveSizeBand(readInstanceSegmentCount(seekerInstance), readInstanceSegmentCount(targetInstance), rule._maxGap);
}
function resolveProximityRelationship(rule, distSq) {
    if (distSq == null) return rule.far ?? "neutral";
    return distSq <= rule._range * rule._range ? rule.near : (rule.far ?? "neutral");
}
export function resolveRelationshipForInstances(seekerInstance, targetInstance, distSq = null) {
    const rule = seekerInstance.relationshipRules[targetInstance.profileId];
    if (rule == null) return "neutral";
    if (typeof rule === "string") return rule;
    if (rule.type === "proximity") return resolveProximityRelationship(rule, distSq);
    if (rule.type === "faction") return resolveFactionRelationship(seekerInstance.head.faction ?? null, targetInstance.head.faction ?? null, rule);
    if (rule.type === "sizeBand") return resolveSizeBandRelationshipForInstances(seekerInstance, targetInstance, rule);
    return "neutral";
}
export function applyAgentGameplay(spec, prop) {
    if (spec.maxSpeed != null || spec.accel != null) {
        if (!prop.strategy.groundNav) prop.strategy.groundNav = {};
        if (spec.maxSpeed != null) prop.strategy.groundNav.maxSpeed = spec.maxSpeed;
        if (spec.accel != null) prop.strategy.groundNav.accel = spec.accel;
    }
    if (spec.friction != null) prop.strategy.friction = spec.friction;
    if (spec.density != null) {
        prop.strategy.density = spec.density;
        if (prop.strategy.isKinetic) syncKineticRigidBody(prop);
    }
}
export function resolveAgentTeamForIndex(profile, index) {
    const teams = profile.teams;
    if (!Array.isArray(teams) || teams.length === 0) return { faction: profile.faction ?? "neutral", color: null };
    return teams[index % teams.length] ?? teams[0];
}
export function resolveAgentTeamForFaction(profile, faction) {
    const teams = profile.teams;
    if (Array.isArray(teams)) for (let i = 0; i < teams.length; i++) if (teams[i].faction === faction) return teams[i];
    return { faction, color: null };
}
export function applySnakeChainTint(members, tintHex) {
    if (tintHex == null) return;
    for (let i = 0; i < members.length; i++) setPropVisualTint(members[i], tintHex);
}
export function copySnakeChainTintFromHead(head, prop) {
    const tint = getPropVisualTint(head);
    if (tint != null) setPropVisualTint(prop, tint);
}

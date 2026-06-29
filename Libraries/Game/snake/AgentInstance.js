import { getConnectedBodyIds, getConnectedComponentPath, getLinearChainOrderedMembers } from "../../Motion/kineticConstraintGraph.js";
import { clearChainLinksForMembers, clearChainLinksForProp, removeChainLinkBetween } from "../../Sandbox/chainLinks.js";
import { growChainSegment } from "../../Sandbox/spawnLinkedBallChain.js";
import { removeSandboxWorldProp } from "../../Sandbox/sandboxPlacedSpawn.js";
import { createCellTargetHpaNav } from "../../Sandbox/groundNav/cellTargetHpaNav.js";
import { getSandboxEntityMeta } from "../../../GameState/sandboxEntityMeta.js";
import { getSnakeGameConfig } from "./snakeGameConfig.js";
import { clearSnakeSteeringLeaseFromProp } from "./snakeSteeringLease.js";
import { registerInertAgent } from "../../AI/agents/AgentProfiles.js";
import { clearGroundRollDrive } from "../../Sandbox/kineticRollActuator.js";
import { markSnakeSegmentsFracturable } from "./snakeSegmentFracture.js";
import { AGENT_PROFILE, getAgentProfile } from "../../AI/agents/AgentProfiles.js";
import { getAgentIdentity } from "../../AI/identity/agentIdentity.js";
import { GroundNavIntentAdapter } from "./GroundNavIntentAdapter.js";
import { ensureSnakePerceptionTick, maybeBeginSnakeAutosimTick, endSnakePerceptionFrame } from "./snakePerception.js";
import { getObserverVisionFrame } from "../../Navigation/perception/observerVisionFrame.js";
import { createSpatialCellMemory } from "../../AI/brain/brain.js";
import { DEFAULT_BALL_FACING_TURN_RAD_PER_SEC } from "./ballAgent.js";
import { applyAgentGameplay } from "./applyAgentGameplay.js";
import { RangedCombatActionState, resolveRangedWeapon } from "./GroundNavIntentAdapter.js";
import { COMBAT_TRAIT_DEFAULTS, isBallCombatTopology, isChainCombatTopology, shouldSkipPreyHeadRamKill } from "./agentCombatTraits.js";
import { getCirclePropRadius } from "../../Props/propScale.js";
import { resolveRelationshipForInstances, bakeRelationshipRules } from "./agentRelationships.js";
import { SNAKE_CHAIN_EXPORT_TYPE } from "./snakeScene.js";
import { copySnakeChainTintFromHead } from "./snakeChainColor.js";
import { canAgentEatSnakeFood, isSnakeFoodTarget } from "./snakeFood.js";
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
        if (Math.hypot(target.x - seeker.x, target.y - seeker.y) > this.eatRadius) return false;
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
export function getSnakeChainRadius(state, headId) {
    const head = state.entityRegistry.getLive(headId);
    return getCirclePropRadius(head);
}
export function growSnakeChainAfterMeal(state, headId, profile) {
    const segmentRadius = getSnakeChainRadius(state, headId);
    const spacing = segmentRadius * 2 * (profile.linkSlack ?? 1);
    return { segmentRadius, spacing, linkSlack: profile.linkSlack };
}
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
        let choice;
        if (admitted) choice = this.intent.tick(seeker, this.state, dtMs);
        this.instance.applySprintMovementIntent();
        this.instance.headNav.tick(seeker, dtMs);
        if (soloTick) endSnakePerceptionFrame(this.state);
        let fedThisTick = false;
        let foodTarget = null;
        if (choice?.mode === "seek_food" && choice.target && isSnakeFoodTarget(choice.target)) foodTarget = choice.target;
        else if (this.intent.getMode() === "seek_food" && this.intent.getTargetId() != null) foodTarget = this.entityRegistry.getLive(this.intent.getTargetId());
        if (foodTarget) fedThisTick = this.instance.eatFoodTarget(this.state, foodTarget);
        let ammoTarget = null;
        if (choice?.mode === "seek_ammo" && choice.target && choice.target.type === "ammo_shard") ammoTarget = choice.target;
        else if (this.intent.getMode() === "seek_ammo" && this.intent.getTargetId() != null) ammoTarget = this.entityRegistry.getLive(this.intent.getTargetId());
        if (ammoTarget) this.instance.collectAmmoTarget(this.state, ammoTarget);
        const drainMultiplier = this.instance.hungerDrainMultiplier();
        if (!fedThisTick) this.instance.tickMetabolism(this.state, dtMs, drainMultiplier);
    }
}

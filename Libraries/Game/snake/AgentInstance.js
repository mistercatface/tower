import { getConnectedBodyIds, getConnectedComponentPath, getLinearChainOrderedMembers } from "../../Motion/kineticConstraintGraph.js";
import { clearChainLinksForMembers, removeChainLinkBetween } from "../../Sandbox/chainLinks.js";
import { getSandboxEntityMeta } from "../../../GameState/sandboxEntityMeta.js";
import { createAgentAutosim } from "./agentAutosim.js";
import { getSnakeGameConfig } from "./snakeGameConfig.js";
import { clearSnakeSteeringLeaseFromProp } from "./snakeSteeringLease.js";
import { isAliveAgentHead, registerInertAgent } from "../../AI/agents/agentPopulationRegistry.js";
import { clearGroundRollDrive } from "../../Sandbox/kineticRollActuator.js";
import { markSnakeSegmentsFracturable } from "./snakeSegmentFracture.js";
import { AGENT_PROFILE, getAgentProfile } from "../../AI/agents/agentProfile.js";
import { getAgentIdentity } from "../../AI/identity/agentIdentity.js";
import { DEFAULT_BALL_FACING_TURN_RAD_PER_SEC, syncBallAgentPresentation } from "./ballAgent.js";
import { createRangedCombatActionState, resolveRangedWeapon } from "./rangedCombat.js";
import { COMBAT_TRAIT_DEFAULTS, isBallCombatTopology, isChainCombatTopology, shouldSkipPreyHeadRamKill } from "./agentCombatTraits.js";
import { getCirclePropRadius } from "../../Props/propScale.js";
import { resolveRelationshipForInstances, bakeRelationshipRules } from "./agentRelationships.js";
import { getAgentHunger } from "./agentMetabolism.js";
export function isSnakeProfile(instance) {
    return instance?.profileId === AGENT_PROFILE.snake;
}
export function isSquidProfile(instance) {
    return instance?.profileId === AGENT_PROFILE.squid;
}
export function isFleeProfile(instance) {
    return instance?.profileId === AGENT_PROFILE.flee;
}
export class AgentInstance {
    constructor({ profileId, head, spawnGroupId, autosim = null, lifecycle = "alive", memberIds = [] }) {
        this.profileId = profileId;
        this.head = head;
        this.spawnGroupId = spawnGroupId;
        this.autosim = autosim;
        this.lifecycle = lifecycle;
        this.memberIds = memberIds;
        this.memberProps = [];
        this.steeringEpoch = 0;
        this.segmentWallPressures = new Map();
        this.accumulatedPressure = 0;
        this.peakPressure = 0;
        this.isHeadRouteValid = false;
        this.baseTint = isFleeProfile(this) ? (getAgentIdentity(this.headId)?.color ?? null) : null;
        this._sprintOverride = undefined;
        this._intentOverride = undefined;
        this.equippedWeapon = null;
        const profile = getAgentProfile(profileId);
        this.profile = profile;
        this.leaderGameplay = profile.gameplay.leader;
        this.bodyGameplay = profile.gameplay.body;
        this.minAliveSegmentCount = profile.minAliveSegmentCount ?? 1;
        const config = getSnakeGameConfig();
        const headRadius = getCirclePropRadius(head);
        this.eatRadius = headRadius + config.foodPickupRadius + config.eatMargin;
        this.visionRange = config.shared.visionRange;
        this.splitImpulseThreshold = config.splitImpulseThreshold;
        this.leaderMaxSpeed = this.leaderGameplay.maxSpeed;
        this.combatTraits = { ...COMBAT_TRAIT_DEFAULTS, ...profile.combat };
        this.relationshipRules = bakeRelationshipRules(profile, config);
        this.resolvedWeapon = resolveRangedWeapon(this, profile, this.visionRange.range);
        this.aimTurnRadPerSec = this.resolvedWeapon?.aimRotationRadPerSec ?? DEFAULT_BALL_FACING_TURN_RAD_PER_SEC;
        this.combatAction = this.resolvedWeapon || profile?.decision?.modes?.shoot_enemy ? createRangedCombatActionState() : null;
    }
    get headId() {
        return this.head.id;
    }
    get intent() {
        if (this._intentOverride !== undefined) return this._intentOverride;
        const autosim = this.autosim;
        if (!autosim) return null;
        if (typeof autosim.getIntent === "function") return autosim.getIntent();
        if (typeof autosim.getMode === "function" || typeof autosim.getTargetId === "function") return autosim;
        return null;
    }
    set intent(value) {
        this._intentOverride = value;
    }
    get sprinting() {
        if (this._sprintOverride !== undefined) return this._sprintOverride;
        const intent = this.intent;
        if (!intent) return false;
        const want = intent.getDecisionContext()?.sprintIntent?.want === true;
        if (!want) return false;
        const profileId = this.profileId;
        const segmentCount = this.segmentCount();
        const metabolism = this.metabolism;
        const profile = this.profile;
        if (profileId === AGENT_PROFILE.flee) return getAgentHunger(metabolism) > 0;
        if (profileId === AGENT_PROFILE.squid) return segmentCount >= 2;
        if (profileId === AGENT_PROFILE.snake) return segmentCount > (profile.minAliveSegmentCount ?? 3);
        return true;
    }
    set sprinting(value) {
        this._sprintOverride = value;
    }
    get brain() {
        return this.autosim?.getBrain?.() ?? null;
    }
    get headNav() {
        return this.autosim?.getHeadNav?.() ?? null;
    }
    get metabolism() {
        return this.autosim?.metabolism ?? null;
    }
    start(state) {
        this.grantSteeringLease();
        this.autosim.start();
        if (isBallCombatTopology(this.combatTraits)) syncBallAgentPresentation(this.head, { baseTint: this.baseTint });
    }
    stopSteering(state) {
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
        this.die(state, members, deathImpact);
        return this;
    }
    tick(state, dtMs, admitted = true) {
        if (this.lifecycle !== "alive" || !this.autosim?.isActive?.()) return;
        this._lastTickDtMs = dtMs;
        this.autosim.tick(dtMs, admitted);
        if (isBallCombatTopology(this.combatTraits)) syncBallAgentPresentation(this.head, { baseTint: this.baseTint });
    }
    isSteerable(state, registry) {
        if (this.lifecycle !== "alive" || !isAliveAgentHead(registry, this.headId)) return false;
        if (!getSandboxEntityMeta(state).isChainHead(this.headId)) return false;
        if (isSquidProfile(this)) return getConnectedBodyIds(state.kinetic, this.headId).includes(this.headId);
        const members = getConnectedComponentPath(state.kinetic, this.headId);
        if (members[0] !== this.headId) return false;
        if (isSnakeProfile(this) && members.length < this.minAliveSegmentCount) return false;
        return true;
    }
    validate(state) {
        if (this.lifecycle !== "alive") return;
        const snakeGame = state.sandbox.snakeGame;
        if (isFleeProfile(this)) {
            if (this.head.isDead) this.die(state);
            return;
        }
        if (isSquidProfile(this)) {
            if (!getConnectedBodyIds(state.kinetic, this.headId).includes(this.headId)) this.die(state);
            return;
        }
        if (this.isSteerable(state, snakeGame.registry)) return;
        this.die(state);
    }
    syncMembersFromGraph(state) {
        if (isSquidProfile(this)) this.memberIds = getConnectedBodyIds(state.kinetic, this.headId);
        else this.memberIds = getConnectedComponentPath(state.kinetic, this.headId);
        this.memberProps.length = 0;
        for (let i = 0; i < this.memberIds.length; i++) {
            const prop = state.entityRegistry.getLive(this.memberIds[i]);
            if (prop) this.memberProps.push(prop);
        }
        return this.memberIds;
    }
    orderedMembers(state) {
        return getLinearChainOrderedMembers(state.kinetic, this.headId);
    }
    updatePressureDiagnostics(state) {
        if (!isSnakeProfile(this)) return;
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
        const members = this.syncMembersFromGraph(state);
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
        if (this.autosim?.isActive?.()) this.isHeadRouteValid = this.autosim.getPathOverlay?.() != null;
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
        const snakeGame = state.sandbox.snakeGame;
        const members = connectedMembers ?? this.syncMembersFromGraph(state);
        const resolvedMembers = this.memberIdsForTeardown(snakeGame, members);
        this.retireMemberSegments(state, resolvedMembers);
        return resolvedMembers;
    }
    severInertTail(state, tailIds) {
        const snakeGame = state.sandbox.snakeGame;
        this.retireMemberSegments(state, tailIds);
        markSnakeSegmentsFracturable(state, tailIds);
        registerInertAgent(snakeGame.registry, tailIds[0], tailIds, this.headId);
    }
    die(state, members = null, deathImpact = null) {
        state.sandbox.snakeGame.speciesById.get(this.profileId).die(this, state, deathImpact);
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
        if (aliveIds.length < this.minAliveSegmentCount) this.die(state, aliveIds, deathImpact);
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
                        if (strikerInstance.intent?.getMode?.() === "flee")
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
                this.die(state, null, deathImpact);
                return true;
            }
        return false;
    }
}
export function createAgentInstance(state, { profileId, head, spawnGroupId }) {
    const instance = new AgentInstance({ profileId, head, spawnGroupId, lifecycle: "alive" });
    instance.syncMembersFromGraph(state);
    instance.autosim = createAgentAutosim(state, instance);
    return instance;
}

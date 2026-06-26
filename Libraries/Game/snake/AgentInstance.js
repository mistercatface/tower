import { getConnectedBodyIds, getConnectedComponentPath, getLinearChainOrderedMembers } from "../../Motion/kineticConstraintGraph.js";
import { clearChainLinksForMembers, removeChainLinkBetween } from "../../Sandbox/chainLinks.js";
import { getSandboxEntityMeta } from "../../../GameState/sandboxEntityMeta.js";
import { createAgentAutosim } from "./agentAutosim.js";
import { getSnakeGameConfig } from "./snakeGameConfig.js";
import { clearSnakeSteeringLeaseFromProp } from "./snakeSteeringLease.js";
import { registerInertAgent } from "../../AI/agents/agentPopulationRegistry.js";
import { clearGroundRollDrive } from "../../Sandbox/kineticRollActuator.js";
import { markSnakeSegmentsFracturable } from "./snakeSegmentFracture.js";
import { AGENT_PROFILE, getAgentProfile } from "../../AI/agents/agentProfile.js";
import { getAgentIdentity } from "../../AI/identity/agentIdentity.js";
import { DEFAULT_BALL_FACING_TURN_RAD_PER_SEC } from "./ballAgent.js";
import { createRangedCombatActionState, resolveRangedWeapon } from "./rangedCombat.js";
import { COMBAT_TRAIT_DEFAULTS, isBallCombatTopology, isChainCombatTopology, shouldSkipPreyHeadRamKill } from "./agentCombatTraits.js";
import { getCirclePropRadius } from "../../Props/propScale.js";
import { resolveRelationshipForInstances, bakeRelationshipRules } from "./agentRelationships.js";
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
        this.sprinting = false;
        this.intent = null;
        this.brain = null;
        this.headNav = null;
        this.metabolism = null;
        this.equippedWeapon = null;
        const profile = getAgentProfile(profileId);
        this.profile = profile;
        this.baseTint = profile.useFactionTint ? (getAgentIdentity(this.headId)?.color ?? null) : null;
        this.leaderGameplay = profile.gameplay.leader;
        this.bodyGameplay = profile.gameplay.body;
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
        this.combatAction = this.resolvedWeapon || profile?.decision?.modes?.shoot_enemy ? createRangedCombatActionState() : null;
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
    tick(dtMs, admitted = true) {
        this._lastTickDtMs = dtMs;
        this.autosim.tick(dtMs, admitted);
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
        if (this.profile.topology === "cluster") this.memberIds = getConnectedBodyIds(this.kinetic, this.headId);
        else if (this.profile.topology === "chain") this.memberIds = getConnectedComponentPath(this.kinetic, this.headId);
        else this.memberIds = [this.headId];
        this.memberProps.length = 0;
        for (let i = 0; i < this.memberIds.length; i++) {
            const prop = this.entityRegistry.getLive(this.memberIds[i]);
            if (prop) this.memberProps.push(prop);
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
export function createAgentInstance(state, { profileId, head, spawnGroupId }) {
    const instance = new AgentInstance({ profileId, head, spawnGroupId, lifecycle: "alive" });
    const session = state.sandbox?.snakeGame;
    if (session) {
        instance.session = session;
        instance.navWalkable = session.navWalkable;
    }
    instance.entityRegistry = state.entityRegistry;
    instance.kinetic = state.kinetic;
    instance.entityMeta = getSandboxEntityMeta(state);
    instance.syncMembersFromGraph();
    instance.autosim = createAgentAutosim(state, instance);
    return instance;
}

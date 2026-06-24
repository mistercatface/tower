import { getConnectedBodyIds, getConnectedComponentPath, getLinearChainOrderedMembers } from "../../Motion/kineticConstraintGraph.js";
import { clearChainLinksForMembers, removeChainLinkBetween } from "../../Sandbox/chainLinks.js";
import { getSandboxEntityMeta } from "../../../GameState/sandboxEntityMeta.js";
import { createAgentAutosim } from "./agentAutosim.js";
import { getSnakeGameConfig } from "./snakeGameConfig.js";
import { grantSnakeSteeringLease, revokeSnakeSteeringLease } from "./snakeSteeringLease.js";
import { isAliveAgentHead, registerInertAgent } from "../../AI/agents/agentPopulationRegistry.js";
import { reapAgentInstance } from "./snakeAgentLifecycle.js";
import { retireSnakeSegmentsFromNav } from "./snakeLifecycle.js";
import { markSnakeSegmentsFracturable } from "./snakeSegmentFracture.js";
import { AGENT_PROFILE, getAgentProfile } from "../../AI/agents/agentProfile.js";
import { getAgentIdentity } from "../../AI/identity/agentIdentity.js";
import { syncFleeAgentPresentation } from "./fleeAgent/syncFleeAgentPresentation.js";
import { getAgentCombatTraits } from "./agentCombatTraits.js";
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
    }
    get headId() {
        return this.head.id;
    }
    get intent() {
        if (this._intentOverride !== undefined) return this._intentOverride;
        return this.autosim?.getIntent?.() ?? null;
    }
    set intent(value) {
        this._intentOverride = value;
    }
    get sprinting() {
        if (this._sprintOverride !== undefined) return this._sprintOverride;
        return this.autosim?.isSprinting?.() ?? false;
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
        grantSnakeSteeringLease(this);
        this.autosim.start();
        if (isFleeProfile(this)) syncFleeAgentPresentation(this.head, { baseTint: this.baseTint });
    }
    stopSteering(state) {
        revokeSnakeSteeringLease(this);
        this.autosim.stop();
    }
    tick(state, dtMs) {
        if (this.lifecycle !== "alive" || !this.autosim?.isActive?.()) return;
        this.autosim.tick(dtMs);
        if (isFleeProfile(this)) syncFleeAgentPresentation(this.head, { baseTint: this.baseTint });
    }
    isSteerable(state, registry) {
        if (this.lifecycle !== "alive" || !isAliveAgentHead(registry, this.headId)) return false;
        if (!getSandboxEntityMeta(state).isChainHead(this.headId)) return false;
        if (isSquidProfile(this)) return getConnectedBodyIds(state.kinetic, this.headId).includes(this.headId);
        const members = getConnectedComponentPath(state.kinetic, this.headId);
        if (members[0] !== this.headId) return false;
        if (isSnakeProfile(this) && members.length < getAgentProfile(AGENT_PROFILE.snake).minAliveSegmentCount) return false;
        return true;
    }
    validate(state, snakeGame) {
        if (this.lifecycle !== "alive") return;
        if (isFleeProfile(this)) {
            if (this.head.isDead) this.die(state, snakeGame);
            return;
        }
        if (isSquidProfile(this)) {
            if (!getConnectedBodyIds(state.kinetic, this.headId).includes(this.headId)) this.die(state, snakeGame);
            return;
        }
        if (this.isSteerable(state, snakeGame.registry)) return;
        this.die(state, snakeGame);
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
        retireSnakeSegmentsFromNav(state, memberIds);
    }
    memberIdsForTeardown(snakeGame, connectedMembers) {
        const ids = new Set(connectedMembers);
        for (const entry of snakeGame.registry.inertByLeadId.values()) {
            if (entry.sourceHeadId !== this.headId) continue;
            for (let i = 0; i < entry.memberIds.length; i++) ids.add(entry.memberIds[i]);
        }
        return [...ids];
    }
    retireAllSegments(state, snakeGame, connectedMembers = null) {
        const members = connectedMembers ?? this.syncMembersFromGraph(state);
        const resolvedMembers = this.memberIdsForTeardown(snakeGame, members);
        this.retireMemberSegments(state, resolvedMembers);
        return resolvedMembers;
    }
    severInertTail(state, snakeGame, tailIds) {
        this.retireMemberSegments(state, tailIds);
        markSnakeSegmentsFracturable(state, tailIds);
        registerInertAgent(snakeGame.registry, tailIds[0], tailIds, this.headId);
    }
    die(state, snakeGame, members = null, deathImpact = null) {
        reapAgentInstance(state, snakeGame, this, deathImpact);
    }
    splitAtStruckSegment(state, snakeGame, struckSegmentId, victimMembers = null, deathImpact = null) {
        if (!getAgentCombatTraits(this.profileId).canSplit) return null;
        const members = victimMembers ?? getConnectedComponentPath(state.kinetic, this.headId);
        const strikeIndex = members.indexOf(struckSegmentId);
        if (strikeIndex < 0 || strikeIndex >= members.length - 1) return null;
        const linkA = members[strikeIndex];
        const linkB = members[strikeIndex + 1];
        if (!removeChainLinkBetween(state, linkA, linkB)) return null;
        const aliveIds = members.slice(0, strikeIndex + 1);
        const tailIds = members.slice(strikeIndex + 1);
        this.severInertTail(state, snakeGame, tailIds);
        this.memberIds = aliveIds;
        if (aliveIds.length < getAgentProfile(AGENT_PROFILE.snake).minAliveSegmentCount) this.die(state, snakeGame, aliveIds, deathImpact);
        return { aliveHeadId: this.headId, aliveIds, inertLeadId: tailIds[0], inertIds: tailIds };
    }
}
export function createAgentInstance(state, { profileId, head, spawnGroupId, navWalkable = null, ...autosimOptions }) {
    const instance = new AgentInstance({ profileId, head, spawnGroupId, lifecycle: "alive" });
    instance.syncMembersFromGraph(state);
    instance.autosim = createAgentAutosim(state, { instance, navWalkable, ...autosimOptions });
    return instance;
}

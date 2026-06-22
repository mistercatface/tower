import { getConnectedComponentPath } from "../../Motion/kineticConstraintGraph.js";
import { clearChainLinksForMembers, removeChainLinkBetween } from "../../Sandbox/chainLinks.js";
import { getSandboxEntityMeta } from "../../../GameState/sandboxEntityMeta.js";
import { createSnakeAutosim } from "./snakeAutosim.js";
import { getSnakeGameConfig } from "./snakeGameConfig.js";
import { grantSnakeSteeringLease, revokeSnakeSteeringLease, clearSnakeSteeringLeaseFromProp } from "./snakeSteeringLease.js";
import { registerAliveAgent, registerInertAgent, markAgentDead, purgeInertAgentsForHead, reapAgentInstance } from "./agentPopulationRegistry.js";
import { retireSnakeSegmentsFromNav } from "./snakeLifecycle.js";
import { markSnakeSegmentsFracturable, shatterSnakeSegments } from "./snakeSegmentFracture.js";
export class SnakeInstance {
    constructor({ headId, spawnGroupId, autosim = null, lifecycle = "alive", memberIds = [] }) {
        this.headId = headId;
        this.spawnGroupId = spawnGroupId;
        this.autosim = autosim;
        this.lifecycle = lifecycle;
        this.memberIds = memberIds;
        this.steeringEpoch = 0;
        this.segmentWallPressures = new Map();
        this.accumulatedPressure = 0;
        this.peakPressure = 0;
        this.isHeadRouteValid = false;
    }
    start(state) {
        grantSnakeSteeringLease(this, state);
        this.autosim.start();
    }
    stopSteering(state) {
        revokeSnakeSteeringLease(this, state);
        this.autosim.stop();
    }
    tick(state, dtMs) {
        if (this.autosim) this.autosim.tick(dtMs);
    }
    isSteerable(state, registry) {
        if (this.lifecycle !== "alive" || !registry.aliveByHeadId.has(this.headId)) return false;
        const head = state.entityRegistry.getLive(this.headId);
        if (!head) return false;
        if (!getSandboxEntityMeta(state).isChainHead(this.headId)) return false;
        const members = getConnectedComponentPath(state.kinetic, this.headId);
        if (members[0] !== this.headId) return false;
        if (members.length < getSnakeGameConfig().minAliveSegmentCount) return false;
        return true;
    }
    validate(state, snakeGame) {
        if (this.lifecycle !== "alive") return;
        if (this.isSteerable(state, snakeGame.registry)) return;
        this.die(state, snakeGame);
    }
    syncMembersFromGraph(state) {
        this.memberIds = getConnectedComponentPath(state.kinetic, this.headId);
        return this.memberIds;
    }
    updatePressureDiagnostics(state) {
        if (this.lifecycle !== "alive") {
            this.segmentWallPressures.clear();
            this.accumulatedPressure = 0;
            this.peakPressure = 0;
            this.isHeadRouteValid = false;
            return;
        }
        const head = state.entityRegistry.getLive(this.headId);
        if (head && head.isSleeping) {
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
        for (let i = 0; i < members.length; i++) {
            const segmentId = members[i];
            const prop = state.entityRegistry.getLive(segmentId);
            if (!prop) continue;
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
        if (this.autosim && this.autosim.isActive()) this.isHeadRouteValid = this.autosim.getPathOverlay() != null;
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
        if (aliveIds.length < getSnakeGameConfig().minAliveSegmentCount) this.die(state, snakeGame, aliveIds, deathImpact);
        return { aliveHeadId: this.headId, aliveIds, inertLeadId: tailIds[0], inertIds: tailIds };
    }
}
export function createAliveSnakeInstance(state, { headId, spawnGroupId, navWalkable }) {
    const autosim = createSnakeAutosim(state, { headId, navWalkable });
    const instance = new SnakeInstance({ headId, spawnGroupId, autosim, lifecycle: "alive" });
    instance.syncMembersFromGraph(state);
    return instance;
}
export function registerAliveSnakeInstance(snakeGame, instance) {
    registerAliveAgent(snakeGame.registry, instance.headId, "snake", instance);
    snakeGame.instancesByHeadId.set(instance.headId, instance);
    snakeGame.autosimsByHeadId.set(instance.headId, instance.autosim);
}
export function getSnakeInstance(snakeGame, headId) {
    return snakeGame.instancesByHeadId.get(headId);
}
export function syncAliveSnakeInstances(state, snakeGame) {
    for (const instance of [...snakeGame.instancesByHeadId.values()]) if (typeof instance.validate === "function") instance.validate(state, snakeGame);
}
export function tickAliveSnakeInstances(state, snakeGame, dtMs) {
    for (const instance of snakeGame.instancesByHeadId.values()) {
        if (instance.lifecycle !== "alive") continue;
        if (typeof instance.tick === "function") instance.tick(state, dtMs);
    }
}

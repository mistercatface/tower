import { addDistanceConstraint, getConnectedBodyIds } from "../../Libraries/Physics/physics.js";
import { setCirclePropRadius, WorldProp } from "../../Libraries/Props/props.js";
import { addWorldPropToState } from "../../GameState/EntityRegistry.js";
import { ENTITY_KIND_WORLD_PROP } from "../../Core/engineEnums.js";

function resolveSegmentPropId(index, { leaderIndex = 0, headPropId, bodyPropId, leaderPropId }) {
    const leaderId = leaderPropId ?? headPropId ?? bodyPropId;
    if (index === leaderIndex) return leaderId;
    return bodyPropId ?? headPropId ?? leaderId;
}

function chainLinkRestLength(bodyA, bodyB, linkSlack) {
    return (bodyA.radius + bodyB.radius) * linkSlack;
}

function markChainHead(state, propId) {
    const meta = state.sandbox.entityMeta;
    const members = getConnectedBodyIds(state.kinetic, propId);
    for (let i = 0; i < members.length; i++) meta.setChainHead(members[i], false);
    meta.setChainHead(propId, true);
}

function linkChainBodies(state, eidA, eidB, restLength) {
    addDistanceConstraint(state.kinetic, eidA, eidB, { restLength });
}

function spawnSeg(state, x, y, typeId) {
    const prop = new WorldProp(x, y, typeId, 0);
    const eid = addWorldPropToState(state, prop);
    return { prop, eid };
}

function spawnAgentChain(state, anchorIdx, spec) {
    const {
        headPropId,
        bodyPropId,
        leaderPropId,
        leaderIndex = 0,
        segmentCount = 2,
        exportType = null,
        linkSlack = 1.0,
        segmentRadius = null,
        growDirX = -1,
        growDirY = 0,
        spacing = null,
        spawnGroupId = null,
    } = spec;
    const grid = state.obstacleGrid;
    const anchorX = grid.gridCenterXByIdx(anchorIdx);
    const anchorY = grid.gridCenterYByIdx(anchorIdx);
    const props = [];
    const eids = [];
    const propSpec = { leaderIndex, headPropId, bodyPropId, leaderPropId };
    const first = spawnSeg(state, anchorX, anchorY, resolveSegmentPropId(0, propSpec));
    if (segmentRadius != null) setCirclePropRadius(first.prop, segmentRadius);
    props.push(first.prop);
    eids.push(first.eid);
    let lastProp = first.prop;
    for (let i = 1; i < segmentCount; i++) {
        const spawned = spawnSeg(state, lastProp.x, lastProp.y, resolveSegmentPropId(i, propSpec));
        if (segmentRadius != null) setCirclePropRadius(spawned.prop, segmentRadius);
        const dist = spacing ?? chainLinkRestLength(lastProp, spawned.prop, linkSlack);
        spawned.prop.x = lastProp.x + growDirX * dist;
        spawned.prop.y = lastProp.y + growDirY * dist;
        props.push(spawned.prop);
        eids.push(spawned.eid);
        lastProp = spawned.prop;
    }
    const leader = props[leaderIndex];
    const resolvedGroupId = spawnGroupId ?? `${exportType ?? "agentChain"}:${leader.id}`;
    for (let i = 0; i < props.length; i++) {
        props[i].spawnGroupId = resolvedGroupId;
    }
    for (let i = 0; i < props.length - 1; i++) {
        const a = props[i];
        const b = props[i + 1];
        const segDist = Math.hypot(b.x - a.x, b.y - a.y);
        const restLength = spacing != null ? segDist * linkSlack : segDist;
        linkChainBodies(state, eids[i], eids[i + 1], restLength);
    }
    markChainHead(state, leader.id);
    return { leader, leaderIndex, head: props[0], tail: props[props.length - 1], members: props, spawnGroupId: resolvedGroupId };
}

/** Test helper — maps legacy ball-chain option bags onto harness chain spawn. */
export function spawnLinkedBallChain(state, anchorIdx, options) {
    const headPropId = options.headBallType ?? options.ballType;
    const growDirX = options.growDirX ?? -1;
    const growDirY = options.growDirY ?? 0;
    return spawnAgentChain(state, anchorIdx, {
        leaderIndex: 0,
        headPropId,
        bodyPropId: options.ballType,
        segmentCount: options.segmentCount,
        exportType: options.exportType,
        linkSlack: options.linkSlack,
        segmentRadius: options.segmentRadius,
        growDirX,
        growDirY,
        spacing: options.spacing,
        spawnGroupId: options.spawnGroupId,
    });
}

export function growChainSegment(state, tailProp, options) {
    const spacing = options.spacing;
    const ballType = options.ballType;
    const growDirX = options.growDirX ?? -1;
    const growDirY = options.growDirY ?? 0;
    const exportType = options.exportType ?? null;
    const spawnGroupId = options.spawnGroupId ?? tailProp.spawnGroupId;
    const linkSlack = options.linkSlack ?? 1;
    const segmentRadius = options.segmentRadius ?? null;
    const spawned = spawnSeg(state, tailProp.x + spacing * growDirX, tailProp.y + spacing * growDirY, ballType);
    if (segmentRadius != null) setCirclePropRadius(spawned.prop, segmentRadius);
    if (spawnGroupId) {
        spawned.prop.spawnGroupId = spawnGroupId;
    }
    const restLength = spacing != null ? spacing * linkSlack : chainLinkRestLength(tailProp, spawned.prop, linkSlack);
    const tailEid = state.entityRegistry.register(ENTITY_KIND_WORLD_PROP, tailProp);
    linkChainBodies(state, tailEid, spawned.eid, restLength);
    return spawned.prop;
}

export { spawnAgentChain };

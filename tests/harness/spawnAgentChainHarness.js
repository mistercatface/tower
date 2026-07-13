import { spawnPlacedSandboxProp } from "../../Libraries/Sandbox/sandbox.js";
import { addDistanceConstraint, getConnectedBodyIds } from "../../Libraries/Physics/physics.js";
import { setCirclePropRadius } from "../../Libraries/Props/props.js";

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

function linkChainBodies(state, bodyA, bodyB, restLength) {
    addDistanceConstraint(state.kinetic, { bodyA, bodyB, restLength });
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
    const propSpec = { leaderIndex, headPropId, bodyPropId, leaderPropId };
    const firstProp = spawnPlacedSandboxProp(state, anchorX, anchorY, resolveSegmentPropId(0, propSpec));
    if (segmentRadius != null) setCirclePropRadius(firstProp, segmentRadius);
    props.push(firstProp);
    let lastProp = firstProp;
    for (let i = 1; i < segmentCount; i++) {
        const bodyProp = spawnPlacedSandboxProp(state, lastProp.x, lastProp.y, resolveSegmentPropId(i, propSpec));
        if (segmentRadius != null) setCirclePropRadius(bodyProp, segmentRadius);
        const dist = spacing ?? chainLinkRestLength(lastProp, bodyProp, linkSlack);
        bodyProp.x = lastProp.x + growDirX * dist;
        bodyProp.y = lastProp.y + growDirY * dist;
        props.push(bodyProp);
        lastProp = bodyProp;
    }
    const leader = props[leaderIndex];
    const resolvedGroupId = spawnGroupId ?? `${exportType ?? "agentChain"}:${leader.id}`;
    for (let i = 0; i < props.length; i++) {
        props[i].spawnGroupId = resolvedGroupId;
        if (exportType) props[i].spawnGroupExportType = exportType;
    }
    props[leaderIndex].spawnGroupAnchor = true;
    for (let i = 0; i < props.length - 1; i++) {
        const a = props[i];
        const b = props[i + 1];
        const segDist = Math.hypot(b.x - a.x, b.y - a.y);
        const restLength = spacing != null ? segDist * linkSlack : segDist;
        linkChainBodies(state, a, b, restLength);
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
    const segment = spawnPlacedSandboxProp(state, tailProp.x + spacing * growDirX, tailProp.y + spacing * growDirY, ballType);
    if (segmentRadius != null) setCirclePropRadius(segment, segmentRadius);
    if (spawnGroupId) {
        segment.spawnGroupId = spawnGroupId;
        if (exportType) segment.spawnGroupExportType = exportType;
    }
    const restLength = spacing != null ? spacing * linkSlack : chainLinkRestLength(tailProp, segment, linkSlack);
    linkChainBodies(state, tailProp, segment, restLength);
    return segment;
}

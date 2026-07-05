import { getSandboxEntityMeta } from "../../GameState/sandboxEntityMeta.js";
import { addChainLink, resolveChainLinkRestLength, setChainHead } from "./chainLinks.js";
import { spawnPlacedSandboxProp } from "./sandboxPlacedSpawn.js";
import { setCirclePropRadius, setPolygonPropBoundingRadius } from "../Props/props.js";
function resolveSegmentPropId(index, { leaderIndex = 0, headPropId, bodyPropId, leaderPropId, resolvePropId }) {
    if (resolvePropId) return resolvePropId(index);
    const leaderId = leaderPropId ?? headPropId ?? bodyPropId;
    if (index === leaderIndex) return leaderId;
    return bodyPropId ?? headPropId ?? leaderId;
}
function applySegmentRadius(prop, segmentRadius, headScaleFn) {
    if (headScaleFn) headScaleFn(prop, segmentRadius);
    else if (segmentRadius != null) {
        const shape = prop.shape;
        if (shape?.type === "Polygon") setPolygonPropBoundingRadius(prop, segmentRadius);
        else setCirclePropRadius(prop, segmentRadius);
    }
}
export function spawnAgentChain(state, anchorIdx, spec) {
    const {
        headPropId,
        bodyPropId,
        leaderPropId,
        leaderIndex = 0,
        segmentCount = 2,
        faction,
        exportType = null,
        linkSlack = 1.0,
        segmentRadius = null,
        growDirX = -1,
        growDirY = 0,
        spacing = null,
        headScaleFn = null,
        onSegmentSpawned = null,
        spawnGroupId = null,
        resolvePropId = null,
    } = spec;
    const grid = state.obstacleGrid;
    const meta = getSandboxEntityMeta(state);
    const anchorWorld = grid.gridToWorldByIdx(anchorIdx);
    const props = [];
    const propSpec = { leaderIndex, headPropId, bodyPropId, leaderPropId, resolvePropId };
    const firstProp = spawnPlacedSandboxProp(state, anchorWorld.x, anchorWorld.y, resolveSegmentPropId(0, propSpec), faction);
    applySegmentRadius(firstProp, segmentRadius, headScaleFn);
    props.push(firstProp);
    if (onSegmentSpawned) onSegmentSpawned(firstProp, 0);
    let lastProp = firstProp;
    for (let i = 1; i < segmentCount; i++) {
        const bodyProp = spawnPlacedSandboxProp(state, lastProp.x, lastProp.y, resolveSegmentPropId(i, propSpec), faction);
        applySegmentRadius(bodyProp, segmentRadius, null);
        if (onSegmentSpawned) onSegmentSpawned(bodyProp, i);
        const dist = spacing ?? resolveChainLinkRestLength(lastProp, bodyProp, linkSlack);
        bodyProp.x = lastProp.x + growDirX * dist;
        bodyProp.y = lastProp.y + growDirY * dist;
        props.push(bodyProp);
        lastProp = bodyProp;
    }
    const leader = props[leaderIndex];
    const resolvedGroupId = spawnGroupId ?? `${exportType ?? "agentChain"}:${leader.id}`;
    for (let i = 0; i < props.length; i++) {
        meta.setSpawnGroupId(props[i].id, resolvedGroupId);
        if (exportType) meta.setSpawnGroupExportType(props[i].id, exportType);
    }
    meta.setSpawnGroupAnchor(leader.id);
    for (let i = 0; i < props.length - 1; i++) {
        const a = props[i];
        const b = props[i + 1];
        const segDist = Math.hypot(b.x - a.x, b.y - a.y);
        const restLength = spacing != null ? segDist * linkSlack : segDist;
        addChainLink(state, a.id, b.id, linkSlack, restLength);
    }
    setChainHead(state, meta, leader.id);
    return { leader, leaderIndex, head: props[0], tail: props[props.length - 1], members: props, spawnGroupId: resolvedGroupId };
}

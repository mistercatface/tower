import { getSandboxEntityMeta } from "../../GameState/sandboxEntityMeta.js";
import { addChainLink, resolveChainLinkRestLength, setChainHead } from "./chainLinks.js";
import { spawnPlacedSandboxProp } from "./sandboxPlacedSpawn.js";
import { setCirclePropRadius, setPolygonPropBoundingRadius } from "../Props/propScale.js";
import { getPropAsset } from "../Props/PropCatalog.js";
export function spawnAgentChain(state, anchorCell, spec) {
    const {
        headPropId,
        bodyPropId,
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
    } = spec;
    const grid = state.obstacleGrid;
    const meta = getSandboxEntityMeta(state);
    const anchorWorld = grid.gridToWorld(anchorCell.col, anchorCell.row);
    const props = [];
    // 1. Spawn head
    const headProp = spawnPlacedSandboxProp(state, anchorWorld.x, anchorWorld.y, headPropId, faction);
    if (headScaleFn) headScaleFn(headProp, segmentRadius);
    else if (segmentRadius != null) {
        const asset = getPropAsset(headPropId);
        if (asset?.physics?.shape === "Polygon") setPolygonPropBoundingRadius(headProp, segmentRadius);
        else setCirclePropRadius(headProp, segmentRadius);
    }
    props.push(headProp);
    if (onSegmentSpawned) onSegmentSpawned(headProp, 0);
    // 2. Spawn body segments trailing behind
    let lastProp = headProp;
    for (let i = 1; i < segmentCount; i++) {
        const bodyProp = spawnPlacedSandboxProp(state, lastProp.x, lastProp.y, bodyPropId, faction);
        if (segmentRadius != null) setCirclePropRadius(bodyProp, segmentRadius);
        if (onSegmentSpawned) onSegmentSpawned(bodyProp, i);
        const dist = spacing ?? resolveChainLinkRestLength(lastProp, bodyProp, linkSlack);
        bodyProp.x = lastProp.x + growDirX * dist;
        bodyProp.y = lastProp.y + growDirY * dist;
        props.push(bodyProp);
        lastProp = bodyProp;
    }
    // 3. Register spawn group metadata
    const resolvedGroupId = spawnGroupId ?? `${exportType ?? "agentChain"}:${props[0].id}`;
    for (let i = 0; i < props.length; i++) {
        meta.setSpawnGroupId(props[i].id, resolvedGroupId);
        if (exportType) meta.setSpawnGroupExportType(props[i].id, exportType);
        if (i === 0) meta.setSpawnGroupAnchor(props[i].id);
    }
    // 4. Establish kinetic distance constraints
    for (let i = 0; i < props.length - 1; i++) addChainLink(state, props[i].id, props[i + 1].id, linkSlack);
    // 5. Set chain head
    setChainHead(state, meta, props[0].id);
    return { head: props[0], tail: props[props.length - 1], members: props, spawnGroupId: resolvedGroupId };
}

import { getConnectedBodyIds } from "../../Motion/kineticConstraintGraph.js";
import { getSandboxEntityMeta } from "../../../GameState/sandboxEntityMeta.js";
import { getSnakeGameConfig, resolveSnakeHeadBodyMaxDistance } from "./snakeGameConfig.js";
import { SNAKE_CHAIN_EXPORT_TYPE } from "./snakeScene.js";
import { isValidAliveSnakeHead, collectSnakeSpawnGroupMemberIds, measureSnakePhysicalSeparation } from "./snakeLifecycle.js";
const LOG_INTERVAL_MS = 250;
const MOVE_SPEED_SQ = 0.01;
function groupSnakeChainPropsBySpawnGroup(state) {
    const meta = getSandboxEntityMeta(state);
    const groups = new Map();
    for (let i = 0; i < state.worldProps.length; i++) {
        const prop = state.worldProps[i];
        if (meta.getSpawnGroupExportType(prop.id) !== SNAKE_CHAIN_EXPORT_TYPE) continue;
        const spawnGroupId = meta.getSpawnGroupId(prop.id);
        if (!spawnGroupId) continue;
        let ids = groups.get(spawnGroupId);
        if (!ids) {
            ids = [];
            groups.set(spawnGroupId, ids);
        }
        ids.push(prop.id);
    }
    return groups;
}
function kineticComponentsForSpawnGroup(state, spawnGroupIds) {
    const idSet = new Set(spawnGroupIds);
    const visited = new Set();
    const components = [];
    for (let i = 0; i < spawnGroupIds.length; i++) {
        const id = spawnGroupIds[i];
        if (visited.has(id)) continue;
        const connected = getConnectedBodyIds(state.kinetic, id);
        const component = [];
        for (let j = 0; j < connected.length; j++) {
            const memberId = connected[j];
            if (!idSet.has(memberId)) continue;
            component.push(memberId);
            visited.add(memberId);
        }
        if (component.length > 0) components.push(component);
    }
    return components;
}
function resolveRegistryHeadForSpawnGroup(state, snakeGame, spawnGroupIds) {
    const registry = snakeGame.registry;
    const meta = getSandboxEntityMeta(state);
    for (const headId of registry.aliveByHeadId.keys()) if (spawnGroupIds.includes(headId)) return headId;
    for (let i = 0; i < spawnGroupIds.length; i++) if (meta.isChainHead(spawnGroupIds[i])) return spawnGroupIds[i];
    for (const entry of registry.inertByLeadId.values()) if (spawnGroupIds.includes(entry.leadSegmentId)) return entry.sourceHeadId ?? entry.leadSegmentId;
    return null;
}
function formatAutosimSnapshot(autosim, state, headId) {
    if (!autosim?.getFsmSnapshot) return { mode: null, destCell: null, pathLen: 0, hasDest: false, autosimActive: false };
    const seeker = headId != null ? state.entityRegistry.getLive(headId) : null;
    const snap = autosim.getFsmSnapshot(seeker, state);
    const dest = autosim.getDestination?.();
    return { mode: snap.mode, destCell: snap.destCell, pathLen: snap.pathLen ?? 0, hasDest: dest != null, autosimActive: autosim.isActive?.() ?? false, lastTransition: snap.lastTransition };
}
function analyzeComponent(state, registry, headPropId, memberIds) {
    let liveCount = 0;
    let hasHeadProp = false;
    let hasValidSteeredHead = false;
    let rollDriveId = null;
    let rollDriveKind = "none";
    let maxSpeedSq = 0;
    for (let i = 0; i < memberIds.length; i++) {
        const ref = state.entityRegistry.get(memberIds[i]);
        if (ref?.type === headPropId) hasHeadProp = true;
        const prop = ref && !ref.isDead ? ref : null;
        if (!prop) continue;
        liveCount++;
        if (isValidAliveSnakeHead(state, registry, memberIds[i])) hasValidSteeredHead = true;
        const vx = prop.vx ?? 0;
        const vy = prop.vy ?? 0;
        const speedSq = vx * vx + vy * vy;
        if (speedSq > maxSpeedSq) maxSpeedSq = speedSq;
        if (prop._groundRollDrive != null) {
            rollDriveId = memberIds[i];
            rollDriveKind = prop._groundRollDrive.kind;
        }
    }
    return { liveCount, hasHeadProp, hasValidSteeredHead, rollDriveId, rollDriveKind, maxSpeedSq };
}
function shouldLog(snakeGame, key, now) {
    if (!snakeGame._loneHeadDebugLastLog) snakeGame._loneHeadDebugLastLog = new Map();
    const last = snakeGame._loneHeadDebugLastLog.get(key);
    if (last != null && now - last < LOG_INTERVAL_MS) return false;
    snakeGame._loneHeadDebugLastLog.set(key, now);
    return true;
}
function isPathing(analysis, autosimSnap) {
    if (analysis.rollDriveId != null) return true;
    if (analysis.maxSpeedSq > MOVE_SPEED_SQ) return true;
    if (autosimSnap.autosimActive && (autosimSnap.hasDest || autosimSnap.pathLen > 0)) return true;
    return false;
}
function probeSpawnGroupSnakes(state, snakeGame, now) {
    const registry = snakeGame.registry;
    const autosimsByHeadId = snakeGame.autosimsByHeadId;
    const headPropId = getSnakeGameConfig().headPropId;
    const groups = groupSnakeChainPropsBySpawnGroup(state);
    for (const [spawnGroupId, spawnGroupIds] of groups) {
        const registryHeadId = resolveRegistryHeadForSpawnGroup(state, snakeGame, spawnGroupIds);
        const autosim = registryHeadId != null ? autosimsByHeadId.get(registryHeadId) : null;
        const autosimSnap = formatAutosimSnapshot(autosim, state, registryHeadId);
        const components = kineticComponentsForSpawnGroup(state, spawnGroupIds);
        const registryHeadComponent = registryHeadId != null ? getConnectedBodyIds(state.kinetic, registryHeadId).filter((id) => spawnGroupIds.includes(id)) : [];
        for (let c = 0; c < components.length; c++) {
            const memberIds = components[c];
            const analysis = analyzeComponent(state, registry, headPropId, memberIds);
            if (analysis.liveCount <= 1) continue;
            const headless = !analysis.hasHeadProp || !analysis.hasValidSteeredHead;
            if (!headless) continue;
            const pathing = isPathing(analysis, autosimSnap);
            const remoteSteer =
                registryHeadId != null && autosimSnap.autosimActive && (autosimSnap.hasDest || autosimSnap.pathLen > 0 || analysis.rollDriveId != null) && !memberIds.includes(registryHeadId);
            const key = `headless:${spawnGroupId}:${memberIds[0]}`;
            if (!shouldLog(snakeGame, key, now)) continue;
            const dest = autosimSnap.destCell ? `${autosimSnap.destCell.col},${autosimSnap.destCell.row}` : "—";
            const tag = analysis.rollDriveId != null || remoteSteer ? "STEERED" : pathing ? "PATHING" : "idle";
            console.warn(
                `[snake-headless ${tag}] spawnGroup=${spawnGroupId} lead=${memberIds[0]} segments=${memberIds.length} ` +
                    `hasHeadProp=${analysis.hasHeadProp} validSteeredHead=${analysis.hasValidSteeredHead} ` +
                    `registryHead=${registryHeadId ?? "—"} headInComponent=${registryHeadId != null && memberIds.includes(registryHeadId)} ` +
                    `remoteSteer=${remoteSteer} autosimActive=${autosimSnap.autosimActive} mode=${autosimSnap.mode ?? "—"} dest=${dest} pathLen=${autosimSnap.pathLen} ` +
                    `rollDriveId=${analysis.rollDriveId ?? "—"} rollDrive=${analysis.rollDriveKind} speed=${Math.sqrt(analysis.maxSpeedSq).toFixed(1)} ` +
                    `memberIds=${memberIds.join(",")}`,
            );
        }
        if (registryHeadId != null && registry.aliveByHeadId.has(registryHeadId) && !isValidAliveSnakeHead(state, registry, registryHeadId)) {
            const key = `invalid-alive:${registryHeadId}`;
            if (!shouldLog(snakeGame, key, now)) continue;
            const analysis = analyzeComponent(state, registry, headPropId, registryHeadComponent.length ? registryHeadComponent : [registryHeadId]);
            const dest = autosimSnap.destCell ? `${autosimSnap.destCell.col},${autosimSnap.destCell.row}` : "—";
            console.warn(
                `[snake-invalid-alive STEERED] headId=${registryHeadId} spawnGroup=${spawnGroupId} ` +
                    `autosimActive=${autosimSnap.autosimActive} mode=${autosimSnap.mode ?? "—"} dest=${dest} pathLen=${autosimSnap.pathLen} ` +
                    `componentLen=${registryHeadComponent.length} rollDrive=${analysis.rollDriveKind} speed=${Math.sqrt(analysis.maxSpeedSq).toFixed(1)}`,
            );
        }
        if (components.length > 1 && registryHeadId != null && autosimSnap.autosimActive && (autosimSnap.hasDest || autosimSnap.pathLen > 0))
            for (let c = 0; c < components.length; c++) {
                const memberIds = components[c];
                if (memberIds.includes(registryHeadId)) continue;
                const analysis = analyzeComponent(state, registry, headPropId, memberIds);
                if (analysis.liveCount <= 1) continue;
                const key = `split-brain:${spawnGroupId}:${memberIds[0]}`;
                if (!shouldLog(snakeGame, key, now)) continue;
                const dest = autosimSnap.destCell ? `${autosimSnap.destCell.col},${autosimSnap.destCell.row}` : "—";
                console.warn(
                    `[snake-split-brain STEERED] spawnGroup=${spawnGroupId} bodyLead=${memberIds[0]} bodySegments=${memberIds.length} ` +
                        `steeringHead=${registryHeadId} headComponentLen=${registryHeadComponent.length} dest=${dest} pathLen=${autosimSnap.pathLen} ` +
                        `bodySpeed=${Math.sqrt(analysis.maxSpeedSq).toFixed(1)} bodyRollDrive=${analysis.rollDriveKind} memberIds=${memberIds.join(",")}`,
                );
            }
    }
}
function probeLoneHeads(state, snakeGame, now) {
    const registry = snakeGame.registry;
    const autosimsByHeadId = snakeGame.autosimsByHeadId;
    const meta = getSandboxEntityMeta(state);
    const headPropId = getSnakeGameConfig().headPropId;
    const ids = new Set();
    for (const headId of registry.aliveByHeadId.keys()) ids.add(headId);
    for (const headId of registry.deadHeadIds) ids.add(headId);
    for (const leadId of registry.inertByLeadId.keys()) ids.add(leadId);
    for (const headId of autosimsByHeadId.keys()) ids.add(headId);
    for (let i = 0; i < state.worldProps.length; i++) {
        const prop = state.worldProps[i];
        if (prop.type === headPropId) ids.add(prop.id);
    }
    for (const headId of ids) {
        const prop = state.entityRegistry.getLive(headId);
        if (!prop) continue;
        const members = getConnectedBodyIds(state.kinetic, headId);
        if (members.length !== 1) continue;
        const vx = prop.vx ?? 0;
        const vy = prop.vy ?? 0;
        const speedSq = vx * vx + vy * vy;
        const hasRollDrive = prop._groundRollDrive != null;
        const alive = registry.aliveByHeadId.has(headId);
        const dead = registry.deadHeadIds.has(headId);
        const inertLead = registry.inertByLeadId.has(headId);
        const autosim = autosimsByHeadId.get(headId);
        const autosimSnap = formatAutosimSnapshot(autosim, state, headId);
        const moving = speedSq > MOVE_SPEED_SQ || hasRollDrive;
        const steered = hasRollDrive || (autosimSnap.autosimActive && alive) || (autosimSnap.autosimActive && (autosimSnap.hasDest || autosimSnap.pathLen > 0));
        if (!moving && !steered) continue;
        if (!shouldLog(snakeGame, `lone:${headId}`, now)) continue;
        const driveKind = hasRollDrive ? prop._groundRollDrive.kind : "none";
        const dest = autosimSnap.destCell ? `${autosimSnap.destCell.col},${autosimSnap.destCell.row}` : "—";
        const tag = steered ? "STEERED" : "physics";
        console.warn(
            `[snake-lone-head ${tag}] id=${headId} type=${prop.type} ` +
                `alive=${alive} dead=${dead} inertLead=${inertLead} chainHead=${meta.isChainHead(headId)} ` +
                `autosimActive=${autosimSnap.autosimActive} mode=${autosimSnap.mode ?? "—"} dest=${dest} pathLen=${autosimSnap.pathLen} trans=${autosimSnap.lastTransition ?? "—"} ` +
                `speed=${Math.sqrt(speedSq).toFixed(1)} rollDrive=${driveKind} vx=${vx.toFixed(1)} vy=${vy.toFixed(1)}`,
        );
    }
}
function probeHeadSeparationFromBody(state, snakeGame, now) {
    const threshold = resolveSnakeHeadBodyMaxDistance();
    const registry = snakeGame.registry;
    const autosimsByHeadId = snakeGame.autosimsByHeadId;
    for (const headId of registry.aliveByHeadId.keys()) {
        const head = state.entityRegistry.getLive(headId);
        if (!head) continue;
        const separation = measureSnakePhysicalSeparation(state, headId);
        const { maxLinkSpan, nearestBodyDist, nearestBodyId } = separation;
        if (separation.orderedMembers.length <= 1 && nearestBodyDist === Infinity) continue;
        if (maxLinkSpan <= threshold && nearestBodyDist <= threshold) continue;
        const key = `separated:${headId}`;
        if (!shouldLog(snakeGame, key, now)) continue;
        const connected = new Set(getConnectedBodyIds(state.kinetic, headId));
        const autosim = autosimsByHeadId.get(headId);
        const autosimSnap = formatAutosimSnapshot(autosim, state, headId);
        const dest = autosimSnap.destCell ? `${autosimSnap.destCell.col},${autosimSnap.destCell.row}` : "—";
        const liveBodyCount = collectSnakeSpawnGroupMemberIds(state, headId).filter((id) => id !== headId && state.entityRegistry.getLive(id)).length;
        console.warn(
            `[snake-head-separated] headId=${headId} threshold=${threshold.toFixed(1)} maxLinkSpan=${maxLinkSpan.toFixed(1)} nearestDist=${nearestBodyDist === Infinity ? "—" : nearestBodyDist.toFixed(1)} ` +
                `nearestSegment=${nearestBodyId ?? "—"} liveBodyCount=${liveBodyCount} kineticLinked=${nearestBodyId != null && connected.has(nearestBodyId)} ` +
                `validAliveHead=${isValidAliveSnakeHead(state, registry, headId)} autosimActive=${autosimSnap.autosimActive} ` +
                `mode=${autosimSnap.mode ?? "—"} dest=${dest} pathLen=${autosimSnap.pathLen} rollDrive=${head._groundRollDrive?.kind ?? "none"} ` +
                `headSpeed=${Math.hypot(head.vx ?? 0, head.vy ?? 0).toFixed(1)} headPos=${head.x.toFixed(0)},${head.y.toFixed(0)}`,
        );
    }
}
export function probeSnakeLoneHeadMovement(state, snakeGame) {
    if (!getSnakeGameConfig().logLoneHeadMovement) return;
    const now = performance.now();
    probeSpawnGroupSnakes(state, snakeGame, now);
    probeHeadSeparationFromBody(state, snakeGame, now);
    probeLoneHeads(state, snakeGame, now);
}

import { kineticSpatial } from "../../../Systems/World/KineticSpatialFrame.js";
import { kineticPairBuffer } from "../../Spatial/collision/kineticPairStream.js";
import { findNearestVisibleThreat, pickFleeCell } from "./snakeIntent.js";
const MAX_DETAIL_SNAKES = 8;
const LOG_INTERVAL_MS = 500;
function createPhysicsAccumulator() {
    return { contactSideEffectCalls: 0, maxContacts: 0, maxPairCandidates: 0, lastCombatContactCount: 0 };
}
function formatSnakeDetail(s) {
    const dest = s.destCell ? `${s.destCell.col},${s.destCell.row}` : "—";
    return `id=${s.headId} mode=${s.mode} trans=${s.lastTransition} dest=${dest} replan=${s.replanReason ?? "—"} stuck=${s.stuckFrames} fleeCell=${s.fleeCellOk}`;
}
function formatDebugLine(frame, physics, summary, detailSnakes) {
    const p = physics;
    let line =
        `[snake-collision-debug f${frame}] ` +
        `pairs=${p.maxPairCandidates} contacts=${p.maxContacts} contactPasses=${p.contactSideEffectCalls} ` +
        `active=${p.activeBodies} substeps=${p.substepsRun}/${p.substepsPlanned} outer=${p.outerIterations}/${p.maxIterations} ` +
        `alive=${summary.alive} flee=${summary.modes.flee} replan=${summary.replanPending} fleeBlocked=${summary.fleeCellBlocked} ` +
        `fleeContinue=${summary.fleeContinue} repick=${summary.repickDest}`;
    if (p.maxContacts > 0) line += ` COMBAT_CONTACTS=${p.combatContactCount}`;
    if (detailSnakes.length) line += ` | ${detailSnakes.map(formatSnakeDetail).join(" || ")}`;
    return line;
}
export function initSnakeCollisionDebug(snakeGame) {
    snakeGame.collisionDebugEnabled = true;
    snakeGame.collisionDebug = { frame: 0, physics: null, summary: null, detailSnakes: [] };
    snakeGame._collisionDebugAccum = createPhysicsAccumulator();
    snakeGame._collisionDebugSummary = null;
    snakeGame._collisionDebugDetail = [];
    snakeGame._collisionDebugLastLogMs = 0;
}
export function recordSnakeContactSideEffects(snakeGame, contacts) {
    if (!snakeGame?.collisionDebugEnabled) return;
    const acc = snakeGame._collisionDebugAccum;
    acc.contactSideEffectCalls++;
    if (contacts.count > acc.maxContacts) acc.maxContacts = contacts.count;
    if (kineticPairBuffer.count > acc.maxPairCandidates) acc.maxPairCandidates = kineticPairBuffer.count;
    if (snakeGame._lastCombatContactCount != null) acc.lastCombatContactCount = snakeGame._lastCombatContactCount;
}
export function recordSnakeAutosimDebug(state, autosimsByHeadId) {
    const snakeGame = state.sandbox.snakeGame;
    if (!snakeGame?.collisionDebugEnabled) return;
    const registry = snakeGame.registry;
    let alive = 0;
    let fleeCount = 0;
    let replanPending = 0;
    let fleeCellBlocked = 0;
    let fleeContinue = 0;
    let repickDest = 0;
    const modes = { flee: 0, explore: 0, seek_food: 0, other: 0 };
    const lightSnakes = [];
    for (const [headId, autosim] of autosimsByHeadId) {
        if (!autosim.isActive()) continue;
        if (!registry.aliveByHeadId.has(headId)) continue;
        const seeker = state.entityRegistry.getLive(headId);
        if (!seeker) continue;
        alive++;
        const snapshot = autosim.getFsmSnapshot();
        if (snapshot.mode === "flee") modes.flee++;
        else if (snapshot.mode === "explore") modes.explore++;
        else if (snapshot.mode === "seek_food") modes.seek_food++;
        else modes.other++;
        if (snapshot.replanReason) replanPending++;
        if (snapshot.lastTransition === "flee_continue") fleeContinue++;
        if (snapshot.lastTransition === "repick_dest" || snapshot.lastTransition === "route_failed_retry") repickDest++;
        lightSnakes.push({
            headId,
            mode: snapshot.mode,
            lastTransition: snapshot.lastTransition,
            destCell: snapshot.destCell,
            replanReason: snapshot.replanReason,
            stuckFrames: snapshot.stuckFrames,
            fleeCellOk: null,
        });
    }
    fleeCount = modes.flee;
    snakeGame._collisionDebugSummary = { alive, modes, replanPending, fleeCellBlocked, fleeContinue, repickDest };
    snakeGame._collisionDebugLightSnakes = lightSnakes;
    snakeGame._collisionDebugFleeCount = fleeCount;
}
function enrichFleeCellChecks(state, snakes, maxChecks) {
    const snakeGame = state.sandbox.snakeGame;
    const registry = snakeGame.registry;
    const grid = state.obstacleGrid;
    const navWalkable = snakeGame.navWalkable;
    let checks = 0;
    for (let i = 0; i < snakes.length && checks < maxChecks; i++) {
        const s = snakes[i];
        if (s.mode !== "flee") continue;
        const seeker = state.entityRegistry.getLive(s.headId);
        if (!seeker) continue;
        const threat = findNearestVisibleThreat(seeker, s.headId, state, registry);
        s.fleeCellOk = threat ? pickFleeCell(seeker, threat, grid, navWalkable) != null : null;
        if (s.fleeCellOk === false) snakeGame._collisionDebugSummary.fleeCellBlocked++;
        checks++;
    }
}
function pickDetailSnakes(lightSnakes, physics) {
    const picked = [];
    const want = physics.maxContacts > 0;
    for (let i = 0; i < lightSnakes.length && picked.length < MAX_DETAIL_SNAKES; i++) {
        const s = lightSnakes[i];
        if (want && s.mode === "flee") picked.push(s);
    }
    if (picked.length >= MAX_DETAIL_SNAKES) return picked;
    for (let i = 0; i < lightSnakes.length && picked.length < MAX_DETAIL_SNAKES; i++) {
        const s = lightSnakes[i];
        if (s.mode !== "flee") continue;
        if (picked.includes(s)) continue;
        picked.push(s);
    }
    if (picked.length >= MAX_DETAIL_SNAKES) return picked;
    for (let i = 0; i < lightSnakes.length && picked.length < MAX_DETAIL_SNAKES; i++) {
        const s = lightSnakes[i];
        if (s.replanReason || s.lastTransition === "flee_continue" || s.lastTransition === "repick_dest") if (!picked.includes(s)) picked.push(s);
    }
    return picked;
}
function shouldLogSnakeCollisionDebug(physics, summary) {
    if (physics.maxContacts > 0) return true;
    if (summary.modes.flee > 0 && (summary.fleeContinue > 0 || summary.repickDest > 0 || summary.replanPending > 0)) return true;
    return false;
}
export function flushSnakeCollisionDebugLog(state) {
    const snakeGame = state.sandbox.snakeGame;
    if (!snakeGame?.collisionDebugEnabled) return;
    const acc = snakeGame._collisionDebugAccum;
    const motion = state.kinetic.motionSubstepStats ?? {};
    const solver = state.kinetic.kineticSolverStats ?? {};
    const contactStats = state.kinetic.kineticContactStats ?? {};
    const physics = {
        substepsRun: motion.substepsRun ?? 0,
        substepsPlanned: motion.substepsPlanned ?? 0,
        outerIterations: solver.outerIterations ?? 0,
        maxIterations: solver.maxIterations ?? 0,
        contactInnerIterations: contactStats.innerIterations ?? 0,
        contactMaxImpulse: contactStats.maxImpulse ?? 0,
        maxPairCandidates: acc.maxPairCandidates,
        maxContacts: acc.maxContacts,
        contactSideEffectCalls: acc.contactSideEffectCalls,
        combatContactCount: acc.lastCombatContactCount,
        activeBodies: kineticSpatial._activeKineticBodies?.length ?? 0,
    };
    const summary = snakeGame._collisionDebugSummary ?? { alive: 0, modes: { flee: 0, explore: 0, seek_food: 0, other: 0 }, replanPending: 0, fleeCellBlocked: 0, fleeContinue: 0, repickDest: 0 };
    summary.fleeCellBlocked = 0;
    const lightSnakes = snakeGame._collisionDebugLightSnakes ?? [];
    const detailSnakes = pickDetailSnakes(lightSnakes, physics);
    if (physics.maxContacts > 0 && detailSnakes.length) enrichFleeCellChecks(state, detailSnakes, MAX_DETAIL_SNAKES);
    const frame = (snakeGame.collisionDebug?.frame ?? 0) + 1;
    snakeGame.collisionDebug = { frame, physics, summary, detailSnakes };
    const now = performance.now();
    if (shouldLogSnakeCollisionDebug(physics, summary) && now - snakeGame._collisionDebugLastLogMs >= LOG_INTERVAL_MS) {
        console.log(formatDebugLine(frame, physics, summary, detailSnakes));
        snakeGame._collisionDebugLastLogMs = now;
    }
    snakeGame._collisionDebugAccum = createPhysicsAccumulator();
}

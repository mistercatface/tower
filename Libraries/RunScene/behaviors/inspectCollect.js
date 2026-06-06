import { fireRadioTrigger, requestUiHudUpdate, startRadioConversation } from "../../../Core/EventSystem.js";
import { findInspectablePickup } from "../../../Combat/inspect/inspectTargeting.js";
import { getRunSceneMission, setRunSceneMission } from "../runSceneState.js";

/**
 * @param {import("../compileRunScenes.js").RunSceneConfig} def
 * @param {import("../runScenePorts.js").RunScenePorts} ports
 */
export function inspectCollectBehavior(def, ports) {
    const config = def.config ?? {};

    return {
        enter(state, ctx) {
            const mission = getRunSceneMission(state);
            if (mission?.completed) return;
            if (!mission?.active) beginMission(state, config, ctx, ports);
        },
    };
}

function resolveGuidedRadios(config, ports) {
    if (config.guidedRadios) return config.guidedRadios;
    const map = {};
    for (const key of config.keys ?? []) {
        const ids = ports.radioRegistry.getConversationIdsForTrigger(`inspect:${key}`);
        if (ids[0]) map[key] = ids[0];
    }
    return map;
}

function beginMission(state, config, ctx, ports) {
    setRunSceneMission(state, {
        type: "inspect_collect",
        keys: config.keys ?? [],
        seen: new Set(),
        active: true,
        finishing: false,
        completed: false,
        completeRadio: config.completeRadio ?? null,
        returnPhase: config.returnPhase ?? "simulation",
        missionLabel: config.missionLabel ?? "Search for clues ({found}/{total})",
        guidedRadios: resolveGuidedRadios(config, ports),
        onAdvance: () => {
            state.skipSimulationEnterReset = true;
            ctx.fsm?.transition(config.returnPhase ?? "simulation");
        },
    });
    state.inspectPanelOpen = false;
    clearGuidedRadioSeen(state, config, ports);
    requestUiHudUpdate();
}

function clearGuidedRadioSeen(state, config, ports) {
    if (!state.radioSeenThisRun) return;
    for (const conversationId of Object.values(resolveGuidedRadios(config, ports))) {
        delete state.radioSeenThisRun[conversationId];
    }
}

export function isInspectCollectActive(state) {
    const mission = getRunSceneMission(state);
    return mission?.type === "inspect_collect" && mission.active;
}

export function getInspectCollectMissionBanner(state) {
    const mission = getRunSceneMission(state);
    if (!isInspectCollectActive(state) && !mission?.finishing) {
        return { show: false, text: "" };
    }
    const found = mission.seen?.size ?? 0;
    const total = mission.keys?.length ?? 0;
    const text = (mission.missionLabel ?? "").replace("{found}", String(found)).replace("{total}", String(total));
    return { show: true, text };
}

export function findInspectCollectPickup(state, worldX, worldY) {
    const mission = getRunSceneMission(state);
    if (!isInspectCollectActive(state)) return null;
    return findInspectablePickup(state, worldX, worldY, { allowedInspectKeys: mission.keys });
}

export function handleInspectCollectOpen(state, inspectKey) {
    if (!isInspectCollectActive(state) || !inspectKey) return;
    const mission = getRunSceneMission(state);
    state.inspectPanelOpen = true;

    const conversationId = mission.guidedRadios?.[inspectKey] ?? null;
    if (!conversationId) {
        recordInspectCollectFound(state, inspectKey);
        return;
    }
    startRadioConversation(conversationId, () => recordInspectCollectFound(state, inspectKey), state, { force: true });
}

export function handleInspectCollectClose(state, inspectKey) {
    const mission = getRunSceneMission(state);
    if (!mission?.seen || !inspectKey) return;
    state.inspectPanelOpen = false;
    if (!mission.seen.has(inspectKey)) {
        recordInspectCollectFound(state, inspectKey);
    } else {
        tryFinishMission(state);
    }
}

export function recordInspectCollectFound(state, inspectKey) {
    const mission = getRunSceneMission(state);
    if (!mission?.seen || mission.completed || !inspectKey) return;
    if (!mission.keys.includes(inspectKey)) return;
    mission.seen.add(inspectKey);
    requestUiHudUpdate();
    tryFinishMission(state);
}

function tryFinishMission(state) {
    const mission = getRunSceneMission(state);
    if (!mission?.seen || mission.completed) return;
    if (!mission.keys.every((key) => mission.seen.has(key))) return;
    if (state.inspectPanelOpen) return;
    finishMission(state);
}

function finishMission(state) {
    const mission = getRunSceneMission(state);
    if (!mission || mission.finishing) return;
    mission.finishing = true;
    mission.active = false;
    requestUiHudUpdate();
    const onDone = () => {
        mission.completed = true;
        mission.finishing = false;
        const onAdvance = mission.onAdvance;
        mission.onAdvance = null;
        if (onAdvance) onAdvance();
    };
    if (mission.completeRadio) {
        fireRadioTrigger(mission.completeRadio, onDone, state);
    } else {
        onDone();
    }
}

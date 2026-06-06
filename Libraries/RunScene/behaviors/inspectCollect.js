import { fireRadioTrigger, requestUiHudUpdate, startRadioConversation } from "../../../Core/EventSystem.js";
import { findInspectablePickup } from "../../../Combat/inspect/inspectTargeting.js";
import { towerRadioRegistry } from "../../../Games/tower/wireRadio.js";

/**
 * @param {import("../compileRunScenes.js").RunSceneConfig} def
 */
export function inspectCollectBehavior(def) {
    const config = def.config ?? {};

    return {
        enter(state, ctx) {
            if (state.runMission?.completed) return;
            if (!state.runMission?.active) {
                beginMission(state, config, ctx);
            }
        },
    };
}

function beginMission(state, config, ctx) {
    state.runMission = {
        type: "inspect_collect",
        keys: config.keys ?? [],
        seen: new Set(),
        active: true,
        finishing: false,
        completed: false,
        completeRadio: config.completeRadio ?? null,
        returnPhase: config.returnPhase ?? "combat",
        missionLabel: config.missionLabel ?? "Search for clues ({found}/{total})",
        guidedRadios: config.guidedRadios ?? null,
        onAdvance: () => {
            state.skipCombatEnterReset = true;
            ctx.fsm?.transition(config.returnPhase ?? "combat");
        },
    };
    state.inspectPanelOpen = false;
    clearGuidedRadioSeen(state, config);
    requestUiHudUpdate();
}

function clearGuidedRadioSeen(state, config) {
    if (!state.radioSeenThisRun) return;
    for (const key of config.keys ?? []) {
        for (const conversationId of getGuidedConversationIds(key, config)) {
            delete state.radioSeenThisRun[conversationId];
        }
    }
}

function getGuidedConversationIds(key, config) {
    if (config.guidedRadios?.[key]) return [config.guidedRadios[key]];
    return towerRadioRegistry.getConversationIdsForTrigger(`inspect:${key}`);
}

export function isInspectCollectActive(state) {
    return state.runMission?.type === "inspect_collect" && state.runMission.active;
}

export function getInspectCollectMissionBanner(state) {
    const mission = state.runMission;
    if (!isInspectCollectActive(state) && !mission?.finishing) {
        return { show: false, text: "" };
    }
    const found = mission.seen?.size ?? 0;
    const total = mission.keys?.length ?? 0;
    const text = (mission.missionLabel ?? "").replace("{found}", String(found)).replace("{total}", String(total));
    return { show: true, text };
}

export function findInspectCollectPickup(state, worldX, worldY) {
    const mission = state.runMission;
    if (!isInspectCollectActive(state)) return null;
    return findInspectablePickup(state, worldX, worldY, {
        allowedInspectKeys: mission.keys,
    });
}

export function handleInspectCollectOpen(state, inspectKey) {
    if (!isInspectCollectActive(state) || !inspectKey) return;
    const mission = state.runMission;
    state.inspectPanelOpen = true;

    const conversationIds = getGuidedConversationIds(inspectKey, {
        keys: mission.keys,
        guidedRadios: mission.guidedRadios,
    });
    const conversationId = conversationIds[0];
    if (!conversationId) {
        recordInspectCollectFound(state, inspectKey);
        return;
    }
    startRadioConversation(conversationId, () => recordInspectCollectFound(state, inspectKey), state, { force: true });
}

export function handleInspectCollectClose(state, inspectKey) {
    if (!state.runMission?.seen || !inspectKey) return;
    state.inspectPanelOpen = false;
    if (!state.runMission.seen.has(inspectKey)) {
        recordInspectCollectFound(state, inspectKey);
    } else {
        tryFinishMission(state);
    }
}

export function recordInspectCollectFound(state, inspectKey) {
    const mission = state.runMission;
    if (!mission?.seen || mission.completed || !inspectKey) return;
    if (!mission.keys.includes(inspectKey)) return;

    mission.seen.add(inspectKey);
    requestUiHudUpdate();
    tryFinishMission(state);
}

function tryFinishMission(state) {
    const mission = state.runMission;
    if (!mission?.seen || mission.completed) return;
    if (!mission.keys.every((key) => mission.seen.has(key))) return;
    if (state.inspectPanelOpen) return;
    finishMission(state);
}

function finishMission(state) {
    const mission = state.runMission;
    if (!mission || mission.finishing) return;

    mission.finishing = true;
    mission.active = false;
    requestUiHudUpdate();

    const onDone = () => {
        mission.completed = true;
        mission.finishing = false;
        state.clueSearchCompleted = true;
        state.clueSearchActive = false;
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

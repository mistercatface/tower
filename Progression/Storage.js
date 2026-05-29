import { StatsManager } from "./StatsManager.js";
import { Events } from "../Core/EventNames.js";

const SAVE_VERSION = 3;
const SAVE_KEY = "tower_save_v3";
const SAVE_DEBOUNCE_MS = 800;
const SAVE_INTERVAL_MS = 30000;

let dirty = false;
let saveStateRef = null;
let debounceEventId = null;
let autosaveEventId = null;
let listenersBound = false;

function asNonNegativeInt(value, fallback = 0) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 0) return fallback;
    return parsed;
}

function resetProgress(state) {
    state.wavesCompleted = 0;
    state.highestLevelReached = 0;
    state.claimedPerkMilestones = [];
    state.discoveredAbilities = new Set();
    StatsManager.resetUpgradesToDefault(state);
}

function serializeProgress(state) {
    const upgrades = {};
    Object.keys(state.upgrades).forEach((id) => {
        const upgradeState = state.upgrades[id];
        upgrades[id] = {
            baseLevel: asNonNegativeInt(upgradeState.baseLevel, 0)
        };
    });

    return {
        version: SAVE_VERSION,
        savedAt: Date.now(),
        upgrades,
        highestLevelReached: asNonNegativeInt(state.highestLevelReached, 0),
        claimedPerkMilestones: Array.isArray(state.claimedPerkMilestones) ? state.claimedPerkMilestones.map((m) => asNonNegativeInt(m, 0)) : [],
        discoveredAbilities: Array.from(state.discoveredAbilities || [])
    };
}

function applyProgress(state, upgrades, payload) {
    resetProgress(state);

    if (!payload || typeof payload !== "object" || payload.version !== SAVE_VERSION) {
        return;
    }

    if (payload.upgrades && typeof payload.upgrades === "object") {
        Object.keys(payload.upgrades).forEach((id) => {
            if (!state.upgrades[id]) return;
            const upgDef = upgrades.find((u) => u.id === id);
            const maxLevel = upgDef ? upgDef.maxLevel : Infinity;
            const baseLevel = asNonNegativeInt(payload.upgrades[id]?.baseLevel, 0);
            state.upgrades[id].baseLevel = Math.min(baseLevel, maxLevel);
        });
    }

    state.highestLevelReached = asNonNegativeInt(payload.highestLevelReached, 0);
    state.claimedPerkMilestones = Array.isArray(payload.claimedPerkMilestones) ? payload.claimedPerkMilestones.map((m) => asNonNegativeInt(m, 0)) : [];
    state.discoveredAbilities = new Set(Array.isArray(payload.discoveredAbilities) ? payload.discoveredAbilities.filter((id) => typeof id === "string") : []);
}

function cancelDebounceEvent() {
    if (!saveStateRef?.scheduler) return;
    if (debounceEventId !== null) {
        saveStateRef.scheduler.cancel(debounceEventId);
        debounceEventId = null;
    }
}

function cancelAutosaveEvent() {
    if (!saveStateRef?.scheduler) return;
    if (autosaveEventId !== null) {
        saveStateRef.scheduler.cancel(autosaveEventId);
        autosaveEventId = null;
    }
}

function flushSave() {
    if (!saveStateRef) return;

    try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(serializeProgress(saveStateRef)));
        dirty = false;
    } catch (_error) {
        // Ignore write errors (quota/private mode); game remains playable.
    }
}

function queueFlush() {
    if (!saveStateRef?.scheduler) return;
    cancelDebounceEvent();
    debounceEventId = saveStateRef.scheduler.schedule(SAVE_DEBOUNCE_MS, () => {
        debounceEventId = null;
        if (dirty) flushSave();
    });
}

function bindLifecycleListeners() {
    if (listenersBound || typeof window === "undefined") return;

    window.addEventListener("beforeunload", () => {
        if (dirty) flushSave();
    });

    window.addEventListener("pagehide", () => {
        if (dirty) flushSave();
    });

    listenersBound = true;
}

export function initializeSaveSystem(state) {
    saveStateRef = state;
    bindLifecycleListeners();

    if (!saveStateRef?.scheduler) return;
    cancelAutosaveEvent();
    autosaveEventId = saveStateRef.scheduler.schedule(
        SAVE_INTERVAL_MS,
        () => {
            if (dirty) flushSave();
        },
        true
    );
}

export function loadProgress(state, upgrades) {
    saveStateRef = state;

    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) {
        resetProgress(state);
        return;
    }

    try {
        const parsed = JSON.parse(raw);
        applyProgress(state, upgrades, parsed);
    } catch (_error) {
        localStorage.removeItem(SAVE_KEY);
        resetProgress(state);
    }
}

export function markProgressDirty(state) {
    saveStateRef = state;
    dirty = true;
    queueFlush();
}

export function saveProgress(state) {
    saveStateRef = state;
    dirty = true;
    cancelDebounceEvent();
    flushSave();
}

export function hardResetProgress(state, resetGameCallback) {
    saveStateRef = state;
    cancelDebounceEvent();
    cancelAutosaveEvent();
    dirty = false;
    localStorage.removeItem(SAVE_KEY);
    resetProgress(state);
    resetGameCallback();
}

export function registerProgressListeners(eventBus) {
    eventBus.on(Events.PROGRESS_DIRTY, ({ state }) => markProgressDirty(state));
    eventBus.on(Events.PROGRESS_SAVE, ({ state }) => saveProgress(state));
}
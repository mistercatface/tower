import { StatsManager } from "./StatsManager.js";
import { Events } from "../../../Core/EventNames.js";
import { clearPersistentTriggers } from "../../../Core/PersistentTriggers.js";
import { createDebouncedStorage } from "../../../Libraries/Persistence/index.js";
const SAVE_VERSION = 4;
const SAVE_KEY = "tower_save_v4";
const SAVE_DEBOUNCE_MS = 800;
const SAVE_INTERVAL_MS = 30000;
let saveStateRef = null;
/** @type {ReturnType<typeof createDebouncedStorage> | null} */
let progressStore = null;
function asNonNegativeInt(value, fallback = 0) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 0) return fallback;
    return parsed;
}
function resetProgress(state) {
    state.highestLevelReached = 0;
    state.claimedPerkMilestones = [];
    state.discoveredAbilities = new Set();
    StatsManager.resetUpgradesToDefault(state);
}
function serializeProgress(state) {
    const upgrades = {};
    Object.keys(state.player.upgrades).forEach((id) => {
        const upgradeState = state.player.upgrades[id];
        upgrades[id] = { baseLevel: asNonNegativeInt(upgradeState.baseLevel, 0) };
    });
    return {
        version: SAVE_VERSION,
        savedAt: Date.now(),
        upgrades,
        highestLevelReached: asNonNegativeInt(state.highestLevelReached, 0),
        claimedPerkMilestones: Array.isArray(state.claimedPerkMilestones) ? state.claimedPerkMilestones.map((m) => asNonNegativeInt(m, 0)) : [],
        discoveredAbilities: Array.from(state.discoveredAbilities || []),
    };
}
function applyProgress(state, payload) {
    resetProgress(state);
    if (!payload || typeof payload !== "object" || payload.version !== SAVE_VERSION) return;
    const upgradeDefs = state.upgradeDefs ?? [];
    if (payload.upgrades && typeof payload.upgrades === "object")
        Object.keys(payload.upgrades).forEach((id) => {
            if (!state.player.upgrades[id]) return;
            const upgDef = upgradeDefs.find((u) => u.id === id);
            const maxLevel = upgDef ? upgDef.maxLevel : Infinity;
            const baseLevel = asNonNegativeInt(payload.upgrades[id]?.baseLevel, 0);
            state.player.upgrades[id].baseLevel = Math.min(baseLevel, maxLevel);
        });
    state.highestLevelReached = asNonNegativeInt(payload.highestLevelReached, 0);
    state.claimedPerkMilestones = Array.isArray(payload.claimedPerkMilestones) ? payload.claimedPerkMilestones.map((m) => asNonNegativeInt(m, 0)) : [];
    state.discoveredAbilities = new Set(Array.isArray(payload.discoveredAbilities) ? payload.discoveredAbilities.filter((id) => typeof id === "string") : []);
}
function ensureProgressStore() {
    if (!saveStateRef) return null;
    if (!progressStore)
        progressStore = createDebouncedStorage({
            scheduler: saveStateRef.scheduler,
            key: SAVE_KEY,
            debounceMs: SAVE_DEBOUNCE_MS,
            autosaveMs: SAVE_INTERVAL_MS,
            serialize: () => serializeProgress(saveStateRef),
        });
    return progressStore;
}
export function initializeSaveSystem(state) {
    saveStateRef = state;
    const store = ensureProgressStore();
    store?.init();
}
export function loadProgress(state) {
    saveStateRef = state;
    const store = ensureProgressStore();
    const payload = store?.read() ?? null;
    if (!payload) {
        resetProgress(state);
        return;
    }
    applyProgress(state, payload);
}
export function markProgressDirty(state) {
    saveStateRef = state;
    ensureProgressStore()?.markDirty();
}
export function saveProgress(state) {
    saveStateRef = state;
    ensureProgressStore()?.saveNow();
}
export function hardResetProgress(state, resetGameCallback) {
    saveStateRef = state;
    const store = ensureProgressStore();
    store?.shutdown();
    store?.remove();
    clearPersistentTriggers();
    resetProgress(state);
    resetGameCallback();
    store?.init();
}
export function registerProgressListeners(eventBus) {
    eventBus.on(Events.PROGRESS_DIRTY, ({ state }) => markProgressDirty(state));
    eventBus.on(Events.PROGRESS_SAVE, ({ state }) => saveProgress(state));
}

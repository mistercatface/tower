import { Events, requestProgressDirty, requestUiUpdate } from "./EventSystem.js";
import { ProgressionManager } from "../Progression/ProgressionManager.js";
import { hardResetProgress, registerProgressListeners } from "../Progression/Storage.js";
import { StatsManager } from "../Progression/StatsManager.js";
import { isCombatOrReward } from "../GameState/GamePhase.js";
import { registerPauseListeners } from "./PauseManager.js";

export function registerGameListeners(eventBus, pauseManager) {
    registerProgressListeners(eventBus);
    registerPauseListeners(eventBus, pauseManager);

    eventBus.on(Events.COMBAT_ENEMY_KILLED, ({ enemy, state, upgrades }) => {
        ProgressionManager.processEnemyKillRewards(enemy, state, upgrades);
        requestProgressDirty();
        requestUiUpdate();
    });

    eventBus.on(Events.COMBAT_WAVE_CLEARED, ({ state, upgrades, viewport }) => {
        ProgressionManager.handleWaveCompletion(state, upgrades, viewport);
    });

    eventBus.on(Events.GAME_TOGGLE_PAUSE, () => {
        requestUiUpdate();
    });

    eventBus.on(Events.PROGRESS_PURCHASE_UPGRADE, ({ state, upgrades, upgradeId }) => {
        if (state.isGameOver) return;

        const upg = upgrades.find((u) => u.id === upgradeId);
        if (!upg || upg.category === "abilities" || upg.category === "perk") return;

        const uState = state.upgrades[upgradeId];
        if (!uState) return;

        const cost = uState.ptsCost;
        if (state.score < cost || uState.level >= upg.maxLevel) return;

        state.score -= cost;
        uState.ptsCost = Math.floor(uState.ptsCost * 1.5);
        uState.level++;
        StatsManager.recalculateStats(state, upgrades);
        if (upg.onPurchase) upg.onPurchase(state);
        requestUiUpdate();
    });

    eventBus.on(Events.PROGRESS_TOGGLE_ABILITY, ({ state, upgrades, abilityId }) => {
        const upg = upgrades.find((u) => u.id === abilityId);
        if (!upg?.hasToggle) return;

        state.abilities[abilityId] = !state.abilities[abilityId];
        StatsManager.recalculateStats(state, upgrades);
        requestUiUpdate();
    });

    eventBus.on(Events.UI_SET_UPGRADE_TAB, ({ state, tab }) => {
        state.currentUpgradeTab = tab;
        requestUiUpdate();
    });

    eventBus.on(Events.GAME_SET_SPEED, ({ state, delta }) => {
        if (delta < 0) {
            state.selectedSpeed = Math.max(0.5, state.selectedSpeed + delta);
        } else {
            state.selectedSpeed = Math.min(state.gameSpeed, state.selectedSpeed + delta);
        }
        requestUiUpdate();
    });

    eventBus.on(Events.GAME_SET_ZOOM, ({ state, viewport, sliderValue }) => {
        if (!viewport) return;

        const sliderVal = sliderValue / 100;
        if (isCombatOrReward(state.phase)) {
            viewport.zoomProgress = sliderVal;
            viewport.updateZoomLimits(state);
        } else {
            viewport.setZoom(0.5 + sliderVal * 1.5, state);
        }
        requestUiUpdate();
    });

    eventBus.on(Events.PROGRESS_HARD_RESET, ({ state, resetGame }) => {
        hardResetProgress(state, resetGame);
    });
}

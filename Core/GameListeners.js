import { toggleGunInLoadout, unequipSlot } from "../Combat/equipmentLoadout.js";
import { Events, fireRadioTrigger, requestProgressDirty, requestUiUpdate } from "./EventSystem.js";
import { ProgressionManager } from "../Progression/ProgressionManager.js";
import { hardResetProgress, registerProgressListeners } from "../Progression/Storage.js";
import { StatsManager } from "../Progression/StatsManager.js";
import { beginStartNodeInspection } from "../Combat/inspect/StartNodeInspection.js";
import { isCombatOrReward } from "../GameState/GamePhase.js";
import { registerPauseListeners } from "./PauseManager.js";
import { FloatingText } from "../Render/FloatingText.js";
import { nextUpgradeCost } from "../Config/configHelpers.js";
import { registerRadioListeners } from "../Radio/RadioDialogController.js";
import { registerPersistentTriggers } from "./PersistentTriggerSetup.js";

export function registerAllListeners(eventBus, pauseManager) {
    FloatingText.registerEventListener(eventBus);
    registerRadioListeners(eventBus);
    registerPersistentTriggers(eventBus);
    registerGameListeners(eventBus, pauseManager);
}

export function registerGameListeners(eventBus, pauseManager) {
    registerProgressListeners(eventBus);
    registerPauseListeners(eventBus, pauseManager);

    eventBus.on(Events.COMBAT_ENEMY_KILLED, ({ enemy, state, upgrades }) => {
        ProgressionManager.processEnemyKillRewards(enemy, state, upgrades);
        requestProgressDirty();
        requestUiUpdate();
    });

    eventBus.on(Events.COMBAT_WAVE_CLEARED, ({ state, upgrades, viewport, fsm }) => {
        const node = state.getCurrentMapNode();
        const clearedFirstWave = state.waveManager.sectorWave === 1;

        if (node?.id === 0 && clearedFirstWave) {
            fireRadioTrigger(
                "first_wave_clear",
                () => {
                    beginStartNodeInspection(state, () => {
                        state.skipCombatEnterReset = true;
                        ProgressionManager.handleWaveCompletion(state, upgrades, viewport, { skipSectorComplete: true });
                        fsm?.transition("combat");
                    });
                    fsm?.transition("inspector");
                },
                state,
            );
            return;
        }

        ProgressionManager.handleWaveCompletion(state, upgrades, viewport);
    });

    eventBus.on(Events.GAME_TOGGLE_PAUSE, () => {
        requestUiUpdate();
    });

    eventBus.on(Events.PROGRESS_PURCHASE_UPGRADE, ({ state, upgrades, upgradeId }) => {
        if (state.isGameOver) return;

        const upg = upgrades.find((u) => u.id === upgradeId);
        if (!upg || upg.category === "abilities" || upg.category === "perk") return;

        const uState = state.player.upgrades[upgradeId];
        if (!uState) return;

        const cost = uState.ptsCost;
        if (state.score < cost || uState.level >= upg.maxLevel) return;

        state.score -= cost;
        uState.ptsCost = nextUpgradeCost(uState.ptsCost);
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

    eventBus.on(Events.PROGRESS_EQUIP_WEAPON, ({ state, gunId }) => {
        if (state.isGameOver || !state.player) return;

        const loadout = toggleGunInLoadout(state.player.weaponLoadout, gunId);
        state.player.applyWeaponLoadout(loadout, { state, upgradeDefs: state.upgradeDefs });
        requestUiUpdate();
    });

    eventBus.on(Events.PROGRESS_UNEQUIP_WEAPON_SLOT, ({ state, slotIndex }) => {
        if (state.isGameOver || !state.player) return;

        const loadout = unequipSlot(state.player.weaponLoadout, slotIndex);
        state.player.applyWeaponLoadout(loadout, { state, upgradeDefs: state.upgradeDefs });
        requestUiUpdate();
    });

    eventBus.on(Events.UI_SET_UPGRADE_TAB, ({ state, tab }) => {
        state.currentUpgradeTab = tab;
        requestUiUpdate();
    });

    eventBus.on(Events.UI_SET_STATS_SUB_TAB, ({ state, subTab }) => {
        state.statsSubTab = subTab;
        requestUiUpdate();
    });

    eventBus.on(Events.GAME_SET_SPEED, ({ state, delta }) => {
        if (delta < 0) {
            state.selectedSpeed = Math.max(0.5, state.selectedSpeed + delta);
        } else {
            state.selectedSpeed = Math.min(state.runStats.gameSpeed.value, state.selectedSpeed + delta);
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

    eventBus.on(Events.GAME_ADJUST_ZOOM, ({ state, viewport, delta }) => {
        if (!viewport) return;
        viewport.setZoom(viewport.zoom + delta, state);
        requestUiUpdate();
    });

    eventBus.on(Events.GAME_SET_ZOOM_ABSOLUTE, ({ state, viewport, zoom }) => {
        if (!viewport) return;
        viewport.setZoom(zoom, state);
        requestUiUpdate();
    });

    eventBus.on(Events.MAP_TOGGLE, ({ state, fsm }) => {
        if (!fsm) return;
        if (fsm.currentStateName === "map") {
            const targetState = state.previousStateBeforeMap || "combat";
            if (targetState === "combat" || targetState === "inspector") {
                state.skipCombatEnterReset = true;
            }
            fsm.transition(targetState);
        } else if (fsm.currentStateName === "combat" || fsm.currentStateName === "inspector") {
            state.previousStateBeforeMap = fsm.currentStateName;
            fsm.transition("map");
        }
        requestUiUpdate();
    });

    eventBus.on(Events.MAP_REQUEST_TRAVEL, ({ state, fsm, nodeId }) => {
        state.mapTargetNodeId = nodeId;
        fsm.transition("combat");
    });

    eventBus.on(Events.MAP_CONTINUE_AFTER_SECTOR, ({ state, viewport }) => {
        state.fsm.transition("map");
        viewport.snapTo(state.mapPlayerX - state.player.x - viewport.x, state.mapPlayerY - state.player.y - viewport.y);
        requestUiUpdate();
    });

    eventBus.on(Events.PROGRESS_HARD_RESET, ({ state, resetGame }) => {
        hardResetProgress(state, resetGame);
    });

    eventBus.on(Events.GAME_RESTART, ({ resetGame }) => {
        resetGame();
    });
}

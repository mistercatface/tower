import { toggleGunInLoadout, unequipSlot } from "../../Combat/equipmentLoadout.js";
import { nextUpgradeCost } from "../../Config/Config.js";
import { Events, requestProgressDirty, requestUiUpdate, requestUiHudUpdate } from "../../Core/EventSystem.js";
import { getRunScenePort } from "../../Core/GamePorts.js";
import { registerPersistentTriggers } from "../../Core/PersistentTriggerSetup.js";
import { isSimulation } from "../../GameState/GamePhase.js";
import { ProgressionManager } from "../../Progression/ProgressionManager.js";
import { StatsManager } from "../../Progression/StatsManager.js";
/** @param {import("../../Libraries/Events/EventBus.js").EventBus} eventBus */
export function registerTowerListeners(eventBus) {
    registerPersistentTriggers(eventBus);
    eventBus.on(Events.COMBAT_ENEMY_KILLED, ({ enemy, state, upgrades, fsm }) => {
        ProgressionManager.processEnemyKillRewards(enemy, state, upgrades);
        getRunScenePort().onEnemyKilled?.({ enemy, state, upgrades, fsm });
        requestProgressDirty();
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
    eventBus.on(Events.GAME_SET_ZOOM, ({ state, viewport, sliderValue }) => {
        if (!viewport) return;
        const sliderVal = sliderValue / 100;
        if (isSimulation(state.phase)) {
            viewport.zoomProgress = sliderVal;
            viewport.updateZoomLimits(state);
        } else viewport.setZoom(0.5 + sliderVal * 1.5, state);
        requestUiUpdate();
    });
    eventBus.on(Events.MAP_TOGGLE, ({ state, fsm }) => {
        if (!fsm) return;
        if (fsm.currentStateName === "map") {
            const targetState = state.previousStateBeforeMap || "simulation";
            if (targetState === "simulation" || targetState === "inspector") state.skipSimulationEnterReset = true;
            fsm.transition(targetState);
        } else if (fsm.currentStateName === "simulation" || fsm.currentStateName === "inspector") {
            state.previousStateBeforeMap = fsm.currentStateName;
            fsm.transition("map");
        }
        requestUiUpdate();
        requestUiHudUpdate();
    });
}

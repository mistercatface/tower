import { Pickup } from "../../../Entities/Pickup.js";
import { applyPickupWeaponLoadout } from "../../../Libraries/Combat/pickupWeaponLoadout.js";
import { sandboxFactions } from "../../../Libraries/Combat/sandboxTargeting.js";
import { getTilelabSandboxController } from "./tilelabSandbox.js";
const GROUP_COUNT = 5;
const GROUP_SEPARATION = 140;
const GROUP_SPREAD_X = 50;
const GROUP_SPREAD_Y = 100;
/** @param {import("../state.js").TileLabGameState} state */
export function resolveSandboxBattleCenter(state) {
    const grid = state.obstacleGrid;
    if (grid?.minX !== undefined) return { x: (grid.minX + grid.maxX) / 2, y: (grid.minY + grid.maxY) / 2 };
    if (state.viewport) return { x: state.viewport.x, y: state.viewport.y };
    return { x: 0, y: 0 };
}
/**
 * Spawn Alpha left, Bravo right — armed humanoids ready to fight.
 * @param {import("../state.js").TileLabGameState} state
 * @param {{ replace?: boolean }} [options]
 */
export function spawnSandboxBattleGroups(state, { replace = true } = {}) {
    if (!state.pickups) state.pickups = [];
    if (!replace && state.pickups.length > 0) return;
    if (replace) state.pickups.length = 0;
    const { x: originX, y: originY } = resolveSandboxBattleCenter(state);
    const spawnGroup = (faction, centerX, centerY, gunId, facing) => {
        for (let i = 0; i < GROUP_COUNT; i++) {
            const offsetX = (Math.random() - 0.5) * GROUP_SPREAD_X;
            const offsetY = (i - (GROUP_COUNT - 1) / 2) * (GROUP_SPREAD_Y / (GROUP_COUNT - 1 || 1)) + (Math.random() - 0.5) * 12;
            const prop = new Pickup(centerX + offsetX, centerY + offsetY, "humanoid", facing);
            prop.faction = faction;
            applyPickupWeaponLoadout(prop, [gunId]);
            state.pickups.push(prop);
        }
    };
    spawnGroup(sandboxFactions.alpha, originX - GROUP_SEPARATION, originY, "servicePistol", 0);
    spawnGroup(sandboxFactions.bravo, originX + GROUP_SEPARATION, originY, "servicePistol", Math.PI);
    getTilelabSandboxController()?.sync?.();
}

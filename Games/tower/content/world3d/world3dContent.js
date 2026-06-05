import { drawJackoFuelBarrelCombat } from "./recipes/jacko/Combat.js";
import { drawCrateCombat, drawCrateShardCombat } from "./recipes/crate/Combat.js";

export function drawBarrel(ctx, prop, px, py) {
    drawJackoFuelBarrelCombat(ctx, prop, px, py, { onFire: false });
}

export function drawFireBarrel(ctx, prop, px, py) {
    drawJackoFuelBarrelCombat(ctx, prop, px, py, { onFire: true });
}

export function drawCrate(ctx, prop, px, py) {
    drawCrateCombat(ctx, prop, px, py);
}

export function drawCrateShard(ctx, prop, px, py) {
    drawCrateShardCombat(ctx, prop, px, py);
}

/** Game prop draw registry — injected into WorldSceneRenderer by the game bootstrap. */
export const world3dPropRecipes = {
    barrel: drawBarrel,
    fire_barrel: drawFireBarrel,
    crate: drawCrate,
    crate_shard: drawCrateShard,
};

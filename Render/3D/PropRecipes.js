import { drawJackoFuelBarrelCombat } from "./props/jacko/Combat.js";
import { drawCrateCombat, drawCrateShardCombat } from "./props/crate/Combat.js";

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

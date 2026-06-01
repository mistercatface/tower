import { drawJackoFuelBarrelCombat } from "./props/jacko/Combat.js";
import { drawCrateCombat, drawCrateShardCombat } from "./props/crate/Combat.js";

export function drawBarrel(ctx, pc) {
    drawJackoFuelBarrelCombat(ctx, pc, { onFire: false });
}

export function drawFireBarrel(ctx, pc) {
    drawJackoFuelBarrelCombat(ctx, pc, { onFire: true });
}

export function drawCrate(ctx, pc) {
    drawCrateCombat(ctx, pc);
}

export function drawCrateShard(ctx, pc) {
    drawCrateShardCombat(ctx, pc);
}

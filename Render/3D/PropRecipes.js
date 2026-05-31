import { drawJackoFuelBarrelCombat } from "./props/jacko/Combat.js";
import { drawCrateCombat } from "./props/crate/Combat.js";

export function drawBarrel(ctx, pc) {
    drawJackoFuelBarrelCombat(ctx, pc, { onFire: false });
}

export function drawFireBarrel(ctx, pc) {
    drawJackoFuelBarrelCombat(ctx, pc, { onFire: true });
}

export function drawCrate(ctx, pc) {
    drawCrateCombat(ctx, pc);
}

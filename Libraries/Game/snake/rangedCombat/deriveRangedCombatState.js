import { rangedCombatActionIsBusy, rangedCombatActionOnCooldown } from "./rangedCombatActionState.js";
import { resolveRangedWeapon } from "./resolveRangedWeapon.js";
import { hasLineOfSight } from "../gunAgent/gunAgentShooting.js";
export function deriveRangedCombatState(ctx, input, profile) {
    const weapon = resolveRangedWeapon({ equippedWeapon: input.equippedWeapon }, profile);
    if (!weapon) return null;
    const maxRange = weapon.maxRange ?? profile.attackRange ?? 128;
    const fleeRange = profile.attackRange ?? weapon.fleeRange ?? 48;
    const action = input.actionState ?? null;
    const seeker = input.agent;
    const state = input.state;
    const visibleEnemy = ctx.visible.enemy;
    const knownEnemy = ctx.known.enemy;
    const enemy = visibleEnemy ?? knownEnemy;
    let distWorld = null;
    if (enemy && seeker) {
        const dx = enemy.x - seeker.x;
        const dy = enemy.y - seeker.y;
        distWorld = Math.hypot(dx, dy);
    }
    const reachCells = ctx.reachSteps?.enemy;
    const los = enemy && seeker && state ? hasLineOfSight(state, seeker, enemy) : false;
    const inWeaponRange = distWorld != null && distWorld <= maxRange;
    const tooClose = distWorld != null && distWorld <= fleeRange;
    const phase = action?.phase ?? "idle";
    const onCooldown = action ? rangedCombatActionOnCooldown(action) : false;
    const busy = action ? rangedCombatActionIsBusy(action) : false;
    const canShoot = !!visibleEnemy && los && inWeaponRange && !tooClose && !onCooldown && phase !== "charging";
    return { enemy, visibleEnemy, distWorld, reachCells, hasLineOfSight: los, inWeaponRange, tooClose, phase, onCooldown, busy, canShoot, weapon };
}

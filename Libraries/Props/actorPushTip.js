import { wakePushableBody } from "../Motion/pushableSleep.js";
import { dotXY, lengthXY } from "../Math/Vec2.js";
import { standTipFacingFromPush } from "./standTipMotion.js";
import { measureTipFallWallBlock } from "./tipWallSupport.js";
import { wallContextFromState } from "../Spatial/query/wallContext.js";
/**
 * Tip upright props from actor shove — works when the prop is pinned (e.g. against a wall)
 * and linear barrel velocity stays near zero.
 *
 * @param {object} actor
 * @param {object} prop
 * @param {{ nx: number, ny: number }} collisionInfo
 * @param {object | null} [state]
 */
export function applyActorPushTipImpulse(actor, prop, collisionInfo, state = null) {
    if (!prop.strategy?.standTip || prop.isFallen) return;
    const avx = actor.vx ?? 0;
    const avy = actor.vy ?? 0;
    const speed = lengthXY(avx, avy);
    if (speed < 2.5) return;
    const nx = collisionInfo.nx;
    const ny = collisionInfo.ny;
    prop.facing = standTipFacingFromPush(Math.atan2(ny, nx));
    const wallBlock = measureTipFallWallBlock(prop, state ? wallContextFromState(state) : null);
    if (wallBlock >= 0.85) return;
    const approach = Math.max(0, dotXY(avx, avy, nx, ny));
    const gain = prop.strategy.actorTipGain ?? 0.2;
    const mobility = 1 - wallBlock * 0.95;
    const boost = (approach * gain + speed * 0.055) * mobility;
    prop.rollOmega = (prop.rollOmega ?? 0) + boost / Math.max(prop.mass ?? 1, 0.35);
    wakePushableBody(prop);
}

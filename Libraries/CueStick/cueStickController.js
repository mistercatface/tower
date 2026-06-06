import { CUE_STICK_DEFAULTS } from "./cueStickDefaults.js";
import { applyCueStrikeCollision } from "./cueStrikeCollision.js";
import { computeCueStickPose, cueStickPoseToProp } from "./cueStickPose.js";
/** @typedef {'hidden' | 'aim' | 'strike'} CueStickPhase */
/**
 * @param {object} host — game state bag (e.g. `state.pool`)
 * @param {Partial<typeof CUE_STICK_DEFAULTS>} [overrides]
 */
export function ensureCueStick(host, overrides = {}) {
    if (!host.cueStick) host.cueStick = { phase: "hidden", pullBack: 0, dims: { ...CUE_STICK_DEFAULTS, ...overrides } };
    return host.cueStick;
}
/**
 * @param {object} host
 * @param {object} cueBall
 * @param {{ nx: number, ny: number, drag: number }} preview
 */
export function syncCueStickFromAim(host, cueBall, preview) {
    const stick = ensureCueStick(host);
    const dims = stick.dims;
    const pullBack = preview.pullBack ?? 0;
    stick.phase = "aim";
    stick.pullBack = pullBack;
    stick.pose = computeCueStickPose({
        ballX: cueBall.x,
        ballY: cueBall.y,
        ballRadius: cueBall.radius,
        shotNx: preview.nx,
        shotNy: preview.ny,
        pullBack,
        hx: dims.hx,
        hy: dims.hy,
        height: dims.height,
        rollAngle: dims.rollAngle,
    });
}
/**
 * @param {object} host
 * @param {object} cueBall
 * @param {{ nx: number, ny: number, power: number, pullBack: number }} strike
 */
export function beginCueStickStrike(host, cueBall, strike) {
    const stick = ensureCueStick(host);
    stick.phase = "strike";
    stick.pullBack = strike.pullBack;
    stick.strike = { nx: strike.nx, ny: strike.ny, power: strike.power, maxPower: strike.maxPower };
    stick.pose = computeCueStickPose({
        ballX: cueBall.x,
        ballY: cueBall.y,
        ballRadius: cueBall.radius,
        shotNx: strike.nx,
        shotNy: strike.ny,
        pullBack: strike.pullBack,
        hx: stick.dims.hx,
        hy: stick.dims.hy,
        height: stick.dims.height,
        rollAngle: stick.dims.rollAngle,
    });
    return true;
}
/**
 * @param {object} host
 * @param {object} cueBall
 * @param {number} dt
 * @param {(strike: { nx: number, ny: number, power: number }) => void} onContact
 * @returns {boolean} true while strike animation is running
 */
export function advanceCueStickStrike(host, cueBall, dt, onContact) {
    const stick = host.cueStick;
    if (!stick || stick.phase !== "strike" || !stick.strike) return false;
    const dims = stick.dims;
    const maxPower = stick.strike.maxPower ?? dims.strikeSpeed;
    const speedRatio = Math.max(0.12, stick.strike.power / maxPower);
    stick.pullBack = Math.max(0, stick.pullBack - dims.strikeSpeed * speedRatio * dt);
    stick.pose = computeCueStickPose({
        ballX: cueBall.x,
        ballY: cueBall.y,
        ballRadius: cueBall.radius,
        shotNx: stick.strike.nx,
        shotNy: stick.strike.ny,
        pullBack: stick.pullBack,
        hx: dims.hx,
        hy: dims.hy,
        height: dims.height,
        rollAngle: dims.rollAngle,
    });
    if (stick.pullBack > 0) return true;
    const strike = stick.strike;
    stick.strike = null;
    stick.phase = "hidden";
    onContact(strike);
    return false;
}
/** @param {object} host */
export function hideCueStick(host) {
    if (host.cueStick) host.cueStick.phase = "hidden";
}
/**
 * @param {object} host
 * @returns {object | null}
 */
export function getCueStickDrawProp(host) {
    const stick = host.cueStick;
    if (!stick || stick.phase === "hidden" || !stick.pose) return null;
    return cueStickPoseToProp(stick.pose);
}
/**
 * Apply impulse to the cue ball when the stick tip reaches contact.
 *
 * @param {object} cueBall
 * @param {{ nx: number, ny: number, power: number }} strike
 */
export function applyCueStickImpulse(cueBall, strike) {
    applyCueStrikeCollision(cueBall, strike);
}

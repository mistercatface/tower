import { computeCueMeshTipOffset, rotateLocalOffset } from "./cueStickMesh.js";

/** @typedef {object} CueStickPose
 * @property {number} x — prop anchor (stick mesh origin)
 * @property {number} y
 * @property {number} facing — world yaw; mesh +hx end-cap is the tip toward the ball
 * @property {number} rollAngle
 * @property {number} hx — half-length along shaft
 * @property {number} hy — shaft radius
 * @property {number} height — long-axis tumble pivot (table height)
 * @property {number} pullBack — extra tip standoff from ball surface along shot axis
 */

/**
 * Tip sits on the ball surface when pullBack = 0; pullBack only opens the gap when charging.
 *
 * @param {{
 *   ballX: number,
 *   ballY: number,
 *   ballRadius: number,
 *   shotNx: number,
 *   shotNy: number,
 *   pullBack?: number,
 *   hx?: number,
 *   hy?: number,
 *   height?: number,
 *   rollAngle?: number,
 * }} spec
 * @returns {CueStickPose}
 */
export function computeCueStickPose({
    ballX,
    ballY,
    ballRadius,
    shotNx,
    shotNy,
    pullBack = 0,
    hx = 70,
    hy = 1.15,
    height = 2.3,
    rollAngle = Math.PI / 2,
}) {
    const facing = Math.atan2(shotNy, shotNx);
    const contactDist = Math.max(ballRadius - hy * 0.85, ballRadius * 0.92);
    const tipWorldX = ballX - shotNx * (contactDist + Math.max(0, pullBack));
    const tipWorldY = ballY - shotNy * (contactDist + Math.max(0, pullBack));
    const tipLocal = computeCueMeshTipOffset(hx, hy, height, rollAngle);
    const tipWorldOffset = rotateLocalOffset(tipLocal.lx, tipLocal.ly, facing);
    return {
        x: tipWorldX - tipWorldOffset.x,
        y: tipWorldY - tipWorldOffset.y,
        facing,
        rollAngle,
        hx,
        hy,
        height,
        pullBack,
    };
}

/**
 * Drawable prop payload for {@link import("../Render/Props3D/PropRenderer.js").PropRenderer}.
 *
 * @param {CueStickPose} pose
 * @returns {object}
 */
export function cueStickPoseToProp(pose) {
    return {
        x: pose.x,
        y: pose.y,
        facing: pose.facing,
        rollAngle: pose.rollAngle,
        render3DKey: "cue_stick",
        cueStick: { hx: pose.hx, hy: pose.hy, height: pose.height, pullBack: pose.pullBack },
        strategy: { render3DKey: "cue_stick", renderMode: "3d", rollAxis: "long" },
        getRender3DKey() {
            return "cue_stick";
        },
    };
}

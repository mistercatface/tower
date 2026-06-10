/** Standard 8-ball triangle: 1 on the apex, 8 in the center, 6 and 9 on the back corners. */
const RACK_BALL_NUMBERS = [[1], [10, 2], [11, 8, 3], [12, 4, 13, 5], [6, 14, 7, 15, 9]];
/** Head-spot to foot-spot spacing in ball radii (half a regulation playfield). */
export const POOL_CUE_TO_RACK_APEX = 20;
/** @param {number} apexX @param {number} apexY @param {number} [ballRadius] */
export function buildRackTriangle(apexX, apexY, ballRadius = 8) {
    const rowStep = Math.sqrt(3) * ballRadius;
    const colStep = ballRadius * 2;
    const rack = [];
    for (let row = 0; row < RACK_BALL_NUMBERS.length; row++) {
        const rowBalls = RACK_BALL_NUMBERS[row];
        for (let col = 0; col < rowBalls.length; col++) rack.push({ number: rowBalls[col], x: apexX + (col - row * 0.5) * colStep, y: apexY - row * rowStep });
    }
    return rack;
}
/**
 * Cue ball at `cueX/cueY`; rack apex (ball 1) sits toward -Y at regulation spacing.
 *
 * @param {number} cueX
 * @param {number} cueY
 * @param {number} [ballRadius]
 * @returns {{ cue: { x: number, y: number }, rack: { x: number, y: number, number: number }[] }}
 */
export function buildPoolRackLayout(cueX, cueY, ballRadius = 8) {
    return { cue: { x: cueX, y: cueY }, rack: buildRackTriangle(cueX, cueY - ballRadius * POOL_CUE_TO_RACK_APEX, ballRadius) };
}

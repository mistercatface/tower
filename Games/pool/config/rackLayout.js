import { POOL_BALL_RADIUS } from "./tableLayout.js";

export const POOL_OBJECT_BALL_COUNT = 15;

/**
 * Standard 8-ball triangle: 1 on the foot-spot apex, 8 in the center,
 * solid (6) and stripe (9) on the back corners.
 */
export const RACK_BALL_NUMBERS = [
    [1],
    [10, 2],
    [11, 8, 3],
    [12, 4, 13, 5],
    [6, 14, 7, 15, 9],
];

/**
 * Equilateral-close-packed rack: apex (row 0) on the foot spot pointing toward the head;
 * each deeper row sits behind it toward the foot rail (+X).
 *
 * @param {{ x: number, y: number }} footSpot
 * @param {number} [ballRadius]
 * @returns {{ x: number, y: number, number: number }[]}
 */
export function buildRackPositions(footSpot, ballRadius = POOL_BALL_RADIUS) {
    const rowStep = Math.sqrt(3) * ballRadius;
    const colStep = ballRadius * 2;
    const positions = [];

    for (let row = 0; row < RACK_BALL_NUMBERS.length; row++) {
        const rowBalls = RACK_BALL_NUMBERS[row];
        for (let col = 0; col < rowBalls.length; col++) {
            positions.push({
                number: rowBalls[col],
                x: footSpot.x + row * rowStep,
                y: footSpot.y + (col - row * 0.5) * colStep,
            });
        }
    }

    return positions;
}

/** @typedef {'corner-tl' | 'corner-tr' | 'corner-bl' | 'corner-br' | 'side-left' | 'side-right'} PoolPocketKind */
/** @param {PoolPocketKind} kind */
export function getPoolPocketArcAngles(kind) {
    switch (kind) {
        case "corner-tl":
            return { start: 0, end: Math.PI / 2 };
        case "corner-tr":
            return { start: Math.PI / 2, end: Math.PI };
        case "corner-bl":
            return { start: (3 * Math.PI) / 2, end: Math.PI * 2 };
        case "corner-br":
            return { start: Math.PI, end: (3 * Math.PI) / 2 };
        case "side-left":
            return { start: -Math.PI / 2, end: Math.PI / 2 };
        case "side-right":
            return { start: Math.PI / 2, end: (3 * Math.PI) / 2 };
        default:
            return { start: 0, end: Math.PI * 2 };
    }
}
export {};

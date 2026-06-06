/** @typedef {import("../../../Libraries/Props/spawnStartProps.js").StartPropSpec} StartPropSpec */

/**
 * @param {object | null | undefined} layout
 * @returns {StartPropSpec[]}
 */
export function getYardballStartProps(layout) {
    if (!layout) return [];

    return [
        {
            type: "beach_ball",
            x: layout.spawnX,
            y: layout.spawnY + 18,
            facing: 0,
        },
    ];
}

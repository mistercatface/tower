/** @typedef {import("../../../Libraries/Props/spawnStartProps.js").StartPropSpec} StartPropSpec */
/**
 * Fixed props placed once at run start — offsets from player spawn.
 * @param {{ spawnX: number, spawnY: number } | null | undefined} layout
 * @returns {StartPropSpec[]}
 */
export function getTowerStartProps(layout) {
    if (!layout) return [];
    return [
        { type: "beach_ball", x: layout.spawnX + 28, y: layout.spawnY - 4, facing: 0 },
        { type: "barrel", x: layout.spawnX + 44, y: layout.spawnY - 4 },
        { type: "log", x: layout.spawnX + 52, y: layout.spawnY - 2, facing: Math.PI / 2 },
    ];
}

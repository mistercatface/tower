export const CORRIDOR_TYPE_EMPTY = "empty";
export const CORRIDOR_TYPE_CONVEYOR_ONE_WAY = "conveyorOneWay";

/** @typedef {typeof CORRIDOR_TYPE_EMPTY | typeof CORRIDOR_TYPE_CONVEYOR_ONE_WAY} CorridorType */

export const CORRIDOR_TYPE_OPTIONS = [
    { value: CORRIDOR_TYPE_EMPTY, label: "Empty" },
    { value: CORRIDOR_TYPE_CONVEYOR_ONE_WAY, label: "Conveyor (one way)" },
];

/** @param {string | undefined} corridorType */
export function isConveyorCorridorType(corridorType) {
    return corridorType === CORRIDOR_TYPE_CONVEYOR_ONE_WAY;
}

/** @param {string | undefined} corridorType @returns {CorridorType} */
export function normalizeCorridorType(corridorType) {
    if (corridorType === CORRIDOR_TYPE_CONVEYOR_ONE_WAY) return CORRIDOR_TYPE_CONVEYOR_ONE_WAY;
    return CORRIDOR_TYPE_EMPTY;
}

/** @param {CorridorType} corridorType */
export function formatCorridorTypeLabel(corridorType) {
    const option = CORRIDOR_TYPE_OPTIONS.find((entry) => entry.value === corridorType);
    return option?.label ?? "Empty";
}

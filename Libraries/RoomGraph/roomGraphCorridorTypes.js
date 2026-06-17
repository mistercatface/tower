export const CORRIDOR_TYPE_EMPTY = "empty";
export const CORRIDOR_TYPE_OPEN = "open";
export const CORRIDOR_TYPE_CONVEYOR_ONE_WAY = "conveyorOneWay";
export const CORRIDOR_TYPE_LOCKED_ROOM = "lockedRoom";
/** @typedef {typeof CORRIDOR_TYPE_EMPTY | typeof CORRIDOR_TYPE_OPEN | typeof CORRIDOR_TYPE_CONVEYOR_ONE_WAY | typeof CORRIDOR_TYPE_LOCKED_ROOM} CorridorType */
export const CORRIDOR_TYPE_OPTIONS = [
    { value: CORRIDOR_TYPE_EMPTY, label: "Empty corridor" },
    { value: CORRIDOR_TYPE_OPEN, label: "Open passage" },
    { value: CORRIDOR_TYPE_CONVEYOR_ONE_WAY, label: "Belt corridor" },
    { value: CORRIDOR_TYPE_LOCKED_ROOM, label: "Locked room" },
];
export const CORRIDOR_AUTHORING_TYPE_OPTIONS = [
    { value: CORRIDOR_TYPE_CONVEYOR_ONE_WAY, label: "Belt" },
    { value: CORRIDOR_TYPE_EMPTY, label: "Empty" },
    { value: CORRIDOR_TYPE_LOCKED_ROOM, label: "Locked room" },
];
/** @param {string | undefined} corridorType */
export function isConveyorCorridorType(corridorType) {
    return corridorType === CORRIDOR_TYPE_CONVEYOR_ONE_WAY;
}
/** @param {string | undefined} corridorType */
export function isOpenCorridorType(corridorType) {
    return corridorType === CORRIDOR_TYPE_OPEN;
}
/** @param {string | undefined} corridorType */
export function isLockedRoomCorridorType(corridorType) {
    return corridorType === CORRIDOR_TYPE_LOCKED_ROOM;
}
/** @param {string | undefined} corridorType @returns {CorridorType} */
export function normalizeCorridorType(corridorType) {
    if (corridorType === CORRIDOR_TYPE_CONVEYOR_ONE_WAY) return CORRIDOR_TYPE_CONVEYOR_ONE_WAY;
    if (corridorType === CORRIDOR_TYPE_OPEN) return CORRIDOR_TYPE_OPEN;
    if (corridorType === CORRIDOR_TYPE_LOCKED_ROOM) return CORRIDOR_TYPE_LOCKED_ROOM;
    return CORRIDOR_TYPE_EMPTY;
}
/** @param {CorridorType} corridorType */
export function formatCorridorTypeLabel(corridorType) {
    const option = CORRIDOR_TYPE_OPTIONS.find((entry) => entry.value === corridorType);
    return option?.label ?? "Empty";
}

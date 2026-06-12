/** @typedef {{ listLabel: string, draw: string, circleRadius?: number, halfWidth?: number, halfHeight?: number, triggers: PadTriggerDef[] }} PadPresetDef */
/** @typedef {{ when?: PadWhen, effect: string, forceX?: number, forceY?: number }} PadTriggerDef */
/** @typedef {"enter" | "exit" | "occupied" | "empty"} PadWhen */
/** @type {Record<string, PadPresetDef>} */
export const PAD_PRESETS = {
    pull: { listLabel: "Gravity pad", draw: "pull", halfWidth: 40, halfHeight: 80, triggers: [{ when: "occupied", effect: "pull", forceX: 0, forceY: 1000 }] },
    button: { listLabel: "Button pad", draw: "button", circleRadius: 8, triggers: [{ effect: "button" }] },
};

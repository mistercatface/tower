import { DEFAULT_PIT_DEPTH, DEFAULT_PIT_RADIUS } from "../Spatial/zones/pit.js";
/** @typedef {{ listLabel: string, draw: string, circleRadius?: number, halfWidth?: number, halfHeight?: number, sinkDepth?: number, linkedWalls?: boolean, triggers: PadTriggerDef[] }} PadPresetDef */
/** @typedef {{ when: PadWhen, effect: string, up?: boolean, forceX?: number, forceY?: number, targetPickupId?: number }} PadTriggerDef */
/** @typedef {"enter" | "exit" | "occupied" | "empty" | "pointerDown"} PadWhen */
/** @type {Record<string, PadPresetDef>} */
export const PAD_PRESETS = {
    sink: {
        listLabel: "Void pit",
        draw: "pit",
        circleRadius: DEFAULT_PIT_RADIUS,
        sinkDepth: DEFAULT_PIT_DEPTH,
        triggers: [
            { when: "enter", effect: "sink" },
            { when: "exit", effect: "unsink" },
        ],
    },
    gate: {
        listLabel: "Pressure pad",
        draw: "plate",
        circleRadius: 8,
        linkedWalls: true,
        triggers: [
            { when: "occupied", effect: "gate", up: false },
            { when: "empty", effect: "gate", up: true },
        ],
    },
    pull: { listLabel: "Gravity pad", draw: "pull", halfWidth: 40, halfHeight: 80, triggers: [{ when: "occupied", effect: "pull", forceX: 0, forceY: 1000 }] },
    button: { listLabel: "Button pad", draw: "button", circleRadius: 8, triggers: [{ when: "pointerDown", effect: "flipper" }] },
};

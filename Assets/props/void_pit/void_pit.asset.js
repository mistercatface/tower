import { DEFAULT_PIT_DEPTH, DEFAULT_PIT_RADIUS, DEFAULT_VOID_CAPTURE_TOLERANCE } from "../../../Libraries/Spatial/zones/pit.js";
import { createVoidPitDraw } from "../../../Libraries/Render/voidPitDraw.js";
export default {
    id: "void_pit",
    draw: createVoidPitDraw(DEFAULT_PIT_DEPTH),
    physics: {
        renderMode: "floor",
        spatialRole: "trigger",
        isPushable: false,
        gravityImmune: true,
        collisionShape: "circle",
        radius: DEFAULT_PIT_RADIUS,
        sinkDepth: DEFAULT_PIT_DEPTH,
        captureTolerance: DEFAULT_VOID_CAPTURE_TOLERANCE,
        floorTriggers: [
            { when: "enter", effect: "sink" },
            { when: "exit", effect: "unsink" },
        ],
    },
};

import { gridSettings } from "../../../Config/balance/grid.js";
import { DEFAULT_CONVEYOR_FORCE } from "../../../Libraries/Sandbox/conveyorDefaults.js";
import { createConveyorDraw, getConveyorSpriteCacheKey } from "../../../Libraries/Render/conveyorDraw.js";
const cellHalf = gridSettings.cellSize * 0.5;
export default {
    id: "conveyor_elbow_right",
    draw: createConveyorDraw({ turnDirection: "right" }),
    sandbox: { spawnLabel: "Conveyor Elbow R" },
    physics: {
        renderMode: "floor",
        spatialRole: "trigger",
        isPushable: false,
        gravityImmune: true,
        collisionShape: "box",
        halfExtents: { x: cellHalf, y: cellHalf },
        gridAnchored: true,
        cardinalFacing: true,
        quantizeSteps: { facing: 4 },
        getCustomSpriteCacheKey: getConveyorSpriteCacheKey,
        floorTriggers: [{ when: "occupied", effect: "pullAlongFacing", force: DEFAULT_CONVEYOR_FORCE }],
    },
};

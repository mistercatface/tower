import { gridSettings } from "../../../Config/balance/grid.js";
import { DEFAULT_CONVEYOR_FORCE } from "../../../Libraries/Sandbox/conveyorDefaults.js";
import { CELL_EDGE_ELBOW_LEFT } from "../../../Libraries/Spatial/grid/gridCellEdges.js";
import { createConveyorDraw, getConveyorSpriteCacheKey } from "../../../Libraries/Render/conveyorDraw.js";
const cellHalf = gridSettings.cellSize * 0.5;
export default {
    id: "conveyor_elbow_left",
    draw: createConveyorDraw({ turnDirection: "left" }),
    sandbox: { spawnLabel: "Conveyor Elbow L" },
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
        cellEdgeBarrier: CELL_EDGE_ELBOW_LEFT,
        getCustomSpriteCacheKey: getConveyorSpriteCacheKey,
        floorTriggers: [{ when: "occupied", effect: "pullAlongFacing", force: DEFAULT_CONVEYOR_FORCE }],
    },
};

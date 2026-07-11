import { PROP_RENDER_MODE_NONE } from "../../../Core/engineEnums.js";
/** Spawn-only catalog entry — belts are stamped on `obstacleGrid.floorStore`, not WorldProps. */
export default { id: "floor_belt", sandbox: { spawnLabel: "Conveyor", gridFloorBelt: true }, physics: { renderMode: PROP_RENDER_MODE_NONE } };

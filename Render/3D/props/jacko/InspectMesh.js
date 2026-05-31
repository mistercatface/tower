import { JACKO_CAN } from "../../../../Config/props/JackoCan.js";
import { buildSodaCanMesh } from "../../geometry/CylinderMesh.js";

export function buildJackoInspectMesh() {
    const { halfHeight, bodyRadius } = JACKO_CAN;
    return buildSodaCanMesh({ halfHeight, bodyRadius, onFire: false, sides: false });
}

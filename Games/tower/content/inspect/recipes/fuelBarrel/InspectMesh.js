import { FUEL_BARREL } from "../../../../../../Libraries/Props/definitions/fuelBarrel.js";
import { buildSodaCanMesh } from "../../../../../../Libraries/Inspect/geometry/CylinderMesh.js";

export function buildFuelBarrelInspectMesh() {
    const { halfHeight, bodyRadius } = FUEL_BARREL;
    return buildSodaCanMesh({ halfHeight, bodyRadius, onFire: false, sides: false });
}

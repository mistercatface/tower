import { getPropAsset } from "../../../../../../Libraries/Content/PropCatalog.js";
import { buildSodaCanMesh } from "../../../../../../Libraries/Inspect/geometry/CylinderMesh.js";

export function buildFuelBarrelInspectMesh() {
    const { halfHeight, bodyRadius } = getPropAsset("barrel")?.visuals ?? {};
    return buildSodaCanMesh({ halfHeight, bodyRadius, onFire: false, sides: false });
}

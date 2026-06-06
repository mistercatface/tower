import { getPropAsset } from "../../../../../../Libraries/Content/PropCatalog.js";
import { buildBoxMesh } from "../../../../../../Libraries/Inspect/geometry/BoxMesh.js";
export function buildCrateInspectMesh() {
    const { halfExtents, colors } = getPropAsset("crate")?.visuals ?? {};
    return buildBoxMesh({
        halfExtents,
        materials: {
            side: { type: "solid", color: colors.side, stroke: null, lineWidth: 0 },
            top: { type: "solid", color: colors.top, stroke: null, lineWidth: 0 },
            bottom: { type: "solid", color: colors.bottom, stroke: null, lineWidth: 0 },
        },
    });
}

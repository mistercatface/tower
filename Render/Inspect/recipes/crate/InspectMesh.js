import { WOOD_CRATE } from "../../../../Config/props/Crate.js";
import { buildBoxMesh } from "../../../3D/geometry/BoxMesh.js";

export function buildCrateInspectMesh() {
    const { halfExtents, colors } = WOOD_CRATE;

    return buildBoxMesh({
        halfExtents,
        materials: {
            side: { type: "solid", color: colors.side, stroke: null, lineWidth: 0 },
            top: { type: "solid", color: colors.top, stroke: null, lineWidth: 0 },
            bottom: { type: "solid", color: colors.bottom, stroke: null, lineWidth: 0 },
        },
    });
}

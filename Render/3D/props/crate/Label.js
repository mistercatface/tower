import { CRATE_LABEL_VARIANTS } from "../../../../Config/props/Crate.js";

/** @typedef {import("../../BoxInspectLabel.js").BoxSideFace} BoxSideFace */

/** @param {import("../../../../Entities/Pickup.js").Pickup | null | undefined} pickup */
/** @param {BoxSideFace} face */
export function getCrateFaceLabelSrc(pickup, face) {
    const idx = pickup?.faceLabelVariants?.[face] ?? 0;
    return CRATE_LABEL_VARIANTS[idx % CRATE_LABEL_VARIANTS.length];
}

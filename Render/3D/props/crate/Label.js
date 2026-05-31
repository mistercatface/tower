import { CRATE_LABEL_VARIANTS } from "../../../../Config/props/Crate.js";

/** @param {import("../../../../Entities/Pickup.js").Pickup | null | undefined} pickup */
export function getCrateInspectLabelSrc(pickup) {
    const idx = pickup?.labelVariant ?? 0;
    return CRATE_LABEL_VARIANTS[idx % CRATE_LABEL_VARIANTS.length];
}

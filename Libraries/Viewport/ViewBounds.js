import { aabbOverlap, centerHalfExtentsAabbInto, circleIntersectsAabb, createAabb } from "../Math/Aabb2D.js";
export const VIEW_BOUNDS_PROPS_PAD_PX = 20;
/** @typedef {"clip" | "props" | "structure" | "chunks"} ViewBoundsTier */
const VIEW_BOUNDS_TIER_ORDER = ["clip", "props", "structure", "chunks"];
const VIEW_BOUNDS_TIER_PAD = { clip: () => 0, props: () => VIEW_BOUNDS_PROPS_PAD_PX, structure: (viewBounds) => viewBounds.viewQueryPadPx, chunks: (viewBounds) => viewBounds.viewPaddingPx };
export class ViewBounds {
    constructor() {
        this.viewQueryPadPx = 0;
        this.viewPaddingPx = 0;
        this._bounds = {};
        for (let i = 0; i < VIEW_BOUNDS_TIER_ORDER.length; i++) {
            const tier = VIEW_BOUNDS_TIER_ORDER[i];
            this._bounds[tier] = createAabb();
        }
    }
    configurePads(viewQueryPadPx, viewPaddingPx) {
        if (this.viewQueryPadPx === viewQueryPadPx && this.viewPaddingPx === viewPaddingPx) return false;
        this.viewQueryPadPx = viewQueryPadPx;
        this.viewPaddingPx = viewPaddingPx;
        return true;
    }
    recompute(centerX, centerY, halfW, halfH) {
        for (let i = 0; i < VIEW_BOUNDS_TIER_ORDER.length; i++) {
            const tier = VIEW_BOUNDS_TIER_ORDER[i];
            centerHalfExtentsAabbInto(this._bounds[tier], centerX, centerY, halfW, halfH, VIEW_BOUNDS_TIER_PAD[tier](this));
        }
    }
    bounds(tier) {
        return this._bounds[tier];
    }
    circleInBounds(worldX, worldY, radius = 0, tier = "props") {
        return circleIntersectsAabb(worldX, worldY, radius, this.bounds(tier));
    }
    aabbInBounds(aabb, tier = "clip") {
        return aabbOverlap(aabb, this.bounds(tier));
    }
}

import { invalidateStaticGridWallDrawCache } from "../../Libraries/Render/Structure3D/StaticGridWallDraw.js";
import { invalidateStaticGridEdgeRailDrawCache } from "../../Libraries/Render/Structure3D/StaticGridEdgeRailDraw.js";
/** Game-side wall atlas cache invalidation. */
export function invalidateWallAtlasKeyMemos(_state) {
    invalidateStaticGridWallDrawCache();
    invalidateStaticGridEdgeRailDrawCache();
}

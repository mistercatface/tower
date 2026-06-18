import { createMarqueeSelectTool } from "../Editor/marqueeSelectTool.js";
import { queryEntitiesInAabbStrict } from "../../GameState/EntityRegistry.js";
import { getPropAsset } from "../Props/PropCatalog.js";
import { sandboxAssetMatchesTagFilter } from "../Sandbox/sandboxCapabilities.js";
import { aabbFromTwoPointsInto } from "../Math/Aabb2D.js";
import { entityContainedInAabb } from "../Spatial/collision/entityBroadphase.js";
export function createSandboxMarqueeTool(state, session, { getCanvas, aabbScratch, stampPropBehavior, selectPropIds }) {
    return createMarqueeSelectTool({
        getCanvas,
        canBegin: (e) => e.shiftKey,
        buildAabbFromDrag: (startWorld, endWorld) => aabbFromTwoPointsInto(aabbScratch, startWorld.x, startWorld.y, endWorld.x, endWorld.y),
        onClick(world, e) {
            if (!e.shiftKey && !session.isWallPlaceMode() && !session.isMapGenPlaceMode() && session.spawnAt(world.x, world.y)) stampPropBehavior(session.getSelectedProp());
            else session.clearSelection();
        },
        onBoxSelect(bounds) {
            const filter = session.getSelectionTagFilter();
            const props = queryEntitiesInAabbStrict(state.entityRegistry, bounds, {
                kinds: ["worldProp"],
                hitTest: "circle",
                match: (prop) => entityContainedInAabb(prop, bounds) && sandboxAssetMatchesTagFilter(getPropAsset(prop.type), filter),
            });
            selectPropIds(props.map((prop) => prop.id));
        },
    });
}

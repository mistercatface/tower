import { createMarqueeSelectTool } from "../Editor/marqueeSelectTool.js";
import { aabbFromTwoPointsInto } from "../Math/Aabb2D.js";
import { drawSandboxMarquee, findSandboxPropsInWorldRect } from "./drawSandboxSelection.js";
export function createSandboxMarqueeTool(state, session, { getCanvas, aabbScratch, stampPropBehavior }) {
    return createMarqueeSelectTool({
        getCanvas,
        buildAabbFromDrag: (startWorld, endWorld) => aabbFromTwoPointsInto(aabbScratch, startWorld.x, startWorld.y, endWorld.x, endWorld.y),
        onClick(world, e) {
            if (!e.shiftKey && !session.isWallPlaceMode() && !session.isMapGenPlaceMode() && session.spawnAt(world.x, world.y)) stampPropBehavior(session.getSelectedProp());
            else {
                session.clearPropSelection();
                session.clearFloorSelection();
                session.clearRoomGraphSelection();
            }
        },
        onBoxSelect(bounds) {
            const props = findSandboxPropsInWorldRect(state, state.entityRegistry, bounds);
            session.setSelectedPropIds(props.map((prop) => prop.id));
        },
        drawMarquee: (ctx, bounds) => drawSandboxMarquee(ctx, { marqueeRect: bounds }),
    });
}

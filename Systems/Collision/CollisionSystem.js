import { runCollisionPipeline } from "../../Libraries/Spatial/collision/collisionPipeline.js";
/** @type {{ state: object | null, spatialFrame: object | null }} */
const collisionRunCtx = { state: null, spatialFrame: null };
const collisionPipelineHooks = {
    resolveWalls(entity, frame) {
        collisionRunCtx.state.wallResolver.resolve(entity, frame);
    },
};
export class CollisionSystem {
    static run(state, spatialFrame) {
        collisionRunCtx.state = state;
        collisionRunCtx.spatialFrame = spatialFrame;
        runCollisionPipeline(state, spatialFrame, collisionPipelineHooks);
    }
}

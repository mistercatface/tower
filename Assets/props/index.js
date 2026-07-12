import ball from "./ball/ball.asset.js";
import box from "./box/box.asset.js";
import tri_wedge from "./tri_wedge/tri_wedge.asset.js";
import boid_triangle from "./boid_triangle/boid_triangle.asset.js";
import snake from "./snake/snake.asset.js";
import hex_block from "./hex_block/hex_block.asset.js";
import floor_belt from "./floor_belt/floor_belt.asset.js";
import floor_belt_elbow_left from "./floor_belt/floor_belt_elbow_left.asset.js";
import floor_belt_elbow_right from "./floor_belt/floor_belt_elbow_right.asset.js";
import cross_pinwheel from "./cross_pinwheel/cross_pinwheel.asset.js";
import star_block from "./star_block/star_block.asset.js";
import gear_block from "./gear_block/gear_block.asset.js";
import wall_voxel_chunk from "./wall_chunk/wallVoxelChunk.asset.js";
import wall_rail_chunk from "./rail_wall_chunk/railWallChunk.asset.js";
const catalog = { ball, box, tri_wedge, boid_triangle, snake, hex_block, floor_belt, floor_belt_elbow_left, floor_belt_elbow_right, cross_pinwheel, star_block, gear_block, wall_voxel_chunk, wall_rail_chunk };
export default catalog;
let nextRenderKeyId = 1;
export const propCatalogByRenderKeyId = [];
for (const asset of Object.values(catalog)) {
    asset.renderKeyId = nextRenderKeyId++;
    propCatalogByRenderKeyId[asset.renderKeyId] = asset;
}
export const NEXT_RENDER_KEY_ID = nextRenderKeyId;

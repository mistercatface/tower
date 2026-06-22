import ball from "./ball/ball.asset.js";
import flipper_left from "./flipper/flipperLeft.asset.js";
import flipper_right from "./flipper/flipperRight.asset.js";
import crate from "./crate/crate.asset.js";
import custom_box from "./custom_box/custom_box.asset.js";
import glass_pane from "./glass_pane/glass_pane.asset.js";
import tri_wedge from "./tri_wedge/tri_wedge.asset.js";
import flee_ball from "./flee_ball/flee_ball.asset.js";
import hex_block from "./hex_block/hex_block.asset.js";
import pipe_elbow from "./pipe_elbow/pipe_elbow.asset.js";
import button_floor from "./button_floor/button_floor.asset.js";
import floor_belt from "./floor_belt/floor_belt.asset.js";
import floor_belt_elbow_left from "./floor_belt/floor_belt_elbow_left.asset.js";
import floor_belt_elbow_right from "./floor_belt/floor_belt_elbow_right.asset.js";
import floor_belt_rails from "./floor_belt/floor_belt_rails.asset.js";
import floor_belt_elbow_left_rails from "./floor_belt/floor_belt_elbow_left_rails.asset.js";
import floor_belt_elbow_right_rails from "./floor_belt/floor_belt_elbow_right_rails.asset.js";
import floor_power_source from "./floor_power_source/floor_power_source.asset.js";
import room_node from "./room_node/room_node.asset.js";
import puzzle_belt_crate from "./puzzle_belt_crate/puzzle_belt_crate.asset.js";
import corridor from "./corridor/corridor.asset.js";
import goal_orb from "./goal_orb/goal_orb.asset.js";
import snake_head from "./snake_head/snake_head.asset.js";
import snake_striker from "./snake_striker/snake_striker.asset.js";
import snake_shard from "./snake_shard/snake_shard.asset.js";
import poolBalls from "./poolBalls.js";
const catalog = {
    ball,
    flipper_left,
    flipper_right,
    crate,
    custom_box,
    glass_pane,
    tri_wedge,
    flee_ball,
    hex_block,
    pipe_elbow,
    button_floor,
    floor_belt,
    floor_belt_elbow_left,
    floor_belt_elbow_right,
    floor_belt_rails,
    floor_belt_elbow_left_rails,
    floor_belt_elbow_right_rails,
    floor_power_source,
    room_node,
    puzzle_belt_crate,
    corridor,
    goal_orb,
    snake_head,
    snake_striker,
    snake_shard,
    ...poolBalls,
};
export default catalog;

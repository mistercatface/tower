import beach_ball from "./beach_ball/beach_ball.asset.js";
import steel_ball from "./steel_ball/steel_ball.asset.js";
import barrel from "./barrel/barrel.asset.js";
import flipper_left from "./flipper/flipperLeft.asset.js";
import flipper_right from "./flipper/flipperRight.asset.js";
import pinball_post from "./pinball/pinballPost.asset.js";
import pinball_bumper from "./pinball/pinballBumper.asset.js";
import crate from "./crate/crate.asset.js";
import crate_shard from "./crate_shard/crate_shard.asset.js";
import log from "./log/log.asset.js";
import humanoid from "./humanoid/humanoid.asset.js";
import poolBalls from "./poolBalls.js";
/** @type {Record<string, object>} */
const catalog = { beach_ball, steel_ball, barrel, flipper_left, flipper_right, pinball_post, pinball_bumper, crate, crate_shard, log, humanoid, ...poolBalls };
export default catalog;

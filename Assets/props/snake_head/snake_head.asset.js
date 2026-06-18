import ball from "../ball/ball.asset.js";
import { extendPropAlias } from "../shared/propAlias.js";
export default extendPropAlias(ball, { id: "snake_head", sandbox: { spawnLabel: "Snake head", groundNav: false } });

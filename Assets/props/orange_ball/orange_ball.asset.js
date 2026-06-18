import ball from "../ball/ball.asset.js";
import { extendPropAlias } from "../shared/propAlias.js";
export default extendPropAlias(ball, { id: "orange_ball", defaultVisualOverride: { tint: "#FF9800" } });

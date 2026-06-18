import ball from "../ball/ball.asset.js";
import { extendPropAlias } from "../shared/propAlias.js";
export default extendPropAlias(ball, { id: "blue_ball", defaultVisualOverride: { tint: "#42A5F5" } });

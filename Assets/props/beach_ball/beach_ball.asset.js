import ball from "../ball/ball.asset.js";
import { extendPropAlias } from "../shared/propAlias.js";
export default extendPropAlias(ball, {
    id: "beach_ball",
    sandbox: { tags: ["shapes", "nav"], dragLaunch: { minPower: 25, maxPower: 500 } },
    physics: { radius: 7, isKinetic: true, rolls: true, density: 0.003898, friction: 4, wallPhysics: { restitution: 0.35, friction: 0.4 } },
    defaultVisualOverride: { tint: "#F44336" },
});

import ball from "../ball/ball.asset.js";
import { extendPropAlias } from "../shared/propAlias.js";
export default extendPropAlias(ball, {
    id: "steel_ball",
    sandbox: { tags: ["shapes", "nav"], dragLaunch: { minPower: 35, maxPower: 750 } },
    physics: { radius: 7, isKinetic: true, rolls: true, density: 0.015591, friction: 2, wallPhysics: { restitution: 0.55, friction: 0.22 } },
    defaultVisualOverride: { tint: "#78909C" },
});

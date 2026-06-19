import ball from "../ball/ball.asset.js";
import { extendPropAlias } from "../shared/propAlias.js";
export default extendPropAlias(ball, {
    id: "snake_striker",
    sandbox: {
        spawnLabel: "Snake striker",
        spawnable: false,
        behaviors: ["dragLaunchWait"],
        dragLaunch: { minDrag: 8, maxPull: 100, pullScale: 1.2, minPower: 30, maxPower: 560, powerCurve: 1.35 },
    },
    physics: { radius: 2, isKinetic: true, rolls: true, density: 0.007958, friction: 2.25, wallPhysics: { restitution: 0.38, friction: 0.22 } },
    defaultVisualOverride: { tint: "#ff7043" },
});

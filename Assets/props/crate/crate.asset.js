import { CRATE_PLANK_TS, CRATE_TOP_CROSS } from "../../../Libraries/deprecated/boxDecor.js";
import block from "../block/block.asset.js";
import { extendPropAlias } from "../shared/propAlias.js";
export default extendPropAlias(block, {
    id: "crate",
    sandbox: { tags: ["shapes"], behaviors: ["dragLaunch"], dragLaunch: { minPower: 20, maxPower: 260 } },
    physics: {
        isKinetic: true,
        localFootprint: [
            { x: -8, y: -8 },
            { x: 8, y: -8 },
            { x: 8, y: 8 },
            { x: -8, y: 8 },
        ],
        wallPhysics: { restitution: 0.15, friction: 0.8 },
        fracture: true,
        fractureMode: "chunk",
        spawn: { minRadius: 150, maxRadius: 1000, minCount: 8, randomRange: 17 },
    },
    defaultVisualOverride: { tint: "#8D6E63" },
    visuals: { colors: { ...block.visuals.colors, topHighlight: "#BCAAA4" }, world: { height: 7 }, plankTs: CRATE_PLANK_TS, topCross: CRATE_TOP_CROSS },
});

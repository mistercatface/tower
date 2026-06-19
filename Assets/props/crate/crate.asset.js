import { NEUTRAL_BOX_COLORS } from "../shared/neutralCoats.js";
const CRATE_PLANK_TS = { values: [0.33, 0.66], stroke: "rgba(62, 39, 35, 0.55)" };
const CRATE_TOP_CROSS = { stroke: "rgba(62, 39, 35, 0.6)" };
export default {
    id: "crate",
    primitive: "polygon",
    sandbox: { tags: ["shapes"], behaviors: ["dragLaunch"], dragLaunch: { minPower: 20, maxPower: 260 }, spawnLabel: "Crate" },
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
    visuals: { colors: { ...NEUTRAL_BOX_COLORS, topHighlight: "#BCAAA4" }, world: { height: 7 }, plankTs: CRATE_PLANK_TS, topCross: CRATE_TOP_CROSS },
};

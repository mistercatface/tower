import { NEUTRAL_BOX_COLORS } from "../shared/neutralCoats.js";
export default {
    id: "block",
    primitive: "polygon",
    sandbox: { tags: ["shapes"], behaviors: ["dragLaunch"], dragLaunch: { minPower: 20, maxPower: 260 }, spawnLabel: "Block" },
    physics: {
        isKinetic: true,
        localFootprint: [
            { x: -8, y: -4 },
            { x: 8, y: -4 },
            { x: 8, y: 4 },
            { x: -8, y: 4 },
        ],
        wallPhysics: { restitution: 0.15, friction: 0.8 },
    },
    visuals: { colors: { ...NEUTRAL_BOX_COLORS }, world: { height: 10 } },
};

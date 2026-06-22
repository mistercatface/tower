import { NEUTRAL_BOX_COLORS, NEUTRAL_POLYGON_STROKE } from "../shared/neutralCoats.js";
export default {
    id: "flee_wedge",
    primitive: "polygon",
    sandbox: { tags: ["shapes"], behaviors: ["dragLaunch"], dragLaunch: { minPower: 20, maxPower: 260 }, spawnLabel: "Flee wedge" },
    physics: {
        isKinetic: true,
        canChain: true,
        friction: 8,
        wallPhysics: { restitution: 0.2, friction: 0.7 },
        localFootprint: [
            { x: -1.75, y: -0.97 },
            { x: 1.75, y: -0.97 },
            { x: 0, y: 1.94 },
        ],
    },
    visuals: { colors: { side: NEUTRAL_BOX_COLORS.side, sideShadow: NEUTRAL_BOX_COLORS.sideShadow, top: NEUTRAL_BOX_COLORS.top, stroke: NEUTRAL_POLYGON_STROKE }, world: { height: 2.33 } },
};

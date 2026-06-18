import { NEUTRAL_BOX_COLORS, NEUTRAL_POLYGON_STROKE } from "../shared/neutralCoats.js";
export default {
    id: "tri_wedge",
    primitive: "polygon",
    sandbox: { tags: ["shapes"], behaviors: ["dragLaunch"], dragLaunch: { minPower: 20, maxPower: 260 }, spawnLabel: "tri wedge" },
    physics: {
        isKinetic: true,
        friction: 8,
        wallPhysics: { restitution: 0.2, friction: 0.7 },
        localFootprint: [
            { x: -9, y: -5 },
            { x: 9, y: -5 },
            { x: 0, y: 10 },
        ],
    },
    visuals: { colors: { side: NEUTRAL_BOX_COLORS.side, sideShadow: NEUTRAL_BOX_COLORS.sideShadow, top: NEUTRAL_BOX_COLORS.top, stroke: NEUTRAL_POLYGON_STROKE }, world: { height: 12 } },
};

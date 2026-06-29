import { NEUTRAL_BOX_COLORS, NEUTRAL_POLYGON_STROKE } from "../shared/neutralCoats.js";
export default {
    id: "ammo_shard",
    primitive: "polygon",
    sandbox: { spawnable: false, tags: ["debris"] },
    physics: { isKinetic: true, friction: 3, density: 0.001, wallPhysics: { restitution: 0.18, friction: 0.45 }, pairRestitution: 0.12, fracture: true, fractureMode: "glass" },
    visuals: {
        colors: {
            side: NEUTRAL_BOX_COLORS.side,
            sideShadow: NEUTRAL_BOX_COLORS.sideShadow,
            top: "#b94400", // metallic glowing cyan
            topHighlight: "#e0ffff",
            bottom: NEUTRAL_BOX_COLORS.bottom,
            bodyInspect: NEUTRAL_BOX_COLORS.bodyInspect,
            stroke: NEUTRAL_POLYGON_STROKE,
        },
        world: { height: 2 },
        lineWidth: 0.35,
    },
};

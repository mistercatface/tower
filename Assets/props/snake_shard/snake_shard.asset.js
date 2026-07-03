import { NEUTRAL_BOX_COLORS, NEUTRAL_POLYGON_STROKE } from "../shared/neutralCoats.js";
export default {
    id: "snake_shard",
    primitive: "polygon",
    sandbox: { spawnable: false, tags: ["debris"] },
    physics: { isKinetic: true, friction: 3, density: 0.001, wallPhysics: { restitution: 0.18, friction: 0.45 }, pairRestitution: 0.12, fracture: { mode: "glass" } },
    visuals: {
        colors: {
            side: NEUTRAL_BOX_COLORS.side,
            sideShadow: NEUTRAL_BOX_COLORS.sideShadow,
            top: NEUTRAL_BOX_COLORS.top,
            topHighlight: "#DADADA",
            bottom: NEUTRAL_BOX_COLORS.bottom,
            bodyInspect: NEUTRAL_BOX_COLORS.bodyInspect,
            stroke: NEUTRAL_POLYGON_STROKE,
        },
        world: { height: 2 },
        lineWidth: 0.35,
    },
};

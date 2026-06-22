import { NEUTRAL_BOX_COLORS, NEUTRAL_POLYGON_STROKE } from "../shared/neutralCoats.js";
import { syncFleeHornWedgeCollisionShape } from "../../../Libraries/Props/fleeHornWedge.js";
export default {
    id: "flee_wedge",
    primitive: "polygon",
    sandbox: { tags: ["shapes", "nav"], behaviors: ["dragLaunch"], dragLaunch: { minPower: 20, maxPower: 260 }, spawnLabel: "Flee horn" },
    physics: { isKinetic: true, canChain: true, friction: 8, wallPhysics: { restitution: 0.2, friction: 0.7 }, syncCollisionShape: syncFleeHornWedgeCollisionShape },
    visuals: {
        colors: { side: NEUTRAL_BOX_COLORS.side, sideShadow: NEUTRAL_BOX_COLORS.sideShadow, top: NEUTRAL_BOX_COLORS.top, stroke: NEUTRAL_POLYGON_STROKE },
        world: { height: 2.33 },
        lineWidth: 0.4,
    },
};

import { NEUTRAL_SPHERE_VISUALS } from "../shared/neutralCoats.js";
export default {
    id: "gun_ball",
    primitive: "sphere",
    sandbox: { tags: ["shapes", "nav"], behaviors: ["dragLaunch"], dragLaunch: { minPower: 25, maxPower: 500 }, spawnLabel: "Gun ball" },
    physics: { radius: 4, isKinetic: true, rolls: true, canChain: true, density: 0.007958, friction: 4, wallPhysics: { restitution: 0.35, friction: 0.4 } },
    visuals: {
        ...NEUTRAL_SPHERE_VISUALS,
        attachments: [
            {
                id: "barrel",
                propId: "tri_wedge",
                heading: "velocity",
                offsetSpace: "parentRadius",
                offset: { x: 1.65, y: 0 },
                facingOffset: -Math.PI / 2,
                radiusScale: 0.66,
                layer: 1,
                inheritTint: true,
            },
        ],
    },
};

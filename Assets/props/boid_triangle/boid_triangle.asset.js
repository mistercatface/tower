import { NEUTRAL_SPHERE_VISUALS } from "../shared/neutralCoats.js";
export default {
    id: "boid_triangle",
    primitive: "sphere",
    sandbox: { tags: ["shapes", "nav"], behaviors: ["dragLaunch", "rollToCursorHpa", "explore"], dragLaunch: { minPower: 25, maxPower: 500 }, spawnLabel: "Boid triangle" },
    physics: { radius: 4, isKinetic: true, rolls: true, canChain: true, density: 0.007958, friction: 4, wallPhysics: { restitution: 0.35, friction: 0.4 }, quantizeSteps: { facing: 64 }, fracture: { mode: "circle", minForce: 12, opponentOnly: true, excludeFactions: ["alpha"], threatType: "boid_triangle" } },
    visuals: {
        ...NEUTRAL_SPHERE_VISUALS,
        attachments: [
            {
                id: "movement_arrow",
                propId: "tri_wedge",
                heading: "facing",
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

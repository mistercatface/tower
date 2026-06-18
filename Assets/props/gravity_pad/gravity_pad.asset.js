import { DEFAULT_GRAVITY_PAD_FORCE_X, DEFAULT_GRAVITY_PAD_FORCE_Y, DEFAULT_GRAVITY_PAD_HALF_HEIGHT, DEFAULT_GRAVITY_PAD_HALF_WIDTH } from "../../../Libraries/Sandbox/gravityPadDefaults.js";
import { createGravityPadDraw } from "../../../Libraries/Render/gravityPadDraw.js";
export default {
    id: "gravity_pad",
    draw: createGravityPadDraw(),
    sandbox: { spawnLabel: "Gravity pad" },
    physics: {
        renderMode: "floor",
        spatialRole: "trigger",
        isKinetic: false,
        gravityImmune: true,
        collisionShape: "box",
        halfExtents: { x: DEFAULT_GRAVITY_PAD_HALF_WIDTH, y: DEFAULT_GRAVITY_PAD_HALF_HEIGHT },
        floorTriggers: [{ when: "occupied", effect: "pull", forceX: DEFAULT_GRAVITY_PAD_FORCE_X, forceY: DEFAULT_GRAVITY_PAD_FORCE_Y }],
    },
};

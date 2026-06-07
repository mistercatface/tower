import { POOL_BALL_RADIUS } from "../../../Games/pool/config/tableLayout.js";
export default {
    id: "pool_cue_ball",
    recipe: "poolBall",
    physics: {
        hitBehavior: "none",
        radius: POOL_BALL_RADIUS,
        isPushable: true,
        rolls: true,
        collisionShape: "circle",
        laserTargetable: false,
        mass: 1.0,
        pairRestitution: 0.92,
        friction: 0.5,
        lowSpeedFrictionThreshold: 10,
        lowSpeedFriction: 2.8,
        snapSpeed: 1.8,
        wallPhysics: { restitution: 0.94, friction: 0.06 },
    },
    visuals: { defaultPoolBall: { kind: "cue" }, defaultRadius: POOL_BALL_RADIUS, panelCount: 12, latBands: 8, stroke: null },
};

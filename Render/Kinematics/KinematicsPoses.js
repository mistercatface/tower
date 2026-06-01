export function createKinematicsPoses(config, rig) {
    const createPose = (name, options) => ({
        name,
        rotation: { bodyOffset: options.rotation?.bodyOffset ?? 0 },
        getTargets(cycle) {
            const feet = options.feet || {};
            const spreadX = feet.spreadX ?? 0.015;
            const offsetX = feet.offsetX ?? 0;
            const rightOffsetX = feet.rightOffsetX ?? (offsetX - spreadX);
            const leftOffsetX = feet.leftOffsetX ?? (offsetX + spreadX);
            return {
                rightFoot: { x: rig.size * rightOffsetX, y: rig.groundY },
                leftFoot: { x: rig.size * leftOffsetX, y: rig.groundY },
            };
        },
        getModifiers(cycle) {
            const body = options.body || {};
            const lift = (body.lift ?? 0) * rig.size;
            const leanBase = body.leanBase ?? 0;
            const leanRange = body.leanRange ?? 0;
            const leanSpeed = body.leanSpeed ?? 0.5;
            const bobRange = body.bobRange ?? 0.008;
            const bobSpeed = body.bobSpeed ?? 1.5;
            return {
                lift,
                lean: leanBase + Math.sin(cycle * leanSpeed) * leanRange,
                bob: Math.sin(cycle * bobSpeed) * (rig.size * bobRange),
            };
        },
        getArmAngles: options.getArmAngles,
    });

    const walk = {
        name: "WALK",
        getTargets(cycle) {
            const rawSwing = Math.sin(cycle);
            const fSwing = rawSwing * -config.WALK_DIR;
            const swingDist = rig.size * 0.08;
            const stepHeight = rig.size * 0.12;
            const rLift = Math.max(0, Math.cos(cycle)) * stepHeight;
            const lLift = Math.max(0, Math.cos(cycle + Math.PI)) * stepHeight;
            return {
                rightFoot: { x: fSwing * swingDist, y: rig.groundY - rLift },
                leftFoot: { x: -fSwing * swingDist, y: rig.groundY - lLift },
            };
        },
        getModifiers(cycle) {
            return { lift: 0, lean: 0, bob: Math.cos(cycle * 2) * (rig.size * 0.02) };
        },
        getArmAngles(cycle) {
            const rawSwing = Math.sin(cycle);
            const fSwing = rawSwing * config.WALK_DIR;
            const range = 0.8;
            return {
                rArm: -(fSwing * range),
                lArm: fSwing * range,
                rElbow: -(fSwing * range) - 0.3,
                lElbow: fSwing * range - 0.3,
            };
        },
    };

    const sneak = {
        name: "SNEAK",
        getArmAngles(cycle) {
            const sway = Math.sin(cycle) * 0.1;
            return {
                rArm: 0.2 + sway,
                lArm: 0.2 - sway,
                rElbow: -0.5,
                lElbow: -0.5,
                rArmZ: 0.2,
                lArmZ: 0.2,
                rElbowZ: 0,
                lElbowZ: 0,
            };
        },
        getModifiers(cycle) {
            return {
                lift: -0.15 * rig.size,
                lean: 0.2 + Math.sin(cycle) * 0.02,
                bob: Math.cos(cycle * 2) * (rig.size * 0.01),
            };
        },
        getTargets(cycle) {
            const rawSwing = Math.sin(cycle);
            const fSwing = rawSwing * (-config.WALK_DIR || 1);
            const swingDist = rig.size * 0.1;
            const stepHeight = rig.size * 0.1;
            const rLift = Math.max(0, Math.cos(cycle)) * stepHeight;
            const lLift = Math.max(0, Math.cos(cycle + Math.PI)) * stepHeight;
            return {
                rightFoot: { x: fSwing * swingDist, y: rig.groundY - rLift },
                leftFoot: { x: -fSwing * swingDist, y: rig.groundY - lLift },
            };
        },
    };

    const poses = {
        WALK: walk,
        SNEAK: sneak,
        IDLE: createPose("IDLE", {
            feet: { spreadX: 0.015 },
            body: { leanRange: 0.02, bobRange: 0.008, bobSpeed: 1.5, leanSpeed: 0.5 },
            getArmAngles(cycle) {
                const swing = Math.sin(cycle * 0.75) * 0.15;
                return { rArm: swing, lArm: -swing, rElbow: -0.2, lElbow: -0.2 };
            },
        }),
    };

    return poses;
}

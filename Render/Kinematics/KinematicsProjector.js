export function createProjector(viewContext, rotation, config, rig) {
    const { yFactor = 0.8, shiftX = 0, shiftY = 0, ratio = 0 } = viewContext || {};
    const bRot = rotation + config.BODY_OFFSET;
    const bCos = Math.cos(bRot);
    const bSin = Math.sin(bRot);
    const cx = config.SIZE / 2;
    const groundY = config.SIZE * config.ANCHOR_Y;
    const boundsZ = Math.max(8, config.SIZE * 0.6);
    const depthWeight = Math.max(0, 0.9 - yFactor) * 4.0;

    return (p) => {
        if (p.scale !== undefined) return p;
        const rx = p.x * bCos - p.z * bSin;
        const rz = p.x * bSin + p.z * bCos;
        const worldHeight = groundY - p.y;
        const heightNorm = worldHeight / config.SIZE;
        const dShiftX = shiftX + rx * ratio;
        const dShiftY = shiftY + rz * ratio;
        const rzVis = Math.max(-boundsZ, Math.min(boundsZ, rz));
        return { x: cx + rx + dShiftX * heightNorm, y: groundY + rz - worldHeight * yFactor + dShiftY * heightNorm, z: rz, sortZ: rzVis - p.y * depthWeight, scale: 0.9 + (rzVis / config.SIZE) * 0.5 };
    };
}

export function projectRig(rigData, rotation, viewContext, config, rig) {
    const proj = createProjector(viewContext, rotation, config, rig);
    const rArmP2 = proj(rigData.rArm.p2);
    const rLegP2 = proj(rigData.rLeg.p2);
    const lArmP2 = proj(rigData.lArm.p2);
    const lLegP2 = proj(rigData.lLeg.p2);
    const headP = proj(rigData.head);
    return {
        head: headP,
        headY: headP.y,
        headLocal: rigData.head,
        spineTopLocal: rigData.spineTop,
        spineTop: proj(rigData.spineTop),
        spineBot: proj(rigData.spineBot),
        rArm: { p1: proj(rigData.rArm.p1), p2: rArmP2, p3: proj(rigData.rArm.p3) },
        lArm: { p1: proj(rigData.lArm.p1), p2: lArmP2, p3: proj(rigData.lArm.p3) },
        rLeg: { p1: proj(rigData.rLeg.p1), p2: rLegP2, p3: proj(rigData.rLeg.p3) },
        lLeg: { p1: proj(rigData.lLeg.p1), p2: lLegP2, p3: proj(rigData.lLeg.p3) },
        zRight: (rArmP2.z + rLegP2.z) / 2,
        zLeft: (lArmP2.z + lLegP2.z) / 2,
    };
}

export function projectRagdollRig(rigData, rotation, viewContext, config, rig, rawPoints = null, referenceScale = null) {
    const proj = createProjector(viewContext, rotation, config, rig);
    const finalize = (point) => {
        if (!point || referenceScale == null) return point;
        return { ...point, scale: referenceScale };
    };
    const headP = finalize(proj(rigData.head));
    const scene = {
        head: headP,
        headY: headP.y,
        spineTop: finalize(proj(rigData.spineTop)),
        spineBot: finalize(proj(rigData.spineBot)),
        rArm: { p1: finalize(proj(rigData.rArm.p1)), p2: finalize(proj(rigData.rArm.p2)), p3: finalize(proj(rigData.rArm.p3)) },
        lArm: { p1: finalize(proj(rigData.lArm.p1)), p2: finalize(proj(rigData.lArm.p2)), p3: finalize(proj(rigData.lArm.p3)) },
        rLeg: { p1: finalize(proj(rigData.rLeg.p1)), p2: finalize(proj(rigData.rLeg.p2)), p3: finalize(proj(rigData.rLeg.p3)) },
        lLeg: { p1: finalize(proj(rigData.lLeg.p1)), p2: finalize(proj(rigData.lLeg.p2)), p3: finalize(proj(rigData.lLeg.p3)) },
    };

    if (rawPoints) {
        const lookup = {};
        for (const key of Object.keys(rawPoints)) {
            lookup[key] = finalize(proj(rawPoints[key]));
        }
        scene.lookup = lookup;
        if (lookup.head) scene.head = lookup.head;
        if (lookup.spineTop) scene.spineTop = lookup.spineTop;
        if (lookup.spineBot) scene.spineBot = lookup.spineBot;
        if (lookup.rShoulder) scene.rArm.p1 = lookup.rShoulder;
        if (lookup.rElbow) scene.rArm.p2 = lookup.rElbow;
        if (lookup.rHand) scene.rArm.p3 = lookup.rHand;
        if (lookup.lShoulder) scene.lArm.p1 = lookup.lShoulder;
        if (lookup.lElbow) scene.lArm.p2 = lookup.lElbow;
        if (lookup.lHand) scene.lArm.p3 = lookup.lHand;
        if (lookup.rHip) scene.rLeg.p1 = lookup.rHip;
        if (lookup.rKnee) scene.rLeg.p2 = lookup.rKnee;
        if (lookup.rFoot) scene.rLeg.p3 = lookup.rFoot;
        if (lookup.lHip) scene.lLeg.p1 = lookup.lHip;
        if (lookup.lKnee) scene.lLeg.p2 = lookup.lKnee;
        if (lookup.lFoot) scene.lLeg.p3 = lookup.lFoot;
    }

    return scene;
}

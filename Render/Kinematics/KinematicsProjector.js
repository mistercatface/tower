function rotateXZ(p, bCos, bSin) {
    return {
        rx: p.x * bCos - p.z * bSin,
        rz: p.x * bSin + p.z * bCos,
    };
}

function clampRzVis(rz, config) {
    const boundsZ = Math.max(8, config.SIZE * 0.6);
    return Math.max(-boundsZ, Math.min(boundsZ, rz));
}

function partScaleFromRzVis(rzVis, config) {
    return 0.9 + (rzVis / config.SIZE) * 0.5;
}

/** Project rig-local {x,y,z} to canvas space (live + corpse). */
export function projectLocalPoint(p, bCos, bSin, viewContext, config) {
    const { yFactor = 0.8, shiftX = 0, shiftY = 0, ratio = 0 } = viewContext || {};
    const cx = config.SIZE / 2;
    const groundY = config.SIZE * config.ANCHOR_Y;
    const depthWeight = Math.max(0, 0.9 - yFactor) * 4.0;

    const pos = rotateXZ(p, bCos, bSin);
    const rzVis = clampRzVis(pos.rz, config);
    const scale = partScaleFromRzVis(rzVis, config);

    const worldHeight = groundY - p.y;
    const heightNorm = worldHeight / config.SIZE;
    const dShiftX = shiftX + pos.rx * ratio;
    const dShiftY = shiftY + pos.rz * ratio;

    return {
        x: cx + pos.rx + dShiftX * heightNorm,
        y: groundY + pos.rz - worldHeight * yFactor + dShiftY * heightNorm,
        z: pos.rz,
        sortZ: rzVis - p.y * depthWeight,
        scale,
    };
}

export function createProjector(viewContext, rotation, config, rig) {
    const bRot = rotation + config.BODY_OFFSET;
    const bCos = Math.cos(bRot);
    const bSin = Math.sin(bRot);
    return (p) => {
        if (p.scale !== undefined) return p;
        return projectLocalPoint(p, bCos, bSin, viewContext, config);
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

import { blend, ease, getSeg, solveIK, applyLocalTilt, getAimingArmAngles } from "./KinematicsMath.js";
import { resolveWeaponDrawSlots } from "./KinematicsWeaponVisuals.js";

function applyWeaponAimToVals(vals, actor, aimStrength) {
    const slots = resolveWeaponDrawSlots(actor);
    if (slots.length === 0 || aimStrength <= 0.001) return vals;

    const diveDir = actor.angle ?? 0;
    const turrets = actor.turrets ?? [];
    let merged = { ...vals };

    if (slots.length === 1 && slots[0].aimArms === "both") {
        const aim = turrets[0]?.angle ?? diveDir;
        const arms = getAimingArmAngles(aim, "both", -1.5, diveDir);
        merged = blendArmVals(merged, arms, aimStrength);
        return merged;
    }

    for (const slot of slots) {
        const aim = turrets[slot.turretIndex]?.angle ?? diveDir;
        const arms = getAimingArmAngles(aim, slot.aimArms, -1.5, diveDir);
        if (slot.aimArms === "right") {
            merged.rArm = blend(vals.rArm, arms.rArm, aimStrength);
            merged.rElbow = blend(vals.rElbow, arms.rElbow, aimStrength);
            merged.rArmZ = blend(vals.rArmZ, arms.rArmZ, aimStrength);
        } else {
            merged.lArm = blend(vals.lArm, arms.lArm, aimStrength);
            merged.lElbow = blend(vals.lElbow, arms.lElbow, aimStrength);
            merged.lArmZ = blend(vals.lArmZ, arms.lArmZ, aimStrength);
        }
    }
    return merged;
}

function blendArmVals(base, target, t) {
    return {
        ...base,
        rArm: blend(base.rArm, target.rArm, t),
        lArm: blend(base.lArm, target.lArm, t),
        rElbow: blend(base.rElbow, target.rElbow, t),
        lElbow: blend(base.lElbow, target.lElbow, t),
        rArmZ: blend(base.rArmZ, target.rArmZ, t),
        lArmZ: blend(base.lArmZ, target.lArmZ, t),
        rElbowZ: blend(base.rElbowZ ?? 0, target.rElbowZ ?? 0, t),
        lElbowZ: blend(base.lElbowZ ?? 0, target.lElbowZ ?? 0, t),
    };
}

export function calculateCharacterRig(state, cycle, config, rig, poses, actor = null) {
    const cf = state.crouchFactor || 0;
    const walkTargets = poses.WALK.getTargets(cycle);
    const walkMods = poses.WALK.getModifiers(cycle);
    const walkArms = poses.WALK.getArmAngles(cycle);
    const sneakTargets = poses.SNEAK.getTargets(cycle);
    const sneakMods = poses.SNEAK.getModifiers(cycle);
    const sneakArms = poses.SNEAK.getArmAngles(cycle);

    const activeWalkMods = {
        lift: blend(walkMods.lift, sneakMods.lift, cf),
        lean: blend(walkMods.lean, sneakMods.lean, cf),
        bob: blend(walkMods.bob, sneakMods.bob, cf),
    };
    const activeWalkTargets = {
        rightFoot: {
            x: blend(walkTargets.rightFoot.x, sneakTargets.rightFoot.x, cf),
            y: blend(walkTargets.rightFoot.y, sneakTargets.rightFoot.y, cf),
        },
        leftFoot: {
            x: blend(walkTargets.leftFoot.x, sneakTargets.leftFoot.x, cf),
            y: blend(walkTargets.leftFoot.y, sneakTargets.leftFoot.y, cf),
        },
    };
    const activeWalkArms = {
        rArm: blend(walkArms.rArm, sneakArms.rArm, cf),
        lArm: blend(walkArms.lArm, sneakArms.lArm, cf),
        rElbow: blend(walkArms.rElbow, sneakArms.rElbow, cf),
        lElbow: blend(walkArms.lElbow, sneakArms.lElbow, cf),
        rArmZ: blend(walkArms.rArmZ || 0, sneakArms.rArmZ || 0, cf),
        lArmZ: blend(walkArms.lArmZ || 0, sneakArms.lArmZ || 0, cf),
        rElbowZ: blend(walkArms.rElbowZ || 0, sneakArms.rElbowZ || 0, cf),
        lElbowZ: blend(walkArms.lElbowZ || 0, sneakArms.lElbowZ || 0, cf),
    };

    const s = Math.min(1, state.staticBlendFactor);
    const sEased = s * s;
    const lastT = state.lastStaticPose.getTargets(cycle);
    const nextT = state.currentStaticPose.getTargets(cycle);
    const lastM = state.lastStaticPose.getModifiers(cycle);
    const nextM = state.currentStaticPose.getModifiers(cycle);

    let staticLift = blend(lastM.lift, nextM.lift, sEased);
    let staticLean = blend(lastM.lean, nextM.lean, sEased);
    let staticBob = blend(lastM.bob, nextM.bob, sEased);
    let staticRF = {
        x: blend(lastT.rightFoot.x, nextT.rightFoot.x, sEased),
        y: blend(lastT.rightFoot.y, nextT.rightFoot.y, sEased),
    };
    let staticLF = {
        x: blend(lastT.leftFoot.x, nextT.leftFoot.x, sEased),
        y: blend(lastT.leftFoot.y, nextT.leftFoot.y, sEased),
    };

    const lastA = state.lastStaticPose.getArmAngles(cycle);
    const nextA = state.currentStaticPose.getArmAngles(cycle);
    const sRA = blend(lastA.rArm, nextA.rArm, sEased);
    const sLA = blend(lastA.lArm, nextA.lArm, sEased);
    const sRE = blend(lastA.rElbow, nextA.rElbow, sEased);
    const sLE = blend(lastA.lElbow, nextA.lElbow, sEased);
    const sRAZ = blend(lastA.rArmZ || 0, nextA.rArmZ || 0, sEased);
    const sLAZ = blend(lastA.lArmZ || 0, nextA.lArmZ || 0, sEased);
    const sREZ = blend(lastA.rElbowZ || 0, nextA.rElbowZ || 0, sEased);
    const sLEZ = blend(lastA.lElbowZ || 0, nextA.lElbowZ || 0, sEased);

    const t = ease(state.poseFactor);
    const vals = {
        lift: blend(staticLift, activeWalkMods.lift, t),
        lean: blend(staticLean, activeWalkMods.lean, t),
        bob: blend(staticBob, activeWalkMods.bob, t),
        rightFootTarget: {
            x: blend(staticRF.x, activeWalkTargets.rightFoot.x, t),
            y: blend(staticRF.y, activeWalkTargets.rightFoot.y, t),
        },
        leftFootTarget: {
            x: blend(staticLF.x, activeWalkTargets.leftFoot.x, t),
            y: blend(staticLF.y, activeWalkTargets.leftFoot.y, t),
        },
        rArm: blend(sRA, activeWalkArms.rArm, t),
        lArm: blend(sLA, activeWalkArms.lArm, t),
        rElbow: blend(sRE, activeWalkArms.rElbow, t),
        lElbow: blend(sLE, activeWalkArms.lElbow, t),
        rArmZ: blend(sRAZ, activeWalkArms.rArmZ, t),
        lArmZ: blend(sLAZ, activeWalkArms.lArmZ, t),
        rElbowZ: blend(sREZ, activeWalkArms.rElbowZ, t),
        lElbowZ: blend(sLEZ, activeWalkArms.lElbowZ, t),
    };

    if (actor) {
        const aimStrength = 1 - t;
        const aimed = applyWeaponAimToVals(vals, actor, aimStrength);
        vals.rArm = aimed.rArm;
        vals.lArm = aimed.lArm;
        vals.rElbow = aimed.rElbow;
        vals.lElbow = aimed.lElbow;
        vals.rArmZ = aimed.rArmZ;
        vals.lArmZ = aimed.lArmZ;
        vals.rElbowZ = aimed.rElbowZ;
        vals.lElbowZ = aimed.lElbowZ;
    }

    const totalYOffset = vals.bob + vals.lift;
    const sY = rig.baseShoulderY - totalYOffset;
    const hY = sY + rig.torsoH;
    const hipAnchorY = hY;
    const localTiltAngle = vals.lean * config.TILT;
    const hipCenter = { x: 0, y: hY, z: 0 };
    const tiltedHipCenter = applyLocalTilt(hipCenter, localTiltAngle, hipAnchorY);
    const hipX = tiltedHipCenter.x;
    const rA_p1 = applyLocalTilt({ x: 0, y: sY, z: rig.torsoHalfWidth }, localTiltAngle, hipAnchorY);
    const lA_p1 = applyLocalTilt({ x: 0, y: sY, z: -rig.torsoHalfWidth }, localTiltAngle, hipAnchorY);
    const rL_p1 = { x: hipX, y: hY, z: rig.hipHalfWidth };
    const lL_p1 = { x: hipX, y: hY, z: -rig.hipHalfWidth };
    const headY = rig.size * 0.25 - totalYOffset;
    const tiltedHead = applyLocalTilt({ x: 0, y: headY, z: 0 }, localTiltAngle, hipAnchorY);

    const rIK = solveIK(rL_p1.x, rL_p1.y, vals.rightFootTarget.x, vals.rightFootTarget.y, rig.legL1, rig.legL2);
    const rL_p2 = {
        x: rL_p1.x + Math.sin(rIK.hipAngle) * rig.legL1,
        y: rL_p1.y + Math.cos(rIK.hipAngle) * rig.legL1,
        z: rL_p1.z + rig.legFlare,
    };
    const rL_p3 = {
        x: rL_p2.x + Math.sin(rIK.hipAngle + rIK.kneeAngle) * rig.legL2,
        y: rL_p2.y + Math.cos(rIK.hipAngle + rIK.kneeAngle) * rig.legL2,
        z: rL_p2.z - rig.legFlare * 0.2,
    };
    const lIK = solveIK(lL_p1.x, lL_p1.y, vals.leftFootTarget.x, vals.leftFootTarget.y, rig.legL1, rig.legL2);
    const lL_p2 = {
        x: lL_p1.x + Math.sin(lIK.hipAngle) * rig.legL1,
        y: lL_p1.y + Math.cos(lIK.hipAngle) * rig.legL1,
        z: lL_p1.z - rig.legFlare,
    };
    const lL_p3 = {
        x: lL_p2.x + Math.sin(lIK.hipAngle + lIK.kneeAngle) * rig.legL2,
        y: lL_p2.y + Math.cos(lIK.hipAngle + lIK.kneeAngle) * rig.legL2,
        z: lL_p2.z + rig.legFlare * 0.2,
    };

    const rArmZ = vals.rArmZ;
    const lArmZ = vals.lArmZ;
    const rElbowZ = vals.rElbowZ;
    const lElbowZ = vals.lElbowZ;

    const rA_p2 = getSeg(rA_p1.x, rA_p1.y, rA_p1.z, vals.rArm, rArmZ, rig.armL1, rig.armFlare);
    const lA_p2 = getSeg(lA_p1.x, lA_p1.y, lA_p1.z, vals.lArm, -lArmZ, rig.armL1, -rig.armFlare);
    const rA_p3 = getSeg(rA_p2.x, rA_p2.y, rA_p2.z, vals.rElbow, rArmZ + rElbowZ, rig.armL2, -(rig.armFlare * 0.5));
    const lA_p3 = getSeg(lA_p2.x, lA_p2.y, lA_p2.z, vals.lElbow, -lArmZ - lElbowZ, rig.armL2, rig.armFlare * 0.5);

    return {
        spineTop: applyLocalTilt({ x: 0, y: sY, z: 0 }, localTiltAngle, hipAnchorY),
        spineBot: tiltedHipCenter,
        head: tiltedHead,
        rArm: { p1: rA_p1, p2: rA_p2, p3: rA_p3 },
        lArm: { p1: lA_p1, p2: lA_p2, p3: lA_p3 },
        rLeg: { p1: rL_p1, p2: rL_p2, p3: rL_p3 },
        lLeg: { p1: lL_p1, p2: lL_p2, p3: lL_p3 },
    };
}

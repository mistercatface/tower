import { getSeg, solveIK, applyLocalTilt, getAimingArmAngles } from "./ik.js";
import { blendAngle, normalizeAngle } from "../../Math/Angle.js";
import { smootherstep } from "../../Math/Easing.js";
import { clamp, lerp } from "../../Math/Interpolate.js";

function blendArmVals(base, target, t) {
    return {
        ...base,
        rArm: blendAngle(base.rArm, target.rArm, t),
        lArm: blendAngle(base.lArm, target.lArm, t),
        rElbow: blendAngle(base.rElbow, target.rElbow, t),
        lElbow: blendAngle(base.lElbow, target.lElbow, t),
        rArmZ: blendAngle(base.rArmZ, target.rArmZ, t),
        lArmZ: blendAngle(base.lArmZ, target.lArmZ, t),
        rElbowZ: blendAngle(base.rElbowZ ?? 0, target.rElbowZ ?? 0, t),
        lElbowZ: blendAngle(base.lElbowZ ?? 0, target.lElbowZ ?? 0, t),
    };
}

/**
 * @param {{ resolveWeaponDrawSlots: (actor: object) => object[] }} ports
 */
export function createCharacterRigCalculator(ports) {
    const { resolveWeaponDrawSlots } = ports;

    function applyWeaponAimToVals(vals, actor, aimStrength, facing) {
        const slots = resolveWeaponDrawSlots(actor);
        if (slots.length === 0 || aimStrength <= 0.001) return vals;
        const bodyFacing = facing?.rigAimFacing ?? normalizeAngle(actor.angle ?? 0);
        const turrets = actor.turrets ?? [];
        let merged = { ...vals };
        if (slots.length === 1 && slots[0].aimArms === "both") {
            const aim = facing?.turretWorldAngle(0) ?? turrets[0]?.angle ?? bodyFacing;
            const arms = getAimingArmAngles(aim, "both", -1.5, bodyFacing);
            merged = blendArmVals(merged, arms, aimStrength);
            return merged;
        }
        for (const slot of slots) {
            const aim = facing?.turretWorldAngle(slot.turretIndex) ?? turrets[slot.turretIndex]?.angle ?? bodyFacing;
            const arms = getAimingArmAngles(aim, slot.aimArms, -1.5, bodyFacing);
            if (slot.aimArms === "right") {
                merged.rArm = lerp(vals.rArm, arms.rArm, aimStrength);
                merged.rElbow = lerp(vals.rElbow, arms.rElbow, aimStrength);
                merged.rArmZ = lerp(vals.rArmZ, arms.rArmZ, aimStrength);
            } else {
                merged.lArm = lerp(vals.lArm, arms.lArm, aimStrength);
                merged.lElbow = lerp(vals.lElbow, arms.lElbow, aimStrength);
                merged.lArmZ = lerp(vals.lArmZ, arms.lArmZ, aimStrength);
            }
        }
        return merged;
    }

    function calculateCharacterRig(state, cycle, config, rig, poses, actor = null, facing = null) {
        const cf = state.crouchFactor || 0;
        const walkTargets = poses.WALK.getTargets(cycle);
        const walkMods = poses.WALK.getModifiers(cycle);
        const walkArms = poses.WALK.getArmAngles(cycle);
        const sneakTargets = poses.SNEAK.getTargets(cycle);
        const sneakMods = poses.SNEAK.getModifiers(cycle);
        const sneakArms = poses.SNEAK.getArmAngles(cycle);
        const activeWalkMods = { lift: lerp(walkMods.lift, sneakMods.lift, cf), lean: lerp(walkMods.lean, sneakMods.lean, cf), bob: lerp(walkMods.bob, sneakMods.bob, cf) };
        const activeWalkTargets = {
            rightFoot: { x: lerp(walkTargets.rightFoot.x, sneakTargets.rightFoot.x, cf), y: lerp(walkTargets.rightFoot.y, sneakTargets.rightFoot.y, cf) },
            leftFoot: { x: lerp(walkTargets.leftFoot.x, sneakTargets.leftFoot.x, cf), y: lerp(walkTargets.leftFoot.y, sneakTargets.leftFoot.y, cf) },
        };
        const activeWalkArms = {
            rArm: lerp(walkArms.rArm, sneakArms.rArm, cf),
            lArm: lerp(walkArms.lArm, sneakArms.lArm, cf),
            rElbow: lerp(walkArms.rElbow, sneakArms.rElbow, cf),
            lElbow: lerp(walkArms.lElbow, sneakArms.lElbow, cf),
            rArmZ: lerp(walkArms.rArmZ || 0, sneakArms.rArmZ || 0, cf),
            lArmZ: lerp(walkArms.lArmZ || 0, sneakArms.lArmZ || 0, cf),
            rElbowZ: lerp(walkArms.rElbowZ || 0, sneakArms.rElbowZ || 0, cf),
            lElbowZ: lerp(walkArms.lElbowZ || 0, sneakArms.lElbowZ || 0, cf),
        };
        const s = clamp(state.staticBlendFactor, 0, 1);
        const sEased = s * s;
        const lastT = state.lastStaticPose.getTargets(cycle);
        const nextT = state.currentStaticPose.getTargets(cycle);
        const lastM = state.lastStaticPose.getModifiers(cycle);
        const nextM = state.currentStaticPose.getModifiers(cycle);
        let staticLift = lerp(lastM.lift, nextM.lift, sEased);
        let staticLean = lerp(lastM.lean, nextM.lean, sEased);
        let staticBob = lerp(lastM.bob, nextM.bob, sEased);
        let staticRF = { x: lerp(lastT.rightFoot.x, nextT.rightFoot.x, sEased), y: lerp(lastT.rightFoot.y, nextT.rightFoot.y, sEased) };
        let staticLF = { x: lerp(lastT.leftFoot.x, nextT.leftFoot.x, sEased), y: lerp(lastT.leftFoot.y, nextT.leftFoot.y, sEased) };
        const lastA = state.lastStaticPose.getArmAngles(cycle);
        const nextA = state.currentStaticPose.getArmAngles(cycle);
        const sRA = lerp(lastA.rArm, nextA.rArm, sEased);
        const sLA = lerp(lastA.lArm, nextA.lArm, sEased);
        const sRE = lerp(lastA.rElbow, nextA.rElbow, sEased);
        const sLE = lerp(lastA.lElbow, nextA.lElbow, sEased);
        const sRAZ = lerp(lastA.rArmZ || 0, nextA.rArmZ || 0, sEased);
        const sLAZ = lerp(lastA.lArmZ || 0, nextA.lArmZ || 0, sEased);
        const sREZ = lerp(lastA.rElbowZ || 0, nextA.rElbowZ || 0, sEased);
        const sLEZ = lerp(lastA.lElbowZ || 0, nextA.lElbowZ || 0, sEased);
        const armed = actor && resolveWeaponDrawSlots(actor).length > 0;
        const legT = smootherstep(armed ? (state.legPoseFactor ?? 0) : state.poseFactor);
        const armT = armed ? 0 : legT;
        const vals = {
            lift: lerp(staticLift, activeWalkMods.lift, legT),
            lean: lerp(staticLean, activeWalkMods.lean, legT),
            bob: lerp(staticBob, activeWalkMods.bob, legT),
            rightFootTarget: { x: lerp(staticRF.x, activeWalkTargets.rightFoot.x, legT), y: lerp(staticRF.y, activeWalkTargets.rightFoot.y, legT) },
            leftFootTarget: { x: lerp(staticLF.x, activeWalkTargets.leftFoot.x, legT), y: lerp(staticLF.y, activeWalkTargets.leftFoot.y, legT) },
            rArm: lerp(sRA, activeWalkArms.rArm, armT),
            lArm: lerp(sLA, activeWalkArms.lArm, armT),
            rElbow: lerp(sRE, activeWalkArms.rElbow, armT),
            lElbow: lerp(sLE, activeWalkArms.lElbow, armT),
            rArmZ: lerp(sRAZ, activeWalkArms.rArmZ, armT),
            lArmZ: lerp(sLAZ, activeWalkArms.lArmZ, armT),
            rElbowZ: lerp(sREZ, activeWalkArms.rElbowZ, armT),
            lElbowZ: lerp(sLEZ, activeWalkArms.lElbowZ, armT),
        };
        if (actor) {
            const aimStrength = 1 - armT;
            const aimed = applyWeaponAimToVals(vals, actor, aimStrength, facing);
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
        const localTiltAngle = vals.lean * config.LEAN_MULTIPLIER;
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
        const rL_p2 = { x: rL_p1.x + Math.sin(rIK.hipAngle) * rig.legL1, y: rL_p1.y + Math.cos(rIK.hipAngle) * rig.legL1, z: rL_p1.z + rig.legFlare };
        const rL_p3 = { x: rL_p2.x + Math.sin(rIK.hipAngle + rIK.kneeAngle) * rig.legL2, y: rL_p2.y + Math.cos(rIK.hipAngle + rIK.kneeAngle) * rig.legL2, z: rL_p2.z - rig.legFlare * 0.2 };
        const lIK = solveIK(lL_p1.x, lL_p1.y, vals.leftFootTarget.x, vals.leftFootTarget.y, rig.legL1, rig.legL2);
        const lL_p2 = { x: lL_p1.x + Math.sin(lIK.hipAngle) * rig.legL1, y: lL_p1.y + Math.cos(lIK.hipAngle) * rig.legL1, z: lL_p1.z - rig.legFlare };
        const lL_p3 = { x: lL_p2.x + Math.sin(lIK.hipAngle + lIK.kneeAngle) * rig.legL2, y: lL_p2.y + Math.cos(lIK.hipAngle + lIK.kneeAngle) * rig.legL2, z: lL_p2.z + rig.legFlare * 0.2 };
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

    return { calculateCharacterRig };
}

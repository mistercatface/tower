import { getGunDefinition } from "../../../../Config/content/guns.js";
import { isTwoHandedGun, normalizeWeaponLoadout } from "../../../../Combat/equipmentLoadout.js";
import { WEAPON_VISUALS } from "./procedural.js";
/**
 * @param {Record<string, string>} gunIdToVisual — gun id → WEAPON_VISUALS key
 */
export function createWeaponVisuals(gunIdToVisual) {
    function getWeaponVisualForGunId(gunId) {
        const key = gunIdToVisual[gunId];
        return key ? WEAPON_VISUALS[key] : WEAPON_VISUALS.pistol;
    }
    function resolveWeaponStaticPoseName(actor) {
        const loadout = normalizeWeaponLoadout(actor.weaponLoadout ?? []);
        if (loadout.length === 0) return "IDLE";
        if (loadout.length === 1) return getWeaponVisualForGunId(loadout[0]).poseName;
        return "DUAL_WIELD";
    }
    function resolveWeaponDrawSlots(actor) {
        const loadout = normalizeWeaponLoadout(actor.weaponLoadout ?? []);
        if (loadout.length === 0) return [];
        if (loadout.length === 1 && isTwoHandedGun(loadout[0])) {
            const visual = getWeaponVisualForGunId(loadout[0]);
            getGunDefinition(loadout[0]);
            return [{ turretIndex: 0, gunId: loadout[0], visual, drawHand: "left", aimArms: "both" }];
        }
        return loadout.map((gunId, index) => {
            getGunDefinition(gunId);
            const visual = getWeaponVisualForGunId(gunId);
            const isRight = index === 0;
            return { turretIndex: index, gunId, visual, drawHand: isRight ? "right" : "left", aimArms: isRight ? "right" : "left" };
        });
    }
    function resolveProjectedHand(rigLocal, handKey, project) {
        const local = handKey === "right" ? rigLocal.rArm.p3 : rigLocal.lArm.p3;
        return project(local);
    }
    function resolveProjectedHandsForSlot(rigLocal, slot, project) {
        if (slot.aimArms === "both") {
            const right = project(rigLocal.rArm.p3);
            const left = project(rigLocal.lArm.p3);
            return { x: (right.x + left.x) * 0.5, y: (right.y + left.y) * 0.5, scale: ((right.scale ?? 1) + (left.scale ?? 1)) * 0.5, sortZ: Math.max(right.sortZ ?? 0, left.sortZ ?? 0) };
        }
        return resolveProjectedHand(rigLocal, slot.drawHand, project);
    }
    function getBarrelRatioForGunId(gunId) {
        return getWeaponVisualForGunId(gunId).barrelRatio;
    }
    function drawHeldWeapons(rigLocal, actor, sceneRenderer, config, facing) {
        const slots = resolveWeaponDrawSlots(actor);
        if (slots.length === 0) return;
        const project = sceneRenderer.project;
        const turrets = actor.turrets ?? [];
        const defaultHand = project(rigLocal.rArm.p3);
        const handScale = defaultHand.scale ?? 1;
        for (const slot of slots) {
            const turret = turrets[slot.turretIndex];
            const aimAngle = facing.gunCanvasAim(turret?.angle ?? actor.angle ?? 0);
            const hand = resolveProjectedHandsForSlot(rigLocal, slot, project);
            const z = (hand.sortZ ?? 0) + 0.15;
            sceneRenderer.addCustom(z, (ctx) => {
                slot.visual.draw(ctx, hand, hand.scale ?? handScale, aimAngle, config, slot.visual);
            });
        }
    }
    return { getWeaponVisualForGunId, resolveWeaponStaticPoseName, resolveWeaponDrawSlots, resolveProjectedHandsForSlot, getBarrelRatioForGunId, drawHeldWeapons };
}

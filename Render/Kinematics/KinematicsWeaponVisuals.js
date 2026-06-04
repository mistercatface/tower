import { getGunDefinition } from "../../Config/gunDefinitions.js";
import { isTwoHandedGun, normalizeWeaponLoadout } from "../../Combat/equipmentLoadout.js";

const GUN_COLORS = {
    dark: "#111111",
    mid: "#970000",
    highlight: "#fbff00",
};

function drawPistol(ctx, hand, scale, aimAngle, config) {
    const S = (r) => config.SIZE * r;
    ctx.save();
    ctx.translate(hand.x, hand.y);
    ctx.rotate(aimAngle);
    ctx.scale(scale, scale);
    if (Math.cos(aimAngle) < 0) ctx.scale(1, -1);
    ctx.translate(S(0.01), -S(0.03));
    const barrelLen = S(0.2);
    const barrelHeight = S(0.04);
    const gripHeight = S(0.08);

    const grad = ctx.createLinearGradient(0, -S(0.04), 0, 0);
    grad.addColorStop(0, GUN_COLORS.highlight);
    grad.addColorStop(0.5, GUN_COLORS.mid);
    grad.addColorStop(1, GUN_COLORS.dark);
    ctx.fillStyle = grad;
    if (gripHeight > S(0.01)) ctx.fillRect(-S(0.02), 0, S(0.045), gripHeight);
    ctx.fillRect(0, -S(0.02), barrelLen, barrelHeight);
    ctx.fillStyle = "#666666";
    ctx.fillRect(0, -S(0.02), barrelLen, S(0.01));
    ctx.fillStyle = "#000000";
    ctx.fillRect(barrelLen - S(0.005), -S(0.02), S(0.015), barrelHeight);
    ctx.restore();
}

function drawLongGun(ctx, hand, scale, aimAngle, config, style) {
    const S = (r) => config.SIZE * r;
    ctx.save();
    ctx.translate(hand.x, hand.y);
    ctx.rotate(aimAngle);
    ctx.scale(scale, scale);
    if (Math.cos(aimAngle) < 0) ctx.scale(1, -1);
    ctx.translate(S(0.01), -S(0.03));
    const isSmg = style === "smg";
    const barrelLen = S(isSmg ? 0.28 : 0.32);
    const barrelHeight = S(isSmg ? 0.035 : 0.045);
    const stockLen = S(0.1);

    ctx.fillStyle = isSmg ? "#222222" : "#5c3a21";
    ctx.fillRect(-stockLen, -S(0.012), stockLen, S(0.024));
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(-S(0.02), -S(0.025), S(0.05), S(0.05));
    ctx.fillStyle = "#333333";
    ctx.fillRect(0, -barrelHeight / 2, barrelLen, barrelHeight);
    ctx.fillStyle = "#888888";
    ctx.fillRect(0, -barrelHeight / 2, barrelLen, S(0.01));
    if (!isSmg) {
        ctx.fillStyle = "#4a3828";
        ctx.fillRect(S(0.08), -S(0.025), S(0.08), S(0.05));
    } else {
        ctx.fillStyle = "#1a1a1a";
        ctx.fillRect(S(0.01), S(0.01), S(0.02), S(0.04));
    }
    ctx.fillStyle = "#000000";
    ctx.fillRect(barrelLen - S(0.005), -barrelHeight / 2, S(0.015), barrelHeight);
    ctx.restore();
}

export const WEAPON_VISUALS = {
    pistol: {
        poseName: "PISTOL",
        draw: (ctx, hand, scale, aim, config) => drawPistol(ctx, hand, scale, aim, config),
    },
    longGun: {
        poseName: "SHOTGUN",
        draw: (ctx, hand, scale, aim, config) => drawLongGun(ctx, hand, scale, aim, config, "shotgun"),
    },
    smg: {
        poseName: "SHOTGUN",
        draw: (ctx, hand, scale, aim, config) => drawLongGun(ctx, hand, scale, aim, config, "smg"),
    },
};

const GUN_ID_TO_VISUAL = {
    servicePistol: "pistol",
    shotgun: "longGun",
    sawedOffShotgun: "longGun",
    tommyGun: "smg",
    beamLaser: "longGun",
    enemyRifle: "longGun",
    grenadeLauncher: "longGun",
};

export function getWeaponVisualForGunId(gunId) {
    const key = GUN_ID_TO_VISUAL[gunId];
    return key ? WEAPON_VISUALS[key] : WEAPON_VISUALS.pistol;
}

export function resolveWeaponStaticPoseName(actor) {
    const loadout = normalizeWeaponLoadout(actor.weaponLoadout ?? []);
    if (loadout.length === 0) return "IDLE";
    if (loadout.length === 1) {
        return getWeaponVisualForGunId(loadout[0]).poseName;
    }
    return "DUAL_WIELD";
}

/** Slots for drawing guns on the rig (aligned with turret indices). */
export function resolveWeaponDrawSlots(actor) {
    const loadout = normalizeWeaponLoadout(actor.weaponLoadout ?? []);
    if (loadout.length === 0) return [];

    if (loadout.length === 1 && isTwoHandedGun(loadout[0])) {
        const visual = getWeaponVisualForGunId(loadout[0]);
        getGunDefinition(loadout[0]);
        return [{
            turretIndex: 0,
            gunId: loadout[0],
            visual,
            drawHand: "left",
            aimArms: "both",
        }];
    }

    return loadout.map((gunId, index) => {
        getGunDefinition(gunId);
        const visual = getWeaponVisualForGunId(gunId);
        const isRight = index === 0;
        return {
            turretIndex: index,
            gunId,
            visual,
            drawHand: isRight ? "right" : "left",
            aimArms: isRight ? "right" : "left",
        };
    });
}

export function resolveProjectedHand(rigLocal, handKey, project) {
    const local = handKey === "right" ? rigLocal.rArm.p3 : rigLocal.lArm.p3;
    return project(local);
}

/** Projected hand position for weapon draw / muzzle (rig-local → canvas via shared projector). */
export function resolveProjectedHandsForSlot(rigLocal, slot, project) {
    if (slot.aimArms === "both") {
        const right = project(rigLocal.rArm.p3);
        const left = project(rigLocal.lArm.p3);
        return {
            x: (right.x + left.x) * 0.5,
            y: (right.y + left.y) * 0.5,
            scale: ((right.scale ?? 1) + (left.scale ?? 1)) * 0.5,
            sortZ: Math.max(right.sortZ ?? 0, left.sortZ ?? 0),
        };
    }
    return resolveProjectedHand(rigLocal, slot.drawHand, project);
}

/** Barrel length as a fraction of character display width (matches draw* gun meshes). */
const BARREL_RATIO = {
    servicePistol: 0.2,
    shotgun: 0.32,
    sawedOffShotgun: 0.32,
    tommyGun: 0.28,
    beamLaser: 0.32,
    enemyRifle: 0.32,
    grenadeLauncher: 0.32,
};

export function getBarrelRatioForGunId(gunId) {
    return BARREL_RATIO[gunId] ?? 0.2;
}

import { getCharacterForActor } from "../CharacterAppearance.js";
import { RAGDOLL_CONFIG } from "./RagdollConfig.js";
import { isNeckConstraint, isRagdollConstraintVisible } from "./RagdollGore.js";

function drawPixelCircle(ctx, cx, cy, r, color) {
    ctx.fillStyle = color;
    const rInt = Math.ceil(r);
    const cxR = Math.round(cx);
    const cyR = Math.round(cy);
    for (let y = -rInt; y <= rInt; y++) {
        for (let x = -rInt; x <= rInt; x++) {
            if (x * x + y * y <= r * r) {
                ctx.fillRect(cxR + x, cyR + y, 1, 1);
            }
        }
    }
}

function resolvePoint(scene, pointName) {
    if (scene.lookup?.[pointName]) return scene.lookup[pointName];
    if (scene[pointName]?.p1) return scene[pointName].p1;
    return scene[pointName] ?? null;
}

function withSortBoost(point, boost = 0.5) {
    if (!point) return null;
    return { ...point, sortZ: (point.sortZ ?? 0) + boost };
}

function constraintPalette(nameA, nameB, palettes, armPalette, rig) {
    const nameCheck = `${nameA}${nameB}`;
    let palette = palettes.skin;
    let radius = rig.armL1 * 0.25;
    if (/Leg|Hip|Shin|Knee|Foot/i.test(nameCheck)) {
        palette = palettes.pants;
        radius = rig.legL1 * 0.3;
    } else if (/Arm|Shoulder|Elbow|Hand/i.test(nameCheck)) {
        palette = armPalette;
        radius = rig.armL1 * 0.3;
    } else if (/spine|torso/i.test(nameCheck)) {
        palette = palettes.shirt;
        radius = rig.torsoHalfWidth * 0.9;
        if (nameA.includes("_fr_") || nameB.includes("_fr_")) {
            radius = rig.torsoHalfWidth * 0.4;
        }
    } else if (/head/i.test(nameCheck)) {
        palette = palettes.skin;
        radius = rig.headR * 0.6;
    }
    return { palette, radius };
}

/**
 * Blood stumps at severed joints — uses rig-local points (same projection as live characters).
 */
export function drawRagdollGoreStumps(ragdoll, sceneRenderer, rig) {
    const severed = ragdoll.severed ?? {};
    if (Object.keys(severed).length === 0) return;

    const points = ragdoll.points;
    if (!points) return;

    const bPalette = RAGDOLL_CONFIG.BLOOD.PALETTE;
    const stumpPalette = { base: bPalette.VENOUS, light: bPalette.VENOUS, dark: bPalette.VENOUS };

    const stump = (pointName, radiusMult) => {
        const p = points[pointName];
        if (!p) return;
        sceneRenderer.addSphere(p, rig.torsoHalfWidth * radiusMult, stumpPalette);
    };

    if (severed.head) stump("spineTop", 0.6);
    if (severed.rArm) {
        stump("rShoulder", 0.5);
        stump("spineTop", 0.5);
    }
    if (severed.lArm) {
        stump("lShoulder", 0.5);
        stump("spineTop", 0.5);
    }
    if (severed.rForearm) {
        stump("rElbow", 0.4);
        stump("rShoulder", 0.4);
    }
    if (severed.lForearm) {
        stump("lElbow", 0.4);
        stump("lShoulder", 0.4);
    }
    if (severed.rLeg) {
        stump("rHip", 0.6);
        stump("spineBot", 0.6);
    }
    if (severed.lLeg) {
        stump("lHip", 0.6);
        stump("spineBot", 0.6);
    }
    if (severed.rShin) {
        stump("rKnee", 0.5);
        stump("rHip", 0.5);
    }
    if (severed.lShin) {
        stump("lKnee", 0.5);
        stump("lHip", 0.5);
    }
}

/** @deprecated Corpses use drawStandardCharacter; kept for reference. */
export function drawRagdollBody(scene, actor, sceneRenderer, config, rig, ragdoll) {
    const char = getCharacterForActor(actor);
    const getPalette = (base, light, dark) => ({ base: base || "#888", light: light || "#fff", dark: dark || "#000" });
    const palettes = {
        skin: getPalette(char.skinColor, char.skinLight, char.skinDark),
        shirt: getPalette(char.topColor, char.topLight, char.topDark),
        pants: getPalette(char.bottomColor, char.bottomLight, char.bottomDark),
        shoe: getPalette(char.shoeColor, "#333", "#000"),
    };
    const armPalette = char.sleeveStyle === "long" ? palettes.shirt : palettes.skin;
    const Renderer = sceneRenderer;
    const lookup = scene.lookup || {};
    const severed = ragdoll.severed || {};
    const bPalette = RAGDOLL_CONFIG.BLOOD.PALETTE;

    const drawStump = (pointName, radiusMult = 0.6) => {
        const p = resolvePoint(scene, pointName);
        if (!p) return;
        Renderer.addCustom((p.sortZ ?? 0) + 0.3, (ctx) => {
            const scale = p.scale || 1.0;
            const rBase = rig.torsoHalfWidth * radiusMult * scale;
            if (rBase < 1.0) {
                ctx.fillStyle = bPalette.VENOUS;
                ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
                return;
            }
            ctx.fillStyle = bPalette.VENOUS;
            const rInt = Math.ceil(rBase);
            for (let y = -rInt; y <= rInt; y++) {
                for (let x = -rInt; x <= rInt; x++) {
                    if (x * x + y * y <= rBase * rBase * (0.8 + Math.random() * 0.4)) {
                        ctx.fillRect(Math.round(p.x + x), Math.round(p.y + y), 1, 1);
                    }
                }
            }
            if (rBase > 1.5) {
                const marrow = bPalette.MARROW ?? "#5c1818";
                drawPixelCircle(ctx, Math.round(p.x), Math.round(p.y), rBase * 0.4, "#f2f0e6");
                drawPixelCircle(ctx, Math.round(p.x), Math.round(p.y), rBase * 0.15, marrow);
            }
        });
    };

    const headCenter = lookup.head ?? scene.head;
    const spineTop = lookup.spineTop ?? scene.spineTop;

    const isHidden = (id) => {
        if (!id) return false;
        const strId = id.toString();
        const isSpine = strId === "spineTop" || strId === "spineBot";
        const isFrag = strId.includes("torso_fr_");
        return (ragdoll.torsoFragmented && isSpine) || isFrag;
    };

    for (const c of ragdoll.constraints) {
        if (!c.a || !c.b) continue;
        if (!isRagdollConstraintVisible(c, severed)) continue;
        if (isNeckConstraint(c)) continue;
        if (c.a.toString().startsWith("head_fr_") || c.b.toString().startsWith("head_fr_")) continue;

        const pA = lookup[c.a] ?? resolvePoint(scene, c.a);
        const pB = lookup[c.b] ?? resolvePoint(scene, c.b);
        if (!pA || !pB) continue;

        const nameA = c.a.split("_fr_")[0];
        const nameB = c.b.split("_fr_")[0];
        const { palette, radius: baseRadius } = constraintPalette(nameA, nameB, palettes, armPalette, rig);
        const lengthScale = Math.min(1.0, c.len / (rig.size * 0.15));
        const radius = baseRadius * Math.max(0.3, lengthScale);
        const sphereRad = radius * 0.9;

        Renderer.addCylinder(pA, pB, radius, palette);
        if (!isHidden(c.a)) Renderer.addSphere(pA, sphereRad, palette);
        if (!isHidden(c.b)) Renderer.addSphere(pB, sphereRad, palette);
    }

    if (headCenter && spineTop && !severed.head) {
        const neckRad = rig.torsoHalfWidth * 0.55;
        Renderer.addCylinder(spineTop, headCenter, neckRad, palettes.skin);
    }

    if (headCenter) {
        Renderer.addSphere(withSortBoost(headCenter, 0.6), rig.headR, palettes.skin);
    }

    if (severed.head) drawStump("spineTop", 0.6);
    if (severed.rArm) {
        drawStump("rShoulder", 0.5);
        drawStump("spineTop", 0.5);
    }
    if (severed.lArm) {
        drawStump("lShoulder", 0.5);
        drawStump("spineTop", 0.5);
    }
    if (severed.rForearm) {
        drawStump("rElbow", 0.4);
        drawStump("rShoulder", 0.4);
    }
    if (severed.lForearm) {
        drawStump("lElbow", 0.4);
        drawStump("lShoulder", 0.4);
    }
    if (severed.rLeg) {
        drawStump("rHip", 0.6);
        drawStump("spineBot", 0.6);
    }
    if (severed.lLeg) {
        drawStump("lHip", 0.6);
        drawStump("spineBot", 0.6);
    }
    if (severed.rShin) {
        drawStump("rKnee", 0.5);
        drawStump("rHip", 0.5);
    }
    if (severed.lShin) {
        drawStump("lKnee", 0.5);
        drawStump("lHip", 0.5);
    }
}

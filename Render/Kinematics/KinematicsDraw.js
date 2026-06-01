import { getCharacterForActor } from "./CharacterAppearance.js";
import { getHandProjected, resolveWeaponDrawSlots } from "./KinematicsWeaponVisuals.js";
import { queueRagdollBloodDraw } from "./Ragdoll/RagdollBlood.js";
import { drawRagdollBody } from "./Ragdoll/RagdollDrawBody.js";

export function drawStandardCharacter(scene, actor, sceneRenderer, config, rig) {
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

    const spineTop = scene.spineTop;
    const spineBot = scene.spineBot;
    const spineMid = {
        x: (spineTop.x + spineBot.x) * 0.5,
        y: (spineTop.y + spineBot.y) * 0.5,
        z: (spineTop.z + spineBot.z) * 0.5,
        sortZ: (spineTop.sortZ + spineBot.sortZ) * 0.5,
        scale: (spineTop.scale + spineBot.scale) * 0.5,
    };

    Renderer.addSphere(spineTop, rig.torsoHalfWidth * 0.9, palettes.shirt);
    Renderer.addCylinder(spineTop, spineMid, rig.torsoHalfWidth * 0.95, palettes.shirt);
    Renderer.addCylinder(spineMid, spineBot, rig.torsoHalfWidth * 0.9, palettes.shirt);
    Renderer.addSphere(spineBot, rig.hipHalfWidth * 1.1, palettes.pants);

    const legRad = rig.legL1 * 0.35;
    Renderer.addSphere(scene.rLeg.p1, legRad, palettes.pants);
    Renderer.addCylinder(scene.rLeg.p1, scene.rLeg.p2, legRad, palettes.pants);
    Renderer.addSphere(scene.rLeg.p2, legRad * 0.9, palettes.pants);
    Renderer.addCylinder(scene.rLeg.p2, scene.rLeg.p3, legRad * 0.8, palettes.pants);
    Renderer.addSphere(scene.rLeg.p3, legRad * 1.2, palettes.shoe);
    Renderer.addSphere(scene.lLeg.p1, legRad, palettes.pants);
    Renderer.addCylinder(scene.lLeg.p1, scene.lLeg.p2, legRad, palettes.pants);
    Renderer.addSphere(scene.lLeg.p2, legRad * 0.9, palettes.pants);
    Renderer.addCylinder(scene.lLeg.p2, scene.lLeg.p3, legRad * 0.8, palettes.pants);
    Renderer.addSphere(scene.lLeg.p3, legRad * 1.2, palettes.shoe);

    const armRad = rig.armL1 * 0.3;
    Renderer.addSphere(scene.rArm.p1, armRad, palettes.shirt);
    Renderer.addCylinder(scene.rArm.p1, scene.rArm.p2, armRad, palettes.shirt);
    Renderer.addSphere(scene.rArm.p2, armRad * 0.9, armPalette);
    Renderer.addCylinder(scene.rArm.p2, scene.rArm.p3, armRad * 0.8, armPalette);
    Renderer.addSphere(scene.rArm.p3, rig.handR * 1.5, palettes.skin);
    Renderer.addSphere(scene.lArm.p1, armRad, palettes.shirt);
    Renderer.addCylinder(scene.lArm.p1, scene.lArm.p2, armRad, palettes.shirt);
    Renderer.addSphere(scene.lArm.p2, armRad * 0.9, armPalette);
    Renderer.addCylinder(scene.lArm.p2, scene.lArm.p3, armRad * 0.8, armPalette);
    Renderer.addSphere(scene.lArm.p3, rig.handR * 1.5, palettes.skin);

    if (scene.head) scene.head.sortZ += 0.5;
    Renderer.addSphere(scene.head, rig.headR, palettes.skin);
}

function drawHeldWeapons(scene, actor, sceneRenderer, config, facing) {
    const slots = resolveWeaponDrawSlots(actor);
    if (slots.length === 0) return;

    const turrets = actor.turrets ?? [];
    const handScale = scene.rArm.p3.scale ?? 1;

    for (const slot of slots) {
        const turret = turrets[slot.turretIndex];
        const aimAngle = facing.gunCanvasAim(turret?.angle ?? actor.angle ?? 0);
        let hand;
        if (slot.aimArms === "both") {
            const right = scene.rArm.p3;
            const left = scene.lArm.p3;
            hand = {
                x: (right.x + left.x) * 0.5,
                y: (right.y + left.y) * 0.5,
                scale: ((right.scale ?? 1) + (left.scale ?? 1)) * 0.5,
                sortZ: Math.max(right.sortZ ?? 0, left.sortZ ?? 0),
            };
        } else {
            hand = getHandProjected(scene, slot.drawHand);
        }
        const z = (hand.sortZ ?? 0) + 0.15;

        sceneRenderer.addCustom(z, (ctx) => {
            slot.visual.draw(ctx, hand, hand.scale ?? handScale, aimAngle, config);
        });
    }
}

export function drawCharacterToCanvas(
    sharedCanvas,
    sharedCtx,
    scene,
    actor,
    viewContext,
    facing,
    config,
    rig,
    sceneRenderer,
    overridePadding = null,
    options = {},
) {
    const drawWeapons = options.drawWeapons !== false;
    const padding = overridePadding !== null ? overridePadding : config.PADDING;
    const canvasSize = Math.ceil(config.SIZE + padding * 2);

    if (sharedCanvas.width !== canvasSize || sharedCanvas.height !== canvasSize) {
        sharedCanvas.width = canvasSize;
        sharedCanvas.height = canvasSize;
    } else {
        sharedCtx.clearRect(0, 0, canvasSize, canvasSize);
    }

    sharedCtx.save();
    sharedCtx.translate(padding, padding);
    sceneRenderer.begin(sharedCtx, viewContext, facing.renderRotation, rig);
    drawStandardCharacter(scene, actor, sceneRenderer, config, rig);
    if (drawWeapons) {
        drawHeldWeapons(scene, actor, sceneRenderer, config, facing);
    }
    sceneRenderer.flush();
    sharedCtx.restore();

    sharedCanvas.drawRatio = canvasSize / config.SIZE;
    const feetYInCanvas = padding + config.ANCHOR_Y * config.SIZE;
    const canvasCenterY = canvasSize / 2;
    sharedCanvas.verticalShift = feetYInCanvas - canvasCenterY;

    return sharedCanvas;
}

/** Ragdoll corpse draw: character mesh + drips / floor stains. */
export function drawRagdollCorpseToCanvas(
    sharedCanvas,
    sharedCtx,
    scene,
    actor,
    viewContext,
    facing,
    config,
    rig,
    sceneRenderer,
    ragdoll,
    overridePadding = null,
) {
    const padding = overridePadding !== null ? overridePadding : config.PADDING;
    const canvasSize = Math.ceil(config.SIZE + padding * 2);

    if (sharedCanvas.width !== canvasSize || sharedCanvas.height !== canvasSize) {
        sharedCanvas.width = canvasSize;
        sharedCanvas.height = canvasSize;
    } else {
        sharedCtx.clearRect(0, 0, canvasSize, canvasSize);
    }

    sharedCtx.save();
    sharedCtx.translate(padding, padding);
    sceneRenderer.begin(sharedCtx, viewContext, facing.renderRotation, rig);
    drawRagdollBody(scene, actor, sceneRenderer, config, rig, ragdoll);
    queueRagdollBloodDraw(sceneRenderer, ragdoll, config, rig, viewContext, facing.renderRotation);
    sceneRenderer.flush();
    sharedCtx.restore();

    sharedCanvas.drawRatio = canvasSize / config.SIZE;
    const feetYInCanvas = padding + config.ANCHOR_Y * config.SIZE;
    const canvasCenterY = canvasSize / 2;
    sharedCanvas.verticalShift = feetYInCanvas - canvasCenterY;

    return sharedCanvas;
}

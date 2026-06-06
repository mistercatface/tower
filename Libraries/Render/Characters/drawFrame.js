import { drawHeadNeckAndHair } from "./head.js";
import { queueRagdollBloodDraw } from "./ragdoll/blood.js";
import { drawRagdollGoreStumps } from "./ragdoll/goreStumps.js";
/** Draw mesh from rig-local coords — every part projects through sceneRenderer (same as head). */
function drawStandardCharacter(rigLocal, actor, sceneRenderer, config, rig, getCharacterForActor, options = {}) {
    const severed = options.severed ?? {};
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
    const spineTop = rigLocal.spineTop;
    const spineBot = rigLocal.spineBot;
    const spineMid = { x: (spineTop.x + spineBot.x) * 0.5, y: (spineTop.y + spineBot.y) * 0.5, z: (spineTop.z + spineBot.z) * 0.5 };
    Renderer.addSphere(spineTop, rig.torsoHalfWidth * 0.9, palettes.shirt);
    Renderer.addCylinder(spineTop, spineMid, rig.torsoHalfWidth * 0.95, palettes.shirt);
    Renderer.addCylinder(spineMid, spineBot, rig.torsoHalfWidth * 0.9, palettes.shirt);
    Renderer.addSphere(spineBot, rig.hipHalfWidth * 1.1, palettes.pants);
    const legRad = rig.legL1 * 0.35;
    if (!severed.rLeg && !severed.rShin) {
        Renderer.addSphere(rigLocal.rLeg.p1, legRad, palettes.pants);
        Renderer.addCylinder(rigLocal.rLeg.p1, rigLocal.rLeg.p2, legRad, palettes.pants);
        Renderer.addSphere(rigLocal.rLeg.p2, legRad * 0.9, palettes.pants);
        Renderer.addCylinder(rigLocal.rLeg.p2, rigLocal.rLeg.p3, legRad * 0.8, palettes.pants);
        Renderer.addSphere(rigLocal.rLeg.p3, legRad * 1.2, palettes.shoe);
    }
    if (!severed.lLeg && !severed.lShin) {
        Renderer.addSphere(rigLocal.lLeg.p1, legRad, palettes.pants);
        Renderer.addCylinder(rigLocal.lLeg.p1, rigLocal.lLeg.p2, legRad, palettes.pants);
        Renderer.addSphere(rigLocal.lLeg.p2, legRad * 0.9, palettes.pants);
        Renderer.addCylinder(rigLocal.lLeg.p2, rigLocal.lLeg.p3, legRad * 0.8, palettes.pants);
        Renderer.addSphere(rigLocal.lLeg.p3, legRad * 1.2, palettes.shoe);
    }
    const armRad = rig.armL1 * 0.3;
    if (!severed.rArm)
        if (!severed.rForearm) {
            Renderer.addSphere(rigLocal.rArm.p1, armRad, palettes.shirt);
            Renderer.addCylinder(rigLocal.rArm.p1, rigLocal.rArm.p2, armRad, palettes.shirt);
            Renderer.addSphere(rigLocal.rArm.p2, armRad * 0.9, armPalette);
            Renderer.addCylinder(rigLocal.rArm.p2, rigLocal.rArm.p3, armRad * 0.8, armPalette);
            Renderer.addSphere(rigLocal.rArm.p3, rig.handR * 1.5, palettes.skin);
        } else {
            Renderer.addSphere(rigLocal.rArm.p1, armRad, palettes.shirt);
            Renderer.addCylinder(rigLocal.rArm.p1, rigLocal.rArm.p2, armRad, palettes.shirt);
            Renderer.addSphere(rigLocal.rArm.p2, armRad * 0.9, armPalette);
        }
    if (!severed.lArm)
        if (!severed.lForearm) {
            Renderer.addSphere(rigLocal.lArm.p1, armRad, palettes.shirt);
            Renderer.addCylinder(rigLocal.lArm.p1, rigLocal.lArm.p2, armRad, palettes.shirt);
            Renderer.addSphere(rigLocal.lArm.p2, armRad * 0.9, armPalette);
            Renderer.addCylinder(rigLocal.lArm.p2, rigLocal.lArm.p3, armRad * 0.8, armPalette);
            Renderer.addSphere(rigLocal.lArm.p3, rig.handR * 1.5, palettes.skin);
        } else {
            Renderer.addSphere(rigLocal.lArm.p1, armRad, palettes.shirt);
            Renderer.addCylinder(rigLocal.lArm.p1, rigLocal.lArm.p2, armRad, palettes.shirt);
            Renderer.addSphere(rigLocal.lArm.p2, armRad * 0.9, armPalette);
        }
    drawHeadNeckAndHair(Renderer, null, rig, char, {
        headLocal: rigLocal.head,
        spineTopLocal: rigLocal.spineTop,
        skinPalette: palettes.skin,
        getPalette: (b, l, d) => ({ base: b, light: l, dark: d }),
        severedHead: !!severed.head,
    });
}
/**
 * @param {{ getCharacterForActor: (actor: object) => object, drawHeldWeapons: (rigLocal: object, actor: object, sceneRenderer: object, config: object, facing: object) => void }} ports
 */
export function createCharacterFrameDrawer(ports) {
    const { getCharacterForActor, drawHeldWeapons } = ports;
    function drawKinematicsFrameToCanvas(sharedCanvas, sharedCtx, rigLocal, actor, viewContext, facing, config, rig, sceneRenderer, overridePadding = null, options = {}) {
        const { drawWeapons = false, severed = {}, ragdoll = null } = options;
        const padding = overridePadding !== null ? overridePadding : config.PADDING;
        const canvasSize = Math.ceil(config.SIZE + padding * 2);
        if (sharedCanvas.width !== canvasSize || sharedCanvas.height !== canvasSize) {
            sharedCanvas.width = canvasSize;
            sharedCanvas.height = canvasSize;
        } else sharedCtx.clearRect(0, 0, canvasSize, canvasSize);
        sharedCtx.save();
        sharedCtx.translate(padding, padding);
        sceneRenderer.begin(sharedCtx, viewContext, facing.renderRotation, rig);
        drawStandardCharacter(rigLocal, actor, sceneRenderer, config, rig, getCharacterForActor, { severed: ragdoll?.severed ?? severed });
        if (drawWeapons) drawHeldWeapons(rigLocal, actor, sceneRenderer, config, facing);
        if (ragdoll) {
            drawRagdollGoreStumps(ragdoll, sceneRenderer, rig);
            queueRagdollBloodDraw(sceneRenderer, ragdoll, config, rig, viewContext, facing.renderRotation);
        }
        sceneRenderer.flush();
        sharedCtx.restore();
        sharedCanvas.drawRatio = canvasSize / config.SIZE;
        const feetYInCanvas = padding + config.ANCHOR_Y * config.SIZE;
        const canvasCenterY = canvasSize / 2;
        sharedCanvas.verticalShift = feetYInCanvas - canvasCenterY;
        return sharedCanvas;
    }
    return { drawKinematicsFrameToCanvas };
}

import { queueCharacterHair } from "./KinematicsHair.js";

function cloneLocal(p) {
    if (!p) return null;
    return { x: p.x, y: p.y, z: p.z ?? 0 };
}

/**
 * Neck, head, and hair in rig-local space (perspective via sceneRenderer.project).
 */
export function drawHeadNeckAndHair(sceneRenderer, scene, rig, character, options = {}) {
    const headLocal = cloneLocal(scene?.headLocal ?? options.headLocal);
    const spineTopLocal = cloneLocal(scene?.spineTopLocal ?? options.spineTopLocal);
    if (!headLocal || !sceneRenderer) return;

    const skinPalette = options.skinPalette ?? {
        base: character.skinColor,
        light: character.skinLight,
        dark: character.skinDark,
    };
    const getPalette = options.getPalette ?? ((b, l, d) => ({ base: b, light: l, dark: d }));
    const skin = getPalette(skinPalette.base, skinPalette.light, skinPalette.dark);
    const Renderer = sceneRenderer;

    if (spineTopLocal) {
        const neckRad = rig.torsoHalfWidth * 0.38;
        Renderer.addCylinder(spineTopLocal, headLocal, neckRad, skin);
    }

    Renderer.addSphere(headLocal, rig.headR, skin);
    queueCharacterHair(Renderer, headLocal, rig, character);
}

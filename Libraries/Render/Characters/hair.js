/** Hair as rig-local spheres (same projector + perspective as the body). */

function offset(head, dx, dy, dz) {
    return { x: head.x + dx, y: head.y + dy, z: head.z + dz };
}

function hairPalette(character) {
    return {
        base: character.hairColor,
        light: character.hairLight ?? character.hairColor,
        dark: character.hairDark ?? character.hairColor,
    };
}

function drawBuzzcutHair(renderer, head, rig, palette) {
    const r = rig.headR;
    const blob = r * 0.36;
    const yCap = -r * 0.5;
    for (let iz = -1; iz <= 1; iz++) {
        for (let ix = -1; ix <= 1; ix++) {
            if (ix === 0 && iz === 0) continue;
            renderer.addSphere(offset(head, ix * r * 0.26, yCap, iz * r * 0.2), blob * 0.85, palette);
        }
    }
    renderer.addSphere(offset(head, 0, yCap - r * 0.08, 0), blob, palette);
}

function drawBarryHair(renderer, head, rig, palette) {
    drawBuzzcutHair(renderer, head, rig, palette);
}

function drawBrockHair(renderer, head, rig, palette) {
    const r = rig.headR;
    renderer.addSphere(offset(head, 0, -r * 0.56, 0), r * 0.48, palette);
    renderer.addSphere(offset(head, -r * 0.28, -r * 0.44, r * 0.18), r * 0.32, palette);
    renderer.addSphere(offset(head, r * 0.28, -r * 0.44, r * 0.18), r * 0.32, palette);
    renderer.addSphere(offset(head, 0, -r * 0.68, 0), r * 0.28, palette);
}

function drawShortHair(renderer, head, rig, palette) {
    const r = rig.headR;
    renderer.addSphere(offset(head, 0, -r * 0.54, 0), r * 0.44, palette);
    renderer.addSphere(offset(head, -r * 0.22, -r * 0.48, r * 0.16), r * 0.3, palette);
    renderer.addSphere(offset(head, r * 0.22, -r * 0.48, r * 0.16), r * 0.3, palette);
}

function drawMohawkHair(renderer, head, rig, palette) {
    const r = rig.headR;
    const blob = r * 0.22;
    const yTop = -r * 0.62;
    for (let i = -2; i <= 2; i++) {
        renderer.addSphere(offset(head, 0, yTop, i * r * 0.2), blob, palette);
    }
}

const HAIR_STYLES = {
    buzzcut: drawBuzzcutHair,
    short: drawShortHair,
    mohawk: drawMohawkHair,
    barry: drawBarryHair,
    brock: drawBrockHair,
};

/**
 * @param {object} sceneRenderer
 * @param {{ x, y, z }} headLocal - rig-space head anchor (not pre-projected)
 * @param {object} rig
 * @param {object} character
 */
export function queueCharacterHair(sceneRenderer, headLocal, rig, character) {
    if (!sceneRenderer || !headLocal || !character?.hairColor) return;
    const style = character.hairStyle;
    if (!style || style === "none") return;

    const drawFn = HAIR_STYLES[style] ?? drawShortHair;
    const palette = hairPalette(character);
    drawFn(sceneRenderer, headLocal, rig, palette);
}

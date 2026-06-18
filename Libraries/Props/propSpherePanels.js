export function buildSpherePanelsFromHue(hue, { saturation = 70, panelLightness = [42, 52, 62, 36, 48, 40] } = {}) {
    return panelLightness.map((lightness) => hslToHex(hue, saturation, lightness));
}

export function randomSpherePanels(rng = Math.random, colorOptions = {}) {
    return buildSpherePanelsFromHue(rng() * 360, colorOptions);
}

export function setPropSpherePanels(prop, panels) {
    prop.spherePanels = panels;
}

export function resolvePropSpherePanels(prop, assetPanels) {
    return prop.spherePanels ?? assetPanels;
}

export function spherePanelsCacheKey(prop) {
    const panels = prop.spherePanels;
    if (!panels?.length) return "";
    return `sp${panels.join("")}`;
}

function hslToHex(h, s, l) {
    s /= 100;
    l /= 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0;
    let g = 0;
    let b = 0;
    if (h < 60) {
        r = c;
        g = x;
    } else if (h < 120) {
        r = x;
        g = c;
    } else if (h < 180) {
        g = c;
        b = x;
    } else if (h < 240) {
        g = x;
        b = c;
    } else if (h < 300) {
        r = x;
        b = c;
    } else {
        r = c;
        b = x;
    }
    const toByte = (v) => Math.round((v + m) * 255);
    const rr = toByte(r).toString(16).padStart(2, "0");
    const gg = toByte(g).toString(16).padStart(2, "0");
    const bb = toByte(b).toString(16).padStart(2, "0");
    return `#${rr}${gg}${bb}`;
}

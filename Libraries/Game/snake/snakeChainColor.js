import { getPropVisualTint, randomVisualTintHex, setPropVisualTint } from "../../Color/visualOverride.js";
import { hueToPickerHex } from "../../Color/hex.js";
export function applySnakeChainTint(members, tintHex) {
    for (let i = 0; i < members.length; i++) setPropVisualTint(members[i], tintHex);
}
export function copySnakeChainTintFromHead(head, prop) {
    const tint = getPropVisualTint(head);
    if (tint != null) setPropVisualTint(prop, tint);
}
export function pickSnakeChainTintHex(faction = null, rng = Math.random) {
    if (faction === "red") {
        const hue = (350 + rng() * 30) % 360;
        const sat = 70 + rng() * 15;
        const light = 45 + rng() * 12;
        return hueToPickerHex(hue, sat, light);
    }
    if (faction === "blue") {
        const hue = 205 + rng() * 40;
        const sat = 70 + rng() * 15;
        const light = 45 + rng() * 12;
        return hueToPickerHex(hue, sat, light);
    }
    if (faction === "purple") {
        const hue = 265 + rng() * 35;
        const sat = 70 + rng() * 15;
        const light = 45 + rng() * 12;
        return hueToPickerHex(hue, sat, light);
    }
    return randomVisualTintHex(rng);
}

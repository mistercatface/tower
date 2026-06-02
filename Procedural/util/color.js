export function parseHexColor(hex) {
    const value = hex.startsWith("#") ? hex.slice(1) : hex;
    return {
        r: parseInt(value.slice(0, 2), 16),
        g: parseInt(value.slice(2, 4), 16),
        b: parseInt(value.slice(4, 6), 16),
    };
}

export function clampByte(value) {
    return Math.max(0, Math.min(255, value));
}

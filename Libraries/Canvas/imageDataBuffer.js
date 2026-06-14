/** @param {Uint8ClampedArray} data @param {[number, number, number]} rgb */
export function fillRgbaBuffer(data, rgb) {
    for (let i = 0; i < data.length; i += 4) {
        data[i] = rgb[0];
        data[i + 1] = rgb[1];
        data[i + 2] = rgb[2];
        data[i + 3] = 255;
    }
}
/** @param {Uint8ClampedArray} data @param {number} width @param {number} height @param {number} x @param {number} y @param {[number, number, number]} rgb */
export function setRgbaPixel(data, width, height, x, y, rgb) {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = (y * width + x) * 4;
    data[i] = rgb[0];
    data[i + 1] = rgb[1];
    data[i + 2] = rgb[2];
    data[i + 3] = 255;
}
/** @param {Uint8ClampedArray} data @param {number} width @param {number} height @param {number} x @param {number} y @param {number} rectW @param {number} rectH @param {[number, number, number]} rgb */
export function fillRgbaRect(data, width, height, x, y, rectW, rectH, rgb) {
    const xEnd = x + rectW;
    const yEnd = y + rectH;
    for (let py = y; py < yEnd; py++) for (let px = x; px < xEnd; px++) setRgbaPixel(data, width, height, px, py, rgb);
}
/** Axis-aligned horizontal or vertical line. */
export function strokeAxisLineRgba(data, width, height, x0, y0, x1, y1, rgb) {
    if (y0 === y1) {
        const lo = x0 < x1 ? x0 : x1;
        const hi = x0 < x1 ? x1 : x0;
        for (let x = lo; x <= hi; x++) setRgbaPixel(data, width, height, x, y0, rgb);
        return;
    }
    const lo = y0 < y1 ? y0 : y1;
    const hi = y0 < y1 ? y1 : y0;
    for (let y = lo; y <= hi; y++) setRgbaPixel(data, width, height, x0, y, rgb);
}
/** @param {Uint8Array | Uint8ClampedArray} rgbTriplets @param {Uint8ClampedArray} rgba @param {number} numPixels */
export function copyRgbTripletsToRgba(rgba, rgbTriplets, numPixels) {
    let rgbaIdx = 0;
    for (let i = 0; i < numPixels; i++) {
        rgba[rgbaIdx++] = rgbTriplets[i * 3];
        rgba[rgbaIdx++] = rgbTriplets[i * 3 + 1];
        rgba[rgbaIdx++] = rgbTriplets[i * 3 + 2];
        rgba[rgbaIdx++] = 255;
    }
}

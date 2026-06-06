import { transformLongAxisVertex } from "../Spatial/transforms/longAxisBox3d.js";
const SEGMENTS = 28;
/**
 * Ground-plane offset from prop anchor to the +hx end-cap (tip) of the fallen cylinder mesh.
 *
 * @param {number} hx
 * @param {number} hy
 * @param {number} height
 * @param {number} rollAngle
 */
export function computeCueMeshTipOffset(hx, hy, height, rollAngle) {
    const tipHy = hy * 0.65;
    let lx = 0;
    let ly = 0;
    for (let i = 0; i < SEGMENTS; i++) {
        const a = (i / SEGMENTS) * Math.PI * 2;
        const ringLy = Math.cos(a) * tipHy;
        const lz = tipHy + Math.sin(a) * tipHy;
        const v = transformLongAxisVertex(hx, ringLy, lz, 0, height, rollAngle);
        lx += v.lx;
        ly += v.ly;
    }
    return { lx: lx / SEGMENTS, ly: ly / SEGMENTS };
}
/**
 * @param {number} lx
 * @param {number} ly
 * @param {number} facing
 */
export function rotateLocalOffset(lx, ly, facing) {
    const cos = Math.cos(facing);
    const sin = Math.sin(facing);
    return { x: lx * cos - ly * sin, y: lx * sin + ly * cos };
}

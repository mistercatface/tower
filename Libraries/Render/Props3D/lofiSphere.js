import { IDENTITY_ROLL_QUAT, transformRollVertex } from "../../Props/rollingMotion.js";
import { drawPropMeshFace, isPropMeshFaceVisible } from "./propMesh.js";

const DEFAULT_PANEL_COLORS = ["#F44336", "#FFEB3B", "#2196F3", "#4CAF50", "#FF9800", "#FFFFFF"];

/**
 * Build lat/long sphere mesh resting on the ground, then apply roll orientation.
 *
 * @param {number} radius
 * @param {number} latBands
 * @param {number} lonBands
 * @param {{ w: number, x: number, y: number, z: number }} rollQuat
 */
function buildSphereMesh(radius, latBands, lonBands, rollQuat) {
    const rows = [];

    for (let lat = 0; lat <= latBands; lat++) {
        const phi = (lat / latBands) * Math.PI;
        const sinPhi = Math.sin(phi);
        const cosPhi = Math.cos(phi);
        const z = radius * (1 + cosPhi);
        const row = [];

        if (sinPhi < 1e-6) {
            const pole = transformRollVertex(0, 0, z, radius, rollQuat);
            row.push({ ...pole, lon: 0 });
        } else {
            for (let lon = 0; lon < lonBands; lon++) {
                const theta = (lon / lonBands) * Math.PI * 2;
                const lx = radius * sinPhi * Math.cos(theta);
                const ly = radius * sinPhi * Math.sin(theta);
                const rotated = transformRollVertex(lx, ly, z, radius, rollQuat);
                row.push({ ...rotated, lon });
            }
        }
        rows.push(row);
    }

    const faces = [];

    for (let lat = 0; lat < latBands; lat++) {
        const rowA = rows[lat];
        const rowB = rows[lat + 1];
        const northPole = rowA.length === 1;
        const southPole = rowB.length === 1;

        if (northPole) {
            const apex = rowA[0];
            for (let lon = 0; lon < lonBands; lon++) {
                const ln = (lon + 1) % lonBands;
                faces.push({
                    verts: [apex, rowB[ln], rowB[lon]],
                    panel: lon,
                    depth: (apex.z + rowB[lon].z + rowB[ln].z) / 3,
                });
            }
            continue;
        }

        if (southPole) {
            const apex = rowB[0];
            for (let lon = 0; lon < lonBands; lon++) {
                const ln = (lon + 1) % lonBands;
                faces.push({
                    verts: [rowA[lon], rowA[ln], apex],
                    panel: lon,
                    depth: (apex.z + rowA[lon].z + rowA[ln].z) / 3,
                });
            }
            continue;
        }

        for (let lon = 0; lon < lonBands; lon++) {
            const ln = (lon + 1) % lonBands;
            const v00 = rowA[lon];
            const v01 = rowA[ln];
            const v10 = rowB[lon];
            const v11 = rowB[ln];

            faces.push({
                verts: [v00, v01, v11],
                panel: lon,
                depth: (v00.z + v01.z + v11.z) / 3,
            });
            faces.push({
                verts: [v00, v11, v10],
                panel: lon,
                depth: (v00.z + v11.z + v10.z) / 3,
            });
        }
    }

    return faces;
}

/**
 * Low-poly beach-ball sphere: explicit 3D vertices projected to iso quads/tris.
 * Roll orientation (prop.rollQuat) rotates the mesh; quantized into sprite cache buckets.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} prop
 * @param {number} px
 * @param {number} py
 * @param {{
 *   baseRadius?: number,
 *   panelCount?: number,
 *   latBands?: number,
 *   panelColors?: string[],
 *   stroke?: string | null | false,
 *   lineWidth?: number,
 * }} [options]
 */
export function drawLoFiSphere(ctx, prop, px, py, options = {}) {
    const radius = options.baseRadius ?? prop.radius ?? 8;
    const panelCount = Math.max(3, options.panelCount ?? 6);
    const latBands = Math.max(3, options.latBands ?? 5);
    const lonBands = panelCount;
    const panelColors = options.panelColors ?? DEFAULT_PANEL_COLORS;
    const stroke = "stroke" in options ? options.stroke : "#2a2a2a";
    const lineWidth = options.lineWidth ?? 1.2;
    const rollQuat = prop.rollQuat ?? IDENTITY_ROLL_QUAT;

    const mesh = buildSphereMesh(radius, latBands, lonBands, rollQuat);

    const backFaces = [];
    const frontFaces = [];
    for (const face of mesh) {
        if (isPropMeshFaceVisible(prop, px, py, face.verts)) {
            frontFaces.push(face);
        } else {
            backFaces.push(face);
        }
    }

    const drawPass = (faces) => {
        const sorted = [...faces].sort((a, b) => a.depth - b.depth);
        for (const face of sorted) {
            const fill = panelColors[face.panel % panelColors.length];
            drawPropMeshFace(ctx, prop, px, py, face.verts, fill, stroke, lineWidth);
        }
    };

    drawPass(backFaces);
    drawPass(frontFaces);
}

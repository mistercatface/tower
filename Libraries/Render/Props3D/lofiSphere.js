import { CAMERA_HEIGHT } from "../../Spatial/iso/IsometricProjection.js";
import { IDENTITY_ROLL_QUAT, transformRollVertex } from "../../Props/rollingMotion.js";

const DEFAULT_PANEL_COLORS = ["#F44336", "#FFEB3B", "#2196F3", "#4CAF50", "#FF9800", "#FFFFFF"];

/**
 * Iso-project a local sphere vertex (ground origin at prop base, z = height above ground).
 * @param {object} prop
 * @param {number} px
 * @param {number} py
 * @param {number} lx
 * @param {number} ly
 * @param {number} lz
 */
function projectVertex(prop, px, py, lx, ly, lz) {
    const wx = prop.x + lx;
    const wy = prop.y + ly;
    if (lz <= 0.001) {
        return { x: wx, y: wy, depth: lz };
    }
    const dx = wx - px;
    const dy = wy - py;
    const dist = Math.hypot(dx, dy);
    const alpha = lz / (CAMERA_HEIGHT - lz);
    const sx = dist === 0 ? wx : wx + dx * alpha;
    const sy = dist === 0 ? wy : wy + dy * alpha;
    return { x: sx, y: sy, depth: lz + dist * 0.001 };
}

/** Cull back-facing mesh triangles using 3D face normal vs camera position. */
function isMeshFaceVisible(prop, px, py, verts3d) {
    const v0 = verts3d[0];
    const v1 = verts3d[1];
    const v2 = verts3d[2];

    const ax = v1.lx - v0.lx;
    const ay = v1.ly - v0.ly;
    const az = v1.z - v0.z;
    const bx = v2.lx - v0.lx;
    const by = v2.ly - v0.ly;
    const bz = v2.z - v0.z;

    const nx = ay * bz - az * by;
    const ny = az * bx - ax * bz;
    const nz = ax * by - ay * bx;

    const cx = prop.x + (v0.lx + v1.lx + v2.lx) / 3;
    const cy = prop.y + (v0.ly + v1.ly + v2.ly) / 3;
    const cz = (v0.z + v1.z + v2.z) / 3;

    const vx = px - cx;
    const vy = py - cy;
    const vz = CAMERA_HEIGHT - cz;

    return nx * vx + ny * vy + nz * vz > 0;
}

function drawMeshFace(ctx, prop, px, py, verts3d, fill, stroke, lineWidth) {
    const projected = verts3d.map((v) => projectVertex(prop, px, py, v.lx, v.ly, v.z));

    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(projected[0].x, projected[0].y);
    for (let i = 1; i < projected.length; i++) {
        ctx.lineTo(projected[i].x, projected[i].y);
    }
    ctx.closePath();
    ctx.fill();
    if (stroke != null && stroke !== false && lineWidth > 0) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lineWidth;
        ctx.lineJoin = "round";
        ctx.stroke();
    }
}

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
        if (isMeshFaceVisible(prop, px, py, face.verts)) {
            frontFaces.push(face);
        } else {
            backFaces.push(face);
        }
    }

    const drawPass = (faces) => {
        const sorted = [...faces].sort((a, b) => a.depth - b.depth);
        for (const face of sorted) {
            const fill = panelColors[face.panel % panelColors.length];
            drawMeshFace(ctx, prop, px, py, face.verts, fill, stroke, lineWidth);
        }
    };

    drawPass(backFaces);
    drawPass(frontFaces);
}

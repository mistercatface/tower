import { resolveBodyRadius } from "../../Physics/physicsDefaults.js";
import { IDENTITY_ROLL_QUAT } from "../../Props/rollingMotion.js";
import { buildSphereMesh } from "./sphereMesh.js";
import { drawPropMeshFace, isPropMeshFaceVisible } from "./propMesh.js";
const DEFAULT_PANEL_COLORS = ["#F44336", "#FFEB3B", "#2196F3", "#4CAF50", "#FF9800", "#FFFFFF"];
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} prop
 * @param {number} px
 * @param {number} py
 * @param {{
 *   baseRadius?: number,
 *   panelCount?: number,
 *   latBands?: number,
 *   panelColors?: string[],
 *   getFaceColor?: (face: object) => string,
 *   stroke?: string | null | false,
 *   lineWidth?: number,
 * }} [options]
 */
export function drawSphere(ctx, prop, viewport, options = {}) {
    const radius = options.baseRadius ?? resolveBodyRadius(prop);
    const panelCount = Math.max(3, options.panelCount ?? 6);
    const latBands = Math.max(3, options.latBands ?? 5);
    const lonBands = panelCount;
    const panelColors = options.panelColors ?? DEFAULT_PANEL_COLORS;
    const getFaceColor = options.getFaceColor;
    const stroke = "stroke" in options ? options.stroke : "#2a2a2a";
    const lineWidth = options.lineWidth ?? 1.2;
    const rollQuat = prop.rollQuat ?? IDENTITY_ROLL_QUAT;
    const mesh = buildSphereMesh(radius, latBands, lonBands, rollQuat);
    const backFaces = [];
    const frontFaces = [];
    for (const face of mesh)
        if (isPropMeshFaceVisible(prop, viewport, face.verts)) frontFaces.push(face);
        else backFaces.push(face);
    const drawPass = (faces) => {
        const sorted = [...faces].sort((a, b) => a.depth - b.depth);
        for (const face of sorted) {
            const fill = getFaceColor ? getFaceColor(face) : panelColors[face.panel % panelColors.length];
            drawPropMeshFace(ctx, prop, viewport, face.verts, fill, stroke, lineWidth);
        }
    };
    drawPass(backFaces);
    drawPass(frontFaces);
}

import { vec3 } from "../../Math/Vec3.js";
import { pushQuad } from "./MeshBuilder.js";
/**
 * Build an axis-aligned box mesh centered on the origin (Y-up).
 * @param {{ x: number, y: number, z: number }} halfExtents
 */
export function buildBoxMesh({ halfExtents, sideMaterial = "side", topMaterial = "top", bottomMaterial = "bottom", materials = {} } = {}) {
    const hx = halfExtents?.x ?? 0.5;
    const hy = halfExtents?.y ?? 0.5;
    const hz = halfExtents?.z ?? 0.5;
    const triangles = [];
    pushQuad(triangles, vec3(hx, -hy, hz), vec3(hx, -hy, -hz), vec3(hx, hy, -hz), vec3(hx, hy, hz), sideMaterial);
    pushQuad(triangles, vec3(-hx, -hy, -hz), vec3(-hx, -hy, hz), vec3(-hx, hy, hz), vec3(-hx, hy, -hz), sideMaterial);
    pushQuad(triangles, vec3(-hx, -hy, hz), vec3(hx, -hy, hz), vec3(hx, hy, hz), vec3(-hx, hy, hz), sideMaterial);
    pushQuad(triangles, vec3(hx, -hy, -hz), vec3(-hx, -hy, -hz), vec3(-hx, hy, -hz), vec3(hx, hy, -hz), sideMaterial);
    pushQuad(triangles, vec3(-hx, hy, -hz), vec3(-hx, hy, hz), vec3(hx, hy, hz), vec3(hx, hy, -hz), topMaterial);
    pushQuad(triangles, vec3(-hx, -hy, hz), vec3(-hx, -hy, -hz), vec3(hx, -hy, -hz), vec3(hx, -hy, hz), bottomMaterial);
    return {
        triangles,
        materials: {
            side: { type: "solid", color: "#8D6E63", stroke: null, lineWidth: 0 },
            top: { type: "solid", color: "#A1887F", stroke: null, lineWidth: 0 },
            bottom: { type: "solid", color: "#5D4037", stroke: null, lineWidth: 0 },
            ...materials,
        },
    };
}

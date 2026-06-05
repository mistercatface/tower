import { vec3 } from "../../Math/Vec3.js";
import { pushQuad, pushTriangle } from "./MeshBuilder.js";
import { bodyRadiusAtY, cylinderPoint } from "./CylinderPrimitives.js";

function addCylinderSide(triangles, {
    y0,
    y1,
    r0,
    r1,
    a0,
    a1,
    material,
}) {
    const p00 = cylinderPoint(y0, a0, r0);
    const p01 = cylinderPoint(y0, a1, r1 ?? r0);
    const p10 = cylinderPoint(y1, a0, r0);
    const p11 = cylinderPoint(y1, a1, r1 ?? r0);
    pushQuad(triangles, p10, p11, p01, p00, material);
}

function addCap(triangles, y, radius, segments, material, topCap) {
    const center = vec3(0, y, 0);
    for (let i = 0; i < segments; i++) {
        const a0 = (i / segments) * Math.PI * 2;
        const a1 = ((i + 1) / segments) * Math.PI * 2;
        const p0 = cylinderPoint(y, a0, radius);
        const p1 = cylinderPoint(y, a1, radius);
        if (topCap) {
            pushTriangle(triangles, center, p1, p0, material);
        } else {
            pushTriangle(triangles, center, p0, p1, material);
        }
    }
}

/** Build a cylinder mesh in model space (Y-up, centered on origin). */
export function buildCylinderMesh(options = {}) {
    const halfHeight = options.halfHeight ?? 1;
    const bodyRadius = options.bodyRadius ?? 0.5;
    const segments = options.radialSegments ?? 36;
    const bodyMaterial = options.bodyMaterial ?? "body";
    const capMaterial = options.capMaterial ?? "cap";

    const yBottom = -halfHeight;
    const yTop = halfHeight;
    const triangles = [];
    const materials = { ...(options.materials ?? {}) };
    if (options.sides !== false) {
        for (let i = 0; i < segments; i++) {
            const a0 = (i / segments) * Math.PI * 2;
            const a1 = ((i + 1) / segments) * Math.PI * 2;

            addCylinderSide(triangles, {
                y0: yBottom,
                y1: yTop,
                r0: bodyRadiusAtY(yBottom, halfHeight, bodyRadius, options.rings),
                r1: bodyRadiusAtY(yTop, halfHeight, bodyRadius, options.rings),
                a0,
                a1,
                material: bodyMaterial,
            });
        }
    }

    if (options.topCap !== false) {
        const capR = bodyRadiusAtY(yTop, halfHeight, bodyRadius, options.rings);
        addCap(triangles, yTop + 0.001, capR, segments, capMaterial, true);
    }

    if (options.bottomCap !== false) {
        const capR = bodyRadiusAtY(yBottom, halfHeight, bodyRadius, options.rings);
        addCap(triangles, yBottom - 0.001, capR, segments, capMaterial, false);
    }

    return { triangles, materials };
}

export function getSodaCanRings(halfHeight, bodyRadius, lipRadius = bodyRadius * 1.07) {
    const bodyTop = halfHeight * 0.9;
    const lipY = halfHeight * 0.97;
    return [
        { y: -halfHeight, radius: bodyRadius * 1.03 },
        { y: bodyTop, radius: bodyRadius },
        { y: lipY, radius: lipRadius },
        { y: halfHeight, radius: lipRadius },
    ];
}

/** Soda-can profile with lip ring. Label is drawn separately in inspect view. */
export function buildSodaCanMesh({
    halfHeight = 1.05,
    bodyRadius = 0.5,
    lipRadius = 0.535,
    radialSegments = 24,
    bodyMaterial = "body",
    capMaterial = "cap",
    materials = {},
    onFire = false,
    sides = true,
} = {}) {
    const rings = getSodaCanRings(halfHeight, bodyRadius, lipRadius);

    const mesh = buildCylinderMesh({
        halfHeight,
        bodyRadius,
        radialSegments,
        bodyMaterial,
        capMaterial: "cap",
        topCap: false,
        bottomCap: true,
        sides,
        rings,
        materials: {
            body: { type: "solid", color: onFire ? "#8A3020" : "#B4BAC2", stroke: null, lineWidth: 0 },
            cap: { type: "solid", color: onFire ? "#5A2818" : "#90969E", stroke: null, lineWidth: 0 },
            ...materials,
        },
    });

    addCap(mesh.triangles, halfHeight + 0.002, lipRadius, radialSegments, "lip", true);
    addCap(mesh.triangles, halfHeight + 0.012, bodyRadius * 0.9, radialSegments, capMaterial, true);

    mesh.materials.lip = { type: "solid", color: onFire ? "#6A3020" : "#9AA0A8", stroke: null, lineWidth: 0 };
    mesh.materials.cap = { type: "solid", color: onFire ? "#5A2818" : "#C8CDD4", stroke: null, lineWidth: 0 };

    return mesh;
}

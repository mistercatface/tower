import {
    vec3,
    vec2,
    pushQuad,
    pushTriangle,
} from "./Mesh3D.js";

function bodyRadiusAtY(y, halfHeight, bodyRadius, rings) {
    if (!rings?.length) return bodyRadius;
    const sorted = [...rings].sort((a, b) => a.y - b.y);
    if (y <= sorted[0].y) return sorted[0].radius;
    if (y >= sorted[sorted.length - 1].y) return sorted[sorted.length - 1].radius;
    for (let i = 0; i < sorted.length - 1; i++) {
        const lo = sorted[i];
        const hi = sorted[i + 1];
        if (y >= lo.y && y <= hi.y) {
            const t = (y - lo.y) / (hi.y - lo.y);
            return lo.radius + (hi.radius - lo.radius) * t;
        }
    }
    return bodyRadius;
}

function cylinderPoint(y, angle, radius) {
    return vec3(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
}

function angleInRange(angle, center, halfSpan) {
    let d = angle - center;
    while (d <= -Math.PI) d += Math.PI * 2;
    while (d > Math.PI) d -= Math.PI * 2;
    return Math.abs(d) <= halfSpan;
}

function labelU(angle, center, halfSpan) {
    let d = angle - center;
    while (d <= -Math.PI) d += Math.PI * 2;
    while (d > Math.PI) d -= Math.PI * 2;
    return (d + halfSpan) / (halfSpan * 2);
}

function addCylinderSide(triangles, {
    y0,
    y1,
    r0,
    r1,
    a0,
    a1,
    material,
    uvMode = "none",
    label = null,
}) {
    const p00 = cylinderPoint(y0, a0, r0);
    const p01 = cylinderPoint(y0, a1, r1 ?? r0);
    const p10 = cylinderPoint(y1, a0, r0);
    const p11 = cylinderPoint(y1, a1, r1 ?? r0);

    if (uvMode === "label" && label) {
        const u0 = labelU(a0, label.angleCenter, label.angleSpan * 0.5);
        const u1 = labelU(a1, label.angleCenter, label.angleSpan * 0.5);
        pushQuad(triangles, p10, p11, p01, p00, material, {
            uvA: vec2(u0, 0),
            uvB: vec2(u1, 0),
            uvC: vec2(u1, 1),
            uvD: vec2(u0, 1),
        });
        return;
    }

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
    const labels = options.labels ?? [];

    const yBottom = -halfHeight;
    const yTop = halfHeight;
    const triangles = [];
    const materials = { ...(options.materials ?? {}) };

    for (let i = 0; i < segments; i++) {
        const a0 = (i / segments) * Math.PI * 2;
        const a1 = ((i + 1) / segments) * Math.PI * 2;
        const midA = (a0 + a1) / 2;

        let label = null;
        for (const entry of labels) {
            const y0 = yBottom + (yTop - yBottom) * entry.y0;
            const y1 = yBottom + (yTop - yBottom) * entry.y1;
            const halfSpan = entry.angleSpan * 0.5;
            if (angleInRange(midA, entry.angleCenter, halfSpan)) {
                label = { ...entry, y0, y1, halfSpan };
                break;
            }
        }

        const rBot = bodyRadiusAtY(yBottom, halfHeight, bodyRadius, options.rings);
        const rTop = bodyRadiusAtY(yTop, halfHeight, bodyRadius, options.rings);

        if (label) {
            addCylinderSide(triangles, {
                y0: label.y0,
                y1: label.y1,
                r0: bodyRadiusAtY(label.y0, halfHeight, bodyRadius, options.rings),
                r1: bodyRadiusAtY(label.y1, halfHeight, bodyRadius, options.rings),
                a0,
                a1,
                material: label.materialId,
                uvMode: "label",
                label,
            });

            if (label.y0 > yBottom) {
                addCylinderSide(triangles, {
                    y0: yBottom,
                    y1: label.y0,
                    r0: rBot,
                    r1: bodyRadiusAtY(label.y0, halfHeight, bodyRadius, options.rings),
                    a0,
                    a1,
                    material: bodyMaterial,
                });
            }
            if (label.y1 < yTop) {
                addCylinderSide(triangles, {
                    y0: label.y1,
                    y1: yTop,
                    r0: bodyRadiusAtY(label.y1, halfHeight, bodyRadius, options.rings),
                    r1: rTop,
                    a0,
                    a1,
                    material: bodyMaterial,
                });
            }
        } else {
            addCylinderSide(triangles, {
                y0: yBottom,
                y1: yTop,
                r0: rBot,
                r1: rTop,
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

/** Soda-can profile with lip ring and cylindrical label band. */
export function buildSodaCanMesh({
    halfHeight = 1.05,
    bodyRadius = 0.5,
    lipRadius = 0.535,
    radialSegments = 36,
    labelMaterial = "label",
    bodyMaterial = "body",
    capMaterial = "cap",
    materials = {},
    label = {
        y0: 0.22,
        y1: 0.78,
        angleCenter: -Math.PI / 2,
        angleSpan: Math.PI * 1.15,
    },
    onFire = false,
} = {}) {
    const bodyTop = halfHeight * 0.9;
    const lipY = halfHeight * 0.97;

    const mesh = buildCylinderMesh({
        halfHeight,
        bodyRadius,
        radialSegments,
        bodyMaterial,
        capMaterial: "cap",
        topCap: false,
        bottomCap: true,
        rings: [
            { y: -halfHeight, radius: bodyRadius * 1.03 },
            { y: bodyTop, radius: bodyRadius },
            { y: lipY, radius: lipRadius },
            { y: halfHeight, radius: lipRadius },
        ],
        labels: label ? [{
            materialId: labelMaterial,
            y0: label.y0,
            y1: label.y1,
            angleCenter: label.angleCenter,
            angleSpan: label.angleSpan,
        }] : [],
        materials: {
            body: { type: "solid", color: onFire ? "#8A3020" : "#B4BAC2" },
            cap: { type: "solid", color: onFire ? "#5A2818" : "#90969E" },
            [labelMaterial]: { type: "texture", source: labelMaterial },
            ...materials,
        },
    });

    addCap(mesh.triangles, halfHeight + 0.002, lipRadius, radialSegments, "lip", true);
    addCap(mesh.triangles, halfHeight + 0.012, bodyRadius * 0.9, radialSegments, capMaterial, true);

    mesh.materials.lip = { type: "solid", color: onFire ? "#6A3020" : "#9AA0A8" };
    mesh.materials.cap = { type: "solid", color: onFire ? "#5A2818" : "#C8CDD4" };

    return mesh;
}

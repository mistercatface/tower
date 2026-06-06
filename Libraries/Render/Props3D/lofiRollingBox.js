import { drawPropMeshFace, isPropMeshFaceVisible } from "./propMesh.js";

/**
 * End-over-end tumble about local long axis (X), pivot at cross-section center.
 */
function rotateLocalX(lx, ly, lz, angle, centerZ) {
    const y = ly;
    const z = lz - centerZ;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
        lx,
        ly: y * cos - z * sin,
        z: y * sin + z * cos + centerZ,
    };
}

/**
 * Tumble in local space first, then yaw to world facing (spin).
 */
function transformLogVertex(lx, ly, lz, facing, height, rollAngle) {
    const rolled = rotateLocalX(lx, ly, lz, rollAngle, height * 0.5);
    const cos = Math.cos(facing);
    const sin = Math.sin(facing);
    return {
        lx: rolled.lx * cos - rolled.ly * sin,
        ly: rolled.lx * sin + rolled.ly * cos,
        z: rolled.z,
    };
}

/**
 * @param {number} hx half-length along local X
 * @param {number} hy half-width along local Y
 * @param {number} height vertical extent (2″ face when 2×4 lies flat)
 */
function buildLogMesh(hx, hy, height, facing, rollAngle) {
    const local = [
        { lx: -hx, ly: -hy, z: 0 },
        { lx: hx, ly: -hy, z: 0 },
        { lx: hx, ly: hy, z: 0 },
        { lx: -hx, ly: hy, z: 0 },
        { lx: -hx, ly: -hy, z: height },
        { lx: hx, ly: -hy, z: height },
        { lx: hx, ly: hy, z: height },
        { lx: -hx, ly: hy, z: height },
    ];

    const corners = local.map((v) => transformLogVertex(v.lx, v.ly, v.z, facing, height, rollAngle));

    const tri = (i0, i1, i2, panel) => {
        const verts = [corners[i0], corners[i1], corners[i2]];
        return {
            verts,
            panel,
            depth: (verts[0].z + verts[1].z + verts[2].z) / 3,
        };
    };

    const quad = (a, b, c, d, panel) => [
        tri(a, b, c, panel),
        tri(a, c, d, panel),
    ];

    return [
        ...quad(0, 1, 2, 3, "bottom"),
        ...quad(4, 5, 6, 7, "top"),
        ...quad(0, 1, 5, 4, "sideA"),
        ...quad(1, 2, 6, 5, "endB"),
        ...quad(2, 3, 7, 6, "sideB"),
        ...quad(3, 0, 4, 7, "endA"),
    ];
}

/**
 * Low-poly 2×4 log: tumble (rollAngle, local X) + spin (facing), iso projected.
 */
export function drawLoFiRollingBox(ctx, prop, px, py, options) {
    const hx = options.halfExtents.x;
    const hy = options.halfExtents.y;
    const height = options.height;
    const colors = options.colors;
    const stroke = "stroke" in options ? options.stroke : "#3E2723";
    const lineWidth = options.lineWidth ?? 1.0;
    const facing = prop.facing ?? 0;
    const rollAngle = prop.rollAngle ?? 0;

    const panelFill = {
        bottom: colors.bottom,
        top: colors.top,
        sideA: colors.side,
        sideB: colors.sideAlt ?? colors.side,
        endA: colors.end,
        endB: colors.endAlt ?? colors.end,
    };

    const mesh = buildLogMesh(hx, hy, height, facing, rollAngle);

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
            const fill = panelFill[face.panel] ?? colors.side;
            drawPropMeshFace(ctx, prop, px, py, face.verts, fill, stroke, lineWidth);
        }
    };

    drawPass(backFaces);
    drawPass(frontFaces);
}

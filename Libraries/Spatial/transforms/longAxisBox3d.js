/**
 * Shared long-axis box transform — log (flat), tipped barrel (stand→fall), any hx×hy×height box.
 * Local: base z=0, +Z = height, halfExtents hx (local X), hy (local Y).
 * rollAngle: rotation about local X through center (0 = local +Z up).
 * facing: world yaw after tumble.
 */

/** @typedef {{ lx: number, ly: number, z: number }} Vec3 */

/**
 * @param {number} lx
 * @param {number} ly
 * @param {number} lz
 * @param {number} angle
 * @param {number} centerZ
 */
export function rotateLocalX(lx, ly, lz, angle, centerZ) {
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
 * @param {number} lx
 * @param {number} ly
 * @param {number} lz
 * @param {number} facing
 * @param {number} height
 * @param {number} rollAngle
 */
export function transformLongAxisVertex(lx, ly, lz, facing, height, rollAngle) {
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
 * @param {number} hx
 * @param {number} hy
 * @param {number} height
 * @param {number} facing
 * @param {number} rollAngle
 */
export function buildLongAxisBoxMesh(hx, hy, height, facing, rollAngle) {
    const corners = buildLongAxisBoxCorners(hx, hy, height, facing, rollAngle);

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

export function buildLongAxisBoxCorners(hx, hy, height, facing, rollAngle) {
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
    return local.map((v) => transformLongAxisVertex(v.lx, v.ly, v.z, facing, height, rollAngle));
}

/**
 * Ground corners and return 2D footprint OBB in entity-local space (facing = SAT angle).
 *
 * @param {number} hx
 * @param {number} hy
 * @param {number} height
 * @param {number} facing
 * @param {number} rollAngle
 */
export function buildLongAxisFootprintObb(hx, hy, height, facing, rollAngle) {
    const corners = buildLongAxisBoxCorners(hx, hy, height, facing, rollAngle);
    const minZ = Math.min(...corners.map((v) => v.z));
    const grounded = corners.map((v) => ({ lx: v.lx, ly: v.ly, z: v.z - minZ }));

    const alongX = Math.cos(facing);
    const alongY = Math.sin(facing);
    const perpX = -alongY;
    const perpY = alongX;

    let minAlong = Infinity;
    let maxAlong = -Infinity;
    let minPerp = Infinity;
    let maxPerp = -Infinity;

    for (const p of grounded) {
        const along = p.lx * alongX + p.ly * alongY;
        const perp = p.lx * perpX + p.ly * perpY;
        minAlong = Math.min(minAlong, along);
        maxAlong = Math.max(maxAlong, along);
        minPerp = Math.min(minPerp, perp);
        maxPerp = Math.max(maxPerp, perp);
    }

    const hxObb = Math.max(0.5, (maxAlong - minAlong) * 0.5);
    const hyObb = Math.max(0.5, (maxPerp - minPerp) * 0.5);
    const centerAlong = (minAlong + maxAlong) * 0.5;
    const centerPerp = (minPerp + maxPerp) * 0.5;

    // Tip-local frame (x along facing) — SAT rotates once by facing. Do NOT pre-mix into world x/y.
    return {
        vertices: [
            { x: centerAlong - hxObb, y: centerPerp - hyObb },
            { x: centerAlong + hxObb, y: centerPerp - hyObb },
            { x: centerAlong + hxObb, y: centerPerp + hyObb },
            { x: centerAlong - hxObb, y: centerPerp + hyObb },
        ],
        halfExtents: { x: hxObb, y: hyObb },
        facing,
        boundingRadius: Math.hypot(hxObb, hyObb) + Math.hypot(centerAlong, centerPerp),
    };
}

/**
 * Fallen stand-tip dimensions — long axis on the ground, same convention as log.
 *
 * @param {object} strategy
 * @param {number} baseR
 */
export function fallenLongAxisDimsFromStrategy(strategy, baseR) {
    const uprightH = strategy.rollHeight ?? strategy.uprightHeight ?? 22;
    return {
        hx: strategy.fallenHalfExtents?.x ?? uprightH * 0.5,
        hy: strategy.fallenHalfExtents?.y ?? baseR,
        height: strategy.fallenRollHeight ?? baseR * 2,
    };
}

/**
 * @param {object} prop
 */
export function longAxisBoxDimsFromProp(prop) {
    const strategy = prop.strategy ?? {};
    const baseR = prop._baseRadius ?? prop.radius ?? 8;

    if (isStandTipFallen(prop)) {
        return fallenLongAxisDimsFromStrategy(strategy, baseR);
    }

    const hx = strategy.halfExtents?.x ?? baseR;
    const hy = strategy.halfExtents?.y ?? baseR;
    const height = strategy.rollHeight ?? strategy.uprightHeight ?? 22;
    return { hx, hy, height };
}

/**
 * Re-map a stand-tip prop to log-equivalent state once it has hit the ground.
 * Tip rollAngle (0 → π/2 about local X) and log tumble rollAngle (about long axis) must not share semantics.
 *
 * @param {object} body
 */
export function convertStandTipToFallenLog(body) {
    const strategy = body.strategy ?? {};
    const baseR = body._baseRadius ?? body.radius ?? 8;
    const { hx, hy } = fallenLongAxisDimsFromStrategy(strategy, baseR);

    body.facing = (body.facing ?? 0) + Math.PI / 2;
    body.rollAngle = 0;
    body.rollOmega = 0;
    body.isFallen = true;
    body.halfExtents = { x: hx, y: hy };
}

/** Max iso stage radius for stand-tip props (upright, tipping, or fallen). */
export function standTipStageRadius(prop) {
    if (isStandTipFallen(prop)) {
        const { hx, hy } = longAxisBoxDimsFromProp(prop);
        return Math.hypot(hx, hy) + 12;
    }
    const r = prop._baseRadius ?? prop.radius ?? 8;
    const h = prop.strategy?.rollHeight ?? prop.strategy?.uprightHeight ?? 22;
    return r + h * 0.42;
}

/**
 * @param {object} prop
 */
export function isStandTipProp(prop) {
    return prop.strategy?.rollAxis === "long" && prop.strategy?.standTip === true;
}

/**
 * @param {object} prop
 */
export function isStandTipTilted(prop) {
    return isStandTipProp(prop) && (prop.rollAngle ?? 0) >= 0.06;
}

/**
 * @param {object} prop
 */
export function isStandTipFallen(prop) {
    return isStandTipProp(prop) && prop.isFallen === true;
}


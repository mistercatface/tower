import { transformRollVertex } from "../../Props/rollingMotion.js";

/**
 * Build lat/long sphere mesh resting on the ground, then apply roll orientation.
 * Each face carries normalized UV bounds for texture mapping.
 *
 * @param {number} radius
 * @param {number} latBands
 * @param {number} lonBands
 * @param {{ w: number, x: number, y: number, z: number }} rollQuat
 */
export function buildSphereMesh(radius, latBands, lonBands, rollQuat) {
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
        const lat0 = lat / latBands;
        const lat1 = (lat + 1) / latBands;

        if (northPole) {
            const apex = rowA[0];
            for (let lon = 0; lon < lonBands; lon++) {
                const ln = (lon + 1) % lonBands;
                faces.push({
                    verts: [apex, rowB[ln], rowB[lon]],
                    panel: lon,
                    lat0,
                    lat1,
                    lon0: lon / lonBands,
                    lon1: (lon + 1) / lonBands,
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
                    lat0,
                    lat1,
                    lon0: lon / lonBands,
                    lon1: (lon + 1) / lonBands,
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
            const lon0 = lon / lonBands;
            const lon1 = (lon + 1) / lonBands;

            faces.push({
                verts: [v00, v01, v11],
                panel: lon,
                lat0,
                lat1,
                lon0,
                lon1,
                depth: (v00.z + v01.z + v11.z) / 3,
            });
            faces.push({
                verts: [v00, v11, v10],
                panel: lon,
                lat0,
                lat1,
                lon0,
                lon1,
                depth: (v00.z + v11.z + v10.z) / 3,
            });
        }
    }

    return faces;
}

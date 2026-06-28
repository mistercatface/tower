import { polygonCentroid2D, boxLocalFootprint } from "../Math/Poly2D.js";
export const POXEL_TARGET_EDGE = 4;
const SHARED_CENTROID = { cx: 0, cy: 0, signedArea: 0 };
const MAX_FRAC_VERTS = 2048;
const MAX_FRAC_TRIS = 4096;
const FRAC_VERTS = new Float32Array(MAX_FRAC_VERTS * 2);
const FRAC_TRIS = new Uint16Array(MAX_FRAC_TRIS * 3);
function hashV(x, y) {
    return Math.round(x * 10000) + "," + Math.round(y * 10000);
}
function calculateCentroidOfParts(parts) {
    let totalCX = 0;
    let totalCY = 0;
    let totalArea = 0;
    for (let i = 0; i < parts.length; i++) {
        const verts = parts[i].vertices || parts[i];
        const { cx, cy, signedArea } = polygonCentroid2D(verts, SHARED_CENTROID);
        const absArea = Math.abs(signedArea);
        totalCX += cx * absArea;
        totalCY += cy * absArea;
        totalArea += absArea;
    }
    if (totalArea > 0) {
        const invTotalArea = 1 / totalArea;
        SHARED_CENTROID.cx = totalCX * invTotalArea;
        SHARED_CENTROID.cy = totalCY * invTotalArea;
    } else {
        SHARED_CENTROID.cx = 0;
        SHARED_CENTROID.cy = 0;
    }
    SHARED_CENTROID.signedArea = totalArea;
    return SHARED_CENTROID;
}
function getOuterBoundary(parts) {
    const edgeCounts = new Map();
    const vMap = new Map();
    for (let i = 0; i < parts.length; i++) {
        const v = parts[i].vertices;
        const count = v.length / 2;
        let area = 0;
        for (let j = 0; j < count; j++) {
            const ax = v[j * 2];
            const ay = v[j * 2 + 1];
            const nextIdx = ((j + 1) % count) * 2;
            const bx = v[nextIdx];
            const by = v[nextIdx + 1];
            area += ax * by - bx * ay;
        }
        const isCCW = area > 0;
        for (let j = 0; j < count; j++) {
            const idx1 = isCCW ? j : count - 1 - j;
            const idx2 = isCCW ? (j + 1) % count : (count - j) % count;
            const ax = v[idx1 * 2];
            const ay = v[idx1 * 2 + 1];
            const bx = v[idx2 * 2];
            const by = v[idx2 * 2 + 1];
            const ha = hashV(ax, ay);
            const hb = hashV(bx, by);
            if (!vMap.has(ha)) vMap.set(ha, { x: ax, y: ay });
            if (!vMap.has(hb)) vMap.set(hb, { x: bx, y: by });
            const edgeKey = ha + ";" + hb;
            edgeCounts.set(edgeKey, (edgeCounts.get(edgeKey) || 0) + 1);
        }
    }
    const nextMap = new Map();
    for (const edgeKey of edgeCounts.keys()) {
        const [ha, hb] = edgeKey.split(";");
        const revKey = hb + ";" + ha;
        if (!edgeCounts.has(revKey)) {
            if (!nextMap.has(ha)) nextMap.set(ha, []);
            nextMap.get(ha).push(hb);
        }
    }
    const loops = [];
    const visited = new Set();
    for (const startHash of nextMap.keys()) {
        if (visited.has(startHash)) continue;
        const loop = [];
        let currentHash = startHash;
        let safety = 0;
        while (safety++ < 10000) {
            visited.add(currentHash);
            const pt = vMap.get(currentHash);
            loop.push(pt.x, pt.y);
            const nextOpts = nextMap.get(currentHash);
            if (!nextOpts || nextOpts.length === 0) break;
            let nextHash = nextOpts.find((h) => !visited.has(h));
            if (!nextHash) {
                if (nextOpts.includes(startHash)) break;
                nextHash = nextOpts[0];
            }
            if (nextHash === startHash) break;
            currentHash = nextHash;
        }
        loops.push(loop);
    }
    loops.sort((a, b) => b.length - a.length);
    return loops.length > 0 ? loops[0] : parts[0].vertices;
}
function buildPoxelData(visualParts) {
    const poxels = [];
    for (let i = 0; i < visualParts.length; i++) poxels.push({ id: i, vertices: visualParts[i].vertices, neighbors: [] });
    const edgeMap = new Map();
    for (let i = 0; i < poxels.length; i++) {
        const v = poxels[i].vertices;
        const count = v.length / 2;
        for (let j = 0; j < count; j++) {
            const ax = v[j * 2];
            const ay = v[j * 2 + 1];
            const nextIdx = ((j + 1) % count) * 2;
            const bx = v[nextIdx];
            const by = v[nextIdx + 1];
            const h1 = hashV(ax, ay);
            const h2 = hashV(bx, by);
            const edgeKey = h1 < h2 ? h1 + ";" + h2 : h2 + ";" + h1;
            const edge = edgeMap.get(edgeKey);
            if (!edge) edgeMap.set(edgeKey, [i]);
            else edge.push(i);
        }
    }
    for (const indices of edgeMap.values())
        if (indices.length === 2) {
            const a = indices[0];
            const b = indices[1];
            if (!poxels[a].neighbors.includes(b)) poxels[a].neighbors.push(b);
            if (!poxels[b].neighbors.includes(a)) poxels[b].neighbors.push(a);
        }
    return poxels;
}
function triangulatePolygon(vertices) {
    const count = vertices.length / 2;
    if (count <= 3) {
        const res = new Float32Array(vertices.length);
        for (let i = 0; i < vertices.length; i++) res[i] = vertices[i];
        return res;
    }
    let isConvex = true;
    let sign = 0;
    for (let i = 0; i < count; i++) {
        const p0x = vertices[i * 2];
        const p0y = vertices[i * 2 + 1];
        const p1x = vertices[((i + 1) % count) * 2];
        const p1y = vertices[((i + 1) % count) * 2 + 1];
        const p2x = vertices[((i + 2) % count) * 2];
        const p2y = vertices[((i + 2) % count) * 2 + 1];
        const cross = (p1x - p0x) * (p2y - p1y) - (p1y - p0y) * (p2x - p1x);
        if (Math.abs(cross) > 0.0001)
            if (sign === 0) sign = Math.sign(cross);
            else if (Math.sign(cross) !== sign) {
                isConvex = false;
                break;
            }
    }
    if (isConvex) {
        let cx = 0;
        let cy = 0;
        for (let i = 0; i < count; i++) {
            cx += vertices[i * 2];
            cy += vertices[i * 2 + 1];
        }
        cx /= count;
        cy /= count;
        const res = new Float32Array(count * 6);
        for (let i = 0; i < count; i++) {
            const p1x = vertices[i * 2];
            const p1y = vertices[i * 2 + 1];
            const p2x = vertices[((i + 1) % count) * 2];
            const p2y = vertices[((i + 1) % count) * 2 + 1];
            res[i * 6] = p1x;
            res[i * 6 + 1] = p1y;
            res[i * 6 + 2] = p2x;
            res[i * 6 + 3] = p2y;
            res[i * 6 + 4] = cx;
            res[i * 6 + 5] = cy;
        }
        return res;
    }
    const V = [];
    for (let i = 0; i < count; i++) V.push({ x: vertices[i * 2], y: vertices[i * 2 + 1] });
    let changed = true;
    let cleanSafety = 0;
    while (changed && V.length > 3 && cleanSafety++ < 100) {
        changed = false;
        let i = 0;
        while (i < V.length && V.length > 3) {
            const prev = (i - 1 + V.length) % V.length;
            const next = (i + 1) % V.length;
            const dx1 = V[i].x - V[prev].x;
            const dy1 = V[i].y - V[prev].y;
            const dx2 = V[next].x - V[i].x;
            const dy2 = V[next].y - V[i].y;
            const len1 = Math.hypot(dx1, dy1);
            const len2 = Math.hypot(dx2, dy2);
            if (len1 < 0.0001) {
                V.splice(i, 1);
                changed = true;
                continue;
            }
            if (len2 > 0.0001) {
                const cross = (dx1 * dy2 - dy1 * dx2) / (len1 * len2);
                const dot = (dx1 * dx2 + dy1 * dy2) / (len1 * len2);
                if (Math.abs(cross) < 0.005 && dot > 0) {
                    V.splice(i, 1);
                    changed = true;
                    continue;
                }
            }
            i++;
        }
    }
    let area = 0;
    for (let j = 0; j < V.length; j++) {
        const k = (j + 1) % V.length;
        area += V[j].x * V[k].y - V[k].x * V[j].y;
    }
    if (area < 0) V.reverse();
    const flatResult = [];
    let safety = 0;
    while (V.length > 3 && safety++ < 2000) {
        let bestEar = -1;
        let bestScore = -Infinity;
        const len = V.length;
        for (let j = 0; j < len; j++) {
            const prevIdx = (j - 1 + len) % len;
            const nextIdx = (j + 1) % len;
            const A = V[prevIdx];
            const B = V[j];
            const C = V[nextIdx];
            const cross = (B.x - A.x) * (C.y - A.y) - (B.y - A.y) * (C.x - A.x);
            if (cross <= 0.00001) continue;
            let isEar = true;
            for (let k = 0; k < len; k++) {
                if (k === prevIdx || k === j || k === nextIdx) continue;
                const P = V[k];
                if (P.x < Math.min(A.x, B.x, C.x) || P.x > Math.max(A.x, B.x, C.x) || P.y < Math.min(A.y, B.y, C.y) || P.y > Math.max(A.y, B.y, C.y)) continue;
                const c1 = (B.x - A.x) * (P.y - A.y) - (B.y - A.y) * (P.x - A.x);
                const c2 = (C.x - B.x) * (P.y - B.y) - (C.y - B.y) * (P.x - B.x);
                const c3 = (A.x - C.x) * (P.y - C.y) - (A.y - C.y) * (P.x - C.x);
                if (c1 >= -0.0001 && c2 >= -0.0001 && c3 >= -0.0001) {
                    isEar = false;
                    break;
                }
            }
            if (isEar) {
                const cutSq = (A.x - C.x) * (A.x - C.x) + (A.y - C.y) * (A.y - C.y);
                const score = cross / (cutSq * cutSq);
                if (score > bestScore) {
                    bestScore = score;
                    bestEar = j;
                }
            }
        }
        if (bestEar !== -1) {
            const prevIdx = (bestEar - 1 + len) % len;
            const nextIdx = (bestEar + 1) % len;
            flatResult.push(V[prevIdx].x, V[prevIdx].y, V[bestEar].x, V[bestEar].y, V[nextIdx].x, V[nextIdx].y);
            V.splice(bestEar, 1);
        } else {
            let bestI = -1;
            let maxCross = -Infinity;
            for (let j = 0; j < len; j++) {
                const prevIdx = (j - 1 + len) % len;
                const nextIdx = (j + 1) % len;
                const A = V[prevIdx];
                const B = V[j];
                const C = V[nextIdx];
                const cross = (B.x - A.x) * (C.y - A.y) - (B.y - A.y) * (C.x - A.x);
                if (cross > maxCross) {
                    maxCross = cross;
                    bestI = j;
                }
            }
            if (bestI !== -1) {
                const prevIdx = (bestI - 1 + len) % len;
                const nextIdx = (bestI + 1) % len;
                flatResult.push(V[prevIdx].x, V[prevIdx].y, V[bestI].x, V[bestI].y, V[nextIdx].x, V[nextIdx].y);
                V.splice(bestI, 1);
            } else break;
        }
    }
    while (V.length >= 3) {
        flatResult.push(V[0].x, V[0].y, V[1].x, V[1].y, V[2].x, V[2].y);
        V.splice(1, 1);
    }
    const finalRes = new Float32Array(flatResult.length);
    for (let j = 0; j < flatResult.length; j++) finalRes[j] = flatResult[j];
    return finalRes;
}
function generateVisualFractures(baseTriangles, targetEdgeLen = POXEL_TARGET_EDGE) {
    let vCount = 0;
    let tCount = 0;
    function getVertId(x, y) {
        for (let i = 0; i < vCount; i++) if (Math.abs(FRAC_VERTS[i * 2] - x) < 0.0001 && Math.abs(FRAC_VERTS[i * 2 + 1] - y) < 0.0001) return i;
        FRAC_VERTS[vCount * 2] = x;
        FRAC_VERTS[vCount * 2 + 1] = y;
        return vCount++;
    }
    for (let i = 0; i < baseTriangles.length; i += 6) {
        FRAC_TRIS[tCount * 3] = getVertId(baseTriangles[i], baseTriangles[i + 1]);
        FRAC_TRIS[tCount * 3 + 1] = getVertId(baseTriangles[i + 2], baseTriangles[i + 3]);
        FRAC_TRIS[tCount * 3 + 2] = getVertId(baseTriangles[i + 4], baseTriangles[i + 5]);
        tCount++;
    }
    const targetSq = targetEdgeLen * targetEdgeLen;
    let safety = 0;
    while (safety++ < 2000) {
        let worstTri = -1;
        let worstEdgeA = -1;
        let worstEdgeB = -1;
        let worstScore = 0;
        for (let i = 0; i < tCount; i++)
            for (let j = 0; j < 3; j++) {
                const vA = FRAC_TRIS[i * 3 + j];
                const vB = FRAC_TRIS[i * 3 + ((j + 1) % 3)];
                const dx = FRAC_VERTS[vA * 2] - FRAC_VERTS[vB * 2];
                const dy = FRAC_VERTS[vA * 2 + 1] - FRAC_VERTS[vB * 2 + 1];
                const dSq = dx * dx + dy * dy;
                if (dSq > worstScore && dSq > targetSq) {
                    worstScore = dSq;
                    worstTri = i;
                    worstEdgeA = vA;
                    worstEdgeB = vB;
                }
            }
        if (worstTri === -1) break;
        const midX = (FRAC_VERTS[worstEdgeA * 2] + FRAC_VERTS[worstEdgeB * 2]) * 0.5;
        const midY = (FRAC_VERTS[worstEdgeA * 2 + 1] + FRAC_VERTS[worstEdgeB * 2 + 1]) * 0.5;
        FRAC_VERTS[vCount * 2] = midX;
        FRAC_VERTS[vCount * 2 + 1] = midY;
        const midId = vCount++;
        const origTCount = tCount;
        for (let i = 0; i < origTCount; i++) {
            const t0 = FRAC_TRIS[i * 3];
            const t1 = FRAC_TRIS[i * 3 + 1];
            const t2 = FRAC_TRIS[i * 3 + 2];
            const hasA = t0 === worstEdgeA || t1 === worstEdgeA || t2 === worstEdgeA;
            const hasB = t0 === worstEdgeB || t1 === worstEdgeB || t2 === worstEdgeB;
            if (hasA && hasB) {
                const vC = t0 !== worstEdgeA && t0 !== worstEdgeB ? t0 : t1 !== worstEdgeA && t1 !== worstEdgeB ? t1 : t2;
                const isForward = (t0 === worstEdgeA && t1 === worstEdgeB) || (t1 === worstEdgeA && t2 === worstEdgeB) || (t2 === worstEdgeA && t0 === worstEdgeB);
                const vStart = isForward ? worstEdgeA : worstEdgeB;
                const vEnd = isForward ? worstEdgeB : worstEdgeA;
                FRAC_TRIS[i * 3] = vStart;
                FRAC_TRIS[i * 3 + 1] = midId;
                FRAC_TRIS[i * 3 + 2] = vC;
                FRAC_TRIS[tCount * 3] = midId;
                FRAC_TRIS[tCount * 3 + 1] = vEnd;
                FRAC_TRIS[tCount * 3 + 2] = vC;
                tCount++;
            }
        }
    }
    const result = new Array(tCount);
    for (let i = 0; i < tCount; i++) {
        const t0 = FRAC_TRIS[i * 3];
        const t1 = FRAC_TRIS[i * 3 + 1];
        const t2 = FRAC_TRIS[i * 3 + 2];
        result[i] = { vertices: new Float32Array([FRAC_VERTS[t0 * 2], FRAC_VERTS[t0 * 2 + 1], FRAC_VERTS[t1 * 2], FRAC_VERTS[t1 * 2 + 1], FRAC_VERTS[t2 * 2], FRAC_VERTS[t2 * 2 + 1]]) };
    }
    return result;
}
function halfExtentsFromFootprint(footprintVertices) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    const count = footprintVertices.length / 2;
    for (let i = 0; i < count; i++) {
        const vx = footprintVertices[i * 2];
        const vy = footprintVertices[i * 2 + 1];
        if (vx < minX) minX = vx;
        if (vx > maxX) maxX = vx;
        if (vy < minY) minY = vy;
        if (vy > maxY) maxY = vy;
    }
    return { x: (maxX - minX) * 0.5, y: (maxY - minY) * 0.5 };
}
function boundingRadiusFromFootprint(footprintVertices) {
    let maxRadiusSq = 0;
    const count = footprintVertices.length / 2;
    for (let i = 0; i < count; i++) {
        const vx = footprintVertices[i * 2];
        const vy = footprintVertices[i * 2 + 1];
        const distSq = vx * vx + vy * vy;
        if (distSq > maxRadiusSq) maxRadiusSq = distSq;
    }
    return Math.sqrt(maxRadiusSq);
}
function clonePoxels(poxels) {
    return poxels.map((poxel) => {
        const pVerts = new Float32Array(poxel.vertices.length);
        pVerts.set(poxel.vertices);
        return { id: poxel.id, vertices: pVerts, neighbors: [...poxel.neighbors] };
    });
}
function finalizeFootprintGeometry(centeredVerts, visualParts, signedArea, centroid) {
    const poxels = buildPoxelData(visualParts);
    const footprintArea = Math.abs(signedArea);
    const halfExtents = halfExtentsFromFootprint(centeredVerts);
    const boundingRadius = boundingRadiusFromFootprint(centeredVerts);
    return { footprintVertices: centeredVerts, poxels: clonePoxels(poxels), footprintArea, halfExtents, boundingRadius, centroid };
}
export function localBoxOutline(halfX, halfY) {
    return boxLocalFootprint(halfX, halfY);
}
export function bakePoxelOutline(flatVerts, targetEdgeLen = POXEL_TARGET_EDGE) {
    const { cx, cy, signedArea } = polygonCentroid2D(flatVerts, SHARED_CENTROID);
    const count = flatVerts.length / 2;
    const centeredVerts = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
        centeredVerts[i * 2] = flatVerts[i * 2] - cx;
        centeredVerts[i * 2 + 1] = flatVerts[i * 2 + 1] - cy;
    }
    const partsVerts = triangulatePolygon(centeredVerts);
    const visualFractures = generateVisualFractures(partsVerts, targetEdgeLen);
    return finalizeFootprintGeometry(centeredVerts, visualFractures, signedArea, { cx, cy });
}
export function buildGeometryFromPoxelParts(localParts) {
    const { cx, cy } = calculateCentroidOfParts(localParts);
    const opLen = localParts.length;
    const shiftedParts = new Array(opLen);
    for (let i = 0; i < opLen; i++) {
        const p = localParts[i];
        const count = p.vertices.length / 2;
        const shiftedV = new Float32Array(count * 2);
        for (let j = 0; j < count; j++) {
            shiftedV[j * 2] = p.vertices[j * 2] - cx;
            shiftedV[j * 2 + 1] = p.vertices[j * 2 + 1] - cy;
        }
        shiftedParts[i] = { vertices: shiftedV };
    }
    const boundaryPoints = getOuterBoundary(shiftedParts);
    const bpCount = boundaryPoints.length / 2;
    const centeredVerts = new Float32Array(bpCount * 2);
    centeredVerts.set(boundaryPoints);
    const { signedArea } = polygonCentroid2D(centeredVerts, SHARED_CENTROID);
    return finalizeFootprintGeometry(centeredVerts, shiftedParts, signedArea, { cx, cy });
}
export function buildGeometryFromPartsAtOrigin(localParts) {
    const parts = localParts.map((p) => ({ vertices: p.vertices }));
    const boundaryPoints = getOuterBoundary(parts);
    const footprintVertices = new Float32Array(boundaryPoints.length);
    footprintVertices.set(boundaryPoints);
    const { signedArea } = polygonCentroid2D(footprintVertices, SHARED_CENTROID);
    return finalizeFootprintGeometry(footprintVertices, parts, signedArea, { cx: 0, cy: 0 });
}
export function splitPoxels(poxels, localHitX, localHitY, impactForce = 5) {
    if (!poxels || poxels.length <= 1) return [poxels];
    const damageRadius = impactForce * 0.05;
    const damageRadiusSq = damageRadius * damageRadius;
    const chunkProb = Math.max(0.1, 1.0 - impactForce * 0.04);
    let hitIdx = 0;
    let minDistSq = Infinity;
    const hitSet = new Set();
    for (let i = 0; i < poxels.length; i++) {
        const poxel = poxels[i];
        let pcx = 0;
        let pcy = 0;
        const vCount = poxel.vertices.length / 2;
        for (let j = 0; j < vCount; j++) {
            pcx += poxel.vertices[j * 2];
            pcy += poxel.vertices[j * 2 + 1];
        }
        pcx /= vCount;
        pcy /= vCount;
        const distSq = (pcx - localHitX) * (pcx - localHitX) + (pcy - localHitY) * (pcy - localHitY);
        if (distSq < minDistSq) {
            minDistSq = distSq;
            hitIdx = i;
        }
        if (distSq <= damageRadiusSq) hitSet.add(i);
    }
    if (hitSet.size === 0) hitSet.add(hitIdx);
    const visited = new Array(poxels.length).fill(false);
    for (const idx of hitSet) visited[idx] = true;
    const components = [];
    for (let i = 0; i < poxels.length; i++)
        if (!visited[i]) {
            const comp = [];
            const q = [i];
            visited[i] = true;
            let head = 0;
            while (head < q.length) {
                const curr = q[head++];
                comp.push(poxels[curr]);
                for (let j = 0; j < poxels[curr].neighbors.length; j++) {
                    const n = poxels[curr].neighbors[j];
                    if (!visited[n]) {
                        visited[n] = true;
                        q.push(n);
                    }
                }
            }
            components.push(comp);
        }
    const hitVisited = new Set();
    for (const idx of hitSet)
        if (!hitVisited.has(idx)) {
            const chunk = [];
            const q = [idx];
            hitVisited.add(idx);
            let head = 0;
            while (head < q.length) {
                const curr = q[head++];
                chunk.push(poxels[curr]);
                for (let j = 0; j < poxels[curr].neighbors.length; j++) {
                    const n = poxels[curr].neighbors[j];
                    if (hitSet.has(n) && !hitVisited.has(n))
                        if (Math.random() < chunkProb) {
                            hitVisited.add(n);
                            q.push(n);
                        }
                }
            }
            components.push(chunk);
        }
    components.sort((a, b) => b.length - a.length);
    if (components.length === 1) return [poxels];
    return components;
}

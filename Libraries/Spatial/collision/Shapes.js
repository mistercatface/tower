export const SHAPE_TYPE_ID = { Circle: 1, Polygon: 2 };
export class Shape {
    constructor() {
        this.type = "Shape";
        this.shapeTypeId = 0;
    }
    getBoundingRadius() {
        return 0;
    }
}
export class CircleShape extends Shape {
    constructor(radius) {
        super();
        this.type = "Circle";
        this.shapeTypeId = SHAPE_TYPE_ID.Circle;
        this.radius = radius;
    }
    getBoundingRadius() {
        return this.radius;
    }
}
import { polygonSignedArea2D, reversePolygonWinding } from "../../Math/Poly2D.js";
export class PolygonShape extends Shape {
    constructor(vertices) {
        super();
        this.type = "Polygon";
        this.shapeTypeId = SHAPE_TYPE_ID.Polygon;
        let verts = vertices instanceof Float32Array ? vertices : new Float32Array(vertices);
        const count = verts.length / 2;
        if (count >= 3) {
            const clean = [];
            let lastX = NaN;
            let lastY = NaN;
            for (let i = 0; i < count; i++) {
                const x = verts[i * 2];
                const y = verts[i * 2 + 1];
                if (i > 0) {
                    const dx = x - lastX;
                    const dy = y - lastY;
                    if (dx * dx + dy * dy < 1e-8) continue;
                }
                clean.push(x, y);
                lastX = x;
                lastY = y;
            }
            if (clean.length >= 6) {
                const dx = clean[clean.length - 2] - clean[0];
                const dy = clean[clean.length - 1] - clean[1];
                if (dx * dx + dy * dy < 1e-8) {
                    clean.pop();
                    clean.pop();
                }
            }
            if (clean.length !== verts.length) verts = new Float32Array(clean);
        }
        if (polygonSignedArea2D(verts) < 0) verts = reversePolygonWinding(verts);
        this.vertices = verts;
        this.normals = this._computeNormals();
        this.boundingRadius = this._computeBoundingRadius();
    }
    getBoundingRadius() {
        return this.boundingRadius;
    }
    _computeBoundingRadius() {
        let maxSq = 0;
        const count = this.vertices.length;
        for (let i = 0; i < count; i += 2) {
            const x = this.vertices[i];
            const y = this.vertices[i + 1];
            const sq = x * x + y * y;
            if (sq > maxSq) maxSq = sq;
        }
        return Math.sqrt(maxSq);
    }
    _computeNormals() {
        const count = this.vertices.length / 2;
        const normals = new Float32Array(count * 2);
        for (let i = 0; i < count; i++) {
            const p1x = this.vertices[i * 2];
            const p1y = this.vertices[i * 2 + 1];
            const nextIdx = ((i + 1) % count) * 2;
            const p2x = this.vertices[nextIdx];
            const p2y = this.vertices[nextIdx + 1];
            const dx = p2x - p1x;
            const dy = p2y - p1y;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len > 0) {
                normals[i * 2] = -dy / len;
                normals[i * 2 + 1] = dx / len;
            } else {
                normals[i * 2] = 0;
                normals[i * 2 + 1] = 0;
            }
        }
        return normals;
    }
}

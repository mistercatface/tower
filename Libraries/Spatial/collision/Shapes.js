export class Shape {
    constructor() {
        this.type = "Shape";
    }
    getBoundingRadius() {
        return 0;
    }
}
export class CircleShape extends Shape {
    constructor(radius) {
        super();
        this.type = "Circle";
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
        let verts = vertices instanceof Float32Array ? vertices : new Float32Array(vertices);
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

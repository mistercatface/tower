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
export class PolygonShape extends Shape {
    constructor(vertices) {
        super();
        this.type = "Polygon";
        this.vertices = vertices;
        this.normals = this._computeNormals();
        this.boundingRadius = this._computeBoundingRadius();
    }
    getBoundingRadius() {
        return this.boundingRadius;
    }
    _computeBoundingRadius() {
        let maxSq = 0;
        for (let i = 0; i < this.vertices.length; i++) {
            const v = this.vertices[i];
            const sq = v.x * v.x + v.y * v.y;
            if (sq > maxSq) maxSq = sq;
        }
        return Math.sqrt(maxSq);
    }
    _computeNormals() {
        const normals = [];
        for (let i = 0; i < this.vertices.length; i++) {
            const p1 = this.vertices[i];
            const p2 = this.vertices[(i + 1) % this.vertices.length];
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len > 0) normals.push({ x: -dy / len, y: dx / len });
            else normals.push({ x: 0, y: 0 });
        }
        return normals;
    }
}

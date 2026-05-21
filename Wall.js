import { state } from "./GameState.js";

export class Wall {
    constructor(x, y, radius, startAngle, endAngle, size) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.size = size;
        this.alpha = 1;
        this.segments = [];

        const arcLength = radius * Math.abs(endAngle - startAngle);
        const numSegments = Math.max(1, Math.ceil(arcLength / (size * 1.1)));
        const angleStep = (endAngle - startAngle) / numSegments;

        for (let i = 0; i < numSegments; i++) {
            const angle = startAngle + i * angleStep + angleStep / 2;
            this.segments.push(new Segment(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius, angle, size));
        }
    }
}

export class Segment {
    constructor(x, y, angle, size, maxHealth = 30, health = 30, isDead = false) {
        this.x = x;
        this.y = y;
        this.angle = angle;
        this.size = size;
        this.maxHealth = maxHealth;
        this.health = health;
        this.isDead = isDead;
    }
}
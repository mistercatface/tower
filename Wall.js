import { state } from "./GameState.js";

export class Wall {
    constructor(x, y, radius, startAngle, endAngle, size) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.size = size;
        this.alpha = 0;
        this.segments = [];
        
        const arcLength = radius * Math.abs(endAngle - startAngle);
        const numSegments = Math.max(1, Math.ceil(arcLength / (size * 1.1)));
        const angleStep = (endAngle - startAngle) / numSegments;
        
        for (let i = 0; i < numSegments; i++) {
            const angle = startAngle + i * angleStep + angleStep / 2;
            this.segments.push({
                x: x + Math.cos(angle) * radius,
                y: y + Math.sin(angle) * radius,
                angle: angle,
                size: size,
                maxHealth: 30,
                health: 30,
                isDead: false
            });
        }
    }

    update(dt) {
        if (this.alpha < 1) {
            this.alpha = Math.min(1, this.alpha + dt / 1000);
            for (const seg of this.segments) {
                state.dirtySegments.add(seg);
            }
        }
    }
}
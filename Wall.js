export class Segment {
    constructor(x, y, angle, size, padding = 10, maxHealth = 30, health = 30, isDead = false) {
        this.x = x;
        this.y = y;
        this.angle = angle;
        this.size = size;
        this.maxHealth = maxHealth;
        this.health = health;
        this.isDead = isDead;
        this.padding = padding;
    }
}

export function buildArcWall(segmentsArray, x, y, radius, startAngle, endAngle, size) {
    if (radius === 0 && startAngle === 0 && endAngle === 0) return;

    const arcLength = radius * Math.abs(endAngle - startAngle);
    const numSegments = Math.max(1, Math.ceil(arcLength / (size * 1.1)));
    const angleStep = (endAngle - startAngle) / numSegments;

    for (let i = 0; i < numSegments; i++) {
        const angle = startAngle + i * angleStep + angleStep / 2;
        segmentsArray.push(new Segment(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius, angle, size));
    }
}
export class Laser {
    constructor(x1, y1, x2, y2) {
        this.x1 = x1;
        this.y1 = y1;
        this.x2 = x2;
        this.y2 = y2;
    }

    isVisible(viewport) {
        if (!viewport) return true;
        const minX = Math.min(this.x1, this.x2);
        const maxX = Math.max(this.x1, this.x2);
        const minY = Math.min(this.y1, this.y2);
        const maxY = Math.max(this.y1, this.y2);

        const halfW = viewport.cx / viewport.zoom;
        const halfH = viewport.cy / viewport.zoom;

        const vpMinX = viewport.x - halfW;
        const vpMaxX = viewport.x + halfW;
        const vpMinY = viewport.y - halfH;
        const vpMaxY = viewport.y + halfH;

        return (minX <= vpMaxX && maxX >= vpMinX && minY <= vpMaxY && maxY >= vpMinY);
    }

    render(ctx) {
        ctx.beginPath();
        ctx.moveTo(this.x1, this.y1);
        ctx.lineTo(this.x2, this.y2);
        ctx.strokeStyle = "#ff0000";
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.strokeStyle = "#FFFFFF";
        ctx.lineWidth = 1;
        ctx.stroke();
    }
}

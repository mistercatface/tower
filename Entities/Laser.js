export class Laser {
    constructor(x1, y1, x2, y2) {
        this.x1 = x1;
        this.y1 = y1;
        this.x2 = x2;
        this.y2 = y2;
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

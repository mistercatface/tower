export class FloatingText {
    constructor(x, y, text, color) {
        this.x = x;
        this.y = y;
        this.text = text;
        this.color = color;
        this.life = 1.0;
        this.isDead = false;
    }

    update(dt) {
        this.life -= dt / 1000;
        this.y -= 20 * (dt / 1000);
    }

    static spawn(state, x, y, text, color) {
        const offsetX = (Math.random() - 0.5) * 16;
        const offsetY = (Math.random() - 0.5) * 16;
        const ft = new FloatingText(x + offsetX, y + offsetY, text, color);
        state.floatingTexts.push(ft);
        state.scheduler.schedule(1000, () => {
            ft.isDead = true;
        });
    }

    static updateAll(state, dt) {
        for (let i = state.floatingTexts.length - 1; i >= 0; i--) {
            const ft = state.floatingTexts[i];
            ft.update(dt);
            if (ft.isDead) state.floatingTexts.splice(i, 1);
        }
    }
}
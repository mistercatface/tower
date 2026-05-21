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
        if (this.life <= 0) {
            this.isDead = true;
        }
    }

    static spawn(state, x, y, text, color) {
        const offsetX = (Math.random() - 0.5) * 16;
        const offsetY = (Math.random() - 0.5) * 16;
        state.floatingTexts.push(new FloatingText(x + offsetX, y + offsetY, text, color));
    }

    static updateAll(state, dt) {
        for (let i = state.floatingTexts.length - 1; i >= 0; i--) {
            const ft = state.floatingTexts[i];
            ft.update(dt);
            if (ft.isDead) state.floatingTexts.splice(i, 1);
        }
    }
}
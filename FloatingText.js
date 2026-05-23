export class FloatingText {
    constructor(x, y, text, color, timerId) {
        this.x = x;
        this.y = y;
        this.text = text;
        this.color = color;
        this.timerId = timerId;
        this.life = 1.0;
        this.isDead = false;
    }

    update(dt, scheduler) {
        this.y -= 20 * (dt / 1000);
        const remaining = scheduler.getTimeRemaining(this.timerId);
        this.life = remaining / 1000;
        if (remaining <= 0) this.isDead = true;
    }

    static spawn(state, x, y, text, color) {
        const offsetX = (Math.random() - 0.5) * 16;
        const offsetY = (Math.random() - 0.5) * 16;
        const timerId = state.scheduler.schedule(1000);
        const ft = new FloatingText(x + offsetX, y + offsetY, text, color, timerId);
        state.floatingTexts.push(ft);
    }

    static updateAll(state, dt) {
        for (let i = state.floatingTexts.length - 1; i >= 0; i--) {
            const ft = state.floatingTexts[i];
            ft.update(dt, state.scheduler);
            if (ft.isDead) state.floatingTexts.splice(i, 1);
        }
    }
}
export function createBrainArrivalStamper(brain) {
    let lastArrivalCol = null;
    let lastArrivalRow = null;
    return {
        stamp(agent, grid) {
            const col = grid.worldCol(agent.x);
            const row = grid.worldRow(agent.y);
            if (col === lastArrivalCol && row === lastArrivalRow) return;
            lastArrivalCol = col;
            lastArrivalRow = row;
            brain.stampArrival(col, row);
        },
        reset() {
            lastArrivalCol = null;
            lastArrivalRow = null;
        },
    };
}

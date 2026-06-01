function setDefaultViewport(startDimensions = 50) {
    const aspect = elements.canvas.width / elements.canvas.height;
    viewport.width = startDimensions;
    viewport.height = startDimensions / aspect;
    viewport.x = character.x - (viewport.width / 2);
    viewport.y = character.y - (viewport.height / 2);
}

function setViewportZoom(newSize) {
    const MIN_VIEWPORT = 10;
    const MAX_VIEWPORT = GRID_HEIGHT;
    const finalWidth = Math.max(MIN_VIEWPORT, Math.min(MAX_VIEWPORT, newSize));
    if (viewport.width === finalWidth) return;
    const aspect = elements.canvas.width / elements.canvas.height;
    viewport.width = finalWidth;
    viewport.height = finalWidth / aspect;
    const centerGridX = character.renderX;
    const centerGridY = character.renderY;
    let newX = centerGridX - (viewport.width / 2);
    let newY = centerGridY - (viewport.height / 2);
    viewport.x = newX;
    viewport.y = newY;
}

function updateViewport(deltaTime) {
    const centerGridX = character.renderX;
    const centerGridY = character.renderY;
    const targetX = centerGridX - (viewport.width / 2);
    const targetY = centerGridY - (viewport.height / 2);
    const panSpeed = 3.0;
    const lerpFactor = 1 - Math.exp(-panSpeed * deltaTime);
    let newX = viewport.x + (targetX - viewport.x) * lerpFactor;
    let newY = viewport.y + (targetY - viewport.y) * lerpFactor;
    const SNAP_FACTOR = 100;
    viewport.x = Math.round(newX * SNAP_FACTOR) / SNAP_FACTOR;
    viewport.y = Math.round(newY * SNAP_FACTOR) / SNAP_FACTOR;
}
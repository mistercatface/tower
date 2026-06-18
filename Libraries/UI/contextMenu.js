function clampMenuPosition(menu, clientX, clientY) {
    const margin = 8;
    const rect = menu.getBoundingClientRect();
    let x = clientX;
    let y = clientY;
    if (x + rect.width > window.innerWidth - margin) x = window.innerWidth - rect.width - margin;
    if (y + rect.height > window.innerHeight - margin) y = window.innerHeight - rect.height - margin;
    if (x < margin) x = margin;
    if (y < margin) y = margin;
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
}
export function createContextMenu() {
    let menuEl = null;
    let backdropEl = null;
    const close = () => {
        menuEl?.remove();
        backdropEl?.remove();
        menuEl = null;
        backdropEl = null;
    };
    const open = (clientX, clientY, items) => {
        close();
        if (items.length === 0) return;
        backdropEl = document.createElement("div");
        backdropEl.className = "ui-context-menu-backdrop";
        backdropEl.addEventListener("pointerdown", close);
        backdropEl.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            close();
        });
        menuEl = document.createElement("div");
        menuEl.className = "ui-context-menu";
        menuEl.style.left = `${clientX}px`;
        menuEl.style.top = `${clientY}px`;
        menuEl.addEventListener("pointerdown", (e) => e.stopPropagation());
        menuEl.addEventListener("contextmenu", (e) => e.preventDefault());
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "ui-context-menu-item";
            btn.textContent = item.label;
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                item.onClick();
                close();
            });
            menuEl.appendChild(btn);
        }
        document.body.append(backdropEl, menuEl);
        clampMenuPosition(menuEl, clientX, clientY);
    };
    return { open, close, isOpen: () => menuEl != null };
}

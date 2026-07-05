export class TestElement {
    constructor(tagName) {
        this.tagName = String(tagName).toUpperCase();
        this.children = [];
        this.className = "";
        this.style = {};
        this.textContent = "";
        this.hidden = false;
        this.type = "";
        this.value = "";
        this.checked = false;
        this.title = "";
        this.name = "";
        this.autocomplete = "";
        this.spellcheck = false;
    }
    appendChild(child) {
        this.children.push(child);
        return child;
    }
    append(...nodes) {
        for (const node of nodes) this.appendChild(node);
    }
    addEventListener() {}
    replaceChildren() {
        this.children.length = 0;
    }
    setAttribute() {}
    contains() {
        return false;
    }
    removeChild(child) {
        const index = this.children.indexOf(child);
        if (index >= 0) this.children.splice(index, 1);
    }
}

export function installTestDocument() {
    if (globalThis.document?.createElement?.("div") instanceof TestElement) return;
    globalThis.document = {
        createElement(tag) {
            return new TestElement(tag);
        },
        createTextNode(text) {
            const node = new TestElement("#text");
            node.textContent = text;
            return node;
        },
    };
}

export function mockPanelBody() {
    return new TestElement("div");
}

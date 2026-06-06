export class Component {
    constructor(tagName = "div", className = "") {
        this.element = document.createElement(tagName);
        if (className) this.element.className = className;
        this.children = [];
    }
    appendChild(child) {
        if (child instanceof Component) {
            this.children.push(child);
            this.element.appendChild(child.element);
        } else if (child instanceof Node) this.element.appendChild(child);
    }
    removeChild(child) {
        const index = this.children.indexOf(child);
        if (index > -1) {
            this.children.splice(index, 1);
            this.element.removeChild(child.element);
        } else if (child instanceof Node && this.element.contains(child)) this.element.removeChild(child);
    }
    clear() {
        this.children = [];
        this.element.innerHTML = "";
    }
    on(eventName, handler) {
        this.element.addEventListener(eventName, handler);
    }
}

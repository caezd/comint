export const ensureStyle = (() => {
    const loaded = new Set();
    return (id, cssText) => {
        if (loaded.has(id)) return;
        const s = document.createElement("style");
        s.dataset.id = id;
        s.textContent = cssText;
        document.head.appendChild(s);
        loaded.add(id);
    };
})();

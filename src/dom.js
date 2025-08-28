export const qs = (root, sel) => root.querySelector(sel);
export const qsa = (root, sel) => Array.from(root.querySelectorAll(sel));

export function parsePostId(el) {
    const idAttr = el.getAttribute("id") || "";
    const m = idAttr.match(/^p?(\d+)$/);
    return m ? Number(m[1]) : null;
}

export function ensureCSSFor(selector) {
    for (const sheet of Array.from(document.styleSheets)) {
        try {
            const rules = sheet.cssRules;
            if (!rules) continue;
            for (const r of Array.from(rules)) {
                if (r.selectorText === selector) return true;
            }
        } catch {
            /* cross-origin */
        }
    }
    return false;
}

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

function normalizeQuote(raw) {
    return String(raw)
        .replace(/\u00a0/g, " ") // nbsp → espace
        .replace(/\s+\n/g, "\n") // espaces avant saut de ligne
        .replace(/\n\s+/g, "\n") // espaces après saut de ligne
        .replace(/[ \t]+/g, " ") // espaces consécutifs
        .replace(/\n{3,}/g, "\n\n") // pas plus de deux \n de suite
        .trim();
}

export function getSelectionIn(container) {
    const sel = window.getSelection?.();
    if (!sel || sel.isCollapsed) return "";

    // 1) chemin le plus robuste : toString()
    if (
        container.contains(sel.anchorNode) ||
        container.contains(sel.focusNode)
    ) {
        const s = normalizeQuote(sel.toString());
        if (s) return s;
    }

    // 2) fallback (rare): reconstruire via cloneContents() + TreeWalker
    try {
        const range = sel.getRangeAt(0);
        if (!container.contains(range.commonAncestorContainer)) return "";
        const frag = range.cloneContents();
        const walker = document.createTreeWalker(
            frag,
            NodeFilter.SHOW_TEXT,
            null
        );
        let out = "";
        let node;
        while ((node = walker.nextNode())) {
            const t = node.nodeValue.replace(/\s+/g, " ").trim();
            if (!t) continue;
            // ajoute un espace si nécessaire entre 2 textes consécutifs
            if (out && !out.endsWith(" ")) out += " ";
            out += t;
        }
        return normalizeQuote(out);
    } catch {
        return "";
    }
}

// overlay-view.js
import { ensureCSSFor } from "./dom.js";
import { ensureStyle } from "./css-once.js";

ensureStyle(
    "commint-animations",
    `
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        @keyframes slideFromBottom { from{ transform: translate3d(0, var(--initial-transform, 100%), 0);} to{ transform: translate3d(0,0,0);} }
        @keyframes slideToBottom { from{ transform: translate3d(0,0,0);} to{ transform: translate3d(0, var(--initial-transform, 100%), 0);} }
        .buttons {background: var(--neutralDark);padding: 1px 8px!important;margin-right: 5px;border-radius: 5px;}
    `
);

export class OverlayView {
    constructor(cfg) {
        this.cfg = cfg;
    }

    open({ title, preset }) {
        const d = document.createElement("dialog");
        d.className = "commint-dialog";
        d.setAttribute("closedby", "any");
        if (!ensureCSSFor(".commint-dialog")) {
            ensureStyle(
                "commint-overlay",
                `.commint-dialog{ inset:auto; max-width:none; padding:20px; border:0; position:fixed; bottom:0; width:100%; display:flex; background:#fff; z-index:9999; will-change:transform; }
                .commint-dialog[open]{ animation:.5s cubic-bezier(0.32,0.72,0,1) slideFromBottom forwards; }
                .commint-dialog::backdrop{ background:#0008; animation:.5s cubic-bezier(0.32,0.72,0,1) fadeIn forwards; }
                .commint-form{ display:flex; gap:6px; flex-direction:column; max-width: var(--container, 940px); width:100%; margin:auto; }
                `
            );
        }

        const html = potion("commint-dialog", {
            title,
            reactions: this.cfg.reactions,
            quoted: Boolean(preset),
            preset,
        });
        d.innerHTML = html;

        const form = d.querySelector("#commit");
        if (!form)
            console.warn("Form #commit introuvable. HTML rendu:", d.innerHTML);

        document.body.appendChild(d);
        d.showModal();

        d.addEventListener("click", (e) => {
            if (e.target === d) d.close("backdrop");
        });
        d.addEventListener("cancel", (e) => {
            e.preventDefault();
            d.close("esc");
        });
        d.addEventListener("close", () => d.remove(), { once: true });
        return { dialog: d, form };
    }
}

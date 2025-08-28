// commint.js
import { normalizeConfig } from "./config.js";
import { T } from "./i18n.js";
import { qs, qsa, parsePostId, getSelectionText } from "./dom.js";
import { CommentService } from "./service.js";
import { OverlayView } from "./overlay-view.js";

export default class Commint {
    constructor(options) {
        if (!window.Moderactor)
            throw new Error("Commint requires Moderactor first.");
        if (!window.potion) throw new Error("Commint requires Potion first.");
        this.cfg = normalizeConfig(options);
        this.env = null;
        this.service = null;
        this.overlay = new OverlayView(this.cfg);
        this.currentPostCtx = null;
        this.init();
    }

    async init() {
        const t0 = performance.now();
        this.env = await Moderactor.env();
        if (this.env.page.type !== "topic" || !this.env.user?.is_logged) return;

        // Langue
        T.setLang(this.cfg.lang || this.env.user.lang || "fr");

        // Vérifie forum autorisé via breadcrumbs
        const isAllowed = this.cfg.allowed_forums.some((id) =>
            this.env.schema.breadcrumbs.items.some((it) =>
                it.url.includes(`/f${id}`)
            )
        );
        if (!isAllowed) return;

        this.service = new CommentService({ cfg: this.cfg, env: this.env });

        // Prépare chaque post
        const posts = qsa(document, `.${this.cfg.post_class}`);
        posts.map((post) => this.processPost(post));

        if (this.cfg.debug)
            console.warn(
                `${Math.round(performance.now() - t0)}ms to init Commint`
            );
    }

    async processPost(post) {
        const postId = parsePostId(post);
        if (!postId) return;

        const topicInfo =
            this.cfg.mode === "per_post"
                ? await this.service.ensureFor(postId)
                : await this.service.ensureFor(this.cfg.single_topic_id);

        if (!topicInfo) {
            if (this.cfg.debug) console.log("No comment topic for post:", post);
            return;
        }

        this.addButton({ post, commentTopic: topicInfo });
    }

    addButton({ post, commentTopic }) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = this.cfg.button_class;
        btn.dataset.count =
            commentTopic.count > 0 ? String(commentTopic.count) : "";
        btn.textContent = T("comment_button");

        // capture de sélection avant le blur
        btn.addEventListener("mousedown", () => {
            const quoted = getSelectionText(post);
            btn.dataset.quoted = quoted || "";
        });

        btn.addEventListener(
            "click",
            this.onButtonClick({ post, commentTopic, btn })
        );

        const host = qs(post, this.cfg.button_append);
        if (host) host.appendChild(btn);
    }

    onButtonClick({ post, commentTopic, btn }) {
        const quoted = btn.dataset.quoted || "";
        const authorEl = qs(
            post,
            ".postprofile a[href^='/u'], .author a[href^='/u'], a[href^='/u']"
        );
        const author = authorEl ? authorEl.textContent.trim() : null;

        this.currentPostCtx = {
            author,
            permalink: location.href,
            id,
            post,
            commentTopic,
            quoted,
            btn,
        };

        if (!this.cfg.use_overlay) {
            const tId =
                this.cfg.mode === "single_topic"
                    ? this.cfg.single_topic_id
                    : commentTopic.id;
            location.href = `/post?mode=reply&t=${tId}`;
            return;
        }

        const { dialog, form } = this.overlay.open({
            title: T("overlay_title"),
            preset: quoted,
        });

        form.addEventListener("submit", (e) => this.onSubmit(e, dialog));
    }

    onSubmit(e, dialog) {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const body = fd.get("body") || "";
        const reactions = fd.getAll("reactions[]");

        const { id, permalink, quoted, author, commentTopic } =
            this.currentPostCtx;
        const message = this.cfg.build_payload({
            permalink,
            id,
            body,
            quote: quoted,
            op: author,
        });

        if (this.cfg.debug)
            console.log({ body, quoted, reactions, message, commentTopic });

        // → ici : appel réel à Moderactor pour poster la réponse dans commentTopic.id
        // await Moderactor.topic(commentTopic.id).reply({ message });

        dialog.close(); // laisse Potion gérer l’UX “toast” si tu veux
    }
}

// commint.js
import { normalizeConfig } from "./config.js";
import { T } from "./i18n.js";
import { qs, qsa, parsePostId, getSelectionIn } from "./dom.js";
import { Service } from "./service.js";
import { OverlayView } from "./overlay-view.js";
import "./style.css";

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
        this._lastQuoteByPost = new WeakMap();
        this.init();
    }

    installSelectionTracker(post) {
        const grab = () => {
            const txt = getSelectionIn(post);
            if (txt) this._lastQuoteByPost.set(post, txt);
        };

        post.addEventListener("mouseup", grab);
        post.addEventListener("keyup", (e) => {
            if (e.key?.startsWith("Arrow") || e.key === "Shift") grab();
        });

        document.addEventListener("selectionchange", () => {
            // on ne mémorise que si la sélection est dans ce post
            const sel = window.getSelection?.();
            if (!sel || sel.isCollapsed) return;
            const range = sel.getRangeAt(0);
            if (!post.contains(range.commonAncestorContainer)) return;
            grab();
        });
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

        this.service = new Service({ cfg: this.cfg, env: this.env });

        if (this.cfg.mode === "single_topic") {
            const topicInfo = await this.service.ensureFor(
                this.cfg.single_topic_id
            );
            if (!topicInfo) return;

            // tracker de sélection sur tout le conteneur topic (ou le document)
            const topicContainer =
                document.querySelector(".container") || document.body;
            this.installSelectionTracker(topicContainer);

            this.addGlobalButton({
                container: topicContainer,
                commentTopic: topicInfo,
            });
            if (this.cfg.debug)
                console.warn(
                    `${Math.round(
                        performance.now() - t0
                    )}ms to init Commint (single_topic)`
                );
            return;
        }

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

        this.installSelectionTracker(post);
        this.addButton({ post, commentTopic: topicInfo });
    }

    addGlobalButton({ container, commentTopic }) {
        if (this._globalBtn) return; // déja posé
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = this.cfg.button_class;
        btn.textContent = T("comment_global_button");

        btn.addEventListener("click", () =>
            this.onGlobalButtonClick({ container, commentTopic, btn })
        );

        const host =
            document.querySelector(this.cfg.global_button_append || "") ||
            document.querySelector(".links_bar") ||
            container;
        this.addButtonToDom(host, btn);
    }

    addButtonToDom(host, btn) {
        if (host) {
            if (this.cfg.button_position === "prepend") {
                host.prepend(btn);
            } else {
                host.appendChild(btn);
            }
        }
    }

    addButton({ post, commentTopic }) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = this.cfg.button_class;
        btn.dataset.count =
            commentTopic.count > 0 ? String(commentTopic.count) : "";
        btn.textContent = T("comment_button");

        btn.addEventListener("click", () =>
            this.onButtonClick({ post, commentTopic, btn })
        );

        const host = qs(post, this.cfg.button_append);
        this.addButtonToDom(host, btn);
    }

    onGlobalButtonClick({ container, commentTopic, btn }) {
        // Dernière sélection mémorisée, sinon relis la sélection brute
        const quoted =
            this._lastQuoteByPost.get(container) ||
            getSelectionIn(container) ||
            "";

        // Déduire le post “source” depuis la sélection (pour author/id/permalink)
        let post =
            (() => {
                const sel = window.getSelection?.();
                const n =
                    sel && !sel.isCollapsed
                        ? sel.getRangeAt(0).commonAncestorContainer
                        : null;
                return (
                    n &&
                    (n.nodeType === 1 ? n : n.parentElement)?.closest?.(
                        `.${this.cfg.post_class}`
                    )
                );
            })() || qs(document, `.${this.cfg.post_class}`); // fallback: 1er post

        const authorEl = post
            ? qs(
                  post,
                  ".postprofile a[href^='/u'], .author a[href^='/u'], a[href^='/u']"
              )
            : null;
        const author = authorEl ? authorEl.textContent.trim() : null;
        const id = post ? parsePostId(post) : null;

        this.currentPostCtx = {
            author,
            permalink: location.href,
            id, // peut être null si rien sélectionné
            post,
            commentTopic,
            quoted,
            btn,
        };

        if (!this.cfg.use_overlay) {
            location.href = `/post?mode=reply&t=${this.cfg.single_topic_id}`;
            return;
        }

        const { dialog, form } = this.overlay.open({
            title: T("overlay_title"),
            preset: quoted,
        });

        form.addEventListener("submit", (e) => this.onSubmit(e, dialog));
    }

    onButtonClick({ post, commentTopic, btn }) {
        const quoted = this._lastQuoteByPost.get(post) || "";
        const authorEl = qs(
            post,
            ".postprofile a[href^='/u'], .author a[href^='/u'], a[href^='/u']"
        );
        const author = authorEl ? authorEl.textContent.trim() : null;

        this.currentPostCtx = {
            author,
            permalink: location.href,
            id: parsePostId(post),
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

    async onSubmit(e, dialog) {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const body = fd.get("body") || "";
        /* const reaction = fd.get("reaction"); */

        const { id, permalink, quoted, author, commentTopic } =
            this.currentPostCtx;
        const message = this.cfg.build_payload({
            permalink,
            id,
            body,
            quote: quoted,
            op: author,
            /* reaction: this.cfg.reaction_template(
                this.cfg.reactions.find((r) => r.name === reaction)
            ), */
        });

        if (this.cfg.debug)
            console.log({ body, quoted, reaction, message, commentTopic });

        await Moderactor.topic(commentTopic.id)
            .post({ message }, { disable_html: 1 })
            .then(() => {
                dialog.close();
            });
    }
}

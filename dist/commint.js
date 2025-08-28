var Commint = (function () {
    'use strict';

    // config.js
    const DEFAULTS = {
        allowed_forums: [1, 2, 3, 4],
        mode: "per_post", // "per_post" | "single_topic"
        comments_forum_id: null, // required
        single_topic_id: null, // required if mode=single_topic
        use_overlay: true,
        button_class: "buttons",
        button_position: "prepend", // append, prepend
        button_append: ".post_details",
        post_class: "post",
        global_button_append: ".links_bar",
        comments_on_page: {
            show: true,
            max: 5,
            order: "asc",
            display: "list",
            avatar: true,
        },
        tag_on_create: {
            in_title: false,
            format: (id) => `#p${id}`,
        },
        reactions: [
            { emoji: "👍", name: "Like" },
            { emoji: "❤️", name: "Love" },
            { emoji: "😂", name: "Haha" },
            { emoji: "😮", name: "Wow" },
            { emoji: "😢", name: "Sad" },
            { emoji: "😡", name: "Angry" },
        ],
        button_content_template({ text, count }) {
            return text + (count ? ` (${count})` : "");
        },
        comment_title_template(title, id) {
            const tag = this.tag_on_create.in_title
                ? ` ${this.tag_on_create.format(id)}`
                : "";
            return `${title} • Commentaires${tag}`;
        },
        new_thread_intro(rpTopic, id) {
            const tagLine = `${this.tag_on_create.format(id)}\n\n`;
            return `${tagLine}[b]Commentaires pour : ${rpTopic.title}[/b]\nRP : ${rpTopic.url}\n\n`;
        },
        reaction_template(reaction) {
            return reaction
                ? `<div class="commint-post-reaction" data-name="${reaction.name}">${reaction.emoji}</div>`
                : "";
        },
        build_payload({ permalink, id, body, quote, op, reaction }) {
            const header = quote
                ? `[quote="@${op}"]${quote}[/quote]\n`
                : `"@${op}"\n`;
            return `${header}[url=${permalink}#${id}]→ Voir le message RP[/url]\n\n${body}${
            reaction ? `\n\n${reaction}` : ""
        }`;
        },
        lang: (navigator.language || "fr").replace(/-.*/, "") || "fr",
        debug: true,
    };

    function normalizeConfig(opts = {}) {
        const cfg = { ...DEFAULTS, ...opts };
        if (!cfg.comments_forum_id)
            throw new Error("comments_forum_id est requis.");
        if (cfg.mode === "single_topic" && !cfg.single_topic_id)
            throw new Error('Mode "single_topic" nécessite single_topic_id.');
        cfg.allowed_forums = (cfg.allowed_forums || [])
            .map(Number)
            .filter((i) => i !== cfg.comments_forum_id);
        return cfg;
    }

    // i18n.js
    const I18N = {
        fr: {
            comment_button: "Commenter",
            comment_global_button: "Commenter le sujet",
            overlay_title: "Commenter cette réponse",
            cancel: "Annuler",
            send: "Envoyer",
            missing_post_id: "ID du message introuvable.",
            posted_toast: "Commentaire publié !",
        },
        en: {
            comment_button: "Comment",
            comment_global_button: "Comment on the topic",
            overlay_title: "Comment on this post",
            cancel: "Cancel",
            send: "Send",
            missing_post_id: "Post ID not found.",
            posted_toast: "Comment posted!",
        },
        es: {
            comment_button: "Comentar",
            comment_global_button: "Comentar en el tema",
            overlay_title: "Comentar en este mensaje",
            cancel: "Cancelar",
            send: "Enviar",
            missing_post_id: "ID del mensaje no encontrado.",
            posted_toast: "¡Comentario publicado!",
        },
    };

    let current = "fr";
    const T = (key) => (I18N[current] && I18N[current][key]) || key;
    T.setLang = (lang) => {
        current = lang;
    };

    const qs = (root, sel) => root.querySelector(sel);
    const qsa = (root, sel) => Array.from(root.querySelectorAll(sel));

    function parsePostId(el) {
        const idAttr = el.getAttribute("id") || "";
        const m = idAttr.match(/^p?(\d+)$/);
        return m ? Number(m[1]) : null;
    }

    function ensureCSSFor(selector) {
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

    function normalizeQuote(raw) {
        return String(raw)
            .replace(/\u00a0/g, " ") // nbsp → espace
            .replace(/\s+\n/g, "\n") // espaces avant saut de ligne
            .replace(/\n\s+/g, "\n") // espaces après saut de ligne
            .replace(/[ \t]+/g, " ") // espaces consécutifs
            .replace(/\n{3,}/g, "\n\n") // pas plus de deux \n de suite
            .trim();
    }

    function getSelectionIn(container) {
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

    // cache.js
    const LS_KEY = "posts_to_comments";
    const mem = new Map();

    function getFromCache(postId, ttlMs = 3600000) {
        const id = Number(postId);
        if (mem.has(id)) {
            const v = mem.get(id);
            if (Date.now() - v.time < ttlMs) return v;
        }
        try {
            const all = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
            const v = all[id];
            if (v && Date.now() - v.time < ttlMs) {
                mem.set(id, v);
                return v;
            }
        } catch {}
        return null;
    }

    function putInCache(postId, topic) {
        const id = Number(postId);
        const entry = { ...topic, time: Date.now() };
        mem.set(id, entry);
        const all = (() => {
            try {
                return JSON.parse(localStorage.getItem(LS_KEY) || "{}");
            } catch {
                return {};
            }
        })();
        all[id] = entry;
        localStorage.setItem(LS_KEY, JSON.stringify(all));
    }

    function normalizeTopic({ id, url, title, count = 0 }) {
        return { id: Number(id), url, title, count: Number(count) || 0 };
    }

    class Service {
        constructor({ cfg, env }) {
            this.cfg = cfg;
            this.env = env;
        }

        async findByTag(rpId) {
            const tag = this.cfg.tag_on_create.format(rpId).replace(/^#/, "");
            const resp = await Moderactor.adapter.get(`/tags/${tag}`);
            const a = resp.doc.querySelector("a.postdetails");
            if (!a) return null;
            const href = a.getAttribute("href");
            const m = href && href.match(/\/t(\d+)-/);
            const countMatch = resp.doc.querySelector(".postsearch_infos");
            const count = countMatch
                ? Number(
                      countMatch.textContent
                          .trim()
                          .match(/Réponses:.*?(\d+)/)?.[1] || 0
                  )
                : 0;
            return m
                ? normalizeTopic({
                      id: m[1],
                      url: href,
                      title: a.textContent.trim(),
                      count,
                  })
                : null;
        }

        async createFor(rpId) {
            const subject = this.cfg.comment_title_template(
                this.env.stats.topic.title,
                rpId
            );
            const message = this.cfg.new_thread_intro(this.env.stats.topic, rpId);
            const [res] = await Moderactor.forum(this.cfg.comments_forum_id).post({
                subject,
                message,
            });
            const href = res?.links?.topic || "";
            const m = href && href.match(/t=(\d+)\&/);
            return m
                ? normalizeTopic({ id: m[1], url: href, title: subject, count: 0 })
                : null;
        }

        async ensureFor(rpId, { ttlMs = 3600000 } = {}) {
            const cached = getFromCache(rpId, ttlMs);
            if (cached) return cached;

            const tagHit = await this.findByTag(rpId);
            if (tagHit) {
                putInCache(rpId, tagHit);
                return tagHit;
            }

            const created = await this.createFor(rpId);
            if (created) {
                putInCache(rpId, created);
                return created;
            }

            return null;
        }
    }

    const ensureStyle = (() => {
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

    // overlay-view.js

    ensureStyle(
        "commint-animations",
        `
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        @keyframes slideFromBottom { from{ transform: translate3d(0, var(--initial-transform, 100%), 0);} to{ transform: translate3d(0,0,0);} }
        @keyframes slideToBottom { from{ transform: translate3d(0,0,0);} to{ transform: translate3d(0, var(--initial-transform, 100%), 0);} }
        .buttons {background: var(--neutralDark);padding: 1px 8px!important;margin-right: 5px;border-radius: 5px;}
    `
    );

    class OverlayView {
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

    // commint.js

    class Commint {
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

            // quand l'utilisateur termine sa sélection
            post.addEventListener("mouseup", grab);
            post.addEventListener("keyup", (e) => {
                if (e.key?.startsWith("Arrow") || e.key === "Shift") grab();
            });

            // bonus : si tu veux être ultra-fiable
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

            // Choisis où l’insérer (priorité: config > header du topic > haut du container)
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
            // citation: dernière sélection mémorisée (solution A), sinon relis la sélection brute
            const quoted =
                this._lastQuoteByPost.get(container) ||
                getSelectionIn(container) ||
                "";

            // Essaie de déduire le post “source” depuis la sélection (pour author/id/permalink)
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
            const reaction = fd.get("reaction");

            const { id, permalink, quoted, author, commentTopic } =
                this.currentPostCtx;
            const message = this.cfg.build_payload({
                permalink,
                id,
                body,
                quote: quoted,
                op: author,
                reaction: this.cfg.reaction_template(
                    this.cfg.reactions.find((r) => r.name === reaction)
                ),
            });

            if (this.cfg.debug)
                console.log({ body, quoted, reaction, message, commentTopic });

            // → ici : appel réel à Moderactor pour poster la réponse dans commentTopic.id

            await Moderactor.topic(commentTopic.id)
                .post({ message })
                .then(() => {
                    dialog.close(); // laisse Potion gérer l’UX “toast” si tu veux
                });
        }
    }

    return Commint;

})();
//# sourceMappingURL=commint.js.map

var Commint = (function () {
    'use strict';

    const DEFAULTS = {
        allowed_forums: [1, 2, 3],

        // Acheminement des commentaires
        // - "per_post" : un sujet de commentaires par RP (créé si absent)
        // - "single_topic": tous les commentaires dans un seul sujet
        mode: "per_post",

        comments_forum_id: null,

        single_topic_id: null,

        // UI
        use_overlay: false, // false => redirection vers l’éditeur natif
        button_class: "commint-btn",
        button_append: ".post_details",
        post_class: "post",

        // Tagging
        tag_on_create: {
            in_title: false, // ajouté dans le titre
            format(id) {
                return `#p${id}`;
            },
        },

        // Titre du fil commentaires (mode per_topic)
        comment_title_template(title, id) {
            const tag = this.tag_on_create.in_title
                ? ` ${this.tag_on_create.format(id)}`
                : "";
            return `${title} • Commentaires${tag}`;
        },

        // Message d’intro du fil nouvellement créé
        new_thread_intro(rpTopic, id) {
            const tagLine = `${this.tag_on_create.format(id)}\n\n`;
            return (
                `${tagLine}[b]Commentaires pour : ${rpTopic.title}[/b]\n` +
                `RP : ${rpTopic.url}\n\n`
            );
        },

        // Mise en forme du message envoyé
        build_payload({ permalink, op, body, quoted }) {
            const header = quoted ? `[quote="@${op}"]${quoted}[/quote]\n` : "";
            return `${header}[url=${permalink}]→ Voir le message RP[/url]\n\n${body}`;
        },

        lang: navigator.language.replace(/-.*/, "") || "fr",
    };

    /**
     * I18N minimal.
     */
    const I18N = {
        fr: {
            comment_button: "Commenter",
            overlay_title: "Commenter ce message",
            cancel: "Annuler",
            send: "Envoyer",
            missing_post_id: "ID du message introuvable.",
            posted_toast: "Commentaire publié !",
        },
        en: {
            comment_button: "Comment",
            overlay_title: "Comment on this post",
            cancel: "Cancel",
            send: "Send",
            missing_post_id: "Post ID not found.",
            posted_toast: "Comment posted!",
        },
        es: {
            comment_button: "Comentar",
            overlay_title: "Comentar en este mensaje",
            cancel: "Cancelar",
            send: "Enviar",
            missing_post_id: "ID del mensaje no encontrado.",
            posted_toast: "¡Comentario publicado!",
        },
    };

    let currentLang = "fr";

    const T = function (label) {
        return (I18N[currentLang] && I18N[currentLang][label]) || label;
    };

    T.lang = function (lang) {
        currentLang = lang;
        return T;
    };

    const getEnv = async () => {
        return await Moderactor.env();
    };

    class Commint {
        constructor(options) {
            if (!window.Moderactor)
                throw new Error("Commint requires Moderactor to be loaded first.");

            this.config = { ...DEFAULTS, ...options };
            this.currentPosts = new Map();
            this.openedPostContext = null;
            this.quoted = "";
            this.init();
        }

        async init() {
            const t0 = performance.now();
            this.env = await getEnv();

            if (this.env.page.type !== "topic" || !this.env.user?.is_logged) return;

            console.log(this.env);

            if (!this.config.comments_forum_id)
                throw new Error("An ID is required in comments_forum_id.");

            if (this.config.allowed_forums.length === 0)
                throw new Error("At least one ID is required in allowed_forums.");

            if (this.config.mode === "single_topic" && !this.config.single_topic_id)
                throw new Error(
                    'Mode "single_topic" requires single_topic_id to be set.'
                );

            // init language
            if (this.config.lang) T.lang(this.config.lang);

            // pre-fetch the comment topic for each post
            document
                .querySelectorAll(`.${this.config.post_class}`)
                .forEach(async (post) => {
                    await this.processPost(post);
                });

            console.warn(Math.round(performance.now() - t0) + "ms to init Commint");
        }

        getTopic(postId) {
            // doit chercher dans localStorage('comments) si un rp_id est associé à un comment_id
            const comments = JSON.parse(
                localStorage.getItem("posts_to_comments") || "{}"
            );
            if (comments[postId]) return comments[postId];
        }
        /**
         * Find a comments topic by its associated RP tag.
         * @param {number|string} rpId - The ID of the RP.
         * @returns {object|null} The comments topic or null if not found.
         */
        async findCommentsTopicByTag(rpId) {
            const resp = await Moderactor.adapter.get(
                `/tags/${this.config.tag_on_create.format(rpId).replace(/#/, "")}`
            );
            const countMatch = resp.doc.querySelector(".postsearch_infos");

            const count = countMatch
                ? Number(
                      countMatch.textContent.trim().match(/Réponses:.*?(\d+)/)[1]
                  )
                : 0;
            const a = resp.doc.querySelector("a.postdetails");
            if (!a) return null;
            const href = a.getAttribute("href");
            const m = href && href.match(/\/t(\d+)-/);
            return m
                ? {
                      id: Number(m[1]),
                      url: href,
                      title: a.textContent.trim(),
                      count,
                  }
                : null;
        }

        /**
         * Ensure a comments topic exists for a given post ID.
         * @param {number|string} id - The ID of the post.
         * @returns {object|null} The comments topic or null if not found/created.
         */
        async ensureCommentTopic(id) {
            const cache = this.getTopic(id);
            if (cache && cache.time && Date.now() - cache.time <= 3600000)
                return cache;

            // chercher via tag
            const viaTag = await this.findCommentsTopicByTag(id);
            if (viaTag?.id) {
                this.setTopic(id, viaTag);
                return viaTag;
            }

            // créer si inexistant
            const created = await this.createTopic({
                fId: this.config.comments_forum_id,
                subject: this.config.comment_title_template(
                    this.env.stats.topic.title,
                    id
                ),
                message: this.config.new_thread_intro(this.env.stats.topic, id),
            });

            if (created?.id) {
                this.setTopic(id, created);
                return created.id;
            }

            return null;
        }

        setTopic(id, topic) {
            const cache = JSON.parse(
                localStorage.getItem("posts_to_comments") || "{}"
            );
            cache[id] = { ...topic, time: Date.now() };
            localStorage.setItem("posts_to_comments", JSON.stringify(cache));
        }

        async createTopic({ fId, subject, message } = {}) {
            const [res] = await Moderactor.forum(fId).post({ subject, message });
            console.log(res);
            const href = res?.links?.topic || "";
            const m = href && href.match(/t=(\d+)\&/);
            return m
                ? { id: Number(m[1]), url: href, title: subject, count: 0 }
                : null;
        }

        async processPost(post) {
            const post_id =
                post.getAttribute("id").match(/^p?(\d+)$/)[1] ||
                post.getAttribute("id");
            let res = null;
            if (this.config.mode === "per_post") {
                res = await this.ensureCommentTopic(post_id);
            }
            if (this.config.mode === "single_topic") {
                res = await this.ensureCommentTopic(this.config.single_topic_id);
            }
            if (!res) {
                console.log("No comment topic found or created for post:", post);
                return;
            }
            this.addButton({ post, comment_post_id: res?.id, count: res?.count });
        }

        addButton({ post, comment_post_id, count }) {
            // Implementation for adding a button to the post
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = this.config.button_class;
            btn.textContent =
                T("comment_button") + (count > 0 ? ` (${count})` : "");
            btn.addEventListener(
                "click",
                this.onButtonClick({ post, comment_post_id })
            );
            post.querySelector(this.config.button_append).appendChild(btn);
        }

        collectPostContext(post) {
            const authorEl = post.querySelector(
                ".postprofile a[href^='/u'] , .author a[href^='/u'], a[href^='/u']"
            );
            const author = authorEl ? authorEl.textContent.trim() : null;
            this.currentPostContext = {
                author,
            };
        }

        captureSelectedText(container) {
            const sel = window.getSelection?.();
            if (!sel || sel.isCollapsed) return "";
            try {
                const range = sel.getRangeAt(0);
                if (!container.contains(range.commonAncestorContainer)) return "";
                const div = document.createElement("div");
                div.appendChild(range.cloneContents());
                this.quoted = div.textContent.trim();
            } catch {
                this.quoted = "";
            }
        }

        onButtonClick({ post, comment_post_id }) {
            return async () => {
                this.collectPostContext(post);
                const quoted = this.captureSelectedText(post);
                if (!this.config.use_overlay) {
                    if (this.config.mode === "single_topic")
                        location.href = `/post?mode=reply&t=${this.config.single_topic_id}`;
                    else {
                        location.href = `/post?mode=reply&t=${comment_post_id}`;
                    }
                    return;
                }
                console.log("Button clicked for post:", post, ctx, quoted);
            };
        }
    }

    return Commint;

})();
//# sourceMappingURL=commint.js.map

import { ensureStyle } from "./css-once.js";

const DEFAULTS = {
    allowed_forums: [1, 2, 3, 4],

    // Acheminement des commentaires
    // - "per_post" : un sujet de commentaires par RP (créé si absent)
    // - "single_topic": tous les commentaires dans un seul sujet
    mode: "per_post",

    comments_forum_id: null,

    single_topic_id: null,

    // UI
    use_overlay: true, // false => redirection vers l’éditeur natif
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

    reactions: [
        {
            emoji: "👍",
            name: "Like",
        },
        {
            emoji: "❤️",
            name: "Love",
        },
        {
            emoji: "😂",
            name: "Haha",
        },
        {
            emoji: "😮",
            name: "Wow",
        },
        {
            emoji: "😢",
            name: "Sad",
        },
        {
            emoji: "😡",
            name: "Angry",
        },
    ],

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

const ensureCSSFor = (selector) => {
    let found = false;

    for (const sheet of Array.from(document.styleSheets)) {
        let rules;
        try {
            rules = sheet.cssRules;
        } catch (e) {
            continue; // feuilles cross-origin
        }
        if (!rules) continue;
        for (const r of Array.from(rules)) {
            if (r.selectorText === selector) {
                found = true;
                break;
            }
        }
        if (found) break;
    }
    return found;
};

ensureStyle(
    "commint-animations",
    `@keyframes fadeIn {
        0% {
            opacity: 0;
        }
        100% {
            opacity: 1;
        }
    }
    @keyframes slideFromBottom {
        0% {
            transform: translate3d(0, var(--initial-transform, 100%), 0);
        }
        100% {
            transform: translate3d(0, 0, 0);
        }
    }`
);

class Commint {
    constructor(options) {
        if (!window.Moderactor)
            throw new Error("Commint requires Moderactor to be loaded first.");

        this.config = { ...DEFAULTS, ...options };
        this.currentPosts = new Map();
        this.currentPostContext = null;
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
        this.config.allowed_forums = this.config.allowed_forums.map((i) =>
            Number(i)
        );
        this.config.allowed_forums = this.config.allowed_forums.filter(
            (i) => i !== this.config.comments_forum_id
        );

        // si d'après les breadcrumbs, le topic actuel est dans un forum à l'extérieur de ce qui est autorisé :
        // this.env.scherama.breadcrumbs.items, filter tous les [].url.includes('/f[id]) en regex
        const isAllowed = this.config.allowed_forums.some((id) =>
            this.env.schema.breadcrumbs.items.some((item) =>
                item.url.includes(`/f${id}`)
            )
        );
        if (!isAllowed) return;

        if (this.config.mode === "single_topic" && !this.config.single_topic_id)
            throw new Error(
                'Mode "single_topic" requires single_topic_id to be set.'
            );

        // init language
        this.config.lang =
            this.config.lang ||
            (typeof navigator !== "undefined" && navigator.language
                ? navigator.language.replace(/-.*/, "")
                : null) ||
            this.env.user.lang ||
            "fr";
        T.lang(this.config.lang);

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
        if (comments[Number(postId)]) return comments[Number(postId)];
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
        if (cache && cache.time && Date.now() - cache.time < 3600000) {
            console.log("byCache:", cache);
            return cache;
        }

        // chercher via tag
        const viaTag = await this.findCommentsTopicByTag(id);
        if (viaTag?.id) {
            this.setTopic(id, viaTag);
            console.log("byTag:", viaTag);
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
            console.log("byCreation:", created);
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
            this.onButtonClick({ post, comment_post_id, btn })
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

    onButtonClick({ post, comment_post_id, btn }) {
        return async () => {
            this.collectPostContext(post);
            this.currentPostContext = {
                ...this.currentPostContext,
                post,
                comment_post_id,
                btn,
            };
            this.captureSelectedText(post);
            if (!this.config.use_overlay) {
                if (this.config.mode === "single_topic")
                    location.href = `/post?mode=reply&t=${this.config.single_topic_id}`;
                else {
                    location.href = `/post?mode=reply&t=${comment_post_id}`;
                }
            }
            console.log("Opening overlay for post", post, comment_post_id);
            console.log("Overlay context", this.currentPostContext);
            console.log("Overlay quoted", this.quoted);

            this.openOverlay({
                title: T("overlay_title"),
                preset: this.quoted ? `${this.quoted}` : "",
            });
        };
    }

    openOverlay({ title, preset, onSubmit }) {
        const d = document.createElement("dialog");
        const dClassname = "commint-dialog";
        d.className = dClassname;
        if (!ensureCSSFor(`.${dClassname}`)) {
            ensureStyle(
                "commint-overlay",
                `.commint-dialog { 
                    inset:auto;
                    max-width:none;
                    padding: 20px;
                    border:0;
                    position:fixed;
                    bottom: 0;
                    width:100%;
                    display:flex;
                    background-color:white;
                    z-index:9999;
                    will-change: transform;
                    animation-name: slideFromBottom;
                    transition: transform .5s cubic-bezier(.32, .72, 0, 1);
                    animation-duration: .5s;
                    animation-timing-function: cubic-bezier(0.32,0.72,0,1);
                }
                .commint-dialog::backdrop { 
                    background: #0008; 
                    animation-duration: .5s;
                    animation-timing-function: cubic-bezier(0.32,0.72,0,1);
                    animation-name: fadeIn;
                    animation-fill-mode: forwards;
                }
                .commint-form {
                    max-width: var(--container, 940px);
                    width: 100%;
                    margin: auto;
                }`
            );
        }
        d.innerHTML = `
            <form class="commint-form">
                <header style="display:flex;margin-bottom:8px;">
                    <h2 style="margin:0;font-size:16px;">${title ?? ""}</h2>
                </header>
                <textarea data-body rows="8" style="width:100%;resize:vertical" aria-label="Comment"></textarea>
                <button type="submit">Submit</button>
            </form>
            <form method="dialog">
                <button aria-label="Fermer" type="close">✕</button>
            </form>
        `;
        document.body.appendChild(d);
        d.showModal();

        d.addEventListener("close", () => {
            if (d.returnValue === "ok") onSubmit?.(d);
            d.remove();
        });

        return d;
        const style = document.createElement("style");
        style.textContent = `
            @keyframes fadeIn {
                0% {
                    opacity: 0;
                }
                100% {
                    opacity: 1;
                }
            }
            @keyframes slideFromBottom {
                0% {
                    transform: translate3d(0, var(--initial-transform, 100%), 0);
                }
                100% {
                    transform: translate3d(0, 0, 0);
                }
            }
        `;
        document.body.appendChild(style);

        // Implementation for opening the overlay
        const overlay = document.createElement("div");
        const overlayClassname = "commint-overlay";
        if (ensureCSSFor(`.${overlayClassname}`)) {
            overlay.className = overlayClassname;
        } else {
            overlay.style = `
                position:fixed;
                inset:0;
                background-color:#00000080;
                display:flex;
                align-items:center;
                justify-content:center;
                z-index:9998;
                font:14px/1.4 sans-serif;
                opacity: 0;
                animation-duration: .5s;
                animation-timing-function: cubic-bezier(0.32,0.72,0,1);
                animation-name: fadeIn;
                animation-fill-mode: forwards;
            `;
        }

        const container = document.createElement("div");
        const containerClassname = "commint-container";
        if (ensureCSSFor(`.${containerClassname}`)) {
            container.className = containerClassname;
        } else {
            container.style = `
                position:fixed;
                bottom: 0;
                width:100%;
                display:flex;
                background-color:white;
                align-items:center;
                justify-content:center;
                z-index:9999;
                will-change: transform;
                animation-name: slideFromBottom;
                transition: transform .5s cubic-bezier(.32, .72, 0, 1);
                animation-duration: .5s;
                animation-timing-function: cubic-bezier(0.32,0.72,0,1);
            `;
        }
        container.innerHTML = `<h2>${title}</h2>
                <div class="overlay-body">${preset}</div>
                <button class="overlay-close">Close</button>`;
        document.body.appendChild(container);
        document.body.appendChild(overlay);
    }
}

export default Commint;

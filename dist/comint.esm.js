const DEFAULTS = {
    allowed_forums: [1, 2, 3],

    // Acheminement des commentaires
    // - "per_post" : un sujet de commentaires par RP (créé si absent)
    // - "single_topic": tous les commentaires dans un seul sujet
    mode: "per_post",

    comments_forum_id: null,

    single_topic_id: null,

    // UI
    use_overlay: true, // false => redirection vers l’éditeur natif
    button_class: "comint-btn",
    post_class: "post",

    // Tagging
    tag_on_create: {
        in_title: true, // si false => ajouté en tête du message d’intro
        format(topicId) {
            return `#t${topicId}`;
        },
    },

    // Titre du fil commentaires (mode per_topic)
    comment_title_template(topic) {
        const tag =
            this.tag_on_create.enabled && this.tag_on_create.in_title
                ? ` ${this.tag_on_create.format(topic.id)}`
                : "";
        return `${topic.title} • Commentaires${tag}`;
    },

    // Message d’intro du fil nouvellement créé
    new_thread_intro(rpTopic) {
        const tagLine =
            this.tag_on_create.enabled && !this.tag_on_create.in_title
                ? `${this.tag_on_create.format(rpTopic.id)}\n\n`
                : "";
        return (
            `${tagLine}[b]Commentaires pour ce RP[/b]\n` +
            `RP : ${rpTopic.url}\n\n— Postez ici vos réactions aux messages, sans polluer le fil RP.`
        );
    },

    // Mise en forme du message envoyé
    build_payload({ permalink, op, body, quoted }) {
        const header = quoted ? `[quote=${op}]${quoted}[/quote]\n` : "";
        return `${header}[url=${permalink}]→ Voir le message RP[/url]\n\n${body}`;
    },

    lang: navigator.language || "fr",
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

class Comint {
    constructor(options) {
        if (!window.Moderactor)
            throw new Error("Comint requires Moderactor to be loaded first.");

        this.config = { ...DEFAULTS, ...options };
        this.currentPosts = new Map();
        this.init();
    }

    async init() {
        this.env = await getEnv();

        if (this.env.page.type !== "topic") return;

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

        if (this.config.mode === "per_post") {
            // est-ce que je devrais commencer à récupérer tous les topics de commentaires attachés aux posts présents sur la page?
            // pre-fetch the comment topic for each post
            document
                .querySelectorAll(`.${this.config.post_class}`)
                .forEach(async (post) => {
                    await this.processPost(post);
                });
        }
    }

    consultCache(rpId) {
        /*
        doit chercher dans local_storage si un rp_id est associé à un comment_id
         */
    }

    async processPost(post) {
        const idAttr = post.getAttribute("id").match(/^p?(\d+)$/) || "";
        console.log(idAttr[1]);
    }
}

export { Comint as default };
//# sourceMappingURL=comint.esm.js.map

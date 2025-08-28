// config.js
export const DEFAULTS = {
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

export function normalizeConfig(opts = {}) {
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

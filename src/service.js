import { getFromCache, putInCache } from "./cache.js";

function normalizeTopic({ id, url, title, count = 0 }) {
    return { id: Number(id), url, title, count: Number(count) || 0 };
}

export class Service {
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

// cache.js
const LS_KEY = "posts_to_comments";
const mem = new Map();

export function getFromCache(postId, ttlMs = 3600000) {
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

export function putInCache(postId, topic) {
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

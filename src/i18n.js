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
export const T = (key) => (I18N[current] && I18N[current][key]) || key;
T.setLang = (lang) => {
    current = lang;
};

/* Chatterino+ 2.4.0 — give. Собрано tools/build.py из src/; читаемый исходник, без минификации. */
(() => {
"use strict";
const CPX = Object.create(null);
// ── src/give/10_give.js ──
/* Страница розыгрыша (наш сайт: chat.eblo.id/chat/give/, ws.chat.eblo.id/chat/give/, ws.rish098.xyz/chat/give/) — мост к
 * расширению для VIP победителю от главного модератора (задание основного чата 22.11, v2 §3; страница — chat/web/src/give/
 * 80_live.js). Только window.postMessage внутри этой вкладки:
 *   расширение → странице: {c7ext:"give-hello", v:1} — при загрузке и в ответ на {c7give:"ping"};
 *   страница → расширению: {c7give:"vip", rid, on, channelId, channelLogin, userId, userLogin};
 *   расширение → странице: {c7ext:"give-vip", rid, ok, error}.
 * Принимаем только от самой страницы (event.source === window) и только с наших трёх адресов; поля проверяет и фон
 * (bg/67_giveaway.js). Снятие (on:false) приходит и при закрытии вкладки — фон доделывает его сам.
 */
(() => {
  const ORIGINS = ["https://chat.eblo.id", "https://ws.chat.eblo.id", "https://ws.rish098.xyz"];
  if (!ORIGINS.includes(location.origin) || window.top !== window) return;
  const hello = () => window.postMessage({ c7ext: "give-hello", v: 1 }, location.origin);
  const answer = (rid, ok, error) => window.postMessage({ c7ext: "give-vip", rid, ok: !!ok, error: ok ? "" : String(error || "расширение не смогло") }, location.origin);

  window.addEventListener("message", (e) => {
    const d = e.data;
    if (e.source !== window || !ORIGINS.includes(e.origin) || !d || typeof d !== "object" || typeof d.c7give !== "string") return;
    if (d.c7give === "ping") return hello();
    if (d.c7give !== "vip") return;
    const rid = typeof d.rid === "number" || typeof d.rid === "string" ? String(d.rid).slice(0, 40) : "";
    const ok = (s) => /^\d{1,20}$/.test(String(s || ""));
    if (!rid || typeof d.on !== "boolean" || !ok(d.channelId) || !ok(d.userId)) return answer(d.rid, false, "неверный запрос");
    const msg = {
      cpxGive: "vip",
      on: d.on,
      channelId: String(d.channelId),
      channelLogin: String(d.channelLogin || "").slice(0, 25),
      userId: String(d.userId),
      userLogin: String(d.userLogin || "").slice(0, 25),
    };
    try {
      chrome.runtime.sendMessage(msg, (r) => {
        if (chrome.runtime.lastError || !r) return answer(d.rid, false, "расширение не ответило — обнови страницу");
        answer(d.rid, r.ok, r.error);
      });
    } catch (_) {
      // Расширение обновили или выключили — этот скрипт уже не связан с ним.
      answer(d.rid, false, "расширение обновилось — обнови страницу");
    }
  });

  hello();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", hello, { once: true });
})();
})();

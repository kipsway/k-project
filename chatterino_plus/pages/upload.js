/* Chatterino+ 2.4.0 — upload. Собрано tools/build.py из src/; читаемый исходник, без минификации. */
(() => {
"use strict";
const CPX = Object.create(null);
// ── src/upload/10_upload.js ──
/* Страница отправки файлов на eblo.id — невидимый фрейм pages/eblo_upload.html на странице Twitch (общий план с
 * клиентом — Z:\_memstudy\eblo\PLAN.md §3.1, §3.3, §8.4). Мир сборки "upload" (tools/build.py): только эта папка, без
 * src/common — CPX здесь пустой, false сборка заменяет на true/false.
 *
 * ЗАЧЕМ ФРЕЙМ. Файл живёт в ISOLATED-мире вкладки (src/iso/20_eblo_upload.js) и приходит сюда postMessage (структурное
 * клонирование — без чтения в память). Здесь — XMLHttpRequest ради хода отправки (upload.onprogress; у fetch его нет) и
 * ключ eblo.id: страница расширения — доверенный контекст, ключ берём сами из storage.local и никому не отдаём (ни в
 * ответы, ни в журнал).
 *
 * БЕЗОПАСНОСТЬ. Писать во фрейм может любой скрипт страницы Twitch и чужие расширения. Принимаем только
 * {cpxUpload: 1, nonce, file, name, uploadId} от родителя-страницы *.twitch.tv с портом MessageChannel; номер гасим у
 * фона (eblo.redeem) ДО отправки — его выдают только ISOLATED-миру этой же вкладки, он одноразовый и живёт 2 мин.
 * Неверный или пустой номер — отказ {t:"done", status:0, refused:true}, к сайту не ходим. Ответы — только в порт.
 *
 * ЗАПРОС (§3.1): POST <адрес>/api/upload, multipart file + upload_id (один на файл, тот же при повторах), заголовки
 * X-Status-Tunnel: 1 и Authorization: Bearer, без кук. Статус = X-Origin-Status || статус ответа; не-JSON тело не
 * разбираем. Ссылку принимаем, только если она начинается с https://eblo.id/ (отладочная сборка — ещё с подменённого
 * адреса cpx.eblo.devBase: только http://127.0.0.1:<порт>, макет сбоев Z:\_memstudy\eblo\mock). Пост создан — фону
 * eblo.uploaded {nonce, code} (для «Отменить»); 401 — eblo.unauthorized (фон стирает ключ).
 * Зависание: ни байта за IDLE_MS или нет ответа WAIT_MS после отправки всего файла — обрыв, status 0 (повторит ISOLATED).
 *
 * ПОРТ: ← {t:"abort"}; → {t:"start"} (номер погашен) · {t:"progress", loaded, total} (не чаще PROGRESS_MS) ·
 *   {t:"done", status, url?, code?, error?, retryAfter?, aborted?, refused?}.
 */

(() => {
  const DEV = false;
  const BASE = "https://eblo.id";
  const AUTH_KEY = "cpx.eblo.auth";
  const DEV_BASE_KEY = "cpx.eblo.devBase";
  const TWITCH = /^https:\/\/([a-z0-9-]+\.)*twitch\.tv$/i;
  const NONCE = /^[A-Za-z0-9_-]{16,64}$/;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const NAME = /^[A-Za-z0-9._-]{1,80}$/;
  const CODE = /^[A-Za-z0-9]{7}$/;
  const PROGRESS_MS = 120;
  const IDLE_MS = 60000;
  const WAIT_MS = 180000;

  /** Метод фона (как страницы расширения, src/pages/10_ext.js) → результат или null. */
  function call(m, p) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ cpxCall: 1, m, p: p == null ? null : p }, (res) => {
          void chrome.runtime.lastError;
          resolve(res && res.ok ? res.r : null);
        });
      } catch (_) {
        resolve(null);
      }
    });
  }

  async function account() {
    const r = await chrome.storage.local.get(DEV ? [AUTH_KEY, DEV_BASE_KEY] : [AUTH_KEY]).catch(() => ({}));
    const a = r && r[AUTH_KEY];
    const dev = DEV && r && typeof r[DEV_BASE_KEY] === "string" && /^http:\/\/127\.0\.0\.1:\d{2,5}$/.test(r[DEV_BASE_KEY]) ? r[DEV_BASE_KEY] : "";
    return { token: a && typeof a.token === "string" ? a.token : "", base: dev || BASE };
  }

  const linkOk = (u, base) => typeof u === "string" && u.length < 300 && !/[\s"'<>\\]/.test(u) && (u.startsWith(BASE + "/") || (base !== BASE && u.startsWith(base + "/")));

  async function run(d, port) {
    let xhr = null;
    let aborted = false;
    let ended = false;
    let watch = 0;
    const done = (r) => {
      if (ended) return;
      ended = true;
      clearInterval(watch);
      try {
        port.postMessage(Object.assign({ t: "done" }, r));
        port.close();
      } catch (_) {
        /* порт закрыт той стороной */
      }
    };
    port.onmessage = (e) => {
      if (!e.data || e.data.t !== "abort") return;
      aborted = true;
      if (xhr) xhr.abort();
      else done({ status: 0, aborted: true });
    };
    if (!(await call("eblo.redeem", { nonce: d.nonce }))) return done({ status: 0, refused: true });
    const acc = await account();
    if (ended || aborted) return done({ status: 0, aborted: true }); // «Остановить» пришло, пока гасили номер
    if (!acc.token) return done({ status: 401 });
    port.postMessage({ t: "start" });

    const fd = new FormData();
    fd.append("upload_id", d.uploadId);
    fd.append("file", d.file, d.name);
    xhr = new XMLHttpRequest();
    let last = Date.now();
    let lastSent = 0;
    let sentAll = false;
    xhr.upload.onprogress = (e) => {
      last = Date.now();
      const total = e.lengthComputable ? e.total : d.file.size;
      if (e.loaded >= total) sentAll = true;
      if (last - lastSent < PROGRESS_MS && !sentAll) return;
      lastSent = last;
      port.postMessage({ t: "progress", loaded: e.loaded, total });
    };
    xhr.upload.onload = () => {
      sentAll = true;
      last = Date.now();
    };
    xhr.onload = async () => {
      const status = Number(xhr.getResponseHeader("X-Origin-Status")) || xhr.status;
      let data = null;
      if (/json/i.test(xhr.getResponseHeader("Content-Type") || "")) {
        try {
          data = JSON.parse(xhr.responseText);
        } catch (_) {
          data = null;
        }
      }
      if (!data || typeof data !== "object") data = {};
      const error = typeof data.error === "string" ? data.error.slice(0, 200) : "";
      if (status === 401) {
        await call("eblo.unauthorized");
        return done({ status });
      }
      if (status === 200 && data.success !== false && linkOk(data.url, acc.base)) {
        const code = CODE.test(data.short_code) ? data.short_code : String(data.url).split(/[/?#]/)[3] || "";
        if (CODE.test(code)) await call("eblo.uploaded", { nonce: d.nonce, code });
        return done({ status, url: data.url, code: CODE.test(code) ? code : "", aborted });
      }
      const ra = Number(data.retry_after) || Number(xhr.getResponseHeader("Retry-After")) || 0;
      // 200 без ссылки (success:false, чужой адрес) — «не принял», без повторов.
      done({ status: status === 200 ? 400 : status, error, retryAfter: ra > 0 ? ra : 0 });
    };
    xhr.onerror = () => done({ status: 0 });
    xhr.onabort = () => done({ status: 0, aborted });
    watch = setInterval(() => {
      if (Date.now() - last < (sentAll ? WAIT_MS : IDLE_MS)) return;
      done({ status: 0 });
      xhr.abort();
    }, 5000);
    xhr.open("POST", acc.base + "/api/upload");
    xhr.setRequestHeader("X-Status-Tunnel", "1");
    xhr.setRequestHeader("Authorization", "Bearer " + acc.token);
    xhr.send(fd);
  }

  window.addEventListener("message", (e) => {
    const d = e.data;
    if (!d || typeof d !== "object" || d.cpxUpload !== 1) return;
    const port = e.ports && e.ports[0];
    if (!port) return;
    const good =
      e.source === window.parent &&
      TWITCH.test(String(e.origin)) &&
      typeof d.nonce === "string" &&
      NONCE.test(d.nonce) &&
      d.file instanceof Blob &&
      typeof d.name === "string" &&
      NAME.test(d.name) &&
      typeof d.uploadId === "string" &&
      UUID.test(d.uploadId);
    if (!good) {
      port.postMessage({ t: "done", status: 0, refused: true });
      port.close();
      return;
    }
    run(d, port).catch(() => {
      try {
        port.postMessage({ t: "done", status: 0 });
        port.close();
      } catch (_) {
        /* порт закрыт */
      }
    });
  });
})();
})();

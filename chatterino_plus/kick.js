/* Chatterino+ 2.4.0 — kick. Собрано tools/build.py из src/; читаемый исходник, без минификации. */
(() => {
"use strict";
const CPX = Object.create(null);
// ── src/common/00_core.js ──
/* Ядро: мелочи, общие для всех миров (страница, мост, фон, страницы расширения).
 *
 * Сборка (tools/build.py) склеивает модули мира в одну IIFE, где объявлен общий
 * объект CPX. Каждый модуль добавляет в него своё пространство: CPX.log, CPX.bg,
 * CPX.chat и т.д. Порядок — по именам файлов, поэтому номера в именах важны.
 */

CPX.version = "2.4.0";
CPX.world = "kick";
CPX.dev = false;

/* ── Журнал ──────────────────────────────────────────────────────────────────
 * Кольцо последних записей — для диагностики (popup «Скопировать журнал», стенд
 * проверки). В консоль пишем тихо: на Twitch консоль и так шумная, поэтому info —
 * через console.debug (видно только с уровнем Verbose), warn/error — как есть.
 */
(() => {
  const RING_MAX = 500;
  const ring = [];

  function fmt(a) {
    if (a instanceof Error) return a.name + ": " + a.message;
    if (typeof a === "string") return a;
    try {
      return JSON.stringify(a);
    } catch (_) {
      return String(a);
    }
  }

  function push(level, scope, args) {
    const entry = { t: Date.now(), level, scope, msg: args.map(fmt).join(" ").slice(0, 2000) };
    ring.push(entry);
    if (ring.length > RING_MAX) ring.shift();
    const tag = "[C+ " + scope + "]";
    if (level === "error") console.error(tag, ...args);
    else if (level === "warn") console.warn(tag, ...args);
    else if (level === "info" || CPX.dev) console.debug(tag, ...args);
  }

  CPX.log = function (scope) {
    return {
      debug: (...a) => push("debug", scope, a),
      info: (...a) => push("info", scope, a),
      warn: (...a) => push("warn", scope, a),
      error: (...a) => push("error", scope, a),
    };
  };
  CPX.log.ring = () => ring.slice();
})();

/* ── Защита от падений ────────────────────────────────────────────────────────
 * Всё, что трогает внутренности Twitch или данные извне, заворачивается в guard:
 * ошибка ломает только эту функцию, пишется в журнал ОДИН раз на вид ошибки
 * (иначе ошибка в обработчике строки заспамит журнал на людном канале).
 */
(() => {
  const seen = new Map();
  const log = CPX.log("guard");

  CPX.report = function (scope, err) {
    const key = scope + "|" + (err && err.message);
    const n = (seen.get(key) || 0) + 1;
    seen.set(key, n);
    if (seen.size > 500) seen.clear();
    if (n === 1 || n === 100 || n === 10000) {
      log.error(scope + (n > 1 ? " (×" + n + ")" : ""), err && err.stack ? err.stack.split("\n").slice(0, 4).join(" | ") : err);
    }
  };

  CPX.guard = function (scope, fn) {
    return function (...args) {
      try {
        const r = fn.apply(this, args);
        if (r && typeof r.then === "function") return r.catch((e) => CPX.report(scope, e));
        return r;
      } catch (e) {
        CPX.report(scope, e);
        return undefined;
      }
    };
  };

  /** Выполнить один раз сразу, с защитой. */
  CPX.safely = function (scope, fn) {
    return CPX.guard(scope, fn)();
  };
})();

/* ── Мелкие утилиты ─────────────────────────────────────────────────────────── */

CPX.sleep = (ms) => new Promise((r) => setTimeout(r, ms));

CPX.debounce = function (fn, ms) {
  let t = 0;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), ms);
  };
};

CPX.throttle = function (fn, ms) {
  let last = 0;
  let t = 0;
  let pendingArgs = null;
  return function (...args) {
    const now = Date.now();
    const left = last + ms - now;
    if (left <= 0) {
      last = now;
      fn.apply(this, args);
    } else {
      pendingArgs = args;
      if (!t) {
        t = setTimeout(() => {
          t = 0;
          last = Date.now();
          const a = pendingArgs;
          pendingArgs = null;
          fn.apply(this, a);
        }, left);
      }
    }
  };
};

/** Случайный идентификатор (не для криптографии). */
CPX.uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/** Ограниченный кэш «последних использованных». */
CPX.LRU = class {
  constructor(max) {
    this.max = max;
    this.map = new Map();
  }
  get(k) {
    if (!this.map.has(k)) return undefined;
    const v = this.map.get(k);
    this.map.delete(k);
    this.map.set(k, v);
    return v;
  }
  has(k) {
    return this.map.has(k);
  }
  set(k, v) {
    if (this.map.has(k)) this.map.delete(k);
    this.map.set(k, v);
    if (this.map.size > this.max) this.map.delete(this.map.keys().next().value);
    return this;
  }
  delete(k) {
    return this.map.delete(k);
  }
  clear() {
    this.map.clear();
  }
  get size() {
    return this.map.size;
  }
};

// ── src/common/05_emitter.js ──
/* Маленький источник событий: on/once/off/emit. on() возвращает функцию отписки.
 * Ошибка одного подписчика не мешает остальным (guard). */

CPX.Emitter = class {
  constructor() {
    this._h = new Map();
  }

  on(name, fn) {
    let set = this._h.get(name);
    if (!set) this._h.set(name, (set = new Set()));
    set.add(fn);
    return () => this.off(name, fn);
  }

  once(name, fn) {
    const off = this.on(name, (...a) => {
      off();
      fn(...a);
    });
    return off;
  }

  off(name, fn) {
    const set = this._h.get(name);
    if (set) {
      set.delete(fn);
      if (!set.size) this._h.delete(name);
    }
  }

  emit(name, ...args) {
    const set = this._h.get(name);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        fn(...args);
      } catch (e) {
        CPX.report("emit:" + name, e);
      }
    }
  }
};

// ── src/common/06_clock.js ──
/* Часы серверов: «серверное сейчас» у человека со сбитыми часами компьютера.
 *
 * Зачем (клиент 5.4.1, 03.10.2026): время С СЕРВЕРА — метки сообщений Twitch, createdAt/expiresAt из
 * GraphQL, сроки пропусков и подписки с нашего сервера — нельзя сравнивать с часами компьютера: у людей
 * они сбиты на секунды (Windows без службы времени), минуты и часы («подведённые руками»). Спешащие часы
 * считали свежий мут истёкшим (кнопка «бан» вместо «разбан»), закрывали ставки прогноза раньше времени;
 * отстающие — не дочитывали свежее в ленте карточки и держали протухший пропуск.
 *
 * Как (образец — клиент, src/util/ServerClock): на каждую серверную метку ЖИВОГО события запоминаем
 * «время сервера − часы компьютера в миг приёма». Сеть только задерживает — оценка = НАИБОЛЬШЕЕ из этих
 * значений за 10 минут. Серверное «сейчас» = часы компьютера + оценка. Часы компьютера перевели или машина
 * спала (Date.now() − performance.now() скакнуло больше чем на 2 с) — замеры сброшены. Замеров нет —
 * оценка 0: всё как раньше, по часам компьютера. Серверы Twitch и наш сверены по NTP — одна оценка годится
 * для любых серверных времён.
 *
 * Источники: мир страницы — метки живых чужих сообщений чата (main/31_clock.js; сверено 03.10: m.timestamp
 * Twitch — время сервера, от часов страницы не зависит); фон — заголовок Date ответов chat.eblo.id и
 * gql.twitch.tv (bg/29_clock.js, точность — секунда). Мир страницы без своих замеров (тихий чат) берёт
 * оценку фона (hint).
 *
 * Сравнения местного с местным (паузы, тайм-ауты, «сколько провисело», сроки, отсчитанные от Date.now())
 * остаются на Date.now() — их сбитые часы не задевают.
 *
 * API (CPX.clock):
 *   now() — серверное «сейчас» (мс); toLocal(серверные мс) → тот же миг по часам компьютера (для таймеров
 *   и сравнения с Date.now(); 0/не число — как есть); offset() — оценка (мс, сервер − компьютер);
 *   sample(серверные мс, приём по Date.now()) — замер; hint(оценка | null) — оценка извне, пока своих
 *   замеров нет; on(fn(оценка)) → отписка — оценка изменилась на 250 мс и больше (или сброс); state().
 */

CPX.clock = (() => {
  const WINDOW = 10 * 60000; // замеры старше — не в счёт
  const JUMP = 2000; // скачок часов компьютера — сброс
  const NOTIFY = 250; // о меньших сдвигах оценки не объявляем
  const ev = new CPX.Emitter();
  const perf = typeof performance === "object" && performance && typeof performance.now === "function" ? performance : null;
  const base = () => (perf ? Date.now() - perf.now() : 0);
  let samples = []; // [приём (Date.now), значение]; соседние в пределах секунды слиты (наибольшее)
  let est = null; // наибольшее за окно; null — своих замеров нет
  let hinted = null;
  let anchor = base();
  let told = 0;
  let resets = 0;

  function recompute() {
    est = null;
    for (const s of samples) if (est == null || s[1] > est) est = s[1];
  }

  function checkJump() {
    if (!perf) return;
    const b = base();
    if (Math.abs(b - anchor) <= JUMP) return;
    anchor = b;
    if (!samples.length && hinted == null) return;
    samples = [];
    est = null;
    hinted = null;
    resets++;
    announce(true);
  }

  function offset() {
    checkJump();
    if (samples.length && samples[0][0] < Date.now() - WINDOW) {
      const lim = Date.now() - WINDOW;
      while (samples.length && samples[0][0] < lim) samples.shift();
      recompute();
    }
    if (est != null) return est;
    return hinted != null ? hinted : 0;
  }

  function announce(force) {
    const o = offset();
    if (!force && Math.abs(o - told) < NOTIFY) return;
    told = o;
    ev.emit("change", o);
  }

  function sample(serverMs, recvAt) {
    if (!(serverMs > 1e12) || !(recvAt > 1e12)) return;
    checkJump();
    const v = serverMs - recvAt;
    if (!Number.isFinite(v)) return;
    const last = samples[samples.length - 1];
    if (last && recvAt - last[0] < 1000) {
      if (v > last[1]) last[1] = v;
    } else samples.push([recvAt, v]);
    if (est == null || v > est) est = v;
    if (samples.length > 1200) {
      samples.shift();
      recompute();
    }
    announce(false);
  }

  return {
    now: () => Date.now() + offset(),
    toLocal: (ms) => (ms > 0 ? ms - offset() : ms),
    offset,
    sample,
    hint(o) {
      checkJump();
      hinted = Number.isFinite(o) ? o : null;
      announce(false);
    },
    on: (fn) => ev.on("change", fn),
    state: () => ({ offset: Math.round(offset()), own: est != null, samples: samples.length, hinted: hinted != null ? Math.round(hinted) : null, resets }),
  };
})();

// ── src/common/07_glyphs.js ──
/* Клеточные значки «Мозаики» (задание «Мозаика» §4.8–§4.9) — один источник для окон на Twitch
 * (CPX.ui.icon, src/main/95_ui.js) и страниц расширения (src/pages).
 *
 * Рисунок — строки клеток: «#» — клетка цвета значка (currentColor), «.» — пусто. Основная сетка 7×7;
 * значки состояний — своих размеров (ff 7×5, gauge 5×5). Клеточный логотип владелец отклонил 04.10 —
 * логотип везде прежний (значок расширения, знак в 94_settings_panel.js). Клетки — квадраты SVG crispEdges:
 * край ровно по пикселям; при 125–150 % клетка — 2–3 пикселя экрана (нормально для пиксельного рисунка).
 *
 * CPX.glyph(имя, размер, {gap, cell}) → <svg> или null (такого рисунка нет). Клетка — целая доля
 * размера, не меньше 2 px (7 клеток: 14–20 px — по 2, 21–27 — по 3); сплошные. Просвет между клетками (gap: 1 — «светодиодный» вид образца)
 * — по выбору места: лист 04.10 показал, что тонкие линии (крестик, галочка, стрелки) с просветом
 * рассыпаются в точки; просвет — у плотных значков состояний (догон, задержка).
 * CPX.glyphs — сами рисунки (для витрины и страниц). «Кирпич» бана и разбана — один рисунок (ban),
 * разница цветом (решение владельца).
 */

CPX.glyphs = (() => {
  const g = {
    close: [".......", ".#...#.", "..#.#..", "...#...", "..#.#..", ".#...#.", "......."],
    check: [".......", "......#", ".....#.", "#...#..", ".#.#...", "..#....", "......."],
    checkCircle: ["..###..", ".#...#.", "#....##", "#.#.#.#", "#..#..#", ".#...#.", "..###.."],
    plus: [".......", "...#...", "...#...", ".#####.", "...#...", "...#...", "......."],
    minus: [".......", ".......", ".......", ".#####.", ".......", ".......", "......."],
    chevronDown: [".......", ".......", ".#...#.", "..#.#..", "...#...", ".......", "......."],
    chevronUp: [".......", ".......", "...#...", "..#.#..", ".#...#.", ".......", "......."],
    chevronRight: [".......", "..#....", "...#...", "....#..", "...#...", "..#....", "......."],
    chevronLeft: [".......", "....#..", "...#...", "..#....", "...#...", "....#..", "......."],
    arrowDown: ["...#...", "...#...", "...#...", ".#.#.#.", "..###..", "...#...", "......."],
    arrowUp: [".......", "...#...", "..###..", ".#.#.#.", "...#...", "...#...", "...#..."],
    arrowLeft: [".......", "..#....", ".#.....", "#######", ".#.....", "..#....", "......."],
    arrowRight: [".......", "....#..", ".....#.", "#######", ".....#.", "....#..", "......."],
    kebab: ["...#...", ".......", ".......", "...#...", ".......", ".......", "...#..."],
    dots: [".......", ".......", ".......", "#..#..#", ".......", ".......", "......."],
    search: [".###...", "#...#..", "#...#..", "#...#..", ".###...", "....##.", ".....##"],
    clock: ["..###..", ".#...#.", "#..#..#", "#..##.#", "#.....#", ".#...#.", "..###.."],
    ban: ["..###..", ".#...#.", "#.#...#", "#..#..#", "#...#.#", ".#...#.", "..###.."],
    unban: ["..###..", ".#...#.", "#.#...#", "#..#..#", "#...#.#", ".#...#.", "..###.."],
    trash: ["..###..", "#######", ".#...#.", ".#.#.#.", ".#.#.#.", ".#...#.", "..###.."],
    pin: ["..###..", "..#.#..", "..#.#..", ".#####.", "...#...", "...#...", "...#..."],
    pinFilled: ["..###..", "..###..", "..###..", ".#####.", "...#...", "...#...", "...#..."],
    sword: ["......#", ".....#.", "....#..", ".#.#...", "..#....", ".#.#...", "#......"],
    warning: ["...#...", "..#.#..", "..#.#..", ".#.#.#.", ".#...#.", "#..#..#", "#######"],
    info: ["..###..", ".#.#.#.", "#.....#", "#..#..#", "#..#..#", ".#...#.", "..###.."],
    copy: ["####...", "#..#...", "#.#####", "###...#", "..#...#", "..#...#", "..#####"],
    external: ["...####", ".....##", "#...#.#", "#..#...", "#......", "#......", "#####.."],
    smile: ["..###..", ".#...#.", "#.#.#.#", "#.....#", "#.###.#", ".#...#.", "..###.."],
    poll: [".......", "#####..", ".......", "#######", ".......", "###....", "......."],
    prediction: [".#...#.", "###..#.", ".#...#.", ".#...#.", ".#...#.", ".#..###", ".#...#."],
    user: ["..###..", ".#...#.", ".#...#.", "..###..", ".......", ".#####.", "#.....#"],
    history: ["..###..", "##...#.", "##.#..#", "...##.#", "#.....#", ".#...#.", "..###.."],
    refresh: ["..##.#.", ".#...##", "#...###", "#......", "#.....#", ".#...#.", "..###.."],
    eye: [".......", "..###..", ".#...#.", "#..#..#", ".#...#.", "..###..", "......."],
    // eblo.id (13.10): размытый кадр карточки, кадр аудио и файла без картинки.
    eyeOff: ["#......", ".####..", ".##..#.", "#..#..#", ".#..##.", "..####.", "......#"],
    // упоминания (23.10): «Уведомлять снова» / «Не уведомлять» в меню карточки
    bell: ["...#...", "..###..", ".#####.", ".#####.", ".#####.", "#######", "...#..."],
    bellOff: ["#..#...", "..###..", ".#.###.", ".##.##.", ".###.#.", "#####.#", "...#..#"],
    note: ["...##..", "...#.#.", "...#..#", "...#...", ".###...", "####...", ".##...."],
    doc: ["####...", "#..##..", "#...##.", "#....#.", "#.##.#.", "#....#.", "######."],
    link: ["....##.", "...#..#", "...#.#.", "..#.#..", ".#.#...", "#..#...", ".##...."],
    at: [".#####.", "#.....#", "#.###.#", "#.#.#.#", "#.####.", "#......", ".#####."], // «@» — раздел «Упоминания»
    message: ["#######", "#.....#", "#.#.#.#", "#.....#", "#######", ".#.....", "#......"],
    sliders: [".#.....", "#######", ".#.....", ".......", "....#..", "#######", "....#.."],
    calendar: [".#...#.", "#######", "#.....#", "#######", "#.#.#.#", "#.....#", "#######"],
    // разделы настроек (страницы расширения): поле ввода, плеер, канал, интерфейс
    kbd: [".......", "#######", "#.#.#.#", "#.....#", "#.###.#", "#######", "......."],
    playBox: ["#######", "#.....#", "#.#...#", "#.##..#", "#.#...#", "#.....#", "#######"],
    tv: ["#######", "#.....#", "#.....#", "#.....#", "#######", "...#...", "..###.."],
    sound: ["...#...", "..##.#.", "####..#", "####..#", "####..#", "..##.#.", "...#..."], // динамик и волна — «Только звук»
    ambi: ["#..#..#", ".#####.", ".#...#.", "##...##", ".#...#.", ".#####.", "#..#..#"], // экран и свет вокруг — «Ambilight»
    layout: ["#######", "#.....#", "#######", "#.#...#", "#.#...#", "#.#...#", "#######"],
    flask: [".#####.", "..#.#..", "..#.#..", ".#...#.", "#.....#", "#.###.#", "#######"],
    shield: ["#######", "#.....#", "#.....#", "#.....#", ".#...#.", "..#.#..", "...#..."],
    // модули (их линейные пути — в addIcon самих модулей)
    pencil: [".....#.", "....#.#", "...#.#.", "..#.#..", ".#.#...", "##.....", "#......"],
    emmChannel: ["#######", "#.....#", "#.....#", "#.....#", "#######", "...#...", ".#####."],
    emmTwitch: ["######.", "#.....#", "#.#.#.#", "#.#.#.#", "#....#.", "###.#..", "..#...."],
    emmGlobe: ["..###..", ".#.#.#.", "#..#..#", "#######", "#..#..#", ".#.#.#.", "..###.."],
    emmSparkle: ["...#...", "...#...", "..#.#..", "##...##", "..#.#..", "...#...", "...#..."],
    emmLock: ["..###..", ".#...#.", ".#...#.", "#######", "#..#..#", "#..#..#", "#######"],
    emmUnlock: ["..###..", ".#...#.", ".#.....", "#######", "#..#..#", "#..#..#", "#######"],
    emmStar: [".......", ".#####.", ".#####.", ".#####.", ".#####.", ".#####.", "......."], // избранное — квадрат (владелец 23.10)
    emmBolt: ["....##.", "...##..", "..##...", ".#####.", "...##..", "..##...", ".##...."],
    emmCrown: [".......", "#..#..#", "##.#.##", "#######", "#######", ".......", "#######"],
    emmEmoji: ["..###..", ".#...#.", "#.#.#.#", "#.....#", "#.###.#", ".#...#.", "..###.."],
    emmGif: ["#######", "#.#.#.#", "#######", "#.....#", "#######", "#.#.#.#", "#######"],
    gifStar: [".......", ".#####.", ".#####.", ".#####.", ".#####.", ".#####.", "......."],
    gifImage: ["#######", "#.....#", "#.##..#", "#.....#", "#...#.#", "#.#####", "#######"],
    gifLock: ["..###..", ".#...#.", ".#...#.", "#######", "#..#..#", "#..#..#", "#######"],
    cardHeart: [".......", ".##.##.", "#######", "#######", ".#####.", "..###..", "...#..."],
    cardStar: ["...#...", "..###..", "#######", ".#####.", "..###..", ".##.##.", "##...##"],
    ppLock: ["..###..", ".#...#.", ".#...#.", "#######", "#..#..#", "#..#..#", "#######"],
    ppStop: [".......", ".#####.", ".#####.", ".#####.", ".#####.", ".#####.", "......."],
    ppPlay: [".#.....", ".##....", ".###...", ".####..", ".###...", ".##....", ".#....."],
    ppUndo: ["..#....", ".#.....", "#####..", ".#...#.", "..#..#.", ".....#.", "..###.."],
    ppTrophy: ["#######", "#.###.#", ".#####.", "..###..", "...#...", "..###..", ".#####."],
    // значки состояний (образец, раздел 5) и пр.
    ff: ["#...#..", "##..##.", "###.###", "##..##.", "#...#.."],
    wait: [".##.##.", ".##.##.", ".##.##.", ".##.##.", ".##.##."],
    done: [".....##", "....##.", "#..##..", "####...", ".##...."],
    gauge: [".###.", "#...#", "#.#.#", "#..##", ".###."],
    warn: [".#.", ".#.", ".#.", "...", ".#."],
    ok: ["..#", ".##", "##."],
    chev: ["#...#", ".#.#.", "..#.."],
    sbTri: ["...#...", "..###..", "..#.#..", ".##.##.", ".#####.", "###.###", "#######"],
    pinG: [".###.", ".###.", ".###.", "#####", "..#..", "..#.."],
    // значки строк-событий чата (42_list_ev_kit.js; звезда, корона, сердце, часы, смайлик — выше; 7TV — настоящий
    // логотип, CPX.ui.icon("logo7tv"))
    evGift: [".#...#.", "..#.#..", "#######", "#..#..#", "#..#..#", "#..#..#", "#######"],
    evRaid: ["#..#...", ".#..#..", "..#..#.", "...#..#", "..#..#.", ".#..#..", "#..#..."],
    evNeq: [".....#.", "....#..", "#######", "...#...", "#######", ".#.....", "#......"],
    evPlug: [".#...#.", ".#...#.", "#######", "#######", ".#####.", "...#...", "...#..."],
    evMega: [".....##", "...####", "##.####", "#######", "##.####", "...####", ".....##"],
    evBits: ["...#...", "..###..", ".#####.", "#######", ".#####.", "..###..", "...#..."],
  };
  return g;
})();

/** Клеточный значок → <svg> (или null). size — желаемый размер в px; o.gap — просвет между клетками,
 *  o.cell — размер клетки (по умолчанию — от размера). */
CPX.glyph = (() => {
  const NS = "http://www.w3.org/2000/svg";
  return function (name, size, o) {
    const rows = CPX.glyphs[name];
    if (!rows || typeof document === "undefined") return null;
    o = o || {};
    size = size || 16;
    const n = Math.max(rows.length, rows[0].length);
    // Клетка — целая доля размера (не меньше 2 px): 7×7 → 14–20 px по 2, 21–27 по 3, 28+ по 4…
    const gap = o.gap || 0;
    const cell = o.cell || Math.max(2, Math.floor((size + gap) / n) - gap);
    const pitch = cell + gap;
    const w = rows[0].length * pitch - gap;
    const h = rows.length * pitch - gap;
    // Коробка — не меньше просимого размера; поля — чётные (по целым пикселям, без размытия).
    let box = Math.max(size, n * pitch - gap);
    if ((box - w) % 2) box++;
    let boxH = box;
    if ((boxH - h) % 2) boxH++;
    const ox = (box - w) / 2;
    const oy = (boxH - h) / 2;
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("width", box);
    svg.setAttribute("height", boxH);
    svg.setAttribute("viewBox", "0 0 " + box + " " + boxH);
    svg.setAttribute("shape-rendering", "crispEdges");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.setAttribute("class", "cpx-ico cpx-ico--cell cpx-ico--" + String(name).replace(/[^\w-]/g, ""));
    const paths = {};
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        let ch = row[x];
        if (ch === ".") continue;
        paths[ch] = (paths[ch] || "") + "M" + (ox + x * pitch) + " " + (oy + y * pitch) + "h" + cell + "v" + cell + "h-" + cell + "z";
      }
    });
    for (const ch in paths) {
      const p = document.createElementNS(NS, "path");
      p.setAttribute("d", paths[ch]);
      p.setAttribute("fill", "currentColor");
      svg.appendChild(p);
    }
    return svg;
  };
})();

// ── src/common/08_mz.js ──
/* «Мозаика»: появление / уход / нажатие маской из клеток для элементов ВНЕ теневого слоя окон
 * (подсказки ленты чата и вставки в документе Twitch, страницы расширения). Кадры и классы
 * (cpx-mz-in 170 мс, cpx-mz-out 140 мс, cpx-mz-tap 120 мс) — styles/_mosaic.css; в слое окон — свой
 * путь ядра (U.appear / U.vanish, 95_ui.js, с animationend).
 *
 * CPX.mz.in(el) — класс ставится сразу (зови в той же задаче, где элемент становится видимым: первый
 *   отрисованный кадр уже замаскирован), снимается по таймеру; повторный вызов во время ухода
 *   отменяет уход (жетон).
 * CPX.mz.out(el, done) — маска ухода, затем done() (спрятать/удалить): последний кадр держится до done —
 *   пустого кадра нет.
 * CPX.mz.tap(el) — «нажатие». «Меньше движения» — всё мгновенно.
 * CPX.mz.setOff(v) / off() — настройка «Отключить анимации появления» (general.noAppear): всё мгновенно, как при
 *   «меньше движения», и класс cpx-no-appear на <html> (стили гасят и то, что ставится без CPX.mz, —
 *   styles/_mosaic.css). Ставят миры, где есть наш вид: страница Twitch (95_ui.js), страницы расширения
 *   (pages/10_ext.js). reduced() — только системное «меньше движения» (им же пользуются не-появления:
 *   перебор цифр, превращение значка догона).
 */

CPX.mz = (() => {
  const mq = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
  const reduced = () => !!(mq && mq.matches);
  let off = false;
  const still = () => off || reduced();
  function restart(el, name) {
    if (el.classList.contains(name)) {
      el.classList.remove(name);
      void el.offsetWidth;
    }
    el.classList.add(name);
  }
  return {
    reduced,
    off: () => off,
    setOff(v) {
      off = !!v;
      if (typeof document !== "undefined" && document.documentElement) document.documentElement.classList.toggle("cpx-no-appear", off);
    },
    in(el) {
      if (!el) return;
      el._cpxMzOut = null;
      el.classList.remove("cpx-mz-out");
      if (still()) return;
      const tok = (el._cpxMzIn = {});
      restart(el, "cpx-mz-in");
      setTimeout(() => el._cpxMzIn === tok && el.classList.remove("cpx-mz-in"), 230);
    },
    out(el, done) {
      if (!el) return done && done();
      el._cpxMzIn = null;
      el.classList.remove("cpx-mz-in");
      if (still() || !el.isConnected) return done && done();
      const tok = (el._cpxMzOut = {});
      restart(el, "cpx-mz-out");
      setTimeout(() => {
        if (el._cpxMzOut !== tok) return;
        el.classList.remove("cpx-mz-out");
        if (done) done();
      }, 200);
    },
    tap(el) {
      if (!el || still()) return;
      restart(el, "cpx-mz-tap");
      setTimeout(() => el.classList.remove("cpx-mz-tap"), 180);
    },
  };
})();

// ── src/common/09_mzj.js ──
/* «Мозаика»: форма с выбоинами (задание §4.5) — общий модуль: окна ядра на Twitch (95_ui.js: U.mzj) и
 * страницы расширения (pages/20_pages.js: оболочка настроек, лист согласия). Только расчёт и наблюдатели —
 * при загрузке ничего не трогает (модуль есть и в фоне, где DOM нет).
 *
 * CPX.mzj.attach(el, {kind, seed, steps, bites, maxDepth, smallK2, body}) — сетка клеток подогнана под
 *   размер ТОЧНО (клеток round(ширина/c), границы round(i·ширина/клеток)), углы-лестницы (один — самый
 *   глубокий), редкие выбоины по сторонам → контур → многоугольник; внутренний — сдвиг на 1 px. Правые и
 *   нижние вершины — calc(100% − N px): край совпадает с краем элемента и при дробной ширине (125–150 %).
 *   Выбоины — только если ширина ≥ 240 и высота ≥ 120, глубина 1 клетка (до 2 — если меньшая сторона ≥ 360
 *   и maxDepth ≥ 2). Зерно — от вида окна (kind): углы одного окна всегда одинаковые. Пересчёт — одним
 *   общим ResizeObserver (до отрисовки: кадра «без формы» нет), только при смене размера; во время
 *   анимированной смены ширины/высоты (transition) форма держится и пересчитывается по transitionend.
 *   body — тело с прокруткой (элемент или функция): обрезается тем же внутренним контуром. До расчёта и
 *   при «перешейке» — запасная форма k2 (styles/_mosaic.css: .cpx-mzj:not([data-cpx-shaped])).
 * CPX.mzj.detach(el) · .reshape(el) — пересчитать сейчас · .hash(строка) — зерно.
 */

CPX.mzj = (() => {
  function mzRng(seed) {
    return function () {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const hash = (s) => {
    let h = 2166136261;
    for (const ch of String(s || "")) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
    return h >>> 0;
  };
  function carve(cols, rows, r, steps, bites, depth) {
    const m = new Uint8Array(cols * rows).fill(1);
    const off = (x, y) => {
      if (x >= 0 && y >= 0 && x < cols && y < rows) m[y * cols + x] = 0;
    };
    const deep = Math.floor(r() * 4);
    const corners = [[0, 0, 1, 1], [cols - 1, 0, -1, 1], [0, rows - 1, 1, -1], [cols - 1, rows - 1, -1, -1]];
    corners.forEach((c, k) => {
      let d = steps <= 0 ? 0 : Math.max(1, Math.round(steps * (0.4 + r() * 0.6)));
      if (k === deep && steps > 0) d = steps;
      for (let i = 0; i < d; i++) for (let j = 0; j < d - i; j++) off(c[0] + c[2] * i, c[1] + c[3] * j);
    });
    if (bites > 0) {
      const margin = Math.max(steps, 1) + 2;
      const side = (len0, place) => {
        for (let p = margin; p < len0 - margin; p++) {
          if (r() < bites) {
            const len = 1 + Math.floor(r() * 4);
            const dd = depth > 1 && r() < 0.35 ? 2 : 1;
            for (let a = 0; a < len && p + a < len0 - margin; a++) for (let b = 0; b < dd; b++) place(p + a, b);
            p += len + 2;
          }
        }
      };
      side(cols, (x, b) => off(x, b));
      side(cols, (x, b) => off(x, rows - 1 - b));
      side(rows, (y, b) => off(b, y));
      side(rows, (y, b) => off(cols - 1 - b, y));
    }
    return m;
  }
  /** Контур клеток по часовой стрелке (без промежуточных точек на прямых); null — не один контур. */
  function trace(m, cols, rows) {
    const on = (x, y) => x >= 0 && y >= 0 && x < cols && y < rows && m[y * cols + x] === 1;
    const next = new Map();
    let count = 0;
    const add = (x1, y1, x2, y2) => {
      next.set(x1 * 65536 + y1, [x2, y2]);
      count++;
    };
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (!on(x, y)) continue;
        if (!on(x, y - 1)) add(x, y, x + 1, y);
        if (!on(x + 1, y)) add(x + 1, y, x + 1, y + 1);
        if (!on(x, y + 1)) add(x + 1, y + 1, x, y + 1);
        if (!on(x - 1, y)) add(x, y + 1, x, y);
      }
    }
    if (next.size !== count) return null; // «перешеек»
    let start = null;
    for (const k of next.keys()) {
      const p = [Math.floor(k / 65536), k % 65536];
      if (!start || p[1] < start[1] || (p[1] === start[1] && p[0] < start[0])) start = p;
    }
    const pts = [];
    let cur = start;
    do {
      pts.push(cur);
      cur = next.get(cur[0] * 65536 + cur[1]);
      if (!cur || pts.length > count) return null;
    } while (cur[0] !== start[0] || cur[1] !== start[1]);
    if (pts.length !== count) return null; // больше одного контура
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i - 1 + pts.length) % pts.length];
      const b = pts[i];
      const c = pts[(i + 1) % pts.length];
      if ((a[0] === b[0] && b[0] === c[0]) || (a[1] === b[1] && b[1] === c[1])) continue;
      out.push(b);
    }
    return out;
  }
  /** Тот же контур на 1 px внутрь: вершина + нормаль входящего ребра + нормаль исходящего. */
  function insetPoly(P) {
    const n = P.length;
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = P[(i - 1 + n) % n];
      const b = P[i];
      const c = P[(i + 1) % n];
      const d1 = [Math.sign(b[0] - a[0]), Math.sign(b[1] - a[1])];
      const d2 = [Math.sign(c[0] - b[0]), Math.sign(c[1] - b[1])];
      out.push([b[0] - d1[1] - d2[1], b[1] + d1[0] + d2[0]]);
    }
    return out;
  }
  /** Многоугольник для clip-path: правые/нижние вершины — от 100%. ox/oy — сдвиг (тело внутри окна),
   * w/h — размер обрезаемого элемента (точки зажимаются в его пределы). */
  function polyCss(P, w, h, ox, oy) {
    const c = (v, full) => {
      v = Math.max(0, Math.min(full, v));
      return v > full / 2 ? "calc(100% - " + (full - v) + "px)" : v + "px";
    };
    return "polygon(" + P.map((p) => c(p[0] - (ox || 0), w) + " " + c(p[1] - (oy || 0), h)).join(",") + ")";
  }
  function unshape(el, z) {
    el.removeAttribute("data-cpx-shaped");
    el.style.removeProperty("--cpx-mz-o");
    el.style.removeProperty("--cpx-mz-i");
    if (z.body) z.body.style.clipPath = "";
  }
  function shape(el) {
    const z = el._cpxMz;
    if (!z || z.hold) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    if (!w || !h) return;
    const body = typeof z.body === "function" ? z.body() : z.body;
    if (body !== z.bodyEl && z.bodyEl) z.bodyEl.style.clipPath = "";
    z.bodyEl = body || null;
    const bt = body ? body.offsetTop : 0;
    const bl = body ? body.offsetLeft : 0;
    const bw = body ? body.offsetWidth : 0;
    const bh = body ? body.offsetHeight : 0;
    const sig = w + "," + h + "," + bt + "," + bl + "," + bw + "," + bh;
    if (z.sig === sig) return;
    z.sig = sig;
    const c = parseFloat(getComputedStyle(el).getPropertyValue("--cpx-c")) || 8;
    const cols = Math.max(6, Math.round(w / c));
    const rows = Math.max(6, Math.round(h / c));
    let bites = z.bites || 0;
    let depth = Math.min(2, z.maxDepth || 1);
    if (w < 240 || h < 120) {
      // мелким и низким — только углы; всплывашкам — готовая форма k2
      if (z.smallK2) return unshape(el, { body });
      bites = 0;
    }
    if (Math.min(w, h) < 360) depth = 1;
    const pts = trace(carve(cols, rows, mzRng(z.seed), z.steps, bites, depth), cols, rows);
    if (!pts) return unshape(el, { body });
    const P = pts.map((p) => [Math.round((p[0] * w) / cols), Math.round((p[1] * h) / rows)]);
    const I = insetPoly(P);
    el.style.setProperty("--cpx-mz-o", polyCss(P, w, h));
    el.style.setProperty("--cpx-mz-i", polyCss(I, w, h));
    el.setAttribute("data-cpx-shaped", "");
    if (body && bw && bh) body.style.clipPath = polyCss(I, bw, bh, bl, bt);
  }
  const shapeRo =
    typeof ResizeObserver === "function"
      ? new ResizeObserver((entries) => {
          for (const e of entries) CPX.safely("ui:shape", () => shape(e.target));
        })
      : null;
  const SIZE_PROPS = /^(width|height|max-height|max-width|min-height|min-width|flex-basis|grid-template-columns)$/;
  function attach(el, o) {
    o = o || {};
    el.classList.remove("cpx-k1", "cpx-k2", "cpx-k21");
    el.classList.add("cpx-mzj");
    el._cpxMz = {
      seed: o.seed != null ? o.seed : hash(o.kind || "cpx"),
      steps: o.steps != null ? o.steps : 2,
      bites: o.bites != null ? o.bites : 0.07,
      maxDepth: o.maxDepth || 1,
      smallK2: !!o.smallK2,
      body: o.body || null,
      hold: false,
      sig: "",
    };
    // Анимированная смена размера (раскрытие ленты карточки, рост панели) — не пересчитывать каждый
    // кадр: держать форму и пересчитать по окончании перехода.
    const z = el._cpxMz;
    el.addEventListener("transitionrun", (e) => {
      if (SIZE_PROPS.test(e.propertyName)) z.hold = true;
    });
    const done = (e) => {
      if (!z.hold || !SIZE_PROPS.test(e.propertyName)) return;
      z.hold = false;
      CPX.safely("ui:shape", () => shape(el));
    };
    el.addEventListener("transitionend", done);
    el.addEventListener("transitioncancel", done);
    if (shapeRo) shapeRo.observe(el);
    return el;
  }
  return {
    hash,
    attach,
    detach: (el) => shapeRo && shapeRo.unobserve(el),
    reshape(el) {
      if (el && el._cpxMz) {
        el._cpxMz.sig = "";
        shape(el);
      }
    },
  };

})();

// ── src/common/10_safe.js ──
/* Безопасность данных извне: адреса картинок, цвета, построение DOM.
 *
 * ПРАВИЛА (из экранного чата OBS, проверены атакой):
 *  • текст людей — только textContent / текстовые узлы; innerHTML — только для
 *    своих констант;
 *  • картинки — только https с доменов из списка IMG_HOSTS, без кавычек, скобок,
 *    пробелов и обратной косой (адрес может попасть в CSS url(...));
 *  • цвета — только #rrggbb / #rrggbbaa после разбора.
 */

CPX.safe = (() => {
  // Домены картинок (и их поддомены). Новый источник картинок — добавить сюда.
  const IMG_HOSTS = [
    "jtvnw.net", // Twitch: смайлики, бейджи, аватарки
    "twitchcdn.net",
    "twitch.tv",
    "7tv.app", // 7TV: cdn.7tv.app
    "7tv.io",
    "betterttv.net", // BTTV: cdn.betterttv.net
    "frankerfacez.com", // FFZ: cdn.frankerfacez.com
    "ffzap.com", // FFZ:AP
    "chatterino.com",
    "fourtf.com",
    "chatterinohomies.com",
    "itzalex.github.io",
    "eblo.id", // наш сервер: chat.eblo.id, ws.chat.eblo.id
    "rish098.xyz",
    "d3aqoihi2n8ty8.cloudfront.net", // битсы Twitch
    "giphy.com",
    "files.kick.com", // Kick: свои смайлики Kick в строках, которые рисуем сами (src/kick, 15.11)
  ];

  const BAD_CHARS = /["'()\\\s<>`]/;

  function hostAllowed(host) {
    host = host.toLowerCase();
    return IMG_HOSTS.some((h) => host === h || host.endsWith("." + h));
  }

  /** Адрес картинки или "" если он не годится. */
  function imgUrl(url) {
    if (typeof url !== "string" || url.length > 2048 || BAD_CHARS.test(url)) return "";
    if (url.startsWith("//")) url = "https:" + url;
    let u;
    try {
      u = new URL(url);
    } catch (_) {
      return "";
    }
    if (u.protocol !== "https:" || !hostAllowed(u.hostname)) return "";
    return u.href;
  }

  const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

  /** Цвет в виде #rrggbb(aa) или "" если строка не цвет. */
  function hex(c) {
    if (typeof c !== "string") return "";
    const m = HEX_RE.exec(c.trim());
    if (!m) return "";
    let h = m[1].toLowerCase();
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return "#" + h;
  }

  /** Число в пределах [lo, hi], иначе def. */
  function num(v, lo, hi, def) {
    const n = Number(v);
    if (!Number.isFinite(n)) return def;
    return Math.min(hi, Math.max(lo, n));
  }

  /** Имя/идентификатор для классов и атрибутов: только [A-Za-z0-9_-]. */
  function ident(s, max = 64) {
    return String(s == null ? "" : s).replace(/[^A-Za-z0-9_-]/g, "").slice(0, max);
  }

  /** Картинка нашего сервера через другую дверь: ws.chat.eblo.id ↔ chat.eblo.id (тот же сервер, тот же путь) — или "".
   *  Хостер включает «проверку браузера» то на одной двери, то на другой (18.11 — chat, 20.11 — ws: 403 на картинки) —
   *  не загрузилась по ссылке сервера, вторая попытка — через другую (значки и пейнты PLUS, аватарки, значок ивента). */
  function otherDoor(url) {
    const m = /^https:\/\/(ws\.chat\.eblo\.id|chat\.eblo\.id)(\/[^\s"'()<>\\`]*)$/.exec(String(url || ""));
    return m ? "https://" + (m[1] === "chat.eblo.id" ? "ws.chat.eblo.id" : "chat.eblo.id") + m[2] : "";
  }

  return { IMG_HOSTS, imgUrl, hex, num, ident, hostAllowed, otherDoor };
})();

/* Построение DOM: el("div", {class: "a", title: t, onclick: fn}, [детей...]).
 * Строки-дети становятся текстовыми узлами (никакого HTML). Атрибут style —
 * только объектом {свойство: значение}. Есть только там, где есть document. */
if (typeof document !== "undefined") {
  CPX.el = function el(tag, attrs, children) {
    const n = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === "class") n.className = v;
        else if (k === "style" && typeof v === "object") Object.assign(n.style, v);
        else if (k === "text") n.textContent = v;
        else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
        else if (k === "dataset" && typeof v === "object") Object.assign(n.dataset, v);
        else n.setAttribute(k, v === true ? "" : String(v));
      }
    }
    if (children != null) CPX.el.append(n, children);
    return n;
  };
  CPX.el.append = function (parent, children) {
    if (!Array.isArray(children)) children = [children];
    for (const c of children) {
      if (c == null || c === false) continue;
      parent.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
    }
    return parent;
  };
  /** Своя разметка из доверенной константы (НИКОГДА не из данных извне). */
  CPX.el.trusted = function (html) {
    const t = document.createElement("template");
    t.innerHTML = html;
    return t.content;
  };
}

// ── src/common/12_sound.js ──
/* Звук упоминаний (раздел «Упоминания», владелец 14.10): стёклышко по умолчанию и свой файл человека. Общий для чата
 * на Twitch (46_list_mentions) и страницы настроек (pages/33_mentions: «Прослушать», проверка файла).
 *
 * Стёклышко — звон с сайта (личный кабинет PLUS, круг дней: glassTink в plus/index.html): синус с призвуками
 * 1 : 2,76 : 5,4 : 8,93, атака 3 мс, щелчок шума (12 мс, выше 5,2 кГц), эхо маленькой комнаты, мягкое скругление
 * пиков. Для уведомления («нейтральным, коротким и приятным») — два звона подряд вверх на квинту (ми и си третьей
 * октавы), посередине, без объёма и разброса высоты; весь звук ~0,4 с, пик около −7 дБ (замер стенда).
 *
 * Правило браузеров: страница не может начать звук, пока человек на ней ни разу не щёлкнул и не нажал клавишу. Звук
 * закрыт — звон пропускаем, а не копим (иначе всё накопленное прозвучало бы разом после щелчка). После тишины —
 * усыпляем (поток звука не держим).
 *   CPX.sound.glass(громкость)            — стёклышко;
 *   CPX.sound.play(AudioBuffer, громкость) — свой звук; громкость 0…1 (нет — 1; владелец 23.10: ползунок в «Упоминаниях»);
 *   CPX.sound.decode(ArrayBuffer) → Promise<AudioBuffer> (не звук — ошибка);
 *   CPX.sound.toB64 / fromB64    — файл ↔ строка (хранит фон, src/bg/24_sound.js);
 *   CPX.sound.unlock()           — щелчок человека: открыть звук заранее;
 *   CPX.sound._draw(ctx, t)      — стёклышко в любой контекст (стенд: замер в OfflineAudioContext).
 * В фоне Chrome (service worker) звука нет — всё молча ничего не делает.
 */

CPX.sound = (() => {
  const C = typeof AudioContext === "function" ? AudioContext : null;
  const NOTES = [
    [1318.51, 0, 0.4, 0.8], // ми: частота, сдвиг (с), громкость, яркость призвуков
    [1975.53, 0.085, 0.3, 0.65], // си — квинта выше
  ];
  let ac = null;
  let main = null; // {out, noise} контекста ac
  let idleT = 0;

  /** Выход: громкость → скругление пиков (tanh) → колонки; эхо комнаты примешано тихо. */
  function graph(a) {
    const out = a.createGain();
    out.gain.value = 0.9;
    const clip = a.createWaveShaper();
    const N = 2049;
    const curve = new Float32Array(N);
    for (let i = 0; i < N; i++) curve[i] = Math.tanh((i / (N - 1)) * 2 - 1);
    clip.curve = curve;
    clip.oversample = "2x";
    out.connect(clip);
    clip.connect(a.destination);
    if (a.createConvolver) {
      const sr = a.sampleRate;
      const len = Math.floor(sr * 0.45);
      const ir = a.createBuffer(2, len, sr);
      for (let c = 0; c < 2; c++) {
        const d = ir.getChannelData(c);
        let lp = 0;
        for (let i = 0; i < len; i++) {
          const t = i / sr;
          lp += (Math.random() * 2 - 1 - lp) * 0.3;
          d[i] = lp * Math.exp(-t / 0.07) * Math.min(1, t / 0.006);
        }
      }
      const cv = a.createConvolver();
      const wet = a.createGain();
      cv.buffer = ir;
      wet.gain.value = 0.6;
      out.connect(cv);
      cv.connect(wet);
      wet.connect(clip);
    }
    const len = Math.floor(a.sampleRate * 0.012);
    const noise = a.createBuffer(1, len, a.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    return { out, noise };
  }

  function tink(a, g, t, hz, gain, bright, vol) {
    const bus = a.createGain();
    bus.gain.value = gain * vol;
    bus.connect(g.out);
    for (const [ratio, amp, dur] of [
      [1, 1, 0.36],
      [2.76, 0.3 * bright, 0.16],
      [5.4, 0.13 * bright, 0.09],
      [8.93, 0.05 * bright, 0.05],
    ]) {
      if (hz * ratio > a.sampleRate * 0.45) continue; // выше предела звуковой карты — свист, пропускаем
      const osc = a.createOscillator();
      const env = a.createGain();
      osc.frequency.value = hz * ratio;
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(amp, t + 0.003);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 0.003 + dur);
      osc.connect(env);
      env.connect(bus);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    }
    const ns = a.createBufferSource();
    const hp = a.createBiquadFilter();
    const ng = a.createGain();
    ns.buffer = g.noise;
    hp.type = "highpass";
    hp.frequency.value = 5200;
    ng.gain.value = 0.09 * bright;
    ns.connect(hp);
    hp.connect(ng);
    ng.connect(bus);
    ns.start(t);
  }

  function draw(a, t, g, vol) {
    g = g || graph(a);
    const v = vol == null ? 1 : Math.max(0, Math.min(1, vol));
    for (const [hz, dt, gain, bright] of NOTES) tink(a, g, t + dt, hz, gain, bright, v);
  }

  function ctx() {
    if (!C) return null;
    if (!ac) {
      try {
        ac = new C();
        main = graph(ac);
      } catch (_) {
        ac = null;
        return null;
      }
    }
    return ac;
  }
  function sleepAfter(ms) {
    clearTimeout(idleT);
    idleT = setTimeout(() => ac && ac.state === "running" && ac.suspend().catch(() => {}), ms);
  }
  /** Сыграть, если звук открыт (или откроется тут же — разрешение уже есть); закрыт — пропустить. */
  function run(fn, ms) {
    const a = ctx();
    if (!a) return false;
    const go = () => {
      fn(a);
      sleepAfter(ms);
    };
    if (a.state === "running") {
      go();
      return true;
    }
    const at = performance.now();
    a.resume().then(
      () => a.state === "running" && performance.now() - at < 400 && go(),
      () => {}
    );
    return true;
  }

  return {
    glass: (vol) => (vol === 0 ? false : run((a) => draw(a, a.currentTime + 0.01, main, vol), 3000)),
    play: (buf, vol) =>
      !!buf &&
      vol !== 0 &&
      run((a) => {
        const s = a.createBufferSource();
        s.buffer = buf;
        if (vol == null || vol >= 1) s.connect(a.destination);
        else {
          const g = a.createGain();
          g.gain.value = Math.max(0, vol);
          s.connect(g);
          g.connect(a.destination);
        }
        s.start();
      }, Math.max(3000, buf.duration * 1000 + 500)),
    decode(ab) {
      const a = ctx();
      return a ? a.decodeAudioData(ab.slice(0)) : Promise.reject(new Error("нет звука"));
    },
    toB64(ab) {
      const u = new Uint8Array(ab);
      let s = "";
      for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
      return btoa(s);
    },
    fromB64(b64) {
      const s = atob(b64);
      const u = new Uint8Array(s.length);
      for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
      return u.buffer;
    },
    unlock() {
      const a = ctx();
      if (a && a.state !== "running") a.resume().then(() => sleepAfter(3000), () => {});
    },
    _draw: draw,
  };
})();

// ── src/common/20_i18n.js ──
/* Перевод интерфейса: русский и английский.
 *
 * Каждый модуль регистрирует свои строки сам — рядом со своим кодом:
 *     CPX.i18n.add({ ru: { "card.ban": "Бан" }, en: { "card.ban": "Ban" } });
 * и пользуется ими: CPX.t("card.ban"), CPX.t("card.bans", { n: 3 }).
 * Подстановки — {имя}. Не нашлось в текущем языке — берём английский, потом ключ.
 *
 * Язык: настройка lang ("auto" | "ru" | "en"); auto — по языку браузера.
 * chrome.i18n в мире страницы недоступен, поэтому свой словарь (а _locales —
 * только для названия и описания в магазине).
 */

CPX.i18n = (() => {
  const dict = { ru: Object.create(null), en: Object.create(null) };
  let lang = detect("auto");

  function detect(pref) {
    if (pref === "ru" || pref === "en") return pref;
    const nav = (typeof navigator !== "undefined" && (navigator.language || "")) || "";
    return /^(ru|uk|be|kk)\b/i.test(nav) ? "ru" : "en";
  }

  function add(tables) {
    for (const l in tables) {
      if (!dict[l]) continue;
      Object.assign(dict[l], tables[l]);
    }
  }

  function t(key, vars) {
    let s = dict[lang][key];
    if (s == null) s = dict.en[key];
    if (s == null) return key;
    if (typeof s === "function") return s(vars || {});
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
    return s;
  }

  /** Русское склонение по числу: plural(5, ["смайлик", "смайлика", "смайликов"]). */
  function plural(n, forms) {
    n = Math.abs(n) % 100;
    const n1 = n % 10;
    if (n > 10 && n < 20) return forms[2];
    if (n1 > 1 && n1 < 5) return forms[1];
    if (n1 === 1) return forms[0];
    return forms[2];
  }

  return {
    add,
    t,
    plural,
    setLang(pref) {
      lang = detect(pref);
    },
    get lang() {
      return lang;
    },
  };
})();

CPX.t = CPX.i18n.t;

// ── src/common/30_color.js ──
/* Цвета: разбор, смешивание, читаемость ника на фоне чата. */

CPX.color = (() => {
  function parse(c) {
    const h = CPX.safe.hex(c);
    if (!h) return null;
    return {
      r: parseInt(h.slice(1, 3), 16),
      g: parseInt(h.slice(3, 5), 16),
      b: parseInt(h.slice(5, 7), 16),
      a: h.length === 9 ? parseInt(h.slice(7, 9), 16) / 255 : 1,
    };
  }

  const to2 = (v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0");

  function hex(c) {
    return "#" + to2(c.r) + to2(c.g) + to2(c.b) + (c.a != null && c.a < 1 ? to2(c.a * 255) : "");
  }

  function mix(a, b, t) {
    const x = typeof a === "string" ? parse(a) : a;
    const y = typeof b === "string" ? parse(b) : b;
    if (!x || !y) return "";
    return hex({ r: x.r + (y.r - x.r) * t, g: x.g + (y.g - x.g) * t, b: x.b + (y.b - x.b) * t });
  }

  /** Относительная яркость по WCAG. */
  function luminance(c) {
    const x = typeof c === "string" ? parse(c) : c;
    if (!x) return 0;
    const f = (v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(x.r) + 0.7152 * f(x.g) + 0.0722 * f(x.b);
  }

  function contrast(a, b) {
    const l1 = luminance(a);
    const l2 = luminance(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }

  /** Сделать цвет ника читаемым на фоне bg (как «читаемые цвета» Twitch/клиента):
   * тёмный фон — осветляем, светлый — затемняем, пока контраст не станет ≥ min. */
  function readable(color, bg, min = 4.5) {
    const c = parse(color);
    const b = parse(bg);
    if (!c || !b) return color;
    if (contrast(c, b) >= min) return hex(c);
    const toward = luminance(b) < 0.5 ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 };
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      const m = { r: c.r + (toward.r - c.r) * mid, g: c.g + (toward.g - c.g) * mid, b: c.b + (toward.b - c.b) * mid };
      if (contrast(m, b) >= min) hi = mid;
      else lo = mid;
    }
    return hex({ r: c.r + (toward.r - c.r) * hi, g: c.g + (toward.g - c.g) * hi, b: c.b + (toward.b - c.b) * hi });
  }

  return { parse, hex, mix, luminance, contrast, readable };
})();

// ── src/common/39_mod_slider.js ──
/* Ползунок модерации — общий движок (режим «Ползунок», настройка mod.mode; владелец 04.10: «по умолчанию у
 * модератора — ползунок, как у 7TV, но намного лучше и удобнее»).
 *
 * Где: в строках чата Twitch (src/main/81_mod_buttons.js) и в живом примере на странице настроек
 * (src/pages/30_mod_editor.js) — один и тот же код и одни стили (styles/_modslider.css): пример ведёт себя
 * ровно как чат.
 *
 * КАК РАБОТАЕТ. Ручка (.cpx-sl) — в левом отступе строки во всю её высоту, текст не сдвигает; значок в ней —
 * по середине ника, у сообщения в две линии и больше — полоса во всё сообщение (place, замер по высоте). Тянут вправо — строка едет за
 * рукой, слева открывается полоса с короткой подписью: «Удалить» → сроки мута («10 мин») → «Бан»; влево —
 * «Разбан» (справа). Отпустили — действие, строка возвращается на место. Вид — «Мозаика», тихий (владелец
 * 04.10: «не жёсткий, очень минимальный и незаметный»): полоса — лёгкий отлив цвета шага с кромкой из
 * клеток у ручки, отметки ступеней — клетки 2×2, подпись — маленькая плашка с цветным текстом.
 *   • Ступени, а не кривая. У 7TV срок — 10-я степень расстояния (ModSliderBackend.ts): ровно 10 минут не
 *     поставить, подпись округлена, а уходит «1h42m17s». Здесь у каждого срока из настроек (mod.slider)
 *     своя зона одной ширины (ход — mod.sliderStep: 16/22/30 px). Внутри зоны строка «прилипает» к её
 *     середине (MAGNET — идёт за рукой на 30 %), на границе перескакивает к следующей: ощущается как
 *     щелчки. Гистерезис 3 px — дрожь руки на границе не мигает сроками. Подпись = ровно то, что уйдёт.
 *   • Бан отделён «стенкой»: зона последнего шага перед ним шире на 60 % (и толще отметка на полосе).
 *   • Мёртвая зона 16 px от точки захвата и порог начала 4 px: случайное касание ничего не делает.
 *   • Узкий чат — шаги сжимаются (не уже 10 px), чтобы бан помещался в строку.
 *   • Отмена: вернуть в мёртвую зону; Esc; правый щелчок; увести руку вверх/вниз дальше 56 px (вернул
 *     ближе 40 — снова действует); потеря захвата, уход из окна, отмена указателя системой (у 7TV ни
 *     одной из них нет, а после pointercancel их ручка выполняла застрявшую команду от простого касания).
 *   • Цель — строка, за которую взяли: захват указателя на корне; строка ушла из документа или в ней уже
 *     другое сообщение — отмена, а не действие вслепую. Только левая кнопка мыши / первый палец.
 *   • Щелчок без перетаскивания — ручка «подмигивает» вправо: её тянут, а не нажимают.
 *   Пока тянут, хозяин придерживает список (host.hold) — строка не уезжает из-под руки.
 * Каждое движение — только transform/width трёх узлов, без замеров (замер — один раз, в начале).
 *
 * API:
 *   CPX.modSlider.DEF / STEP — сроки по умолчанию (секунды) / ширина ступени по mod.sliderStep (s, m, l);
 *   stops(raw) → проверенные сроки: целые 1…1209600, без повторов, по возрастанию, не больше 15;
 *   plan({stops, del, ban, unban, unrestrict}) → {right:[шаг], left:[шаг]}; шаг {kind:"del"|"to"|"ban"|"unban"|
 *     "unrestrict", secs?}; unrestrict — снять ограничения с подозрительного (влево, на месте разбана; владелец 23.10);
 *   label(шаг) / short(секунды) — подписи («Удалить», «10 мин», «1 ч 30 мин», «Бан»); paint(шаг) → [цвет на
 *   тёмной теме, цвет на светлой];
 *   handle({banned, busy, soft}) → ручка для строки (soft — приглушённая: можно только удалить — своё сообщение,
 *     сообщение модератора у ведущего модератора, 81);
 *   attach(root, host) → detach. host: ctx(строка) → ctx | null; plan(ctx, строка) → план | null (нельзя);
 *     apply(ctx, шаг, план, строка); hold?() → release; step?() → px; start?(ctx) — начали тянуть;
 *     tap?(ручка, pointerType) — щёлкнули, не потянув (подсказка);
 *   release(ручка) — снять наблюдение за ручкой, которую убирают (перерисовка строки).
 * Строка — .cpx-msg > .cpx-msg__in (как в src/main/41_list_line.js); едет .cpx-msg__in.
 */

CPX.modSlider = (() => {
  CPX.i18n.add({
    ru: {
      "msl.del": "Удалить",
      "msl.ban": "Бан",
      "msl.unban": "Разбан",
      "msl.unrestrict": "Снять ограничения",
      "msl.cancel": "Отмена",
      "msl.u.d": "д",
      "msl.u.h": "ч",
      "msl.u.m": "мин",
      "msl.u.s": "с",
    },
    en: {
      "msl.del": "Delete",
      "msl.ban": "Ban",
      "msl.unban": "Unban",
      "msl.unrestrict": "Unrestrict",
      "msl.cancel": "Cancel",
      "msl.u.d": "d",
      "msl.u.h": "h",
      "msl.u.m": "min",
      "msl.u.s": "s",
    },
  });

  const MAX = 1209600; // 2 недели — предел Twitch
  const DEF = [1, 30, 60, 600, 1800, 3600, 86400, 604800, 1209600];
  const STEP = { s: 16, m: 22, l: 30 };
  const MAX_STOPS = 15;
  const DZ = 16; // мёртвая зона от точки захвата, px
  const START = 4; // порог начала перетаскивания
  const HYST = 3; // гистерезис на границах ступеней
  const MAGNET = 0.3; // внутри ступени строка идёт за рукой на 30 %
  const V_OUT = 56; // ушли по вертикали дальше — «Отмена»
  const V_IN = 40; // вернулись ближе — снова действует
  const BAN_GAP = 0.6; // «стенка» перед баном — доля ступени
  const UNBAN_W = 1.5; // зона разбана — в ступенях

  function stops(raw) {
    const out = [];
    for (const v of Array.isArray(raw) ? raw : []) {
      const n = Number(v);
      if (Number.isInteger(n) && n >= 1 && n <= MAX && !out.includes(n)) out.push(n);
    }
    out.sort((a, b) => a - b);
    return out.slice(0, MAX_STOPS);
  }

  const UNITS = [
    ["d", 86400],
    ["h", 3600],
    ["m", 60],
    ["s", 1],
  ];
  /** Секунды → «10 мин», «1 ч 30 мин», «14 д» (все части — подпись совпадает с тем, что уйдёт). */
  function short(secs) {
    let r = Math.round(Number(secs) || 0);
    const out = [];
    for (const [u, k] of UNITS) {
      if (r < k) continue;
      const n = Math.floor(r / k);
      r -= n * k;
      out.push(n + " " + CPX.t("msl.u." + u));
    }
    return out.join(" ") || "0 " + CPX.t("msl.u.s");
  }

  function plan(o) {
    o = o || {};
    const right = [];
    if (o.del) right.push({ kind: "del" });
    const st = stops(o.stops);
    st.forEach((secs, j) => right.push({ kind: "to", secs, sev: st.length > 1 ? j / (st.length - 1) : 0.5 }));
    if (o.ban) right.push({ kind: "ban" });
    return { right, left: o.unban ? [{ kind: "unban" }] : o.unrestrict ? [{ kind: "unrestrict" }] : [] };
  }

  function label(s) {
    if (!s) return "";
    if (s === "cancel") return CPX.t("msl.cancel");
    if (s.kind === "to") return short(s.secs);
    return CPX.t("msl." + s.kind);
  }

  /** Цвет шага — палитра «Мозаики» [тёмная тема Twitch, светлая]: удалить — светло-серый, мут — от лаванды
   *  через розовый к красному по тяжести срока, бан — красный, разбан — зелёный (как кнопка разбана),
   *  отмена и мёртвая зона — приглушённый серый. */
  function paint(s) {
    if (!s || s === "cancel") return ["#8d8a99", "#6b6878"];
    if (s.kind === "del") return ["#c9c8d2", "#55535f"];
    if (s.kind === "to") {
      const h = Math.round(254 + 100 * s.sev);
      return ["hsl(" + h + ", 80%, 79%)", "hsl(" + h + ", 52%, 46%)"];
    }
    if (s.kind === "ban") return ["#f24d5c", "#c42b3a"];
    return ["#3fb950", "#2b8a39"];
  }

  // Удаление — значок корзины, не слово: первая ступень узкая (~25 px), «Удалить» налезало бы на ник.
  let TRASH = null;
  function trash() {
    if (!TRASH) {
      const NS = "http://www.w3.org/2000/svg";
      TRASH = document.createElementNS(NS, "svg");
      TRASH.setAttribute("viewBox", "0 0 16 16");
      TRASH.setAttribute("width", "14");
      TRASH.setAttribute("height", "14");
      TRASH.setAttribute("aria-hidden", "true");
      TRASH.setAttribute("class", "cpx-sl-ico");
      const p = document.createElementNS(NS, "path");
      p.setAttribute("d", "M2.4 4.16H13.6M6.4 4.16V2.4H9.6V4.16M3.84 4.64L4.64 13.44H11.36L12.16 4.64M6.4 5.92L6.72 12.16M8 5.92V12.16M9.6 5.92L9.28 12.16");
      TRASH.appendChild(p);
    }
    return TRASH.cloneNode(true);
  }

  function handle(o) {
    const h = document.createElement("span");
    h.className = "cpx-sl" + (o && o.banned ? " cpx-sl--banned" : "") + (o && o.busy ? " cpx-sl--busy" : "") + (o && o.soft ? " cpx-sl--soft" : "");
    h.setAttribute("aria-hidden", "true");
    h.appendChild(document.createElement("i"));
    if (ro) {
      ro.observe(h);
      watched.add(h);
      if (++made % 300 === 0) sweep();
    }
    return h;
  }
  /** Снять наблюдение (ручку убирают из строки). */
  function release(h) {
    if (ro && watched.delete(h)) ro.unobserve(h);
  }
  // Ручка, ни разу не отрисованная (скрытая строка), уведомления «ушла» не получит, а Firefox держит
  // наблюдаемое сильно — поэтому список и редкая чистка ушедших из документа.
  const watched = new Set();
  let made = 0;
  function sweep() {
    for (const h of watched) if (!h.isConnected) release(h);
  }

  /* ── место значка в ручке ─────────────────────────────────────────────────────
   * Ручка — зона захвата во всю высоту строки (styles/_modslider.css), значок в ней ставит замер (владелец
   * 05.10): строка в одну линию — значок по середине НИКА (высокий смайлик рядом его не сдвигает); в две
   * и больше — полоса во всё сообщение. Мерим, когда меняется высота ручки (= строки): строка появилась,
   * догрузился смайлик, текст перенёсся от ширины чата. Все чтения — до записей; записи трогают только
   * значок (размер ручки не меняется — наблюдатель не зацикливается). Строка внутри уведомления
   * (.cpx-msg--inline) — ручка в потоке перед ником, мерить нечего. */
  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(place) : null;
  function place(entries) {
    const put = [];
    for (const en of entries) {
      const h = en.target;
      if (!h.isConnected) {
        release(h); // строка ушла из чата
        continue;
      }
      const line = h.closest(".cpx-msg");
      const main = h.closest(".cpx-msg__main");
      const name = main && main.querySelector(".cpx-name");
      if (!line || !name || line.classList.contains("cpx-msg--inline")) continue;
      const hr = h.getBoundingClientRect();
      const nr = name.getBoundingClientRect();
      if (!hr.height || !nr.height) continue;
      // Вторая линия есть, если кусок текста сообщения начинается ниже ника.
      const body = main.querySelector(".cpx-body");
      const rs = body ? body.getClientRects() : [];
      const last = rs.length ? rs[rs.length - 1] : null;
      if (last && last.top >= nr.bottom - 0.5) {
        const mr = main.getBoundingClientRect();
        put.push([h, Math.round(mr.top - hr.top + 2), Math.round(hr.bottom - mr.bottom + 2)]);
      } else put.push([h, Math.round((nr.top + nr.bottom) / 2 - hr.top - 5), null]);
    }
    for (const [h, a, b] of put) {
      h.classList.toggle("cpx-sl--tall", b !== null);
      if (b === null) h.style.setProperty("--sl-gy", a + "px");
      else {
        h.style.setProperty("--sl-gt", a + "px");
        h.style.setProperty("--sl-gb", b + "px");
      }
    }
  }

  /* ── ступени: b[k] — начало зоны шага k (вправо); индекс -1 — мёртвая зона, -2 — разбан ───── */
  function geom(p, W, room) {
    const n = p.right.length;
    const ban = n > 1 && p.right[n - 1].kind === "ban";
    let w = W;
    const need = DZ + (n + (ban ? BAN_GAP : 0)) * w;
    if (room > 0 && need > room) w = Math.max(10, (room - DZ) / (n + (ban ? BAN_GAP : 0)));
    const b = [DZ];
    for (let k = 1; k < n; k++) b.push(b[k - 1] + w + (ban && k === n - 1 ? w * BAN_GAP : 0));
    return { n, w, b, ban, left: p.left.length > 0 };
  }
  const lo = (g, i) => (i === -2 ? -Infinity : i === -1 ? (g.left ? -DZ : -Infinity) : g.b[i]);
  const hi = (g, i) => (i === -2 ? -DZ : i === -1 ? (g.n ? DZ : Infinity) : i === g.n - 1 ? Infinity : g.b[i + 1]);
  function raw(g, dx) {
    if (g.left && dx < -DZ) return -2;
    if (!g.n || dx < DZ) return -1;
    let i = g.n - 1;
    while (i > 0 && dx < g.b[i]) i--;
    return i;
  }
  function pick(g, dx, cur) {
    const i = raw(g, dx);
    if (i > cur && dx < hi(g, cur) + HYST) return cur;
    if (i < cur && dx > lo(g, cur) - HYST) return cur;
    return i;
  }
  const clamp = (v, a, z) => Math.min(z, Math.max(a, v));
  /** Где стоит строка при руке в dx: в мёртвой зоне — «резинка» вполовину, в ступени — у её середины. */
  function visual(g, dx, i) {
    if (i === -1) return clamp(dx * 0.5, g.left ? -DZ / 2 : -6, g.n ? DZ / 2 : 6);
    let a;
    let z;
    if (i === -2) {
      a = -DZ - g.w * UNBAN_W;
      z = -DZ;
    } else {
      a = g.b[i];
      z = i === g.n - 1 ? a + g.w : g.b[i + 1];
    }
    const c = (a + z) / 2;
    return clamp(c + (dx - c) * MAGNET, a, z);
  }
  const at = (p, i) => (i >= 0 ? p.right[i] : i === -2 ? p.left[0] : null);

  /* ── перетаскивание ─────────────────────────────────────────────────────────── */
  function attach(root, host) {
    let d = null; // текущее перетаскивание
    let back = null; // строка, которая возвращается на место: { s, timer }
    let swallowAt = 0;
    const div = (cls) => {
      const n = document.createElement("div");
      n.className = cls;
      return n;
    };

    function onDown(e) {
      const h = e.target instanceof Element ? e.target.closest(".cpx-sl") : null;
      if (!h || !root.contains(h)) return;
      // Ни выделения текста, ни фокуса, ни родных обработчиков строки (карточка по щелчку и т. п.).
      e.preventDefault();
      e.stopPropagation();
      if (d || e.button !== 0 || !e.isPrimary) return;
      const line = h.closest(".cpx-msg");
      const ctx = line ? host.ctx(line) : null;
      if (!ctx) return;
      settle();
      d = { id: e.pointerId, type: e.pointerType, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0, line, ctx, h, started: false, idx: -1, out: false, shown: undefined, right: true };
      try {
        root.setPointerCapture(e.pointerId);
      } catch (_) {
        /* без захвата — по событиям окна */
      }
      listen(true);
    }

    function listen(on) {
      const f = on ? "addEventListener" : "removeEventListener";
      window[f]("pointermove", onMove, true);
      window[f]("pointerup", onUp, true);
      window[f]("pointercancel", onCancel, true);
      window[f]("keydown", onKey, true);
      window[f]("contextmenu", onMenu, true);
      window[f]("blur", onCancel);
      root[f]("lostpointercapture", onLost);
    }

    function onMove(e) {
      if (!d || e.pointerId !== d.id) return;
      // Кнопку отпустили там, откуда событие не пришло (за окном без захвата), — отмена.
      if (e.pointerType === "mouse" && !(e.buttons & 1)) return finish(false);
      d.dx = e.clientX - d.x0;
      d.dy = e.clientY - d.y0;
      if (!d.started) {
        if (Math.abs(d.dx) < START && Math.abs(d.dy) < START) return;
        if (!begin()) return finish(false);
      }
      e.preventDefault();
      draw();
    }
    function onUp(e) {
      if (!d || e.pointerId !== d.id) return;
      if (d.started) e.preventDefault();
      finish(true);
    }
    function onCancel(e) {
      if (d && (e.type === "blur" || e.pointerId === d.id)) finish(false);
    }
    function onLost(e) {
      if (d && e.pointerId === d.id) finish(false);
    }
    function onKey(e) {
      if (!d || e.key !== "Escape") return;
      // Esc здесь — отмена ползунка, а не закрытие окна настроек или чего-то на странице.
      e.preventDefault();
      e.stopPropagation();
      finish(false);
    }
    function onMenu(e) {
      if (!d) return;
      e.preventDefault();
      e.stopPropagation();
      finish(false);
    }

    function begin() {
      const line = d.line;
      const inner = line.isConnected ? line.querySelector(":scope > .cpx-msg__in") : null;
      if (!inner || host.ctx(line) !== d.ctx) return false;
      const p = host.plan(d.ctx, line);
      if (!p || (!p.right.length && !p.left.length)) return false;
      const lr = line.getBoundingClientRect();
      const hr = d.h.isConnected ? d.h.getBoundingClientRect() : lr;
      d.started = true;
      d.plan = p;
      d.inner = inner;
      d.lw = lr.width;
      d.hx = Math.max(0, hr.left - lr.left);
      d.g = geom(p, host.step ? host.step() : STEP.m, lr.width - d.hx - 28);
      // Середина ника (первая линия) — по ней подпись и отметки; ручка теперь во всю высоту строки.
      const nm = line.querySelector(".cpx-msg__main .cpx-name");
      const nr = nm ? nm.getBoundingClientRect() : null;
      const y = (nr && nr.height ? nr.top + nr.height / 2 : hr.top + Math.min(hr.height, 28) / 2) - lr.top;
      d.strip = div("cpx-sl-strip");
      d.strip.style.setProperty("--sl-y", y.toFixed(1) + "px");
      for (let k = 1; k < d.g.n; k++) {
        const t = div("cpx-sl-tick" + (d.g.ban && k === d.g.n - 1 ? " cpx-sl-tick--wall" : ""));
        t.style.left = (d.hx + d.g.b[k]).toFixed(1) + "px";
        d.strip.appendChild(t);
      }
      d.pill = div("cpx-sl-pill");
      d.pill.style.top = (y - 9).toFixed(1) + "px";
      line.append(d.strip, d.pill);
      line.classList.add("cpx-sl-on");
      root.classList.add("cpx-sl-drag");
      d.release = host.hold ? host.hold() : null;
      if (host.start) CPX.safely("modslider:start", () => host.start(d.ctx));
      return true;
    }

    function show(step) {
      d.shown = step;
      const [cd, cl] = paint(step);
      for (const n of [d.strip, d.pill]) {
        n.style.setProperty("--sl-cd", cd);
        n.style.setProperty("--sl-cl", cl);
      }
      const text = label(step);
      d.pill.textContent = step && step.kind === "del" ? "" : text;
      if (step && step.kind === "del") d.pill.appendChild(trash());
      d.pill.setAttribute("aria-label", text);
      d.pill.classList.toggle("cpx-sl-pill--ico", !!step && step.kind === "del");
      d.pill.classList.toggle("cpx-sl-pill--on", !!text);
      d.pw = text ? d.pill.offsetWidth : 0;
      if (text) {
        // «щелчок» на смене ступени — подпись чуть вспыхивает
        d.pill.classList.remove("cpx-sl-pop");
        void d.pill.offsetWidth;
        d.pill.classList.add("cpx-sl-pop");
      }
    }

    function draw() {
      const ay = Math.abs(d.dy);
      if (!d.out && ay > V_OUT) d.out = true;
      else if (d.out && ay < V_IN) d.out = false;
      const i = pick(d.g, d.dx, d.idx);
      d.idx = i;
      const v = visual(d.g, d.dx, i);
      d.inner.style.transform = "translate3d(" + v.toFixed(1) + "px,0,0)";
      const step = d.out ? "cancel" : at(d.plan, i);
      if (step !== d.shown) show(step);
      const right = v >= 0;
      if (right !== d.right) {
        d.right = right;
        d.strip.classList.toggle("cpx-sl-strip--r", !right);
      }
      // Влево полоса не уже подписи «Снять бан» (иначе подпись торчала бы из неё на текст).
      d.strip.style.width = (right ? d.hx + v : Math.max(12 - v, d.pw ? d.pw + 12 : 0)).toFixed(1) + "px";
      const x = right ? Math.max(3, d.hx + v - d.pw - 5) : d.lw - d.pw - 6;
      d.pill.style.transform = "translate3d(" + x.toFixed(1) + "px,0,0)";
    }

    function finish(ok) {
      const s = d;
      d = null;
      listen(false);
      try {
        if (root.hasPointerCapture(s.id)) root.releasePointerCapture(s.id);
      } catch (_) {
        /* уже отпущен */
      }
      if (!s.started) {
        if (ok && s.h.isConnected) {
          nudge(s.h);
          if (host.tap) CPX.safely("modslider:tap", () => host.tap(s.h, s.type));
        }
        return;
      }
      swallowAt = performance.now();
      root.classList.remove("cpx-sl-drag");
      const step = ok && !s.out ? at(s.plan, s.idx) : null;
      const live = s.line.isConnected && host.ctx(s.line) === s.ctx;
      if (step && live) {
        s.pill.classList.add("cpx-sl-pill--done");
        CPX.safely("modslider:apply", () => host.apply(s.ctx, step, s.plan, s.line));
        goBack(s, 160);
      } else goBack(s, 0);
    }

    function nudge(h) {
      h.classList.remove("cpx-sl--nudge");
      void h.offsetWidth;
      h.classList.add("cpx-sl--nudge");
      setTimeout(() => h.classList.remove("cpx-sl--nudge"), 500);
    }

    function goBack(s, delay) {
      back = { s, timer: 0 };
      const me = back;
      const run = () => {
        if (back !== me) return;
        const ease = "220ms cubic-bezier(.25,.8,.3,1)";
        s.inner.style.transition = "transform " + ease;
        s.inner.style.transform = "translate3d(0,0,0)";
        s.strip.style.transition = "width " + ease;
        s.strip.style.width = (s.right ? s.hx : 0) + "px";
        s.pill.classList.add("cpx-sl-pill--out");
        me.timer = setTimeout(settle, 240);
      };
      if (delay) me.timer = setTimeout(run, delay);
      else run();
    }
    /** Убрать следы прошлого перетаскивания сразу (новое началось раньше, чем строка доехала). */
    function settle() {
      if (!back) return;
      const s = back.s;
      clearTimeout(back.timer);
      back = null;
      s.strip.remove();
      s.pill.remove();
      s.inner.style.transition = "";
      s.inner.style.transform = "";
      s.line.classList.remove("cpx-sl-on");
      if (s.release) s.release();
    }

    // Щелчок, пришедший после перетаскивания (на корень — из-за захвата), и щелчки по самой ручке —
    // не строке: родные действия по щелчку (карточка, ответ) тут ни при чём.
    function onClick(e) {
      const onHandle = e.target instanceof Element && e.target.closest(".cpx-sl");
      if (!onHandle && performance.now() - swallowAt > 350) return;
      swallowAt = 0;
      e.preventDefault();
      e.stopPropagation();
    }

    root.addEventListener("pointerdown", onDown, true);
    root.addEventListener("click", onClick, true);
    return function detach() {
      root.removeEventListener("pointerdown", onDown, true);
      root.removeEventListener("click", onClick, true);
      if (d) finish(false);
      settle();
    };
  }

  return { DEF, STEP, MAX, MAX_STOPS, stops, plan, label, short, paint, handle, release, attach, _: { geom, pick, visual, DZ } };
})();

// ── src/common/40_settings_defs.js ──
/* Описание настроек — одно на все миры.
 *
 * Хранит и записывает настройки ТОЛЬКО фон (chrome.storage.local, ключ "settings").
 * Мир страницы получает их копию и события изменений (CPX.settings в main).
 * Страница настроек строит форму по этим описаниям.
 *
 * Каждая область объявляет свои настройки своим файлом src/common/4x_settings_<область>.js:
 *     CPX.defineSettings("chat", [
 *       { key: "chat.timestamps", type: "bool", def: false,
 *         label: { ru: "Время у сообщений", en: "Message timestamps" } },
 *     ]);
 * Типы: bool | int | range (min,max,step) | select (options:[{v, ru, en}]) | text | color | list (массив).
 * Ключ — «область.имя», латиницей. Значение по умолчанию обязательно.
 * hidden: true — не показывать на странице настроек (служебные и личные списки).
 * pageWritable: true — ЕДИНСТВЕННОЕ, что мир страницы Twitch может менять (белый список фона,
 *   ревью безопасности 01.10): там же работают чужие скрипты, а все прочие настройки (свои кнопки
 *   модерации, согласие, включение функций…) меняются только со страниц расширения. Ставить тем,
 *   что пишет src/main: недавние/избранные смайлики, эмодзи и GIF, история опросов, срок мута,
 *   mod.off, sharedbans.mbExcluded, быстрые ссылки, player.extShown.
 * Списки (type "list"): не больше maxItems элементов (по умолчанию 2000) и LIST_MAX_BYTES в JSON —
 *   иначе запись отвергается (страница могла бы забить всё хранилище одной настройкой).
 * extOnly: true — менять только со страниц расширения (согласие, вход).
 * reset: true — общий сброс на странице настроек возвращает и это, хоть оно скрытое или список
 *   (способ модерации, ползунок, сроки мута).
 */

CPX.settingsDefs = new Map();
CPX.LIST_MAX_BYTES = 64 * 1024;
CPX.settingsGroups = [];

CPX.defineSettings = function (group, defs) {
  if (!CPX.settingsGroups.includes(group)) CPX.settingsGroups.push(group);
  for (const d of defs) {
    if (!d.key || !("def" in d)) throw new Error("настройка без key/def: " + JSON.stringify(d));
    CPX.settingsDefs.set(d.key, Object.assign({ group }, d));
  }
};

CPX.settingsDefaults = function () {
  const out = {};
  for (const [k, d] of CPX.settingsDefs) out[k] = d.def;
  return out;
};

/** Привести значение к описанию (тип, пределы, варианты). Неизвестное — undefined.
 *  stored: значение из СВОЕГО хранилища — потолки списков не применяем (их ставили на запись со
 *  страницы; уже сохранённое прежней версией не стирать). */
CPX.settingsCoerce = function (key, v, stored) {
  const d = CPX.settingsDefs.get(key);
  if (!d) return undefined;
  switch (d.type) {
    case "bool":
      return !!v;
    case "int":
    case "range": {
      let n = Math.round(Number(v) / (d.step || 1)) * (d.step || 1);
      if (!Number.isFinite(n)) return d.def;
      // Шаг с дробью (0,05): 22·0,05 = 1,1000000000000001 — округлить до знаков шага.
      const dec = (String(d.step || 1).split(".")[1] || "").length;
      if (dec) n = Number(n.toFixed(dec));
      return Math.min(d.max != null ? d.max : Infinity, Math.max(d.min != null ? d.min : -Infinity, n));
    }
    case "select":
      return d.options.some((o) => o.v === v) ? v : d.def;
    case "color":
      return CPX.safe.hex(v) || d.def;
    case "list": {
      if (!Array.isArray(v)) return d.def;
      if (stored) return v;
      if (v.length > (d.maxItems || 2000)) return undefined;
      let size = 0;
      try {
        size = JSON.stringify(v).length;
      } catch (_) {
        return undefined;
      }
      return size > (d.maxBytes || CPX.LIST_MAX_BYTES) ? undefined : v;
    }
    case "text":
      return typeof v === "string" ? v.slice(0, d.max || 500) : d.def;
    default:
      return v;
  }
};

/* Firefox 140+: виды данных, которые уходят на сервер Chatterino+ ТОЛЬКО после согласия. Манифест
 * объявляет их необязательными (tools/build.py, data_collection_permissions.optional — СПИСОК ТОТ ЖЕ),
 * страница согласия запрашивает их permissions.request при «Согласен», фон снимает согласие, если
 * разрешение отозвали (src/bg/22_consent.js). Chrome и старый Firefox — только своё согласие. */
CPX.DATA_COLLECTION = ["personallyIdentifyingInfo", "authenticationInfo", "websiteActivity", "websiteContent"];

/* Общие настройки. */
CPX.defineSettings("general", [
  {
    key: "general.lang",
    type: "select",
    def: "auto",
    options: [
      { v: "auto", ru: "Как в браузере", en: "Browser language" },
      { v: "ru", ru: "Русский", en: "Русский" },
      { v: "en", ru: "English", en: "English" },
    ],
    label: { ru: "Язык", en: "Language" },
  },
  {
    // Владелец 05.10: клеточная анимация «Мозаики» (появление и уход окон, всплывашек, подсказок, меню, тостов;
    // «нажатие»; ступенчатые проявления в карточке) — по желанию мгновенно. Вспышки при наведении нет с 05.11.
    // Миры: страница Twitch — 95_ui.js (CPX.mz.setOff + корни слоёв), страницы расширения — pages/10_ext.js.
    key: "general.noAppear",
    type: "bool",
    def: false,
    label: { ru: "Отключить анимации появления", en: "Disable appearance animations" },
    hint: {
      ru: "Окна, подсказки и кнопки Chatterino+ появляются и исчезают сразу — без анимации из клеток",
      en: "Chatterino+ windows, tooltips and buttons appear and disappear instantly — without the cell animation",
    },
  },
  {
    // Согласие с отправкой данных на сервер Chatterino+ (экран при установке).
    // Без него расширение не говорит с нашим сервером ни о чём, кроме публичных списков.
    key: "general.consent",
    type: "bool",
    def: false,
    hidden: true,
    label: { ru: "Согласие на отправку данных", en: "Data consent" },
  },
  {
    // Окно «мешающие расширения» (src/main/93_conflicts.js, владелец 23.10): про какие уже сказали — новое потом
    // новым окном. Пишет страница Twitch; «сбросить всё» не трогает (скрытая).
    key: "general.conflictsSeen",
    type: "list",
    def: [],
    maxItems: 20,
    hidden: true,
    pageWritable: true,
    label: { ru: "Показанные мешающие расширения", en: "Shown conflicting extensions" },
  },
]);

// ── src/common/41_settings_chat.js ──
/* Настройки области «chat»: свой список чата вместо стокового (src/main/40_*–49_*).
 *
 * Вид строк и поведение паузы берутся из настроек самого Twitch (время у сообщений,
 * пауза при наведении/Alt, показ удалённых, высокий контраст ников) — здесь только то,
 * чего у Twitch нет: сам список, плавность доезда, задержка канала, приглушённые удалённые
 * (при них вид удалённых Twitch не действует) и сколько строк держать.
 */

CPX.defineSettings("chat", [
  {
    key: "chat.ownList",
    type: "bool",
    def: true,
    label: { ru: "Свой список чата", en: "Own chat list" },
    hint: { ru: "Если выключить — обычный чат Twitch", en: "If off — the regular Twitch chat" },
  },
  {
    // 0 — новые сообщения появляются сразу (как у Twitch), 10 — очень плавный доезд.
    key: "chat.smooth",
    type: "range",
    min: 0,
    max: 10,
    step: 1,
    def: 5,
    label: { ru: "Плавность прокрутки", en: "Scroll smoothness" },
    hint: { ru: "0 — сразу, 10 — очень плавно", en: "0 — instant, 10 — very smooth" },
  },
  {
    // Владелец 10.10 (жалоба «в быстром чате текст размывается»): в быстром чате (с ~8 сообщений/с — владелец: «можно
    // включать раньше») строки встают порциями раз в 0,2 с, как у Twitch, сразу на место (с 12.10 — без доезда:
    // «мелкие анимации всплывающих сообщений»); текст между порциями стоит. Действует и при плавности 0.
    key: "chat.smoothAuto",
    type: "bool",
    def: true,
    label: { ru: "Плавность — по скорости чата", en: "Smoothness adapts to chat speed" },
    hint: { ru: "В быстром чате строки встают порциями, как у Twitch: текст не плывёт, а стоит и читается", en: "In a fast chat, lines arrive in small batches like on Twitch: text stays still and readable instead of drifting" },
  },
  {
    // Владелец 11.10 (пожелание зрителей «шире стандартного, как в FFZ»): по умолчанию 380 px; 340 — как у Twitch.
    // pageWritable — её пишет ручка у края чата на странице Twitch (src/main/93_chat_width.js).
    key: "chat.width",
    type: "range",
    min: 300,
    max: 700,
    step: 10,
    def: 380,
    unit: "px",
    pageWritable: true,
    label: { ru: "Ширина чата", en: "Chat width" },
    hint: { ru: "На странице канала. Можно потянуть край чата мышью; 340 — как у Twitch", en: "On channel pages. You can also drag the chat's edge; 340 is Twitch's default" },
  },
  {
    // Владелец 30.10: чат — у левого края, левая панель Twitch — справа (styles/page-93-chatleft.css; класс — 93_chat_width.js).
    key: "chat.left",
    type: "bool",
    def: false,
    label: { ru: "Чат слева", en: "Chat on the left" },
    hint: { ru: "Чат — у левого края страницы, панель каналов Twitch — справа. И в режиме кинотеатра", en: "The chat sits at the left edge of the page and Twitch's channel list moves to the right. Theatre mode too" },
  },
  {
    // Пожелание пользователей 10.10 («чат в полоску, как в 7TV»): строки через одну чуть светлее (на светлой
    // теме — чуть темнее). Выключено по умолчанию, как у 7TV и FFZ.
    key: "chat.stripes",
    type: "bool",
    def: false,
    label: { ru: "Чат в полоску", en: "Alternating lines" },
    hint: { ru: "Сообщения через одно — чуть другим фоном, легче следить за строкой", en: "Every other message gets a slightly different background — easier to follow lines" },
  },
  {
    // Владелец 23.10 («Размеры», src/main/49_list_start.js): свой шрифт — строка чата целиком в масштабе шрифт/шрифт
    // Twitch (смайлики, значки, GIF, плашки — вместе с текстом). "0" — как у Twitch (его «Размер шрифта» в настройках чата).
    key: "chat.fontSize",
    type: "select",
    def: "0",
    options: [
      { v: "0", ru: "Как у Twitch", en: "Same as Twitch" },
      ...[10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 24].map((n) => ({ v: String(n), ru: n + " px", en: n + " px" })),
    ],
    label: { ru: "Размер шрифта", en: "Font size" },
    hint: {
      ru: "Смайлики, значки и картинки в чате меняются вместе с текстом. «Как у Twitch» — по его настройке размера шрифта",
      en: "Emotes, badges and pictures in chat scale along with the text. “Same as Twitch” follows Twitch's own font size setting",
    },
  },
  {
    // Владелец 23.10: поля сообщения сверху и снизу (у Twitch — 4 px); меньше — больше строк влезает в окно чата.
    key: "chat.lineGap",
    type: "range",
    min: 0,
    max: 10,
    step: 1,
    def: 4,
    unit: "px",
    label: { ru: "Отступ между сообщениями", en: "Space between messages" },
    hint: { ru: "Сверху и снизу у каждого сообщения. Меньше — больше сообщений в окне чата; 4 — как у Twitch", en: "Above and below each message. Less fits more messages in the chat; 4 is Twitch's" },
  },
  {
    // Владелец 23.10, как Emote Spacing у 7TV (chat.emote_margin, там по умолчанию −0,5 rem): поля смайлика сверху и снизу.
    // Меньше нуля — смайлик заходит на соседние строки, строка со смайликом не выше обычной.
    key: "chat.emoteGap",
    type: "range",
    min: -10,
    max: 10,
    step: 1,
    def: 0,
    unit: "px",
    label: { ru: "Отступ смайликов", en: "Emote spacing" },
    hint: {
      ru: "Сверху и снизу. Меньше нуля — смайлики чуть заходят на соседние строки, и сообщения со смайликами почти не выше обычных; 0 — как у Twitch",
      en: "Above and below. Below zero, emotes slightly overlap neighbouring lines so messages with emotes are barely taller than plain ones; 0 is Twitch's",
    },
  },
  {
    // Владелец 30.10: сторож «полуживого» соединения чата Twitch (src/main/34_chat_link.js) — в «Экспериментах»
    // (pages/20_pages.js), по умолчанию ВЫКЛЮЧЕН (владелец: кому нужно — включат). Команды /reconnect и /refresh работают
    // и без него.
    key: "chat.autoReconnect",
    type: "bool",
    def: false,
    label: { ru: "Переподключать чат, если он замолчал", en: "Reconnect chat when it goes silent" },
    hint: {
      ru: "После сна компьютера или смены сети чат Twitch иногда «зависает» до перезагрузки страницы — Chatterino+ проверит связь и переподключит. Вручную: /reconnect, /refresh",
      en: "After sleep or a network change Twitch chat sometimes freezes until a page reload — Chatterino+ checks the connection and reconnects. Manually: /reconnect, /refresh",
    },
  },
  {
    // Владелец 23.10 (предложение пользователя): в шапке чата вместо «Чат трансляции» — сколько сообщений в секунду
    // (src/main/93_chat_speed.js). Включено по умолчанию у всех (владелец 23.10).
    key: "chat.speed",
    type: "bool",
    def: true,
    label: { ru: "Скорость чата в шапке", en: "Chat speed in the header" },
    hint: { ru: "Сколько сообщений в секунду — вместо «Чат трансляции»", en: "Messages per second — instead of “Stream Chat”" },
  },
  {
    // Задержку включает стример (2–6 с у многих крупных каналов), чтобы модераторы успевали
    // удалить лишнее до зрителей. Chatterino её не соблюдает — по умолчанию и мы (владелец 29.09).
    key: "chat.channelDelay",
    type: "bool",
    def: false,
    label: { ru: "Задержка от стримера", en: "Streamer's chat delay" },
    hint: { ru: "Если стример включил задержку чата — показывать сообщения с ней, как Twitch", en: "If the streamer set a chat delay, show messages with it, like Twitch" },
  },
  {
    // Владелец 03.10: удалённое модератором не пропадает, а остаётся бледным (как в других расширениях).
    // Выключено — как Twitch (зрителю «сообщение удалено», модератору — по его настройке Twitch).
    key: "chat.deletedDim",
    type: "bool",
    def: true,
    label: { ru: "Удалённые сообщения — приглушать", en: "Dim deleted messages" },
    hint: { ru: "Сообщение остаётся в чате бледным, с пометкой «удалено». Если выключить — как у Twitch", en: "The message stays in chat, faded, marked as deleted. If off — like Twitch" },
  },
  {
    // Владелец 14.10: заглушка Twitch «Пользователь скрыт: <сообщение от заблокированного пользователя скрыто>» —
    // по желанию не показывать вовсе (по умолчанию выключено — как Twitch).
    key: "chat.hideBlocked",
    type: "bool",
    def: false,
    label: { ru: "Скрывать сообщения заблокированных", en: "Hide messages from blocked users" },
    hint: { ru: "Тех, кого вы заблокировали на Twitch, в чате не видно совсем — даже заглушкой «Пользователь скрыт»", en: "People you blocked on Twitch don't show up in chat at all — not even as a «hidden user» placeholder" },
  },
  {
    // Владелец 05.10: у кого ник на другом языке, Twitch пишет «Имя (логин)» — с настройкой только логин.
    // У остальных отображаемое имя — тот же логин (разница только в заглавных), их не трогаем.
    key: "chat.loginOnly",
    type: "bool",
    def: false,
    label: { ru: "Отображать только ник", en: "Show login name only" },
    hint: { ru: "У кого имя на другом языке — только ник латиницей, без имени и скобок", en: "Users with a localized name show only their login, without the name and brackets" },
  },
  {
    // Владелец 16.10: в чате записи — без времени слева у сообщений (по умолчанию время есть, как у Twitch).
    key: "chat.vodNoTime",
    type: "bool",
    def: false,
    label: { ru: "Скрывать время сообщений в чате записи", en: "Hide message times in video chat" },
    hint: { ru: "Время слева у каждой строки чата под записью", en: "The time to the left of each chat line on videos" },
  },
  {
    // Владелец 16.10: правый щелчок по нику в чате — «@ник» в поле ввода у курсора (по умолчанию) или ответ на сообщение.
    key: "chat.nameRightClick",
    type: "select",
    def: "mention",
    options: [
      { v: "mention", ru: "Упомянуть в поле ввода", en: "Mention in the chat box" },
      { v: "reply", ru: "Ответить на сообщение", en: "Reply to the message" },
      { v: "off", ru: "Ничего (меню браузера)", en: "Nothing (browser menu)", off: true },
    ],
    label: { ru: "Правый щелчок по нику", en: "Right-click on a name" },
    hint: { ru: "«@ник» встаёт туда, где стоит курсор в поле ввода. Меню браузера при этом не открывается", en: "«@name» goes where the cursor is in the chat box. The browser menu doesn't open" },
  },
  {
    // Владелец 16.10: кнопки при наведении на сообщение можно убрать.
    key: "chat.replyButton",
    type: "bool",
    def: true,
    label: { ru: "Кнопка «Ответить» у сообщения", en: "«Reply» button on messages" },
    hint: { ru: "Появляется при наведении на сообщение", en: "Shows up when you hover a message" },
  },
  {
    key: "chat.copyButton",
    type: "bool",
    def: true,
    label: { ru: "Кнопка «Копировать» у сообщения", en: "«Copy» button on messages" },
    hint: { ru: "Копирует текст сообщения; на своих сообщениях её нет", en: "Copies the message text; not shown on your own messages" },
  },
  {
    // Владелец 05.10: как в клиенте Chatterino+ — сообщение с моим ником подсвечено (цвет клиента
    // rgba(127, 63, 73, .5): в настройке сам цвет, прозрачность 50 % накладывает список), без звука.
    key: "chat.mentionHighlight",
    type: "bool",
    def: true,
    label: { ru: "Подсвечивать упоминания меня", en: "Highlight mentions of me" },
    hint: { ru: "Сообщения с вашим ником — с @ или без — и ответы вам. Свои не подсвечиваются", en: "Messages with your name — with or without @ — and replies to you. Not your own" },
  },
  {
    key: "chat.mentionColor",
    type: "color",
    def: "#7f3f49",
    label: { ru: "Цвет подсветки", en: "Highlight color" },
    hint: { ru: "Ложится полупрозрачно — подходит к тёмной и светлой теме", en: "Applied semi-transparent — fits dark and light themes" },
  },
  {
    // Владелец 14.10 (раздел «Упоминания»): звук, когда упоминают меня, — по умолчанию выключен. Звук — стёклышко с
    // сайта (CPX.sound) или свой файл (chat.mentionSoundFile); играет чат (46_list_mentions).
    key: "chat.mentionSound",
    type: "bool",
    def: false,
    label: { ru: "Звук, когда упоминают меня", en: "Sound when I'm mentioned" },
    hint: { ru: "Короткий звон — даже если вкладка Twitch в фоне. Не чаще раза в полторы секунды", en: "A short chime — even if the Twitch tab is in the background. At most once every 1.5 seconds" },
  },
  {
    // Владелец 23.10: громкость звука упоминаний (ник и свои слова; стёклышко и свой файл). 100 % — как было. На слух
    // ровнее, когда громкость — квадрат доли (CPX.mentions.volume).
    key: "chat.mentionVolume",
    type: "range",
    def: 100,
    min: 0,
    max: 100,
    step: 5,
    unit: "%",
    label: { ru: "Громкость звука", en: "Sound volume" },
    hint: { ru: "Для ника и своих слов", en: "For your name and custom words" },
  },
  {
    // Владелец 23.10: каналы, где звук упоминаний не играет (подсветка остаётся). Логины; правит страница настроек
    // (pages/33_mentions.js).
    key: "chat.mentionMuteChannels",
    type: "list",
    def: [],
    maxItems: 200,
    label: { ru: "Каналы без звука", en: "Channels without sound" },
  },
  {
    // Владелец 23.10: «Не уведомлять» в меню «⋮» карточки — от этого человека ни звука, ни подсветки (ник и свои слова).
    // [{id, login}]; пишет и страница Twitch (карточка), поэтому pageWritable; таблица — в «Упоминаниях».
    key: "chat.mentionIgnoreUsers",
    type: "list",
    def: [],
    maxItems: 500,
    pageWritable: true,
    label: { ru: "Не уведомлять", en: "Don't notify" },
  },
  {
    // Свой звук: файл хранит фон (src/bg/24_sound.js), здесь — метка «<время>/<имя файла>»: по её смене чат перечитывает
    // файл; "" — стёклышко. Пишет только фон; общий сброс возвращает стёклышко.
    key: "chat.mentionSoundFile",
    type: "text",
    def: "",
    max: 200,
    hidden: true,
    extOnly: true,
    reset: true,
  },
  {
    // Владелец 14.10: свои слова (варианты ника и любые другие) — как упоминание меня: подсветка, звук — по выбору у
    // каждого. [{w: слово или фраза, s: со звуком}]; правит страница настроек (pages/33_mentions.js), проверяет при
    // чтении 46_list_mentions.
    key: "chat.highlightWords",
    type: "list",
    def: [],
    maxItems: 100,
    label: { ru: "Свои слова", en: "Custom words" },
  },
  {
    // Владелец 07.10 («First Message не видно» → «как у нас в Chatterino — выделение одним цветом строки»):
    // Twitch выделяет первое сообщение рамкой и только модераторам, клиент — фоном строки всем (пометку
    // first-msg Twitch шлёт каждому). Цвет по умолчанию — наш лавандовый (владелец 09.10: у клиента зелёный,
    // у нас — фирменный, пока человек не выберет свой); в настройке сам цвет, силу 60/255 (как у клиента)
    // накладывает список (41_list_line). Владелец 14.10: по умолчанию — цвет клиента #64c466ff (у клиента прозрачность
    // первой) = #c466ff64: сиреневый с силой 100/255 — сила из самого цвета; выбранный человеком цвет без прозрачности —
    // по-прежнему 60/255.
    key: "chat.firstMsg",
    type: "bool",
    def: true,
    label: { ru: "Подсвечивать первое сообщение", en: "Highlight first messages" },
    hint: { ru: "Первое сообщение человека в этом чате — цветом строки, как в клиенте", en: "A person's first message in this chat gets a colored row, like in the client" },
  },
  {
    key: "chat.firstMsgColor",
    type: "color",
    def: "#c466ff64",
    label: { ru: "Цвет первого сообщения", en: "First message color" },
    hint: { ru: "Ложится полупрозрачно — подходит к тёмной и светлой теме", en: "Applied semi-transparent — fits dark and light themes" },
  },
  {
    // Владелец 07.10: события — как в клиенте (подписки, серии, значки и 7TV — блоком по центру), «но можно
    // будет настроить, чтобы было слева».
    key: "chat.eventsCenter",
    type: "bool",
    def: true,
    label: { ru: "Подписки и события — по центру", en: "Subs and events centered" },
    hint: { ru: "Как в клиенте. Если выключить — все события по левому краю", en: "Like the client. If off — all events align left" },
  },
  {
    // Баннеры в углу чата (src/main/48_list_banners.js), как в клиенте: рейд, пачка подарков, отметка канала.
    key: "chat.bannerRaid",
    type: "bool",
    def: true,
    label: { ru: "Баннер рейда", en: "Raid banner" },
    hint: { ru: "Входящий рейд — лавандовым баннером в углу чата", en: "An incoming raid — a lavender banner in the chat corner" },
  },
  {
    // Владелец 30.10: кто приехал с рейдом — аватарка канала-источника у ника (src/main/48_list_raiders.js; состав —
    // наш сервер, нужен вход в Chatterino+). Модератору и стримеру — пометка «Рейдер», как у Twitch.
    key: "chat.raiders",
    type: "bool",
    def: true,
    label: { ru: "Отмечать рейдеров", en: "Mark raiders" },
    hint: {
      ru: "Первые 5 минут после рейда (модератору и стримеру — 10) у ника приехавшего — аватарка канала, с которого рейд. Нужен вход в Chatterino+",
      en: "For 5 minutes after a raid (10 for moderators and the streamer), raiders get the source channel's avatar next to their name. Requires a Chatterino+ login",
    },
  },
  {
    // Владелец 13.10: включён у всех (09.10–13.10 был выключен — дублировал баннер Twitch). Теперь наш ЗАМЕНЯЕТ
    // баннер подарков Twitch над чатом: для пачек, которые показываем мы, карточку Twitch прячем (48_list_banners);
    // выключен — Twitch показывает свой. Строка о пачке подарков в чате — всегда.
    key: "chat.bannerGifts",
    type: "bool",
    def: true,
    label: { ru: "Баннер подарочных подписок", en: "Gift subs banner" },
    hint: {
      ru: "Пачка от 5 подписок — зелёным баннером в углу чата вместо баннера Twitch над чатом",
      en: "A pack of 5+ gifted subs — a green banner in the chat corner instead of Twitch's banner above chat",
    },
  },
  {
    key: "chat.bannerShoutout",
    type: "bool",
    def: true,
    label: { ru: "Баннер отметки канала", en: "Shoutout banner" },
    hint: { ru: "Стример отметил канал — баннер в углу чата", en: "The streamer shouted out a channel — a banner in the chat corner" },
  },
  {
    key: "chat.maxLines",
    type: "int",
    min: 50,
    max: 1000,
    step: 10,
    def: 200,
    label: { ru: "Сколько сообщений хранить", en: "Messages to keep" },
  },
]);

CPX.i18n.add({
  ru: { "pages.group.chat": "Чат" },
  en: { "pages.group.chat": "Chat" },
});

// ── src/common/42_settings_emotes.js ──
/* Настройки области «emotes»: смайлики 7TV/BTTV/FFZ, эффекты, пейнты, сторонние бейджи.
 *
 * Общие для всех миров: фон по ним решает, что грузить (выключенный сервис не грузится
 * вовсе), страница — что показывать. Бейджи Chatterino, Chatterino Homies и FFZ:AP по
 * умолчанию выключены, как в экранном чате OBS: списки большие (у Homies ≈4 МБ), а
 * бейджей в них — единицы на канал.
 */

CPX.defineSettings("emotes", [
  { key: "emotes.stv", type: "bool", def: true, label: { ru: "7TV", en: "7TV" } },
  { key: "emotes.bttv", type: "bool", def: true, label: { ru: "BetterTTV", en: "BetterTTV" } },
  { key: "emotes.ffz", type: "bool", def: true, label: { ru: "FrankerFaceZ", en: "FrankerFaceZ" } },
  {
    key: "emotes.effects",
    type: "bool",
    def: true,
    label: { ru: "Эффекты смайликов", en: "Emote effects" },
    hint: { ru: "Вращение, отражение и другие: w!, ffzSpin, +spin", en: "Spin, flip and more: w!, ffzSpin, +spin" },
  },
  { key: "emotes.paints", type: "bool", def: true, label: { ru: "Пейнты ников", en: "Name paints" }, hint: { ru: "Цветные ники PLUS и 7TV", en: "Colourful PLUS and 7TV names" } },
  { key: "emotes.badges.stv", type: "bool", def: true, label: { ru: "7TV", en: "7TV" } },
  { key: "emotes.badges.bttv", type: "bool", def: true, label: { ru: "BetterTTV", en: "BetterTTV" } },
  {
    key: "emotes.badges.ffz",
    type: "bool",
    def: true,
    label: { ru: "FrankerFaceZ", en: "FrankerFaceZ" },
    hint: { ru: "И значки модераторов и VIP канала из FFZ", en: "Plus the channel's moderator and VIP badges from FFZ" },
  },
  { key: "emotes.badges.chatterino", type: "bool", def: false, label: { ru: "Chatterino", en: "Chatterino" } },
  { key: "emotes.badges.homies", type: "bool", def: false, label: { ru: "Chatterino Homies", en: "Chatterino Homies" } },
  { key: "emotes.badges.ffzap", type: "bool", def: false, label: { ru: "FFZ:AP", en: "FFZ:AP" } },
  {
    // Присутствие 7TV: 7TV рассылает мой пейнт/бейдж тем, кто сидит в том же чате.
    // Это отправка сведений обо мне (сторонней службе) — работает только после согласия.
    key: "emotes.stvPresence",
    type: "bool",
    def: true,
    label: { ru: "Показывать мой пейнт 7TV другим", en: "Show my 7TV paint to others" },
    hint: { ru: "Сообщает 7TV, в каком чате вы", en: "Tells 7TV which chat you are in" },
  },
]);

CPX.i18n.add({
  ru: { "pages.group.emotes": "Смайлики и оформление" },
  en: { "pages.group.emotes": "Emotes & cosmetics" },
});

// ── src/common/43_settings_eblo.js ──
/* Настройки области «eblo»: eblo.id — хостинг картинок, видео и файлов (src/bg/72_eblo.js и модули чата). Общий план с
 * клиентом — Z:\_memstudy\eblo\PLAN.md (§7.4, §8.5, тексты §10 — слово в слово с клиентом), сверка с живым API —
 * ADMIN_DIFF.md там же (13.10: одна пометка поста «blur» — «не для стрима»). Значения по умолчанию — решения владельца 13.10. */

CPX.defineSettings("eblo", [
  {
    key: "eblo.previews",
    type: "bool",
    def: true,
    label: { ru: "Карточки ссылок eblo.id в чате", en: "eblo.id link cards in chat" },
    hint: { ru: "Под сообщением со ссылкой на пост — кадр, автор и что внутри", en: "Under a message with a post link — a frame, the author and what’s inside" },
  },
  {
    key: "eblo.blur",
    type: "bool",
    def: true,
    label: { ru: "Размывать кадр", en: "Blur the frame" },
    hint: {
      ru: "Чтобы на стрим случайно не попало лишнее. Посты «не для стрима» размыты всегда",
      en: "So nothing unwanted slips onto the stream. “Not for stream” posts are always blurred",
    },
  },
  {
    key: "eblo.reveal",
    type: "select",
    def: "hover",
    options: [
      { v: "hover", ru: "при наведении мыши", en: "on mouse hover" },
      { v: "click", ru: "по первому щелчку", en: "on the first click" },
      { v: "open", ru: "только при открытии поста", en: "only when the post is opened" },
    ],
    label: { ru: "Показывать без размытия", en: "Show without blur" },
  },
  {
    key: "eblo.upload",
    type: "bool",
    def: true,
    label: { ru: "Загрузка файлов на eblo.id", en: "Upload files to eblo.id" },
    hint: {
      ru: "Перетащи файл в чат или вставь картинку (Ctrl+V): файл загрузится, ссылка встанет в поле ввода и скопируется. Отправляешь сам",
      en: "Drop a file into chat or paste an image (Ctrl+V): it uploads, the link goes into the chat box and to the clipboard. You send it yourself",
    },
  },
  {
    // Громкость видео и аудио в окне поста (src/main/86_eblo_player.js) — одна на все файлы, помним между открытиями и
    // перезапусками. Пишет плеер на странице Twitch — pageWritable (владелец 16.10, «не запоминается»: без него фон молча
    // отбрасывал запись скрытого ключа со страницы — громкость жила только до перезагрузки).
    key: "eblo.volume",
    type: "int",
    min: 0,
    max: 100,
    def: 100,
    hidden: true,
    pageWritable: true,
    label: { ru: "Громкость в окне поста eblo.id", en: "eblo.id post window volume" },
  },
]);

// ── src/common/44_settings_mirror.js ──
/* Зеркало 7TV для подписчиков PLUS (этап 5): строки и скрытая настройка стенда.
 *
 * Своих настроек у зеркала нет НАМЕРЕННО (решение владельца 26.09: «подписчику — молча, без
 * настроек и плашек»). Здесь только:
 *  • строки подсказки не-подписчику — общие для всех миров (фон шлёт событие, страница
 *    показывает тост, popup — отметку); «.login» — человек не вошёл в Chatterino+;
 *  • mirror.hintOff — крестик у подсказки (владелец 23.10: «один раз нажимает — и реклама PLUS больше не появляется»):
 *    скрытая, со страницы Twitch писать можно (тост), «сбросить всё» её не трогает;
 *  • dev.mirrorBase — ТОЛЬКО в dev-сборке: адрес локальной заглушки зеркала для стенда
 *    (например, http://127.0.0.1:8765). В сборке для магазина настройки нет вовсе.
 */

CPX.i18n.add({
  ru: {
    "mirror.hint.7tv": "7TV станет доступен при оформлении подписки PLUS",
    // Не вошёл в Chatterino+ — не знаем, подписчик ли он: может, подписка уже есть.
    "mirror.hint.7tv.login": "7TV станет доступен с подпиской PLUS. Уже есть? Войдите в Chatterino+",
    "mirror.hint.cta": "Оформить PLUS",
    "mirror.hint.never": "Больше не показывать",
  },
  en: {
    "mirror.hint.7tv": "7TV will become available with a PLUS subscription",
    "mirror.hint.7tv.login": "7TV will become available with PLUS. Already subscribed? Sign in to Chatterino+",
    "mirror.hint.cta": "Get PLUS",
    "mirror.hint.never": "Don't show again",
  },
});

CPX.defineSettings("general", [
  {
    key: "mirror.hintOff",
    type: "bool",
    def: false,
    hidden: true,
    pageWritable: true,
    label: { ru: "Не показывать подсказку про PLUS", en: "Don't show the PLUS hint" },
  },
]);

if (CPX.dev) {
  CPX.defineSettings("dev", [
    {
      key: "dev.mirrorBase",
      type: "text",
      def: "",
      max: 100,
      hidden: true,
      label: { ru: "Стенд: адрес заглушки зеркала", en: "Stand: mirror stub base" },
    },
  ]);
}

// ── src/common/45_settings_input.js ──
/* Настройки области «input»: поле ввода Twitch и наши добавки (src/main/75_*–77_*).
 *
 * Поле остаётся твичевым; здесь только то, что добавляем мы. Выправление записи эффектов
 * при отправке своей галочки не имеет — оно идёт вместе с «Эффектами смайликов» (как в клиенте:
 * отдельной галочки там нет, эффекты — часть смайликов).
 */

CPX.defineSettings("input", [
  {
    key: "input.emotes",
    type: "bool",
    def: true,
    label: { ru: "Смайлики 7TV, BTTV и FFZ в подсказках", en: "7TV, BTTV and FFZ emotes in suggestions" },
    hint: { ru: "Подсказки при наборе «:»", en: "Suggestions after typing “:”" },
  },
  {
    key: "input.tab",
    type: "bool",
    def: true,
    label: { ru: "Tab дополняет смайлики", en: "Tab completes emotes" },
    hint: {
      ru: "Ещё Tab — следующий похожий, Shift+Tab — назад; сначала смайлики, потом ники. Только ники — через @",
      en: "Tab again — the next match, Shift+Tab — back; emotes first, then names. Names only — with @",
    },
  },
  {
    // Владелец 10.10 (жалоба пользователей): прошлые сообщения стрелками — как в клиенте, 7TV, FFZ и BTTV (у самого
    // Twitch этого нет: его ↑ — только с Alt, перебор ответов). src/main/77_input_history.js.
    key: "input.history",
    type: "bool",
    def: true,
    label: { ru: "Прошлые сообщения стрелками ↑ ↓", en: "Previous messages with ↑ ↓" },
    hint: {
      ru: "↑ в начале поля — отправленное раньше, ↓ — обратно; набранное не теряется",
      en: "↑ at the start of the input — earlier sent messages, ↓ — back; what you typed is kept",
    },
  },
  {
    // Как «Quick Send» в 7TV (там тоже включено по умолчанию): повтор одного сообщения без набора заново.
    key: "input.ctrlKeep",
    type: "bool",
    def: true,
    label: { ru: "Ctrl+Enter — отправить и оставить текст", en: "Ctrl+Enter — send and keep the text" },
    hint: { ru: "Чтобы повторить сообщение ещё раз", en: "To send the same message again" },
  },
  {
    key: "input.allowRepeat",
    type: "bool",
    def: true,
    label: { ru: "Разрешить повтор сообщения", en: "Allow repeating a message" },
    hint: { ru: "Twitch не даёт отправить одно и то же дважды подряд — обходим", en: "Twitch blocks sending the same message twice in a row — we get around it" },
  },
]);

CPX.i18n.add({
  ru: { "pages.group.input": "Поле ввода" },
  en: { "pages.group.input": "Chat input" },
});

// ── src/common/46_settings_mod.js ──
/* Настройки области «mod»: модераторские кнопки в строках чата (src/main/80_*–83_*).
 *
 * Форматы — совместимые с клиентом Chatterino+ (research/04 §1.9), чтобы позже переносить
 * настройки между клиентом и расширением:
 *   mod.actions  — свои кнопки: [{ pattern: "/delete {msg.id}", icon: "" }, …] (клиент:
 *                  /moderation/actions). icon: "" — сам по виду команды (корзина, кирпич, текст),
 *                  имя нашего значка ("eye", "warning"…), адрес картинки https; пути клиента
 *                  qrc:/buttons/… понимаются (visible → глаз, trashCan → корзина, ban → кирпич).
 *                  По умолчанию — кнопки клиента БЕЗ /wt (наша команда «наблюдать» в браузере
 *                  пока не сделана): /delete, /timeout 600, /ban; в новой системе /timeout и /ban
 *                  скрыты — их заменяют живые бан/разбан и мут.
 *   mod.timeouts — 8 сроков ленты мута парами [единица, число] (клиент: /timeouts/timeoutButtons,
 *                  пары единица+число): единица s|m|h|d|w, число 1–99, дни ≤ 14, недели ≤ 2.
 *
 * ⚠️Урок клиента (§1.12, «кнопки сбрасывались на 4 базовые»): пустой список НИКОГДА не
 * «самолечится» посевом — пусто значит «человек очистил сам». Хранит фон сразу, без отложенных
 * таймеров (только отличия от умолчаний); неверные элементы отбрасываются при чтении
 * (CPX.mod.actions()/timeouts()), а не перезаписью хранилища. Редактор начинает с копии,
 * пришедшей из фона, и ничего не пишет до первого действия человека.
 *
 * Редактор списков — на странице настроек расширения, раздел «Модерация»
 * (src/pages/30_mod_editor.js; решение владельца 01.10 — на Twitch в быстром доступе он не нужен).
 *
 * СПОСОБ МОДЕРАЦИИ (владелец 04.10) — mod.mode: "slider" (по умолчанию у всех) — ползунок у сообщения
 * (src/common/39_mod_slider.js): сроки mod.slider, удаление в начале mod.sliderDel, бан в конце
 * mod.sliderBan, ход mod.sliderStep; "buttons" — кнопки Chatterino+ (живые бан/разбан и мут + свои);
 * "classic" — свои кнопки как есть. Прежняя галочка mod.classic = true по-прежнему значит «classic»,
 * пока модератор не выберет способ плитками (редактор тогда снимает её).
 */

CPX.defineSettings("mod", [
  {
    key: "mod.mode",
    reset: true, // общий сброс на странице настроек возвращает и это (скрытое/список — иначе пропускается)
    type: "select",
    def: "slider",
    hidden: true, // выбор — плитками в разделе «Модерация» (30_mod_editor.js)
    options: [
      { v: "slider", ru: "Ползунок", en: "Slider" },
      { v: "buttons", ru: "Кнопки", en: "Buttons" },
      { v: "classic", ru: "Классические кнопки", en: "Classic buttons" },
    ],
    label: { ru: "Способ модерации", en: "Moderation style" },
  },
  {
    // Способ выбран человеком (плитка в разделе «Модерация») или уже перенесён — разовый перенос в фоне
    // (bg/20_settings.js load: свои кнопки + способ не выбирал → «Кнопки») больше не нужен.
    key: "mod.modeChosen",
    type: "bool",
    def: false,
    hidden: true,
    label: { ru: "Способ модерации выбран", en: "Moderation style chosen" },
  },
  {
    // Прежняя галочка (до 04.10): true — классические кнопки. Сама в форме не показывается.
    key: "mod.classic",
    reset: true,
    type: "bool",
    def: false,
    hidden: true,
    label: { ru: "Классические кнопки", en: "Classic buttons" },
  },
  {
    // Сроки ползунка, секунды (1…1209600, до 15); проверяет CPX.modSlider.stops при чтении.
    key: "mod.slider",
    reset: true,
    type: "list",
    def: CPX.modSlider.DEF.slice(),
    maxItems: 15,
    label: { ru: "Сроки ползунка", en: "Slider durations" },
  },
  {
    key: "mod.sliderDel",
    reset: true,
    type: "bool",
    def: true,
    hidden: true,
    label: { ru: "Удаление сообщения в начале", en: "Delete message first" },
  },
  {
    key: "mod.sliderBan",
    reset: true,
    type: "bool",
    def: true,
    hidden: true,
    label: { ru: "Бан навсегда в конце", en: "Permanent ban at the end" },
  },
  {
    key: "mod.sliderStep",
    reset: true,
    type: "select",
    def: "m",
    hidden: true,
    options: [
      { v: "s", ru: "Короткий", en: "Short" },
      { v: "m", ru: "Обычный", en: "Normal" },
      { v: "l", ru: "Длинный", en: "Long" },
    ],
    label: { ru: "Ход ползунка", en: "Slider travel" },
  },
  {
    // Последний срок из ленты мута — для Shift+щелчка по муту (клиент: /moderation/lastTimeoutSeconds).
    key: "mod.lastTimeout",
    type: "int",
    pageWritable: true, // пишет страница Twitch (белый список фона)
    min: 1,
    max: 1209600,
    step: 1,
    def: 600,
    label: { ru: "Срок мута по Shift+щелчку, с", en: "Shift+click timeout, s" },
    hint: { ru: "Сам запоминает последний из ленты", en: "Remembers the last one picked in the strip" },
    // Только у способа «Кнопки» (страница настроек прячет строку у других — 20_pages.js: SHOW).
  },
  {
    key: "mod.actions",
    type: "list",
    def: [
      { pattern: "/delete {msg.id}", icon: "" },
      { pattern: "/timeout {user.name} 600", icon: "" },
      { pattern: "/ban {user.name}", icon: "" },
    ],
    label: { ru: "Свои кнопки модерации", en: "Custom moderation buttons" },
  },
  {
    key: "mod.timeouts",
    reset: true,
    type: "list",
    def: [
      ["s", 1],
      ["s", 30],
      ["m", 1],
      ["m", 5],
      ["m", 30],
      ["h", 1],
      ["d", 1],
      ["w", 1],
    ],
    label: { ru: "Сроки ленты мута", en: "Timeout strip durations" },
  },
  // Строки модерации в чате (видны только модератору, src/main/42_list_notices.js). Владелец 23.10: у сообщения и так
  // остаётся пометка «(удалено)» / «(тайм-аут…)» — сами строки можно выключить по видам. Снятие тайм-аута, разбан и
  // «вас замутили» — всегда.
  {
    key: "mod.lineDelete",
    type: "bool",
    def: true,
    label: { ru: "Строки об удалении сообщений", en: "Lines about deleted messages" },
    hint: { ru: "«Модератор удалил сообщение от…»", en: "“Moderator deleted a message from…”" },
  },
  {
    key: "mod.lineTimeout",
    type: "bool",
    def: true,
    label: { ru: "Строки о тайм-аутах", en: "Lines about timeouts" },
    hint: { ru: "«Модератор замутил… на 10 мин.»", en: "“Moderator timed out… for 10 min.”" },
  },
  {
    key: "mod.lineBan",
    type: "bool",
    def: true,
    label: { ru: "Строки о банах", en: "Lines about bans" },
    hint: { ru: "Снятие тайм-аута и разбан видны всегда", en: "Untimeouts and unbans are always shown" },
  },
  {
    // «Кто печатает» (владелец 08.11, задание основного чата) — как клиент: «Дополнения» → «Кто печатает», по умолчанию
    // вкл. Тексты — клиента (ru.json). Логика — src/bg/66_typing.js, строка под полем — src/main/77_input_typing.js.
    key: "mod.typing",
    type: "bool",
    def: true,
    label: { ru: "Показывать, кто из модераторов печатает", en: "Show which moderators are typing" },
    hint: {
      ru: "Если вы модератор или владелец канала — вы видите, кто из модераторов сейчас печатает сообщение (в пустом поле ввода, на месте «Отправить сообщение»).",
      en: "If you're a moderator or the broadcaster, you'll see which moderators are currently typing a message, shown in the empty message box in place of “Send a message”.",
    },
  },
  {
    // Каналы (ID), где модератор ВЫКЛЮЧИЛ режим модератора (меч). По умолчанию у модератора и
    // стримера режим включён (решение владельца 29.09); здесь — только явные «выключить».
    key: "mod.off",
    type: "list",
    pageWritable: true, // пишет страница Twitch (белый список фона)
    def: [],
    label: { ru: "Каналы, где режим модератора выключен", en: "Channels with moderator mode turned off" },
  },
]);

CPX.i18n.add({
  ru: { "pages.group.mod": "Модерация" },
  en: { "pages.group.mod": "Moderation" },
});

// ── src/common/46_settings_spam.js ──
/* Настройки области «spam»: «Антиспам» для модераторов (src/main/47_list_spam.js).
 *
 * Перенос клиента Chatterino+ целиком (владелец 07.10: «полностью, со всеми фишками и мелочами»):
 * те же пункты, умолчания и пределы, что у клиента (Settings.hpp /moderation/tools/spam/*, страница
 * AdditionsPage::buildSpam). Отличия по сути: цвета фона — сам цвет, прозрачность 0x40 (как у
 * умолчаний клиента #40ff3030 / #403050ff) накладывает список; порог похожести — в процентах;
 * исключённые логины — строкой, через пробел, запятую или с новой строки (как поле клиента). Фон строк — по желанию
 * (spam.highlight, ВЫКЛ.; владелец 11.10: «по умолчанию не подсвечивать, оставить только цветное ×N» — только в
 * расширении, клиент не меняется).
 * Раздел на странице настроек — «Модерация» (pages/20_pages.js: CATS).
 */

CPX.SPAM_BOTS = [
  "nightbot", "streamelements", "moobot", "fossabot", "wizebot", "streamlabs", "soundalerts", "botrix",
  "sery_bot", "supibot", "commanderroot", "pajbot", "own3d", "modboty1", "potatbotat", "jeetbot",
];

CPX.defineSettings("spam", [
  {
    key: "spam.enabled",
    type: "bool",
    def: true,
    label: { ru: "Отмечать спам", en: "Mark spam" },
    hint: {
      ru: "Один и тот же текст подряд — от одного человека (красным) или от нескольких (синим). В конце такого сообщения — «×N», сколько раз он повторился",
      en: "The same text again and again — from one person (red) or from several (blue). Such a message ends with “×N”, how many times it was repeated",
    },
  },
  {
    key: "spam.highlight",
    type: "bool",
    def: false,
    label: { ru: "Подсвечивать такие сообщения фоном", en: "Highlight such messages with a background" },
    hint: { ru: "Без этого спам отмечен только цветным «×N» в конце", en: "Without it spam is marked only by the colored “×N” at the end" },
  },
  {
    key: "spam.modOnly",
    type: "bool",
    def: true,
    label: { ru: "Только в режиме модератора", en: "Only in moderator mode" },
    hint: { ru: "Видно, когда включён меч модератора над чатом", en: "Shown while the moderator sword above the chat is on" },
  },
  {
    key: "spam.showCount",
    type: "bool",
    def: true,
    label: { ru: "Счётчик «×N» в конце сообщения", en: "“×N” counter at the end of the message" },
    hint: { ru: "Синий «×N» нажимается — окно со всеми, кто это отправил", en: "The blue “×N” is clickable — a window with everyone who sent it" },
  },
  {
    key: "spam.selfColor",
    type: "color",
    def: "#ff3030",
    label: { ru: "Фон: повторяет один человек", en: "Background: one person repeats" },
    hint: { ru: "Ложится полупрозрачно", en: "Applied semi-transparent" },
  },
  {
    key: "spam.multiColor",
    type: "color",
    def: "#3050ff",
    label: { ru: "Фон: один текст от разных людей", en: "Background: same text from different people" },
    hint: { ru: "Ложится полупрозрачно", en: "Applied semi-transparent" },
  },
  {
    key: "spam.countColorSelf",
    type: "color",
    def: "#ff6a6a",
    label: { ru: "Цвет «×N»: один человек", en: "“×N” color: one person" },
  },
  {
    key: "spam.countColorMulti",
    type: "color",
    def: "#5ab0ff",
    label: { ru: "Цвет «×N»: разные люди", en: "“×N” color: different people" },
  },
  {
    key: "spam.minLength",
    type: "int",
    min: 0,
    max: 500,
    def: 30,
    label: { ru: "Минимальная длина сообщения (символов)", en: "Minimum message length (characters)" },
    hint: { ru: "Короче — повтором не считается (смайлики тоже считаются)", en: "Shorter messages are not counted as repeats (emotes count too)" },
  },
  {
    key: "spam.repeatMin",
    type: "int",
    min: 2,
    max: 50,
    def: 2,
    label: { ru: "Со скольких одинаковых сообщений — спам", en: "Identical messages that make spam" },
  },
  {
    key: "spam.windowSec",
    type: "int",
    min: 5,
    max: 3600,
    step: 10,
    def: 120,
    label: { ru: "Сколько длится одна волна спама (секунд)", en: "How long one spam wave lasts (seconds)" },
    hint: { ru: "Повтор позже — уже новая волна, счёт заново", en: "A repeat after that starts a new wave" },
  },
  {
    key: "spam.memory",
    type: "int",
    min: 1,
    max: 100000,
    step: 100,
    def: 1000,
    label: { ru: "Сколько последних текстов помнить", en: "Recent texts to remember" },
  },
  {
    key: "spam.ignoreTrailing",
    type: "bool",
    def: true,
    label: { ru: "Не замечать цифры и знаки в конце", en: "Ignore trailing digits and punctuation" },
    hint: { ru: "Так обходят запрет Twitch на повтор: «текст 1», «текст 2»…", en: "That's how Twitch's duplicate check is bypassed: “text 1”, “text 2”…" },
  },
  {
    key: "spam.fuzzy",
    type: "bool",
    def: true,
    label: { ru: "Ловить похожие по словам", en: "Catch messages similar by words" },
    hint: { ru: "Слова те же, но переставлены или чуть отличаются", en: "Same words, reordered or slightly different" },
  },
  {
    key: "spam.fuzzyThreshold",
    type: "range",
    min: 0,
    max: 100,
    step: 5,
    unit: "%",
    def: 85,
    label: { ru: "Порог похожести", en: "Similarity threshold" },
  },
  {
    key: "spam.fuzzyWindow",
    type: "int",
    min: 1,
    max: 200,
    def: 30,
    label: { ru: "Со сколькими последними сообщениями сравнивать", en: "Recent messages to compare with" },
  },
  {
    key: "spam.symbolMin",
    type: "int",
    min: 1,
    max: 50,
    def: 4,
    label: { ru: "Со скольких смайликов в сообщении — спам", en: "Emotes in a message that make spam" },
    hint: { ru: "Смайлики Twitch, 7TV, BTTV, FFZ и эмодзи", en: "Twitch, 7TV, BTTV, FFZ emotes and emoji" },
  },
  {
    key: "spam.burstMin",
    type: "int",
    min: 1,
    max: 20,
    def: 2,
    label: { ru: "Сколько таких сообщений подряд — спам", en: "Such messages in a row that make spam" },
  },
  {
    key: "spam.burstWindowSec",
    type: "int",
    min: 1,
    max: 600,
    def: 20,
    label: { ru: "За сколько секунд", en: "Within (seconds)" },
  },
  {
    key: "spam.ignoreMods",
    type: "bool",
    def: true,
    label: { ru: "Не считать спамом модераторов", en: "Don't count moderators" },
  },
  {
    key: "spam.ignoreBroadcaster",
    type: "bool",
    def: true,
    label: { ru: "Не считать спамом стримера", en: "Don't count the broadcaster" },
  },
  {
    key: "spam.ignoreVips",
    type: "bool",
    def: false,
    label: { ru: "Не считать спамом VIP", en: "Don't count VIPs" },
  },
  {
    key: "spam.ignoreUsers",
    type: "text",
    rows: 3,
    max: 4000,
    def: CPX.SPAM_BOTS.join(" "),
    label: { ru: "Не считать спамом этих (боты и т. п.)", en: "Never count these (bots, etc.)" },
    hint: { ru: "Логины через пробел, запятую или с новой строки", en: "Logins separated by spaces, commas or new lines" },
  },
]);

CPX.i18n.add({
  ru: { "pages.group.spam": "Антиспам" },
  en: { "pages.group.spam": "Anti-spam" },
});

// ── src/common/47_settings_card.js ──
/* Настройки области «card»: своя карточка пользователя вместо родной Twitch (src/main/85_*–87_*).
 *
 * Решение владельца (PLAN.md §2): своя карточка — по умолчанию, выключается здесь. Родная
 * карточка Twitch всегда доступна Shift+щелчком по нику и пунктом «⋮ → Открыть карточку Twitch».
 * Лента истории в карточке отключения не имеет (решение владельца 05.09: «показывать всем и
 * всегда»).
 */

CPX.defineSettings("card", [
  {
    key: "card.enabled",
    type: "bool",
    def: true,
    label: { ru: "Своя карточка пользователя", en: "Own user card" },
    hint: { ru: "По щелчку на ник. Карточка Twitch — Shift+щелчок", en: "On username click. Twitch's card — Shift+click" },
  },
  {
    // Владелец 05.10: бан из карточки — с причиной, как массовый бан. Выключено — бан сразу, как раньше.
    key: "card.banReason",
    type: "bool",
    def: true,
    label: { ru: "Спрашивать причину бана", en: "Ask for a ban reason" },
    hint: { ru: "«Бан» в карточке (и «Забанить у канала» по правому щелчку) спрашивает причину. Можно не писать", en: "“Ban” in the card (and “Ban in channel” on right-click) asks for a reason. It's optional" },
  },
]);

CPX.i18n.add({
  ru: { "pages.group.card": "Карточка" },
  en: { "pages.group.card": "User card" },
});

// ── src/common/48_settings_sharedbans.js ──
/* Настройки области «sharedbans»: общие баны (src/bg/60_*–64_*, src/main/88_*–89_*).
 *
 * Тексты и умолчания — как у клиента (research/05 §3.12, AdditionsPage.cpp:614-800):
 *   sharedbans.show       — «Показывать значок в чате» (раньше «Отображать подозрительных пользователей»): всегда / только в режиме
 *                           модератора (меч, по каналу) / отключить в чате (в карточке значок остаётся);
 *   sharedbans.dimSeen    — приглушать значок у тех, чью историю банов уже открывали;
 *   sharedbans.place      — где значок: справа от сообщения (умолчание клиента после переезда) /
 *                           перед значками пользователя / автоматически (непросмотренные справа,
 *                           просмотренные у ника);
 *   sharedbans.color1/2/3 — цвет для 1 бана / 2–4 / от 5;
 *   sharedbans.selfCheck  — проверять в фоне, не сняли ли с меня бан (sbmine → Twitch → sbself);
 *   sharedbans.mbConfirm  — подтверждать массовый бан;
 *   sharedbans.mbAskReason — спрашивать причину массового бана из карточки (вкл.; в досье причина своя);
 *   sharedbans.mbJoin     — кнопка «Присоединиться» в строке эстафеты;
 *   sharedbans.mbExcluded — исключённые из массового бана каналы — ПО ID (логин меняется, и по логину
 *                           исключение молча потерялось бы при переименовании; клиент: multibanExcluded).
 *                           Списком страница настроек не рисует — окно «Каналы для массового бана»
 *                           открывается из меню бана на Twitch (src/main/89_sb_multiban.js).
 * «Скрыть мой значок» (PLUS) — не здесь: это флаг профиля подписки (страница настроек → PLUS,
 * plus.setProfile hide_sharedban_badge), продлевает его фон кадром sbhide при каждом подключении.
 */

CPX.defineSettings("sharedbans", [
  {
    key: "sharedbans.show",
    type: "select",
    def: "always",
    options: [
      { v: "always", ru: "Всегда", en: "Always" },
      { v: "mod", ru: "Только в режиме модератора", en: "Only in moderator mode" },
      { v: "off", ru: "Отключить в чате", en: "Never in chat", off: true },
    ],
    label: { ru: "Показывать значок в чате", en: "Show the badge in chat" },
    hint: { ru: "Треугольник у тех, кого банили на других каналах. Щелчок — где и за что", en: "A triangle next to people banned in other channels. Click — where and why" },
  },
  {
    key: "sharedbans.dimSeen",
    type: "bool",
    def: true,
    label: { ru: "Приглушать просмотренных", en: "Dim people you've checked" },
    hint: { ru: "Чью историю банов уже открывали", en: "Whose ban history you've already opened" },
  },
  {
    key: "sharedbans.place",
    type: "select",
    def: "right",
    options: [
      { v: "right", ru: "Справа от сообщения", en: "Right of the message" },
      { v: "badges", ru: "Перед значками пользователя", en: "Before user badges" },
      { v: "auto", ru: "Авто: новые справа, просмотренные у ника", en: "Auto: new on the right, checked by the name" },
    ],
    label: { ru: "Где значок", en: "Badge position" },
  },
  {
    key: "sharedbans.color1",
    type: "color",
    def: "#ffd54a",
    label: { ru: "Цвет значка для 1 бана", en: "Badge color for 1 ban" },
  },
  {
    key: "sharedbans.color2",
    type: "color",
    def: "#f0913a",
    label: { ru: "Цвет значка для 2–4 банов", en: "Badge color for 2–4 bans" },
  },
  {
    key: "sharedbans.color3",
    type: "color",
    def: "#e35d5d",
    label: { ru: "Цвет значка от 5 банов", en: "Badge color for 5+ bans" },
  },
  {
    key: "sharedbans.selfCheck",
    type: "bool",
    def: true,
    label: { ru: "Следить, не сняли ли с меня бан", en: "Watch whether my bans were lifted" },
    hint: { ru: "Только баны навсегда, проверка в фоне", en: "Permanent bans only, checked in the background" },
  },
  {
    key: "sharedbans.mbConfirm",
    type: "bool",
    def: true,
    label: { ru: "Подтверждать массовый бан", en: "Confirm multi-channel bans" },
  },
  {
    // Как клиент 5.4.0 (решение владельца 03.10): массбан из карточки — с вопросом о причине.
    key: "sharedbans.mbAskReason",
    type: "bool",
    def: true,
    label: { ru: "Спрашивать причину массового бана", en: "Ask for a multi-channel ban reason" },
    hint: { ru: "Из карточки. Пусто — бан без причины", en: "From the user card. Empty — no reason" },
  },
  {
    key: "sharedbans.mbJoin",
    type: "bool",
    def: true,
    label: { ru: "Кнопка «Присоединиться»", en: "“Join” button" },
    hint: { ru: "Забанить того же на своих каналах", en: "Ban the same person on your channels" },
  },
  {
    key: "sharedbans.mbExcluded",
    type: "list",
    pageWritable: true, // пишет страница Twitch (белый список фона)
    def: [],
    label: { ru: "Каналы, исключённые из массового бана", en: "Channels excluded from multi-bans" },
  },
]);

CPX.i18n.add({
  ru: { "pages.group.sharedbans": "Общие баны" },
  en: { "pages.group.sharedbans": "Shared bans" },
});

// ── src/common/49_settings_channel.js ──
/* Настройки страницы канала: число «в чате» у счётчика зрителей и быстрые ссылки в «О себе»
 * (src/main/73_chatters.js, src/main/73_quick_links.js, фон src/bg/58_chatters.js).
 *
 * Решения владельца 01.10: оба включены у всех; число — лавандой, не красным.
 * Список ссылок — скрытая настройка с pageWritable: страница настроек списки не рисует («в окнах
 * своих модулей» — 20_pages.js), его редактор — окно у самого ряда ссылок (кнопка-карандаш).
 * ⚠️Без pageWritable фон молча отбросил бы запись скрытого ключа со страницы Twitch
 * (src/bg/20_settings.js) — правки списка не сохранялись бы.
 */

CPX.defineSettings("channel", [
  {
    // На странице настроек — в «Интерфейс» → «Под плеером» (владелец 22.10), ключ прежний.
    key: "channel.chatters",
    type: "bool",
    def: true,
    label: { ru: "Число «в чате» рядом со зрителями", en: "“In chat” count next to viewers" },
    hint: { ru: "Сколько зрителей подключены к чату", en: "How many viewers are connected to the chat" },
  },
  {
    // Владелец 16.10: при наведении на таймер эфира — когда эфир начался (src/main/73_uptime.js).
    key: "channel.uptimeStart",
    type: "bool",
    def: true,
    label: { ru: "Начало эфира при наведении на таймер", en: "Stream start time when hovering the timer" },
    hint: { ru: "Дата и время по вашим часам", en: "Date and time in your local time" },
  },
  {
    key: "channel.quickLinksOn",
    type: "bool",
    def: true,
    label: { ru: "Быстрые ссылки в «О себе»", en: "Quick links in “About”" },
    hint: { ru: "TwitchTracker и свои. Изменить — карандаш у ссылок", en: "TwitchTracker and your own. Edit — the pencil next to them" },
  },
  {
    // [{title, url}] — подпись до 30 знаков и адрес-шаблон https:// с подстановками {login} {id}
    // {name} (и %username% — как у Enhancer); до 10 ссылок. Проверяет и чистит 73_quick_links.js.
    key: "channel.quickLinks",
    type: "list",
    def: [
      // владелец 04.10: по умолчанию только TwitchTracker (SullyGnome и Streams Charts убраны) — свои добавляют сами
      { title: "TwitchTracker", url: "https://twitchtracker.com/{login}" },
    ],
    hidden: true,
    pageWritable: true,
    label: { ru: "Быстрые ссылки", en: "Quick links" },
  },
]);

CPX.i18n.add({
  ru: { "pages.group.channel": "Канал" },
  en: { "pages.group.channel": "Channel" },
});

// ── src/common/49_settings_emotemenu.js ──
/* Настройки меню смайликов Chatterino+ (src/main/78_*–79_emote_menu_*).
 *
 * Лежат в группе «input» (на странице настроек — раздел «Поле ввода»): меню — добавка к полю
 * ввода, отдельный раздел ради одной галочки был бы лишним.
 * Меню открывается РОДНОЙ кнопкой смайликов Twitch в поле ввода (Shift+щелчок — окно Twitch);
 * галочка выключена — всё как у Twitch.
 * «Недавние», «Избранное», недавние эмодзи и оттенок кожи — скрытые настройки с pageWritable:
 * так они общие для всех вкладок и переживают перезапуск браузера (хранит фон в chrome.storage),
 * на странице настроек их не видно и «сбросить всё» их не трогает. ⚠️Без pageWritable фон молча
 * отбрасывает запись скрытого ключа со страницы Twitch (src/bg/20_settings.js) — ничего бы не
 * сохранялось.
 */

CPX.defineSettings("input", [
  {
    key: "input.menu",
    type: "bool",
    def: true,
    label: { ru: "Меню смайликов Chatterino+", en: "Chatterino+ emote menu" },
    hint: { ru: "Вместо окна Twitch. Окно Twitch — Shift+щелчок", en: "Instead of the Twitch one. Twitch's — Shift+click" },
  },
  {
    // Владелец 23.10: меню не закрывается после выбора смайлика — только после отправки сообщения
    // (откреплённое окно — никогда). Выключено — как раньше: закрывается сразу, Shift — оставить.
    key: "input.menuKeep",
    type: "bool",
    def: true,
    label: { ru: "Не закрывать меню смайликов после выбора", en: "Keep the emote menu open after picking" },
    hint: {
      ru: "Закроется после отправки сообщения. Выключено — закрывается сразу, Shift+щелчок — оставить открытым",
      en: "It closes once the message is sent. Off — closes right away, Shift+click keeps it open",
    },
  },
  {
    // [{p, i, n}] — сервис, id и имя; самые свежие первыми (78_emote_menu_data.js).
    key: "input.menuRecent",
    type: "list",
    def: [],
    hidden: true,
    pageWritable: true,
    label: { ru: "Недавние смайлики", en: "Recent emotes" },
  },
  {
    // [{p, i, n}] — как недавние; порядок — в каком добавляли (78_emote_menu_data.js).
    key: "input.menuFav",
    type: "list",
    def: [],
    hidden: true,
    pageWritable: true,
    label: { ru: "Избранные смайлики", en: "Favorite emotes" },
  },
  {
    // ["😀", …] — эмодзи без оттенка кожи, самые свежие первыми (78_emoji_model.js).
    key: "input.emojiRecent",
    type: "list",
    def: [],
    hidden: true,
    pageWritable: true,
    label: { ru: "Недавние эмодзи", en: "Recent emoji" },
  },
  {
    // 0 — без оттенка (жёлтый), 1…5 — от светлого к тёмному.
    key: "input.emojiTone",
    type: "int",
    def: 0,
    min: 0,
    max: 5,
    hidden: true,
    pageWritable: true,
    label: { ru: "Оттенок кожи эмодзи", en: "Emoji skin tone" },
  },
]);

// ── src/common/49_settings_gif.js ──
/* Настройки вкладки GIF (Twitch и GIPHY) в меню смайликов (src/main/79_gif_*).
 *
 * Лежат в группе «input» (раздел «Поле ввода»), рядом с настройками меню смайликов.
 *
 * ⚠️Избранное — список БЕЗ пометки hidden, хотя на странице настроек его не видно: списки она
 * не рисует вовсе (20_pages.js: «списки и особые виды — в окнах своих модулей»), а скрытые
 * ключи фон НЕ даёт менять миру страницы (20_settings.js: fromPage && hidden → пропуск) —
 * с hidden звёздочка в меню молча ничего бы не сохраняла.
 */

CPX.defineSettings("input", [
  {
    key: "input.gifs",
    type: "bool",
    def: true,
    label: { ru: "Вкладка GIF", en: "GIF tab" },
    hint: { ru: "Поиск и отправка GIF из меню смайликов", en: "Search and send GIFs from the emote menu" },
  },
  {
    // [{i, t, u, p, s, w, h}] — id, подпись, оригинал (уходит в Twitch), превью, первый кадр,
    // размеры превью; свежие первыми (79_gif_core.js). Только у этого человека, на наш сервер
    // не уходит.
    key: "input.gifFavorites",
    type: "list",
    pageWritable: true, // пишет страница Twitch (белый список фона)
    // До 300 записей по три адреса GIPHY — общий потолок 64 КБ кончался на 110–230 (проверка 01.10).
    maxItems: 400,
    maxBytes: 320 * 1024,
    def: [],
    label: { ru: "Избранные GIF", en: "Favorite GIFs" },
  },
]);

// ── src/common/49_settings_interface.js ──
/* Настройки области «ui»: раздел «Интерфейс» — скрыть лишнее на странице Twitch и поправить левую панель
 * (src/main/93_interface.js). Владелец 03.10 (по предложению тестера): каждая опция — отдельная, коротко и
 * понятно; выключены по умолчанию (кроме ui.hideDisclosure и ui.clipView — владелец 19.10). Скрытое не удаляется со страницы —
 * выключили опцию, и оно на месте. */

CPX.defineSettings("ui", [
  // Раскладка страницы
  {
    // Владелец 30.10 (просьба зрителя): окно вытянуто вверх (браузер на половине экрана) — чат под плеером, плеер во
    // всю ширину, описание — ниже прокруткой (src/main/93_chat_below.js). Включено по умолчанию.
    key: "ui.chatBelow",
    type: "bool",
    def: true,
    label: { ru: "Чат под плеером в узком окне", en: "Chat below the player in a narrow window" },
    hint: {
      ru: "Когда окно вытянуто вверх (например, браузер на половине экрана), чат переезжает под плеер — видео во всю ширину. Описание канала — ниже, прокруткой",
      en: "When the window is taller than it is wide (e.g. the browser on half of the screen), the chat moves below the player and the video gets the full width. Channel info is further down",
    },
  },
  // Верхняя панель
  {
    key: "ui.hidePrime",
    type: "bool",
    def: false,
    label: { ru: "Скрыть значок Prime", en: "Hide the Prime icon" },
    hint: { ru: "Предложения Prime в верхней панели", en: "Prime offers in the top bar" },
  },
  {
    key: "ui.hideGetBits",
    type: "bool",
    def: false,
    label: { ru: "Скрыть кнопку Bits вверху", en: "Hide the Bits button at the top" },
  },
  {
    key: "ui.hideTurbo",
    type: "bool",
    def: false,
    label: { ru: "Скрыть «Месяц без рекламы»", en: "Hide the «ad-free month» offer" },
    hint: { ru: "Реклама Turbo в верхней панели", en: "The Turbo offer in the top bar" },
  },
  // Левая панель
  {
    key: "ui.sideNoForYou",
    type: "bool",
    def: false,
    label: { ru: "Убрать заголовок «Для вас»", en: "Remove the «For You» heading" },
    hint: {
      ru: "На его место встаёт «Отслеживаемые каналы»; способ сортировки выбирается щелчком по этой надписи",
      en: "«Followed Channels» moves up in its place; click it to choose the sort order",
    },
  },
  {
    // Владелец 30.10 (отзыв): прежняя «Отслеживаемые — по числу зрителей» запирала выбор способа и сортировала по-своему
    // (совместные эфиры «+1» разъезжались). Теперь порядок — всегда Twitch, способ — щелчком по заголовку, а подпись —
    // отдельно этой настройкой. Кто включал прежнюю — перенос в фоне (bg/20_settings: ui.sideSortMig).
    key: "ui.sideHideSortLabel",
    type: "bool",
    def: false,
    label: { ru: "Скрыть подпись способа сортировки", en: "Hide the sort order caption" },
    hint: {
      ru: "«Аудитория (по убыв.)» и другие под заголовком «Отслеживаемые каналы». Способ по-прежнему выбирается щелчком по заголовку",
      en: "«Viewers (High to Low)» and others under «Followed Channels». You can still choose the order by clicking the heading",
    },
  },
  // Разовый перенос прежней «по числу зрителей» (bg/20_settings): страница один раз ставит Twitch «Аудитория (по
  // убыв.)» (93_interface: sortOnce) и снимает пометку. pageWritable — пишет страница Twitch.
  { key: "ui.sideSortOnce", type: "bool", def: false, hidden: true, pageWritable: true },
  { key: "ui.sideSortMig", type: "int", def: 0, min: 0, max: 99, hidden: true },
  {
    key: "ui.sideShowAll",
    type: "bool",
    def: false,
    label: { ru: "Показывать всех отслеживаемых", en: "Show all followed channels" },
    hint: { ru: "Без «Показать ещё»", en: "No «Show more»" },
  },
  {
    // Владелец 23.10 (как у BetterTTV): прятать отслеживаемых не в эфире; закреплённые остаются (решение владельца).
    key: "ui.sideHideOffline",
    type: "bool",
    def: false,
    label: { ru: "Скрывать каналы не в эфире", en: "Hide offline channels" },
    hint: { ru: "В «Отслеживаемых». Закреплённые остаются", en: "In «Followed». Pinned channels stay" },
  },
  {
    key: "ui.sidePin",
    type: "bool",
    def: false,
    label: { ru: "Закреплять каналы наверху", en: "Pin channels to the top" },
    hint: { ru: "Булавка при наведении на канал в «Отслеживаемых»", en: "A pin appears when you hover a followed channel" },
  },
  {
    key: "ui.sideNoRecs",
    type: "bool",
    def: false,
    label: { ru: "Убрать рекомендации", en: "Remove recommendations" },
    hint: { ru: "«Активные каналы» и рекомендуемые категории", en: "Recommended channels and categories" },
  },
  {
    key: "ui.sideNoSimilar",
    type: "bool",
    def: false,
    label: { ru: "Убрать «Зрители … также смотрят»", en: "Remove «Viewers also watch»" },
  },
  {
    key: "ui.sideNoStories",
    type: "bool",
    def: false,
    label: { ru: "Убрать «Истории»", en: "Remove Stories" },
  },
  {
    // Владелец 14.10: напоминание Twitch о серии просмотров («Сохраните вашу серию») в «Для вас».
    key: "ui.sideNoStreak",
    type: "bool",
    def: false,
    label: { ru: "Убрать «Сохраните вашу серию»", en: "Remove «Save your streak»" },
    hint: { ru: "Напоминание о серии просмотров в левой панели", en: "The watch streak reminder in the side bar" },
  },
  {
    // Закреплённые каналы (логины). Пишет страница Twitch (булавка) — поэтому pageWritable.
    key: "ui.sidePins",
    type: "list",
    def: [],
    hidden: true,
    pageWritable: true,
    maxItems: 100,
    label: { ru: "Закреплённые каналы", en: "Pinned channels" },
  },
  // Страницы Twitch
  {
    // Владелец 23.10: «Последние итоги трансляций» (новая функция Twitch) — нигде и никогда (src/main/93_interface.js).
    key: "ui.hideRecaps",
    type: "bool",
    def: false,
    label: { ru: "Скрывать итоги трансляций", en: "Hide stream recaps" },
    hint: {
      ru: "Полки «Последние итоги трансляций» на страницах каналов и категорий и уведомления о них. Ссылка на итог открывает главную канала",
      en: "“Recent stream recaps” shelves on channel and category pages and notifications about them. A recap link opens the channel home",
    },
  },
  // В плеере
  {
    // Владелец 19.10: плашка Twitch «Предназначено для определённой аудитории» слева сверху плеера; включено по умолчанию.
    key: "ui.hideDisclosure",
    type: "bool",
    def: true,
    label: { ru: "Скрыть «Предназначено для определённой аудитории»", en: "Hide «Intended for certain audiences»" },
    hint: { ru: "Плашка слева сверху плеера", en: "The label in the top left corner of the player" },
  },
  // Под плеером
  {
    key: "ui.hideBitsOffer",
    type: "bool",
    def: false,
    label: { ru: "Скрыть «Bits: скидка»", en: "Hide «Bits: discount»" },
  },
  {
    key: "ui.hideSubUpgrade",
    type: "bool",
    def: false,
    label: { ru: "Скрыть «Повысить уровень подписки»", en: "Hide «Upgrade subscription»" },
  },
  {
    // Владелец 16.10: под плеером и в строке канала поверх плеера в кинорежиме.
    key: "ui.hideFollow",
    type: "bool",
    def: false,
    label: { ru: "Скрыть «Отслеживать» / «Перестать отслеживать»", en: "Hide «Follow» / «Unfollow»" },
    hint: { ru: "Кнопка с сердечком — и в кинорежиме", en: "The heart button — in theatre mode too" },
  },
  {
    key: "ui.hideNotify",
    type: "bool",
    def: false,
    label: { ru: "Скрыть настройки уведомлений канала", en: "Hide channel notification settings" },
    hint: { ru: "Кнопка с колокольчиком — и в кинорежиме", en: "The bell button — in theatre mode too" },
  },
  {
    key: "ui.hideGift",
    type: "bool",
    def: false,
    label: { ru: "Скрыть «Подарить подписку»", en: "Hide «Gift a Sub»" },
    hint: { ru: "И в кинорежиме", en: "In theatre mode too" },
  },
  // Чат
  {
    key: "ui.hideCheer",
    type: "bool",
    def: false,
    label: { ru: "Скрыть кнопку Cheer в поле ввода", en: "Hide the Cheer button in chat input" },
  },
  {
    key: "ui.hideBitsBalance",
    type: "bool",
    def: false,
    label: { ru: "Скрыть баланс Bits под полем ввода", en: "Hide the Bits balance under chat input" },
    hint: { ru: "Баллы канала остаются", en: "Channel points stay" },
  },
  {
    key: "ui.hideLeaderboard",
    type: "bool",
    def: false,
    label: { ru: "Скрыть таблицу лидеров над чатом", en: "Hide the leaderboard above chat" },
    hint: { ru: "Кто больше всех подарил подписок и Bits", en: "Top gifters and cheerers" },
  },
  // Клипы (владелец 19.10: окно клипов поверх страницы, как посты eblo.id; src/main/87_clip_view.js)
  {
    key: "ui.clipView",
    type: "bool",
    def: true,
    label: { ru: "Открывать клипы поверх страницы", en: "Open clips over the page" },
    hint: {
      ru: "Своё окно и своя громкость, звук страницы на это время выключается. Ctrl, Shift или средняя кнопка мыши — новая вкладка",
      en: "Own window and volume; the page sound is muted meanwhile. Ctrl, Shift or the middle mouse button — a new tab",
    },
  },
  {
    // Громкость окна клипов (своя, как у постов eblo.id); −1 — ещё не выбрана: берём громкость плеера Twitch.
    key: "ui.clipVolume",
    type: "int",
    min: -1,
    max: 100,
    def: -1,
    hidden: true,
    pageWritable: true,
    label: { ru: "Громкость в окне клипов", en: "Clip window volume" },
  },
]);

CPX.i18n.add({
  ru: { "pages.group.ui": "Интерфейс" },
  en: { "pages.group.ui": "Interface" },
});

// ── src/common/49_settings_native.js ──
/* Настройки области «native»: связь с программой Chatterino+ на компьютере (src/bg/70_native.js). Владелец 11.10: в
 * «Экспериментах», по умолчанию выключено. permission — необязательное разрешение браузера (optional_permissions
 * манифеста): страница настроек спрашивает его, когда человек включает настройку (20_pages.js, settingInput). */

CPX.defineSettings("native", [
  {
    key: "native.watching",
    type: "bool",
    def: false,
    permission: "nativeMessaging",
    label: { ru: "Канал с Twitch — во вкладку /watching программы", en: "Twitch channel to the app’s /watching tab" },
    hint: {
      ru: "Канал, который вы смотрите в браузере, сразу открывается во вкладке /watching программы Chatterino+",
      en: "The channel you watch in the browser opens right away in the /watching tab of the Chatterino+ app",
    },
  },
]);

// ── src/common/49_settings_player.js ──
/* Настройки плеера: догон задержки (src/main/74_player_catchup.js).
 *
 * Решение владельца 01.10: включено у всех. 21.10 (жалоба «догон — стрим лагает», стенд: нынешний догон на рвущейся сети
 * в разы чаще подвисал) — догон ВЕДОМЫЙ: когда догонять, решает сам плеер Twitch, а мы задаём только скорость. Порог и
 * «Беречь запас» убраны. Цель вернулась тем же днём (владелец: плеер после сбоя останавливается на 4–5 с) — свой догон до
 * неё, когда сеть спокойна; на неровной сети цель поднимается сама.
 *
 * Скорость по умолчанию 1,1× — почти незаметно (у Enhancer до 1,1). Быстрее можно, но ползунок краснеет и под ним
 * «Может быть нестабильно» (warnAbove — общий признак ползунка, src/pages/20_pages.js).
 *
 * Уведомление над видео (владелец 21.10) по умолчанию выключено: при 1,1× догон видно по задержке у таймера (блок
 * становится лавандовым, 74_player_latency.js). Скорость подняли выше 1,1× — уведомление включается само
 * (player.catchupNoticeAuto), вернули 1,1× — само и выключается; выключил его человек хоть раз — запоминаем
 * (player.catchupNoticeOff) и больше сами не включаем. Связку ведёт фон (bg/20_settings.js).
 */

CPX.CATCHUP_SAFE = 1.1; // скорость догона, выше которой — «может быть нестабильно» и уведомление над видео

CPX.defineSettings("player", [
  {
    key: "player.catchup",
    type: "bool",
    def: true,
    label: { ru: "Догонять эфир", en: "Catch up to live" },
    hint: {
      ru: "Отстали — видео со звуком чуть ускоряется, пока не догонит эфир. На плохой сети бережём запас видео, чтобы не было подвисаний",
      en: "Fell behind? Video and sound speed up slightly until caught up. On a bad network we keep a buffer to avoid stalls",
    },
  },
  {
    // Владелец 21.10 (после выпуска ведомого догона): «вернуть цель, до которой эфир должен вернуться, как только появится
    // стабильная возможность». «Авто» — как шёл эфир до сбоя (1,5…2,5 с). Цель на неровной сети поднимается сама
    // (не ниже повторившейся паузы загрузки + 0,9 с, 5 мин после повтора; разовый сбой не в счёт) —
    // src/main/74_player_catchup.js, «ЦЕЛЬ».
    key: "player.catchupTarget",
    type: "select",
    def: "auto",
    options: [
      { v: "auto", ru: "Авто (1,5–2,5 с)", en: "Auto (1.5–2.5 s)" },
      { v: "1.5", ru: "1,5 с", en: "1.5 s" },
      { v: "2", ru: "2 с", en: "2 s" },
      { v: "2.5", ru: "2,5 с", en: "2.5 s" },
      { v: "3", ru: "3 с", en: "3 s" },
      { v: "4", ru: "4 с", en: "4 s" },
    ],
    label: { ru: "Желаемая задержка", en: "Target delay" },
    hint: {
      ru: "Догоняем до неё, когда сеть спокойна. Сеть неровная — держим запас, чтобы не было подвисаний",
      en: "We catch up to it when the network is calm. On a bumpy network we keep a buffer to avoid stalls",
    },
  },
  {
    key: "player.catchupMaxRate",
    type: "range",
    def: 1.1, // владелец 21.10 (было 1,75 с 04.10)
    min: 1.05,
    max: 5,
    step: 0.05,
    unit: "×",
    warnAbove: CPX.CATCHUP_SAFE,
    warn: { ru: "Может быть нестабильно", en: "May be unstable" },
    label: { ru: "Скорость догона", en: "Catch-up speed" },
    hint: { ru: "1,1× почти незаметно. Быстрее — догоняет скорее, но звук ускоряется заметнее", en: "1.1× is barely noticeable. Faster catches up sooner, but the sound speeds up more noticeably" },
  },
  {
    key: "player.catchupNotice",
    type: "bool",
    def: false, // владелец 21.10: при 1,1× догон видно по задержке у таймера
    label: { ru: "Уведомление над видео", en: "Notice over the video" },
    hint: {
      ru: "Значок, пока догоняем; наведите — скорость и сколько осталось. Выключено — догон видно по задержке у таймера",
      en: "An icon while catching up; hover for the speed and time left. Off — the delay next to the stream timer shows it",
    },
  },
  // Служебные (связка «уведомление ↔ скорость», bg/20_settings.js): человек сам выключал уведомление; уведомление
  // включено автоматически (из-за скорости выше 1,1×). Общий сброс возвращает и их.
  { key: "player.catchupNoticeOff", type: "bool", def: false, hidden: true, reset: true },
  { key: "player.catchupNoticeAuto", type: "bool", def: false, hidden: true, reset: true },
  // Разовый перенос настроек догона при обновлении (21.10) — сделан.
  { key: "player.catchupMig", type: "int", def: 0, min: 0, max: 99, hidden: true },
  // «Только звук» в меню качества (владелец 30.10, src/main/74_player_audio.js): Twitch после перезагрузки страницы
  // этот выбор не помнит — помним сами. Пишет страница Twitch (выбор в меню плеера).
  { key: "player.audioOnly", type: "bool", def: false, hidden: true, pageWritable: true },
  {
    // Владелец 01.10: ошибка Firefox 1955841 (до 157, Zen 1.22 на 156) — звук уходит вперёд картинки после
    // возврата скорости к 1,0; в новых браузерах её нет — по умолчанию выключено, включает, у кого она есть.
    // Работает только там, где ошибка есть (02.10: в Chromium перемотка давала подвисания) — поэтому в Chrome
    // настройку не показываем вовсе (firefoxOnly, страница настроек; владелец 04.10: «чтобы никого не путать»).
    key: "player.catchupSyncFix",
    type: "bool",
    def: false,
    firefoxOnly: true,
    label: { ru: "Исправить рассинхрон звука после ускорения", en: "Fix audio desync after speed-up" },
    hint: {
      ru: "Для Firefox до 157 версии: звук опережает картинку после догона — изредка мгновенная перемотка на месте",
      en: "For Firefox before version 157: audio runs ahead of video after catching up — an occasional instant in-place seek",
    },
  },
]);

/* Подсветка вокруг плеера (владелец 14.10, по мотивам youtube-ambilight; src/main/74_player_ambient.js): по умолчанию
 * включена у всех («кто не хочет или у кого слабый компьютер — выключит»). Уровни и тексты — дизайн-документ 13.10.
 * Владелец 14.10 (после проверки): свой раздел настроек «Ambilight» (область ambient, ключи прежние — player.*),
 * отклик по умолчанию «быстрый», кнопку в плеере можно спрятать; «притушить интерфейс» по умолчанию — «немного»
 * (владелец 14.10 сначала просил «нет», после проверки вернул «немного»).
 * player.ambient пишет и кнопка в плеере Twitch — pageWritable. */
CPX.defineSettings("ambient", [
  {
    key: "player.ambient",
    type: "bool",
    def: true,
    pageWritable: true,
    label: { ru: "Подсветка вокруг плеера", en: "Ambient light around the player" },
    hint: {
      ru: "Мягкий свет цветами видео вокруг плеера — заходит и на панели Twitch, в режиме модератора — на соседние плитки; на Kick — под плеер и на чат. В кинорежиме и на весь экран подсвечиваются чёрные полосы",
      en: "Soft light in the video’s colours around the player — it spills onto Twitch’s side bars too, and onto nearby tiles in Mod View; on Kick — below the player and onto the chat. In theatre mode and fullscreen it fills the black bars",
    },
  },
  {
    key: "player.ambientLevel",
    type: "select",
    def: "normal",
    options: [
      { v: "soft", ru: "Мягкая", en: "Soft" },
      { v: "normal", ru: "Обычная", en: "Normal" },
      { v: "bright", ru: "Яркая", en: "Bright" },
    ],
    label: { ru: "Яркость подсветки", en: "Ambient brightness" },
  },
  {
    key: "player.ambientDim",
    type: "select",
    def: "little",
    options: [
      { v: "off", ru: "Нет", en: "Off" },
      { v: "little", ru: "Немного", en: "A little" },
      { v: "lot", ru: "Сильно", en: "A lot" },
    ],
    label: { ru: "Притушить интерфейс", en: "Dim the page" },
    hint: { ru: "Верхняя и левая панели — темнее, пока на них не навели. Чат не приглушается", en: "The top and side bars get darker until hovered. The chat is never dimmed" },
  },
  {
    key: "player.ambientResponse",
    type: "select",
    def: "fast",
    // Владелец 01.11: режим выбирает только человек — сама подсветка в экономный больше не уходит.
    options: [
      { v: "eco", ru: "Экономный — для слабых компьютеров", en: "Economy — for slower PCs" },
      { v: "smooth", ru: "Плавный — бережёт компьютер", en: "Smooth — easy on your PC" },
      { v: "fast", ru: "Быстрый — 30 раз в секунду", en: "Fast — 30 times a second" },
      { v: "max", ru: "Максимальный — до 60 раз в секунду", en: "Maximum — up to 60 times a second" },
    ],
    label: { ru: "Отклик подсветки", en: "Ambient response" },
    hint: {
      ru: "Как часто свет успевает за картинкой. Экономный обновляется 4 раза в секунду, максимальный — на каждом кадре видео",
      en: "How quickly the light follows the picture. Economy updates 4 times a second, Maximum on every video frame",
    },
  },
  {
    key: "player.ambientChat",
    type: "bool",
    def: true,
    label: { ru: "Свет на чате", en: "Light on the chat" },
    hint: { ru: "Свет заходит и на чат — у края рядом с плеером", en: "The light also reaches the chat, near the edge by the player" },
  },
  {
    key: "player.ambientButton",
    type: "bool",
    def: true,
    label: { ru: "Кнопка в плеере", en: "Button in the player" },
    hint: { ru: "Включает и выключает подсветку — рядом с «Режимом кинотеатра»", en: "Turns the ambient light on and off — next to Theatre mode" },
  },
]);

CPX.i18n.add({
  ru: { "pages.group.player": "Плеер", "pages.group.ambient": "Ambilight" },
  en: { "pages.group.player": "Player", "pages.group.ambient": "Ambilight" },
});

/* Расширения стримера поверх видео (src/main/74_ext_overlay.js). Решение владельца 01.10: включается
 * один раз в настройках (по умолчанию выключено); вернуть расширение — тумблером «Видимость» в его
 * меню, выбор помнится по каналу. ⚠️player.extShown — скрытый список с pageWritable: его пишет
 * сама страница Twitch (без pageWritable фон молча отбросил бы запись — src/bg/20_settings.js).
 */
CPX.defineSettings("player", [
  {
    key: "player.extHide",
    type: "bool",
    def: false,
    label: { ru: "Скрывать расширения стримера поверх видео", en: "Hide streamer extensions over the video" },
    hint: { ru: "Вернуть — тумблер «Видимость» в меню расширения", en: "Bring one back with the “Visible” switch in its menu" },
  },
  {
    // ["<ID канала>:<ID расширения>"] — где зритель сам включил видимость; до 300 (старые — вон).
    key: "player.extShown",
    type: "list",
    def: [],
    hidden: true,
    pageWritable: true,
    label: { ru: "Расширения, которые зритель включил", en: "Extensions the viewer turned on" },
  },
]);

/* Волна 6: задержка эфира у таймера (src/main/74_player_latency.js) и перезагрузка проигрывателя
 * (src/main/74_player_reset.js); 03.10 — кнопка скриншота (src/main/74_player_shot.js); 05.11 — «Картинка в картинке»
 * (src/main/74_player_pip.js, только Chromium). Всё включено по умолчанию. */
CPX.defineSettings("player", [
  {
    // На странице настроек — в «Интерфейс» → «Под плеером» (владелец 22.10), ключ прежний.
    key: "player.latency",
    type: "bool",
    def: true,
    label: { ru: "Задержка эфира у таймера", en: "Stream delay next to the timer" },
    hint: { ru: "На сколько секунд вы отстаёте от стримера", en: "How many seconds you are behind the streamer" },
  },
  {
    key: "player.resetButton",
    type: "bool",
    def: true,
    label: { ru: "Кнопка перезагрузки плеера", en: "Reload player button" },
    hint: { ru: "Если видео зависло. Громкость и качество сохраняются", en: "For a frozen video. Volume and quality are kept" },
  },
  {
    key: "player.shotButton",
    type: "bool",
    def: true,
    label: { ru: "Кнопка скриншота", en: "Screenshot button" },
    hint: { ru: "Кадр эфира в буфер обмена — в углу плеера, после «Клипа»", en: "Copies the current frame to the clipboard — next to «Clip» in the player" },
  },
  {
    // Владелец 05.11 (отзыв): своя кнопка вместо кнопки BTTV/FFZ. pipApi — строка только там, где браузер умеет окно по
    // вызову страницы (document.pictureInPictureEnabled; Chromium, Firefox 159; где нет — у Firefox своя плашка на видео).
    key: "player.pipButton",
    type: "bool",
    def: true,
    pipApi: true,
    label: { ru: "Кнопка «Картинка в картинке»", en: "Picture-in-picture button" },
    hint: { ru: "Видео в маленьком окне поверх всех окон — в углу плеера, рядом с «На весь экран»", en: "Video in a small window on top of all windows — next to «Fullscreen» in the player" },
  },
  {
    key: "player.autoReset",
    type: "bool",
    def: true,
    label: { ru: "Перезапускать плеер после ошибки", en: "Restart the player after an error" },
    hint: { ru: "Сам, не чаще 5 раз за 10 минут", en: "Automatically, at most 5 times in 10 minutes" },
  },
]);

/* Компрессор звука (src/main/74_player_comp.js). Владелец 10.10: по умолчанию выключен; 30.10 — кнопка у всех по умолчанию
 * (player.compressor вкл.; сам компрессор на канале — по нажатию, как раньше; с 16.10 — в «Плеере», свой подраздел); кнопка — в
 * плеере после громкости; положение кнопки помнится ПО КАНАЛУ (владелец 10.10). ⚠️player.compChannels — скрытый список
 * с pageWritable: его пишет кнопка в самой странице Twitch. */
CPX.defineSettings("player", [
  {
    key: "player.compressor",
    type: "bool",
    def: true,
    label: { ru: "Компрессор звука в плеере", en: "Audio compressor in the player" },
    hint: {
      ru: "Кнопка после громкости: тихое громче, громкое тише — голос и громкая игра выравниваются",
      en: "A button next to the volume: quiet sounds louder, loud ones quieter — voice and loud game even out",
    },
  },
  {
    key: "player.compStrength",
    type: "select",
    def: "medium",
    options: [
      { v: "soft", ru: "Мягко", en: "Soft" },
      { v: "medium", ru: "Средне", en: "Medium" },
      { v: "strong", ru: "Сильно", en: "Strong" },
    ],
    label: { ru: "Сила компрессора", en: "Compressor strength" },
    hint: { ru: "Сильнее — ровнее громкость, но и тихий фон громче", en: "Stronger — more even volume, but quiet background gets louder too" },
  },
  {
    // Владелец 16.10: включён на всех каналах сам; выключили кнопкой в плеере — только до ухода с канала.
    key: "player.compAll",
    type: "bool",
    def: false,
    label: { ru: "Включить компрессор на всех каналах", en: "Turn the compressor on for all channels" },
    hint: {
      ru: "Включается сам на каждом канале. Выключили кнопкой в плеере — только до ухода с канала",
      en: "Turns on by itself on every channel. Turned off with the player button — only until you leave the channel",
    },
  },
  {
    // Логины каналов, где кнопкой включён компрессор (на остальных выключен); до 500 — старые уходят.
    key: "player.compChannels",
    type: "list",
    def: [],
    maxItems: 500,
    hidden: true,
    pageWritable: true,
    label: { ru: "Каналы с включённым компрессором", en: "Channels with the compressor on" },
  },
]);

/* Владелец 16.10: окно «для взрослых» и автозапуск (src/main/74_player_auto.js) — подраздел «Запуск видео»; пропуск окна
 * выключен (владелец 01.11; с 16.10 был включён у всех), «не запускать» выключены (как у Twitch). Реальное время на записях (src/main/74_player_vod.js) — включено,
 * с датой. */
CPX.defineSettings("player", [
  {
    key: "player.skipMature",
    type: "bool",
    def: false,
    label: { ru: "Пропускать предупреждение «для взрослых»", en: "Skip the “mature audiences” warning" },
    hint: { ru: "Видео начинается сразу, без «Начать просмотр»", en: "The video starts right away, without “Start Watching”" },
  },
  {
    key: "player.pauseHome",
    type: "bool",
    def: false,
    label: { ru: "Не запускать видео на главной Twitch", en: "Don't autoplay video on the Twitch home page" },
    hint: { ru: "Трансляция наверху главной стоит на паузе, пока не нажмёте", en: "The stream at the top of the home page waits until you press play" },
  },
  {
    key: "player.pauseOffline",
    type: "bool",
    def: false,
    label: { ru: "Не запускать видео у канала не в эфире", en: "Don't autoplay video on offline channels" },
    hint: { ru: "Запись или клип на странице канала стоит на паузе, пока не нажмёте", en: "The video or clip on the channel page waits until you press play" },
  },
  {
    key: "player.vodClock",
    type: "bool",
    def: true,
    label: { ru: "Реальное время на записях", en: "Real time on videos" },
    hint: { ru: "Когда шёл этот момент эфира — по вашим часам, рядом со временем записи", en: "When this moment was live — in your local time, next to the video time" },
  },
  {
    key: "player.vodClockDate",
    type: "bool",
    def: true,
    label: { ru: "Вместе с датой", en: "With the date" },
  },
]);

/* Владелец 16.10: без теней сверху и снизу плеера, когда видны его кнопки (src/main/74_player.js, styles/page-74-shade.css) —
 * в самом низу «Плеера», включено у всех. */
CPX.defineSettings("player", [
  {
    key: "player.noShade",
    type: "bool",
    def: true,
    label: { ru: "Убрать затемнение сверху и снизу плеера", en: "Remove the dark shading at the top and bottom of the player" },
    hint: {
      ru: "Тени, которые Twitch показывает вместе с кнопками плеера. Время у полосы перемотки — на тёмных плашках, круг при наведении на кнопку — тёмный",
      en: "The shadows Twitch shows together with the player buttons. Times by the seek bar sit on dark pills, the hover circle on buttons is dark",
    },
  },
]);

// ── src/common/49_settings_points.js ──
/* Автосбор бонуса баллов канала (src/main/74_points_claim.js, замок вкладок — src/bg/59_points.js).
 *
 * Решение владельца 01.10: ВЫКЛЮЧЕН по умолчанию (как у FFZ и BTTV) — включают сами. На странице настроек —
 * в разделе «Эксперименты» (владелец 04.10; группа channel, раздел задаёт pages/20_pages.js: CATS).
 */

CPX.defineSettings("channel", [
  {
    key: "points.autoClaim",
    type: "bool",
    def: false,
    label: { ru: "Сбор баллов", en: "Points collection" },
    hint: { ru: "Нажимает кнопку бонуса за вас", en: "Presses the bonus button for you" },
  },
]);

// ── src/common/49_settings_polls.js ──
/* Настройки области «polls»: окно быстрых опросов и прогнозов на странице Twitch
 * (src/main/90_*–91_*, ТЗ — research/04 §2).
 *
 *   polls.button  — наша кнопка у поля ввода. Видна только стримеру и модераторам и только на
 *                   каналах компаньонов/партнёров (у остальных Twitch опросов не даёт вообще).
 *   polls.history — «История»: прошлые опросы и прогнозы, чтобы повторить в один щелчок.
 *                   Формат записи — как у клиента (PollHistory.hpp), чтобы позже переносить:
 *                   { channel: логин, eventId, kind: "poll"|"prediction", title, options: [..],
 *                     durationSec, ts }. До 5 на канал и вид; всего не больше 100 записей.
 *                   Пишет её окно опросов (свои созданные + увиденные идущими + подтянутые с
 *                   Twitch); страница настроек список не рисует.
 */

CPX.defineSettings("polls", [
  {
    key: "polls.button",
    type: "bool",
    def: true,
    label: { ru: "Кнопка «Опросы и розыгрыши»", en: "“Polls & giveaways” button" },
    hint: { ru: "Для стримера и модераторов: опрос и прогноз (у компаньонов и партнёров) и розыгрыш", en: "For the streamer and moderators: polls and predictions (affiliates and partners) and giveaways" },
  },
  {
    key: "polls.history",
    type: "list",
    pageWritable: true, // пишет страница Twitch (белый список фона)
    def: [],
    label: { ru: "История опросов и прогнозов", en: "Poll and prediction history" },
  },
]);

CPX.i18n.add({
  ru: { "pages.group.polls": "Опросы и прогнозы" },
  en: { "pages.group.polls": "Polls and predictions" },
});

// ── src/common/49_settings_sidenav.js ──
/* Настройки области «sidenav»: предпросмотр трансляции при наведении на канал в левой панели
 * Twitch (src/main/74_sidenav_preview.js, исследование — research/06 §E).
 *
 *   sidenav.preview     — "off" | "frame" | "video": кадр трансляции в родной подсказке Twitch;
 *                         "video" — сразу за кадром живое видео без звука в низком качестве
 *                         (тёплый плеер заранее — 74_sidenav_preview.js «Видео»), и у трансляций с
 *                         предупреждением («Начать просмотр») тоже — владелец 04.10 убрал отдельную
 *                         настройку; настоящие ворота (возраст, регион) не обходим никогда.
 *   sidenav.previewSize — ширина картинки в пикселях (строкой: страница настроек отдаёт значение
 *                         select строкой, а settingsCoerce сверяет строго).
 * Заголовок раздела (ключ pages.group.sidenav) — внизу этого файла.
 */

CPX.defineSettings("sidenav", [
  {
    key: "sidenav.preview",
    type: "select",
    def: "frame", // владелец 05.10: по умолчанию снова «только кадр» (04.10 было «кадр, а сразу за ним — видео»)
    options: [
      { v: "off", ru: "Выключен", en: "Off", off: true },
      { v: "frame", ru: "Только кадр", en: "Thumbnail only" },
      { v: "video", ru: "Кадр, а сразу за ним — видео", en: "Thumbnail, then live video right away" },
    ],
    label: { ru: "Предпросмотр канала", en: "Channel preview" },
    hint: { ru: "При наведении на канал в левой панели", en: "When hovering a channel in the side bar" },
  },
  {
    key: "sidenav.previewSize",
    type: "select",
    def: "320",
    options: [
      { v: "240", ru: "Маленький", en: "Small" },
      { v: "320", ru: "Средний", en: "Medium" },
      { v: "440", ru: "Большой", en: "Large" },
    ],
    label: { ru: "Размер предпросмотра", en: "Preview size" },
  },
]);

CPX.i18n.add({
  ru: { "pages.group.sidenav": "Левая панель" },
  en: { "pages.group.sidenav": "Side bar" },
});

// ── src/common/50_boot.js ──
/* Запуск частей и диагностика — общий механизм для всех миров.
 *
 * Модуль регистрирует свой запуск:  CPX.boot.add("emotes", () => {...}, 50);
 * мир в конце (99_start.js) вызывает CPX.boot.run(). Порядок — по числу (меньше —
 * раньше), ошибка одной части не мешает другим.
 *
 * Диагностика для стенда проверки и popup: CPX.diag.add("emotes", () => ({...}));
 * CPX.diag() собирает всё в один объект.
 */

CPX.boot = (() => {
  const items = [];
  const started = [];
  const failed = [];
  return {
    add(name, fn, order = 50) {
      items.push({ name, fn, order });
    },
    async run() {
      items.sort((a, b) => a.order - b.order);
      for (const it of items) {
        try {
          await it.fn();
          started.push(it.name);
        } catch (e) {
          failed.push(it.name);
          CPX.report("boot:" + it.name, e);
        }
      }
    },
    get started() {
      return started.slice();
    },
    get failed() {
      return failed.slice();
    },
  };
})();

CPX.diag = (() => {
  const providers = new Map();
  function diag() {
    const out = {
      version: CPX.version,
      world: CPX.world,
      dev: CPX.dev,
      started: CPX.boot.started,
      failed: CPX.boot.failed,
      errors: CPX.log.ring().filter((e) => e.level === "error").length,
    };
    for (const [name, fn] of providers) {
      try {
        out[name] = fn();
      } catch (e) {
        out[name] = { error: String(e && e.message) };
      }
    }
    return out;
  }
  diag.add = (name, fn) => providers.set(name, fn);
  return diag;
})();

// ── src/main/05_bridge.js ──
/* Мост мира страницы (MAIN) к фону расширения.
 *
 * Мир страницы не видит chrome.runtime, поэтому ходит через ISOLATED-мир:
 *   MAIN ⇄ (приватный MessageChannel) ⇄ ISOLATED ⇄ (runtime-порт) ⇄ фон.
 *
 * Рукопожатие: при document_start (до любых скриптов Twitch) MAIN шлёт «hello» с меткой своей сборки
 * (BUILD, tools/build.py) — без канала. Свой ISOLATED (та же метка) принимает ТОЛЬКО первое такое рукопожатие,
 * создаёт MessageChannel и отдаёт второй конец сообщением «port» с той же меткой — MAIN берёт канал только со
 * своей меткой. (До 12.10 канал создавал MAIN и рассылал его в «hello»: две копии Chatterino+ на странице — из
 * магазина и из «Раннего доступа» — соединялись крест-накрест, замер: в 2 загрузках из 4 страница новой копии
 * говорила с фоном старой. Канал в «hello» старый ISOLATED берёт у кого угодно — поэтому теперь его там нет.)
 * Если ISOLATED запустился позже и рукопожатие потерялось, он сам шлёт «iso-ready», и MAIN повторяет «hello».
 * «iso-ready», пришедший, когда канал УЖЕ есть: Firefox после обновления расширения вставляет в
 * открытую вкладку новые контент-скрипты, а песочницу старого ISOLATED уничтожает молча (без
 * onDisconnect — «bridge:dead» от него не придёт). Тогда проверяем свой канал (iso.ping): молчит —
 * мост мёртв (вызовы отказывают сразу, событие "bridge:dead"), а не висит по 20 с на каждом вызове.
 * Ответил — это гонка первого рукопожатия или чужое сообщение: ничего не делаем.
 *
 * API:
 *   CPX.bg.call(метод, параметры, {timeout}) → Promise(результат)
 *   CPX.bg.on(событие, fn) → отписка
 *   CPX.bg.ready — Promise, канал с ISOLATED установлен
 *   CPX.bg.up — фон сейчас на связи (событие "bridge:bg" {up})
 *   событие "bridge:twin" {ver} — на странице «hello» ЧУЖОЙ копии Chatterino+ (вторая копия; 99_start); у старых
 *   версий (до 12.10) ver нет
 * Секретов (пропуск, ключ продления) здесь никогда нет — они живут только в фоне.
 */

CPX.bg = (() => {
  const log = CPX.log("bridge");
  const ev = new CPX.Emitter();
  const pending = new Map();
  const early = [];
  let port = null;
  let seq = 0;
  let bgUp = false;
  let dead = false;
  let readyResolve;
  const ready = new Promise((r) => (readyResolve = r));

  /** Связь с фоном потеряна до обновления страницы: ждущие вызовы — отказ сразу. reason — для текста
   *  тоста: "gone" — расширение выгружено без замены (стили сняты, 93_page_css). */
  function markDead(reason) {
    if (dead) return;
    dead = true;
    bgUp = false;
    for (const p of pending.values()) {
      clearTimeout(p.timer);
      p.reject(Object.assign(new Error("расширение перезапущено — обновите страницу"), { code: "dead" }));
    }
    pending.clear();
    ev.emit("bridge:dead", { reason: reason || "" });
  }

  function onPortMessage(e) {
    const m = e.data;
    if (!m || typeof m !== "object") return;
    if (m.t === "res") {
      const p = pending.get(m.id);
      if (!p) return;
      pending.delete(m.id);
      clearTimeout(p.timer);
      if (m.ok) p.resolve(m.r);
      else p.reject(Object.assign(new Error(m.e || "ошибка фона"), { code: m.code }));
    } else if (m.t === "evt") {
      if (m.e === "bridge:dead") return markDead();
      if (m.e === "bridge:bg") bgUp = !!(m.d && m.d.up);
      ev.emit(m.e, m.d);
    }
  }

  function attach(p) {
    port = p;
    for (const m of early.splice(0)) p.postMessage(m);
    readyResolve();
    log.debug("мост с ISOLATED установлен");
  }

  const BUILD = "b5e4bf1be77c"; // метка этой сборки — та же у нашего ISOLATED (tools/build.py)
  function handshake() {
    if (port) return;
    window.postMessage({ cpxBridge: "hello", v: 2, b: BUILD, ver: CPX.version }, "*");
  }

  let probing = false;
  /** Жив ли свой ISOLATED: молчит 5 с — мост мёртв. */
  function probe(reason) {
    if (!port || dead || probing) return;
    probing = true;
    call("iso.ping", null, { timeout: 5000 })
      .catch((err) => {
        if (err && err.code === "timeout") {
          log.warn("ISOLATED не отвечает (расширение обновлено или выключено) — связь с фоном до обновления страницы потеряна");
          markDead(reason);
        }
      })
      .finally(() => (probing = false));
  }
  window.addEventListener("message", (e) => {
    const d = e.data;
    if (e.source !== window || !d || typeof d !== "object") return;
    if (d.cpxBridge === "port") {
      // Канал от нашего ISOLATED — только со своей меткой и только первый.
      if (d.b !== BUILD || port || !e.ports || !e.ports[0]) return;
      const p = e.ports[0];
      p.onmessage = onPortMessage;
      if (d.bgUp) bgUp = true;
      return attach(p);
    }
    // Чужое «hello» — вторая копия Chatterino+ на этой странице (99_start говорит человеку).
    if (d.cpxBridge === "hello") return d.b !== BUILD && ev.emit("bridge:twin", { ver: typeof d.ver === "string" ? d.ver.slice(0, 20) : "" });
    if (d.cpxBridge !== "iso-ready") return;
    if (!port) return d.b === BUILD && handshake();
    // Канал уже есть, а «iso-ready» пришёл: свой ISOLATED заменён (Firefox после обновления) или это чужая копия —
    // проверяем свой канал.
    probe("");
  });
  handshake();

  function send(msg) {
    if (port) port.postMessage(msg);
    else early.push(msg);
  }

  function call(method, params, opts) {
    if (dead) return Promise.reject(Object.assign(new Error("расширение перезапущено — обновите страницу"), { code: "dead" }));
    const id = ++seq;
    const timeout = (opts && opts.timeout) || 20000;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(Object.assign(new Error("нет ответа фона: " + method), { code: "timeout" }));
      }, timeout);
      pending.set(id, { resolve, reject, timer });
      send({ t: "req", id, m: method, p: params == null ? null : params });
    });
  }

  CPX.diag.add("bridge", () => ({ attached: !!port, bgUp, dead, pending: pending.size }));

  return {
    call,
    on: (name, fn) => ev.on(name, fn),
    probe,
    ready,
    get up() {
      return bgUp;
    },
    get dead() {
      return dead;
    },
  };
})();

// ── src/main/08_settings.js ──
/* Мир страницы: копия настроек из фона.
 *
 *   CPX.settings.get("chat.timestamps")  — значение (до загрузки — умолчание)
 *   CPX.settings.on("chat.timestamps", fn) — fn(новое значение) при изменении; → отписка
 *   CPX.settings.onAny(fn)                — fn({ключ: значение}) при любых изменениях
 *   CPX.settings.set("chat.timestamps", true) — попросить фон изменить
 *   CPX.settings.ready                    — Promise: копия получена
 */

CPX.settings = (() => {
  const ev = new CPX.Emitter();
  let values = CPX.settingsDefaults();
  let readyResolve;
  const ready = new Promise((r) => (readyResolve = r));

  function applyChanges(changes) {
    for (const k in changes) values[k] = changes[k];
    if ("general.lang" in changes) CPX.i18n.setLang(changes["general.lang"]);
    for (const k in changes) ev.emit("key:" + k, changes[k]);
    ev.emit("any", changes);
  }

  async function fetchAll() {
    try {
      const all = await CPX.bg.call("settings.getAll");
      const changes = {};
      for (const k in all) if (JSON.stringify(all[k]) !== JSON.stringify(values[k])) changes[k] = all[k];
      values = Object.assign(values, all);
      CPX.i18n.setLang(values["general.lang"]);
      if (Object.keys(changes).length) applyChanges(changes);
    } catch (e) {
      CPX.log("settings").warn("не удалось получить настройки:", e.message);
    }
    readyResolve();
  }

  CPX.bg.on("settings.changed", (d) => d && d.changes && applyChanges(d.changes));
  // Фон проснулся заново — перечитать (пока спал, настройки могли поменять в окне настроек).
  CPX.bg.on("bridge:bg", (d) => d && d.up && fetchAll());
  CPX.bg.ready.then(fetchAll);

  return {
    ready,
    get: (k) => values[k],
    on: (k, fn) => ev.on("key:" + k, fn),
    onAny: (fn) => ev.on("any", fn),
    set(k, v) {
      return CPX.bg.call("settings.set", { changes: { [k]: v } });
    },
  };
})();

// ── src/main/20_react.js ──
/* Доступ к React-дереву страницы Twitch.
 *
 * Twitch — React-приложение. У любого DOM-элемента страницы есть свойство
 * __reactFiber$<случайное> — узел дерева (fiber). По нему можно подняться (return)
 * или спуститься (child/sibling) до компонента с нужными методами/пропсами.
 * Имена компонентов минифицированы, поэтому компоненты узнаём ПО ПРИЗНАКАМ
 * (набору методов/пропсов) — таблица признаков: research/01 §2.4.
 *
 * API:
 *   CPX.react.fiber(el)                  — fiber элемента (или null)
 *   CPX.react.props(el)                  — пропсы DOM-элемента React (или null)
 *   CPX.react.root()                     — корневой fiber приложения (#root)
 *   CPX.react.up(start, pred, depth)     — вверх по return; start — элемент или fiber
 *   CPX.react.down(start, pred, depth, maxNodes) — вниз по дереву (обход в ширину)
 *   CPX.react.instUp(start, pred, depth)   — как up, но pred получает stateNode (экземпляр класса),
 *                                            возвращает ЭКЗЕМПЛЯР
 *   CPX.react.instDown(start, pred, depth, maxNodes) — то же вниз
 *   CPX.react.hook(obj, method, wrap)     — подменить метод ЭКЗЕМПЛЯРА: wrap(original, ...args);
 *                                            повторная подмена тем же ключом не делается; → снять
 * Всё тихо: при любой странности — null, без исключений.
 */

CPX.react = (() => {
  const fiberKeyCache = { key: null };

  function fiber(el) {
    if (!el || typeof el !== "object") return null;
    if (fiberKeyCache.key && el[fiberKeyCache.key]) return el[fiberKeyCache.key];
    for (const k in el) {
      if (k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$")) {
        fiberKeyCache.key = k;
        return el[k];
      }
    }
    return null;
  }

  function props(el) {
    if (!el) return null;
    for (const k in el) if (k.startsWith("__reactProps$")) return el[k];
    return null;
  }

  function root() {
    const el = document.getElementById("root");
    if (!el) return null;
    for (const k in el) {
      if (k.startsWith("__reactContainer$")) return el[k];
    }
    const legacy = el._reactRootContainer;
    if (legacy) return (legacy._internalRoot && legacy._internalRoot.current) || legacy.current || null;
    return null;
  }

  function toFiber(start) {
    if (!start) return null;
    if (start.nodeType === 1) return fiber(start);
    return start;
  }

  function safePred(pred, x) {
    try {
      return !!pred(x);
    } catch (_) {
      return false;
    }
  }

  function up(start, pred, depth = 30) {
    let f = toFiber(start);
    for (let i = 0; f && i <= depth; i++, f = f.return) if (safePred(pred, f)) return f;
    return null;
  }

  function down(start, pred, depth = 80, maxNodes = 8000) {
    const s = toFiber(start);
    if (!s) return null;
    let level = [s];
    let seen = 0;
    for (let d = 0; d <= depth && level.length; d++) {
      const next = [];
      for (const f of level) {
        if (safePred(pred, f)) return f;
        if (++seen > maxNodes) return null;
        for (let c = f.child; c; c = c.sibling) next.push(c);
      }
      level = next;
    }
    return null;
  }

  const inst = (pred) => (f) => f.stateNode && typeof f.stateNode === "object" && !(f.stateNode.nodeType > 0) && pred(f.stateNode);

  function instUp(start, pred, depth) {
    const f = up(start, inst(pred), depth);
    return f ? f.stateNode : null;
  }

  function instDown(start, pred, depth, maxNodes) {
    const f = down(start, inst(pred), depth, maxNodes);
    return f ? f.stateNode : null;
  }

  const HOOKS = Symbol("cpx.hooks");

  /** Подменить метод экземпляра. wrap(original, ...args) вызывается вместо метода
   * (this — экземпляр). Возвращает функцию снятия подмены. */
  function hook(obj, method, wrap) {
    if (!obj || typeof obj[method] !== "function") return () => {};
    const hooks = obj[HOOKS] || (obj[HOOKS] = Object.create(null));
    if (hooks[method]) return hooks[method].unhook;
    const original = obj[method];
    const patched = function (...args) {
      return wrap.call(this, original, ...args);
    };
    obj[method] = patched;
    const unhook = () => {
      if (obj[method] === patched) obj[method] = original;
      delete hooks[method];
    };
    hooks[method] = { unhook };
    return unhook;
  }

  return { fiber, props, root, up, down, instUp, instDown, hook };
})();

// ── src/main/21_dom.js ──
/* Наблюдение за DOM страницы (общее для миров Twitch и Kick; вынесено из 22_page.js 15.11).
 *
 * CPX.dom.on(селектор, fn(node)) — fn для каждого элемента, подходящего под селектор,
 *   уже существующего и появившегося позже (один MutationObserver на документ). → отписка
 * CPX.dom.gone(node, fn) — fn, когда node пропадёт из документа.
 * Свои узлы (.cpx-own и всё внутри) не проверяются.
 */

CPX.dom = (() => {
  const subs = new Set(); // { sel, fn }
  let mo = null;

  function isOurs(n) {
    return n.classList && (n.classList.contains("cpx-own") || (n.closest && n.closest(".cpx-own")));
  }

  function check(node) {
    if (node.nodeType !== 1 || isOurs(node)) return;
    for (const s of subs) {
      try {
        if (node.matches(s.sel)) s.fn(node);
        if (node.firstElementChild) for (const n of node.querySelectorAll(s.sel)) s.fn(n);
      } catch (e) {
        CPX.report("dom:" + s.sel, e);
      }
    }
  }

  const goneWatch = new Map(); // node → [fn]

  function start() {
    if (mo) return;
    mo = new MutationObserver((recs) => {
      for (const r of recs) {
        for (const n of r.addedNodes) check(n);
        if (goneWatch.size && r.removedNodes.length) {
          for (const [node, fns] of goneWatch) {
            if (!node.isConnected) {
              goneWatch.delete(node);
              for (const fn of fns) CPX.safely("dom:gone", fn);
            }
          }
        }
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  return {
    on(sel, fn) {
      const s = { sel, fn: CPX.guard("dom:" + sel, fn) };
      subs.add(s);
      start();
      if (document.documentElement) for (const n of document.querySelectorAll(sel)) s.fn(n);
      return () => subs.delete(s);
    },
    gone(node, fn) {
      const list = goneWatch.get(node) || [];
      list.push(fn);
      goneWatch.set(node, list);
      start();
    },
  };
})();

// ── src/site/30_site_chat.js ──
/* Миры сайтов (Kick 15.11; YouTube был 18.11, убран 19.11): какие чаты сайта есть на странице, чей у каждого канал и какой виден;
 * CPX.chat — замена чата Twitch для общих модулей отрисовки (50_emotes, 51_cosmetics, 32_channels, 58_emote_tooltip).
 * Общее для сайтов; что именно считать чатом и как узнать его канал — переходник сайта CPX.siteBox (src/kick/39_kick_site.js):
 *   { name: "kick", prefix: "kick:", BOX: селектор чата, ROOT: колонка чата (для окон и тостов),
 *     frames: ставить ли в рамках (чат внутри рамки страницы — так было у YouTube; у Kick — нет),
 *     key(el) → строка, которая меняется вместе с каналом чата (у Kick — адрес канала) или "",
 *     resolve(key, el) → Promise<{id, name, slug?, room?} | null> — канал (номер на площадке) }.
 *
 * Несколько чатов: при переходе между каналами без перезагрузки Kick ОСТАВЛЯЕТ прежний чат в документе (спрятан) и ставит
 * новый — поэтому ведём КАЖДЫЙ чат со своим каналом, а «текущий» — видимый (размер не нулевой: ResizeObserver). Спрятанный
 * чат строки (40_site_lines) не обрабатывают, пока его снова не покажут. Канал не узнали (данные ещё не готовы, запрос в
 * первые секунды загрузки бывает «Failed to fetch») — ещё раз с нарастающей паузой: 1,5 с … 30 с, до 8 раз.
 *
 * CPX.siteChat.boxes() → [box], box = {el, key, channelId ("<префикс><номер>" | ""), slug, name, room, visible};
 * CPX.siteChat.on("box", fn(box)) — чат готов (канал узнали) или стал видимым; on("hide", fn(box)) — спрятан/убран;
 * on("off") — сайт выключили в настройках (фон: "site.off", bg/15_sites.js): строки снимают своё, чаты больше не ведём;
 * снова заработает после обновления страницы, если сайт включат. .resolve(el) — перечитать канал чата.
 * CPX.chat.state — {channelId, login, displayName, me: null, roles: {}, site} видимого чата (или null); CPX.chat.root() —
 * его колонка; CPX.chat.on("attach" | "detach", fn(state)). Своих сообщений в CPX.chat.onMessage нет (вход на сайт не читаем).
 */

CPX.chat = (() => {
  const ev = new CPX.Emitter();
  let state = null;
  return {
    get state() {
      return state;
    },
    T: { MESSAGE: 0 },
    on: (name, fn) => ev.on(name, fn),
    onMessage: () => () => {},
    /** Видимый чат сайта (колонка) — куда ставить тосты и окна (95_ui chatRect). */
    root() {
      const A = CPX.siteBox;
      if (!A) return null;
      for (const b of document.querySelectorAll(A.BOX)) {
        const r = b.getBoundingClientRect();
        if (r.width && r.height) return (A.ROOT && b.closest(A.ROOT)) || b;
      }
      return null;
    },
    /** Только для CPX.siteChat: сменился видимый чат. */
    _set(next) {
      if ((state && state.channelId) === (next && next.channelId)) return;
      const prev = state;
      state = next;
      if (prev) ev.emit("detach", prev);
      if (next) ev.emit("attach", next);
    },
  };
})();

CPX.siteChat = (() => {
  const log = CPX.log("site-chat");
  const ev = new CPX.Emitter();
  const boxes = new Map(); // el → box
  let A = null; // переходник сайта (CPX.siteBox) — к запуску
  let ro = null;
  let off = false;

  function current() {
    for (const b of boxes.values()) if (b.visible && b.channelId) return b;
    return null;
  }

  function pick() {
    const b = current();
    CPX.chat._set(b ? { channelId: b.channelId, login: b.slug || b.key, displayName: b.name, me: null, roles: {}, site: A.name } : null);
  }

  function retry(b) {
    clearTimeout(b.retryT);
    if (b.tries >= 8 || !b.el.isConnected) return;
    b.retryT = setTimeout(() => CPX.safely("site:resolve", () => resolve(b)), Math.min(30000, 1500 * Math.pow(2, b.tries++)));
  }

  async function resolve(b) {
    const key = CPX.safely("site:key", () => A.key(b.el)) || "";
    if (key && key === b.key && (b.channelId || b.pending)) return;
    clearTimeout(b.retryT);
    if (!key) return retry(b);
    b.key = key;
    b.channelId = "";
    b.room = "";
    b.pending = true;
    let o = null;
    try {
      o = await A.resolve(key, b.el);
    } catch (e) {
      log.warn("канал не узнали:", key, e && e.message);
    }
    if (b.key !== key || !b.el.isConnected) return;
    b.pending = false;
    if (!o || !o.id) return retry(b);
    b.tries = 0;
    b.channelId = A.prefix + o.id;
    b.name = String(o.name || "");
    b.slug = String(o.slug || "");
    b.room = String(o.room || "");
    log.info("чат:", key, b.channelId);
    pick();
    if (b.visible) ev.emit("box", b);
  }

  function onSize(entries) {
    for (const en of entries) {
      const b = boxes.get(en.target);
      if (!b) continue;
      const vis = en.contentRect.width > 0 && en.contentRect.height > 0;
      if (vis === b.visible) continue;
      b.visible = vis;
      if (vis) {
        // Вернулись к спрятанному чату — канал мог смениться (тот же элемент под другим каналом).
        CPX.safely("site:resolve", () => resolve(b));
        if (b.channelId) ev.emit("box", b);
      } else ev.emit("hide", b);
      pick();
    }
  }

  function add(el) {
    if (off || boxes.has(el)) return;
    const b = { el, key: "", slug: "", channelId: "", name: "", room: "", visible: false, pending: false, tries: 0, retryT: 0 };
    boxes.set(el, b);
    if (!ro) ro = new ResizeObserver(CPX.guard("site:size", onSize));
    ro.observe(el);
    CPX.dom.gone(el, () => {
      clearTimeout(b.retryT);
      boxes.delete(el);
      if (ro) ro.unobserve(el);
      ev.emit("hide", b);
      pick();
    });
    resolve(b);
  }

  CPX.boot.add(
    "site:chat",
    () => {
      A = CPX.siteBox;
      if (!A || (window.top !== window && !A.frames)) return;
      CPX.dom.on(A.BOX, add);
      CPX.bg.on("site.off", () => {
        if (off) return;
        off = true;
        log.info("сайт выключен в настройках — снимаем своё");
        for (const b of boxes.values()) {
          clearTimeout(b.retryT);
          if (ro) ro.unobserve(b.el);
        }
        ev.emit("off");
        boxes.clear();
        pick();
      });
    },
    30
  );

  CPX.diag.add("siteChat", () => ({
    site: A && A.name,
    boxes: [...boxes.values()].map((b) => ({ key: b.key, channelId: b.channelId, visible: b.visible })),
    current: CPX.chat.state && CPX.chat.state.channelId,
  }));

  return {
    boxes: () => [...boxes.values()],
    on: (name, fn) => ev.on(name, fn),
    resolve: (el) => {
      const b = boxes.get(el);
      if (b) resolve(b);
    },
  };
})();

// ── src/main/32_channels.js ──
/* Сообщаем фону, какой канал открыт в этой вкладке: по нему фон грузит смайлики,
 * подписывается на живые правки 7TV/BTTV, шлёт sbwatch и события канала.
 * Фон мог уснуть и проснуться — тогда повторяем (событие моста "bridge:bg" {up}). */

(() => {
  function push() {
    const s = CPX.chat.state;
    const channels = s ? [{ id: s.channelId, login: s.login }] : [];
    CPX.bg.call("tab.setChannels", { channels }).catch(() => {});
  }
  CPX.boot.add(
    "channels",
    () => {
      CPX.chat.on("attach", push);
      CPX.chat.on("detach", push);
      CPX.bg.on("bridge:bg", (d) => d && d.up && push());
      if (CPX.chat.state) push();
    },
    11
  );
})();

// ── src/main/35_pipeline.js ──
/* Конвейер строки чата — точки стыковки между модулями.
 *
 * Наш список чата (src/main/4x_*) строит каждую строку так:
 *
 *   1. Контекст строки ctx (создаёт список):
 *        ctx.msg         — исходный объект сообщения Twitch (только чтение!)
 *        ctx.type        — CPX.chat.T.*
 *        ctx.id          — id сообщения
 *        ctx.channelId   — канал, к которому относится сообщение (в общем чате — канал-источник)
 *        ctx.channelLogin
 *        ctx.user        — { id, login, displayName, color } автора (или null у системных)
 *        ctx.badges      — бейджи Twitch { набор: версия }
 *        ctx.action      — /me
 *        ctx.flags       — { mention, firstMsg, highlighted, reply, deleted, historical, self }
 *        ctx.el          — узлы строки: { line, mod, badges, name, colon, body } (есть у обычных сообщений)
 *        ctx.data        — место, куда модули кладут своё (ctx.data.sharedBans, ctx.data.paint …)
 *
 *   2. Разбор тела в токены. Текстовые части Twitch режутся по пробелам на слова; каждое
 *      слово проходит РЕЗОЛВЕРЫ по порядку, первый вернувший токен — побеждает:
 *        CPX.tokens.addResolver(order, fn(word, ctx) → token | null)
 *      Токен — объект { kind, ... }. Виды:
 *        { kind: "text", text }                       — по умолчанию
 *        { kind: "emote", provider: "7tv"|"bttv"|"ffz"|"twitch", id, name, urls: {1,2,4},
 *          w, h, zeroWidth, animated, ownerName?, setName?, modifierFlags? }
 *        { kind: "mention", login, text } / { kind: "link", url, text } / { kind: "cheer", ... } —
 *          строит сам список из частей Twitch
 *   3. ПРЕОБРАЗОВАНИЯ всего списка токенов (zero-width поверх предыдущего, коды эффектов,
 *      склейка) по порядку:
 *        CPX.tokens.addTransform(order, fn(tokens, ctx) → tokens)
 *   4. Отрисовка токенов: для вида kind берётся РИСОВАЛЬЩИК, иначе — встроенный список:
 *        CPX.tokens.addRenderer(kind, fn(token, ctx) → Node)
 *
 * Общие шаги для любого списка (наш список Twitch и строки Kick, 15.11):
 *        CPX.tokens.words(текст, ctx, out) — режет текст на слова и пробелы, слова — через резолверы (+ ссылка
 *          «папка.дети»); токены дописывает в out;
 *        CPX.tokens.render(токены, ctx, встроенные) → DocumentFragment — шаг 4 (встроенные — {kind: fn} списка).
 *   5. УКРАШЕНИЯ готовой строки (бейджи, пейнт ника, мод-кнопки, значок общих банов…):
 *        CPX.line.addDecorator({ name, order, fn(ctx) })
 *      Украшение пишет только в свои места (ctx.el.badges, ctx.el.name, ctx.el.mod …) и
 *      должно быть ПОВТОРЯЕМЫМ: при refresh его вызовут ещё раз на той же строке —
 *      сначала убрать своё прежнее (например, по классу cpx-<name>), потом добавить заново.
 *
 * Данные пришли позже (набор смайликов, косметика человека, счётчик банов) —
 *        CPX.line.refresh({ userId?, login?, channelId?, test?: fn(ctx) → bool, body?: true })
 *   перерисует украшения видимых строк, подходящих под фильтр (body:true — и тело целиком; test — своё условие).
 *
 * Порядки (order): резолверы — меньше раньше; 10 личные 7TV, 20 канал (FFZ>BTTV>7TV внутри
 * модуля смайликов), 30 глобальные, 90 прочее. Украшения: 10 мод-кнопки, 20 бейджи,
 * 30 ник/пейнт, 40 значок общих банов, 90 прочее.
 */

CPX.tokens = (() => {
  const WS = /(\s+)/;
  const IS_WS = /^\s+$/;
  const SITE_RE = /^([(«"'[]*)((?:https?:\/\/)?(?:www\.)?папка\.дети(?:[/?#]\S*?)?)([.,!?;:)»"'\]…]*)$/i;
  const resolvers = [];
  const transforms = [];
  const renderers = new Map();
  const sort = (a) => a.sort((x, y) => x.order - y.order);
  function resolveWord(word, ctx) {
    for (const r of resolvers) {
      const t = r.fn(word, ctx);
      if (t) return t;
    }
    return null;
  }
  return {
    addResolver(order, fn) {
      resolvers.push({ order, fn: CPX.guard("resolver", fn) });
      sort(resolvers);
    },
    addTransform(order, fn) {
      transforms.push({ order, fn: CPX.guard("transform", fn) });
      sort(transforms);
    },
    addRenderer(kind, fn) {
      renderers.set(kind, CPX.guard("render:" + kind, fn));
    },
    /** Токен для слова (или null — обычный текст). */
    resolve: resolveWord,
    transform(tokens, ctx) {
      for (const t of transforms) {
        const out = t.fn(tokens, ctx);
        if (Array.isArray(out)) tokens = out;
      }
      return tokens;
    },
    renderer: (kind) => renderers.get(kind) || null,
    words,
    render,
  };

  // Сайт «папка.дети» (владелец 02.11): кириллический адрес Twitch ссылкой не делает — делаем сами, только этот сайт.
  // Знаки вокруг («(папка.дети),») в ссылку не входят.
  function words(text, ctx, out) {
    for (const b of String(text).split(WS)) {
      if (!b) continue;
      if (IS_WS.test(b)) {
        out.push({ kind: "text", text: b, space: true });
        continue;
      }
      const site = SITE_RE.exec(b);
      if (site) {
        if (site[1]) out.push({ kind: "text", text: site[1] });
        out.push({ kind: "link", url: /^https?:\/\//i.test(site[2]) ? site[2] : "https://" + site[2], text: site[2] });
        if (site[3]) out.push({ kind: "text", text: site[3] });
      } else out.push(resolveWord(b, ctx) || { kind: "text", text: b });
    }
    return out;
  }

  /** Токены → узлы: рисовальщик вида, иначе встроенный (builtin[kind]), иначе текст токена. Подряд идущий текст — одним
   *  текстовым узлом. */
  function render(toks, ctx, builtin) {
    const frag = document.createDocumentFragment();
    const textR = renderers.get("text") || null;
    let text = "";
    const flush = () => {
      if (text) frag.appendChild(document.createTextNode(text));
      text = "";
    };
    for (const tk of toks || []) {
      if (!tk || tk.hidden) continue;
      if (tk.kind === "text" && !textR && !tk.moderated && !tk.censored) {
        text += tk.text;
        continue;
      }
      const r = renderers.get(tk.kind);
      let node = r ? r(tk, ctx) : null;
      const b = builtin && builtin[tk.kind];
      if (!node && b) node = CPX.safely("tokens:render:" + tk.kind, () => b(tk, ctx));
      if (node && tk.giant) {
        // Гигантский смайлик у Twitch — отдельным блоком под текстом (emote-button-gigantified).
        const g = document.createElement("span");
        g.className = "cpx-giant";
        g.appendChild(node);
        node = g;
      }
      if (node) {
        flush();
        frag.appendChild(node);
      } else if (tk.text) {
        text += tk.text;
      }
    }
    flush();
    return frag;
  }
})();

CPX.line = (() => {
  const decorators = [];
  let refresher = null;
  return {
    addDecorator(d) {
      decorators.push({ name: d.name, order: d.order == null ? 50 : d.order, fn: CPX.guard("decorator:" + d.name, d.fn) });
      decorators.sort((a, b) => a.order - b.order);
    },
    /** Вызывает список чата для каждой строки (и повторно при refresh). */
    decorate(ctx) {
      for (const d of decorators) d.fn(ctx);
    },
    /** Попросить список перерисовать подходящие строки. */
    refresh(filter) {
      if (refresher) CPX.safely("line:refresh", () => refresher(filter || {}));
    },
    /** Только для списка чата: кто выполняет refresh. */
    setRefresher(fn) {
      refresher = fn;
    },
  };
})();

// ── src/kick/39_kick_site.js ──
/* Мир Kick: переходник сайта для общих модулей src/site (30_site_chat, 40_site_lines) — задание основного чата 15.11.
 * (До 18.11 это жило в src/kick/30_kick_chat.js и 40_kick_lines.js; общее ушло в src/site, когда появился YouTube.)
 *
 * ЧАТ. #chatroom-messages — и на странице канала, и в отдельном окне чата (kick.com/popout/<канал>/chat). Его канал —
 * свойство React channelSlug у ближайших предков списка (стенд 15.11: глубина 2). Номер владельца канала — его ждёт 7TV
 * (/v3/users/kick/<номер>; не номер канала и не номер чата: с ними «у канала нет 7TV») — из закрытого API Kick запросом из
 * мира страницы (тот же сайт, без прав и без нашей прослойки): /api/v2/channels/<slug> → user_id (или user.id).
 * slug из React — уже адрес канала (Kick меняет «_» на «-»).
 *
 * СТРОКА. [data-index] в списке #chatroom-messages (виртуальный список: видимые строки, ниже/выше — удаляются). Данные —
 * свойства React строки: div[style*=chatroom-font-size] → дети → props.message = {id, content, type, sender:{id, username,
 * identity:{color}}, chatroom_id} (стенд 15.11; у 7TV в исходнике 28.09 ещё props.sender — устарело). Ник —
 * button[data-prevent-expand], текст — span.font-normal, ребёнок которого (элемент React) несёт {content, id}; смайлики
 * Kick в тексте — метки [emote:<номер>:<имя>]. Ссылки — как у Kick: только полные адреса http(s)://.
 * Сообщение другого чата в этом списке — список отдали другому каналу: перечитать канал чата.
 * Kick меряет строку и прокручивает вниз сразу при вставке — до наших правок; низ ленты держит 40_site_lines (scroller).
 */

CPX.siteBox = (() => {
  const log = CPX.log("kick-chat");
  const owners = new Map(); // slug → Promise<{id, name, slug, room} | null>
  const SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,40}$/i;

  /** Номер владельца канала на Kick (удача — в кэш на вкладку; сбой не запоминаем: 30_site_chat повторит). */
  function owner(slug) {
    let p = owners.get(slug);
    if (p) return p;
    p = fetch("/api/v2/channels/" + encodeURIComponent(slug), { credentials: "omit", headers: { Accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const id = j && (j.user_id || (j.user && j.user.id));
        if (!/^\d{1,20}$/.test(String(id || ""))) return null;
        const room = j.chatroom && j.chatroom.id;
        return { id: String(id), name: String((j.user && j.user.username) || slug).slice(0, 40), slug, room: /^\d{1,20}$/.test(String(room || "")) ? String(room) : "" };
      })
      .catch((e) => {
        log.warn("канал Kick не узнали:", slug, e && e.message);
        return null;
      })
      .then((r) => {
        if (!r && owners.get(slug) === p) owners.delete(slug);
        return r;
      });
    owners.set(slug, p);
    return p;
  }

  return {
    name: "kick",
    prefix: "kick:",
    BOX: "#chatroom-messages",
    ROOT: "#channel-chatroom",
    frames: false,
    key(el) {
      const f = CPX.react.up(el, (x) => x.memoizedProps && typeof x.memoizedProps.channelSlug === "string", 12);
      const s = f && f.memoizedProps.channelSlug;
      return s && SLUG_RE.test(s) ? s.toLowerCase() : "";
    },
    resolve: (slug) => owner(slug),
  };
})();

CPX.siteRows = (() => {
  const ROW = "[data-index]";
  const INNER = "div[style*='chatroom-font-size']";
  const NAME = "button[data-prevent-expand='true']";
  const TEXT = "span.font-normal";
  const EMOTE_RE = /\[emote:(\d{1,20}):([^\]]{0,100})\]/g;
  const TYPES = new Set(["message", "reply"]);

  /** Сообщение строки из свойств React или null. */
  function message(row) {
    const inner = row.querySelector(INNER);
    const p = inner && CPX.react.props(inner);
    const kids = p && (Array.isArray(p.children) ? p.children : [p.children]);
    if (!kids) return null;
    for (const c of kids) {
      const m = c && c.props && c.props.message;
      if (m && typeof m === "object" && m.id && m.sender && typeof m.content === "string") return m;
    }
    return null;
  }

  function kickEmote(id, name) {
    const u = "https://files.kick.com/emotes/" + id + "/fullsize";
    return { kind: "emote", provider: "kick", id, name, urls: { 1: u, 2: u, 4: u }, w: 0, h: 0, zeroWidth: false, animated: false, scope: "kick" };
  }

  // Ссылки — как у Kick (стенд 15.11): только полные адреса http(s)://, <a class="underline" target=_blank>.
  const URL_RE = /^https?:\/\/[^\s<>"]{1,2000}$/i;
  CPX.tokens.addResolver(1, (word) => (URL_RE.test(word) ? { kind: "link", url: word, text: word } : null));

  return {
    ROW,
    list: (el) => el.firstElementChild,
    read(row) {
      const m = message(row);
      if (!m || !TYPES.has(m.type || "message") || !m.sender || !/^\d{1,20}$/.test(String(m.sender.id))) return null;
      const s = m.sender;
      return {
        id: String(m.id),
        key: m.content,
        content: m.content,
        room: m.chatroom_id ? String(m.chatroom_id) : "",
        user: { id: "kick:" + s.id, name: String(s.username || ""), color: (s.identity && s.identity.color) || "" },
      };
    },
    textOf(row, m) {
      for (const s of row.querySelectorAll(TEXT)) {
        if (s.classList.contains("cpx-own")) continue;
        const p = CPX.react.props(s);
        const c = p && p.children;
        const q = c && c.props ? c.props : p;
        if (q && q.id === m.id) return s;
      }
      return null;
    },
    nameOf(row, m) {
      const all = row.querySelectorAll(NAME);
      for (const b of all) if (b.title === m.user.name) return b;
      return all[0] || null;
    },
    tokens(m, ctx) {
      const content = m.content;
      const out = [];
      let last = 0;
      EMOTE_RE.lastIndex = 0;
      for (let x; (x = EMOTE_RE.exec(content)); ) {
        if (x.index > last) CPX.tokens.words(content.slice(last, x.index), ctx, out);
        out.push(kickEmote(x[1], x[2]));
        last = EMOTE_RE.lastIndex;
      }
      if (last < content.length) CPX.tokens.words(content.slice(last), ctx, out);
      return out;
    },
    native: (t) => t.provider === "kick",
    builtin: {
      link(tk) {
        let href = "";
        try {
          const u = new URL(tk.url);
          href = u.protocol === "https:" || u.protocol === "http:" ? u.href : "";
        } catch (_) {
          /* не адрес */
        }
        if (!href) return document.createTextNode(tk.text || tk.url || "");
        const a = document.createElement("a");
        a.className = "underline cpx-klink";
        a.href = href;
        a.target = "_blank";
        a.rel = "noopener noreferrer nofollow";
        a.textContent = tk.text || tk.url;
        return a;
      },
    },
    copyClass: (text) => text.className.replace(/\bfont-normal\b/, "").trim(),
    // Прокручивается сам #chatroom-messages (overflow-y: auto; стенд 19.11) — держать низ при наших правках (40_site_lines).
    scroller: (el) => el,
    check(m, box) {
      if (box.room && m.room && m.room !== box.room) CPX.siteChat.resolve(box.el);
    },
  };
})();

// ── src/site/40_site_lines.js ──
/* Миры сайтов (Kick 15.11; YouTube был 18.11, убран 19.11): строки чата сайта — смайлики 7TV в тексте, пейнт и значки 7TV и
 * PLUS у ника. Общий движок; что такое строка на конкретном сайте — переходник CPX.siteRows (src/kick/39_kick_site.js):
 *   { ROW: селектор строки, list(чат) → элемент, где лежат строки,
 *     read(строка) → {id, key (меняется вместе с текстом), user: {id "<префикс><номер>", name, color}, room?} | null,
 *     textOf(строка, m) → элемент текста сайта, nameOf(строка, m) → элемент ника,
 *     tokens(m, ctx) → токены текста (до преобразований: смайлики сайта, ссылки, слова → CPX.tokens.words),
 *     native(токен) → рисует ли его сам сайт (смайлик сайта), builtin — свои рисовальщики (ссылка, как у сайта),
 *     copyClass(текст) → классы нашей копии, dress?(копия, текст) — вид копии как у текста сайта,
 *     check?(m, чат) — сверка (Kick: сообщение другого чата → перечитать канал),
 *     scroller?(чат) → прокручиваемая лента (держать низ — ниже) }.
 *
 * КАК ВСТРАИВАЕМСЯ (как 7TV: чат сайта не подменяем):
 *   • Ник: контекст строки (ctx по контракту 35_pipeline: user.id = "<сайт>:<номер>", логина НЕТ — сверка PLUS только по
 *     номеру площадки) → общие украшения CPX.line.decorate: пейнт (60_paints — на сам элемент ника) и значки 7TV/PLUS
 *     (62_badges — в свой span.cpx-sbadges перед ником; значков нет — его нет).
 *   • Текст: токены сайта; есть смайлик 7TV (или эффект, или слой нулевой ширины) — рисуем СВОЮ копию текста
 *     (CPX.tokens.render) рядом с текстом сайта, а его прячем атрибутом data-cpx-hide. Узлы сайта не трогаем: их правка
 *     (как переводчик страниц) роняет React/Polymer при перерисовке. Нет 7TV — строка остаётся как у сайта, без наших узлов.
 * Свои узлы помечены .cpx-own (их правки наблюдатель пропускает).
 *
 * ЖИЗНЬ СТРОК. Наблюдатель на каждом ВИДИМОМ чате (спрятанный — отключён, 30_site_chat): новые строки — сразу, в том же
 * такте, что сайт их вставил (до отрисовки — без мигания сырого текста); перерисовка строки сайтом (удалили сообщение,
 * сменился текст) — сверка по номеру и тексту: другое — снимаем своё и строим заново. Помечаем по номеру сообщения, а не
 * по элементу. Данные пришли позже (набор канала, косметика, список PLUS) — CPX.line.refresh(фильтр) → видимые строки.
 *
 * НИЗ ЛЕНТЫ (владелец 19.11, Kick: «мерцает», «крайние сообщения заходят за интерфейс»). Сайт меряет строку и прокручивает
 * ленту вниз, когда вставляет её, — до наших значков и смайликов 7TV; строка с ними выше на 5–30 px, и её низ оставался
 * под панелью сайта до следующего сообщения, а при быстром чате лента дёргалась (стенд 19.11, xqc: 15 % кадров с обрезанной
 * последней строкой; у Kick без расширения — 0). Поэтому каждую нашу правку строк (keepEnd): стояла лента у самого низа —
 * после правки вернуть к низу, до отрисовки. Не у низа (прокрутили вверх, чат на паузе) — не трогаем. Бывает, сайт
 * прокручивает кадром позже, уже после наших правок, по старой мерке (быстрый чат; ревью 19.11) — на его прокрутку вниз,
 * не дошедшую до конца меньше чем на SNAP_PX, доводим до низа (onScroll в watch). Стенд 19.11: 0 обрезанных кадров.
 */

(() => {
  let A = null; // переходник сайта (CPX.siteRows) — к запуску
  const st = new WeakMap(); // строка → {id, key, ctx, text, copy, badges}
  const live = new Map(); // элемент чата → {box, list, mo}
  const S = { rows: 0, copies: 0, redo: 0, ms: 0, calls: 0 }; // ms — время наших обработчиков (diag: цена на людном чате)
  const SNAP_PX = 48; // «довести до низа»: остаток после прокрутки сайта вниз меньше этого — наш прирост строки (до ~30 px)

  // Своя копия нужна, если есть что-то, чего сайт не рисует: смайлик 7TV, эффект, слой нулевой ширины.
  const needCopy = (toks) => toks.some((t) => t && !t.hidden && t.kind === "emote" && (!A.native(t) || (t.zw && t.zw.length) || (t.fx && t.fx.length)));

  // ── строка ───────────────────────────────────────────────────────────────
  function makeCtx(m, row, box, name) {
    const u = m.user || {};
    return {
      id: String(m.id),
      type: CPX.chat.T.MESSAGE,
      msg: null,
      channelId: box.channelId,
      channelLogin: box.slug || box.key,
      user: {
        id: u.id,
        login: "", // 🔴не логин Twitch: PLUS у ников сайтов — только по номеру площадки (51_cosmetics, 60, 62)
        displayName: String(u.name || ""),
        color: CPX.safe.hex(u.color || "") || "",
      },
      badges: null,
      action: false,
      flags: {},
      el: { line: row, name, badges: null, colon: null, body: null },
      data: {},
    };
  }

  /** Снять всё своё со строки (сообщение сменилось или строку чистим). */
  function undo(s) {
    if (s.copy) s.copy.remove();
    if (s.text) s.text.removeAttribute("data-cpx-hide");
    if (s.badges) s.badges.remove();
    if (s.ctx.el.name) CPX.safely("site:strip", () => CPX.paints.dress(s.ctx.el.name, null));
    s.copy = s.badges = null;
  }

  function decorate(s) {
    const name = s.ctx.el.name;
    if (!name || !name.isConnected) return;
    // Контейнер на месте — значки в нём; нет — собираем вне документа и ставим, только если значки есть (так у
    // меньшинства; ревью 19.11: пустой контейнер на каждом сообщении вставлялся и тут же убирался — лишний пересчёт
    // раскладки при «держать низ»).
    const placed = !!s.badges && s.badges.isConnected && s.badges.nextElementSibling === name;
    if (!placed) {
      if (s.badges) s.badges.remove();
      s.badges = document.createElement("span");
      s.badges.className = "cpx-own cpx-sbadges";
    }
    s.ctx.el.badges = s.badges;
    CPX.line.decorate(s.ctx);
    if (!s.badges.firstChild) {
      if (placed) s.badges.remove();
      s.badges = null;
    } else if (!placed) name.before(s.badges);
  }

  function body(s) {
    const text = s.text;
    if (!text || !text.isConnected) return;
    const toks = CPX.tokens.transform(A.tokens(s.m, s.ctx), s.ctx);
    if (!needCopy(toks)) {
      if (s.copy) {
        s.copy.remove();
        s.copy = null;
        text.removeAttribute("data-cpx-hide");
      }
      return;
    }
    if (!s.copy || !s.copy.isConnected || s.copy.previousElementSibling !== text) {
      if (s.copy) s.copy.remove();
      s.copy = document.createElement("span");
      s.copy.className = "cpx-own cpx-sbody " + A.copyClass(text);
      if (A.dress) CPX.safely("site:dress", () => A.dress(s.copy, text));
      text.after(s.copy);
      S.copies++;
    }
    s.ctx.el.body = s.copy;
    s.copy.replaceChildren(CPX.tokens.render(toks, s.ctx, A.builtin || {}));
    text.setAttribute("data-cpx-hide", "");
  }

  function process(row, box) {
    const m = CPX.safely("site:read", () => A.read(row));
    let s = st.get(row);
    if (!m || !m.id || !m.user || !m.user.id) {
      if (s) {
        undo(s);
        st.delete(row);
      }
      return;
    }
    if (A.check) A.check(m, box);
    if (!box.channelId) return;
    const text = A.textOf(row, m);
    const name = A.nameOf(row, m);
    if (s && s.id === String(m.id) && s.key === m.key && s.text === text && s.ctx.el.name === name && s.ctx.channelId === box.channelId) {
      // То же сообщение, сайт перерисовал часть строки — вернуть своё, если его выбросило.
      if (name && s.badges && !s.badges.isConnected) decorate(s);
      if (s.copy && !s.copy.isConnected) body(s);
      return;
    }
    if (s) {
      undo(s);
      S.redo++;
    }
    s = { id: String(m.id), key: m.key, m, text, ctx: makeCtx(m, row, box, name), copy: null, badges: null };
    if (CPX.input && CPX.input.noteNick) CPX.input.noteNick(String(m.user.name || "")); // Tab по «@» (мир Kick: 75_kick_input)
    st.set(row, s);
    S.rows++;
    CPX.safely("site:deco", () => decorate(s));
    CPX.safely("site:body", () => body(s));
  }

  /** Наша правка строк fn() — не уводя ленту от низа (см. шапку «Низ ленты»). */
  function keepEnd(w, fn) {
    const sc = A.scroller && A.scroller(w.box.el);
    const end = !!sc && sc.scrollHeight - sc.clientHeight - sc.scrollTop <= 1;
    fn();
    if (end && sc.scrollHeight - sc.clientHeight - sc.scrollTop > 0.5) sc.scrollTop = sc.scrollHeight;
  }

  // ── чаты ─────────────────────────────────────────────────────────────────
  // Своё — только наши элементы (.cpx-own): текстовые узлы — сайта (YouTube меняет текст сообщения одними текстовыми узлами,
  // стенд 18.11; раньше они считались «своими», и такая перерисовка строки проходила мимо).
  const ours = (n) => n.nodeType === 1 && n.classList.contains("cpx-own");
  function onMut(w, recs) {
    const t0 = performance.now();
    const rows = new Set();
    for (const r of recs) {
      let added = false;
      for (const n of r.addedNodes) {
        if (n.nodeType === 1 && n.matches(A.ROW)) {
          rows.add(n);
          w.list = n.parentElement; // список могли пересоздать — держим тот, куда кладут строки
          added = true;
        }
      }
      if (added || r.target === w.list) continue;
      const t = r.target.nodeType === 1 ? r.target : r.target.parentElement;
      if (!t || t.closest(".cpx-own")) continue;
      const nodes = [...r.addedNodes, ...r.removedNodes];
      if (nodes.length && nodes.every(ours)) continue; // правка текста на месте (characterData) — узлов нет, но это сайт
      const row = t.closest(A.ROW);
      if (row && row.parentElement && row.parentElement === w.list) rows.add(row);
    }
    if (rows.size) keepEnd(w, () => rows.forEach((row) => process(row, w.box)));
    S.ms += performance.now() - t0;
    S.calls++;
  }

  function rowsOf(w) {
    return w.list ? w.list.querySelectorAll(":scope > " + A.ROW) : [];
  }

  function listOf(box) {
    const first = box.el.querySelector(A.ROW);
    return first ? first.parentElement : A.list(box.el);
  }

  function watch(box) {
    if (!box.visible || !box.channelId) return;
    let w = live.get(box.el);
    const list = listOf(box);
    if (w && w.list === list) {
      keepEnd(w, () => rowsOf(w).forEach((row) => process(row, box)));
      return;
    }
    if (w) drop(w);
    w = { box, list, mo: null, sc: null, onScroll: null };
    w.mo = new MutationObserver(CPX.guard("site:lines", (recs) => onMut(w, recs)));
    // Весь чат с поддеревом: строки (дети list), перерисовка внутри строк и правка текста на месте (YouTube меняет текст
    // сообщения в том же текстовом узле — стенд 18.11); атрибуты — не нужны.
    w.mo.observe(box.el, { childList: true, subtree: true, characterData: true });
    // Сайт прокрутил вниз, но не до конца — довести (см. шапку «Низ ленты»: прокрутка сайта ПОСЛЕ наших правок, по его
    // старой мерке строки). Только вниз и только остаток меньше SNAP_PX — прокрутку человека вверх не трогаем.
    const sc = A.scroller && A.scroller(box.el);
    if (sc) {
      let prev = sc.scrollTop;
      w.sc = sc;
      w.onScroll = () => {
        const t = sc.scrollTop;
        const gap = sc.scrollHeight - sc.clientHeight - t;
        if (t > prev + 0.5 && gap > 0.5 && gap < SNAP_PX) sc.scrollTop = sc.scrollHeight;
        prev = sc.scrollTop;
      };
      sc.addEventListener("scroll", w.onScroll, { passive: true });
    }
    live.set(box.el, w);
    keepEnd(w, () => rowsOf(w).forEach((row) => process(row, box)));
  }

  function drop(w) {
    w.mo.disconnect();
    if (w.sc) w.sc.removeEventListener("scroll", w.onScroll);
  }

  function unwatch(box) {
    const w = live.get(box.el);
    if (!w) return;
    drop(w);
    live.delete(box.el);
  }

  // Строки ещё не было, когда чат появился (пустой список): найти список при первой строке.
  function relist(w) {
    const first = w.box.el.querySelector(A.ROW);
    if (first && first.parentElement !== w.list) {
      w.list = first.parentElement;
      keepEnd(w, () => rowsOf(w).forEach((row) => process(row, w.box)));
    }
  }

  // Перерисовка по фильтру (CPX.line.refresh): все за такт — одним проходом (ревью 19.11: косметика пачкой звала её на
  // каждого человека, и «держать низ» пересчитывал раскладку столько же раз за кадр). Строк по фильтрам нет — ленту не
  // трогаем вовсе.
  let pend = [];
  function match(f, c) {
    if (f.channelId && c.channelId !== String(f.channelId)) return false;
    if (f.userId && c.user.id !== String(f.userId)) return false;
    if (f.login && c.user.login !== String(f.login).toLowerCase()) return false;
    return !f.test || !!CPX.safely("site:refresh:test", () => f.test(c));
  }
  function flush() {
    const list = pend;
    pend = [];
    if (!A) return;
    for (const w of live.values()) {
      relist(w);
      const todo = [];
      for (const row of rowsOf(w)) {
        const s = st.get(row);
        if (!s) continue;
        let deco = false;
        let full = false;
        for (const f of list) {
          if (!match(f, s.ctx)) continue;
          deco = true;
          if (f.body) full = true;
        }
        if (deco) todo.push([s, full]);
      }
      if (!todo.length) continue;
      keepEnd(w, () => {
        for (const [s, full] of todo) {
          CPX.safely("site:deco", () => decorate(s));
          if (full) CPX.safely("site:body", () => body(s));
        }
      });
    }
  }
  CPX.line.setRefresher((f) => {
    if (!A || !f) return;
    if (!pend.length) queueMicrotask(() => CPX.safely("site:refresh", flush));
    pend.push(f);
  });

  CPX.boot.add(
    "site:lines",
    () => {
      A = CPX.siteRows;
      if (!A) return;
      CPX.siteChat.on("box", (b) => CPX.safely("site:watch", () => watch(b)));
      CPX.siteChat.on("hide", unwatch);
      // Сайт выключили — снять своё со всех строк всех чатов (и спрятанных прежних: Kick держит их в документе и
      // может показать снова — ревью 19.11) и больше не смотреть.
      CPX.siteChat.on("off", () => {
        for (const b of CPX.siteChat.boxes()) {
          for (const row of b.el.querySelectorAll(A.ROW)) {
            const s = st.get(row);
            if (s) CPX.safely("site:undo", () => undo(s));
            st.delete(row);
          }
          unwatch(b);
        }
        for (const w of [...live.values()]) unwatch(w.box);
        pend = [];
        CPX.line.setRefresher(() => {});
      });
      for (const b of CPX.siteChat.boxes()) watch(b);
    },
    41
  );

  CPX.diag.add("siteLines", () => ({
    watching: live.size,
    rows: S.rows,
    copies: S.copies,
    redo: S.redo,
    ms: Math.round(S.ms),
    calls: S.calls,
    visible: [...live.values()].map((w) => {
      let n = 0;
      let copies = 0;
      for (const row of rowsOf(w)) {
        const s = st.get(row);
        if (s) n++;
        if (s && s.copy) copies++;
      }
      return { key: w.box.key, rows: rowsOf(w).length, ours: n, copies };
    }),
  }));
})();

// ── src/main/50_emotes.js ──
/* Мир страницы: смайлики 7TV / BTTV / FFZ — копия данных фона и резолверы конвейера строки.
 *
 * Данные приходят из фона (32_emotes): глобальные один раз при запуске, канал — при подключении
 * чата и по первому сообщению из канала-партнёра общего чата (ctx.channelId — канал-ИСТОЧНИК).
 * Живые правки фон досылает событиями "emotes.global" / "emotes.channel". Версия v у фона —
 * отпечаток содержимого: тот же набор (плановая перезагрузка, проснувшийся фон) строки не трогает.
 *
 * Подписка вкладки в фоне (на правки и плановое обновление) — только на НУЖНЫЕ каналы: текущий
 * и партнёров общего чата, от которых были сообщения за последние 10 минут. Ушли с канала или
 * партнёр замолчал — фону уходит «emotes.keep» с новым списком, и он снимает лишнее. Данные
 * ушедшего канала остаются в памяти страницы (вернулись — показываем сразу и подписываемся снова).
 *
 * Порядок поиска слова — как в клиенте (MessageBuilder::parseEmote):
 *   10 — личные 7TV автора (51_cosmetics),
 *   20 — смайлики канала: FFZ > BTTV > 7TV (одноимённый FFZ важнее),
 *   30 — глобальные: FFZ > BTTV > 7TV.
 * Эффекты-модификаторы FFZ (ffzSpin …) — не смайлики: лежат отдельно (ffzMods), их разбирает
 * 56_emote_transform.
 *
 * Токен смайлика (контракт 35_pipeline): { kind:"emote", provider:"7tv"|"bttv"|"ffz", id, name,
 *   urls:{1,2,4}, w, h (размер 1x в px, 0 — неизвестен), zeroWidth, animated, ownerName,
 *   baseName (исходное имя 7TV при переименовании), scope:"channel"|"global"|"personal",
 *   modifierFlags }.
 *
 * API: CPX.emotes.token(запись, scope) · .channel(id) · .global() · .list(channelId) (для ввода:
 *   все смайлики канала и глобальные по приоритету) · .ffzMod(слово, channelId) · .ffzPaid(login)
 *   · .bttvCode(слово) · .urls(запись) · .route(url)/.setImgRoute(fn) (крючок для зеркала 7TV)
 *   · .ffzBadges(channelId) (свои значки модератора/VIP канала FFZ) · .on("change", fn(channelId | null)).
 *
 * Мир Kick (15.11): канал — "kick:<номер владельца на Kick>"; только 7TV
 * (решения владельца: наборы BTTV и FFZ, модификаторы FFZ и «платные» FFZ не берём, даже если фон прислал).
 */

CPX.emotes = (() => {
  const log = CPX.log("emotes");
  const ev = new CPX.Emitter();
  const ONLY_STV = CPX.world === "kick";
  const PROV = ONLY_STV ? ["stv"] : ["stv", "bttv", "ffz"];
  const ID_RE = /^(kick:)?\d{1,20}$/;
  /** Данные фона для этого мира: на Kick — только 7TV. */
  const own = (d) => (ONLY_STV && d ? Object.assign({}, d, { bttv: [], ffz: [], ffzMods: [], ffzPaid: [], ffzBadges: null }) : d);
  const SETTING = { stv: "emotes.stv", bttv: "emotes.bttv", ffz: "emotes.ffz" };
  const NAME = { stv: "7tv", bttv: "bttv", ffz: "ffz" };
  const on = (p) => CPX.settings.get(SETTING[p]) !== false;

  const G = { v: -1, stv: new Map(), bttv: new Map(), ffz: new Map(), ffzMods: new Map(), merged: new Map(), ffzPaid: new Set(), loading: null };
  const channels = new Map(); // id → {id, login, v, stv, bttv, ffz, ffzMods, merged, ffzBadges, loaded, loading, sub, seen}
  const PARTNER_MS = 10 * 60000; // партнёр общего чата «активен», пока от него есть сообщения
  let imgRoute = null;

  const toMap = (list) => {
    const m = new Map();
    for (const r of list || []) if (r && r.n) m.set(r.n, r);
    return m;
  };

  // Сведение слоёв: позже записанный перекрывает — 7TV, потом BTTV, потом FFZ.
  function merge(src) {
    const m = new Map();
    for (const p of PROV) if (on(p)) for (const [n, r] of src[p]) m.set(n, r);
    return m;
  }

  // ── адреса картинок ───────────────────────────────────────────────────────
  function urls(rec) {
    if (rec._u) return rec._u;
    let u;
    if (rec.p === "7tv") {
      const base = rec.hu || "https://cdn.7tv.app/emote/" + rec.i;
      const x = rec.x || 4; // у старых смайликов бывает только до 3x
      const f = (s) => base + "/" + Math.min(s, x) + "x.webp";
      u = { 1: f(1), 2: f(2), 4: f(4) };
    } else if (rec.p === "bttv") {
      const base = "https://cdn.betterttv.net/emote/" + rec.i + "/";
      u = { 1: base + "1x.webp", 2: base + "2x.webp", 4: base + "3x.webp" };
    } else {
      u = rec.u || {};
    }
    const safe = { 1: CPX.safe.imgUrl(u[1]), 2: CPX.safe.imgUrl(u[2]), 4: CPX.safe.imgUrl(u[4]) };
    if (!safe[2]) safe[2] = safe[1];
    if (!safe[4]) safe[4] = safe[2];
    rec._u = safe;
    return safe;
  }

  /** Адрес картинки для показа (крючок маршрута: зеркало 7TV для PLUS — этап 5). */
  function route(url) {
    if (!imgRoute || !url) return url;
    try {
      return imgRoute(url) || url;
    } catch (e) {
      CPX.report("emotes:route", e);
      return url;
    }
  }

  function token(rec, scope) {
    return {
      kind: "emote",
      provider: NAME[rec.p] || rec.p,
      id: rec.i,
      name: rec.n,
      urls: urls(rec),
      w: rec.w || 0,
      h: rec.h || 0,
      zeroWidth: !!rec.z,
      animated: !!rec.a,
      ownerName: rec.o || "",
      baseName: rec.b || "",
      scope,
      modifierFlags: rec.m || 0,
    };
  }

  // ── глобальные ────────────────────────────────────────────────────────────
  // Отпечаток данных: версия фона + сколько смайликов у каждого сервиса (выключенный сервис фон
  // присылает пустым). Тот же отпечаток — перерисовывать строки незачем.
  const sigOf = (d) => [d.v, (d.stv || []).length, (d.bttv || []).length, (d.ffz || []).length, (d.ffzMods || []).length].join("|");

  function applyGlobal(d) {
    if (!d || typeof d !== "object") return;
    d = own(d);
    const sig = sigOf(d);
    if (sig === G.sig) return;
    G.sig = sig;
    G.v = d.v;
    G.stv = toMap(d.stv);
    G.bttv = toMap(d.bttv);
    G.ffz = toMap(d.ffz);
    G.ffzMods = toMap(d.ffzMods);
    G.ffzPaid = new Set(d.ffzPaid || []);
    G.merged = merge(G);
    ev.emit("change", null);
    CPX.line.refresh({ body: true });
  }

  function loadGlobal() {
    if (G.loading) return G.loading;
    G.loading = CPX.bg
      .call("emotes.global", null, { timeout: 60000 })
      .then(applyGlobal)
      .catch((e) => log.warn("глобальные смайлики не получены:", e.message))
      .finally(() => (G.loading = null));
    return G.loading;
  }

  // ── каналы ────────────────────────────────────────────────────────────────
  function entry(id) {
    let c = channels.get(id);
    if (!c) {
      c = { id, login: "", v: -1, stv: new Map(), bttv: new Map(), ffz: new Map(), ffzMods: new Map(), merged: new Map(), ffzBadges: null, loaded: false, loading: null, tries: 0, sub: false, seen: 0 };
      channels.set(id, c);
      // Потолок: общий чат — до 6 каналов, плюс переходы по каналам. Выселяем сначала тех, на
      // кого вкладка в фоне не подписана (иначе подписку было бы нечем снять).
      if (channels.size > 16) {
        const cur = CPX.chat.state && CPX.chat.state.channelId;
        const pick = (free) => [...channels.values()].find((x) => x.id !== id && x.id !== cur && (!free || !x.sub));
        const out = pick(true) || pick(false);
        if (out) channels.delete(out.id);
      }
    }
    return c;
  }

  function applyChannel(d) {
    if (!d || !d.id) return;
    d = own(d);
    const c = entry(String(d.id));
    const sig = sigOf(d);
    c.ffzBadges = d.ffzBadges || null;
    if (c.loaded && sig === c.sig) return;
    c.sig = sig;
    c.login = d.login || c.login;
    c.v = d.v;
    c.stv = toMap(d.stv);
    c.bttv = toMap(d.bttv);
    c.ffz = toMap(d.ffz);
    c.ffzMods = toMap(d.ffzMods);
    c.merged = merge(c);
    c.loaded = true;
    ev.emit("change", c.id);
    CPX.line.refresh({ channelId: c.id, body: true });
  }

  function loadChannel(id, login) {
    if (!ID_RE.test(String(id || ""))) return null;
    const c = entry(String(id));
    if (login && !c.login) c.login = login;
    if (c.loading) return c.loading;
    c.sub = true; // фон подписывает вкладку уже при получении запроса
    c.loading = CPX.bg
      .call("emotes.channel", { id: c.id, login: c.login }, { timeout: 60000 })
      .then((d) => {
        c.loading = null;
        applyChannel(d);
      })
      .catch((e) => {
        log.warn("смайлики канала не получены:", c.id, e.message);
        c.sub = false;
        // Фон недоступен/тайм-аут — ещё попытка позже (не на каждом слове).
        if (c.tries++ < 5) setTimeout(() => ((c.loading = null), loadChannel(c.id)), 15000 * c.tries);
        return new Promise(() => {}); // до повтора считаем «грузится»
      });
    return c.loading;
  }

  const curId = () => (CPX.chat.state && CPX.chat.state.channelId) || "";

  /** Данные канала (или null, пока не пришли; первый вызов запускает загрузку).
   * Зовётся на каждое слово — только поиск в Map и отметка «партнёр жив». */
  function channel(id, login) {
    if (!id) return null;
    id = String(id);
    let c = channels.get(id);
    if (!c) {
      loadChannel(id, login);
      c = channels.get(id);
    } else if (!c.sub && !c.loading) loadChannel(id, login); // вернулись на канал — подписаться снова
    if (c && id !== curId()) c.seen = Date.now();
    return c && c.loaded ? c : null;
  }

  // ── какие каналы держать в подписке фона ─────────────────────────────────
  function wantedIds() {
    const cur = curId();
    const now = Date.now();
    const out = cur ? [cur] : [];
    for (const c of channels.values()) if (c.id !== cur && c.seen && now - c.seen < PARTNER_MS) out.push(c.id);
    return out.slice(0, 12);
  }
  /** Есть подписки сверх нужного (ушли с канала, партнёр замолчал) — сообщить фону список нужных,
   * лишние он снимет. c.sub — на что вкладка подписана в фоне (ставит loadChannel). */
  function keep() {
    const ids = wantedIds();
    const want = new Set(ids);
    const drop = [...channels.values()].filter((c) => c.sub && !want.has(c.id));
    if (!drop.length) return;
    for (const c of drop) c.sub = false;
    // Не дошло — вернуть пометку: повторим на следующем обходе.
    CPX.bg.call("emotes.keep", { ids }).catch(() => drop.forEach((c) => (c.sub = true)));
  }

  // ── резолверы ─────────────────────────────────────────────────────────────
  const chId = (ctx) => (ctx && ctx.channelId) || (CPX.chat.state && CPX.chat.state.channelId) || "";

  CPX.tokens.addResolver(20, (word, ctx) => {
    // Логин не передаём: у партнёра общего чата список может подставить логин ТЕКУЩЕГО канала.
    const c = channel(chId(ctx));
    const r = c && c.merged.get(word);
    return r ? token(r, "channel") : null;
  });

  CPX.tokens.addResolver(30, (word) => {
    const r = G.merged.get(word);
    return r ? token(r, "global") : null;
  });

  // ── запуск и события ──────────────────────────────────────────────────────
  CPX.bg.on("emotes.global", CPX.guard("emotes:global", applyGlobal));
  CPX.bg.on("emotes.channel", CPX.guard("emotes:channel", applyChannel));

  // Фон проснулся заново — его память пуста: попросить заново (заодно подписаться на правки) —
  // только нужные каналы (текущий и живых партнёров), а не всё, что помнит страница. Версии —
  // отпечатки содержимого: то же самое строки не перерисует.
  CPX.bg.on("bridge:bg", (d) => {
    if (!d || !d.up) return;
    loadGlobal();
    const want = new Set(wantedIds());
    for (const c of channels.values()) {
      c.sub = false;
      c.loading = null;
      if (want.has(c.id)) loadChannel(c.id);
    }
  });

  // Выключили/включили сервис — пересобрать сведённые словари и перерисовать строки.
  CPX.settings.onAny((ch) => {
    if (!PROV.some((p) => SETTING[p] in ch)) return;
    G.merged = merge(G);
    for (const c of channels.values()) c.merged = merge(c);
    ev.emit("change", null);
    CPX.line.refresh({ body: true });
  });

  CPX.boot.add(
    "emotes",
    () => {
      loadGlobal();
      const attach = (s) => {
        if (s) loadChannel(s.channelId, s.login);
        keep();
      };
      CPX.chat.on("attach", attach);
      CPX.chat.on("detach", () => keep());
      attach(CPX.chat.state);
      // Замолчавшие партнёры общего чата — раз в минуту.
      setInterval(CPX.guard("emotes:keep", keep), 60000);
    },
    50
  );

  CPX.diag.add("emotes", () => ({
    global: { v: G.v, stv: G.stv.size, bttv: G.bttv.size, ffz: G.ffz.size, ffzMods: G.ffzMods.size, merged: G.merged.size, ffzPaid: G.ffzPaid.size },
    channels: [...channels.values()].map((c) => ({ id: c.id, login: c.login, loaded: c.loaded, sub: c.sub, stv: c.stv.size, bttv: c.bttv.size, ffz: c.ffz.size, ffzMods: c.ffzMods.size, merged: c.merged.size })),
  }));

  return {
    token,
    urls,
    route,
    setImgRoute(fn) {
      imgRoute = typeof fn === "function" ? fn : null;
    },
    channel,
    load: loadChannel,
    global: () => G,
    /** Эффект-модификатор FFZ: сначала набор канала, потом глобальные (как клиент). */
    ffzMod(word, channelId) {
      if (!on("ffz")) return null;
      const c = channelId && channels.get(String(channelId));
      return (c && c.ffzMods.get(word)) || G.ffzMods.get(word) || null;
    },
    ffzPaid: (login) => G.ffzPaid.has(String(login || "").toLowerCase()),
    /** Свои значки модератора/VIP канала FFZ: {mod: {1,2,4} | null, vip: …} | null. */
    ffzBadges(channelId) {
      const c = channelId && channels.get(String(channelId));
      return (c && c.ffzBadges) || null;
    },
    /** Запись BTTV-кода (w! h! …) — у BTTV это и смайлик со своей картинкой. */
    bttvCode: (word) => (on("bttv") && G.bttv.get(word)) || null,
    /** Все смайлики канала и глобальные — по приоритету клиента (для дополнения ввода). */
    list(channelId) {
      const out = new Map();
      for (const [n, r] of G.merged) out.set(n, { rec: r, scope: "global" });
      const c = channelId && channels.get(String(channelId));
      if (c) for (const [n, r] of c.merged) out.set(n, { rec: r, scope: "channel" });
      return out;
    },
    on: (name, fn) => ev.on(name, fn),
  };
})();

// ── src/main/51_cosmetics.js ──
/* Мир страницы: косметика людей — копия данных фона.
 *
 *  • 7TV: пейнт, бейдж и личные наборы смайликов человека (фон: 35_cosmetics);
 *  • сторонние бейджи (BTTV, FFZ, Chatterino, Homies, FFZ:AP — фон: 36_badges3p);
 *  • список подписчиков PLUS: бейдж, пейнт, (если знаем) стаж и цвет ника (фон: 37_plus_roster).
 *
 * Людей спрашиваем у фона ПАЧКОЙ: украшения строки зовут CPX.cosm.user(id) — неизвестный
 * человек ставится в очередь, раз в 120 мс уходит один запрос «cosm.users» на всех новых.
 * Что фон узнает позже (EventAPI, ответ 7TV, загрузился список бейджей), он присылает событием
 * "cosm.update" — строки этого человека перерисовываются (CPX.line.refresh по userId). Не узнал и спрашивать сейчас
 * не будет (сбой 7TV, пауза — поток запросов 18.11) — шлёт forget:[id]: забываем «ещё спрашиваем», и когда человек
 * появится снова, его строка спросит заново.
 *
 * ⚠️Перерисовка — только когда что-то ПОМЕНЯЛОСЬ (на людном канале лишняя перерисовка строки
 * гасит подсказку над смайликом, сбивает фазу эффектов и заново создаёт картинки):
 *  • человек — если сменились пейнт/бейдж/сторонние бейджи (украшения) или его личные
 *    смайлики (тогда и тело строки);
 *  • описание пейнта/бейджа — если его не было или оно другое: перерисовать тех, кто его носит;
 *  • личный набор — фон шлёт только ВЕРСИЮ (отпечаток содержимого); содержимое страница берёт
 *    сама (cosm.sets), если такой версии у неё нет;
 *  • тело строки — только если в ней есть слово из пришедших личных смайликов: пока наборы
 *    человека неизвестны, резолвер 10 запоминает слова его строк (waitWords). Общий
 *    «событийный» набор 7TV носят десятки людей — иначе каждый новый человек в людном чате
 *    стоил бы перерисовки тела его строк, почти всегда впустую.
 *
 * Резолвер 10 — личные смайлики 7TV автора (раньше смайликов канала, как в клиенте).
 * Присутствие 7TV: при входе в чат и когда я пишу (фон сам решает, можно ли — согласие).
 *
 * API: CPX.cosm.user(id, channelId) → {p, b, s, x} | null · .paint7(id) · .badge7(id) ·
 *   .xdef(ключ) · .personal(userId) → Map | null · .personalSets(userId) → [{id, n, f, m}] (по
 *   наборам, с названиями — меню смайликов) · .plus(id | login) → профиль PLUS | null ·
 *   .isPlus(user) · .plusPaint(номер) → {v, spec} · .plusBadge() (стандартный значок PLUS) · .plusSet()
 *   (каталог значков перед ником {номер: {title, urls, light}}, у человека — badge_id) · .on("change", fn).
 */

CPX.cosm = (() => {
  const log = CPX.log("cosm");
  const ev = new CPX.Emitter();
  const ID_RE = /^(kick:)?\d{1,20}$/; // мир Kick (15.11): "kick:<номер>"
  const users = new CPX.LRU(8000); // id → {p, b, s:[], x:[], q?}
  const paints7 = new CPX.LRU(2000);
  const badges7 = new CPX.LRU(800);
  const sets = new CPX.LRU(600); // id набора → {v: версия, m: Map имя → запись}
  const xdefs = new Map(); // ключ стороннего бейджа → описание
  const personalCache = new CPX.LRU(2000); // id человека → {sig, map}
  const P = { users: new Map(), byLogin: new Map(), paints: new Map(), badge: null, set: null, version: "" };

  // ── запросы пачкой ────────────────────────────────────────────────────────
  const pending = new Map(); // id → канал
  const inflight = new Set();
  let flushT = 0;

  function need(id, channelId) {
    if (inflight.has(id) || pending.has(id)) return;
    pending.set(id, channelId || "");
    if (!flushT) flushT = setTimeout(flush, 120);
  }

  function flush() {
    flushT = 0;
    if (!pending.size) return;
    // Одним запросом — люди одного канала (бейджи FFZ канала зависят от него).
    const byCh = new Map();
    for (const [id, ch] of pending) {
      if (!byCh.has(ch)) byCh.set(ch, []);
      byCh.get(ch).push(id);
    }
    pending.clear();
    for (const [ch, all] of byCh) {
      for (let i = 0; i < all.length; i += 200) {
        const ids = all.slice(i, i + 200);
        ids.forEach((x) => inflight.add(x));
        CPX.bg
          .call("cosm.users", { ids, channelId: ch || null }, { timeout: 30000 })
          .then((d) => apply(d))
          .catch((e) => log.debug("cosm.users:", e.message))
          .finally(() => ids.forEach((x) => inflight.delete(x)));
      }
    }
  }

  // ── содержимое личных наборов — по версии, пачкой ────────────────────────
  const setWant = new Map(); // id → версия, которую знает фон
  const setBusy = new Set();
  let setT = 0;
  function needSet(id, v) {
    if (!v || setBusy.has(id)) return;
    const have = sets.get(id);
    if (have && have.v === v) return;
    setWant.set(id, v);
    if (!setT) setT = setTimeout(fetchSets, 50);
  }
  function fetchSets() {
    setT = 0;
    const ids = [...setWant.keys()].slice(0, 50);
    ids.forEach((id) => {
      setWant.delete(id);
      setBusy.add(id);
    });
    if (setWant.size) setT = setTimeout(fetchSets, 50);
    if (!ids.length) return;
    CPX.bg
      .call("cosm.sets", { ids }, { timeout: 30000 })
      .then((d) => applySets(d && d.sets))
      .catch((e) => log.debug("cosm.sets:", e.message))
      .finally(() => ids.forEach((id) => setBusy.delete(id)));
  }
  function applySets(got) {
    if (!got || typeof got !== "object") return;
    const fresh = new Set(); // впервые на странице
    const edited = new Set(); // была другая версия — живая правка набора
    for (const id in got) {
      const x = got[id];
      if (!x || !x.v || !Array.isArray(x.list)) continue;
      const have = sets.get(id);
      if (have && have.v === x.v) continue;
      sets.set(id, { v: x.v, m: toMap(x.list), n: typeof x.n === "string" ? x.n.slice(0, 80) : "", f: +x.f || 0 });
      (have ? edited : fresh).add(id);
    }
    if (!fresh.size && !edited.size) return;
    for (const [uid, u] of users.map) {
      if (!u.s || !u.s.length) continue;
      const hitEdit = u.s.some((x) => edited.has(x));
      const hitFresh = u.s.some((x) => fresh.has(x));
      if (!hitEdit && !hitFresh) continue;
      personalCache.delete(uid);
      // Правка уже известного набора — строки могли быть и со словом, которое только что
      // стало смайликом: тело целиком. Набор пришёл впервые — только если в строках есть его слово.
      if (hitEdit || wordsHit(uid)) refreshUser(uid, true);
    }
  }

  // ── слова строк, пока личные смайлики человека неизвестны ─────────────────
  const waitWords = new Map(); // id → Set(слово)
  /** Личные смайлики человека известны целиком (все его наборы уже на странице). */
  // q — фон ещё спрашивает 7TV об этом человеке: наборы могут появиться.
  const complete = (u) => !!u && !u.q && (!u.s || !u.s.length || u.s.every((x) => sets.map.has(x)));
  function rememberWord(id, word) {
    let w = waitWords.get(id);
    if (!w) {
      if (waitWords.size >= 2000) waitWords.delete(waitWords.keys().next().value);
      w = new Set();
      waitWords.set(id, w);
    }
    if (w.size < 100) w.add(word);
  }
  /** Есть ли в запомненных словах человека его личный смайлик. Наборы известны целиком — слова
   * больше не нужны. */
  function wordsHit(id) {
    const w = waitWords.get(id);
    const m = personal(id);
    let hit = false;
    if (w && m) for (const x of w) if (m.has(x)) hit = true;
    if (complete(users.map.get(id))) waitWords.delete(id);
    return hit;
  }

  // ── применение данных ─────────────────────────────────────────────────────
  const toMap = (list) => {
    const m = new Map();
    for (const r of list || []) if (r && r.n) m.set(r.n, r);
    return m;
  };
  // Украшения человека (бейджи, пейнт) и его личные смайлики — по отдельности: сменились
  // только бейджи — тело строки не трогаем.
  const decoSig = (u) => (u ? [u.p, u.b, (u.x || []).join(",")].join("|") : "");
  // Личные смайлики: какие наборы и КАКИЕ ИХ ВЕРСИИ уже есть на странице.
  // Зовётся на каждое слово (резолвер 10) — читаем без перестановки в LRU.
  function personalSig(u) {
    if (!u || !u.s || !u.s.length) return "";
    let out = "";
    for (const s of u.s) {
      const x = sets.map.get(s);
      if (x) out += s + "@" + x.v + ",";
    }
    return out;
  }
  const same = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);

  // Перерисовка — пачкой раз в кадр: одно событие может задеть сотню людей.
  const toRefresh = new Map(); // id → body?
  let refreshQueued = false;
  function refreshUser(id, body) {
    toRefresh.set(id, toRefresh.get(id) || !!body);
    if (refreshQueued) return;
    refreshQueued = true;
    requestAnimationFrame(() => {
      refreshQueued = false;
      const list = [...toRefresh];
      toRefresh.clear();
      for (const [uid, b] of list) CPX.line.refresh(b ? { userId: uid, body: true } : { userId: uid });
      ev.emit("change", list.map((x) => x[0]));
    });
  }

  function apply(d) {
    if (!d || typeof d !== "object") return;
    // Описания: новое — только если его не было или оно другое.
    const newPaints = new Set();
    const newBadges = new Set();
    for (const id in d.paints || {}) {
      if (same(paints7.get(id), d.paints[id])) continue;
      paints7.set(id, d.paints[id]);
      newPaints.add(id);
    }
    for (const id in d.badges || {}) {
      if (same(badges7.get(id), d.badges[id])) continue;
      badges7.set(id, d.badges[id]);
      newBadges.add(id);
    }
    for (const k in d.xdefs || {}) xdefs.set(k, d.xdefs[k]);
    const setV = d.setV && typeof d.setV === "object" ? d.setV : {};
    // 7TV ответил о человеке «то же самое» — снять «ещё спрашиваем», без перерисовки.
    for (const id of Array.isArray(d.done) ? d.done : []) {
      const u = users.map.get(String(id));
      if (!u || !u.q) continue;
      const n = Object.assign({}, u);
      delete n.q;
      users.map.set(String(id), n);
      if (complete(n)) waitWords.delete(String(id));
    }
    // Фон о человеке не узнал и спрашивать сейчас не будет (сбой 7TV, пауза — поток запросов, 18.11): забыть «ещё
    // спрашиваем» — когда человек появится снова, украшение строки спросит заново (need).
    for (const id of Array.isArray(d.forget) ? d.forget : []) {
      const u = users.map.get(String(id));
      if (u && u.q) users.delete(String(id));
    }
    for (const id in d.users || {}) {
      const next = d.users[id];
      if (!next || !ID_RE.test(id)) continue;
      const prev = users.get(id);
      users.set(id, next);
      const deco = prev ? decoSig(prev) !== decoSig(next) : !!(next.p || next.b || (next.x && next.x.length));
      let body = false;
      if (personalSig(prev) !== personalSig(next)) {
        personalCache.delete(id);
        // Знали его смайлики целиком, а они сменились (новый набор по выдаче) — тело целиком;
        // иначе — только если в его строках есть слово из них.
        body = complete(prev) || wordsHit(id);
      } else if (complete(next)) waitWords.delete(id);
      if (body || deco) refreshUser(id, body);
    }
    // Версии наборов: чего нет — дозапросить (перерисуем, когда придёт содержимое).
    for (const id in setV) needSet(id, setV[id]);
    // Пришли новые/другие описания — перерисовать украшения тех, кто их носит.
    if (newPaints.size || newBadges.size) {
      for (const [id, u] of users.map) {
        if ((u.p && newPaints.has(u.p)) || (u.b && newBadges.has(u.b))) refreshUser(id, false);
      }
    }
  }

  // ── PLUS ──────────────────────────────────────────────────────────────────
  function applyRoster(d) {
    if (!d || !Array.isArray(d.users)) return;
    const next = new Map();
    for (const u of d.users) if (u && ID_RE.test(String(u.id))) next.set(String(u.id), u);
    const old = P.users;
    P.users = next;
    // Вход по логину — только у записей с логином (у списка для Kick логинов нет: там сверка только по номеру Kick).
    P.byLogin = new Map([...next.values()].filter((u) => u.login).map((u) => [u.login, u]));
    P.paints = new Map(Object.keys(d.paints || {}).map((k) => [String(+k), d.paints[k]]));
    const look = JSON.stringify([P.badge, P.set]);
    P.badge = d.badge || P.badge;
    P.set = d.set || P.set;
    // Пришли (другие) картинки значков — перерисовать всех со значком, даже если сами они не менялись.
    const lookNew = JSON.stringify([P.badge, P.set]) !== look;
    P.version = d.version || "";
    // Перерисовать только тех, у кого что-то поменялось; сменился статус подписчика —
    // и тело (эффекты +spin действуют только у подписчиков).
    if (old.size || next.size) {
      const ids = new Set([...old.keys(), ...next.keys()]);
      for (const id of ids) {
        const a = old.get(id);
        const b = next.get(id);
        if (JSON.stringify(a) !== JSON.stringify(b)) refreshUser(id, !a !== !b);
        else if (lookNew && b && b.badge) refreshUser(id, false);
      }
    }
  }

  function loadRoster() {
    return CPX.bg
      .call("plus.roster", null, { timeout: 30000 })
      .then(applyRoster)
      .catch((e) => log.debug("plus.roster:", e.message));
  }

  function plus(key) {
    if (!key) return null;
    const k = String(key);
    return P.users.get(k) || P.byLogin.get(k.toLowerCase()) || null;
  }

  function isPlus(user) {
    if (!user) return false;
    return !!((user.id && P.users.has(String(user.id))) || (user.login && P.byLogin.has(String(user.login).toLowerCase())));
  }

  // ── личные наборы 7TV ─────────────────────────────────────────────────────
  function personal(userId) {
    const u = users.map.get(String(userId));
    if (!u || !u.s || !u.s.length) return null;
    const key = personalSig(u);
    const c = personalCache.map.get(userId);
    if (c && c.sig === key) return c.map;
    // Первый набор важнее (как у клиента): его имена не перекрываются следующими.
    const m = new Map();
    for (const s of u.s) {
      const set = sets.get(s);
      if (set) for (const [n, r] of set.m) if (!m.has(n)) m.set(n, r);
    }
    const map = m.size ? m : null;
    personalCache.set(userId, { sig: key, map });
    return map;
  }

  /** Личные наборы человека по отдельности (меню смайликов): [{id, n: название, f: флаги, m}]
   * в порядке его наборов; ещё не пришедшие — пропущены. */
  function personalSets(userId) {
    const u = users.map.get(String(userId));
    if (!u || !u.s || !u.s.length) return [];
    const out = [];
    for (const s of u.s) {
      const set = sets.get(s);
      if (set && set.m.size) out.push({ id: s, n: set.n || "", f: set.f || 0, m: set.m });
    }
    return out;
  }

  CPX.tokens.addResolver(10, (word, ctx) => {
    if (!ctx || !ctx.user || !ctx.user.id || CPX.settings.get("emotes.stv") === false) return null;
    const id = String(ctx.user.id);
    if (!complete(users.map.get(id))) rememberWord(id, word);
    const m = personal(id);
    const r = m && m.get(word);
    return r ? CPX.emotes.token(r, "personal") : null;
  });

  // ── присутствие 7TV ───────────────────────────────────────────────────────
  function presence(active) {
    const s = CPX.chat.state;
    const me = (s && s.me) || (CPX.twitch && CPX.twitch.me()); // у мира Kick CPX.twitch нет — и присутствия тоже
    if (!s || !me || !me.id) return;
    CPX.bg.call("stv.presence", { userId: me.id, channelId: s.channelId, active: !!active }).catch(() => {});
  }

  // ── запуск ────────────────────────────────────────────────────────────────
  CPX.bg.on("cosm.update", CPX.guard("cosm:update", apply));
  CPX.bg.on("plus.roster", CPX.guard("cosm:roster", applyRoster));
  CPX.bg.on("bridge:bg", (d) => {
    if (!d || !d.up) return;
    loadRoster();
    // Фон забыл, о ком его спрашивали, — повторно спросить видимых недавних. Прежние записи
    // остаются до ответа: он сравнится с ними, и перерисуется только изменившееся.
    for (const id of [...users.map.keys()].slice(-300)) need(id, (CPX.chat.state && CPX.chat.state.channelId) || "");
  });

  CPX.boot.add(
    "cosm",
    () => {
      loadRoster();
      CPX.chat.on("attach", () => setTimeout(() => presence(false), 1500));
      if (CPX.chat.state) setTimeout(() => presence(false), 1500);
      // Своё сообщение в чате — «активное» присутствие (фон шлёт не чаще раза в 10 с).
      CPX.chat.onMessage((msg) => {
        const s = CPX.chat.state;
        if (!msg || msg.type !== CPX.chat.T.MESSAGE || !s || !s.me || !msg.user) return;
        if (String(msg.user.userID) === s.me.id) presence(true);
      });
    },
    51
  );

  CPX.diag.add("cosm", () => ({
    users: users.size,
    withPaint: [...users.map.values()].filter((u) => u.p).length,
    withBadge: [...users.map.values()].filter((u) => u.b).length,
    withX: [...users.map.values()].filter((u) => u.x && u.x.length).length,
    withSets: [...users.map.values()].filter((u) => u.s && u.s.length).length,
    asking: [...users.map.values()].filter((u) => u.q).length,
    waitWords: waitWords.size,
    paints7: paints7.size,
    badges7: badges7.size,
    sets: sets.size,
    xdefs: xdefs.size,
    plus: { users: P.users.size, paints: P.paints.size, version: P.version },
  }));

  return {
    /** Косметика человека (null — ещё не знаем; запрос уже в очереди). */
    user(id, channelId) {
      id = String(id || "");
      if (!ID_RE.test(id)) return null;
      const u = users.get(id);
      if (!u) need(id, channelId);
      return u || null;
    },
    paint7: (id) => paints7.get(id) || null,
    badge7: (id) => badges7.get(id) || null,
    xdef: (k) => xdefs.get(k) || null,
    personal,
    personalSets,
    plus,
    isPlus,
    plusPaint: (n) => P.paints.get(String(n)) || null,
    plusBadge: () => P.badge,
    plusSet: () => P.set,
    presence,
    on: (name, fn) => ev.on(name, fn),
  };
})();

// ── src/main/52_img_gate.js ──
/* Мир страницы: картинка, которая не грузится, — всё реже (правила 5–6 «Поток запросов», основной чат 18.11,
 * chatterino7-src/docs/plus/ПОТОК-ЗАПРОСОВ-ПРАВИЛА-ДЛЯ-ПРОГРАММ-1118.md).
 *
 * ПОЧЕМУ. Раньше каждая новая строка заново просила картинку, которая уже не загрузилась: значок PLUS подписчика,
 * смайлик, аватарку. Днём 18.11 прослойка хостера несколько часов отвечала 403 на картинки нашего сервера — и каждая
 * строка каждого подписчика у каждого зрителя была запросом в никуда.
 *
 * КАК. <img> не видит код ответа (403 «нельзя» не отличить от сбоя связи) — любую ОШИБКУ картинки считаем одинаково;
 * истёкший срок ожидания («медленно») — не ошибка и в счёт не идёт (К4 правил основного чата 19.11: медленный 7TV
 * ставил на паузу все картинки 7TV, включая смайлики чата):
 *  • по адресу: после 1-й неудачи подряд следующая попытка не раньше чем через 5 с, после 2-й — 2 мин, дальше 5, 15,
 *    30 мин и раз в 30 мин: не больше 6 запросов за первый час, дальше 2 в час. Сами по таймеру не грузим — только когда
 *    картинку снова показывают (новая строка, перерисовка); до срока вызывающий сразу делает «не загрузилась» (имя
 *    смайлика текстом, значка нет, ник своим цветом);
 *  • по сайту (хосту): 8 неудач подряд без единой удачи — пауза всем его картинкам 15 с → 30 с → 1 → 2 → 5 мин; по её
 *    концу — одна пробная (первая, что попросят): удалась — пауза снята, нет — следующая ступень;
 *  • удача снимает неудачи адреса и счёт сайта — но только первая удача адреса на странице (повтор — из кэша браузера,
 *    о сайте он ничего не говорит), а паузу сайта — только удача пробной.
 * Учёт — на вкладку (у каждой вкладки свой мир страницы). Картинки из кэша браузера сюда не доходят неудачей.
 *
 * API: CPX.imgGate.allow(url, {queued}) → можно ли грузить сейчас · .paused(url) — для очереди 64 перед стартом ·
 *   .watch(img, url, {errors}) → off — исход загрузки <img> в учёт
 *   (errors:false — неудачи считает сам вызывающий: у картинок 7TV через CPX.imgRoute попытка «прямо» может сорваться,
 *   а «через зеркало» — удаться) · .ok(url) / .fail(url) — исход загрузки не через <img> документа · .state().
 *   Картинки 7TV ведёт очередь CPX.imgRoute (64): ошибки в счёт ставит она, паузу сайта перед стартом проверяет она.
 */

CPX.imgGate = (() => {
  const URL_STEPS = [5000, 120000, 300000, 900000, 1800000]; // пауза после 1-й, 2-й … неудачи подряд; дальше — последняя
  const HOST_STEPS = [15000, 30000, 60000, 120000, 300000];
  const HOST_TRIP = 8; // неудач подряд с сайта без единой удачи — пауза сайту
  const PROBE_MS = 30000; // пробная картинка сайта «пропала» (ни удачи, ни неудачи) — можно следующую
  const urls = new CPX.LRU(2000); // адрес → {n, until}
  const good = new CPX.LRU(3000); // адреса, уже загруженные удачно на этой странице (ok)
  const hosts = new Map(); // хост → {streak, trips, until, probeAt, probeUrl}
  const st = { denied: 0, fails: 0, trips: 0 };

  function hostOf(url) {
    try {
      return new URL(url).host;
    } catch (_) {
      return "";
    }
  }

  /** Можно ли грузить сейчас. o.queued — картинку поведёт очередь CPX.imgRoute (64): паузу сайта и пробную она
   *  проверит сама перед стартом (paused) — здесь только адрес (иначе пробную забрал бы вызов при создании строки). */
  function allow(url, o) {
    if (!url) return true;
    const now = Date.now();
    const u = urls.map.get(url);
    if (u && now < u.until) {
      st.denied++;
      return false;
    }
    if (o && o.queued) return true;
    const h = hosts.get(hostOf(url));
    if (h && h.until) {
      if (now < h.until || now - h.probeAt < PROBE_MS) {
        st.denied++;
        return false;
      }
      h.probeAt = now; // одна пробная за паузу
      h.probeUrl = url;
    }
    return true;
  }

  /** Для очереди перед стартом (К4 правил 19.11): сайт на паузе → true; пауза кончилась — эта загрузка становится
   *  пробной (одна на PROBE_MS), остальные ждут её исхода. */
  function paused(url) {
    const h = hosts.get(hostOf(url));
    if (!h || !h.until) return false;
    const now = Date.now();
    if (now < h.until || now - h.probeAt < PROBE_MS) {
      st.denied++;
      return true;
    }
    h.probeAt = now;
    h.probeUrl = url;
    return false;
  }

  /** Удача. Повтор адреса, который на этой странице уже грузился удачно, — из кэша браузера: не довод, что сайт жив
   *  (ревью 19.11: значок PLUS из кэша в каждой строке снимал счёт и паузу сайта, и при 403 прослойки пауза не
   *  наставала никогда). Сайт на паузе — снимает её только удача пробной картинки. */
  function ok(url) {
    if (!url) return;
    urls.delete(url);
    const fresh = !good.has(url);
    good.set(url, 1);
    const host = hostOf(url);
    const h = hosts.get(host);
    if (!h) return;
    if (h.until ? h.probeUrl === url : fresh) hosts.delete(host);
  }

  /** Неудача адреса (ошибка самой картинки). */
  function fail(url) {
    if (!url) return;
    const now = Date.now();
    const u = urls.get(url) || { n: 0, until: 0, at: 0 };
    // Тот же адрес у нескольких <img> разом (смайлик трижды в строке) — браузер шлёт один запрос: одна неудача.
    if (now - u.at < 2000) return;
    u.at = now;
    st.fails++;
    u.n++;
    u.until = now + URL_STEPS[Math.min(u.n, URL_STEPS.length) - 1];
    urls.set(url, u);
    const host = hostOf(url);
    if (!host) return;
    const h = hosts.get(host) || { streak: 0, trips: 0, until: 0, probeAt: 0 };
    h.streak++;
    if (h.probeAt || h.streak >= HOST_TRIP) {
      h.until = now + HOST_STEPS[Math.min(h.trips, HOST_STEPS.length - 1)];
      h.trips++;
      h.streak = 0;
      h.probeAt = 0;
      h.probeUrl = "";
      st.trips++;
    }
    hosts.set(host, h);
    if (hosts.size > 200) hosts.delete(hosts.keys().next().value);
  }

  function watch(im, url, o) {
    const errors = !o || o.errors !== false;
    const off = () => {
      im.removeEventListener("load", onLoad);
      im.removeEventListener("error", onError);
    };
    const onLoad = () => {
      off();
      ok(url);
    };
    const onError = () => {
      if (!errors) return;
      off();
      fail(url);
    };
    im.addEventListener("load", onLoad);
    im.addEventListener("error", onError);
    return off; // вызывающий сменил адрес картинки (запасной) — исход уже не про url
  }

  CPX.diag.add("imgGate", () => ({
    urls: urls.map.size,
    hostsPaused: [...hosts].filter(([, h]) => h.until > Date.now()).map(([k]) => k),
    denied: st.denied,
    fails: st.fails,
    trips: st.trips,
  }));

  return { allow, paused, ok, fail, watch, state: () => ({ urls: urls.map.size, hosts: hosts.size }) };
})();

// ── src/main/55_effects.js ──
/* Мир страницы: эффекты смайликов — BTTV («w! h! v! z! c! l! r! p! s!» ПЕРЕД смайликом), FFZ
 * (смайлики-модификаторы «ffzSpin …» ПОСЛЕ смайлика) и наши PLUS («+spin …» ПЕРЕД смайликом).
 *
 * Перенос НАШЕГО модуля экранного чата OBS (chat/web/src/common/30_effects.js). ИСТОЧНИК ПРАВДЫ —
 * клиент Chatterino+:
 *   src/messages/EmoteEffects.cpp        — биты, каталог, размеры (effectTargetSize, effectSizeFactor);
 *   src/messages/EmoteEffectRenderer.cpp — ключевые кадры, периоды, цвет (frameGeometry, colorChainFor);
 *   src/providers/plus/PlusService.cpp   — PLUS_EFFECT_CMDS.
 * Числа перенесены один в один: меняешь там — меняй и здесь.
 *
 * Расхождения экранного чата с клиентом (research/04 §3.6) — здесь как в КЛИЕНТЕ:
 *   1) «+shake» — ПЛАВНАЯ тряска FFZ (FfzShake, 100 мс), а не ступенчатая тряска BTTV «s!»;
 *   2) наши коды действуют и на смайлики Twitch (applies_to: any), коды BTTV — только на сторонние.
 *
 * Как устроено:
 *  • Все эффекты смайлика сводятся к ОДНОЙ битовой маске, как в клиенте: повороты и зеркала не
 *    складываются (r! > l! > v! > h!, биты зеркал у BTTV и FFZ общие), движения складываются.
 *  • Движение — ОДНА анимация transform на обёртке (две анимации одного свойства в CSS не
 *    складываются): ключевые кадры для каждого СОЧЕТАНИЯ собираются по таблицам клиента — один
 *    раз на сочетание, в общий <style id="cpx-effects">.
 *  • Цвет — неподвижный filter; у радуги и вечеринки — своя анимация hue-rotate.
 *  • Бегущая дорожка (ffzSlide) — псевдоэлемент с той же картинкой фоном (cpx-fx-strip).
 *  • Место в строке — как effectTargetSize клиента и во время анимации НЕ меняется; запас под
 *    движение — scale() внутри той же анимации (effectSizeFactor). Строка не прыгает.
 *  • .cpx-noanim на любом предке и prefers-reduced-motion выключают движение: остаётся
 *    неподвижный вид (зеркала, повороты, ширина, цвет).
 * ⚠️Обёртка смайлика должна быть цельной строчной коробкой (inline-grid) — иначе transform и
 * заданные ширина/высота не работают.
 *
 * API: CPX.fx.bttv(слово) / .plus(слово) / .ffz(запись модификатора) → имя эффекта | null;
 *   .isPaidFfz(эффект) · .noSpace(эффекты) · .apply(обёртка, эффекты, {w,h}) ·
 *   .attach(обёртка, img, токен, размер, ключ фазы?) · .title(эффект) · .titles(эффекты) ·
 *   .recipe(эффекты, имя, автор PLUS?) → строка «как повторить» · CATALOG.
 */

CPX.fx = (() => {
  CPX.i18n.add({
    ru: {
      "fx.wide": "Шире",
      "fx.grow_x": "Вдвое шире",
      "fx.flip_x": "Зеркально",
      "fx.flip_y": "Вверх ногами",
      "fx.no_space": "Вплотную",
      "fx.cursed": "Проклятый",
      "fx.rotate_left": "Влево",
      "fx.rotate_right": "Вправо",
      "fx.party": "Вечеринка",
      "fx.shake": "Тряска",
      "fx.shake_ffz": "Тряска",
      "fx.spin": "Вращение",
      "fx.rainbow": "Радуга",
      "fx.hyper": "Гипер",
      "fx.jam": "Покачивание",
      "fx.bounce": "Прыжки",
      "fx.slide": "Дорожка",
      "fx.arrive": "Приход",
      "fx.leave": "Уход",
    },
    en: {
      "fx.wide": "Wide",
      "fx.grow_x": "Grow X",
      "fx.flip_x": "Flip",
      "fx.flip_y": "Flip vertical",
      "fx.no_space": "No space",
      "fx.cursed": "Cursed",
      "fx.rotate_left": "Rotate left",
      "fx.rotate_right": "Rotate right",
      "fx.party": "Party",
      "fx.shake": "Shake",
      "fx.shake_ffz": "Shake",
      "fx.spin": "Spin",
      "fx.rainbow": "Rainbow",
      "fx.hyper": "Hyper",
      "fx.jam": "Jam",
      "fx.bounce": "Bounce",
      "fx.slide": "Slide",
      "fx.arrive": "Arrive",
      "fx.leave": "Leave",
    },
  });

  // Биты — как enum EmoteEffect в EmoteEffects.hpp.
  const B = {
    FlipX: 1 << 0,
    FlipY: 1 << 1,
    Cursed: 1 << 2,
    BttvWide: 1 << 3,
    BttvRotateLeft: 1 << 4,
    BttvRotateRight: 1 << 5,
    BttvZeroSpace: 1 << 6,
    BttvParty: 1 << 7,
    BttvShake: 1 << 8,
    FfzGrowX: 1 << 9,
    FfzSpin: 1 << 10,
    FfzRainbow: 1 << 11,
    FfzHyperRed: 1 << 12,
    FfzShake: 1 << 13,
    FfzJam: 1 << 14,
    FfzBounce: 1 << 15,
    FfzSlide: 1 << 16,
    FfzAppear: 1 << 17,
    FfzLeave: 1 << 18,
    FfzNoSpace: 1 << 19,
  };

  // Имя эффекта → биты. «hyper» — два бита сразу (перекраска + плавная тряска), как ffzHyper
  // и «+hyper» в PLUS_EFFECT_CMDS; «shake» — тряска BTTV «s!», «shake_ffz» — плавная FFZ.
  const BITS = {
    wide: B.BttvWide,
    grow_x: B.FfzGrowX,
    flip_x: B.FlipX,
    flip_y: B.FlipY,
    no_space: B.BttvZeroSpace,
    cursed: B.Cursed,
    rotate_left: B.BttvRotateLeft,
    rotate_right: B.BttvRotateRight,
    party: B.BttvParty,
    shake: B.BttvShake,
    spin: B.FfzSpin,
    rainbow: B.FfzRainbow,
    hyper: B.FfzHyperRed | B.FfzShake,
    shake_ffz: B.FfzShake,
    jam: B.FfzJam,
    bounce: B.FfzBounce,
    slide: B.FfzSlide,
    arrive: B.FfzAppear,
    leave: B.FfzLeave,
  };

  // «Живые» эффекты каталога клиента (animated = true, effectsAreAnimated учитывает и FfzShake).
  const ANIMATED = B.BttvParty | B.BttvShake | B.FfzShake | B.FfzSpin | B.FfzRainbow | B.FfzHyperRed | B.FfzJam | B.FfzBounce | B.FfzSlide | B.FfzAppear | B.FfzLeave;
  const MOTION = B.BttvShake | B.FfzShake | B.FfzJam | B.FfzSpin | B.FfzBounce | B.FfzAppear | B.FfzLeave;
  const HUE = B.BttvParty | B.FfzRainbow;
  const COLOR = B.Cursed | B.FfzHyperRed | HUE;

  // ── каталог (форма как у /api/v1/effects) ────────────────────────────────
  // ⚠️ffzW и «+wide» — FfzGrowX клиента (вдвое, с потолком), а не «w!» (жёстко вчетверо).
  const CATALOG = [];
  for (const [code, effect] of [
    ["w!", "wide"],
    ["h!", "flip_x"],
    ["v!", "flip_y"],
    ["z!", "no_space"],
    ["c!", "cursed"],
    ["l!", "rotate_left"],
    ["r!", "rotate_right"],
    ["p!", "party"],
    ["s!", "shake"],
  ])
    CATALOG.push({ code, provider: "bttv", position: "before", applies_to: "third_party", case_sensitive: true, effect });
  for (const [code, effect] of [
    ["ffzW", "grow_x"],
    ["ffzX", "flip_x"],
    ["ffzY", "flip_y"],
    ["ffzCursed", "cursed"],
  ])
    CATALOG.push({ code, provider: "ffz", position: "after", applies_to: "any", effect });
  for (const [code, effect] of [
    ["ffzSpin", "spin"],
    ["ffzRainbow", "rainbow"],
    ["ffzHyper", "hyper"],
    ["ffzJam", "jam"],
    ["ffzBounce", "bounce"],
    ["ffzSlide", "slide"],
    ["ffzArrive", "arrive"],
    ["ffzLeave", "leave"],
  ])
    CATALOG.push({ code, provider: "ffz", position: "after", applies_to: "any", requires: "ffz_supporter", effect });
  for (const [code, effect] of [
    ["+spin", "spin"],
    ["+rainbow", "rainbow"],
    ["+hyper", "hyper"],
    ["+jam", "jam"],
    ["+bounce", "bounce"],
    ["+slide", "slide"],
    ["+arrive", "arrive"],
    ["+leave", "leave"],
    ["+wide", "grow_x"],
    ["+flip", "flip_x"],
    ["+flipv", "flip_y"],
    ["+cursed", "cursed"],
    ["+shake", "shake_ffz"],
  ])
    CATALOG.push({ code, provider: "plus", position: "before", applies_to: "any", case_sensitive: false, requires: "plus_subscriber", effect });

  // Словари без прототипа: иначе bttv("constructor") вернул бы функцию.
  const byBttv = Object.create(null);
  const byFfz = Object.create(null);
  const byPlus = Object.create(null);
  const paid = Object.create(null);
  for (const c of CATALOG) {
    if (c.provider === "bttv") byBttv[c.code] = c.effect;
    else if (c.provider === "ffz") {
      byFfz[c.code] = c.effect;
      if (c.requires) paid[c.effect] = true;
    } else byPlus[c.code] = c.effect;
  }

  // Биты modifier_flags FFZ (EmoteEffects.cpp, FfzFlag) — для модификатора с незнакомым именем.
  // Один смайлик-модификатор — один эффект: берём главный.
  const FFZ_FLAGS = [
    [1 << 12, "hyper"],
    [1 << 7, "spin"],
    [1 << 11, "rainbow"],
    [1 << 15, "jam"],
    [1 << 16, "bounce"],
    [1 << 4, "slide"],
    [1 << 5, "arrive"],
    [1 << 6, "leave"],
    [1 << 13, "shake_ffz"],
    [1 << 3, "grow_x"],
    [1 << 1, "flip_x"],
    [1 << 2, "flip_y"],
    [1 << 14, "cursed"],
    [1 << 17, "no_space"],
  ];

  /** Код BTTV — точно и с учётом регистра (как в самом BTTV). */
  const bttv = (word) => (typeof word === "string" && byBttv[word]) || null;

  /** Наш код «+слово» — регистр не важен. */
  function plus(word) {
    if (typeof word !== "string" || word.charAt(0) !== "+") return null;
    return byPlus[word.toLowerCase()] || null;
  }

  /** Эффект смайлика-модификатора FFZ (запись с полем m = modifier_flags). */
  function ffz(rec) {
    if (!rec || !rec.m) return null;
    if (typeof rec.n === "string" && byFfz[rec.n]) return byFfz[rec.n];
    for (const [bit, name] of FFZ_FLAGS) if (rec.m & bit) return name;
    return null;
  }

  const isPaidFfz = (effect) => !!paid[effect];
  const noSpace = (effects) => !!effects && effects.includes("no_space");

  // ── размеры (EmoteEffects.cpp: effectTargetSize, effectSizeFactor) ────────
  function targetSize(w, h, m) {
    if (m & B.BttvWide) w = h * 4; // BTTV: жёстко 112×28
    else if (m & B.FfzGrowX) w = Math.min(w * 2, (h * 128) / 28); // FFZ: вдвое, с потолком
    if (m & (B.FfzSpin | B.BttvRotateLeft | B.BttvRotateRight)) {
      const s = Math.min(w, h); // площадка поворота — квадрат
      w = s;
      h = s;
    }
    return { w, h };
  }

  function sizeFactor(m) {
    let f = 1;
    if (m & B.FfzSpin) f = Math.min(f, 1 / 1.42);
    if (m & B.FfzBounce) f = Math.min(f, 1 / 1.2);
    if (m & (B.FfzAppear | B.FfzLeave)) f = Math.min(f, 0.62);
    if (m & B.FfzJam) f = Math.min(f, 0.86);
    if (m & (B.BttvShake | B.FfzShake)) f = Math.min(f, 0.88);
    return f;
  }

  // Пропорции содержимого ДО поворота (contentAspect в EmoteEffectRenderer.cpp).
  function contentAspect(aspect, m) {
    if (m & B.BttvWide) return 4;
    if (m & B.FfzGrowX) return Math.min(aspect * 2, 128 / 28);
    return aspect;
  }

  // ── движение: ключевые кадры клиента [доля цикла, значения] ──────────────
  // Тряска BTTV, 500 мс, рывками (translate, px).
  const SHAKE_BTTV = [[0, [0, 1]], [0.1, [2, 0]], [0.2, [1, -2]], [0.3, [-2, 1]], [0.4, [0, -1]], [0.5, [2, 2]], [0.6, [-1, -1]], [0.7, [-2, 2]], [0.8, [2, 1]], [0.9, [-1, -2]], [1, [1, 0]]];
  // Тряска FFZ (ffzHyper, «+shake»), 100 мс, плавно.
  const SHAKE_FFZ = [[0, [1, 1]], [0.1, [-1, -2]], [0.2, [-3, 0]], [0.3, [3, 2]], [0.4, [1, -1]], [0.5, [-1, 2]], [0.6, [-3, 1]], [0.7, [3, 1]], [0.8, [-1, -1]], [0.9, [1, 2]], [1, [1, -2]]];
  // Покачивание, 600 мс (x, y, угол).
  const JAM = [[0, [-2, -2, -6]], [0.1, [-1.5, -2, -8]], [0.2, [1, -1.5, -8]], [0.3, [3, 2.5, -6]], [0.4, [3, 4, -2]], [0.5, [2, 4, 3]], [0.6, [1, 4, 3]], [0.7, [-0.5, 3, 2]], [0.8, [-1.25, 1, 0]], [0.9, [-1.75, -0.5, -2]], [1, [-2, -2, -5]]];
  // Прыжки, 500 мс (масштаб x, y; минус — намеренный переворот).
  const BOUNCE = [[0, [0.8, 1]], [0.1, [0.9, 0.8]], [0.2, [1, 0.4]], [0.25, [1.2, 0.3]], [0.25001, [-1.2, 0.3]], [0.3, [-1, 0.4]], [0.4, [-0.9, 0.8]], [0.5, [-0.8, 1]], [0.6, [-0.9, 0.8]], [0.7, [-1, 0.4]], [0.75, [-1.2, 0.3]], [0.75001, [1.2, 0.3]], [0.8, [1, 0.4]], [0.9, [0.9, 0.8]], [1, [0.8, 1]]];
  // Приход, 3 с (сдвиг x, масштаб, сдвиг y).
  const ARRIVE = [[0, [-18, 0, 0]], [0.1999, [-18, 0, 0]], [0.2, [-18, 0.1, 0]], [0.25, [-16, 0.2, 0.6]], [0.3, [-14, 0.3, -4]], [0.35, [-12, 0.4, 0.6]], [0.4, [-10, 0.5, -4]], [0.45, [-8, 0.6, 2]], [0.5, [-6, 0.7, -3]], [0.55, [-4, 0.8, 2]], [0.6, [-2, 0.9, -3]], [0.65, [0, 1, 0]], [1, [0, 1, 0]]];
  // Уход, 3 с (сдвиг x, масштаб x — со сменой знака, масштаб y, сдвиг y).
  const LEAVE = [[0, [0, 1, 1, 0]], [0.3999, [0, 1, 1, 0]], [0.4, [0, -0.9, 0.9, -3]], [0.45, [-2, -0.8, 0.8, 2]], [0.5, [-4, -0.7, 0.7, -3]], [0.55, [-6, -0.6, 0.6, 2]], [0.6, [-8, -0.5, 0.5, -4]], [0.65, [-10, -0.4, 0.4, 0.6]], [0.7, [-12, -0.3, 0.3, -4]], [0.75, [-14, -0.2, 0.2, 0.6]], [0.8, [-16, -0.1, 0.1, 0]], [0.85, [-18, -0.01, 0, 0]], [1, [-18, 0, 0, 0]]];

  const cyc = (t, ms) => (t % ms) / ms;

  // Выборка по кадрам: ступенчатая (тряска BTTV) держит значение до следующего кадра,
  // плавная — линейно, как браузер при linear.
  function sample(frames, pos, stepped) {
    for (let i = 0; i + 1 < frames.length; i++) {
      const a = frames[i];
      const b = frames[i + 1];
      if (pos >= a[0] && pos < b[0]) {
        if (stepped) return a[1];
        const t = (pos - a[0]) / (b[0] - a[0]);
        return a[1].map((v, k) => v + (b[1][k] - v) * t);
      }
    }
    return frames[frames.length - 1][1];
  }

  // Неподвижная часть: повороты и зеркала не складываются — порядок frameGeometry клиента.
  function staticGeo(m) {
    if (m & B.BttvRotateRight) return { r: 90, sx: 1, sy: 1 };
    if (m & B.BttvRotateLeft) return { r: -90, sx: 1, sy: 1 };
    if (m & B.FlipY) return { r: 0, sx: 1, sy: -1 };
    if (m & B.FlipX) return { r: 0, sx: -1, sy: 1 };
    return { r: 0, sx: 1, sy: 1 };
  }

  // frameGeometry клиента; t — мс от начала цикла. Вращение НЕ сворачивается по 360°:
  // иначе между кадрами браузер крутил бы назад.
  function geometry(m, t) {
    const g = staticGeo(m);
    let x = 0;
    let y = 0;
    let r = g.r;
    let sx = g.sx;
    let sy = g.sy;
    let v;
    if (m & B.BttvShake) {
      v = sample(SHAKE_BTTV, cyc(t, 500), true);
      x += v[0];
      y += v[1];
    }
    if (m & B.FfzShake) {
      v = sample(SHAKE_FFZ, cyc(t, 100));
      x += v[0];
      y += v[1];
    }
    if (m & B.FfzJam) {
      v = sample(JAM, cyc(t, 600));
      x += v[0];
      y += v[1];
      r += v[2];
    }
    if (m & B.FfzSpin) r += (t / 1500) * 360;
    if (m & B.FfzBounce) {
      v = sample(BOUNCE, cyc(t, 500));
      sx *= v[0];
      sy *= v[1];
    }
    let arrive = null;
    let leave = null;
    if (m & B.FfzAppear && m & B.FfzLeave) {
      // Оба сразу: приход в первой половине шестисекундного круга, уход во второй.
      const p = cyc(t, 6000);
      if (p < 0.5) arrive = sample(ARRIVE, p * 2);
      else leave = sample(LEAVE, (p - 0.5) * 2);
    } else if (m & B.FfzAppear) arrive = sample(ARRIVE, cyc(t, 3000));
    else if (m & B.FfzLeave) leave = sample(LEAVE, cyc(t, 3000));
    if (arrive) {
      x += arrive[0];
      sx *= arrive[1];
      sy *= arrive[1];
      y += arrive[2];
    }
    if (leave) {
      x += leave[0];
      sx *= leave[1];
      sy *= leave[2];
      y += leave[3];
    }
    return { x, y, r, sx, sy };
  }

  // Дорожки движения: [период мс, доли кадров, ступенчато].
  function tracks(m) {
    const out = [];
    const at = (frames) => frames.map((f) => f[0]);
    if (m & B.BttvShake) out.push([500, at(SHAKE_BTTV), true]);
    if (m & B.FfzShake) out.push([100, at(SHAKE_FFZ)]);
    if (m & B.FfzJam) out.push([600, at(JAM)]);
    if (m & B.FfzSpin) out.push([1500, [0, 1]]);
    if (m & B.FfzBounce) out.push([500, at(BOUNCE)]);
    if (m & B.FfzAppear && m & B.FfzLeave) {
      out.push([6000, at(ARRIVE).map((f) => f / 2).concat(at(LEAVE).map((f) => 0.5 + f / 2))]);
    } else if (m & B.FfzAppear) out.push([3000, at(ARRIVE)]);
    else if (m & B.FfzLeave) out.push([3000, at(LEAVE)]);
    return out;
  }

  const gcd = (a, b) => {
    while (b) [a, b] = [b, a % b];
    return a;
  };
  const lcm = (a, b) => (a / gcd(a, b)) * b;
  const num = (x) => String(Math.round(x * 1000) / 1000);
  const pct = (x) => String(Math.round(x * 1e7) / 1e5) + "%";

  // ── общий лист стилей для собранных ключевых кадров ──────────────────────
  let sheet = null;
  const made = Object.create(null); // имя кадров → период, мс

  function addRule(text) {
    if (!sheet) {
      const st = document.createElement("style");
      st.id = "cpx-effects";
      (document.head || document.documentElement).appendChild(st);
      sheet = st.sheet;
    }
    try {
      sheet.insertRule(text, sheet.cssRules.length);
    } catch (e) {
      CPX.report("fx:rule", e);
    }
  }

  // Кадры движения для сочетания: m — маска, k — px на точку клиента (высота смайлика / 28:
  // размах у клиента задан для смайлика в 28 px). Запас под движение — scale() в каждом кадре.
  function motionKeyframes(m, k) {
    k = Math.round(k * 100) / 100 || 1;
    const mm = m & (MOTION | B.FlipX | B.FlipY | B.BttvRotateLeft | B.BttvRotateRight);
    const name = "cpx-fxm-" + mm.toString(36) + "-" + Math.round(k * 100);
    if (made[name]) return [name, made[name]];
    const tr = tracks(m);
    let P = 1;
    for (const x of tr) P = lcm(P, x[0]);
    const eps = P * 1e-5; // ступенька: за миг до кадра держим прежнее
    const times = [0, P];
    for (const x of tr) {
      for (let n = 0; n < P / x[0]; n++) {
        for (const f of x[1]) {
          const t = Math.round((n + f) * x[0] * 1000) / 1000;
          times.push(t);
          if (x[2] && t > 0) times.push(t - eps);
        }
      }
    }
    times.sort((a, b) => a - b);
    const f = sizeFactor(m);
    const seen = Object.create(null);
    const out = [];
    for (const t of times) {
      const key = pct(t / P);
      if (seen[key]) continue;
      seen[key] = true;
      const g = geometry(m, t);
      // Одинаковый набор функций во всех кадрах — браузер плавно ведёт каждое число отдельно.
      out.push(key + "{transform:translate(" + num(g.x * k) + "px," + num(g.y * k) + "px) rotate(" + num(g.r) + "deg) scale(" + num(g.sx * f) + "," + num(g.sy * f) + ")}");
    }
    addRule("@keyframes " + name + "{" + out.join("") + "}");
    made[name] = P;
    return [name, P];
  }

  // Цепочка фильтров — порядок как в colorChainFor клиента.
  function filterOf(m, party, rainbow) {
    const s = [];
    if (m & B.Cursed) s.push("grayscale(1) brightness(0.7) contrast(2.5)");
    if (m & B.FfzHyperRed) s.push("brightness(0.2) sepia(1) brightness(2.2) contrast(3) saturate(8)");
    if (m & B.BttvParty) s.push("sepia(0.5) hue-rotate(" + num(party) + "deg) saturate(2.5)");
    if (m & B.FfzRainbow) s.push("hue-rotate(" + num(rainbow) + "deg)");
    return s.join(" ");
  }

  // Кадры цвета: меняется только hue-rotate (вечеринка — круг за 1,5 с, радуга — за 2 с).
  function hueKeyframes(m) {
    const mm = m & COLOR;
    const name = "cpx-fxc-" + mm.toString(36);
    if (made[name]) return [name, made[name]];
    const P = lcm(m & B.BttvParty ? 1500 : 1, m & B.FfzRainbow ? 2000 : 1);
    addRule("@keyframes " + name + "{0%{filter:" + filterOf(m, 0, 0) + "}100%{filter:" + filterOf(m, (360 * P) / 1500, (360 * P) / 2000) + "}}");
    made[name] = P;
    return [name, P];
  }

  // Адрес картинки в url("…") — только прошедший проверку (без кавычек/скобок/пробелов).
  function cssUrl(u) {
    const ok = CPX.safe.imgUrl(u);
    return ok ? 'url("' + ok + '")' : "";
  }

  /** Наложенный слой стопки — в той же пропорции, что основа (размер слоя — его атрибуты или сама картинка). */
  function scaleLayer(z, kx, ky) {
    const go = () => {
      const w = Number(z.getAttribute("width")) || z.naturalWidth;
      const h = Number(z.getAttribute("height")) || z.naturalHeight;
      if (!w || !h) return;
      z.style.width = num(w * kx) + "px";
      z.style.height = num(h * ky) + "px";
    };
    if ((Number(z.getAttribute("width")) && Number(z.getAttribute("height"))) || (z.complete && z.naturalWidth)) return go();
    z.addEventListener("load", go, { once: true });
  }

  /* Навесить эффекты на обёртку смайлика.
   * wrap — span.cpx-em с img.cpx-em-img (и, возможно, наложенными img.cpx-em-zw);
   * effects — имена эффектов по порядку появления; box — {w, h, seed?} размер смайлика на экране
   * (px) и число для фазы (см. ниже). */
  function apply(wrap, effects, box) {
    if (!wrap || !effects || !effects.length) return;
    let m = 0;
    const cls = ["cpx-fx"];
    for (const e of effects) {
      const bit = BITS[e];
      if (!bit) continue;
      m |= bit;
      if (!cls.includes("cpx-fx-" + e)) cls.push("cpx-fx-" + e);
    }
    if (!m) return;
    const st = wrap.style;
    const w0 = box ? +box.w : 0;
    const h0 = box ? +box.h : 0;
    const sized = w0 > 0 && h0 > 0;
    const imgs = [...wrap.children].filter((c) => c.tagName === "IMG" && !c.classList.contains("cpx-em-zw"));

    // Место в строке — один раз и навсегда (движение его не трогает). Картинка заполняет место
    // целиком: растяжение и квадрат — с искажением, как у клиента.
    if (sized) {
      const size = targetSize(w0, h0, m);
      st.width = num(size.w) + "px";
      st.height = num(size.h) + "px";
      for (const img of imgs) {
        img.style.width = num(size.w) + "px";
        img.style.height = num(size.h) + "px";
      }
      // Стопка: эффект основы — на ВСЮ стопку (клиент 5.4.0: «w! EZ cvMask» — маска растягивается вместе).
      // Поворот, движение и цвет и так общие (они на обёртке), а размер — у каждой картинки свой: наложенные
      // растягиваем в той же пропорции, что основу.
      const kx = size.w / w0;
      const ky = size.h / h0;
      if (Math.abs(kx - 1) > 0.001 || Math.abs(ky - 1) > 0.001)
        for (const z of wrap.children) if (z.tagName === "IMG" && z.classList.contains("cpx-em-zw")) scaleLayer(z, kx, ky);
    }

    // Неподвижный вид: поворот или зеркало.
    const g = staticGeo(m);
    let still = "";
    if (g.r) {
      let cx = 1;
      let cy = 1;
      if (sized && !(m & ANIMATED)) {
        // Точный путь клиента (drawExact): повёрнутая картинка вписывается в квадрат С
        // СОХРАНЕНИЕМ пропорций, а не сплющивается в него.
        const a = contentAspect(w0 / h0, m);
        if (a >= 1) cy = 1 / a;
        else cx = a;
      }
      still = "rotate(" + g.r + "deg) scale(" + num(cx) + "," + num(cy) + ")";
    } else if (g.sx < 0 || g.sy < 0) {
      still = "scale(" + g.sx + "," + g.sy + ")";
    }

    const names = [];
    const durs = []; // периоды анимаций, мс
    if (m & MOTION) {
      const kf = motionKeyframes(m, sized ? h0 / 28 : 1);
      names.push(kf[0]);
      durs.push(kf[1]);
    }
    if (still || m & MOTION) {
      cls.push("cpx-fx-tf");
      st.setProperty("--cpx-fx-still", still || "none");
    }
    if (m & COLOR) {
      cls.push("cpx-fx-color");
      st.setProperty("--cpx-fx-filter", filterOf(m, 0, 0));
      if (m & HUE) {
        const hk = hueKeyframes(m);
        names.push(hk[0]);
        durs.push(hk[1]);
      }
    }
    if (m & B.FfzSlide && imgs.length) {
      const src = cssUrl(imgs[0].currentSrc || imgs[0].src);
      if (src) {
        st.setProperty("--cpx-fx-src", src);
        cls.push("cpx-fx-strip");
      }
    }
    if (names.length) {
      cls.push("cpx-fx-anim");
      st.setProperty("--cpx-fx-an", names.join(","));
      st.setProperty("--cpx-fx-ad", durs.map((d) => d + "ms").join(","));
    }
    if (m & (MOTION | HUE | B.FfzSlide)) {
      // Фаза — как у клиента (phaseOffset): своя у каждого смайлика (одинаковые эффекты не ходят
      // строем), но СТАБИЛЬНАЯ: считается от часов страницы, и перерисованная строка продолжает
      // движение с того же места, а не прыгает. seed — от сообщения и смайлика.
      const base = performance.now() + (box && box.seed != null ? box.seed % 3000 : Math.floor(Math.random() * 3000));
      if (durs.length) st.setProperty("--cpx-fx-delay", durs.map((d) => -Math.round(base % d) + "ms").join(","));
      if (m & B.FfzSlide) st.setProperty("--cpx-fx-sdelay", -Math.round(base % 500) + "ms");
    }
    for (const c of cls) wrap.classList.add(c);
  }

  // Число для фазы из строки (id сообщения + имя смайлика).
  function seedOf(key) {
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (Math.imul(h, 31) + key.charCodeAt(i)) | 0;
    return h >>> 0;
  }

  /* Навесить эффекты токена на обёртку. Место считается по НАСТОЯЩИМ пропорциям: у BTTV
   * размера в API нет — ждём картинку (эффект появляется вместе с ней).
   * key — строка для стабильной фазы (id сообщения + смайлик); нет — фаза случайная. */
  function attach(wrap, img, tok, size, key) {
    const seed = key ? seedOf(String(key)) : null;
    const go = (w, h) => {
      apply(wrap, tok.fx, { w, h, seed });
      // С наложенным слоем ширину ведёт сама связка (самый широкий слой), иначе широкий
      // наложенный вылез бы на соседей. Бегущей дорожке нужна ровно ширина смайлика.
      if (wrap.classList.contains("cpx-em-stack") && !wrap.classList.contains("cpx-fx-strip")) wrap.style.width = "";
    };
    if (size && size.w > 0 && size.h > 0) return go(size.w, size.h);
    let done = false;
    const once = () => {
      if (done) return;
      done = true;
      const nh = img.naturalHeight || 0;
      const nw = img.naturalWidth || 0;
      const h = (size && size.h) || nh;
      const aspect = nw > 0 && nh > 0 ? nw / nh : 1;
      CPX.safely("fx:attach", () => go(h * aspect, h));
    };
    if (img.complete && img.naturalWidth) return once();
    img.addEventListener("load", once, { once: true });
    img.addEventListener("error", once, { once: true });
  }

  const title = (effect) => CPX.t("fx." + effect);

  // ── подсказка: названия и «как повторить» — по МАСКЕ, как клиент ─────────
  // Каталог клиента по порядку (emoteEffectCatalog): [код, сервис, бит, наше имя, платный].
  const ROWS = [
    ["w!", "bttv", B.BttvWide, "wide"],
    ["h!", "bttv", B.FlipX, "flip_x"],
    ["v!", "bttv", B.FlipY, "flip_y"],
    ["z!", "bttv", B.BttvZeroSpace, "no_space"],
    ["c!", "bttv", B.Cursed, "cursed"],
    ["l!", "bttv", B.BttvRotateLeft, "rotate_left"],
    ["r!", "bttv", B.BttvRotateRight, "rotate_right"],
    ["p!", "bttv", B.BttvParty, "party"],
    ["s!", "bttv", B.BttvShake, "shake"],
    ["ffzW", "ffz", B.FfzGrowX, "grow_x"],
    ["ffzX", "ffz", B.FlipX, "flip_x"],
    ["ffzY", "ffz", B.FlipY, "flip_y"],
    ["ffzCursed", "ffz", B.Cursed, "cursed"],
    ["ffzSpin", "ffz", B.FfzSpin, "spin", 1],
    ["ffzRainbow", "ffz", B.FfzRainbow, "rainbow", 1],
    ["ffzHyper", "ffz", B.FfzHyperRed, "hyper", 1],
    ["ffzJam", "ffz", B.FfzJam, "jam", 1],
    ["ffzBounce", "ffz", B.FfzBounce, "bounce", 1],
    ["ffzSlide", "ffz", B.FfzSlide, "slide", 1],
    ["ffzArrive", "ffz", B.FfzAppear, "arrive", 1],
    ["ffzLeave", "ffz", B.FfzLeave, "leave", 1],
  ];
  // Наш код эффекта (rowEffect в PLUS_EFFECT_CMDS клиента).
  const PLUS_CODE = new Map([
    [B.FfzGrowX, "+wide"],
    [B.FlipX, "+flip"],
    [B.FlipY, "+flipv"],
    [B.Cursed, "+cursed"],
    [B.FfzSpin, "+spin"],
    [B.FfzRainbow, "+rainbow"],
    [B.FfzHyperRed, "+hyper"],
    [B.FfzShake, "+shake"],
    [B.FfzJam, "+jam"],
    [B.FfzBounce, "+bounce"],
    [B.FfzSlide, "+slide"],
    [B.FfzAppear, "+arrive"],
    [B.FfzLeave, "+leave"],
  ]);
  // Платные у клиента: подписочные строки каталога + плавная тряска.
  const PAID = B.FfzShake | B.FfzSpin | B.FfzRainbow | B.FfzHyperRed | B.FfzJam | B.FfzBounce | B.FfzSlide | B.FfzAppear | B.FfzLeave;
  const maskOf = (effects) => (effects || []).reduce((m, e) => m | (BITS[e] || 0), 0);
  const loneShake = (m) => !!(m & B.FfzShake) && !(m & B.FfzHyperRed);

  /** Названия эффектов без повторов (emoteEffectTitles клиента). */
  function titles(effects) {
    const m = maskOf(effects);
    const out = [];
    const put = (t) => out.includes(t) || out.push(t);
    for (const r of ROWS) if (m & r[2]) put(title(r[3]));
    if (loneShake(m)) put(title("shake_ffz"));
    return out;
  }

  // Обычная запись (emoteEffectChatText): коды BTTV перед смайликом, FFZ — после; эффект,
  // который уже записан кодом BTTV, кодом FFZ не повторяется.
  function chatText(m, name) {
    const pre = [];
    const post = [];
    for (const [code, src, bit] of ROWS) {
      if (!(m & bit) || pre.includes(code) || post.includes(code)) continue;
      if (src === "ffz" && ROWS.some((o) => o[1] === "bttv" && o[2] === bit && pre.includes(o[0]))) continue;
      (src === "bttv" ? pre : post).push(code);
    }
    return pre.concat(name, post).join(" ");
  }

  /** «Как повторить» (ChannelView.cpp: emoteEffectChatText / PlusService::plusEffectChatText):
   * автор — наш подписчик без поддержки FFZ → платные эффекты нашими «+кодами» перед смайликом,
   * остальное обычной записью («w! +spin смайлик»); иначе — обычная запись. */
  function recipe(effects, name, plusAuthor) {
    const m = maskOf(effects);
    if (!m) return "";
    const paidM = plusAuthor ? m & PAID : 0;
    if (!paidM) return chatText(m, name);
    const parts = [];
    for (const r of ROWS) if (r[4] && paidM & r[2] && !parts.includes(PLUS_CODE.get(r[2]))) parts.push(PLUS_CODE.get(r[2]));
    if (loneShake(m)) parts.push(PLUS_CODE.get(B.FfzShake));
    const std = m & ~paidM;
    return parts.join(" ") + " " + (std ? chatText(std, name) : name);
  }

  return { CATALOG, B, BITS, bttv, plus, ffz, isPaidFfz, noSpace, apply, attach, title, titles, recipe, targetSize };
})();

// ── src/main/56_emote_transform.js ──
/* Мир страницы: разбор кодов эффектов и смайликов нулевой ширины в токенах строки.
 *
 * Резолвер 5 (раньше всех смайликов — как клиент: у BTTV «w!» и т.п. есть и как смайлики,
 * но перед другим смайликом это эффект) превращает код в ТЕКСТОВЫЙ токен с пометкой:
 *   { kind:"text", text:"w!", cpxFx:{ src:"bttv"|"plus"|"ffz", effect, paid } }
 * Если пометку никто не заберёт, список нарисует её как обычный текст — ничего не пропадёт.
 *
 * Преобразование 10 — правила клиента (MessageBuilder.cpp:3859-4184, research/04 §3.2):
 *  1) коды BTTV и наши «+коды» копятся до СЛЕДУЮЩЕГО смайлика (между ними — только пробелы);
 *     слово/упоминание/ссылка обрывают цепочку — коды BTTV выкладываются своими картинками
 *     (как у BTTV), наши «+коды» — текстом, как набраны;
 *  2) коды BTTV на смайлики Twitch НЕ действуют (выкладываются значками), наши — действуют;
 *  3) эффект FFZ — слово ПОСЛЕ смайлика, ложится на непосредственно предыдущий смайлик (и на
 *     Twitch); нет смайлика слева — остаётся текстом; после стопки с наложенными — на ВСЮ стопку
 *     (клиент 5.4.0: «EZ cvMask ffzX» — маска отражается вместе с основой; раньше не доставалось);
 *  4) платные эффекты FFZ — только если автор поддержал FFZ ИЛИ подписчик PLUS;
 *     наши «+коды» — только у подписчиков PLUS (иначе резолвер их не помечает);
 *  5) «смайлик +spin» в самом конце — код достаётся смайлику слева (стопке — целиком, 5.4.0);
 *  6) смайлик нулевой ширины ложится на предыдущий смайлик (стопка), если перед ним нет
 *     накопленных кодов; иначе рисуется отдельно и получает коды («EZ w! cvMask» — маска отдельно со своим
 *     эффектом). Эффект основы стопки («w! EZ cvMask») действует на всю стопку: обёртка с наложенными —
 *     одна, растяжение наложенных — 55_effects;
 *  7) «z!» — смайлик вплотную к предыдущему (убираем пробел перед ним).
 * У смайлика с эффектами: tok.fx — имена эффектов, tok.fxWords — исходные слова,
 * tok.fxRecipePlus — «рецепт» в подсказке писать нашими +кодами (автор PLUS без поддержки FFZ).
 * Пробелы: если список кладёт их отдельными текстовыми токенами — учитываем; сообщение без
 * кодов и без смайликов нулевой ширины проходит насквозь без единой лишней работы.
 */

(() => {
  const effectsOn = () => CPX.settings.get("emotes.effects") !== false;
  const chId = (ctx) => (ctx && ctx.channelId) || (CPX.chat.state && CPX.chat.state.channelId) || "";

  CPX.tokens.addResolver(5, (word, ctx) => {
    if (!effectsOn() || !word) return null;
    let e = CPX.fx.bttv(word);
    if (e) return CPX.settings.get("emotes.bttv") !== false ? { kind: "text", text: word, cpxFx: { src: "bttv", effect: e } } : null;
    e = CPX.fx.plus(word);
    if (e) return CPX.cosm.isPlus(ctx && ctx.user) ? { kind: "text", text: word, cpxFx: { src: "plus", effect: e } } : null;
    const mod = CPX.emotes.ffzMod(word, chId(ctx));
    if (mod) {
      e = CPX.fx.ffz(mod);
      if (e) return { kind: "text", text: word, cpxFx: { src: "ffz", effect: e, paid: CPX.fx.isPaidFfz(e) } };
    }
    return null;
  });

  const isWs = (t) => t && t.kind === "text" && !t.cpxFx && /^\s*$/.test(t.text || "");
  const asText = (t) => ({ kind: "text", text: t.text });

  function transform(tokens, ctx) {
    if (!Array.isArray(tokens)) return tokens;
    let need = false;
    for (const t of tokens) {
      if (t && (t.cpxFx || (t.kind === "emote" && t.zeroWidth))) {
        need = true;
        break;
      }
    }
    if (!need) return tokens;

    const effects = effectsOn();
    const user = ctx && ctx.user;
    const plusAuthor = CPX.cosm.isPlus(user);
    const ffzPaidAuthor = !!(user && CPX.emotes.ffzPaid(user.login));
    const out = [];
    let held = []; // накопленные коды «перед» (и пробелы между ними)

    // Код BTTV без смайлика после — своей картинкой (у BTTV каждый код — смайлик), иначе текстом.
    function codeOut(t) {
      if (t.cpxFx.src === "bttv") {
        const rec = CPX.emotes.bttvCode(t.text);
        if (rec) return CPX.emotes.token(rec, "global");
      }
      return asText(t);
    }
    function flush() {
      for (const t of held) out.push(t.cpxFx ? codeOut(t) : t);
      held = [];
    }
    // Последний смайлик в выводе, если после него только пробелы.
    function lastEmote() {
      for (let i = out.length - 1; i >= 0; i--) {
        if (out[i].kind === "emote") return i;
        if (!isWs(out[i])) return -1;
      }
      return -1;
    }
    function trimWs() {
      while (out.length && isWs(out[out.length - 1])) out.pop();
    }
    // Убрать из накопленного наши «+коды» (они достались смайлику) вместе с пробелом за каждым.
    function dropPlus() {
      const kept = [];
      for (let i = 0; i < held.length; i++) {
        const x = held[i];
        if (x.cpxFx && x.cpxFx.src === "plus") {
          if (isWs(held[i + 1])) i++;
          continue;
        }
        kept.push(x);
      }
      held = kept;
    }
    function addFx(tok, list, after) {
      tok.fx = (tok.fx || []).concat(list.map((c) => c.cpxFx.effect));
      tok.fxWords = (tok.fxWords || []).concat(list.map((c) => ({ w: c.text, after: !!after })));
      // Строка «как повторить» в подсказке пишется нашими +кодами, если автор — наш подписчик
      // без поддержки FFZ (клиент: ChannelView.cpp, authorPlus).
      tok.fxRecipePlus = plusAuthor && !ffzPaidAuthor;
    }

    for (const t of tokens) {
      if (!t) continue;
      if (isWs(t)) {
        if (held.length) held.push(t);
        else out.push(t);
        continue;
      }
      const fx = t.cpxFx;
      if (fx) {
        if (!effects) {
          flush();
          out.push(codeOut(t));
          continue;
        }
        if (fx.src === "ffz") {
          const i = lastEmote();
          const target = i >= 0 ? out[i] : null;
          if (target && (!fx.paid || ffzPaidAuthor || plusAuthor)) {
            if (!held.length) out.length = i + 1; // пробелы между смайликом и словом-эффектом
            addFx(target, [t], true);
            continue;
          }
          flush();
          out.push(asText(t)); // ⚠️эффект без цели остаётся словом, а не пропадает
          continue;
        }
        held.push(t);
        continue;
      }
      if (t.kind === "emote") {
        const codes = held.filter((x) => x.cpxFx);
        if (codes.length) {
          if (t.provider === "twitch") {
            // Наши коды ложатся и на Twitch; коды BTTV — нет: они выкладываются значками.
            const plusCodes = codes.filter((x) => x.cpxFx.src === "plus");
            dropPlus();
            flush();
            if (plusCodes.length) addFx(t, plusCodes, false);
            out.push(t);
            continue;
          }
          held = [];
          addFx(t, codes, false);
          if (CPX.fx.noSpace(t.fx)) trimWs();
          out.push(t);
          continue;
        }
        flush();
        if (t.zeroWidth) {
          const i = lastEmote();
          if (i >= 0) {
            out.length = i + 1;
            const base = out[i];
            (base.zw = base.zw || []).push(t);
            continue;
          }
        }
        out.push(t);
        continue;
      }
      // Слово, упоминание, ссылка… — цепочка кодов оборвалась.
      flush();
      out.push(t);
    }

    // «смайлик +spin» в самом конце — наш код достаётся смайлику слева.
    if (held.length) {
      const plusCodes = held.filter((x) => x.cpxFx && x.cpxFx.src === "plus");
      const i = plusCodes.length ? lastEmote() : -1;
      if (i >= 0) {
        addFx(out[i], plusCodes, true);
        dropPlus();
      }
    }
    flush();
    return out;
  }

  CPX.tokens.addTransform(10, transform);

  // Для проверок и соседей (например, превью в поле ввода).
  CPX.emoteTransform = transform;
})();

// ── src/main/57_emote_render.js ──
/* Мир страницы: рисовальщик токена "emote" (контракт 35_pipeline) — для ВСЕХ смайликов строки:
 * 7TV, BTTV, FFZ и родных Twitch (их токены строит список чата из частей сообщения Twitch).
 *
 *   <span class="cpx-em [cpx-em-stack]">
 *     <img class="cpx-em-img" src=1x srcset="1x 1x, 2x 2x, 4x 4x" width height alt=имя>
 *     <img class="cpx-em-img cpx-em-zw" …>   ← смайлики нулевой ширины поверх (tok.zw)
 *   </span>
 *
 *  • Размер 1x известен заранее (из API) — ставим width/height: строка не прыгает, когда
 *    картинка догрузится, и прокрутка не «уезжает». У BTTV размера в API нет — высота 28
 *    (все смайлики BTTV в 1x такой высоты), ширина — по картинке.
 *  • Анимированные — как есть (webp/gif сами).
 *  • Картинка не пришла — ещё раз через 5 с, не пришла и тогда — имя смайлика текстом (а не
 *    пустое место); у наложенного слоя — просто убрать слой. Учёт неудач по адресу и сайту — CPX.imgGate (52): адрес,
 *    который недавно не грузился, новые строки сразу показывают текстом и не просят (поток запросов, 18.11).
 *  • Картинки 7TV грузит CPX.imgRoute (64_mirror_img): напрямую или через зеркало PLUS, с
 *    очередью и сторожем 10 с; итог «не пришла совсем» — тот же (текст / убрать слой).
 *  • Эффекты (tok.fx, 56_emote_transform) навешивает CPX.fx (55_effects) на обёртку.
 *  • Для подсказки токен лежит на обёртке: wrap.__cpxEmote (58_emote_tooltip).
 */

CPX.emoteRender = (() => {
  const TW_BASE = "https://static-cdn.jtvnw.net/emoticons/v2/";

  function theme() {
    const r = document.documentElement;
    return r && r.classList.contains("tw-root--theme-light") ? "light" : "dark";
  }

  /** Адреса смайлика Twitch по id (если список не дал своих). */
  function twitchUrls(id) {
    const base = TW_BASE + encodeURIComponent(String(id)) + "/default/" + theme() + "/";
    return { 1: base + "1.0", 2: base + "2.0", 4: base + "3.0" };
  }

  function urlsOf(tok) {
    let u = tok.urls;
    if ((!u || !u[1]) && tok.provider === "twitch" && tok.id) u = tok.urls = twitchUrls(tok.id);
    return u || {};
  }

  /** Размер показа (px): известный 1x; Twitch — 28×28 (гигантский — 112×112); BTTV без
   * размера — высота 28. */
  function sizeOf(tok) {
    if (tok.giant) return { w: 112, h: 112 };
    if (tok.w > 0 && tok.h > 0) return { w: tok.w, h: tok.h };
    if (tok.provider === "twitch" || tok.provider === "kick") return { w: 28, h: 28 };
    if (tok.provider === "bttv") return { w: 0, h: 28 };
    return { w: 0, h: 0 };
  }

  /** Картинка так и не пришла: у наложенного слоя — убрать слой, у основной — имя текстом. */
  function giveUp(im) {
    const wrap = im.parentNode;
    if (!wrap) return;
    if (im.classList.contains("cpx-em-zw")) {
      im.remove();
      return;
    }
    // Основной смайлик так и не пришёл — вместо пустого места его имя текстом.
    if (wrap.parentNode) wrap.parentNode.replaceChild(document.createTextNode(im.alt || ""), wrap);
  }

  function onError(e) {
    const im = e.currentTarget;
    const one = im.dataset.cpxSrc || im.src;
    const G = CPX.imgGate;
    if (G) G.fail(one);
    if (!im.dataset.cpxRetry) {
      // Разовый сбой по дороге — повтор через 5 с другим адресом (кэш ошибки не мешает), если учёт неудач пускает.
      im.dataset.cpxRetry = "1";
      setTimeout(() => {
        if (!im.isConnected && !im.parentNode) return;
        if (G && !G.allow(one)) {
          im.removeEventListener("error", onError);
          giveUp(im);
          return;
        }
        im.removeAttribute("srcset");
        im.src = one + (one.indexOf("?") < 0 ? "?" : "&") + "cpxr=1";
      }, 5000);
      return;
    }
    im.removeEventListener("error", onError);
    giveUp(im);
  }

  // Самая крупная картинка у Twitch и BTTV (и у старых смайликов 7TV) — 3x, а не 4x.
  const density = (url) => (/(?:\/3\.0|\/3x(?:_static)?\.webp)$/.test(url) ? " 3x" : " 4x");

  function img(tok, zw) {
    const u = urlsOf(tok);
    // Исходные адреса сервиса; маршрут 7TV (прямо/зеркало PLUS) решает CPX.imgRoute — адрес
    // зеркала он строит сам из уже проверенного адреса cdn.7tv.app.
    const r = (x) => CPX.safe.imgUrl(x);
    // Гигантский (награда Twitch «увеличить смайлик») — сразу самая крупная картинка.
    const one = r(tok.giant ? u[4] || u[1] : u[1]);
    if (!one) return null;
    // Недавно не грузилась — не просить снова (основной — имя текстом, слой — без слоя).
    const G = CPX.imgGate;
    const queued = !!(CPX.imgRoute && CPX.imgRoute.handles && CPX.imgRoute.handles(one)); // паузу сайта проверит очередь
    if (G && !G.allow(one, { queued })) return null;
    const im = document.createElement("img");
    im.className = zw ? "cpx-em-img cpx-em-zw" : "cpx-em-img";
    im.alt = tok.name || "";
    im.decoding = "async";
    im.draggable = false;
    im.dataset.cpxSrc = one;
    const two = r(u[2]);
    const four = r(u[4]);
    const set = tok.giant ? "" : one + " 1x" + (two && two !== one ? ", " + two + " 2x" : "") + (four && four !== two ? ", " + four + density(four) : "");
    const routed =
      CPX.imgRoute &&
      CPX.imgRoute.load(im, one, set, () => giveUp(im)); // в счёт паузы сайта ошибки ставит сама очередь (64, К4)
    if (G) G.watch(im, one, { errors: false }); // удача — в учёт; неудачи считают onError / onDead
    if (!routed) {
      if (set) im.srcset = set;
      im.src = one;
      im.addEventListener("error", onError);
    }
    // Смайлик Twitch — картинкой своего размера (Kappa 25×28), как у самого Twitch; коробку 28×28
    // даёт стиль .cpx-em-tw. Размер для эффектов — по-прежнему sizeOf.
    const s = (tok.provider === "twitch" || tok.provider === "kick") && !tok.w ? {} : sizeOf(tok);
    if (s.w) im.width = s.w;
    if (s.h) im.height = s.h;
    return im;
  }

  function render(tok, ctx) {
    const wrap = document.createElement("span");
    wrap.className = "cpx-em";
    const main = img(tok, false);
    if (!main) return document.createTextNode(tok.name || "");
    wrap.appendChild(main);
    if (Array.isArray(tok.zw) && tok.zw.length) {
      wrap.classList.add("cpx-em-stack");
      for (const z of tok.zw.slice(0, 8)) {
        const zi = img(z, true);
        if (zi) wrap.appendChild(zi);
      }
    }
    if (Array.isArray(tok.fx) && tok.fx.length) {
      // Ключ фазы эффекта — сообщение и смайлик: перерисованная строка не сбивает движение.
      const key = ctx && ctx.id ? ctx.id + "|" + (tok.name || "") + "|" + tok.fx.join(",") : "";
      CPX.safely("emote:fx", () => CPX.fx.attach(wrap, main, tok, sizeOf(tok), key));
    }
    // Те же метки, что у встроенного рисовальщика списка (щелчок по смайлику Twitch — его карточка).
    if (tok.provider === "twitch" && tok.id) {
      wrap.classList.add("cpx-em-tw");
      wrap.dataset.cpxEmote = String(tok.id);
      wrap.dataset.cpxEmoteName = tok.name || "";
    }
    if (tok.giant) wrap.classList.add("cpx-em-giant");
    // Смайлик Kick (мир Kick, 15.11) — как у самого Kick: квадратная коробка, картинка вписана.
    if (tok.provider === "kick") wrap.classList.add("cpx-em-kick");
    wrap.__cpxEmote = tok;
    return wrap;
  }

  CPX.tokens.addRenderer("emote", render);

  return { render, twitchUrls, sizeOf };
})();

// ── src/main/58_emote_tooltip.js ──
/* Мир страницы: подсказка при наведении на наши смайлики и бейджи — лёгкий элемент .cpx-own
 * в body. Вид — «Мозаика», как у подсказок наших окон (тон tip, форма k1, хвостик к якорю, появление
 * маской клеток только при первом показе — CPX.mz; styles/page-58-tooltip.css).
 *
 * Смайлик: картинка крупно (4x; стопка — все слои друг на друге), имя, «Смайлик 7TV канала»,
 * «Автор: …», «Другое имя: …» (переименованный 7TV), эффекты через «·» (если их ≤3) и строка
 * для повтора моноширинным (как в клиенте, ChannelView.cpp:3509-3535: у автора-подписчика PLUS
 * без поддержки FFZ платные эффекты пишутся нашими «+кодами»).
 *
 * API: CPX.tip.register(селектор, fn(элемент) → {img, w, h, layers:[адреса], title, lines:[…],
 *   fx (строка эффектов — лавандой), mono} | null) — другие наши модули (бейджи) подключают свои
 *   подсказки так же.
 * Один обработчик движения мыши на документ (делегирование), показ с задержкой 80 мс, прячется при
 * уходе мыши, прокрутке и когда элемент пропал. Показ — только от движения мыши: смайлик, сам подъехавший
 * под неподвижный курсор в едущем чате, подсказку не вызывает (12.10, см. onMove).
 *
 * ОКНО ПО ЩЕЛЧКУ (владелец 02.11): левый щелчок по смайлику 7TV, BTTV или FFZ — такое же окно, но неподвижное, с
 * кнопкой «Открыть на 7TV» (BetterTTV, FFZ) — страница смайлика в новой вкладке. Смайлик со слоями нулевой ширины
 * (основной + один или несколько поверх) — общая картинка крупно и строка на каждый смайлик стопки (повторы — один
 * раз): картинка, имя, откуда · автор · другое имя, своя кнопка-ссылка; у смайлика Twitch в стопке кнопки нет.
 * Только смайлики Twitch — щелчок не наш: родная карточка Twitch (45_list_actions). Закрывается повторным щелчком
 * по смайлику, нажатием мимо, Esc, уходом со страницы и когда смайлик уехал из виду или пропал (окно едет за ним).
 * Нажатие с протяжкой мыши (выделение текста) окно не открывает.
 */

CPX.tip = (() => {
  CPX.i18n.add({
    ru: {
      "tip.emote.twitch": "Смайлик Twitch",
      "tip.emote.kick": "Смайлик Kick",
      "tip.emote.7tv.channel": "Смайлик 7TV канала",
      "tip.emote.7tv.global": "Глобальный смайлик 7TV",
      "tip.emote.7tv.personal": "Личный смайлик 7TV",
      "tip.emote.bttv.channel": "Смайлик BetterTTV канала",
      "tip.emote.bttv.shared": "Общий смайлик BetterTTV",
      "tip.emote.bttv.global": "Глобальный смайлик BetterTTV",
      "tip.emote.ffz.channel": "Смайлик FFZ канала",
      "tip.emote.ffz.global": "Глобальный смайлик FFZ",
      "tip.by": "Автор: {name}",
      "tip.alias": "Другое имя: {name}",
      "tip.deleted": "<удалён>",
      "tip.open": "Открыть на {site}",
    },
    en: {
      "tip.emote.twitch": "Twitch Emote",
      "tip.emote.kick": "Kick Emote",
      "tip.emote.7tv.channel": "Channel 7TV Emote",
      "tip.emote.7tv.global": "Global 7TV Emote",
      "tip.emote.7tv.personal": "Personal 7TV Emote",
      "tip.emote.bttv.channel": "Channel BetterTTV Emote",
      "tip.emote.bttv.shared": "Shared BetterTTV Emote",
      "tip.emote.bttv.global": "Global BetterTTV Emote",
      "tip.emote.ffz.channel": "Channel FFZ Emote",
      "tip.emote.ffz.global": "Global FFZ Emote",
      "tip.by": "By: {name}",
      "tip.alias": "Alias of {name}",
      "tip.deleted": "<deleted>",
      "tip.open": "Open on {site}",
    },
  });

  const hosts = []; // [{sel, fn}]
  let box = null;
  let cur = null;
  let showT = 0;

  let body = null;
  let tail = null;
  let shown = false;
  function ensureBox() {
    if (box && box.isConnected) return box;
    if (!box) {
      box = CPX.el("div", { class: "cpx-own cpx-etip cpx-mz cpx-k1 cpx-t-tip", role: "tooltip" });
      body = CPX.el("div", { class: "cpx-etip-body", style: { display: "contents" } });
      tail = CPX.el("i", { class: "cpx-mz-tail", "aria-hidden": "true" });
      box.append(body, tail);
    }
    (document.body || document.documentElement).appendChild(box);
    return box;
  }

  // Элемент, по которому нажали: его подсказку не показываем, пока курсор с него не уйдёт.
  let muted = null;
  function onDown(e) {
    muted = cur;
    hide();
    // Окно по щелчку: нажали мимо него и мимо его смайлика — закрыть (по смайлику — решит щелчок, onClick).
    downAt = { x: e.clientX, y: e.clientY };
    const t = e.target;
    if (card.el && !(t instanceof Node && (card.box.contains(t) || card.el.contains(t)))) closeCard();
  }

  function hide() {
    clearTimeout(showT);
    showT = 0;
    cur = null;
    if (!box || !shown) return;
    shown = false;
    const b = box;
    CPX.mz.out(b, () => !shown && b.classList.remove("cpx-etip-on"));
  }

  const imgSrc = (u) => CPX.safe.imgUrl(CPX.emotes.route(u));

  /** Содержимое подсказки (и окна по щелчку — там ещё строки слоёв d.rows и кнопка-ссылка d.go). */
  function fill(to, d) {
    to.textContent = "";
    if (d.img) {
      const pic = CPX.el("span", { class: "cpx-etip-pic" });
      const add = (u, cls, sized) => {
        const src = imgSrc(u);
        if (!src) return;
        const im = CPX.el("img", { class: cls, src, alt: "", decoding: "async" });
        if (sized && d.w && d.h) {
          im.width = d.w;
          im.height = d.h;
        } else if (d.h) im.style.maxHeight = d.h + "px"; // слой поверх — своих пропорций
        pic.appendChild(im);
      };
      add(d.img, "cpx-etip-img", true);
      for (const u of d.layers || []) add(u, "cpx-etip-img cpx-etip-layer", false);
      to.appendChild(pic);
    }
    if (d.title) to.appendChild(CPX.el("div", { class: "cpx-etip-title", text: d.title }));
    for (const line of d.lines || []) if (line) to.appendChild(CPX.el("div", { class: "cpx-etip-line", text: line }));
    if (d.rows) {
      const list = CPX.el("div", { class: "cpx-etip-rows" });
      for (const w of d.rows) {
        const src = imgSrc(w.img);
        list.appendChild(
          CPX.el("div", { class: "cpx-etip-row" }, [
            src ? CPX.el("img", { class: "cpx-etip-row__pic", src, alt: "", decoding: "async" }) : CPX.el("span", { class: "cpx-etip-row__pic" }),
            CPX.el("div", { class: "cpx-etip-row__t" }, [
              CPX.el("div", { class: "cpx-etip-row__n", text: w.name }),
              CPX.el("div", { class: "cpx-etip-row__s", text: w.sub }),
            ]),
            w.link ? goLink(w.link, false) : null,
          ])
        );
      }
      to.appendChild(list);
    }
    if (d.fx) to.appendChild(CPX.el("div", { class: "cpx-etip-fx", text: d.fx }));
    if (d.mono) to.appendChild(CPX.el("div", { class: "cpx-etip-mono cpx-mz cpx-k1 cpx-t-well", text: d.mono }));
    if (d.go) to.appendChild(goLink(d.go, true));
  }

  function build(d) {
    const b = ensureBox();
    fill(body, d);
    return b;
  }

  /** Поставить всплывашку b у элемента el: над ним, не влезает — под ним; хвостик — к середине el. */
  function place(el, b) {
    b = b || box;
    if (!b || !el.isConnected) return b === box ? hide() : closeCard();
    const r = el.getBoundingClientRect();
    const tw = b.offsetWidth;
    const th = b.offsetHeight;
    const vw = document.documentElement.clientWidth || window.innerWidth;
    let top = r.top - th - 9;
    let side = "top";
    if (top < 4) {
      top = r.bottom + 9; // сверху не влезает — под элементом
      side = "bottom";
    }
    let left = r.left + r.width / 2 - tw / 2;
    left = Math.max(4, Math.min(left, vw - tw - 4));
    b.style.transform = "translate(" + Math.round(left) + "px," + Math.round(top) + "px)";
    b.dataset.side = side;
    // Хвостик — против середины якоря (подсказка могла упереться в край окна).
    const tx = Math.max(6, Math.min(tw - 18, r.left + r.width / 2 - left - 6));
    b.style.setProperty("--cpx-tail-x", Math.round(tx) + "px");
  }

  function show(el, d) {
    build(d);
    box.style.transform = "translate(-9999px,-9999px)";
    box.classList.add("cpx-etip-on");
    place(el);
    // Появление маской — только если подсказки не было видно (переход между смайликами — без него).
    if (!shown) {
      shown = true;
      CPX.mz.in(box);
    }
    // Картинка приехала позже и сменила размер подсказки — поставить заново.
    for (const im of box.querySelectorAll("img")) if (!im.complete) im.addEventListener("load", () => cur === el && place(el), { once: true });
  }

  function onOver(e) {
    const t = e.target;
    if (!t || !t.closest) return;
    for (const h of hosts) {
      const el = t.closest(h.sel);
      if (!el) continue;
      if (el === cur || el === muted || el === card.el) return;
      clearTimeout(showT);
      cur = el;
      showT = setTimeout(() => {
        if (cur !== el) return;
        const d = CPX.safely("tip:" + h.sel, () => h.fn(el));
        if (d) show(el, d);
        else hide();
      }, 80);
      return;
    }
  }

  // Показ зовёт движение мыши со сменой элемента под курсором, а не mouseover: тот приходит и когда смайлик сам
  // подъехал под неподвижный курсор (чат едет; замер 12.10 — подсказка всплывала раз в секунду). При настоящем
  // движении mousemove идёт сразу за mouseover; по координатам не отличить — при масштабе 125–150 % курсор
  // пересекает край смайлика, не меняя целых координат.
  let lastT = null;
  function onMove(e) {
    if (e.target === lastT) return;
    lastT = e.target;
    onOver(e);
  }

  function onOut(e) {
    const to = e.relatedTarget;
    if (!to) lastT = null; // мышь ушла со страницы — вернётся тем же элементом, это новое наведение
    if (muted && !(to && muted.contains(to))) muted = null;
    if (!cur) return;
    if (to && cur.contains(to)) return;
    hide();
  }

  // Чат прокручивается сам от каждого нового сообщения — подсказка едет за элементом, а не
  // прячется; ушёл из виду — прячем.
  let moveQueued = false;
  function follow() {
    if (card.el) followCard();
    if (!cur || moveQueued || !box || !shown) return;
    moveQueued = true;
    requestAnimationFrame(() => {
      moveQueued = false;
      if (!cur) return;
      const r = cur.getBoundingClientRect();
      if (!cur.isConnected || r.bottom < 0 || r.top > window.innerHeight || !r.width) return hide();
      place(cur);
    });
  }

  function start() {
    document.addEventListener("mousemove", onMove, { capture: true, passive: true });
    document.addEventListener("mouseout", onOut, true);
    // Колесо — человек сам листает: подсказка только мешала бы.
    document.addEventListener("wheel", hide, { capture: true, passive: true });
    // Нажатие — как у Twitch: подсказка прячется (иначе щелчок по значку, открывший окно
    // досье/карточки, оставлял её висеть поверх этого окна).
    document.addEventListener("pointerdown", onDown, { capture: true, passive: true });
    document.addEventListener("scroll", follow, { capture: true, passive: true });
    window.addEventListener("blur", hide);
    document.addEventListener("click", onClick, true);
    // Esc — на окне: до документа Twitch его не пускает (стенд 02.11, отдельное окно чата).
    window.addEventListener("keydown", (e) => e.key === "Escape" && card.el && (closeCard(), e.stopPropagation()), true);
    // Ушли на другую вкладку, в другое окно или по ссылке из окна — оно закрывается.
    window.addEventListener("blur", closeCard);
  }

  // ── подсказка смайлика ─────────────────────────────────────────────────────
  function kindLine(tok) {
    if (tok.provider === "twitch" || tok.provider === "kick") return CPX.t("tip.emote." + tok.provider);
    if (tok.provider === "bttv" && tok.scope === "channel" && tok.ownerName) return CPX.t("tip.emote.bttv.shared");
    return CPX.t("tip.emote." + tok.provider + "." + (tok.scope || "global"));
  }

  function bigSize(tok) {
    const s = CPX.emoteRender.sizeOf(tok);
    if (!s.w || !s.h) return { w: 0, h: 0 };
    // Как у Twitch: втрое крупнее, но не выше 112 и не шире 336.
    const k = Math.min(3, 112 / s.h, 336 / s.w);
    return { w: Math.round(s.w * k), h: Math.round(s.h * k) };
  }

  function ownerOf(tok) {
    if (tok.provider === "twitch" || tok.provider === "kick") return "";
    // У смайлика BTTV канала автора нет — это сам канал.
    if (!tok.ownerName && tok.provider === "bttv" && tok.scope === "channel") return (CPX.chat.state && CPX.chat.state.displayName) || "";
    // У 7TV автор бывает удалён — клиент пишет «<deleted>».
    if (!tok.ownerName && tok.provider === "7tv") return CPX.t("tip.deleted");
    return tok.ownerName || "";
  }

  function emoteTip(el) {
    const tok = el.__cpxEmote;
    if (!tok) return null;
    const u = tok.urls || {};
    const size = bigSize(tok);
    const names = [tok.name].concat((tok.zw || []).map((z) => z.name));
    const lines = [kindLine(tok)];
    if (tok.baseName && tok.baseName !== tok.name) lines.push(CPX.t("tip.alias", { name: tok.baseName }));
    const owner = ownerOf(tok);
    if (owner) lines.push(CPX.t("tip.by", { name: owner }));
    let mono = "";
    let fx = "";
    if (tok.fx && tok.fx.length) {
      // Как клиент: названия и «рецепт» — по итоговой маске эффектов, а не по набранным словам
      // (у нашего подписчика — нашими +кодами).
      const names = CPX.fx.titles(tok.fx);
      if (names.length && names.length <= 3) fx = names.join(" · ");
      mono = CPX.fx.recipe(tok.fx, tok.name, !!tok.fxRecipePlus);
    }
    for (const z of tok.zw || []) lines.push(z.name + " — " + kindLine(z));
    return {
      img: u[4] || u[2] || u[1],
      w: size.w,
      h: size.h,
      layers: (tok.zw || []).map((z) => (z.urls && (z.urls[4] || z.urls[1])) || "").filter(Boolean),
      title: names.join(" + "),
      lines,
      fx,
      mono,
    };
  }

  // ── окно по щелчку (владелец 02.11) ────────────────────────────────────────
  const SITES = {
    "7tv": { name: "7TV", url: "https://7tv.app/emotes/" },
    bttv: { name: "BetterTTV", url: "https://betterttv.com/emotes/" },
    ffz: { name: "FFZ", url: "https://www.frankerfacez.com/emoticon/" },
  };
  const DRAG_PX = 5; // мышь ушла дальше между нажатием и отпусканием — это выделение текста, а не щелчок
  const card = { box: null, body: null, el: null, timer: 0 };
  let downAt = null;
  let cardQueued = false;

  /** Страница смайлика на его сайте → {href, site} или null (у Twitch своей страницы нет). */
  function linkOf(tok) {
    const s = tok && SITES[tok.provider];
    const id = s ? String(tok.id || "") : "";
    return s && /^[A-Za-z0-9]{1,40}$/.test(id) ? { href: s.url + id, site: s.name } : null;
  }

  function goLink(link, withLabel) {
    const label = CPX.t("tip.open", { site: link.site });
    return CPX.el("a", { class: "cpx-etip-go cpx-mz cpx-mzb cpx-k1 cpx-t-raised" + (withLabel ? "" : " cpx-etip-go--icon"), href: link.href, target: "_blank", rel: "noopener noreferrer", title: withLabel ? null : label, "aria-label": label }, [
      CPX.glyph("external", 14),
      withLabel ? CPX.el("span", { text: label }) : null,
    ]);
  }

  /** Окно по щелчку: всё, что в подсказке, и кнопка на страницу смайлика. Смайлик со слоями нулевой ширины —
   *  строкой на каждый (картинка, имя, откуда · автор, своя кнопка). Только смайлики Twitch — null: им родная карточка. */
  function cardTip(el) {
    const tok = el.__cpxEmote;
    if (!tok) return null;
    const seen = new Set();
    const all = [tok].concat(tok.zw || []).filter((t) => {
      const k = t.provider + ":" + (t.id || t.name);
      return !seen.has(k) && seen.add(k);
    });
    if (!all.some(linkOf)) return null;
    const d = emoteTip(el);
    if (all.length === 1) return Object.assign(d, { go: linkOf(tok) });
    const sub = (t) => {
      const o = ownerOf(t);
      const a = t.baseName && t.baseName !== t.name ? CPX.t("tip.alias", { name: t.baseName }) : "";
      return [kindLine(t), o, a].filter(Boolean).join(" · ");
    };
    const rows = all.map((t) => ({ img: (t.urls && (t.urls[2] || t.urls[1])) || "", name: t.name, sub: sub(t), link: linkOf(t) }));
    return { img: d.img, w: d.w, h: d.h, layers: d.layers, rows, fx: d.fx, mono: d.mono };
  }

  function openCard(el, d) {
    closeCard(true);
    if (!card.box) {
      card.box = CPX.el("div", { class: "cpx-own cpx-etip cpx-etip--card cpx-etip-on cpx-mz cpx-k1 cpx-t-tip", role: "dialog" });
      card.body = CPX.el("div", { class: "cpx-etip-body", style: { display: "contents" } });
      card.box.append(card.body, CPX.el("i", { class: "cpx-mz-tail", "aria-hidden": "true" }));
    }
    fill(card.body, d);
    card.box.setAttribute("aria-label", (el.__cpxEmote && el.__cpxEmote.name) || "");
    card.box.style.transform = "translate(-9999px,-9999px)";
    (document.body || document.documentElement).appendChild(card.box);
    card.el = el;
    place(el, card.box);
    CPX.mz.in(card.box);
    for (const im of card.box.querySelectorAll("img")) if (!im.complete) im.addEventListener("load", () => card.el === el && place(el, card.box), { once: true });
    // Чат едет и без прокрутки страницы (новые строки, плавный ход) — сверяем место 4 раза в секунду, пока открыто.
    card.timer = setInterval(followCard, 250);
  }

  function closeCard(now) {
    clearInterval(card.timer);
    card.timer = 0;
    if (!card.el) return;
    card.el = null;
    const b = card.box;
    if (now === true) b.remove();
    else CPX.mz.out(b, () => !card.el && b.remove());
  }

  /** Окно — за своим смайликом; смайлик пропал или ушёл из виду — закрыть. */
  function followCard() {
    if (!card.el || cardQueued) return;
    cardQueued = true;
    requestAnimationFrame(() => {
      cardQueued = false;
      const el = card.el;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (!el.isConnected || r.bottom < 0 || r.top > window.innerHeight || !r.width) return closeCard();
      place(el, card.box);
    });
  }

  function onClick(e) {
    if (e.button !== 0 || !(e.target instanceof Element)) return;
    const t = e.target;
    if (card.box && card.box.contains(t)) {
      if (t.closest(".cpx-etip-go")) setTimeout(closeCard, 0); // ссылка открылась в новой вкладке
      return;
    }
    const el = t.closest(".cpx-em");
    if (!el || !el.__cpxEmote) return;
    if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > DRAG_PX) return;
    if (el === card.el) {
      closeCard();
      e.stopPropagation();
      return;
    }
    const d = CPX.safely("tip:card", () => cardTip(el));
    if (!d) return; // только Twitch — дальше родная карточка смайлика (45_list_actions)
    // Не отдаём щелчок строке: у стопки на смайлике Twitch открылась бы ещё и карточка Twitch.
    e.stopPropagation();
    e.preventDefault();
    openCard(el, d);
  }

  const api = {
    register(sel, fn) {
      hosts.push({ sel, fn });
    },
    hide,
  };

  api.register(".cpx-em", emoteTip);
  CPX.boot.add("tip", start, 58);
  return api;
})();

// ── src/main/60_paints.js ──
/* Мир страницы: пейнты ников — PLUS (наш формат) и 7TV — и украшение строки «paint» (order 30).
 *
 * Перенос НАШЕГО модуля экранного чата OBS (chat/web/src/common/20_paint.js): те же формулы, что
 * у клиента и сайта PLUS (plus/index.html: buildStops, paintFill) — CSS linear-gradient(угол) =
 * их длина |w·cos|+|h·sin|, радиальный = circle farthest-side, повтор полос — период 1/tiles,
 * замыкание зеркалом, фаза анимации от РЕАЛЬНОГО времени (у всех зрителей перелив в лад).
 *
 * Отличие от экранного чата — как лежат слои (там тени — ::before с z-index:-1 ПОД ником; на
 * странице Twitch их закрыл бы любой фон строки — подсветка упоминания, наведение):
 *   • сам ник: -webkit-text-fill-color: transparent + text-shadow — рисует только ТЕНИ;
 *   • ::after с тем же текстом (attr(data-text)) поверх: заливка пейнта background-clip:text,
 *     анимация (--cpx-t/--cpx-k/--cpx-a) — на нём. ПОД заливкой — цвет ника (background-color:
 *     currentColor): полупрозрачные места пейнта просвечивают цветом ника, как у клиента
 *     (Paint::overlayColors, UrlPaint заливает пиксмап цветом ника). Кроме картинки PLUS: у
 *     клиента под ней цвета нет (PlusPaint::imageBrush — только картинка), и подложка под
 *     картинкой в Firefox даёт кайму цвета ника по краям букв (см. plus(), ветка image).
 *   Выделение и копирование ника работают по настоящему тексту; ::after мышь не ловит.
 *   Ник с пейнтом НЕ переносится (как в клиенте): строчный блок с переносом внутри в узкой
 *   колонке растягивался на всю ширину, ломался «лесенкой» и уносил двоеточие и текст на новую
 *   строку (замер 29.09: колонка 200 px — ник в 2 строки, двоеточие в третьей). Ник Twitch
 *   ≤25 знаков: в обычной ширине чата помещается; в очень узкой ник стоит строкой целиком,
 *   а «: текст» продолжается со следующей (замер: 200 px — ник 1 строка, текст со 2-й).
 *  • ОДНО правило на пейнт (класс), общее для всех ников с ним; правила вставляются, только
 *    когда пейнт готов (картинка загружена) — до этого ник просто своего цвета.
 *  • ⚠️БЕЗОПАСНОСТЬ: описания пишут чужие люди (подписчики PLUS, 7TV) — в правило идут только
 *    числа, цвета #rrggbb / rgba() из чисел и адреса, прошедшие CPX.safe.imgUrl.
 *
 * Приоритет — как в клиенте (MessageLayoutElement.cpp:760-830): пейнт PLUS > пейнт 7TV > цвет ника
 * PLUS > цвет Twitch. Цвет PLUS при этом — ОСНОВА ника: под пейнтом он просвечивает в
 * полупрозрачных местах (см. выше). Системные сообщения и упоминания в тексте не красятся.
 * Тени: PLUS — в px для шрифта 14 px, 7TV — для 13 px (шрифт чата Twitch) → em.
 *
 * Движение (сдвиг полос / вращение / пульс) ведёт сам модуль, не CSS-анимация: 30 раз в секунду и только у ников на
 * экране, фаза — прямо от часов (см. «движение — только у видимых» ниже).
 *
 * API: CPX.paints.plus(id, v, spec) / .stv(описание) → класс | null · .wear(el, класс, speed, kind) ·
 *   .strip(el) · .animOf(spec) · .retryFailed() (связь с 7TV вернулась — собрать упавшие заново) ·
 *   .dress(el, {id?, login?}, channelId) — цвет PLUS и пейнт человека на ник или «@ник» · .watching() →
 *   {watched, live} — анимированных ников под наблюдением и из них на экране (стенд).
 */

CPX.paints = (() => {
  let sheet = null;
  const made = Object.create(null); // класс → "ok" | "wait" | "fail"
  const imgState = Object.create(null); // адрес → "loading" | "ok" | "fail"
  const imgWait = Object.create(null); // адрес → [fn(ok)]
  // Адрес, который реально загрузился (картинка 7TV могла прийти через зеркало PLUS — 64_mirror_img).
  const imgFinal = Object.create(null);
  const finalOf = (u) => imgFinal[u] || u;
  let props = null;

  function ensureSheet() {
    if (sheet) return sheet;
    const st = document.createElement("style");
    st.id = "cpx-paints";
    (document.head || document.documentElement).appendChild(st);
    sheet = st.sheet;
    return sheet;
  }

  function add(rule) {
    try {
      sheet.insertRule(rule, sheet.cssRules.length);
      return true;
    } catch (e) {
      CPX.report("paints:rule", e);
      return false;
    }
  }

  /* Анимируемые переменные (@property). Без них движение пейнта превращается в неподвижный
   * пейнт — запасной путь, не поломка. */
  function registerProps() {
    if (props !== null) return props;
    props = false;
    if (!window.CSS || typeof CSS.registerProperty !== "function") return false;
    const reg = (name, syntax, initialValue) => {
      try {
        CSS.registerProperty({ name, syntax, inherits: false, initialValue });
      } catch (_) {
        /* уже зарегистрирована (второй экземпляр) — не беда */
      }
    };
    reg("--cpx-t", "<number>", "0");
    reg("--cpx-k", "<number>", "1");
    reg("--cpx-a", "<angle>", "0deg");
    props = true;
    return props;
  }

  const num = (x) => Math.round(x * 10000) / 10000;
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const color = (c) => CPX.safe.hex(c) || null;
  const cssUrl = (u) => {
    // Адрес зеркала строит 64_mirror_img из проверенного адреса 7TV — его и пропускаем.
    const ok = CPX.imgRoute ? CPX.imgRoute.safe(u) : CPX.safe.imgUrl(u);
    return ok ? 'url("' + ok + '")' : null;
  };
  function rgbaInt(c) {
    if (c == null || !Number.isFinite(+c)) return null;
    c = +c >>> 0;
    return "rgba(" + ((c >>> 24) & 255) + "," + ((c >>> 16) & 255) + "," + ((c >>> 8) & 255) + "," + num((c & 255) / 255) + ")";
  }

  // ── PLUS ──────────────────────────────────────────────────────────────────
  function tilesOf(spec) {
    const n = +(spec.tiles || 0);
    if (n > 0) return Math.min(6, Math.round(n));
    return spec.repeat ? 3 : 1;
  }
  function animOf(spec) {
    const a = spec && spec.anim;
    if (!a || typeof a !== "object") return { kind: "none", speed: 6 };
    const speed = +a.speed > 0.5 ? Math.min(600, num(+a.speed)) : 6;
    const kind = ["none", "slide", "spin", "pulse"].includes(a.kind) ? a.kind : "none";
    return { kind, speed };
  }

  /* Точки одного периода. Замкнутый рисунок (несколько полос или перелив) — зеркалом: от первого
   * цвета к последнему и обратно, без шва (на краях — явные точки смешанного цвета). */
  function ringStops(spec) {
    const src = (Array.isArray(spec.stops) ? spec.stops : [])
      .filter((s) => Array.isArray(s) && color(s[1]))
      .slice(0, 16)
      .map((s) => [clamp(+s[0] || 0, 0, 1), color(s[1])])
      .sort((a, b) => a[0] - b[0]);
    if (src.length < 2) return null;
    const closed = tilesOf(spec) > 1 || animOf(spec).kind === "slide";
    if (!closed) return { stops: src, closed: false };
    const ring = src
      .map((s) => [s[0] / 2, s[1]])
      .concat(
        src
          .slice(0, -1)
          .reverse()
          .map((s) => [1 - s[0] / 2, s[1]])
      )
      .sort((a, b) => a[0] - b[0]);
    const lo = ring[ring.length - 1];
    const hi = ring[0];
    const gap = 1 - lo[0] + hi[0];
    const edge = CPX.color.mix(lo[1], hi[1], gap > 0.00001 ? (1 - lo[0]) / gap : 0) || lo[1];
    return { stops: [[0, edge]].concat(ring, [[1, edge]]), closed: true };
  }

  /* Позиция точки в CSS с учётом движения. p — 0..1 внутри периода. */
  function stopPos(p, tiles, kind, radial, animated) {
    const base = num(p / tiles);
    const t = animated && kind === "slide" ? " + var(--cpx-t) / " + tiles : "";
    let x = "(" + base + t + ")";
    if (animated && kind === "pulse") x = radial ? x + " * var(--cpx-k)" : "(0.5 + (" + x + " - 0.5) * var(--cpx-k))";
    return t || (animated && kind === "pulse") ? "calc(" + x + " * 100%)" : num(base * 100) + "%";
  }

  function plusGradient(spec, animated) {
    const r = ringStops(spec);
    if (!r) return null;
    const tiles = r.closed ? tilesOf(spec) : 1;
    const a = animOf(spec);
    const radial = spec.type === "radial";
    const parts = r.stops.map((s) => s[1] + " " + stopPos(s[0], tiles, a.kind, radial, animated)).join(", ");
    const rep = r.closed ? "repeating-" : "";
    if (radial) return rep + "radial-gradient(circle farthest-side at 50% 50%, " + parts + ")";
    const ang = num((+spec.angle || 0) % 360) || 0;
    const angle = animated && a.kind === "spin" ? "calc(" + ang + "deg + var(--cpx-a))" : ang + "deg";
    return rep + "linear-gradient(" + angle + ", " + parts + ")";
  }

  function shadowCss(list, base) {
    return list.map((s) => num(s[0] / base) + "em " + num(s[1] / base) + "em " + num(Math.max(0, s[2]) / base) + "em " + s[3]).join(", ");
  }

  function plusShadows(spec) {
    return (Array.isArray(spec.shadows) ? spec.shadows : [])
      .filter((s) => Array.isArray(s) && s.length >= 4 && color(s[3]))
      .slice(0, 3)
      .map((s) => [clamp(+s[0] || 0, -4, 4), clamp(+s[1] || 0, -4, 4), clamp(+s[2] || 0, 0, 8), color(s[3])]);
  }

  // ── правила ───────────────────────────────────────────────────────────────
  // Сам ник: прозрачный текст, рисует только тени. ::after — заливка поверх.
  // ⚠️Ник — inline-block: тогда слой ::after (тот же шрифт и высота строки) ложится на текст
  // ник-в-ник. У простого строчного элемента слой съезжал бы вниз на половину межстрочного.
  const AFTER_BASE =
    "content:attr(data-text);position:absolute;left:0;top:0;width:100%;height:100%;padding:inherit;box-sizing:border-box;" +
    "pointer-events:none;white-space:nowrap;background-color:currentColor;" +
    "-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;" +
    "text-shadow:none;";
  // Движение: значение ставит модуль на сам ник (--cpx-jt/ja/jk — обычные, наследуются в ::after), заливка читает его
  // через типизированные --cpx-t/a/k.
  const MOVE_CSS = { slide: "--cpx-t:var(--cpx-jt,0);", spin: "--cpx-a:var(--cpx-ja,0deg);", pulse: "--cpx-k:var(--cpx-jk,1);" };

  function insert(cls, shadows, afterCss) {
    add("." + cls + "{position:relative;display:inline-block;white-space:nowrap;-webkit-text-fill-color:transparent;text-shadow:" + (shadows || "none") + "}");
    add("." + cls + "::after{" + AFTER_BASE + afterCss + "}");
  }

  // Картинку-пейнт показываем только загруженной; не загрузилась — ник своим цветом. Исход — в учёт неудач картинок
  // (CPX.imgGate, 52): пейнт PLUS, чья картинка не пришла, пробуем снова не раньше его срока (см. plus).
  function preload(url, fn) {
    const st = imgState[url];
    if (st === "ok" || st === "fail") return fn(st === "ok");
    (imgWait[url] = imgWait[url] || []).push(fn);
    if (st === "loading") return;
    imgState[url] = "loading";
    const done = (ok) => {
      imgState[url] = ok ? "ok" : "fail";
      const list = imgWait[url] || [];
      delete imgWait[url];
      for (const f of list) CPX.safely("paints:img", () => f(ok));
    };
    // Картинка 7TV — напрямую или через зеркало PLUS (с очередью и сторожем).
    if (
      CPX.imgRoute &&
      CPX.imgRoute.preload(url, (src) => {
        if (src) imgFinal[url] = src;
        if (src && CPX.imgGate) CPX.imgGate.ok(url); // ошибки в счёт паузы сайта ставит сама очередь (64, К4)
        done(!!src);
      })
    )
      return;
    // Картинка нашего сервера не пришла — та же через другую дверь (CPX.safe.otherDoor; 20.11 хостер закрывал ws): удалась —
    // она и пойдёт в стиль (imgFinal).
    let cur = url;
    const im = new Image();
    im.decoding = "async";
    im.onload = () => {
      if (CPX.imgGate) CPX.imgGate.ok(cur);
      if (cur !== url) imgFinal[url] = cur;
      done(true);
    };
    im.onerror = () => {
      if (CPX.imgGate) CPX.imgGate.fail(cur);
      const alt = cur === url && CPX.safe.otherDoor(url);
      if (alt && (!CPX.imgGate || CPX.imgGate.allow(alt))) {
        cur = alt;
        im.src = CPX.emotes.route(alt);
        return;
      }
      done(false);
    };
    im.src = CPX.emotes.route(url);
  }

  // Короткий отпечаток адреса картинки — в имени класса: сервер сменил ссылку (18.11: картинки с chat.eblo.id переехали
  // на ws.chat.eblo.id при той же версии пейнта) — новый класс и новая загрузка, а не прежний «не загрузился».
  const urlTag = (u) => {
    let h = 5381;
    for (let i = 0; i < u.length; i++) h = ((h << 5) + h + u.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  };
  const retries = Object.create(null); // класс пейнта-картинки → сколько раз пробовали снова после неудачи

  /** Класс пейнта PLUS (null — пейнт не годится). */
  function plus(id, v, spec) {
    if (!spec || typeof spec !== "object") return null;
    let cls = "cpx-pp-" + String(id).replace(/[^0-9]/g, "") + "-" + (parseInt(v, 10) || 0);
    if (spec.type === "image") {
      // Картинка не пришла — «не навсегда»: когда учёт неудач пустит снова, тот же пейнт под новым классом
      // (правила «не загрузился» у старого класса стоят с !important — их не перебить).
      const base = cls + "-" + urlTag(String(spec.img || ""));
      cls = base + (retries[base] ? "-r" + retries[base] : "");
      if (made[cls] === "fail" && CPX.imgGate && CPX.imgGate.allow(String(spec.img || ""))) {
        retries[base] = (retries[base] || 0) + 1;
        delete imgState[String(spec.img || "")];
        delete imgState[String(spec.img || "").replace(/\.webp$/, ".p.webp")];
        cls = base + "-r" + retries[base];
      }
    }
    if (made[cls]) return made[cls] === "fail" || made[cls] === "bad" ? null : cls;
    ensureSheet();
    const sh = plusShadows(spec);
    const shadows = sh.length ? shadowCss(sh, 14) : "";
    if (spec.type === "image") {
      const url = String(spec.img || "");
      if (!cssUrl(url)) {
        // Негодный адрес — «не годится» насовсем: «fail» пускал бы повтор под новым классом на каждое сообщение
        // (ревью 19.11: записи копились без конца, а загрузки при этом не было).
        made[cls] = "bad";
        return null;
      }
      const fit =
        spec.fit === "tile"
          ? "background-size:auto 100%;background-repeat:repeat-x;background-position:left center;"
          : spec.fit === "stretch"
            ? "background-size:100% 100%;background-repeat:no-repeat;"
            : "background-size:cover;background-position:center;background-repeat:no-repeat;";
      // 🔴Без подложки цветом ника (общей для всех пейнтов, AFTER_BASE). Firefox обрезает по
      // буквам каждый слой фона ОТДЕЛЬНО, и на полупрозрачных краях букв цвет ника выглядывает
      // из-под непрозрачной картинки: ник ndrqw (#FF0000, кот в оттенках серого) выходил в
      // красном контуре, а в клиенте — серым (замер 03.10: 212 красных точек из 570 → 0). У
      // градиентов кайма не появляется, у картинки — при любом слое под ней. Клиент под картинкой
      // PLUS цвета и не кладёт: прозрачные места картинки прозрачны и там, и тут.
      const under = "background-color:transparent;";
      made[cls] = "wait";
      // Лёгкое превью первого кадра (тот же адрес с .p.webp) — пока грузится основная картинка.
      const preview = url.replace(/\.webp$/, ".p.webp");
      let shown = false;
      if (preview !== url) {
        preload(preview, (ok) => {
          if (!ok || shown || made[cls] === "ok") return;
          shown = true;
          insert(cls, shadows, "background-image:" + cssUrl(finalOf(preview)) + ";" + fit + under);
        });
      }
      preload(url, (ok) => {
        if (ok) {
          made[cls] = "ok";
          insert(cls, shadows, "background-image:" + cssUrl(finalOf(url)) + ";" + fit + under);
        } else {
          made[cls] = "fail";
          // Ник должен остаться видимым, даже если превью уже поставило прозрачную заливку.
          add("." + cls + "{-webkit-text-fill-color:currentColor!important;text-shadow:none!important}");
          add("." + cls + "::after{display:none!important}");
        }
      });
      return cls;
    }
    const a = animOf(spec);
    const anim = a.kind !== "none" && registerProps();
    const g = plusGradient(spec, anim);
    if (!g) {
      made[cls] = "fail";
      return null;
    }
    insert(cls, shadows, "background-image:" + g + ";background-size:100% 100%;" + (anim ? MOVE_CSS[a.kind] || "" : ""));
    made[cls] = "ok";
    return cls;
  }

  // ── 7TV ───────────────────────────────────────────────────────────────────
  function stvLayer(l) {
    if (l.fn === "URL") return cssUrl(finalOf(l.img || ""));
    const stops = (l.stops || [])
      .map((s) => {
        const c = rgbaInt(s[1]);
        return c ? c + " " + num(clamp(+s[0] || 0, 0, 1) * 100) + "%" : null;
      })
      .filter(Boolean);
    if (!stops.length) return null;
    const rep = l.repeat ? "repeating-" : "";
    if (l.fn === "RADIAL_GRADIENT") return rep + "radial-gradient(" + (l.shape === "ellipse" ? "ellipse" : "circle") + ", " + stops.join(", ") + ")";
    return rep + "linear-gradient(" + num(+l.angle || 0) + "deg, " + stops.join(", ") + ")";
  }

  /** Класс пейнта 7TV (описание из фона: {id, layers:[…], shadows:[[x,y,r,цвет]]}). */
  function stv(p) {
    if (!p || !p.id || !Array.isArray(p.layers) || !p.layers.length) return null;
    const cls = "cpx-p7-" + CPX.safe.ident(p.id, 40);
    if (made[cls]) return made[cls] === "fail" ? null : cls;
    ensureSheet();
    const layers = p.layers.map((l) => ({ l, css: stvLayer(l) })).filter((x) => x.css);
    if (!layers.length) {
      made[cls] = "fail";
      return null;
    }
    const pos = (l) => (l.at ? num(l.at[0] * 100) + "% " + num(l.at[1] * 100) + "%" : "0% 0%");
    const size = (l) => (l.size ? num(l.size[0] * 100) + "% " + num(l.size[1] * 100) + "%" : "100% 100%");
    const rep = (l) => (l.rep && /^(no-repeat|repeat|repeat-x|repeat-y|space|round)$/.test(l.rep) ? l.rep : "no-repeat");
    // Слои-картинки пересчитываем после предзагрузки: адрес мог смениться на зеркало PLUS.
    const cssOf = () =>
      "background-image:" + layers.map((x) => (x.l.fn === "URL" ? stvLayer(x.l) || x.css : x.css)).join(", ") + ";" +
      "background-position:" + layers.map((x) => pos(x.l)).join(", ") + ";" +
      "background-size:" + layers.map((x) => size(x.l)).join(", ") + ";" +
      "background-repeat:" + layers.map((x) => rep(x.l)).join(", ") + ";";
    // 7TV рисует тени под свой шрифт 13 px (шрифт чата Twitch) — масштабируем от него.
    const sh = (p.shadows || [])
      .slice(0, 3)
      .map((s) => [+s[0] || 0, +s[1] || 0, Math.max(0, +s[2] || 0), rgbaInt(s[3])])
      .filter((s) => s[3]);
    const shadows = sh.length ? shadowCss(sh, 13) : "";
    const urls = layers.filter((x) => x.l.fn === "URL").map((x) => x.l.img);
    if (!urls.length) {
      insert(cls, shadows, cssOf());
      made[cls] = "ok";
      return cls;
    }
    made[cls] = "wait";
    let left = urls.length;
    let failed = false;
    for (const u of urls) {
      preload(u, (ok) => {
        if (!ok) failed = true;
        if (--left) return;
        if (failed) made[cls] = "fail";
        else {
          made[cls] = "ok";
          insert(cls, shadows, cssOf());
        }
      });
    }
    return cls;
  }

  // ── на ник ────────────────────────────────────────────────────────────────
  /* Куда надевать. ⚠️Слой заливки (::after) берёт шрифт у того элемента, на котором висит.
   * Если ник — обёртка, а начертание (жирный) задано вложенному элементу (у нашего списка —
   * span.cpx-name__dn), заливка на обёртке вышла бы обычной, а тени — жирными: ник «двоился».
   * Поэтому пейнт надевается на КАЖДЫЙ вложенный элемент с текстом, а без вложенных — на сам ник. */
  function targets(el) {
    const kids = [];
    for (const c of el.children) if (c.textContent.trim()) kids.push(c);
    return kids.length ? kids : [el];
  }

  /* ── движение — только у видимых ──────────────────────────────────────────
   * Замер 30–31.10 (legendaafk: пейнт PLUS у 58 % строк, в списке до 150 анимированных ников): CSS-анимация переменной
   * стиля пересчитывала стиль ника 60 раз в секунду, в том числе уехавшего за край чата (Chrome +160 % ядра, память
   * движка страницы росла ~0,5 ГБ/ч), и даже одна видимая держала страницу в перерисовке 60 раз в секунду (~+40 %
   * ядра). Поэтому движение ведёт модуль: наблюдатель видимости (с запасом SEEN_MARGIN) держит набор ников на экране,
   * им не чаще MOVE_FPS раз в секунду ставится значение от часов — фаза от реального времени, в лад у всех зрителей,
   * и вернувшийся на экран ник сразу в такт. Вкладка в фоне — таймеры и кадры браузер сам придерживает.
   * «Меньше движения» в системе и класс cpx-noanim на предке — ник стоит.
   * Срезанные строки отпускаем в колбэке (узел уже не в документе) и уборкой раз в SWEEP_MS. */
  const SEEN_MARGIN = "48px";
  const MOVE_FPS = 30;
  const MOVE_WAIT_MS = 1000 / MOVE_FPS - 12; // + ожидание кадра экрана ≈ 1/30 с при 60 Гц
  const SWEEP_MS = 30000;
  const VAR = { slide: "--cpx-jt", spin: "--cpx-ja", pulse: "--cpx-jk" };
  const moveOf = new WeakMap(); // цель → {kind, speed}
  const watched = new Set(); // под наблюдением
  const live = new Set(); // на экране
  const still = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
  let io = null;
  let sweepT = 0;
  let moving = false;

  function setMove(t, m, now) {
    const p = (now % m.speed) / m.speed;
    const v = m.kind === "spin" ? (p * 360).toFixed(1) + "deg" : m.kind === "pulse" ? (1 + 0.25 * Math.sin(2 * Math.PI * p)).toFixed(4) : p.toFixed(4);
    t.style.setProperty(VAR[m.kind], v);
  }
  function move() {
    if (!live.size || (still && still.matches)) {
      moving = false; // «меньше движения» — цикл не крутится; новые ники на экране запустят его снова
      return;
    }
    const now = CPX.clock.now() / 1000; // по часам серверов — в лад у всех
    for (const t of live) if (!t.closest(".cpx-noanim")) setMove(t, moveOf.get(t), now);
    setTimeout(() => requestAnimationFrame(move), MOVE_WAIT_MS);
  }
  function onSeen(entries) {
    const now = CPX.clock.now() / 1000;
    for (const e of entries) {
      const t = e.target;
      if (!watched.has(t)) continue; // уже снят (колбэк пришёл после unobserve)
      if (!t.isConnected) unwatch(t);
      else if (e.isIntersecting) {
        live.add(t);
        setMove(t, moveOf.get(t), now);
      } else live.delete(t);
    }
    if (live.size && !moving) {
      moving = true;
      requestAnimationFrame(move);
    }
  }
  function sweep() {
    sweepT = 0;
    for (const t of watched) if (!t.isConnected) unwatch(t);
    if (watched.size) sweepT = setTimeout(sweep, SWEEP_MS);
  }
  function watch(t, m) {
    if (typeof IntersectionObserver !== "function") return;
    if (!io) io = new IntersectionObserver(onSeen, { rootMargin: SEEN_MARGIN });
    moveOf.set(t, m);
    setMove(t, m, CPX.clock.now() / 1000); // первый кадр — уже в такт
    if (!watched.has(t)) {
      watched.add(t);
      io.observe(t);
    }
    if (!sweepT) sweepT = setTimeout(sweep, SWEEP_MS);
  }
  function unwatch(t) {
    if (!watched.delete(t)) return;
    live.delete(t);
    if (io) io.unobserve(t);
    for (const k in VAR) t.style.removeProperty(VAR[k]);
  }

  /** Надеть пейнт: класс + текст для заливки; у анимированных (speed, kind из animOf) — движение по часам. */
  function wear(el, cls, speed, kind) {
    if (!el || !cls) return;
    el.classList.add("cpx-painted");
    const m = speed && props === true && VAR[kind] ? { kind, speed } : null;
    for (const t of targets(el)) {
      t.classList.add("cpx-paint", cls);
      t.setAttribute("data-text", t.textContent);
      if (m) watch(t, m);
      else unwatch(t);
    }
  }

  function stripOne(t) {
    for (const c of [...t.classList]) if (c === "cpx-paint" || c.startsWith("cpx-pp-") || c.startsWith("cpx-p7-")) t.classList.remove(c);
    t.removeAttribute("data-text");
    unwatch(t);
  }

  /** Снять пейнт (повторяемость украшения: сначала убрать своё прежнее). */
  function strip(el) {
    if (!el || !el.classList.contains("cpx-painted")) return;
    el.classList.remove("cpx-painted");
    stripOne(el);
    for (const t of el.querySelectorAll(".cpx-paint")) stripOne(t);
  }

  /** Связь с 7TV вернулась (зеркало PLUS, 64_mirror_img): картинки пейнтов 7TV, что не пришли, и
   * пейнты, что из-за них не собрались, — забыть, чтобы следующая перерисовка строк собрала их
   * заново (у клиента — Image::reviveNetworkFailures). → сколько картинок забыто. */
  function retryFailed() {
    let n = 0;
    for (const u in imgState) {
      if (imgState[u] === "fail" && u.startsWith("https://cdn.7tv.app/")) {
        delete imgState[u];
        n++;
      }
    }
    if (n) for (const c in made) if (made[c] === "fail" && c.startsWith("cpx-p7-")) delete made[c];
    return n;
  }

  return { plus, stv, wear, strip, animOf, retryFailed, watching: () => ({ watched: watched.size, live: live.size }) };
})();

/* Украшение строки: пейнт PLUS / пейнт 7TV / цвет ника PLUS (order 30, ctx.el.name). */
(() => {
  const paintsOn = () => CPX.settings.get("emotes.paints") !== false;

  function restoreColor(el) {
    if (el.dataset.cpxColor0 === undefined) return;
    el.style.color = el.dataset.cpxColor0;
    delete el.dataset.cpxColor0;
  }

  /** Цвет PLUS и пейнт (PLUS, иначе 7TV) на элемент ника. u = {id?, login?}: без id — только PLUS по логину
   * (пейнт 7TV известен по номеру). Повторяемо: сначала снимает своё прежнее. Им же красятся упоминания
   * «@ник» (46_list_mentions) — как ник в клиенте. */
  function dress(el, u, channelId) {
    CPX.paints.strip(el);
    restoreColor(el);
    if (!u || (!u.id && !u.login)) return;
    const pu = (u.id && CPX.cosm.plus(u.id)) || (u.login && CPX.cosm.plus(u.login)) || null;
    // 0) Цвет ника PLUS — основа (без пейнта он и есть цвет ника; с пейнтом просвечивает под ним).
    const pc = pu && CPX.safe.hex(pu.color);
    if (pc) {
      el.dataset.cpxColor0 = el.style.color || "";
      // «Читаемые цвета» Twitch — тем же пересчётом, что и у обычных ников списка.
      const kit = CPX.listKit;
      el.style.color = (kit && typeof kit.nameColor === "function" && kit.nameColor(pc.slice(0, 7))) || pc.slice(0, 7);
    }
    if (!paintsOn()) return;
    // 1) Пейнт PLUS.
    if (pu && pu.paint != null) {
      const p = CPX.cosm.plusPaint(pu.paint);
      const cls = p && CPX.paints.plus(pu.paint, p.v, p.spec);
      if (cls) {
        const a = CPX.paints.animOf(p.spec);
        CPX.paints.wear(el, cls, a.kind !== "none" && p.spec.type !== "image" ? a.speed : 0, a.kind);
        return;
      }
    }
    // 2) Пейнт 7TV (у клиента — тоже поверх цвета PLUS).
    if (!u.id) return;
    const c = CPX.cosm.user(u.id, channelId);
    if (c && c.p) {
      const cls = CPX.paints.stv(CPX.cosm.paint7(c.p));
      if (cls) CPX.paints.wear(el, cls, 0);
    }
  }
  CPX.paints.dress = dress;

  function decorate(ctx) {
    const el = ctx && ctx.el && ctx.el.name;
    if (!el) return;
    const u = ctx.user;
    dress(el, u && u.id ? u : null, ctx.channelId);
  }

  CPX.line.addDecorator({ name: "paint", order: 30, fn: decorate });
  CPX.settings.on("emotes.paints", () => CPX.line.refresh({}));
})();

// ── src/main/62_badges.js ──
/* Мир страницы: сторонние бейджи и бейдж PLUS — украшение строки «badges» (order 20).
 *
 * Порядок — как в клиенте (MessageBuilder.cpp:2855-2862): Twitch (рисует список) → Chatterino
 * (+ Homies) → FFZ (+ бейджи FFZ канала, FFZ:AP) → BTTV → 7TV → PLUS. Бейдж PLUS — последним,
 * вплотную к нику (решение владельца), подсказка «Chatterino+ PLUS · N мес.».
 * Значок PLUS — тот, что человек надел из своей коллекции (по месяцам подписки, сервер 20.10): badge_id →
 * каталог CPX.cosm.plusSet(), картинка под тему Twitch (light — для светлой), подсказка — название из
 * каталога и «Подписка: N мес.» (у особого значка с solo — «Владелец Chatterino+» — только название, без стажа;
 * сервер 24.10). Нет номера или его нет в каталоге — стандартный (m1 каталога, без каталога —
 * badges.plus). Только здесь, перед ником:
 * карточка и настройки — со стандартным (решение владельца).
 * Вид — как у бейджей Twitch: 18×18, отступ справа 3 px, по центру строки; картинки 1x/2x/4x.
 * Бейджи FFZ — белый знак на цвете бейджа (как у самого FFZ). Свои значки модератора/VIP канала
 * FFZ заменяют значки Twitch (как клиент, настройка «Бейджи FrankerFaceZ»).
 * Повторяемость: при refresh сначала убираем свои прежние (.cpx-xb), потом ставим заново.
 * Свои бейджи — прямо в ctx.el.badges, без обёртки: вёрстка контейнера бейджей — забота списка.
 * Картинка не загрузилась — учёт неудач CPX.imgGate (52): новые строки этот адрес до срока не просят (поток запросов,
 * 18.11). Значок PLUS при этом не пропадает: вместо него — встроенный стандартный (static/img/plus/m1-*, та же картинка
 * m1, что у сервера; задание основного чата 18.11 — «подписчик PLUS никогда не остаётся совсем без значка»).
 */

(() => {
  CPX.i18n.add({
    ru: { "badge.plus.months": "{title} · {n} мес.", "badge.plus.tenure": "Подписка: {n} мес." },
    en: { "badge.plus.months": "{title} · {n} mo.", "badge.plus.tenure": "Subscribed: {n} mo." },
  });

  // Приставка ключа → настройка и место в порядке.
  const SRC = [
    ["chatterino", "emotes.badges.chatterino"],
    ["homies1", "emotes.badges.homies"],
    ["homies2", "emotes.badges.homies"],
    ["homies3", "emotes.badges.homies"],
    ["ffz", "emotes.badges.ffz"],
    ["ffzap", "emotes.badges.ffzap"],
    ["bttv", "emotes.badges.bttv"],
  ];
  const RANK = new Map(SRC.map((s, i) => [s[0], i]));
  const SETTING = new Map(SRC);
  const on = (key) => CPX.settings.get(key) === true;
  const prefix = (k) => k.slice(0, k.indexOf(":"));

  // Встроенный стандартный значок PLUS (адрес файла расширения — у моста; пока не знаем — без запасного).
  let builtin = "";
  CPX.bg.call("iso.url", { path: "img/plus/" }).then(
    (u) => (builtin = typeof u === "string" && /^(chrome|moz)-extension:\/\/[^/]+\/img\/plus\/$/.test(u) ? u : ""),
    () => {}
  );
  /** Запасной значок PLUS: {1,2,4} под тему или null. */
  function fallbackPlus(light) {
    if (!builtin) return null;
    const t = light ? "light" : "dark";
    return { 1: builtin + "m1-" + t + "-18.png", 2: builtin + "m1-" + t + "-36.png", 4: builtin + "m1-" + t + "-72.png" };
  }
  const srcsetOf = (one, two, four) => one + " 1x" + (two !== one ? ", " + two + " 2x" : "") + (four !== two ? ", " + four + " 4x" : "");

  /** Картинка бейджа; fb — запасные адреса {1,2,4} (значок PLUS): не загрузилась или недавно не грузилась — они. */
  function badgeImg(def, extraCls, fb) {
    const u = def && def.u;
    // Исходные адреса; бейджи 7TV (прямо/зеркало PLUS, очередь) грузит CPX.imgRoute.
    let one = u && CPX.safe.imgUrl(u[1]);
    if (!one) return null;
    let two = CPX.safe.imgUrl(u[2]) || one;
    let four = CPX.safe.imgUrl(u[4]) || two;
    const G = CPX.imgGate;
    let useFb = false;
    // Картинка нашего сервера — ещё одна попытка через другую дверь (CPX.safe.otherDoor: ws.chat.eblo.id ↔ chat.eblo.id;
    // 20.11 хостер закрывал ws «проверкой браузера» — вместо значка ивента у ника вставал стандартный PLUS).
    let door = false;
    const toDoor = () => {
      const a = CPX.safe.otherDoor(one);
      if (door || !a || (G && !G.allow(a))) return false;
      door = true;
      [one, two, four] = [a, CPX.safe.otherDoor(two) || a, CPX.safe.otherDoor(four) || a];
      return true;
    };
    if (G && !G.allow(one, { queued: !!(CPX.imgRoute && CPX.imgRoute.handles && CPX.imgRoute.handles(one)) }) && !toDoor()) {
      if (!fb) return null;
      [one, two, four] = [fb[1], fb[2], fb[4]];
      useFb = true;
    }
    const im = document.createElement("img");
    im.className = "cpx-xb" + (extraCls ? " " + extraCls : "");
    im.alt = def.title || "";
    im.decoding = "async";
    im.draggable = false;
    im.width = 18;
    im.height = 18;
    const set = srcsetOf(one, two, four);
    const bg = CPX.safe.hex(def.color);
    if (bg) {
      im.style.backgroundColor = bg.slice(0, 7);
      im.classList.add("cpx-xb-colored");
    }
    // Не загрузился — бейджа будто и не было (без пустого места); у значка PLUS — встроенный (не загрузился и он — убрать).
    let unwatch = null;
    // why: строка — от очереди 64 (ошибки в счёт паузы сайта она ставит сама, К4); событие error — своя картинка.
    const dead = (why) => {
      if (!useFb) {
        if (G && typeof why !== "string") G.fail(one);
        if (unwatch) unwatch(); // загрузка запасного — не удача исходного адреса
        if (toDoor()) {
          doorTip();
          if (G) unwatch = G.watch(im, one, { errors: false });
          im.srcset = srcsetOf(one, two, four);
          im.src = one;
          im.addEventListener("error", dead, { once: true });
          return;
        }
        if (fb) {
          useFb = true;
          fbTip();
          im.srcset = srcsetOf(fb[1], fb[2], fb[4]);
          im.src = fb[1];
          im.addEventListener("error", () => im.remove(), { once: true });
          return;
        }
      }
      im.remove();
    };
    if (useFb || !(CPX.imgRoute && CPX.imgRoute.load(im, one, set, dead))) {
      im.srcset = set;
      im.src = one;
      im.addEventListener("error", dead, { once: true });
    }
    if (G && !useFb) unwatch = G.watch(im, one, { errors: false });
    im.__cpxBadge = { title: def.title || "", img: u[4] || u[2] || u[1] };
    if (useFb) fbTip();
    else if (door) doorTip();
    return im;
    /** Пошли через другую дверь — и крупная картинка подсказки оттуда же. */
    function doorTip() {
      if (!im.__cpxBadge || im.__cpxBadge.fb) return;
      im.__cpxBadge.img = CPX.safe.otherDoor(im.__cpxBadge.img) || im.__cpxBadge.img;
      im.__cpxBadge.door = true;
    }
    /** Встал встроенный значок — и в подсказке встроенный крупный (тёмный: подсказка всегда тёмная), а не серверный,
     *  который не грузится (ревью 19.11: битая картинка и лишний запрос на каждое наведение). */
    function fbTip() {
      if (!im.__cpxBadge) return;
      im.__cpxBadge.img = fb[4].replace("-light-", "-dark-");
      im.__cpxBadge.fb = true;
    }
  }

  /* Свои значки модератора и VIP канала FFZ — вместо значков Twitch, как у клиента
   * (MessageBuilder.cpp:337-362; значок модератора — на зелёном #34AE0A, ModBadgeElement).
   * Значки Twitch рисует список (img.cpx-badge--tw, data-cpx-badge="набор/версия"); при refresh
   * он рисует их заново, а без перерисовки (удаление сообщения) повторно не трогаем — метка.
   * Значок FFZ не загрузился (у владельца 07.10 в Helium — вместо него подпись «М…») — назад к значку Twitch
   * (обработчик ошибки — у списка, 41: img._cpxBack), а адрес запоминаем: дальше сразу значок Twitch. */
  const ffzBad = new Set();
  function ffzRoomBadges(ctx, box) {
    if (!on("emotes.badges.ffz")) return;
    const fb = CPX.emotes.ffzBadges(ctx.channelId);
    if (!fb || (!fb.mod && !fb.vip)) return;
    const r = CPX.emotes.route;
    for (const img of box.querySelectorAll(":scope > img.cpx-badge--tw")) {
      if (img.dataset.cpxFfz) continue;
      const set = String(img.dataset.cpxBadge || "").split("/")[0];
      const mod = set === "moderator" || set === "lead_moderator";
      const u = mod ? fb.mod : set === "vip" ? fb.vip : null;
      const one = u && CPX.safe.imgUrl(r(u[1]));
      if (!one || ffzBad.has(one)) continue;
      const two = CPX.safe.imgUrl(r(u[2])) || one;
      const four = CPX.safe.imgUrl(r(u[4])) || two;
      const tw = { src: img.getAttribute("src"), srcset: img.getAttribute("srcset") };
      img._cpxBack = () => {
        ffzBad.add(one);
        img.dataset.cpxFfz = "x";
        img.style.backgroundColor = "";
        img.classList.remove("cpx-xb-colored");
        if (tw.srcset) img.srcset = tw.srcset;
        else img.removeAttribute("srcset");
        img.src = tw.src;
      };
      img.dataset.cpxFfz = "1";
      img.srcset = one + " 1x" + (two !== one ? ", " + two + " 2x" : "") + (four !== two ? ", " + four + " 4x" : "");
      img.src = one;
      if (mod) {
        img.style.backgroundColor = "#34ae0a";
        img.classList.add("cpx-xb-colored");
      }
    }
  }

  function decorate(ctx) {
    const box = ctx && ctx.el && ctx.el.badges;
    if (!box) return;
    for (const old of box.querySelectorAll(":scope > .cpx-xb")) old.remove();
    CPX.safely("badges:ffz-room", () => ffzRoomBadges(ctx, box));
    const u = ctx.user;
    if (!u || !u.id) return;
    const add = [];
    const c = CPX.cosm.user(u.id, ctx.channelId);
    if (c) {
      const keys = (c.x || []).filter((k) => {
        const s = SETTING.get(prefix(k));
        return s && on(s);
      });
      keys.sort((a, b) => RANK.get(prefix(a)) - RANK.get(prefix(b)));
      for (const k of keys) add.push(badgeImg(CPX.cosm.xdef(k)));
      if (c.b && CPX.settings.get("emotes.badges.stv") !== false) {
        const d = CPX.cosm.badge7(c.b);
        if (d) add.push(badgeImg(d));
      }
    }
    // PLUS — последним, вплотную к нику.
    const pu = CPX.cosm.plus(u.id) || CPX.cosm.plus(u.login);
    if (pu && pu.badge) {
      const set = CPX.cosm.plusSet() || {};
      const has = (k) => !!k && Object.hasOwn(set, k);
      // Нет номера (или неизвестный) — стандартный «m1» из каталога: картинка та же, но есть светлая (белый плюс
      // badges.plus на светлой теме Twitch почти не виден); каталога нет (старый сервер) — badges.plus.
      const own = has(pu.badge_id) ? set[pu.badge_id] : has("m1") ? set.m1 : null;
      const pb = own || CPX.cosm.plusBadge();
      const kit = CPX.listKit; // у мира Kick нашего списка нет — тема тёмная
      const urls = own && own.light && kit && kit.theme() === 0 ? own.light : pb && pb.urls;
      // Подпись — по языку интерфейса расширения: у значков каталога есть title_en (сервер п.135, 09.11).
      const title = own && own.title_en && CPX.i18n.lang !== "ru" ? own.title_en : pb && pb.title;
      const light = !!(own && own.light && kit && kit.theme() === 0);
      const im = urls && badgeImg({ title, u: { 1: urls["1x"], 2: urls["2x"], 4: urls["4x"] } }, "cpx-xb-plus", fallbackPlus(light));
      if (im) {
        // Подсказка всегда тёмная (58_emote_tooltip) — крупная картинка в ней тёмной темы и на светлой теме Twitch.
        if (own && own.urls && !im.__cpxBadge.fb) {
          const big = own.urls["4x"] || own.urls["1x"] || im.__cpxBadge.img;
          im.__cpxBadge.img = im.__cpxBadge.door ? CPX.safe.otherDoor(big) || big : big;
        }
        if (own && own.solo) {
          // особый значок (solo) — подсказка: картинка и название, без стажа
        } else if (pu.months && own) im.__cpxBadge.lines = [CPX.t("badge.plus.tenure", { n: pu.months })];
        else if (pu.months) im.__cpxBadge.title = CPX.t("badge.plus.months", { title, n: pu.months });
        add.push(im);
      }
    }
    for (const im of add) if (im) box.appendChild(im);
  }

  CPX.line.addDecorator({ name: "badges", order: 20, fn: decorate });

  CPX.tip.register(".cpx-xb", (el) => {
    const b = el.__cpxBadge;
    if (!b) return null;
    return { img: b.img, w: 72, h: 72, title: b.title, lines: b.lines };
  });

  CPX.settings.onAny((ch) => {
    if (Object.keys(ch).some((k) => k.startsWith("emotes.badges."))) CPX.line.refresh({});
  });
})();

// ── src/main/64_mirror_img.js ──
/* Мир страницы: картинки 7TV (смайлики, бейджи, пейнты) напрямую или через зеркало PLUS (этап 5).
 *
 * Решает фон (CPX.mirror, 50–54), здесь — исполнение для <img> и CSS. Состояние от фона без
 * секретов: { on — зеркало разрешено (подписчик PLUS с живым пропуском), base — адрес нашего
 * сервера, first — картинки 7TV сейчас «сначала зеркалом» (прямой путь сбоит) }. Пропуск к
 * картинкам добавляет сам браузер правилом DNR фона — страница его не видит и не хранит.
 *
 * Как грузится картинка 7TV (как клиент + приёмы нашего экранного чата chat/web/src/common/15_stv.js):
 *  • план: зеркала нет — только напрямую (как раньше); есть — [прямо, зеркало], а при «first» —
 *    [зеркало, прямо];
 *  • прямо — через СВОЮ ОЧЕРЕДЬ (ниже); ошибка или не пришла за DIRECT_WAIT (30 с с выхода из очереди) — следующая
 *    попытка (через зеркало); без зеркала не обрываем (К3), только отдаём место в очереди;
 *  • зеркало — через ОЧЕРЕДЬ: 🔴прослойка перед нашим сервером (webcore) роняла пачки запросов
 *    ответами 500/502, а строка чата с десятком смайликов — это пачка. Предел MAX (32, замер 19.11) — на ВСЕ
 *    вкладки: они идут к серверу одним соединением, поэтому вкладка берёт свою долю (фон сообщает,
 *    сколько вкладок с чатом). Уже загруженный адрес (он в памяти/кэше браузера) идёт мимо очереди;
 *  • строки нет в документе (чат свёрнут, React пересоздал список, пауза) — картинку не теряем:
 *    откладываем (park) и грузим, когда строка вернётся; срезанные потолком списка выбросит срок;
 *  • план исчерпан — ещё одна попытка через RETRY_MS (разовый сбой по дороге), потом onDead:
 *    вызывающий покажет имя смайлика текстом / уберёт слой или бейдж;
 *  • итоги — фону пачкой раз в FLUSH_MS (удачи — реже). ⚠️<img> не отличает «смайлика нет (404)»
 *    от «связь режут» — неудачи фон перепроверяет своим запросом, сами мы их сбоем пути не
 *    объявляем. И не отличает загрузку по сети от кэша — картинки, взятые из памяти браузера
 *    (мимо очереди как уже загруженные или готовые сразу после установки адреса), удачей не
 *    докладываем; остальные удачи фон берёт только в счёт подсказки не-подписчику;
 *  • связь вернулась (событие фона "mirror.revive") — перерисовать строки, где картинки умерли, и
 *    заново собрать пейнты 7TV, чьи картинки не пришли (CPX.paints.retryFailed);
 *  • картинки 7TV, которые грузят другие модули сами (подсказка смайлика 58, выпадашка поля ввода
 *    76 — адрес им даёт CPX.emotes.setImgRoute), при ошибке пробуют другой путь (не больше двух
 *    раз) — общим перехватчиком ошибок картинок документа (только наши картинки, класс cpx-…).
 *
 * МЕДЛЕННЫЙ 7TV (правила К1–К8 основного чата 19.11, chatterino7-src/docs/plus/КАРТИНКИ-МЕДЛЕННЫЙ-СЕРВИС-ПРАВИЛА-1119.md).
 * 18.11 вечером cdn.7tv.app был медленным, но живым (30–80 КБ/с на соединение, отдельные картинки по 15–26 с), а
 * браузер ведёт все картинки сайта одним соединением: окно смайликов разом просило сотни картинок, видимые ждали в
 * общей куче, а истёкшие сроки шли в счёт паузы сайта (52) — и вставали смайлики в чате.
 *  • К1, К2: картинки 7TV «напрямую» — очередью вкладки с тремя уровнями (prio): 0 — видимое (строки чата, видимые
 *    клетки окна, пейнты), 1 — анимации видимых клеток, 2 — фоновое (догрузка набора, «наперёд», прогрев). Сначала
 *    уровень выше. Одновременно — D.max: загрузки короче 1 с — +1 (до 48), дольше 4 с — вдвое меньше (до 6);
 *    уже пришедшее на этой странице (okDirect, кэш браузера) — мимо очереди (К8);
 *  • К3: срок — с выхода из очереди, 30 с; без зеркала картинку не обрываем, только отдаём её место;
 *  • К4: перед стартом из очереди — не на паузе ли сайт (CPX.imgGate.paused); ошибку самой картинки напрямую в счёт
 *    паузы ставит ЗДЕСЬ (истёкший срок — нет); onDead(why) говорит вызывающему, почему не пришла: "error", "timeout",
 *    "paused";
 *  • К5: на дне очереди картинки трижды за 30 с шли дольше 4 с или 8 с не пришло ничего при 3+ идущих — 7TV
 *    «медленный» на 15 минут (slow()): подписчик PLUS — сначала зеркало (как при first; ждущие очереди «напрямую»
 *    уходят туда сразу, удачи напрямую назад не переключают), остальным окно смайликов грузит только видимое и без
 *    анимаций в сетке (79_emote_menu_ui).
 *
 * ПЕРЕХВАТ ПУТИ «НАПРЯМУЮ» (владелец 23.10: «jeetbot со своим прокси смайликов 7tv … у наших платных подписчиков»).
 * Другое расширение может правилом DNR уводить картинки cdn.7tv.app со страниц Twitch на свой сервер (JeetBot по
 * умолчанию — все /emote/ на ext-03.jeetbot.cc; тот не отвечает — смайлики 7TV не грузятся). Фон проверяет 7TV своим
 * запросом — мимо такого правила, перехвата не видит и «сначала зеркало» не включает. Поэтому у PLUS (без зеркала
 * другого пути нет) вкладка раз проверяет сама: запрос страницы HEAD к маленькой картинке 7TV вернулся с чужого адреса
 * или упал дважды (через 5 с) — в этой вкладке картинки 7TV «сначала зеркалом» (hijack; фон этот признак не снимает).
 *
 * Адрес зеркала строится ЗДЕСЬ из уже проверенного адреса cdn.7tv.app: base (один из двух
 * наших адресов; в dev — 127.0.0.1/localhost) + /mirror/h/cdn.7tv.app + путь (белый список
 * сервера: /(emote|badge|paint|user)/…, без запроса ?…: сервер его не пускает).
 *
 * API:
 *   CPX.imgRoute(url) → { url, queued } — адрес для показа сейчас (для 7TV при «first» — зеркало;
 *                        queued — грузить через очередь, т.е. лучше звать .load)
 *   CPX.imgRoute.load(img, src, srcset, onDead(why), {anchor, detached, prio}?) → true, если это картинка 7TV и
 *                        загрузку взяли на себя (src/srcset ставим сами); false — не наша, вызывающий ставит сам.
 *                        detached — грузится вне документа без места (фоновая догрузка): «ушла» не бывает; prio — 0…2
 *   CPX.imgRoute.slow() → 7TV сейчас «медленный» (К5) · .pending(prio) → сколько картинок уровня prio и выше ещё
 *                        ждут очереди или идут (окно смайликов: фоновое — только когда видимое пришло)
 *   CPX.imgRoute.preload(url, cb) → true, если взяли (7TV): cb(адрес, который загрузился | null, why) —
 *                        для CSS-фона пейнтов (правило ставится только загруженной картинке)
 *   CPX.imgRoute.safe(url) → адрес, годный в CSS url(): наш адрес зеркала или CPX.safe.imgUrl
 *   CPX.imgRoute.state() → { on, base, first, tabs, hijack } (hijack — путь «напрямую» со страницы перехвачен)
 *   CPX.imgRoute.cancel(img) → true, если загрузку этой картинки вели мы и отменили (без повторов и
 *     onDead; место в очереди — следующим; адрес снят — браузер обрывает запрос). Меню смайликов:
 *     анимация плитки, уехавшей с экрана, не делит медленный канал с видимыми.
 * Подсказка не-подписчику (событие фона "mirror.hint" или вопрос mirror.hintClaim, когда вкладку
 * стало видно) — тостом CPX.ui.toast, только в ВИДИМОЙ вкладке; показали — сообщаем фону
 * (mirror.hintShown: «раз в сутки» — от показа). Тостов нет — не подтверждаем, её покажет popup
 * (метод фона mirror.hint). Владелец 23.10: только если 7TV в чате правда не работает — картинки смайликов 7TV в
 * строках чата видны (хоть одна загрузилась) — не показываем и не подтверждаем; крестик тоста — «больше не
 * показывать» (mirror.hintOff, фон больше не решает показывать).
 */

CPX.imgRoute = (() => {
  const log = CPX.log("mirror-img");
  const CDN = "cdn.7tv.app";
  const CDN_RE = /^https:\/\/cdn\.7tv\.app\//;
  const PATH_RE = /^\/(?:emote|badge|paint|user)\/[0-9A-Za-z._/-]{1,200}$/;
  const OUR = ["https://ws.chat.eblo.id", "https://ws.rish098.xyz"];
  const DIRECT_WAIT = 30000; // К3: с выхода из очереди
  const MIRROR_WAIT = 30000;
  const RETRY_MS = 3000;
  // Замер 19.11 на тестовом PLUS через ws.chat.eblo.id (по 30 с, новые картинки набора xqc): 4 — 200 из 200, 16 —
  // 350 из 350, 32 — 419 из 419, отказов 0 (клиент ПК — до 48 без отказов). Было 4 — набор окна шёл минутами.
  const MAX = 32;
  // И не чаще RATE запусков в секунду на ВСЕ вкладки (доля вкладки — RATE / tabs): пределы сервера на человека — 3000
  // картинок в минуту, 120 запросов в секунду с адреса; без него при «сначала зеркало» окно смайликов брало весь набор
  // (~1100 картинок) за 10 с — ~110 в секунду (замер 19.11). 25 в секунду — набор за ~40 с, как у клиента ПК.
  const RATE = 25;
  // Очередь «напрямую» (К2, К5)
  const D_START = 16;
  const D_MIN = 6;
  const D_MAX = 48;
  const D_FAST = 1000;
  const D_SLOW = 4000;
  const D_STALL = 8000;
  const SLOW_HITS = 3;
  const SLOW_WIN = 30000;
  const SLOW_MS = 15 * 60000;
  const D_QMAX = 1500; // ждущих очереди «напрямую» не больше: молчащий 7TV на людном чате — сотни новых в минуту (замер 19.11)
  const FLUSH_BAD_MS = 2000;
  const FLUSH_OK_MS = 10000;
  const GONE_MS = 2000;
  const PARK_MAX = 400;
  const PARK_MS = 10 * 60000;
  const ALT_MAX = 2;
  const PROBE = "https://cdn.7tv.app/emote/01F00Z3A9G0007E4VV006YKSK9/1x.webp"; // ~1 КБ, без переадресации у 7TV
  const PROBE_RETRY_MS = 5000;

  let st = { on: false, base: "", first: false, tabs: 1 };
  const loadedOk = new Set(); // ключи (src|srcset) картинок зеркала, что уже загрузились
  const managed = new WeakSet(); // <img>, которые грузим мы (план путей, очередь)
  const stats = { direct: 0, mirror: 0, cached: 0, fallback: 0, retry: 0, dead: 0, queued: 0, queueMax: 0, suspect: 0, parked: 0, unparked: 0, alt: 0, dQueued: 0, dQueueMax: 0, slow: 0, paused: 0, timeouts: 0, linger: 0, dropped: 0 };
  const okDirect = new CPX.LRU(5000); // адреса, пришедшие напрямую на этой странице (кэш браузера) — мимо очереди (К8)
  let deadSinceRevive = 0;
  let hijack = null; // путь «напрямую» со страницы: null — не проверяли, false — чистый, true — перехвачен (см. шапку)

  /* ── Адреса ─────────────────────────────────────────────────────────────── */

  function validBase(b) {
    if (OUR.includes(b)) return b;
    if (CPX.dev && typeof b === "string" && /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d{1,5})?$/.test(b)) return b;
    return "";
  }

  function apply(s) {
    const base = validBase(s && s.base);
    const tabs = Math.max(1, Math.min(16, Math.floor(Number(s && s.tabs)) || 1));
    const next = { on: !!(s && s.on) && !!base, base, first: !!(s && s.first) && !!base, tabs };
    if (next.on !== st.on || next.first !== st.first || next.base !== st.base) {
      log.debug("зеркало картинок:", next.on ? (next.first ? "сначала зеркало" : "запасной путь") : "нет");
    }
    st = next;
    if (st.on && hijack === null) probe(0);
    pump(); // доля вкладки могла вырасти
  }

  /** Перехвачен ли путь «напрямую» со страницы (см. шапку). */
  function probe(n) {
    hijack = false;
    fetch(PROBE + "?cpxp=" + Date.now(), { method: "HEAD", cache: "no-store", credentials: "omit" })
      .then((r) => {
        let host = CDN;
        try {
          host = new URL(r.url).hostname;
        } catch (_) {}
        if (r.redirected && host !== CDN) found("уводит на " + host);
      })
      .catch(() => {
        if (n < 1) setTimeout(() => probe(n + 1), PROBE_RETRY_MS);
        else found("не отвечает");
      });
  }
  function found(why) {
    hijack = true;
    log.info("картинки 7TV со страницы перехвачены (" + why + ") — в этой вкладке сначала зеркало");
  }
  const slowNow = () => Date.now() < D.slowUntil;
  // Сначала зеркало: фон велел (прямой путь сбоит), путь со страницы перехвачен или 7TV «медленный» (К5).
  const first = () => st.first || hijack === true || (st.on && slowNow());

  /** Своя доля предела: вкладки идут к серверу одним соединением. */
  const maxNow = () => Math.max(1, Math.floor(MAX / st.tabs));

  const isCdn = (url) => typeof url === "string" && CDN_RE.test(url);

  function toMirror(url) {
    if (!st.on || !st.base) return "";
    let u;
    try {
      u = new URL(url);
    } catch (_) {
      return "";
    }
    const p = u.pathname;
    if (u.protocol !== "https:" || u.hostname !== CDN || !PATH_RE.test(p) || /\.\.|\/\/|\/\.\//.test(p) || p.endsWith("/.")) return "";
    return st.base + "/mirror/h/" + CDN + p;
  }

  /** srcset «адрес 1x, адрес 2x» → те же плотности на зеркале ("" — не вышло). */
  function mirrorSet(srcset) {
    if (!srcset) return "";
    const out = [];
    for (const part of String(srcset).split(",")) {
      const [u, d] = part.trim().split(/\s+/);
      const m = toMirror(u);
      if (!m) return "";
      out.push(m + (d ? " " + d : ""));
    }
    return out.join(", ");
  }

  function isMirrorUrl(url) {
    if (!st.base || typeof url !== "string" || !url.startsWith(st.base + "/mirror/h/" + CDN + "/")) return false;
    const p = url.slice((st.base + "/mirror/h/" + CDN).length);
    return PATH_RE.test(p) && !/\.\.|\/\/|\/\.\//.test(p);
  }

  /** Тот же файл другим путём: зеркало ↔ напрямую ("" — не 7TV или зеркала нет). */
  function otherPath(url) {
    if (isMirrorUrl(url)) return "https://" + CDN + url.slice((st.base + "/mirror/h/" + CDN).length);
    return isCdn(url) ? toMirror(url) : "";
  }

  function imgRoute(url) {
    if (st.on && first() && isCdn(url)) {
      const m = toMirror(url);
      if (m) return { url: m, queued: true };
    }
    return { url, queued: false };
  }

  /* ── Отчёты фону ────────────────────────────────────────────────────────── */

  const rep = { d: 0, m: 0, bad: [] };
  let flushT = 0;
  let flushAt = 0;
  function flushSoon(ms) {
    const at = Date.now() + ms;
    if (flushT && flushAt <= at) return;
    clearTimeout(flushT);
    flushAt = at;
    flushT = setTimeout(flush, ms);
  }
  function flush() {
    flushT = 0;
    if (!rep.d && !rep.m && !rep.bad.length) return;
    const p = { ok: { d: rep.d, m: rep.m }, bad: rep.bad.splice(0) };
    rep.d = 0;
    rep.m = 0;
    CPX.bg.call("mirror.note", p).catch(() => {});
  }
  function report(kind, ok, url) {
    if (ok) {
      rep[kind]++;
      flushSoon(FLUSH_OK_MS);
      return;
    }
    stats.suspect++;
    // Образец адреса — один на вид (фон перепроверит его сам), плюс сколько всего упало.
    const b = rep.bad.find((x) => x.k === kind);
    if (b) b.n++;
    else rep.bad.push({ k: kind, u: url, n: 1 });
    flushSoon(FLUSH_BAD_MS);
  }

  /* ── Очередь к зеркалу ──────────────────────────────────────────────────── */

  let busy = 0;
  const queue = [[], [], []]; // по уровням prio (см. шапку «МЕДЛЕННЫЙ 7TV»)
  const mJobs = new Set(); // идущие через зеркало (для pending)
  const qLen = (qs) => qs[0].length + qs[1].length + qs[2].length;
  /** Следующее задание очереди по уровням (отменённые — мимо). */
  function nextOf(qs) {
    for (const q of qs) {
      while (q.length) {
        const job = q.shift();
        if (!job.cancelled) return job;
      }
    }
    return null;
  }
  function enqueue(job) {
    queue[job.prio].push(job);
    stats.queued++;
    if (qLen(queue) > stats.queueMax) stats.queueMax = qLen(queue);
    pump();
  }
  // Ведро запусков к зеркалу (RATE в секунду на все вкладки).
  let tokens = RATE;
  let tokAt = Date.now();
  let rateT = 0;
  function take() {
    const now = Date.now();
    const r = RATE / st.tabs;
    tokens = Math.min(r, tokens + ((now - tokAt) / 1000) * r);
    tokAt = now;
    if (tokens >= 1) {
      tokens -= 1;
      return true;
    }
    if (!rateT) {
      rateT = setTimeout(() => {
        rateT = 0;
        pump();
      }, Math.ceil(((1 - tokens) / r) * 1000));
    }
    return false;
  }
  function pump() {
    while (busy < maxNow()) {
      if (!qLen(queue) || !take()) return;
      const job = nextOf(queue);
      if (!job) return;
      if (gone(job)) {
        park(job, () => enqueue(job));
        continue;
      }
      busy++;
      job.slot = true;
      job.mAt = Date.now();
      mJobs.add(job);
      go(job);
    }
  }
  function release(job) {
    if (!job.slot) return;
    job.slot = false;
    busy = Math.max(0, busy - 1);
    mJobs.delete(job);
    pump();
  }

  /* ── Очередь «напрямую» (К1, К2, К5) ────────────────────────────────────── */

  // linger — «зависшие»: шли дольше D_STALL, место в очереди отдали, но не оборваны (К3); вместе с идущими — не больше D_MAX.
  const D = { q: [[], [], []], busy: 0, linger: 0, live: [0, 0, 0], max: D_START, lastAdj: 0, lastDone: 0, busyFrom: 0, hits: [], slowUntil: 0, slowWhy: "" };
  function dEnqueue(job) {
    D.q[job.prio].push(job);
    stats.dQueued++;
    // Переполнена — самое старое из самого низкого уровня: «не дождались» (без повтора; у подписчика — в зеркало).
    while (qLen(D.q) > D_QMAX) {
      const old = (D.q[2].length ? D.q[2] : D.q[1].length ? D.q[1] : D.q[0]).shift();
      if (old.cancelled) continue;
      stats.dropped++;
      old.retried = true;
      old.why = "timeout";
      result(old, false, "очередь переполнена", true);
    }
    if (qLen(D.q) > stats.dQueueMax) stats.dQueueMax = qLen(D.q);
    dPump();
  }
  function dPump() {
    while (D.busy < D.max && D.busy + D.linger < D_MAX) {
      const job = nextOf(D.q);
      if (!job) return;
      if (gone(job)) {
        park(job, () => dEnqueue(job));
        continue;
      }
      // К4: сайт на паузе предохранителя (52, настоящие отказы) — в сеть не идём.
      if (CPX.imgGate && CPX.imgGate.paused && CPX.imgGate.paused(job.one)) {
        stats.paused++;
        job.why = "paused";
        result(job, false, "сайт на паузе", true);
        continue;
      }
      if (!D.busy) D.busyFrom = Date.now();
      D.busy++;
      D.live[job.prio]++;
      job.dslot = true;
      job.dAt = Date.now();
      go(job);
      stallWatch();
    }
  }
  function dRelease(job, ok) {
    if (job.linger) {
      job.linger = false;
      D.linger = Math.max(0, D.linger - 1);
    }
    if (!job.dslot) {
      if (ok) D.lastDone = Date.now(); // докачалась после того, как отдала место (К3) — тоже «пришло»
      if (job.kind === "d") dPump();
      return;
    }
    job.dslot = false;
    D.busy = Math.max(0, D.busy - 1);
    D.live[job.prio] = Math.max(0, D.live[job.prio] - 1);
    if (ok) adapt(Date.now() - job.dAt);
    dPump();
  }
  /** Самонастройка числа одновременных (К2) и признак «медленно» на дне (К5). */
  function adapt(ms) {
    const now = Date.now();
    D.lastDone = now;
    if (ms < D_FAST) {
      D.max = Math.min(D_MAX, D.max + 1);
      return;
    }
    if (ms <= D_SLOW) return;
    if (D.max <= D_MIN) {
      D.hits = D.hits.filter((t) => now - t < SLOW_WIN);
      D.hits.push(now);
      if (D.hits.length >= SLOW_HITS) markSlow("на дне очереди картинки дольше " + D_SLOW / 1000 + " с");
    } else if (now - D.lastAdj > 1000) {
      D.max = Math.max(D_MIN, Math.floor(D.max / 2));
      D.lastAdj = now;
    }
  }
  /** Картинка идёт дольше D_STALL — место в очереди отдать, не обрывая (К3): иначе зависшие 7TV (по 15–26 с) держат
   *  все места, и смайлики новых строк чата ждут за ними (замер 19.11). Тогда «вставший» в счёт max не входит, но
   *  вместе с идущими их не больше D_MAX. */
  function dLinger(job) {
    if (!job.dslot) return;
    job.dslot = false;
    job.linger = true;
    D.busy = Math.max(0, D.busy - 1);
    D.live[job.prio] = Math.max(0, D.live[job.prio] - 1);
    D.linger++;
    stats.linger++;
    dPump();
  }

  /** «Встал»: 8 с не пришло ничего при 3+ идущих (К5). */
  let stallT = 0;
  function stallWatch() {
    if (stallT) return;
    stallT = setInterval(
      CPX.guard("mirror-img:stall", () => {
        if (!D.busy && !qLen(D.q)) {
          clearInterval(stallT);
          stallT = 0;
          return;
        }
        const now = Date.now();
        if (D.busy >= 3 && now - Math.max(D.lastDone, D.busyFrom) > D_STALL) {
          D.busyFrom = now;
          // Сайт молчит — сразу на дно (К2): иначе «вставшие» каждые 8 с освобождали бы места, и запросы шли бы
          // ~1,6 в секунду (замер 19.11); на дне — не больше D_MIN за 8 с, а всего «вставших» — не больше D_MAX.
          D.max = D_MIN;
          markSlow(D_STALL / 1000 + " с не пришло ничего");
        }
      }),
      2000
    );
  }
  function markSlow(why) {
    const was = slowNow();
    D.slowUntil = Date.now() + SLOW_MS;
    D.slowWhy = why;
    D.hits.length = 0;
    if (was) return;
    stats.slow++;
    log.info("картинки 7TV напрямую медленные (" + why + ") — 15 мин: " + (st.on ? "сначала зеркало" : "окно смайликов — только видимое, без анимаций"));
    if (!st.on) {
      // Без зеркала — только видимое: анимации окна и фоновое, что ещё ждут очереди, снять (окно их больше не просит).
      for (const q of [D.q[1], D.q[2]]) for (const job of q.splice(0)) cancel(job.im);
      return;
    }
    // Подписчик: всё, что ждёт очереди «напрямую», — сразу в зеркало.
    for (const q of D.q) {
      for (const job of q.splice(0)) {
        if (job.cancelled) continue;
        job.plan = ["m", "d"];
        job.i = 0;
        attempt(job);
      }
    }
  }

  /** Строки сейчас нет в документе (свежую ещё не вставили — не в счёт). Картинку, которая грузится
   * вне документа ради подмены (меню смайликов: анимированная поверх неподвижной), судим по её месту
   * (opts.anchor). */
  const placeOf = (job) => job.opts.anchor || (job.detached ? null : job.im);
  const gone = (job) => {
    const el = placeOf(job);
    return !!el && !el.isConnected && Date.now() - job.born > GONE_MS;
  };

  /* Отложенные. Строка ушла из документа, пока картинка ждала очереди или повтора: чат свёрнут,
   * React пересоздал список, пауза. Выбрасывать нельзя — вернётся строка с пустым местом. Ждём
   * её возвращения; срезанные потолком списка так и не вернутся — их выбросят срок и потолок. */
  const parked = new Map(); // задание → как продолжить
  let parkT = 0;
  function park(job, resume) {
    parked.delete(job);
    parked.set(job, resume);
    job.parkedAt = Date.now();
    stats.parked++;
    if (parked.size > PARK_MAX) parked.delete(parked.keys().next().value);
    if (!parkT) parkT = setInterval(CPX.guard("mirror-img:unpark", unpark), 1000);
  }
  function unpark() {
    const now = Date.now();
    for (const [job, resume] of parked) {
      const el = placeOf(job);
      if (!el || el.isConnected) {
        parked.delete(job);
        job.born = now;
        stats.unparked++;
        resume();
      } else if (now - job.parkedAt > PARK_MS) {
        parked.delete(job);
      }
    }
    if (!parked.size) {
      clearInterval(parkT);
      parkT = 0;
    }
  }

  /* ── Загрузка одной картинки ────────────────────────────────────────────── */

  function planOf() {
    return !st.on ? ["d"] : first() ? ["m", "d"] : ["d", "m"];
  }

  const jobOf = new WeakMap(); // картинка → её задание (для cancel)
  function start(im, one, srcset, opts) {
    const prio = Math.max(0, Math.min(2, Math.floor(Number(opts && opts.prio)) || 0));
    const job = { im, one, srcset: srcset || "", opts: opts || {}, plan: planOf(), i: 0, retried: false, t: 0, slot: false, dslot: false, token: 0, born: Date.now(), detached: !!(opts && opts.detached), cached: false, prio, why: "" };
    managed.add(im);
    jobOf.set(im, job);
    attempt(job);
  }

  function cancel(im) {
    const job = im && jobOf.get(im);
    if (!job) return false;
    jobOf.delete(im);
    job.cancelled = true;
    job.token++; // обработчики load/error идущей попытки — пустые
    clearTimeout(job.t);
    parked.delete(job);
    for (const q of queue.concat(D.q)) {
      const qi = q.indexOf(job);
      if (qi >= 0) q.splice(qi, 1);
    }
    release(job);
    dRelease(job, false);
    try {
      im.removeAttribute("srcset");
      im.removeAttribute("src");
    } catch (_) {
      /* картинка уже не наша */
    }
    return true;
  }

  function attempt(job) {
    if (job.cancelled) return; // отменили, пока ждала повтора
    const kind = job.plan[job.i];
    job.kind = kind;
    job.cached = false;
    if (kind === "m") {
      job.src = toMirror(job.one);
      job.set = mirrorSet(job.srcset);
      if (!job.src) return result(job, false, "нет адреса зеркала", true);
      job.key = job.src + "|" + job.set;
      if (loadedOk.has(job.key)) {
        // Уже загружали — возьмётся из памяти/кэша браузера: мимо очереди, и путь этим не проверен.
        job.cached = true;
        return go(job);
      }
      return enqueue(job);
    }
    // Повтор напрямую — с меткой в адресе: кэш ошибки у браузера не мешает (CDN её не видит).
    job.src = job.retried ? job.one + (job.one.indexOf("?") < 0 ? "?" : "&") + "cpxr=1" : job.one;
    job.set = job.retried ? "" : job.srcset;
    // Уже приходила напрямую на этой странице — из кэша браузера, мимо очереди (К8).
    if (!job.retried && okDirect.has(job.one)) {
      job.cached = true;
      return go(job);
    }
    dEnqueue(job);
  }

  function go(job) {
    const im = job.im;
    const my = ++job.token;
    const lastDirectOnly = job.kind === "d" && job.i + 1 >= job.plan.length && !st.on;
    let suspected = false;
    const done = (ok, why, kind) => {
      if (my !== job.token) return;
      job.token++;
      clearTimeout(job.t);
      clearTimeout(job.ts);
      im.removeEventListener("load", onLoad);
      im.removeEventListener("error", onErr);
      job.why = ok ? "" : kind || "error";
      release(job);
      dRelease(job, ok && job.kind === "d" && !job.cached);
      result(job, ok, why);
    };
    const onLoad = () => done(true);
    const onErr = () => done(false, "ошибка", "error");
    im.addEventListener("load", onLoad);
    im.addEventListener("error", onErr);
    const wait = job.kind === "m" ? MIRROR_WAIT : DIRECT_WAIT;
    if (job.dslot) job.ts = setTimeout(() => my === job.token && dLinger(job), D_STALL);
    job.t = setTimeout(() => {
      stats.timeouts++;
      // Без запасного пути (не подписчик) — не обрываем долгую картинку (К3): место в очереди отдаём, сама
      // докачается; фону — сообщить.
      if (lastDirectOnly) {
        if (!suspected) {
          suspected = true;
          report("d", false, job.one);
        }
        dRelease(job, false);
        return;
      }
      done(false, "не пришла за " + wait / 1000 + " с", "timeout");
    }, wait);
    if (job.set) im.srcset = job.set;
    else im.removeAttribute("srcset");
    im.src = job.src;
    // Готова сразу после установки адреса — из памяти браузера, по сети не ходили.
    if (im.complete && im.naturalWidth > 0) job.cached = true;
  }

  function result(job, ok, why, silent) {
    if (ok) {
      stats[job.kind === "m" ? "mirror" : "direct"]++;
      // Из кэша браузера путь не проверен — фону не докладываем (иначе картинка из кэша при
      // мёртвом зеркале «доказывала» бы, что оно живо).
      if (job.cached) stats.cached++;
      else report(job.kind, true);
      if (job.kind === "m" && job.key) {
        loadedOk.add(job.key);
        if (loadedOk.size > 3000) loadedOk.delete(loadedOk.values().next().value);
      }
      if (job.kind === "d") okDirect.set(job.one, 1);
      if (job.opts.onLoad) CPX.safely("mirror-img:load", () => job.opts.onLoad(job.src));
      return;
    }
    if (!silent) report(job.kind, false, job.one);
    // Ошибка самой картинки напрямую — в счёт паузы сайта (52; К4: только настоящие отказы, не «не дождались»). Здесь,
    // а не у вызывающих: иначе отказы окна смайликов (сотни клеток) паузу не включали (замер 19.11: 265 запросов).
    if (job.kind === "d" && job.why === "error" && CPX.imgGate) CPX.imgGate.fail(job.one);
    if (job.i + 1 < job.plan.length) {
      job.i++;
      stats.fallback++;
      log.debug("картинка 7TV:", why, "→", job.plan[job.i] === "m" ? "через зеркало" : "напрямую");
      return attempt(job);
    }
    if (!job.retried) {
      job.retried = true;
      stats.retry++;
      // Разовый сбой по дороге — ещё раз последним рубежом: зеркалом, если оно есть.
      const again = () => {
        job.plan = [st.on ? "m" : "d"];
        job.i = 0;
        attempt(job);
      };
      setTimeout(() => (gone(job) ? park(job, again) : again()), RETRY_MS);
      return;
    }
    stats.dead++;
    deadSinceRevive++;
    if (job.opts.onDead) CPX.safely("mirror-img:dead", () => job.opts.onDead(job.why || "error"));
  }

  /* ── API ────────────────────────────────────────────────────────────────── */

  /** opts.anchor — картинка грузится вне документа, а «на месте ли она» — по этому элементу; opts.detached — вне
   *  документа и без места (фоновая догрузка); opts.prio — уровень очереди (см. шапку). */
  function load(im, one, srcset, onDead, opts) {
    if (!im || !isCdn(one)) return false;
    const o = opts || {};
    start(im, one, srcset, { onDead, anchor: o.anchor || null, detached: !!o.detached, prio: o.prio || 0 });
    return true;
  }

  function preload(url, cb) {
    if (!isCdn(url)) return false;
    const im = new Image();
    im.decoding = "async";
    start(im, url, "", { detached: true, prio: 0, onLoad: (src) => cb(src), onDead: (why) => cb(null, why) });
    return true;
  }

  /** Сколько картинок уровня prio и выше ждут очереди или идут (обе очереди). Идущие дольше D_STALL не в счёт:
   *  одна зависшая видимая картинка не должна держать всё фоновое (замер 19.11: 15 с простоя). «Напрямую» такие уже
   *  отдали место (linger); у зеркала — по времени старта. */
  function pending(prio) {
    const top = Math.min(2, prio | 0);
    let n = 0;
    for (let p = 0; p <= top; p++) n += D.q[p].length + queue[p].length + D.live[p];
    if (busy) {
      const now = Date.now();
      for (const job of mJobs) if (job.prio <= top && now - job.mAt < D_STALL) n++;
    }
    return n;
  }

  function safe(url) {
    return isMirrorUrl(url) ? url : CPX.safe.imgUrl(url);
  }

  /* ── Связь с фоном ──────────────────────────────────────────────────────── */

  const fetchState = () =>
    CPX.bg
      .call("mirror.page")
      .then(apply)
      .catch(() => {});

  /* ── Подсказка не-подписчику ────────────────────────────────────────────── */

  let lastHint = null;
  const visible = () => document.visibilityState === "visible";
  const hasToast = () => !!(CPX.ui && typeof CPX.ui.toast === "function");

  /** Смайлики 7TV в чате видны: среди последних картинок 7TV в строках (напрямую или нашим зеркалом) есть загруженная. */
  function sevenTvVisible() {
    const imgs = [...document.querySelectorAll("img.cpx-em-img")].slice(-200);
    return imgs.some((im) => (CDN_RE.test(im.currentSrc || im.src) || isMirrorUrl(im.currentSrc || im.src)) && im.complete && im.naturalWidth > 0);
  }

  /** Показать тост и подтвердить фону. Тостов нет — не подтверждаем: покажет popup. */
  function showHint(h) {
    if (h && (CPX.settings.get("mirror.hintOff") === true || sevenTvVisible())) {
      lastHint = { at: Date.now(), svc: h.svc || "", toast: false, skipped: true };
      return;
    }
    if (!h || !hasToast()) {
      lastHint = { at: Date.now(), svc: (h && h.svc) || "", toast: false };
      return;
    }
    if (lastHint && lastHint.toast && Date.now() - lastHint.at < 60000) return; // уже показан здесь
    lastHint = { at: Date.now(), svc: h.svc || "", toast: true };
    const url = typeof h.url === "string" && /^https:\/\/chat\.eblo\.id\//.test(h.url) ? h.url : "";
    // Тост общих окон (97_ui_windows): {text, kind, timeout, action:{label, onClick}}.
    const shown = CPX.safely("mirror-img:hint", () => {
      CPX.ui.toast({
        text: h.text || CPX.t("mirror.hint.7tv"),
        kind: "info",
        timeout: 20000,
        // Весь тост — ссылка на оформление (владелец 23.10), кнопка — та же ссылка, явно.
        onClick: url ? () => window.open(url, "_blank", "noopener") : null,
        action: url ? { label: CPX.t("mirror.hint.cta"), onClick: () => window.open(url, "_blank", "noopener") } : null,
        dismiss: { label: CPX.t("mirror.hint.never"), onClick: () => CPX.settings.set("mirror.hintOff", true) },
      });
      return true;
    });
    if (shown) CPX.bg.call("mirror.hintShown").catch(() => {});
  }

  /** Спросить у фона, ждёт ли подсказка показа (когда вкладку видно). */
  let claimBusy = false;
  function claimHint() {
    if (claimBusy || !visible() || !hasToast()) return;
    claimBusy = true;
    CPX.bg
      .call("mirror.hintClaim")
      .then((h) => h && showHint(h))
      .catch(() => {})
      .finally(() => (claimBusy = false));
  }

  let waitingVisible = false;
  function whenVisible() {
    if (visible()) return claimHint();
    if (waitingVisible) return;
    waitingVisible = true;
    const on = () => {
      if (!visible()) return;
      document.removeEventListener("visibilitychange", on);
      waitingVisible = false;
      claimHint();
    };
    document.addEventListener("visibilitychange", on);
  }

  // Подсказка пришла в невидимую вкладку — не показываем в пустоту: спросим, когда её увидят
  // (к тому времени её мог показать кто-то другой).
  const onHintEvent = (h) => (visible() ? showHint(h) : whenVisible());

  /* ── Чужие картинки 7TV (мимо очереди) ─────────────────────────────────── */

  // Подсказка смайлика (58) и выпадашка поля ввода (76) грузят адрес от CPX.emotes.setImgRoute
  // сами, без плана путей. Ошибка — пробуем тот же файл другим путём (не больше ALT_MAX раз).
  // Ошибки загрузки не всплывают, но ловятся на погружении — одним перехватчиком на документ.
  // ⚠️Только НАШИ картинки (класс cpx-…): у стоящего рядом расширения 7TV при заблокированном
  // 7TV падают все картинки разом — увести их на зеркало мимо очереди значило бы пачку к webcore.
  function onAnyError(e) {
    const im = e.target;
    if (!st.on || !im || im.tagName !== "IMG" || managed.has(im) || !/(?:^|\s)cpx-/.test(im.className)) return;
    const n = Number(im.dataset.cpxAlt) || 0;
    if (n >= ALT_MAX) return;
    const alt = otherPath(im.currentSrc || im.src);
    if (!alt) return;
    im.dataset.cpxAlt = String(n + 1);
    stats.alt++;
    const set = im.getAttribute("srcset");
    if (set) {
      const parts = set.split(",").map((part) => {
        const [u, d] = part.trim().split(/\s+/);
        const a = otherPath(u);
        return a ? a + (d ? " " + d : "") : "";
      });
      if (parts.every(Boolean)) im.setAttribute("srcset", parts.join(", "));
      else im.removeAttribute("srcset");
    }
    im.setAttribute("src", otherPath(im.getAttribute("src") || "") || alt);
  }

  CPX.boot.add(
    "mirror-img",
    () => {
      fetchState();
      CPX.bg.on("mirror.page", apply);
      CPX.bg.on("bridge:bg", (d) => d && d.up && fetchState());
      CPX.bg.on("mirror.revive", () => {
        // Связь вернулась: картинки, умершие по сети, — заново (строки перерисуются целиком), и
        // пейнты 7TV, чьи картинки не пришли, — собрать заново (иначе ждали бы перезагрузки).
        const paints = CPX.safely("mirror-img:revive-paints", () => (CPX.paints && CPX.paints.retryFailed ? CPX.paints.retryFailed() : 0)) || 0;
        if (!deadSinceRevive && !paints) return;
        deadSinceRevive = 0;
        CPX.safely("mirror-img:revive", () => CPX.line.refresh({ body: true }));
      });
      CPX.bg.on("mirror.hint", onHintEvent);
      whenVisible(); // подсказка могла ждать, пока откроется вкладка
      // Список сменил канал или выключен — отложенные картинки прежних строк не нужны.
      if (CPX.list) CPX.list.on("detach", () => parked.clear());
      document.addEventListener("error", onAnyError, true);
      // Остальные потребители адресов 7TV (подсказка смайлика и т.п.) — «сначала зеркало», когда
      // прямой путь сбоит.
      if (CPX.emotes && CPX.emotes.setImgRoute) CPX.emotes.setImgRoute((u) => imgRoute(u).url);
    },
    64
  );

  CPX.diag.add("mirrorImg", () => ({
    state: Object.assign({}, st),
    hijack,
    busy,
    max: maxNow(),
    queue: qLen(queue),
    direct: { busy: D.busy, linger: D.linger, max: D.max, queue: qLen(D.q), byPrio: D.q.map((q) => q.length), slow: slowNow() ? D.slowWhy : "", okDirect: okDirect.map.size },
    parked: parked.size,
    loadedOk: loadedOk.size,
    dead: deadSinceRevive,
    stats: Object.assign({}, stats),
    hint: lastHint,
  }));

  imgRoute.load = load;
  imgRoute.preload = preload;
  imgRoute.safe = safe;
  imgRoute.state = () => Object.assign({ hijack: hijack === true }, st);
  imgRoute.toMirror = toMirror;
  imgRoute.cancel = cancel;
  imgRoute.slow = slowNow;
  imgRoute.handles = isCdn; // картинку ведёт очередь: паузу сайта (52) она проверяет сама перед стартом
  imgRoute.pending = pending;
  if (CPX.dev) imgRoute._dev = { showHint, sevenTvVisible, apply }; // стенд: подсказка про PLUS и состояние зеркала без фона
  return imgRoute;
})();

// ── src/kick/74_kick_ambient.js ──
/* Мир Kick: раскладка подсветки плеера («Кинозал», main/74_player_ambient.js) для kick.com — решение владельца 15.11;
 * 19.11 — «1 в 1 как на Twitch» (владелец): свет и без чата, «стекло» верхней и левой панелей с «притушить», чат — как у Kick.
 *
 * Движок света общий; здесь только «где что» на странице Kick (стенды 15.11 и 19.11):
 *   • видео — <video> в #injected-embedded-channel-player-video (не первое видео плеера: реклама Kick — своё видео с чужого
 *     адреса; попав в WebGL, оно навсегда перевело бы свет на запасной путь 2D);
 *   • свет на странице (A и B) — на странице канала: под плеером в том же <main> лежит описание #channel-content. С чатом
 *     и без (до 19.11 свет держался за видимый чат — чат свернули, и свет оставался только в полосах плеера). Главная,
 *     клипы, записи — только полосы (у них нет #channel-content рядом с плеером; стенд 19.11);
 *   • A — в своей обёртке .cpx-kamb-page первым ребёнком <main>: прокручивается вместе с ним, под содержимым, а лишнее
 *     вбок (поле шире колонки) обрезает обёртка — иначе у <main> росла ширина прокрутки (стенд 15.11: 957 при 804);
 *   • B — свет сквозь «стекло» верхней панели (nav.fixed.top-0) и левой (#sidebar-wrapper): у Kick обе — сплошной
 *     rgb(9, 11, 15) поверх фона body, под основной областью — непрозрачная обёртка Kick того же цвета (двойного света нет).
 *     «Стекло» и «притушить» — kick-74-ambient.css; открытое меню в панели снимает затемнение (panels — движок);
 *   • C — рамка плеера (родитель #injected-channel-player, чёрная; на весь экран — сам полноэкранный элемент);
 *   • чат — как у Kick, без света (владелец 19.11: «фон чата меняется… выглядит не очень»): room() — нет, слоя D нет;
 *     колонка — только чтобы знать, не лежит ли чат поверх видео;
 *   • кинорежим — data-theatre="true" на обёртке страницы; тема — тёмная (светлой у Kick нет);
 *   • своей кнопки в плеере Kick пока нет (вкл./выкл. — в настройках «Ambilight»).
 */

CPX.ambientSite = (() => {
  const VIDEO = "#injected-embedded-channel-player-video video";
  const shown = (e) => {
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  return {
    name: "kick",
    when() {
      let v = null;
      for (const x of document.querySelectorAll(VIDEO)) if (shown(x)) v = x;
      if (!v) return null;
      const main = v.closest("main");
      return { video: v, full: !!(main && main.querySelector("#channel-content")), mod: false };
    },
    isDark: () => true,
    theatre: () => !!document.querySelector('[data-theatre="true"]'),
    player(v) {
      const fs = document.fullscreenElement;
      if (fs && fs !== v && fs.contains(v)) return fs;
      const p = v.closest("#injected-channel-player");
      return (p && p.parentElement) || p;
    },
    page(v) {
      const main = v.closest("main");
      if (!main) return null;
      let w = main.querySelector(":scope > .cpx-kamb-page");
      if (!w) {
        w = document.createElement("div");
        w.className = "cpx-own cpx-kamb-page";
        w.setAttribute("aria-hidden", "true");
        main.insertBefore(w, main.firstChild);
      }
      return w;
    },
    column() {
      const root = CPX.chat.root();
      const box = root && (root.id === "chatroom-messages" ? root : root.querySelector("#chatroom-messages"));
      return (box && box.parentElement) || null;
    },
    room: () => null,
    panels: "nav.fixed.top-0, #sidebar-wrapper",
    b: true,
    dAlways: false,
    extras: false,
  };
})();

// ── src/main/74_player_ambient.js ──
/* Подсветка вокруг плеера — «Кинозал» (владелец 14.10, по мотивам youtube-ambilight и Ambient mode YouTube; код и
 * дизайн свои: research — design_spec 13.10). Цвета эфира мягко светят из-под страницы вокруг видео и заходят на
 * панели Twitch и чат («притушить интерфейс» — по желанию). Настройки (свой раздел «Ambilight»): player.ambient (вкл. у всех), player.ambientLevel (мягко /
 * обычно / ярко), player.ambientDim (притушить интерфейс: нет / немного — по умолчанию / сильно), player.ambientResponse
 * (плавный / быстрый — по умолчанию), player.ambientButton (кнопка в плеере Twitch — перед «Режимом кинотеатра»,
 * переключает для всех каналов; можно спрятать).
 *
 * СВЕТ (WebGL, один невидимый холст на всё): кадр видео — текстура → «средняя» копия AW × AH (6 × 6 отсчётов на
 *   точку: усреднение, без мелькания отдельных пикселей) → сглаживание во времени (две текстуры по очереди; доля
 *   нового — по τ отклика, крупная смена сцены — быстрее) → «поле света»: края кадра (полоса ~3 %) продлеваются
 *   наружу, размытие ~BLUR_PX экрана, насыщенность ×1,25, подъём тёмного min(0,92; 1,15·c^0,8), затухание
 *   o₀·(1 − d/S)^2,4 по эллипсу (вниз — ×1,4, вбок — ×SX: свет заходит на левую панель и чат), зерно ±3/255 против
 *   полос. Поле — в RES раз мельче экрана, браузер
 *   растягивает его плавно. Пиксели обратно НЕ читаем (Brave шумит холсты, Firefox с защитой от отпечатков спросил бы
 *   разрешение). Нет WebGL или видео «чужое» — запасной путь 2D (scaled copy + CSS-маска затухания).
 * СЛОИ (одно поле; в Firefox A — сам холст WebGL (копия там стоит ~1 мс), в Chromium A — тоже 2D-копия: без аппаратной
 *   сборки страницы Chromium холст WebGL не показывает; B и C — копии в 2D-холсты):
 *   A — в прокручиваемом содержимом страницы (.root-scrollable__wrapper) под плеером, блоком описания и чатом
 *       (прокручиваемая область тянется и под колонкой чата — свет на «стекле» чата даёт A): прокручивается сам;
 *   B — fixed в <body> под всем документом: виден сквозь «стекло» верхней и левой панелей (они вне прокрутки;
 *       владелец 14.10 — свет заходит на них и без «притушить»); за прокруткой следует по событию scroll. Под основной
 *       областью — непрозрачная основа (стили), двойного света нет. В кинорежиме панелей не видно — B не рисуем; в
 *       Firefox копия B — не чаще 15/с (копия холста WebGL там ~1 мс, за стеклом разница в кадр не видна);
 *   C — в .video-player__container под видео: чёрные полосы плеера (свёрнутый чат, широкое окно, кинорежим, полный
 *       экран, не 16:9) залиты ПОЛНОСТЬЮ (владелец 14.10: «избавиться от чёрных полос»). На странице свет идёт от ВСЕГО
 *       плеера: поле страницы считается от краёв плеера (dr), полосы — ровно той же силой, с какой поле начинается
 *       снаружи, — без шва, свет переходит на левую панель и чат; цвет — продление краёв картинки (cr). В кинорежиме и на
 *       весь экран за полосами ничего нет — к краю экрана свет слегка тускнеет (вдвое).
 *   D — кинорежим (владелец 16.10: «подсветка на чат справа в кинорежиме не работает»): колонка чата лежит поверх
 *       страницы, сквозь «стекло» читались бы блоки описания — поэтому свой слой в самой колонке: обёртка
 *       .cpx-amb-dwrap (во всю колонку, обрезает, слоем ПОД сообщениями — z-index -1 при isolation колонки) с копией
 *       поля, сдвинутой под колонку, и тёмной основой колонки (#070709, как у страницы). Чат поверх видео (узкое окно) —
 *       по-прежнему как у Twitch.
 *   Стили панелей («стекло» и «притушить») — page-74-ambient.css по классам на <html>: cpx-amb-page (тёмная тема, A и B;
 *   стекло верхней и левой панелей), cpx-amb-chat (стекло чата: настройка player.ambientChat, чат рядом с плеером, не
 *   поверх), cpx-amb-tchat (кинорежим: основа колонки и слой D), cpx-amb-dim1 / cpx-amb-dim2 (притушить: темнеет содержимое панелей, не свет), cpx-amb-shown (свет
 *   виден — плавно), cpx-amb-hold (смена вида).
 *   Всё над закрепом и лентой чата (карусель «лидеры подарков / цель подписок / лидеры клипов / лидеры битсов», бегущая
 *   строка, развёрнутый топ) — «стекло»: подложки ЦВЕТА ПАНЕЛИ (тёмно-серые без оттенка) от 12 px в обе стороны прозрачнеют;
 *   остальное — полоса прогресса цели и её держатель, кружки кнопок, «ручка» развёртки 40×5 (#26262c — тоже цвет панели, но
 *   полоска) — как у Twitch (владелец 16.10: квадрат под аватаркой первого места;
 *   видео — цель подписок оставалась тёмной карточкой, новые слайды светлели через 1–2 с). clearBands; исходный цвет — в
 *   --cpx-amb-orig (при k = 0 — ровно цвет Twitch). Слайд карусели Twitch пересоздаёт при каждом листании — эту область
 *   слушает MutationObserver и чистит вставленное сразу, до отрисовки; переписал Twitch классы — метка возвращается.
 * РЕЖИМ МОДЕРАТОРА (/moderator/<канал>, владелец 30.10): страница — сетка плиток (трансляция, чат, действия, очередь
 *   AutoMod…) и карточки полосы сверху, значков слева, «Сообщества» на тёмном фоне; прокрутки у страницы нет. Плеер —
 *   тот же (полосы — C, кнопка — та же). Свет страницы — слой A, fixed в <body> под всем (B не нужен), от плеера
 *   плитки трансляции; виден в зазорах между карточками и сквозь их «стекло». Классы у карточек случайные — находим их
 *   по цвету фона (modGlass, раз в секунду): внешняя карточка цвета панели — стекло, без света ровно цвета Twitch;
 *   пропускает 50 % (плитка трансляции), 40 % (заголовки плиток, полоса сверху, значки слева), 20 % (плитки с лентами,
 *   «Сообщество» — как чат на канале); плитка чата — по настройке «Свет на чате»; внутри — обёртки во всю ширину того
 *   же цвета прозрачны, уже карточки (закреп, поле ввода) плотные. Плитки двигают стилем — слежка за ним (watchTiles):
 *   переставили — свет следом. «Притушить» — полоса сверху и значки слева. Стили — page-74-ambient.css (cpx-amb-mod).
 * КОГДА: канал, запись, режим модератора; «домашний» вид канала не в эфире — нет; светлая тема Twitch и отдельная вкладка плеера — только
 *   C; мини-плеер на других страницах — нет; высокая контрастность Windows — нет. Чат поверх видео (узкое окно) — как у
 *   Twitch (без cpx-amb-chat); в кинорежиме — «стекло» на слое D. Чат записи (владелец 19.10) — то же «стекло», что у эфира:
 *   вместо .chat-room там .video-chat (под ним — прозрачное, плотная только шапка .video-chat__header). Пауза, ожидание, вкладка в фоне,
 *   видео за экраном — свет держит последний кадр, кадры не снимаются. Видео кончилось / оборвалось — гаснет.
 * НАГРУЗКА: обновление — по requestVideoFrameCallback (новый кадр видео), не чаще частоты режима. Режим выбирает ТОЛЬКО
 *   человек (player.ambientResponse): экономный 4/с (поле мельче), плавный 12/с, быстрый 30/с (по умолчанию),
 *   максимальный 60/с (у эфира в 30 кадров — по каждому кадру, т. е. 30). Сама подсветка режим не меняет и не
 *   выключается (владелец 01.11: автозащита по потере кадров видео уводила в экономный — «как в 5 фпс», а кадры
 *   теряются и без нашей вины: догон эфира, сеть, нагрузка компьютера; программная отрисовка — тоже без автоматики).
 *   Выключили совсем — холсты 1 × 1, контекст WebGL отпущен.
 *   Кинорежим (ревью 16.10: поле во всю площадь вокруг плеера стоило вдвое дороже обычного, Firefox уходил в экономный):
 *   слоя A нет (его закрывает плеер), поле считается только на куске над колонкой чата (g.dcut — для D), полосы плеера
 *   (C) — только в самих полосах (ножницы WebGL; середину закрывает видео).
 *   Дороже всего в кинорежиме — сам кадр: Twitch переходит на 1080p, снять его в WebGL ~6 мс в Firefox и ~8,7 мс при
 *   программной отрисовке (замер 16.10; свет — 1–2 мс). При программной отрисовке кадр идёт через холст 256 × 144 (~4,5 мс).
 *   Пауза и ожидание данных у того же видео — свет держит последний кадр (страница не перекрашивается).
 *
 * РАСКЛАДКА САЙТА (15.11, мир Kick). Движок света общий; где видео и когда светить, куда класть слои A/C/D, где колонка чата,
 *   кинорежим, тема — спрашиваем у раскладки SITE: на Twitch — TWITCH ниже (те же строки, что были), в мире Kick — её даёт
 *   src/kick/74_kick_ambient.js (CPX.ambientSite). Своё только у Twitch (extras): меню «Ещё», полосы закрепа,
 *   режим модератора, кнопка в плеере, смена страницы по маршруту. b — есть ли слой B (свет сквозь «стекло» панелей);
 *   panels — панели «притушить», с которых открытое меню снимает затемнение; dAlways — свет на чате всегда своим слоем D
 *   (у Twitch — только в кинорежиме); room() → null — свет на чат не идёт (Kick, владелец 19.11).
 *
 * API: CPX.ambient.state(); для стенда (dev) — ._dev: {S, tick, mode(m)}.
 */

CPX.ambient = (() => {
  const log = CPX.log("ambient");
  const AW = 64;
  const AH = 36;
  const RES = 2; // поле: точка холста = RES точек экрана
  const RES_ECO = 6;
  const BLUR_PX = 60;
  const ROOM = ".chat-room, .video-chat"; // чат эфира / чат записи — подложка «стекла» (page-74-ambient.css)
  const SX = 1.3; // вбок свет расходится шире, чем вверх: заходит на левую панель и чат (дизайн 14.10)
  const B_GECKO_MS = 66; // Firefox: копия B не чаще 15/с
  const MODES = { smooth: { fps: 12, tau: 0.45 }, fast: { fps: 30, tau: 0.08 }, max: { fps: 60, tau: 0.08 }, eco: { fps: 4, tau: 0.6 } };
  const LEVELS = { soft: { out: 0.5, fill: 0.7 }, normal: { out: 0.75, fill: 0.85 }, bright: { out: 1, fill: 1 } };
  const GECKO = typeof navigator !== "undefined" && /Firefox\//.test(navigator.userAgent);
  const HOLD_MS = 150;
  const PACE_SLACK_MS = 8; // половина кадра экрана 60 Гц
  const FADE_MS = 520; // уход «Кинозала»: регулятор --cpx-amb-k гаснет 450 мс (page-74-ambient.css) — классы снимаем после

  CPX.i18n.add({
    ru: {
      "amb.on": "Подсветка: вкл. · выключить",
      "amb.off": "Подсветка: выкл. · включить",
    },
    en: {
      "amb.on": "Ambient light: on · turn off",
      "amb.off": "Ambient light: off · turn on",
    },
  });

  const S = {
    want: true,
    active: false,
    video: null,
    full: false, // A и B (тёмная тема, страница канала) или только C
    mode: "smooth",
    eco: false,
    drag: false, // тянут ширину чата (93_chat_width) — не считаем и не рисуем
    gl: null,
    glLost: 0,
    forced2d: false, // WebGL не годится (чужое видео, контекст терялся) — дальше только 2D
    g2: null, // запасной 2D
    cv: { A: null, B: null, C: null, D: null },
    dwrap: null, // обёртка слоя D в колонке чата (кинорежим)
    geo: null,
    vfc: 0,
    raf: 0,
    last: 0,
    next: 0, // когда следующее обновление по расписанию режима (pace)
    lastT: -1,
    first: true,
    visible: true,
    io: null,
    ro: null,
    costs: [],
    holdT: 0,
    stats: { frames: 0, path: "", renderer: "" },
    chatover: false,
    tchat: false, // кинорежим, колонка чата рядом с картинкой — свет на чате через слой D
    theatre: false,
    mod: false, // режим модератора: плеер — плитка сетки, A — fixed под всей страницей, карточки — «стекло»
    tileMo: null, // режим модератора: перестановка плиток (размер видео при этом может не меняться)
    tileRoot: null,
    bAt: 0, // когда копировали B
    dAt: 0, // когда копировали D
  };

  const root = () => document.documentElement;
  // Раскладка Twitch (см. шапку): то, что раньше стояло прямо в местах вызова.
  const TWITCH = {
    name: "twitch",
    /** Когда светить: {video, full (свет на странице), mod} или null. Вкл./выкл., контраст Windows, PiP — движок. */
    when() {
      const kind = CPX.route && CPX.route.kind;
      const pageOk = kind === "channel" || kind === "video";
      const mod = kind === "moderator"; // режим модератора (владелец 30.10); его отдельный чат (/popout/moderator/…) — без видео
      if (!(pageOk || mod || kind === "player") || document.querySelector(".channel-root--home")) return null;
      const p = CPX.player.get();
      let v = p && p.video;
      // Заглушка «для взрослых»: видео за ней уже идёт, но человек его не видит — и свет не должен его выдавать.
      if (v && document.querySelector('[data-a-target="content-classification-gate-overlay"]')) v = null;
      return { video: v, full: (pageOk || mod) && TWITCH.isDark(), mod };
    },
    isDark: () => !root().classList.contains("tw-root--theme-light"),
    theatre: () => !!document.querySelector(".persistent-player--theatre"),
    /** Коробка плеера: слой C, полосы, слежка за размером. */
    player: (v) => v.closest(".video-player__container"),
    /** Родитель слоя A (режим модератора — fixed в <body>). */
    page: (v, mod) => (mod ? document.body : document.querySelector(".root-scrollable__wrapper")),
    column: () => document.querySelector(".channel-root__right-column"),
    room: (col) => (col ? col.querySelector(ROOM) : null),
    /** Панели «притушить», с которых открытое меню снимает затемнение (cpx-amb-open). */
    panels: ".top-nav__menu, .cpx-amb-gnav",
    b: true,
    dAlways: false,
    extras: true,
  };
  let SITE = TWITCH;
  const isDark = () => SITE.isDark();
  const level = () => LEVELS[CPX.settings.get("player.ambientLevel")] || LEVELS.normal;
  const dimLevel = () => {
    const v = CPX.settings.get("player.ambientDim");
    return v === "off" ? 0 : v === "lot" ? 2 : 1;
  };
  const chatOn = () => CPX.settings.get("player.ambientChat") !== false;
  const theatre = () => SITE.theatre();
  // Режим — только из настройки (владелец 01.11: без автозащиты). S.eco — копия «экономный» для отрисовки.
  const modeKey = () => {
    const m = CPX.settings.get("player.ambientResponse");
    return MODES[m] ? m : "fast";
  };
  const params = () => MODES[S.eco ? "eco" : modeKey()];
  const res = () => (S.eco ? RES_ECO : RES);
  const forced = () => typeof matchMedia === "function" && matchMedia("(forced-colors: active)").matches;
  const reduced = () => CPX.mz.reduced();

  /* ── WebGL ─────────────────────────────────────────────────────────────── */
  const VS = "attribute vec2 p;varying vec2 uv;void main(){uv=p*0.5+0.5;gl_Position=vec4(p,0.0,1.0);}";
  const PREC = "#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n";
  // 1) средняя копия кадра: 6 × 6 отсчётов на точку
  const FS_DOWN =
    PREC +
    "varying vec2 uv;uniform sampler2D t;uniform vec2 fp;void main(){vec3 s=vec3(0.0);for(int i=0;i<6;i++){for(int j=0;j<6;j++){" +
    "vec2 o=(vec2(float(i),float(j))+0.5)/6.0-0.5;s+=texture2D(t,uv+o*fp).rgb;}}gl_FragColor=vec4(s/36.0,1.0);}";
  // 2) сглаживание во времени: крупная разница (смена сцены) — быстрее
  const FS_BLEND =
    PREC +
    "varying vec2 uv;uniform sampler2D c;uniform sampler2D q;uniform float a;uniform float af;uniform float first;void main(){" +
    "vec3 n=texture2D(c,uv).rgb;vec3 o=texture2D(q,uv).rgb;float d=max(max(abs(n.r-o.r),abs(n.g-o.g)),abs(n.b-o.b));" +
    "float k=first>0.5?1.0:mix(a,af,smoothstep(0.12,0.3,d));vec3 s=(n-o)*k;" +
    // шаг не меньше 1/255: в 8-битной текстуре малая доля нового кадра иначе «залипала» бы в нескольких ступенях от цели
    "s=sign(s)*max(abs(s),step(0.5/255.0,abs(n-o))*(1.0/255.0));gl_FragColor=vec4(clamp(o+s,0.0,1.0),1.0);}";
  // 3) поле света: продление краёв, размытие (13 отсчётов), цвет, затухание, зерно
  const FS_FIELD =
    PREC +
    "varying vec2 uv;uniform sampler2D t;uniform vec2 fs;uniform vec4 cr;uniform vec4 dr;uniform vec3 sp;uniform vec2 br;" +
    "uniform float o0;uniform float oe;uniform float bars;uniform vec4 bd;uniform float gr;" +
    "float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}" +
    "vec3 at(vec2 q){return texture2D(t,vec2(q.x,1.0-q.y)).rgb;}" +
    "void main(){vec2 px=vec2(uv.x,1.0-uv.y)*fs;vec2 cu=(px-cr.xy)/max(cr.zw-cr.xy,vec2(1.0));vec2 q=clamp(cu,vec2(0.03),vec2(0.97));" +
    "vec3 c=at(q)*0.2;" +
    "c+=at(q+vec2(br.x,0.0))*0.08;c+=at(q-vec2(br.x,0.0))*0.08;c+=at(q+vec2(0.0,br.y))*0.08;c+=at(q-vec2(0.0,br.y))*0.08;" +
    "c+=at(q+br*0.7)*0.06;c+=at(q-br*0.7)*0.06;c+=at(q+vec2(br.x,-br.y)*0.7)*0.06;c+=at(q+vec2(-br.x,br.y)*0.7)*0.06;" +
    "c+=at(q+vec2(br.x*0.5,0.0))*0.06;c+=at(q-vec2(br.x*0.5,0.0))*0.06;c+=at(q+vec2(0.0,br.y*0.5))*0.06;c+=at(q-vec2(0.0,br.y*0.5))*0.06;" +
    "float g=dot(c,vec3(0.299,0.587,0.114));c=clamp(mix(vec3(g),c,1.25),0.0,1.0);c=min(vec3(0.92),1.15*pow(c,vec3(0.8)));" +
    "float a;if(bars<0.5){float dx=max(max(dr.x-px.x,px.x-dr.z),0.0)/sp.x;float dt=max(dr.y-px.y,0.0)/sp.y;float db=max(px.y-dr.w,0.0)/sp.z;" +
    "float e=sqrt(dx*dx+dt*dt+db*db);a=o0*pow(max(1.0-e,0.0),2.4);}else{" +
    "float tx=max(max((cr.x-px.x)/max(bd.x,1.0),(px.x-cr.z)/max(bd.z,1.0)),0.0);float ty=max(max((cr.y-px.y)/max(bd.y,1.0),(px.y-cr.w)/max(bd.w,1.0)),0.0);" +
    "a=mix(o0,oe,pow(clamp(max(tx,ty),0.0,1.0),1.2));}" +
    "c+=(h(floor(px))-0.5)*gr;gl_FragColor=vec4(clamp(c,0.0,1.0)*a,a);}";

  function makeGL() {
    const c = document.createElement("canvas");
    let gl = null;
    try {
      gl = c.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: "low-power" });
    } catch (_) {}
    if (!gl) return null;
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error("шейдер: " + gl.getShaderInfoLog(s));
      return s;
    };
    const prog = (fs) => {
      const p = gl.createProgram();
      gl.attachShader(p, sh(gl.VERTEX_SHADER, VS));
      gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
      gl.bindAttribLocation(p, 0, "p");
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error("программа: " + gl.getProgramInfoLog(p));
      const u = {};
      const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) {
        const info = gl.getActiveUniform(p, i);
        u[info.name] = gl.getUniformLocation(p, info.name);
      }
      return { p, u };
    };
    const tex = (w, h) => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      if (w) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      return t;
    };
    const fbo = (t) => {
      const f = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      return f;
    };
    try {
      const R = {
        c,
        gl,
        down: prog(FS_DOWN),
        blend: prog(FS_BLEND),
        field: prog(FS_FIELD),
        vid: tex(0, 0),
        cur: tex(AW, AH),
        acc: [tex(AW, AH), tex(AW, AH)],
        k: 0,
        lost: false,
      };
      R.fCur = fbo(R.cur);
      R.fAcc = [fbo(R.acc[0]), fbo(R.acc[1])];
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      c.addEventListener("webglcontextlost", (e) => {
        e.preventDefault();
        R.lost = true;
      });
      // Программная отрисовка — сразу экономный режим.
      try {
        const ext = gl.getExtension("WEBGL_debug_renderer_info");
        S.stats.renderer = String((ext && gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || "");
      } catch (_) {}
      return R;
    } catch (e) {
      log.warn("WebGL не собрался:", e.message);
      return null;
    }
  }
  const softGL = () => /swiftshader|llvmpipe|basic render|software|microsoft basic/i.test(S.stats.renderer);

  /** Кадр → средняя копия → сглаживание. false — текстура из видео не взялась (чужое видео) — на 2D. */
  function glFrame(dt) {
    const R = S.gl;
    const gl = R.gl;
    const v = S.video;
    // Программная отрисовка: кадр 1080p прямо в WebGL — ~8,7 мс, через холст 256 × 144 — ~4,5 (замер 16.10, Chrome без
    // видеокарты; в кинорежиме Twitch переходит на 1080p, и экономный режим подходил к порогу выключения). С видеокартой
    // прямой путь не дороже — его и оставляем.
    if (R.soft === undefined) R.soft = softGL();
    let src = v;
    if (R.soft) {
      if (!R.small) {
        R.small = document.createElement("canvas");
        R.small.width = 256;
        R.small.height = 144;
        R.sx = R.small.getContext("2d");
      }
      try {
        R.sx.drawImage(v, 0, 0, 256, 144);
      } catch (e) {
        log.info("кадр в холст не взялся — запасной путь:", e && e.name);
        return false;
      }
      src = R.small;
    }
    gl.bindTexture(gl.TEXTURE_2D, R.vid);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    } catch (e) {
      log.info("кадр в WebGL не взялся — запасной путь:", e && e.name);
      return false;
    }
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    // 1) средняя копия
    gl.bindFramebuffer(gl.FRAMEBUFFER, R.fCur);
    gl.viewport(0, 0, AW, AH);
    gl.useProgram(R.down.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, R.vid);
    gl.uniform1i(R.down.u.t, 0);
    gl.uniform2f(R.down.u.fp, 1 / AW, 1 / AH);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    // 2) сглаживание
    const p = params();
    const tau = reduced() ? Math.max(p.tau, 1.2) : p.tau;
    const a = 1 - Math.exp(-Math.max(0.001, dt) / tau);
    const prev = R.k;
    const next = 1 - R.k;
    gl.bindFramebuffer(gl.FRAMEBUFFER, R.fAcc[next]);
    gl.useProgram(R.blend.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, R.cur);
    gl.uniform1i(R.blend.u.c, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, R.acc[prev]);
    gl.uniform1i(R.blend.u.q, 1);
    gl.uniform1f(R.blend.u.a, a);
    gl.uniform1f(R.blend.u.af, Math.max(a, 0.5));
    gl.uniform1f(R.blend.u.first, S.first ? 1 : 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    R.k = next;
    gl.activeTexture(gl.TEXTURE0);
    return true;
  }
  /** Поле света в область холста (x, y, w, h — в точках холста WebGL, начало снизу). cr — картинка (откуда цвет),
   *  dr — от чего считать расстояние (плеер с полосами или сама картинка); полосы (bars) — от o0 у картинки к oe у края. */
  function glField(x, y, w, h, cr, dr, sp, o0, bars, bd, oe) {
    const R = S.gl;
    const gl = R.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(x, y, w, h);
    gl.useProgram(R.field.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, R.acc[R.k]);
    const u = R.field.u;
    gl.uniform1i(u.t, 0);
    gl.uniform2f(u.fs, w, h);
    gl.uniform4f(u.cr, cr[0], cr[1], cr[2], cr[3]);
    gl.uniform4f(u.dr, dr[0], dr[1], dr[2], dr[3]);
    gl.uniform3f(u.sp, sp[0], sp[1], sp[2]);
    const cw = Math.max(1, cr[2] - cr[0]);
    const ch = Math.max(1, cr[3] - cr[1]);
    const r = res();
    gl.uniform2f(u.br, BLUR_PX / r / cw, BLUR_PX / r / ch);
    gl.uniform1f(u.o0, o0);
    gl.uniform1f(u.oe, oe);
    gl.uniform1f(u.bars, bars ? 1 : 0);
    gl.uniform4f(u.bd, bd[0], bd[1], bd[2], bd[3]);
    gl.uniform1f(u.gr, r <= 2 ? 6 / 255 : 0); // зерно ±3/255 — только в разрешении ~экрана: растянутое — пятна
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /* ── запасной путь 2D: копия кадра со смешиванием, размытие при копировании, затухание — CSS-маской ── */
  // Копия кадра 192 × 108: холст меньше 128 × 128 браузер не ускоряет — drawImage тянул бы кадр из видеокарты целиком.
  const W2D = 192;
  const H2D = 108;
  function make2D() {
    const c = document.createElement("canvas");
    c.width = W2D;
    c.height = H2D;
    return { c, x: c.getContext("2d", { alpha: false }), mask: null, mkey: "" };
  }
  /** Маска затухания поля (w × h, полоса sx по бокам, st сверху, sb снизу, сила o0): горизонтальный градиент,
   *  умноженный на вертикальный (destination-in). Считается при смене размера, не на каждом обновлении. */
  function mask2d(w, h, sx, st, sb, o0) {
    const m = document.createElement("canvas");
    m.width = w;
    m.height = h;
    const x = m.getContext("2d");
    const stops = (g, a, b, len, k) => {
      const ea = Math.min(0.49, a / len);
      const eb = Math.min(0.49, b / len);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(ea * 0.35, "rgba(0,0,0," + 0.12 * k + ")");
      g.addColorStop(ea * 0.7, "rgba(0,0,0," + 0.5 * k + ")");
      g.addColorStop(ea, "rgba(0,0,0," + k + ")");
      g.addColorStop(1 - eb, "rgba(0,0,0," + k + ")");
      g.addColorStop(1 - eb * 0.7, "rgba(0,0,0," + 0.5 * k + ")");
      g.addColorStop(1 - eb * 0.35, "rgba(0,0,0," + 0.12 * k + ")");
      g.addColorStop(1, "rgba(0,0,0,0)");
    };
    const gx = x.createLinearGradient(0, 0, w, 0);
    stops(gx, sx, sx, w, o0);
    x.fillStyle = gx;
    x.fillRect(0, 0, w, h);
    x.globalCompositeOperation = "destination-in";
    const gy = x.createLinearGradient(0, 0, 0, h);
    stops(gy, st, sb, h, 1);
    x.fillStyle = gy;
    x.fillRect(0, 0, w, h);
    return m;
  }

  /* ── слои ──────────────────────────────────────────────────────────────── */
  function layer(name, cls) {
    let c = S.cv[name];
    if (!c) {
      c = document.createElement("canvas");
      c.className = "cpx-own cpx-amb-l cpx-amb-" + (cls || name.toLowerCase());
      c.setAttribute("aria-hidden", "true");
      c.ctx = c.getContext("2d");
      S.cv[name] = c;
    }
    return c;
  }
  function mount() {
    const v = S.video;
    const C = layer("C");
    const host = v && SITE.player(v);
    if (host && C.parentNode !== host) host.insertBefore(C, host.firstChild);
    // Режим модератора: прокрутки у страницы нет (прокручивается содержимое плиток) — A лежит fixed в <body> под всей
    // страницей, как B на странице канала; сам B там не нужен.
    const wrap = S.full && SITE.page(v, S.mod);
    // A — в Firefox сам холст WebGL (копия холста WebGL в 2D там стоит ~1 мс; показ работает и без аппаратного
    // ускорения — проверено 14.10); в Chromium — 2D-копия, как B и C: когда страницу собирает не видеокарта (аппаратное
    // ускорение выключено, или выключена только сборка страницы — WebGL при этом на видеокарте), Chromium холст WebGL на
    // странице не показывает — владелец 14.10: «чёрная полоса под плеером»; копия там почти бесплатна. Программная
    // отрисовка и запасной путь — тоже 2D-холст.
    let A;
    if (S.gl && GECKO && !softGL()) {
      A = S.gl.c;
      if (!A.classList.contains("cpx-amb-a")) {
        A.className = "cpx-own cpx-amb-l cpx-amb-a";
        A.setAttribute("aria-hidden", "true");
      }
    } else A = layer("A2", "a");
    if (S.cv.A && S.cv.A !== A) S.cv.A.remove();
    S.cv.A = A;
    A.classList.toggle("cpx-amb-fix", S.mod);
    // В кинорежиме A не нужен: на его месте — закреплённый плеер.
    if (wrap && !S.theatre) {
      if (A.parentNode !== wrap) wrap.insertBefore(A, wrap.firstChild);
    } else if (A.parentNode) A.remove();
    const B = layer("B");
    // B — сквозь «стекло» панелей и чата; в кинорежиме плеер закрывает панели (чат там — на слое D).
    if (S.full && !S.theatre && !S.mod && SITE.b) {
      if (B.parentNode !== document.body && document.body) document.body.appendChild(B);
    } else if (B.parentNode) B.remove();
    // D — кинорежим: обёртка во всю колонку чата, слоем под сообщениями.
    const D = layer("D");
    if (!S.dwrap) {
      S.dwrap = document.createElement("div");
      S.dwrap.className = "cpx-own cpx-amb-dwrap";
      S.dwrap.setAttribute("aria-hidden", "true");
    }
    if (D.parentNode !== S.dwrap) S.dwrap.appendChild(D);
    // Как «стекло» чата (classes): есть чат эфира или записи.
    const col = S.full && S.tchat && chatOn() && SITE.column();
    if (col && SITE.room(col)) {
      if (S.dwrap.parentNode !== col) col.insertBefore(S.dwrap, col.firstChild);
    } else if (S.dwrap.parentNode) S.dwrap.remove();
  }
  function unmount() {
    for (const k of ["A", "B", "C"]) if (S.cv[k]) S.cv[k].remove();
    if (S.dwrap) S.dwrap.remove();
  }
  /** Выключили совсем (настройка или кнопка) — отпустить память: холсты 1 × 1, контекст WebGL — прочь. */
  function release() {
    for (const k of ["A", "B", "C", "D"]) {
      const c = S.cv[k];
      if (c && !c.isConnected) c.width = c.height = 1;
    }
    if (S.gl) {
      try {
        const x = S.gl.gl.getExtension("WEBGL_lose_context");
        if (x) x.loseContext();
      } catch (_) {}
      S.gl.c.width = S.gl.c.height = 1;
      S.gl = null;
    }
    if (S.g2) S.g2 = null;
  }

  /* ── геометрия: прямоугольник КАРТИНКИ видео (object-fit: contain) ── */
  function contentRect(v) {
    const r = v.getBoundingClientRect();
    const vw = v.videoWidth;
    const vh = v.videoHeight;
    if (!(r.width > 0 && r.height > 0 && vw > 0 && vh > 0)) return null;
    const s = Math.min(r.width / vw, r.height / vh);
    const w = vw * s;
    const h = vh * s;
    return { x: r.left + (r.width - w) / 2, y: r.top + (r.height - h) / 2, w, h };
  }
  function place(fromScroll) {
    const v = S.video;
    if (!v || !S.active) return;
    if (S.drag) return void hold(); // тянут ширину чата — место после (событие drag)
    const r = contentRect(v);
    if (!r) return;
    const he = SITE.player(v);
    const hb = he && he.getBoundingClientRect();
    const host = hb && hb.width > 0 && hb.height > 0 ? { x: hb.left, y: hb.top, w: hb.width, h: hb.height } : null;
    const bars = !!host && (r.w < host.w - 2 || r.h < host.h - 2);
    if (!fromScroll) S.theatre = theatre();
    // Полосы на странице (свернули чат, широкое окно, не 16:9): свет — от всего плеера (F), полосы залиты; в кинорежиме и
    // на весь экран — от картинки (за полосами — край экрана).
    const F = bars && S.full && !S.theatre && !document.fullscreenElement ? host : r;
    const s = Math.round(Math.max(96, Math.min(220, 0.26 * F.h)));
    const sx = Math.round(s * SX);
    const g = { x: Math.round(F.x - sx), y: Math.round(F.y - s), w: Math.round(F.w + 2 * sx), h: Math.round(F.h + s + s * 1.4), cx: r.x, cy: r.y, cw: r.w, ch: r.h, fx: F.x, fy: F.y, fw: F.w, fh: F.h, s, sx, host, bars, cont: F !== r };
    const o = S.geo;
    g.view = (S.theatre ? "t" : "n") + (document.fullscreenElement ? "f" : "");
    if (fromScroll && o) {
      g.dcut = o.dcut;
      g.dwr = o.dwr;
    }
    // Смена вида (кинорежим, свернули чат, ширина) — на миг погасить, чтобы свет не «прыгал».
    const resized = o && (Math.abs(o.cw - g.cw) > 8 || Math.abs(o.ch - g.ch) > 8);
    const moved = o && !fromScroll && (Math.abs(o.cx - g.cx) > 8 || Math.abs(o.cy - g.cy) > 8);
    S.geo = g;
    if ((resized || moved) && !reduced()) hold();
    // Чат поверх чего-то, кроме нашего света — непрозрачный: узкое окно (Twitch кладёт колонку на правую часть плеера,
    // признак «рядом» при этом остаётся — «стекло» показало бы видео) и кинорежим (колонка лежит поверх страницы под
    // закреплённым плеером — сквозь сообщения читались бы блоки описания и верхняя панель). В кинорежиме с колонкой
    // рядом с картинкой «стекло» — на своём слое D (S.tchat).
    if (!fromScroll) {
      const col = SITE.column();
      const cb = col && col.getBoundingClientRect();
      const overlap = !!cb && cb.width > 0 && cb.left < r.x + r.w - 2 && cb.right > r.x + 2 && cb.top < r.y + r.h - 2 && cb.bottom > r.y + 2;
      const th = theatre();
      S.chatover = overlap || th;
      S.tchat = (th || SITE.dAlways) && !overlap && !!cb && cb.width > 0 && cb.height > 0;
      classes();
    }
    mount();
    const A = S.cv.A;
    const B = S.cv.B;
    const C = S.cv.C;
    const D = S.dwrap && S.dwrap.parentNode ? S.cv.D : null;
    if (D && !fromScroll) {
      // Кусок поля над колонкой чата — в WebGL считаем только его; размер и место холста D ставит update (posD).
      const wr = S.dwrap.getBoundingClientRect();
      g.dwr = { left: wr.left, top: wr.top };
      const x0 = Math.max(g.x, wr.left);
      const x1 = Math.min(g.x + g.w, wr.right);
      g.dcut = x1 > x0 + 1 ? { x: x0 - g.x, w: x1 - x0 } : null;
      S.dPos = "";
    }
    if (B && B.parentNode) {
      B.style.width = g.w + "px";
      B.style.height = g.h + "px";
      B.style.transform = "translate(" + g.x + "px," + g.y + "px)";
    }
    // Прокрутили, а видео стоит (пауза) — холст D (колонка чата не прокручивается вместе со страницей) следом за полем.
    if (fromScroll && D && g.dcut) posD(D, g.dcut.x, g.dcut.w);
    if (A && A.parentNode && !fromScroll) {
      // От родителя; fixed — от окна. Родитель сам прокручивается (Kick: <main>) — плюс его прокрутка (у обёртки Twitch — 0).
      const P = A.parentNode;
      const wr = S.mod ? { left: 0, top: 0 } : P.getBoundingClientRect();
      const sl = S.mod ? 0 : P.scrollLeft || 0;
      const st = S.mod ? 0 : P.scrollTop || 0;
      A.style.width = g.w + "px";
      A.style.height = g.h + "px";
      A.style.transform = "translate(" + Math.round(g.x - wr.left + sl) + "px," + Math.round(g.y - wr.top + st) + "px)";
    }
    if (C && C.parentNode && host && !fromScroll) {
      C.style.width = Math.round(host.w) + "px";
      C.style.height = Math.round(host.h) + "px";
    }
  }
  function hold() {
    root().classList.add("cpx-amb-hold");
    clearTimeout(S.holdT);
    S.holdT = setTimeout(() => root().classList.remove("cpx-amb-hold"), HOLD_MS);
  }

  /* ── обновление ─────────────────────────────────────────────────────────── */
  function size(c, w, h) {
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
  }
  /** Холст D: x — от левого края поля, w — ширина (CSS px); место — от обёртки в колонке (g.dwr). */
  function posD(D, x, w) {
    const g = S.geo;
    const wr = g && g.dwr;
    if (!wr) return;
    const key = x + ":" + w + ":" + g.x + ":" + g.y + ":" + g.h + ":" + wr.left + ":" + wr.top;
    if (S.dPos === key) return;
    S.dPos = key;
    D.style.width = Math.round(w) + "px";
    D.style.height = g.h + "px";
    D.style.transform = "translate(" + Math.round(g.x + x - wr.left) + "px," + Math.round(g.y - wr.top) + "px)";
  }
  /** Поле полос плеера (C) — только в самих полосах: ножницы WebGL по краям картинки (середину закрывает видео). */
  function glBars(bw, bh, cr, o0, bd, oe) {
    const gl = S.gl.gl;
    gl.disable(gl.SCISSOR_TEST);
    // Очищать сам холст: после glFrame выбран буфер накопления — очистка стёрла бы цвет кадра (свет стал бы чёрным).
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const L = Math.ceil(cr[0]) + 1;
    const R = Math.floor(cr[2]) - 1;
    const T = Math.ceil(cr[1]) + 1;
    const Bm = Math.floor(cr[3]) - 1;
    const strips = [];
    if (L > 0) strips.push([0, 0, Math.min(L, bw), bh]);
    if (R < bw) strips.push([Math.max(0, R), 0, bw - Math.max(0, R), bh]);
    if (T > 0) strips.push([0, Math.max(0, bh - T), bw, Math.min(T, bh)]); // верх картинки — у WebGL сверху
    if (Bm < bh) strips.push([0, 0, bw, bh - Math.max(0, Bm)]);
    gl.enable(gl.SCISSOR_TEST);
    for (const st of strips) {
      gl.scissor(st[0], st[1], st[2], st[3]);
      glField(0, 0, bw, bh, cr, cr, [1, 1, 1], o0, true, bd, oe);
    }
    gl.disable(gl.SCISSOR_TEST);
  }
  function update(now) {
    const v = S.video;
    if (!S.active || !v || v.readyState < 2 || !v.videoWidth) return;
    const t0 = performance.now();
    if (!S.geo) place();
    const g = S.geo;
    if (!g) return;
    const dt = S.last ? (now - S.last) / 1000 : 1;
    const r = res();
    const lv = level();
    const W1 = Math.max(8, Math.round(g.w / r));
    const H1 = Math.max(8, Math.round(g.h / r));
    const bars = !!(g.bars && g.host);
    const W2 = bars ? Math.max(8, Math.round(g.host.w / r)) : 0;
    const H2 = bars ? Math.max(8, Math.round(g.host.h / r)) : 0;
    const fs = !!document.fullscreenElement; // в полном экране видно только плеер — A и B не рисуем
    let A = S.full && !fs && S.cv.A && S.cv.A.parentNode ? S.cv.A : null;
    let B = S.full && !fs && S.cv.B && S.cv.B.parentNode ? S.cv.B : null;
    const C = S.cv.C && S.cv.C.parentNode ? S.cv.C : null;
    const D = S.full && !fs && S.dwrap && S.dwrap.parentNode ? S.cv.D : null;
    // Светить некуда (только полосы плеера, а их нет) — кадр не снимаем вовсе.
    if (!A && !B && !D && !(bars && C)) {
      S.last = now;
      pace(now);
      return;
    }
    let ok = false;
    if (S.gl && S.gl.lost) {
      S.gl = ++S.glLost <= 3 ? makeGL() : null;
      if (!S.gl) S.forced2d = true;
      log.info("контекст WebGL потерян — " + (S.gl ? "пересоздан" : "дальше 2D"));
      mount(); // слой A — новый холст
      place();
      A = S.full && !fs && S.cv.A && S.cv.A.parentNode ? S.cv.A : null;
      B = S.full && !fs && S.cv.B && S.cv.B.parentNode ? S.cv.B : null;
    }
    if (S.gl && !S.gl.lost) {
      ok = glFrame(dt);
      if (ok) {
        // Холст WebGL — это и есть слой A (поле страницы на весь холст). Полосы плеера рисуем раньше в его углу и сразу
        // копируем в C, затем поле страницы перекрывает весь холст; B — копия готового холста.
        const gc = S.gl.c;
        // Только D (кинорежим) — поле лишь на куске над колонкой чата (g.dcut), сдвиг ox — в точках поля.
        const onlyD = !A && !B && !!D;
        const cut = onlyD ? g.dcut : null;
        const ox = cut ? cut.x / r : 0;
        const Wp = onlyD ? (cut ? Math.max(1, Math.round(cut.w / r)) : 0) : W1;
        const page = !!(A || B || (D && Wp));
        const Wc = !page ? W2 : onlyD ? Math.max(Wp, bars && C ? W2 : 0) : W1;
        const Hc = !page ? H2 : onlyD ? Math.max(H1, bars && C ? H2 : 0) : H1;
        size(gc, Wc, Hc);
        if (bars && C) {
          const bw = Math.min(W2, Wc);
          const bh = Math.min(H2, Hc);
          const kx = bw / W2;
          const ky = bh / H2;
          const h = g.host;
          const cr = [((g.cx - h.x) / r) * kx, ((g.cy - h.y) / r) * ky, ((g.cx - h.x + g.cw) / r) * kx, ((g.cy - h.y + g.ch) / r) * ky];
          // на странице — ровно сила поля у края плеера (без шва), в кинорежиме и на весь экран — ярче, к краю вдвое тусклее
          const o0 = g.cont ? lv.out : lv.fill;
          glBars(bw, bh, cr, o0, [cr[0], cr[1], bw - cr[2], bh - cr[3]], g.cont ? lv.out : lv.fill * 0.5);
          size(C, bw, bh);
          C.ctx.clearRect(0, 0, bw, bh);
          C.ctx.drawImage(gc, 0, Hc - bh, bw, bh, 0, 0, bw, bh);
        } else if (C && C.width !== 1) size(C, 1, 1);
        if (D && !Wp && D.width !== 1) size(D, 1, 1); // поле до колонки чата не достаёт — на чате света нет
        if (page) {
          // в точках поля (минус сдвиг куска для D); WebGL считает снизу — поле в нижних H1 строках холста
          const cr = [(g.cx - g.x) / r - ox, (g.cy - g.y) / r, (g.cx - g.x + g.cw) / r - ox, (g.cy - g.y + g.ch) / r];
          const dr = [(g.fx - g.x) / r - ox, (g.fy - g.y) / r, (g.fx - g.x + g.fw) / r - ox, (g.fy - g.y + g.fh) / r];
          glField(0, 0, Wp, H1, cr, dr, [g.sx / r, g.s / r, (g.s * 1.4) / r], lv.out, false, [0, 0, 0, 0], 0);
          if (B && (!GECKO || now - S.bAt >= B_GECKO_MS - 4 || B.width !== W1 || B.height !== H1)) {
            S.bAt = now;
            size(B, W1, H1);
            B.ctx.clearRect(0, 0, W1, H1);
            B.ctx.drawImage(gc, 0, Hc - H1, W1, H1, 0, 0, W1, H1);
          }
          if (A && A !== gc) {
            // Chromium и программная отрисовка: A — 2D-копия (см. mount)
            size(A, W1, H1);
            A.ctx.clearRect(0, 0, W1, H1);
            A.ctx.drawImage(gc, 0, Hc - H1, W1, H1, 0, 0, W1, H1);
          }
          if (D && Wp && (!GECKO || now - S.dAt >= B_GECKO_MS - 4 || D.width !== Wp || D.height !== H1)) {
            // кинорежим: кусок поля над колонкой чата; в Firefox — как B, не чаще 15/с
            S.dAt = now;
            size(D, Wp, H1);
            D.ctx.clearRect(0, 0, Wp, H1);
            D.ctx.drawImage(gc, 0, Hc - H1, Wp, H1, 0, 0, Wp, H1);
            posD(D, cut ? cut.x : 0, cut ? cut.w : g.w);
          }
        }
        S.stats.path = "webgl";
      } else {
        S.gl = null; // чужое видео — дальше 2D
        S.forced2d = true;
        mount();
        A = S.full && !fs && S.cv.A && S.cv.A.parentNode ? S.cv.A : null; // A теперь — 2D-холст
        B = S.full && !fs && S.cv.B && S.cv.B.parentNode ? S.cv.B : null;
      }
    }
    if (!ok) {
      // Запасной путь 2D: копия кадра со смешиванием, поле — растянутая копия с размытием, затухание — маской в холсте.
      if (!S.g2) S.g2 = make2D();
      const G = S.g2;
      const p = params();
      const a = 1 - Math.exp(-Math.max(0.001, dt) / p.tau);
      G.x.globalAlpha = S.first ? 1 : Math.max(0.15, a);
      try {
        G.x.drawImage(v, 0, 0, W2D, H2D);
      } catch (_) {
        return stop("кадр не берётся");
      }
      G.x.globalAlpha = 1;
      const fw = Math.max(8, Math.round(g.w / RES_ECO));
      const fh = Math.max(8, Math.round(g.h / RES_ECO));
      const key = fw + "x" + fh + ":" + lv.out;
      if (G.mkey !== key) {
        G.mask = mask2d(fw, fh, g.sx / RES_ECO, g.s / RES_ECO, (g.s * 1.4) / RES_ECO, lv.out);
        G.mkey = key;
      }
      const paint = (L, w, h, msk) => {
        size(L, w, h);
        const x = L.ctx;
        x.globalCompositeOperation = "copy";
        x.filter = "blur(" + Math.max(2, Math.round(BLUR_PX / RES_ECO / 3)) + "px) saturate(150%) brightness(115%)";
        x.drawImage(G.c, 0, 0, w, h);
        x.filter = "none";
        if (msk) {
          x.globalCompositeOperation = "destination-in";
          x.drawImage(msk, 0, 0);
        }
        x.globalCompositeOperation = "source-over";
      };
      for (const L of [A, B, D]) if (L) paint(L, fw, fh, G.mask);
      if (D) posD(D, 0, g.w);
      if (C && bars) paint(C, Math.max(8, Math.round(g.host.w / RES_ECO)), Math.max(8, Math.round(g.host.h / RES_ECO)), null);
      S.stats.path = "2d";
    }
    S.first = false;
    S.last = now;
    pace(now);
    S.stats.frames++;
    if (!root().classList.contains("cpx-amb-shown")) show();
    const cost = performance.now() - t0;
    S.costs.push(cost);
    if (S.costs.length > 400) S.costs.shift();
  }

  /* ── ход: по новым кадрам видео, не чаще частоты режима ── */
  function schedule() {
    const v = S.video;
    if (!v || !S.active) return;
    if (typeof v.requestVideoFrameCallback === "function") {
      if (!S.vfc) S.vfc = v.requestVideoFrameCallback(onFrame);
    } else if (!S.raf) S.raf = requestAnimationFrame(onRaf);
  }
  /* Ровный шаг: обновление — на первом кадре видео, попавшем в очередной шаг расписания 1/fps (запас PACE_SLACK_MS на
   * разброс прихода кадров). Прежнее «прошло ли 1/fps − 4 мс» на видео 60 к/с из-за разброса пропускало лишний кадр:
   * «быстрый» давал ~24 обновления в секунду вместо 30 (замер 01.11). Отстали больше чем на шаг — от текущего кадра. */
  function pace(now) {
    const iv = 1000 / params().fps;
    S.next = now - S.next > iv ? now + iv : S.next + iv;
  }
  function due(now) {
    return S.visible && !S.drag && now >= S.next - PACE_SLACK_MS;
  }
  function onFrame(now) {
    S.vfc = 0;
    if (!S.active) return;
    if (due(now)) update(now);
    schedule();
  }
  function onRaf(now) {
    S.raf = 0;
    if (!S.active) return;
    const v = S.video;
    if (v && v.currentTime !== S.lastT && due(now)) {
      S.lastT = v.currentTime;
      update(now);
    }
    schedule();
  }

  /* ── включить / выключить ───────────────────────────────────────────────── */
  function show() {
    requestAnimationFrame(() => S.active && root().classList.add("cpx-amb-shown"));
  }
  /* «Притушить»: пока у Twitch открыто меню в полосе сверху или в значках слева (у кнопки aria-expanded="true") — а у
   * полосы сверху и пока открыто меню «Ещё» (оно вне полосы, без признака «открыто»: по самому меню), — затемнение с этой
   * панели снято: класс cpx-amb-open на ней (page-74-ambient.css). Следим, только пока подсветка на странице. Какие
   * панели — SITE.panels (Kick: верхняя и левая, kick-74-ambient.css); меню «Ещё» — только Twitch (extras).
   * ⛔Не через «:has([aria-expanded="true"])» / «html:has([data-a-target="overflow-menu"])»: такие кнопки Twitch вставляет
   * в плеер на каждое наведение, и с этими правилами Chrome раз за разом пересчитывал стили ВСЕГО документа — даже при
   * выключенной подсветке (отзыв 06.11 «дропы FPS, когда переводишь курсор с плеера в чат»). */
  const OPEN = { on: false, mo: null, off: null };
  const OVERFLOW = '[data-a-target="overflow-menu"]';
  function syncOpen() {
    if (!OPEN.on) return;
    const ovf = SITE.extras && !!document.querySelector(OVERFLOW);
    for (const el of document.querySelectorAll(SITE.panels))
      el.classList.toggle("cpx-amb-open", !!el.querySelector('[aria-expanded="true"]') || (ovf && el.classList.contains("top-nav__menu")));
  }
  function watchOpen(on) {
    if (on === OPEN.on) return;
    OPEN.on = on;
    if (!on) {
      if (OPEN.mo) OPEN.mo.disconnect();
      if (OPEN.off) OPEN.off();
      OPEN.off = null;
      for (const el of document.querySelectorAll(".cpx-amb-open")) el.classList.remove("cpx-amb-open");
      return;
    }
    const sync = CPX.guard("ambient:open", syncOpen);
    OPEN.mo = OPEN.mo || new MutationObserver(sync);
    OPEN.mo.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["aria-expanded"] });
    OPEN.off = SITE.extras
      ? CPX.dom.on(OVERFLOW, (el) => {
          sync();
          CPX.dom.gone(el, sync);
        })
      : null;
    sync();
  }

  function classes() {
    const rc = root().classList;
    const d = dimLevel();
    watchOpen(S.active && S.full && !!SITE.panels);
    rc.toggle("cpx-amb-page", S.active && S.full);
    rc.toggle("cpx-amb-mod", S.active && S.full && S.mod);
    rc.toggle("cpx-amb-dim1", S.active && S.full && d === 1);
    rc.toggle("cpx-amb-dim2", S.active && S.full && d === 2);
    // «стекло» чата — только когда в колонке чат (эфира или записи): без него колонка стала бы дырой до основы
    const room = S.active && S.full && (!S.chatover || S.tchat) && chatOn() && SITE.room(SITE.column());
    rc.toggle("cpx-amb-chat", !!room);
    rc.toggle("cpx-amb-tchat", !!room && S.tchat);
    if (room && SITE.extras) clearBands(room);
    else if (bandRoots.length) unbands();
  }
  /** Обёртки закрепа у Twitch — непрозрачные полосы во всю ширину чата (классы без постоянных имён): от стопки вверх до
   *  .chat-room, во всю ширину и с фоном — пометить cpx-amb-clear (стили делают её прозрачной только при cpx-amb-chat;
   *  карточка закрепа — уже чата, остаётся плотной). Находка проверки 14.10: тёмная полоса разрывала светящийся край чата.
   *  Область над закрепом и лентой (BAND) — подложки цвета панели, сразу при вставке (см. шапку). */
  const LEADER = '[class*="marqueeAnimation--"], [class*="bitsLeaderboard"], [class*="channel-leaderboard"], [class*="channelLeaderboard"]';
  const NOT_LEADER = '[class*="community-highlight-stack"], .chat-scrollable-area__message-container, .cpx-chat';
  // Граница области сверху: закреп, лента, поле ввода — плотные карточки Twitch; внутри них «стекло» не трогаем НИКОГДА
  // (проверка 16.10: пустой контейнер закрепа до загрузки попадал в область — вставленная карточка становилась прозрачной).
  const NOT_BAND = NOT_LEADER + ', [class*="community-highlight"], [class*="chat-list"], .chat-input, .chat-room__notifications, .chat-room__viewer-card';
  const bandSeen = new WeakSet(); // обёртки стопки, уже проверенные (getComputedStyle — раз на узел)
  const cleared = new WeakMap(); // помеченный узел → исходный цвет (Twitch переписал классы — вернуть метку)
  function mark(el, bg) {
    cleared.set(el, bg);
    el.style.setProperty("--cpx-amb-orig", bg); // при k = 0 — ровно цвет Twitch
    el.classList.add("cpx-amb-clear");
  }
  function clearOne(el) {
    if (bandSeen.has(el)) return;
    bandSeen.add(el);
    const bg = getComputedStyle(el).backgroundColor;
    if (bg === "rgba(0, 0, 0, 0)" || bg === "transparent") return;
    mark(el, bg);
  }
  /** Подложка цвета панели Twitch (#0e0e10, #18181b, #1f1f23, #26262c…): непрозрачная, тёмная, серая без оттенка →
   *  [r, g, b], иначе null. */
  function panelRgb(bg) {
    const m = /^rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)$/.exec(bg);
    if (!m || (m[4] !== undefined && +m[4] < 0.95)) return null;
    const c = [+m[1], +m[2], +m[3]];
    return Math.max(...c) <= 48 && Math.max(...c) - Math.min(...c) <= 10 ? c : null;
  }
  function panelBg(el) {
    const bg = getComputedStyle(el).backgroundColor;
    return panelRgb(bg) ? bg : "";
  }
  function clearPanel(el) {
    if (el.nodeType !== 1 || el.tagName === "BUTTON" || el.classList.contains("cpx-amb-clear") || el.closest(NOT_BAND)) return;
    const was = cleared.get(el);
    if (was) return mark(el, was);
    const bg = panelBg(el);
    if (!bg) return;
    const r = el.getBoundingClientRect();
    // Тонкое — полоска (ручка, прогресс, разделитель): как у Twitch. Ещё без размера (раскрывается) — проверим в следующий раз.
    if (r.width >= 12 && r.height >= 12) mark(el, bg);
  }
  const clearTree = (n) => {
    if (n.nodeType !== 1) return;
    clearPanel(n);
    for (const d of n.querySelectorAll("*")) clearPanel(d);
  };
  let bandRoots = [];
  const bandMo = new MutationObserver(
    CPX.guard("ambient:bands", (recs) => {
      for (const r of recs) {
        if (r.type === "childList") r.addedNodes.forEach(clearTree);
        else clearPanel(r.target); // классы сменились (Twitch переписал — метка ушла; или стал цвета панели)
      }
    })
  );
  /** Корни области над закрепом и лентой: дети .chat-room__content до первого с закрепом, лентой или списком чата (и
   *  до контейнера закрепа, пока он пуст: он — сразу перед списком); и блоки лидеров, если Twitch положит их иначе. */
  function bands(room) {
    const out = [];
    const content = room.querySelector(".chat-room__content");
    if (content) {
      const kids = [...content.children];
      const stop = kids.findIndex((k) => k.matches(NOT_BAND) || !!k.querySelector(NOT_BAND));
      const list = kids.findIndex((k) => k.matches('[class*="chat-list"]') || !!k.querySelector('[class*="chat-list"], .chat-scrollable-area__message-container, .cpx-chat'));
      let end = stop < 0 ? kids.length : stop;
      if (list >= 0 && list === end && end > 0 && !kids[end - 1].querySelector(LEADER) && !kids[end - 1].textContent.trim()) end--; // пустой контейнер закрепа
      for (let i = 0; i < end; i++) out.push(kids[i]);
    }
    for (const e of room.querySelectorAll(LEADER)) {
      if (out.some((r) => r.contains(e))) continue;
      let top = e;
      for (let p = e.parentElement; p && p !== room && !p.querySelector(NOT_LEADER); p = p.parentElement) top = p;
      if (!out.includes(top)) out.push(top);
    }
    return out;
  }
  function clearBands(room) {
    const w = room.getBoundingClientRect().width;
    for (const e of room.querySelectorAll('[class*="community-highlight-stack__scroll-area"]')) {
      for (let p = e.parentElement; p && p !== room; p = p.parentElement) {
        if (p.classList.contains("cpx-amb-clear")) break;
        if (p.getBoundingClientRect().width < w - 2) continue;
        clearOne(p);
      }
    }
    const roots = bands(room);
    if (roots.length !== bandRoots.length || roots.some((r, i) => r !== bandRoots[i])) {
      bandMo.disconnect();
      bandRoots = roots;
      for (const r of roots) bandMo.observe(r, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    }
    // Раз в секунду (check) — ещё раз: вставленное без размера и сменившее цвет без смены классов.
    roots.forEach(clearTree);
  }
  function unbands() {
    bandMo.disconnect();
    bandRoots = [];
  }

  /* ── режим модератора: «стекло» карточек (см. шапку) ── */
  const MOD_ROOT = ".moderation-view-page";
  // Внутрь не заходим: наше, плеер (его полосы — слой C), ленты (чат, действия, очередь — тысячи узлов), окна, кнопки,
  // картинка перетаскивания плитки (.mosaic-preview — копия заголовка ПОД ним; под «стеклом» её прячут стили, кроме
  // самого перетаскивания — cpx-amb-drag).
  const MOD_SKIP =
    ".cpx-own, .cpx-chat, .video-player, .mosaic-preview, .scrollable-area, .chat-scrollable-area__message-container, [class*='chat-list'], [role='dialog'], button, a, input, textarea, img, svg, video, canvas";
  const BASE = [7, 7, 9]; // основа под светом (#070709, page-74-ambient.css)
  const gseen = new WeakMap(); // узел → { cls, bg, mark }: цвет Twitch — один раз, пока у узла те же классы
  function bgOf(el) {
    const cls = typeof el.className === "string" ? el.className : "";
    const was = gseen.get(el);
    // Наша метка на месте — цвет прежний (свой класс добавила и чужая разметка, например focus-visible); Twitch
    // переписал классы целиком — метки нет: спросить заново (это уже цвет Twitch).
    if (was && (was.cls === cls || (was.mark && el.classList.contains(was.mark)))) {
      was.cls = cls;
      return was.bg;
    }
    const bg = getComputedStyle(el).backgroundColor;
    gseen.set(el, { cls, bg, mark: "" });
    return bg;
  }
  /** Стекло цвета orig над подложкой under, пропускает долю pass: без света — ровно orig. Доли не округляем до целых
   *  (округлённое давало синий 26 вместо 27); ±1 ступень остаётся от 8-битного смешивания в браузере — глазом не видно. */
  const glassOf = (orig, under, pass) =>
    "rgba(" + orig.map((v, i) => Math.max(0, Math.min(255, Math.round(((v - pass * under[i]) / (1 - pass)) * 100) / 100))).join(", ") + ", " + (1 - pass) + ")";
  function gmark(el, cls, bg, glass) {
    el.style.setProperty("--cpx-amb-orig", bg);
    if (glass) el.style.setProperty("--cpx-amb-glass", glass);
    el.classList.add(...cls);
    const e = gseen.get(el);
    if (e) {
      e.mark = cls[0];
      e.cls = el.className;
    }
  }
  /** Доля света внешней карточки (null — не трогать) и её классы. */
  function cardKind(el) {
    const tile = el.closest(".mosaic-window");
    if (tile) {
      if (!chatOn() && tile.querySelector(".chat-room")) return null; // «Свет на чате» выключен
      if (el.matches('[data-a-target="mosaic-panel-header"]')) return { pass: 0.4, cls: ["cpx-amb-glass", "cpx-amb-gtext"] };
      if (S.video && tile.contains(S.video)) return { pass: 0.5, cls: ["cpx-amb-glass", "cpx-amb-gtext"] }; // плитка трансляции
      return { pass: 0.2, cls: ["cpx-amb-glass"] }; // плитки с лентами — как чат на канале
    }
    if (el.closest(".mod-view-context-bar") || el.querySelector(".mod-view-context-bar")) return { pass: 0.2, cls: ["cpx-amb-glass"] }; // «Сообщество»
    return { pass: 0.4, cls: ["cpx-amb-glass", "cpx-amb-gtext", "cpx-amb-gnav"] }; // полоса сверху, значки слева
  }
  function modGlass() {
    const page = document.querySelector(MOD_ROOT);
    if (!page) return;
    const walk = (el, card, depth) => {
      for (const ch of el.children) {
        if (ch.matches(MOD_SKIP)) continue;
        const bg = bgOf(ch);
        const rgb = panelRgb(bg);
        if (!rgb) {
          if (depth < (card ? 8 : 24)) walk(ch, card, depth + 1);
          continue;
        }
        const r = ch.getBoundingClientRect();
        if (!card) {
          if (r.width < 12 || r.height < 12) continue;
          const k = cardKind(ch);
          if (!k) continue;
          if (!ch.classList.contains("cpx-amb-glass")) gmark(ch, k.cls, bg, glassOf(rgb, BASE, k.pass));
          walk(ch, { bg, rgb, w: r.width }, 0);
        } else if (r.width >= card.w - 2) {
          // Обёртка во всю ширину карточки: того же цвета — прозрачна, другого цвета панели (шапка «Сообщества») — своё
          // стекло над карточкой (света — половина того, что прошло карточку).
          if (bg === card.bg) {
            if (!ch.classList.contains("cpx-amb-clear")) gmark(ch, ["cpx-amb-clear"], bg);
            walk(ch, card, depth + 1);
          } else {
            if (!ch.classList.contains("cpx-amb-glass")) gmark(ch, ["cpx-amb-glass"], bg, glassOf(rgb, card.rgb, 0.5));
            walk(ch, { bg, rgb, w: r.width }, 0);
          }
        }
        // Уже карточки — своя карточка Twitch (закреп, поле ввода, переключатель): плотная, как у Twitch.
      }
    };
    walk(page, null, 0);
  }
  /** Снять «стекло» (выключили «Свет на чате» — плитка чата снова плотная); следующий обход поставит заново. */
  function unglass() {
    const page = document.querySelector(MOD_ROOT);
    if (!page) return;
    for (const el of page.querySelectorAll(".cpx-amb-glass, .cpx-amb-clear")) {
      el.classList.remove("cpx-amb-glass", "cpx-amb-clear", "cpx-amb-gtext", "cpx-amb-gnav");
      const e = gseen.get(el);
      if (e) {
        e.mark = "";
        e.cls = el.className;
      }
    }
  }
  // Плитку переставили: сетка Twitch двигает плитки стилем (top/left/right/bottom) — размер видео может не измениться,
  // ResizeObserver тогда молчит.
  function watchTiles() {
    const root = document.querySelector(".mosaic-root");
    if (!root || root === S.tileRoot) return;
    if (S.tileMo) S.tileMo.disconnect();
    S.tileRoot = root;
    S.tileMo = new MutationObserver(onTiles);
    S.tileMo.observe(root, { childList: true });
    for (const t of root.children) S.tileMo.observe(t, { attributes: true, attributeFilter: ["style"] });
  }
  const onTiles = CPX.guard("ambient:tiles", (recs) => {
    if (!S.active || !S.tileMo) return;
    for (const r of recs) if (r.type === "childList") r.addedNodes.forEach((n) => n.nodeType === 1 && S.tileMo.observe(n, { attributes: true, attributeFilter: ["style"] }));
    place();
  });

  const onScroll = () => S.active && !S.mod && place(true); // в режиме модератора прокручиваются только плитки
  const onResize = () => S.active && place(!S.mod);
  const onEnd = () => stop("видео кончилось");
  const onNew = () => {
    S.first = true;
  };
  const onSize = () => {
    S.first = true;
    place();
  };
  function start(v, full, mod) {
    if (S.active && S.video === v && S.full === full && S.mod === mod) return;
    stop("restart", true);
    S.video = v;
    S.full = full;
    S.mod = mod;
    S.active = true;
    S.first = true;
    S.last = 0;
    S.next = 0;
    S.geo = null;
    S.costs = [];
    if (!S.gl && !S.forced2d) S.gl = makeGL();
    S.eco = modeKey() === "eco";
    mount();
    classes();
    if (S.mod && S.full) {
      modGlass();
      watchTiles();
    }
    S.ro = new ResizeObserver(() => place());
    S.ro.observe(v);
    const host = SITE.player(v);
    if (host) S.ro.observe(host);
    if (typeof IntersectionObserver === "function") {
      S.io = new IntersectionObserver((es) => (S.visible = es.some((e) => e.isIntersecting)));
      S.io.observe(v);
    }
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("resize", onResize, { passive: true });
    v.addEventListener("ended", onEnd);
    v.addEventListener("emptied", onEnd);
    v.addEventListener("loadeddata", onNew);
    v.addEventListener("seeked", onNew);
    v.addEventListener("resize", onSize);
    place();
    schedule();
    log.debug("подсветка включена:", full ? "страница и плеер" : "только полосы плеера", S.eco ? "(экономно)" : "");
  }
  function stop(why, quick) {
    if (!S.active && !S.video) return;
    S.active = false;
    const v = S.video;
    if (v) {
      if (S.vfc && typeof v.cancelVideoFrameCallback === "function") v.cancelVideoFrameCallback(S.vfc);
      v.removeEventListener("ended", onEnd);
      v.removeEventListener("emptied", onEnd);
      v.removeEventListener("loadeddata", onNew);
      v.removeEventListener("seeked", onNew);
      v.removeEventListener("resize", onSize);
    }
    S.vfc = 0;
    if (S.raf) cancelAnimationFrame(S.raf);
    S.raf = 0;
    if (S.ro) S.ro.disconnect();
    if (S.io) S.io.disconnect();
    S.ro = S.io = null;
    if (S.tileMo) S.tileMo.disconnect();
    S.tileMo = S.tileRoot = null;
    document.removeEventListener("scroll", onScroll, { capture: true });
    window.removeEventListener("resize", onResize);
    S.video = null;
    S.geo = null;
    S.chatover = false;
    S.tchat = false;
    S.visible = true;
    root().classList.remove("cpx-amb-shown");
    const done = () => {
      if (S.active) return; // за время ухода включились снова
      classes();
      unmount();
      if (!S.want) release();
    };
    if (quick) done();
    else setTimeout(done, why === "видео кончилось" ? 800 : FADE_MS);
    if (why !== "restart") log.debug("подсветка выключена:", why);
  }

  /** Раскладку сменили, а размер видео тот же (включили на лету «Чат слева» или «Чат под плеером», в окне уже 920 px
   *  Twitch и «чат под плеером» дают видео один размер): ResizeObserver молчит, а место видео или «чат поверх видео»
   *  уже другие (ревью 30.10: свет оставался на старом месте, стекло чата — поверх видео). Раз в секунду (check). */
  function stale() {
    const g = S.geo;
    const r = g && S.video && !document.fullscreenElement ? contentRect(S.video) : null;
    if (!r) return false;
    if (Math.abs(r.x - g.cx) > 2 || Math.abs(r.y - g.cy) > 2) return true;
    const col = SITE.column();
    const cb = col && col.getBoundingClientRect();
    const overlap = !!cb && cb.width > 0 && cb.left < r.x + r.w - 2 && cb.right > r.x + 2 && cb.top < r.y + r.h - 2 && cb.bottom > r.y + 2;
    return (overlap || theatre()) !== S.chatover;
  }

  /* ── когда светить ──────────────────────────────────────────────────────── */
  function check() {
    const w = S.want && !forced() ? SITE.when() : null;
    const mod = !!(w && w.mod);
    let v = w && w.video;
    // Картинка в картинке: видео не на странице — светить нечему.
    if (v && document.pictureInPictureElement === v) v = null;
    const same = S.active && v && v === S.video && v.isConnected && v.videoWidth > 0; // пауза, ожидание данных
    if (!same && (!v || !v.isConnected || !(v.videoWidth > 0) || v.readyState < 2)) {
      if (S.active) stop(!S.want ? "выключена" : "нет видео");
      return;
    }
    const full = !!w.full;
    if (!S.active || S.video !== v || S.full !== full || S.mod !== mod) start(v, full, mod);
    else if (S.mod && S.full) {
      // Twitch дорисовывает плитки и перестраивает сетку — «стекло» новым карточкам, слежка — за новой сеткой.
      if ((S.cv.C && !S.cv.C.isConnected) || (S.cv.A && !S.cv.A.isConnected)) {
        mount();
        place();
      }
      modGlass();
      watchTiles();
    } else if ((S.cv.C && !S.cv.C.isConnected) || (S.full && S.cv.A && !S.cv.A.isConnected)) {
      mount(); // React пересоздал плеер или страницу
      place();
    } else if (S.full && S.tchat && chatOn() && !(S.dwrap && S.dwrap.isConnected) && SITE.room(SITE.column())) {
      mount(); // кинорежим: чат (записи — грузится позже видео) появился после включения света — слой D в колонку
      place();
    } else if (stale()) place();
    classes();
  }

  /* ── кнопка в плеере Twitch (перед «Режимом кинотеатра») ── */
  const GROUP = ".video-player__default-player .player-controls__right-control-group";
  const ICON_ON = '<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false" shape-rendering="crispEdges"><path fill="currentColor" d="M4 5h12v2H4zM4 13h12v2H4zM4 7h2v6H4zM14 7h2v6h-2z"/><path fill="#c9bff5" d="M0 2h2v2H0zM18 2h2v2h-2zM0 16h2v2H0zM18 16h2v2h-2zM0 9h2v2H0zM18 9h2v2h-2zM9 0h2v2H9zM9 18h2v2H9z"/></svg>';
  const ICON_OFF = '<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false" shape-rendering="crispEdges"><path fill="currentColor" d="M4 5h12v2H4zM4 13h12v2H4zM4 7h2v6H4zM14 7h2v6h-2z"/></svg>';
  const Bt = { wrap: null, btn: null };
  const childOf = (group, el) => {
    while (el && el.parentElement !== group) el = el.parentElement;
    return el || null;
  };
  function makeButton(group) {
    const fs = group.querySelector('[data-a-target="player-fullscreen-button"]') || [...group.querySelectorAll("button")].pop();
    const model = childOf(group, fs);
    if (!model || model.classList.contains("cpx-own")) return null;
    const wrap = model.cloneNode(true);
    const btn = wrap.querySelector("button");
    const svg = btn && btn.querySelector("svg");
    if (!btn || !svg) return null;
    for (const a of ["data-a-target", "aria-haspopup", "aria-pressed", "aria-expanded", "title"]) btn.removeAttribute(a);
    wrap.classList.add("cpx-own", "cpx-ambb");
    btn.classList.add("cpx-ambb__btn");
    btn.type = "button";
    svg.replaceWith(CPX.el.trusted(ICON_ON));
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const on = !lit();
      // Подпись «Мозаики» — только при переключении кнопкой: свет проявляется / рассыпается крупными клетками.
      // Рассыпался — маска держит его скрытым и на время ухода прозрачности (иначе свет мелькнул бы снова).
      if (!reduced() && !CPX.mz.off()) {
        root().classList.add(on ? "cpx-amb-pxin" : "cpx-amb-pxout");
        setTimeout(() => root().classList.remove("cpx-amb-pxin", "cpx-amb-pxout"), on ? 360 : 760);
      }
      const apply = () => CPX.settings.set("player.ambient", on);
      if (on) apply();
      else setTimeout(apply, reduced() || CPX.mz.off() ? 0 : 300);
    });
    btn.addEventListener("dblclick", (e) => e.stopPropagation());
    btn.addEventListener("mouseenter", tipShow);
    btn.addEventListener("mouseleave", tipHide);
    btn.addEventListener("blur", tipHide);
    Bt.btn = btn;
    paintButton();
    return wrap;
  }
  const lit = () => S.want;
  function paintButton() {
    if (!Bt.btn) return;
    const svg = Bt.btn.querySelector("svg");
    if (svg) svg.replaceWith(CPX.el.trusted(lit() ? ICON_ON : ICON_OFF));
    Bt.btn.setAttribute("aria-label", CPX.t(lit() ? "amb.on" : "amb.off"));
    Bt.btn.setAttribute("aria-pressed", lit() ? "true" : "false");
    if (Bt.btn.matches(":hover")) tipShow(); // подсказка — уже про новое состояние
  }
  const tipShow = () => Bt.btn && CPX.ui && CPX.ui.tip && CPX.ui.tip.show(Bt.btn, CPX.t(lit() ? "amb.on" : "amb.off"), { side: "top", delay: 150 });
  const tipHide = () => CPX.ui && CPX.ui.tip && CPX.ui.tip.hide();
  function placeButton(group) {
    if (CPX.settings.get("player.ambientButton") === false) {
      if (Bt.wrap) Bt.wrap.remove();
      return;
    }
    group = group || document.querySelector(GROUP);
    if (!group || window.top !== window) return;
    if (!Bt.wrap) Bt.wrap = makeButton(group);
    if (!Bt.wrap) return;
    const was = Bt.wrap.isConnected;
    const before = childOf(group, group.querySelector('button[aria-label*="alt+t" i]')) || childOf(group, group.querySelector('[data-a-target="player-fullscreen-button"]'));
    if (Bt.wrap.parentElement !== group || Bt.wrap.nextElementSibling !== before) group.insertBefore(Bt.wrap, before && before.parentElement === group ? before : null);
    if (!was) CPX.dom.gone(Bt.wrap, () => setTimeout(CPX.guard("ambient:place", () => placeButton()), 50));
  }

  CPX.boot.add(
    "player:ambient",
    () => {
      if (window.top !== window) return;
      SITE = CPX.ambientSite || TWITCH;
      S.want = CPX.settings.get("player.ambient") !== false;
      CPX.settings.on("player.ambient", (v) => {
        S.want = v !== false;
        paintButton();
        check();
      });
      CPX.settings.on("player.ambientDim", () => {
        classes();
        if (S.active) {
          mount();
          place();
        }
      });
      // Сменили режим — сразу в нём: экономный рисует другим полем (мельче), поэтому слои — заново.
      CPX.settings.on("player.ambientResponse", () => {
        S.last = 0;
        S.next = 0;
        const eco = modeKey() === "eco";
        if (eco === S.eco) return;
        S.eco = eco;
        if (S.active) {
          mount();
          place();
        }
      });
      CPX.settings.on("player.ambientButton", () => placeButton());
      // «Свет на чате» — и слои: в кинорежиме слой D стоит, только пока свет на чате включён.
      CPX.settings.on("player.ambientChat", () => {
        if (S.active && S.mod && S.full) {
          unglass(); // плитка чата: стекло снять или поставить — обход ниже решит по настройке
          modGlass();
        }
        classes();
        if (S.active) {
          mount();
          place();
        }
      });
      CPX.settings.on("general.lang", paintButton);
      // Тянут ширину чата (93_chat_width, владелец 30.10: плавность) — свет и так погашен сменой размера: ни места, ни
      // кадров, пока тянут; отпустили — сразу на новое место.
      if (CPX.chatWidth)
        CPX.chatWidth.ev.on("drag", (on) => {
          S.drag = on;
          if (!on && S.active) place();
        });
      // Режим модератора: тянут плитку за заголовок — картинку перетаскивания (.mosaic-preview) браузер снимает ПОСЛЕ
      // dragstart (её назначает обработчик сетки на window — после нашего на document), на это время копию — видимой.
      const undrag = () => root().classList.remove("cpx-amb-drag");
      document.addEventListener(
        "dragstart",
        (e) => S.mod && e.target instanceof Element && e.target.closest(".mosaic-window-toolbar") && root().classList.add("cpx-amb-drag"),
        true
      );
      document.addEventListener("dragend", undrag, true);
      document.addEventListener("drop", undrag, true);
      if (SITE.extras) {
        CPX.route.on(() => {
          if (S.active) stop("смена страницы");
          setTimeout(check, 300);
        });
        CPX.dom.on(GROUP, (g) => placeButton(g));
      }
      // Тема Twitch сменилась (в т. ч. выход из кинорежима в светлой теме) — пересчитать сразу: «Кинозал» в светлой теме
      // сделал бы тёмный текст на тёмном фоне.
      let wasDark = isDark();
      new MutationObserver(() => {
        if (isDark() === wasDark) return;
        wasDark = isDark();
        check();
      }).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
      // Видео появляется не сразу (заставка, реклама, «для взрослых», смена качества) — раз в секунду: дёшево (поиск
      // плеера по React — не чаще FIND_EVERY у CPX.player).
      setInterval(check, 1000);
      check();
    },
    74
  );

  CPX.diag.add("ambient", () => {
    const sorted = S.costs.slice().sort((a, b) => a - b);
    return { site: SITE.name, want: S.want, active: S.active, full: S.full, mode: modeKey(), eco: S.eco, path: S.stats.path, renderer: S.stats.renderer.slice(0, 60), frames: S.stats.frames, p95ms: sorted.length ? +sorted[Math.floor(sorted.length * 0.95)].toFixed(2) : 0, geo: S.geo && { w: S.geo.w, h: S.geo.h, bars: !!S.geo.bars } };
  });

  const api = {};
  api.state = () => ({ want: S.want, active: S.active, full: S.full, eco: S.eco, path: S.stats.path, frames: S.stats.frames, geo: S.geo ? Object.assign({}, S.geo, { host: undefined }) : null, renderer: S.stats.renderer });
  if (CPX.dev)
    api._dev = {
      S,
      tick: () => update(performance.now()),
      eco: (v) => {
        S.eco = !!v;
        mount();
        place();
      },
    };
  return api;
})();

// ── src/kick/75_kick_input.js ──
/* Мир Kick: поле ввода Kick (редактор Lexical) — тот же набор действий CPX.input, что у поля Twitch (75_input_core), чтобы
 * общие модули ввода работали и здесь: перебор смайликов по Tab (76_input_tab), меню смайликов. Задание 15.11.
 *
 * ПОЛЕ. div[data-lexical-editor][contenteditable] (data-testid=chat-input) в #chat-input-wrapper. Текст поля — текстовые
 * узлы абзацев; смайлик Kick в поле — узел-пустышка (contenteditable=false) — в тексте поля его имя.
 * ПРАВКА. Своё состояние у Lexical: чужие правки узлов он откатывает. Поэтому меняем как человек: выделение браузера на
 * ИЗМЕНЁННЫЙ кусок (общее начало и конец старого и нового текста отбрасываем — смайлики Kick и прочее в поле не
 * трогаются) и document.execCommand("insertText") — Lexical принимает это как набор с клавиатуры. Курсор — выделением
 * браузера в следующем кадре (Lexical перенимает его по selectionchange).
 *
 * API (как 75_input_core): editorEl() · box() (рамка поля — над ней лента Tab) · getText() · setText(текст, курсор) ·
 * insert(текст, {word}) · focus() · caret() · suggesting() (открыт список подсказок Kick — Tab у него) ·
 * autocomplete() → {getCurrentCursorPosition} · provider("mention") → ники недавних авторов чата (Tab по «@») ·
 * twitchTokens() → пусто · on("sent" | "attach" | "detach") · _tabEmotes(начало) — смайлики 7TV для Tab ·
 * EMOTE_BTN — кнопка нашего меню смайликов. Ставит и CPX.ui.inputAnchor (рамка поля — якорь меню над полем).
 */

CPX.input = (() => {
  const log = CPX.log("kick-input");
  const ev = new CPX.Emitter();
  const EDITOR = '#chat-input-wrapper [data-lexical-editor="true"][contenteditable="true"]';
  const NICKS_MAX = 300;
  const nicks = new Map(); // ник (как пишется) → когда писал: Tab по «@» — недавние авторы видимого чата
  let attached = null;

  function editorEl() {
    for (const e of document.querySelectorAll(EDITOR)) if (e.getBoundingClientRect().width > 0) return e;
    return null;
  }
  const box = () => {
    const ed = editorEl();
    return ed ? ed.closest("#chat-input-wrapper") : null;
  };

  /** Текст поля кусками: {node (текстовый узел) | null, text, start, end}; пустышки (смайлики Kick) — их имя. */
  function segs(ed) {
    const out = [];
    let pos = 0;
    const push = (node, text) => {
      out.push({ node, text, start: pos, end: pos + text.length });
      pos += text.length;
    };
    let para = 0;
    for (const p of ed.children) {
      if (para++) push(null, "\n");
      // Текстовые узлы и пустышки (смайлик Kick — один кусок с его именем; внутрь пустышки не заходим).
      const inDec = (n) => !!(n.parentElement && n.parentElement.closest('[contenteditable="false"]'));
      const w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
        acceptNode(n) {
          if (n.nodeType === 3) return inDec(n) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
          if (n.getAttribute("contenteditable") === "false") return inDec(n) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
          return NodeFilter.FILTER_SKIP;
        },
      });
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        if (n.nodeType === 3) {
          push(n, n.data);
        } else {
          // Смайлик Kick — картинка (имя — alt), упоминание «@ник» — текст внутри (стенд 15.11: div.editor-custom-node).
          const img = n.querySelector("img");
          push(null, (n.dataset && (n.dataset.emoteName || n.dataset.name)) || (img && img.alt) || n.textContent || "");
        }
      }
    }
    return out;
  }

  function getText() {
    const ed = editorEl();
    return ed ? segs(ed).map((s) => s.text).join("") : "";
  }

  /** Позиция курсора в тексте поля (по выделению браузера) или -1. */
  function caretPos(ed, list) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !ed.contains(sel.focusNode)) return -1;
    const fn = sel.focusNode;
    const fo = sel.focusOffset;
    for (const s of list) if (s.node === fn) return s.start + Math.min(fo, s.text.length);
    // Курсор между узлами (на элементе): конец последнего куска перед ребёнком fo.
    const kid = fn.childNodes[fo] || null;
    let best = list.length ? list[list.length - 1].end : 0;
    if (kid) {
      for (const s of list) {
        const n = s.node || null;
        if (n && (kid === n || kid.contains(n))) {
          best = s.start;
          break;
        }
      }
    }
    return best;
  }

  /** Точка DOM для позиции в тексте поля (только в текстовом узле; иначе null). */
  function point(list, pos, preferNext) {
    for (const s of list) {
      if (!s.node) continue;
      if (pos > s.start && pos < s.end) return { node: s.node, offset: pos - s.start };
      if (pos === s.end && !preferNext) return { node: s.node, offset: s.text.length };
      if (pos === s.start) return { node: s.node, offset: 0 };
      if (pos === s.end) return { node: s.node, offset: s.text.length };
    }
    return null;
  }

  function select(a, b) {
    const sel = window.getSelection();
    const r = document.createRange();
    r.setStart(a.node, a.offset);
    r.setEnd(b.node, b.offset);
    sel.removeAllRanges();
    sel.addRange(r);
  }

  function setCaret(pos) {
    const ed = editorEl();
    if (!ed) return false;
    const list = segs(ed);
    const p = point(list, pos, false);
    if (!p) return false;
    select(p, p);
    return true;
  }

  /** Текст поля целиком → value; меняется только отличающийся кусок (см. шапку); курсор — в caret (по умолчанию в конец). */
  function setText(value, caret) {
    const ed = editorEl();
    if (!ed) return false;
    value = String(value);
    const list = segs(ed);
    const cur = list.map((s) => s.text).join("");
    let a = 0;
    while (a < cur.length && a < value.length && cur[a] === value[a]) a++;
    let b = 0;
    while (b < cur.length - a && b < value.length - a && cur[cur.length - 1 - b] === value[value.length - 1 - b]) b++;
    const from = a;
    const to = cur.length - b;
    const repl = value.slice(a, value.length - b);
    if (document.activeElement !== ed) ed.focus({ preventScroll: true });
    if (from !== to || repl) {
      let pa = point(list, from, true);
      let pb = point(list, to, false);
      if (!pa || !pb) {
        // Пустое поле — курсор в сам редактор, текст — набором.
        if (!list.some((s) => s.node)) pa = pb = null;
        else return false;
      }
      if (pa && pb) select(pa, pb);
      const ok = repl ? document.execCommand("insertText", false, repl) : document.execCommand("delete", false);
      if (!ok) return false;
    }
    const at = caret == null ? value.length : Math.max(0, Math.min(value.length, caret));
    requestAnimationFrame(() => CPX.safely("kick:caret", () => setCaret(at)));
    return true;
  }

  function insert(text, opts) {
    const ed = editorEl();
    if (!ed) return false;
    const list = segs(ed);
    const cur = list.map((s) => s.text).join("");
    let pos = caretPos(ed, list);
    if (pos < 0) pos = cur.length;
    let t = String(text);
    if (opts && opts.word) {
      if (pos > 0 && !/\s/.test(cur.charAt(pos - 1))) t = " " + t;
      if (!/^\s/.test(cur.slice(pos))) t += " ";
    }
    return setText(cur.slice(0, pos) + t + cur.slice(pos), pos + t.length);
  }

  function focus() {
    const ed = editorEl();
    if (!ed) return false;
    ed.focus({ preventScroll: true });
    return true;
  }

  function caret() {
    const ed = editorEl();
    if (!ed) return null;
    const list = segs(ed);
    const len = list.map((s) => s.text).join("").length;
    const sel = window.getSelection();
    const p = caretPos(ed, list);
    if (p < 0) return null;
    return { collapsed: !!(sel && sel.isCollapsed), atStart: p === 0, atEnd: p === len };
  }

  // Список подсказок Kick под полем («:» смайлики, «@» ники) — открыт: Tab и стрелки — у него.
  function suggesting() {
    const f = document.querySelector("#chatroom-footer");
    return !!(f && [...f.querySelectorAll('[role="listbox"], [role="menu"], [data-testid*="suggest" i]')].some((x) => !x.closest(".cpx-own") && x.getBoundingClientRect().height > 0));
  }

  const autocomplete = () => ({
    getCurrentCursorPosition() {
      const ed = editorEl();
      if (!ed) return NaN;
      const list = segs(ed);
      const p = caretPos(ed, list);
      return p < 0 ? NaN : p;
    },
  });

  // Ники для Tab по «@» — авторы, чьи строки видел этот мир (site/40_site_lines: CPX.input.noteNick).
  function noteNick(name) {
    if (!name) return;
    nicks.delete(name);
    nicks.set(name, Date.now());
    if (nicks.size > NICKS_MAX) nicks.delete(nicks.keys().next().value);
  }
  const mention = {
    getMatches(word) {
      const at = word.charAt(0) === "@";
      const q = (at ? word.slice(1) : word).toLowerCase();
      if (!q && !at) return [];
      const out = [];
      for (const n of [...nicks.keys()].reverse()) if (n.toLowerCase().startsWith(q)) out.push({ replacement: (at ? "@" : "") + n });
      return out.slice(0, 50);
    },
  };

  /** Смайлики 7TV для Tab: начинаются с prefix (без учёта регистра); канал, потом глобальные, внутри — по алфавиту. */
  function tabEmotes(prefix) {
    const lq = String(prefix || "").toLowerCase();
    const st = CPX.chat.state;
    if (!lq || !st) return [];
    const out = [];
    for (const [n, x] of CPX.emotes.list(st.channelId)) {
      if (!n.toLowerCase().startsWith(lq)) continue;
      const u = CPX.emotes.urls(x.rec);
      out.push({ token: n, r: x.scope === "channel" ? 0 : 1, src: u[1] || "", srcset: u[1] ? u[1] + " 1x, " + (u[2] || u[1]) + " 2x" : "" });
    }
    const lc = (t) => t.toLowerCase();
    out.sort((a, b) => a.r - b.r || (lc(a.token) < lc(b.token) ? -1 : lc(a.token) > lc(b.token) ? 1 : 0));
    return out.map((x) => ({ token: x.token, src: x.src, srcset: x.srcset }));
  }

  function check() {
    const ed = editorEl();
    if (ed === attached) return;
    if (attached) ev.emit("detach");
    attached = ed;
    if (ed) ev.emit("attach");
  }

  CPX.boot.add(
    "kick:input",
    () => {
      if (window.top !== window) return;
      // Рамка поля — якорь всплывашек над полем (меню смайликов; у Twitch — 98_ui_input).
      CPX.ui.inputAnchor = () => {
        const b = box();
        const r = b && b.getBoundingClientRect();
        return r && r.width && r.height ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height, x: r.left, y: r.top } : null;
      };
      CPX.dom.on(EDITOR, () => CPX.safely("kick:input", check));
      CPX.chat.on("attach", () => setTimeout(() => CPX.safely("kick:input", check), 0));
      // Enter в поле — Kick отправляет: перебор и прочее «по набору» кончается.
      window.addEventListener(
        "keydown",
        (e) => {
          if (e.key !== "Enter" || e.shiftKey || e.isComposing) return;
          const ed = editorEl();
          if (!ed || !(e.target instanceof Node) || !ed.contains(e.target)) return;
          const text = getText();
          setTimeout(() => ev.emit("sent", { text, typed: text, channelId: CPX.chat.state && CPX.chat.state.channelId }), 0);
        },
        true
      );
      log.debug("поле Kick подключено");
    },
    75
  );

  CPX.diag.add("kickInput", () => ({ editor: !!editorEl(), nicks: nicks.size }));

  return {
    editorEl,
    box,
    root: box,
    getText,
    setText,
    insert,
    focus,
    caret,
    suggesting,
    autocomplete,
    provider: (type) => (type === "mention" ? mention : null),
    controller: () => null,
    twitchTokens: () => new Set(),
    on: (name, fn) => ev.on(name, fn),
    _emit: (name, d) => ev.emit(name, d),
    _tabEmotes: tabEmotes,
    noteNick,
    /** Кнопка нашего меню смайликов (79_kick_emm) — её щелчок ловит 79_emote_menu_ui. */
    EMOTE_BTN: "button.cpx-kemm",
  };
})();

// ── src/main/76_input_tab.js ──
/* Поле ввода: дополнение по Tab перебором — как в клиенте и 7TV (владелец 10.10, жалоба: «когда пишешь смайл 7TV, то
 * следующие не показываются, у которых похожие символы»).
 *
 * Было: Tab отдавали РОДНОЙ выпадашке Twitch (76_input_emotes). Стенд 10.10: первый Tab только открывал её (текст не
 * менялся), второй подставлял первый смайлик и закрывал, третий — подходящих «нет», и Tab браузера уводил фокус из
 * поля на кнопки: следующий похожий не достать, а набор после этого шёл мимо поля.
 * Стало (клиент, 7TV): Tab в поле ВСЕГДА остаётся в поле (пустое поле — не трогаем: Tab браузера к кнопкам);
 *  • слово перед курсором (с «:» в начале — тоже, двоеточие уходит) сразу заменяется первым подходящим и пробелом;
 *    ещё Tab — следующий по кругу, Shift+Tab — назад (с первого нажатия Shift+Tab — с последнего);
 *  • подходящие: смайлики, чьё имя НАЧИНАЕТСЯ с набранного (от двух букв; наши 7TV/BTTV/FFZ и родные Twitch, по
 *    слоям личные → канал → Twitch → глобальные, внутри — по алфавиту; 76_input_emotes), потом ники — родной
 *    провайдер ников Twitch с тем же словом; «@…» — только ники;
 *  • над полем — лента вариантов (до STRIP вокруг текущего, «3/12»; щелчок — выбрать): видно следующие;
 *  • перебор кончается любой другой клавишей, щелчком, уходом из поля, отправкой — и ещё если текст поля
 *    поменялся не нами (сверка значения и позиции курсора перед каждым Tab);
 *  • открыта выпадашка Twitch («:», «@», «/») — Tab у неё. Стоит 7TV — Tab НАШ (владелец 23.10: мы в приоритете): его
 *    Tab висит на самом поле, наш — на window в фазе захвата и дальше клавишу не пускает.
 * Подстановка — CPX.input.setText (как выбор из выпадашки: имя смайлика в поле — картинкой), курсор — после пробела.
 */

(() => {
  const log = CPX.log("input:tab");
  const MIN = 2; // смайлики — от двух букв (как раньше); ники — с одной
  const STRIP = 7;
  // Перебор: {s0 (начало слова), token (подставлено), matches, i, value (текст после подстановки), caret}.
  let st = null;
  let strip = null;

  const tabOn = () => CPX.settings.get("input.emotes") !== false && CPX.settings.get("input.tab") !== false;

  function inInput(t) {
    const ed = CPX.input.editorEl();
    return !!(ed && t && t instanceof Node && ed.contains(t));
  }

  // Ники — родной провайдер ников Twitch (как раньше в 76_input_emotes): его выдача с тем же словом.
  function nicks(word) {
    const mp = CPX.input.provider("mention");
    if (!mp || typeof mp.getMatches !== "function") return [];
    let r = null;
    try {
      r = mp.getMatches(word, true);
    } catch (e) {
      CPX.report("input:tabNicks", e);
    }
    return Array.isArray(r) ? r.map((m) => String((m && m.replacement) || "")).filter(Boolean) : [];
  }

  function candidates(word) {
    const out = [];
    const seen = new Set();
    if (word.charAt(0) !== "@" && word.length >= MIN && CPX.input._tabEmotes) {
      for (const e of CPX.input._tabEmotes(word)) {
        seen.add(e.token.toLowerCase());
        out.push(e);
      }
    }
    for (const t of nicks(word)) {
      const k = t.replace(/^@/, "").toLowerCase();
      if (seen.has(k) || seen.has(t.toLowerCase())) continue;
      seen.add(k);
      out.push({ token: t, nick: true });
    }
    return out;
  }

  function cursorAt(text) {
    const a = CPX.input.autocomplete();
    const p = a && typeof a.getCurrentCursorPosition === "function" ? Number(a.getCurrentCursorPosition()) : NaN;
    return p >= 0 && p <= text.length ? p : text.length;
  }

  /** Подставить matches[i] вместо [s0, e0) (sep — пробел после, если его нет). */
  function apply(text, s0, e0, matches, i, sep) {
    const token = matches[i].token;
    const value = text.slice(0, s0) + token + sep + text.slice(e0);
    const caret = Math.min(value.length, s0 + token.length + 1);
    st = { s0, token, matches, i, value, caret };
    CPX.input.setText(value, caret);
    show();
  }

  function tab(back) {
    const text = CPX.input.getText();
    const pos = cursorAt(text);
    if (st && st.value === text && st.caret === pos && st.matches.length > 1) {
      const n = st.matches.length;
      apply(text, st.s0, st.s0 + st.token.length, st.matches, (st.i + (back ? n - 1 : 1)) % n, "");
      return;
    }
    if (st && st.value === text && st.caret === pos) return; // единственный вариант уже стоит
    stop();
    let s0 = pos;
    while (s0 > 0 && !/\s/.test(text.charAt(s0 - 1))) s0--;
    let e0 = pos;
    while (e0 < text.length && !/\s/.test(text.charAt(e0))) e0++;
    let word = text.slice(s0, pos);
    if (word.charAt(0) === ":") word = word.slice(1); // «:смайл» после закрытой выпадашки — тоже дополняем
    if (!word || (s0 === 0 && word.charAt(0) === "/")) return;
    const matches = candidates(word);
    if (!matches.length) return;
    apply(text, s0, e0, matches, back ? matches.length - 1 : 0, /\s/.test(text.charAt(e0)) ? "" : " ");
  }

  /* ── лента вариантов ────────────────────────────────────────────────────── */

  function show() {
    const ed = CPX.input.editorEl();
    // Рамка поля: у Twitch — .chat-wysiwyg-input-box; у мира Kick её даёт его поле (src/kick/75_kick_input: box()).
    const box = typeof CPX.input.box === "function" ? CPX.input.box() : ed && ed.closest(".chat-wysiwyg-input-box");
    if (!box || !st || st.matches.length < 2) return hide();
    if (!strip) {
      strip = CPX.el("div", { class: "cpx-own cpx-tabc cpx-mz cpx-k1 cpx-t-tip", role: "listbox" });
      // Щелчок по варианту — выбрать; фокус остаётся в поле.
      strip.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const it = e.target instanceof Element ? e.target.closest("[data-i]") : null;
        if (!it || !st) return;
        const text = CPX.input.getText();
        if (text !== st.value) return stop();
        apply(text, st.s0, st.s0 + st.token.length, st.matches, Number(it.dataset.i), "");
        stop();
        CPX.input.focus();
      });
    }
    if (strip.parentNode !== box) box.appendChild(strip);
    const n = st.matches.length;
    const from = n > STRIP ? Math.min(Math.max(0, st.i - 2), n - STRIP) : 0;
    const items = [];
    for (let k = from; k < Math.min(n, from + STRIP); k++) {
      const m = st.matches[k];
      const on = k === st.i;
      const kids = [];
      if (m.nick) kids.push(CPX.el("span", { class: "cpx-tabc__at", text: "@" }));
      else if (m.src) {
        const img = CPX.el("img", { class: "cpx-tabc__img", alt: "" });
        const u = CPX.safe.imgUrl(m.src);
        if (u) {
          img.src = u;
          if (m.srcset) img.srcset = m.srcset;
          kids.push(img);
        }
      }
      kids.push(CPX.el("span", { class: "cpx-tabc__name", text: m.token.replace(/^@/, "") }));
      items.push(CPX.el("div", { class: "cpx-tabc__it" + (on ? " cpx-tabc__it--on cpx-mz cpx-k1 cpx-t-acc" : ""), role: "option", "aria-selected": on ? "true" : "false", "data-i": String(k) }, kids));
    }
    items.push(CPX.el("span", { class: "cpx-tabc__n", text: st.i + 1 + "/" + n }));
    strip.replaceChildren(...items);
  }

  function hide() {
    if (strip && strip.parentNode) strip.remove();
  }

  function stop() {
    st = null;
    hide();
  }

  /* ── клавиши ────────────────────────────────────────────────────────────── */

  const onKey = CPX.guard("input:tabKey", (e) => {
    if (!inInput(e.target)) return;
    if (e.key !== "Tab") {
      // Любая другая клавиша (кроме самих модификаторов) — перебор окончен.
      if (st && !/^(Shift|Control|Alt|Meta)$/.test(e.key)) stop();
      return;
    }
    if (e.ctrlKey || e.altKey || e.metaKey || e.isComposing || e.defaultPrevented) return;
    if (!tabOn() || CPX.input.suggesting()) return;
    if (!CPX.input.getText()) return; // пустое поле — Tab браузера (к кнопкам)
    // Из поля Tab не уводим никогда (стенд 10.10: иначе набор после третьего Tab шёл мимо поля).
    e.preventDefault();
    e.stopPropagation();
    tab(e.shiftKey);
  });

  CPX.boot.add(
    "input:tab",
    () => {
      window.addEventListener("keydown", onKey, true);
      // Ушли из поля, щёлкнули мимо ленты, отправили, сменили канал — перебор окончен.
      window.addEventListener(
        "mousedown",
        (e) => {
          if (st && !(strip && e.target instanceof Node && strip.contains(e.target))) stop();
        },
        true
      );
      document.addEventListener(
        "focusout",
        (e) => {
          if (st && inInput(e.target)) setTimeout(() => !inInput(document.activeElement) && stop(), 0);
        },
        true
      );
      CPX.input.on("sent", stop);
      CPX.input.on("detach", stop);
      CPX.chat.on("change", stop);
      log.debug("перебор по Tab подключён");
    },
    76
  );

  CPX.diag.add("inputTab", () => ({ on: tabOn(), cycling: st ? { word: st.token, i: st.i, n: st.matches.length } : null, strip: !!(strip && strip.parentNode) }));
})();

// ── src/main/78_emoji_data.js ──
/* Мир страницы: данные эмодзи для меню смайликов (вкладка «Эмодзи», 78_emoji_model.js).
 *
 * ВСТРОЕННЫЕ данные, ничего не скачивается. Файл СОБРАН скриптом из:
 *  • набора эмодзи Chatterino (resources/emoji.json) = iamcal/emoji-data, лицензия MIT
 *    (Copyright (c) 2013 Cal Henderson) — текст лицензии: static/emoji-data-LICENSE.txt;
 *    английские имена и короткие имена, порядок и разделы Unicode, оттенки кожи;
 *  • русские слова для поиска — свои (основные эмодзи); названия стран у флагов — из Windows.
 * Взяты эмодзи до версии Unicode Emoji 15.0 включительно (новее Windows пока не рисует).
 * Всего: 1870. Руками не править — пересобрать: py research/emoji/build_emoji.py (слова — emoji_ru.py).
 *
 * Формат: cats — [ключ, название EN, название RU, значок]; list[i] — раздел cats[i]: строки через \n,
 * поля через \t: эмодзи · английские слова через | · русские слова через «, » · оттенки:
 * "" — нет, "t" — модификатор после первого знака (без FE0F за ним), "T…" — пять готовых вариантов
 * через пробел (светлый → тёмный).
 */

CPX.emojiData = {"v": "15.0", "cats": [["smileys", "Smileys & Emotion", "Смайлики и эмоции", "😀"], ["people", "People & Body", "Люди и тело", "👋"], ["nature", "Animals & Nature", "Животные и природа", "🐻"], ["food", "Food & Drink", "Еда и напитки", "🍔"], ["travel", "Travel & Places", "Путешествия и места", "🚗"], ["activity", "Activities", "Занятия", "⚽"], ["objects", "Objects", "Предметы", "💡"], ["symbols", "Symbols", "Символы", "❤️"], ["flags", "Flags", "Флаги", "🏁"]], "list": ["😀\tgrinning face|grinning\tулыбка, радость\t\n😃\tsmiling face with open mouth|smiley\tулыбка, радость\t\n😄\tsmiling face with open mouth and smiling eyes|smile\tулыбка, смех, радость\t\n😁\tgrinning face with smiling eyes|grin\tухмылка, улыбка до ушей\t\n😆\tsmiling face with open mouth and tightly-closed eyes|laughing|satisfied\tсмех, хохот\t\n😅\tsmiling face with open mouth and cold sweat|sweat smile\tсмех, пот, неловко\t\n🤣\trolling on the floor laughing\tкатается от смеха, ржу, смех\t\n😂\tface with tears of joy|joy\tслёзы радости, смех до слёз, ржу\t\n🙂\tslightly smiling face\tлёгкая улыбка\t\n🙃\tupside-down face|upside down face\tвверх ногами, перевёрнутый\t\n🫠\tmelting face\tтает, плавится\t\n😉\twinking face|wink\tподмигивает\t\n😊\tsmiling face with smiling eyes|blush\tрумянец, улыбка, смущение\t\n😇\tsmiling face with halo|innocent\tангел, невинный, нимб\t\n🥰\tsmiling face with smiling eyes and three hearts|smiling face with 3 hearts\tвлюблён, сердечки, любовь\t\n😍\tsmiling face with heart-shaped eyes|heart eyes\tвлюблённые глаза, сердца, любовь\t\n🤩\tgrinning face with star eyes|star struck\tзвёзды в глазах, восторг\t\n😘\tface throwing a kiss|kissing heart\tпоцелуй, воздушный поцелуй\t\n😗\tkissing face|kissing\tпоцелуй\t\n☺️\twhite smiling face|relaxed\tулыбка, довольный\t\n😚\tkissing face with closed eyes|kissing closed eyes\tпоцелуй\t\n😙\tkissing face with smiling eyes|kissing smiling eyes\tпоцелуй\t\n🥲\tsmiling face with tear\tулыбка со слезой, трогательно\t\n😋\tface savouring delicious food|yum\tвкусно, облизывается\t\n😛\tface with stuck-out tongue|stuck out tongue\tязык, дразнит\t\n😜\tface with stuck-out tongue and winking eye|stuck out tongue winking eye\tязык, подмигивает, дразнит\t\n🤪\tgrinning face with one large and one small eye|zany face\tбезумный, чокнутый\t\n😝\tface with stuck-out tongue and tightly-closed eyes|stuck out tongue closed eyes\tязык, дразнит\t\n🤑\tmoney-mouth face|money mouth face\tденьги, доллары\t\n🤗\thugging face\tобнимашки, объятия\t\n🤭\tsmiling face with smiling eyes and hand covering mouth|face with hand over mouth\tой, хихикает\t\n🫢\tface with open eyes and hand over mouth\tой, шок\t\n🫣\tface with peeking eye\tподглядывает, стыдно\t\n🤫\tface with finger covering closed lips|shushing face\tтише, тсс, секрет\t\n🤔\tthinking face\tдумаю, хм, размышляет\t\n🫡\tsaluting face\tсалют, честь, есть\t\n🤐\tzipper-mouth face|zipper mouth face\tмолчу, рот на замке\t\n🤨\tface with one eyebrow raised|face with raised eyebrow\tбровь, сомнение, подозрительно\t\n😐\tneutral face\tнейтральный, без эмоций\t\n😑\texpressionless face|expressionless\tбез выражения, пофиг\t\n😶\tface without mouth|no mouth\tбез рта, молчание\t\n🫥\tdotted line face\tневидимка, исчезаю\t\n😶‍🌫️\tface in clouds\tв облаках, туман\t\n😏\tsmirking face|smirk\tухмылка, самодовольный\t\n😒\tunamused face|unamused\tнедоволен, скучно\t\n🙄\tface with rolling eyes\tзакатывает глаза\t\n😬\tgrimacing face|grimacing\tгримаса, неловко\t\n😮‍💨\tface exhaling\tвыдох, фух\t\n🤥\tlying face\tврун, пиноккио, ложь\t\n🫨\tshaking face\tтрясётся, шок\t\n😌\trelieved face|relieved\tоблегчение\t\n😔\tpensive face|pensive\tгрусть, задумчивый\t\n😪\tsleepy face|sleepy\tсонный\t\n🤤\tdrooling face\tслюни\t\n😴\tsleeping face|sleeping\tспит, сон\t\n😷\tface with medical mask|mask\tмаска, болеет\t\n🤒\tface with thermometer\tградусник, болеет, температура\t\n🤕\tface with head-bandage|face with head bandage\tбинт, травма\t\n🤢\tnauseated face\tтошнит\t\n🤮\tface with open mouth vomiting|face vomiting\tрвота, тошнит\t\n🤧\tsneezing face\tчихает, простуда\t\n🥵\toverheated face|hot face\tжарко\t\n🥶\tfreezing face|cold face\tхолодно, мёрзнет\t\n🥴\tface with uneven eyes and wavy mouth|woozy face\tпьяный, одурманенный\t\n😵\tdizzy face\tголовокружение\t\n😵‍💫\tface with spiral eyes\tспираль, голова кружится\t\n🤯\tshocked face with exploding head|exploding head\tвзрыв мозга, шок\t\n🤠\tface with cowboy hat\tковбой\t\n🥳\tface with party horn and party hat|partying face\tпраздник, вечеринка\t\n🥸\tdisguised face\tмаскировка, шпион\t\n😎\tsmiling face with sunglasses|sunglasses\tочки, крутой\t\n🤓\tnerd face\tботан, умник\t\n🧐\tface with monocle\tмонокль\t\n😕\tconfused face|confused\tрастерян, не понял\t\n🫤\tface with diagonal mouth\tскептичный, ну такое\t\n😟\tworried face|worried\tбеспокоится\t\n🙁\tslightly frowning face\tгрусть, хмурый\t\n☹️\tfrowning face|white frowning face\tгрусть, хмурый\t\n😮\tface with open mouth|open mouth\tоткрытый рот, удивление\t\n😯\thushed face|hushed\tудивление\t\n😲\tastonished face|astonished\tизумление, шок\t\n😳\tflushed face|flushed\tпокраснел, смущение\t\n🥺\tface with pleading eyes|pleading face\tумоляю, щенячьи глаза\t\n🥹\tface holding back tears\tсдерживает слёзы\t\n😦\tfrowning face with open mouth|frowning\tхмурый\t\n😧\tanguished face|anguished\tмучение\t\n😨\tfearful face|fearful\tстрах\t\n😰\tface with open mouth and cold sweat|cold sweat\tхолодный пот, тревога\t\n😥\tdisappointed but relieved face|disappointed relieved\tразочарование, облегчение\t\n😢\tcrying face|cry\tплачет, слеза\t\n😭\tloudly crying face|sob\tрыдает, плачет\t\n😱\tface screaming in fear|scream\tкрик, ужас\t\n😖\tconfounded face|confounded\tсмятение\t\n😣\tpersevering face|persevere\tупорство, терпит\t\n😞\tdisappointed face|disappointed\tразочарован\t\n😓\tface with cold sweat|sweat\tпот\t\n😩\tweary face|weary\tустал\t\n😫\ttired face\tусталость\t\n🥱\tyawning face\tзевает, скучно\t\n😤\tface with look of triumph|triumph\tфыркает, злится\t\n😡\tpouting face|rage\tярость, злой\t\n😠\tangry face|angry\tзлой, сердитый\t\n🤬\tserious face with symbols covering mouth|face with symbols on mouth\tругается, мат\t\n😈\tsmiling face with horns|smiling imp\tчёртик, дьявол\t\n👿\timp\tчёрт, демон\t\n💀\tskull\tчереп, умер, смерть\t\n☠️\tskull and crossbones\tчереп и кости, яд\t\n💩\tpile of poo|hankey|poop|shit\tкакашка\t\n🤡\tclown face\tклоун\t\n👹\tjapanese ogre\tогр, демон\t\n👺\tjapanese goblin\tгоблин, тэнгу\t\n👻\tghost\tпривидение, призрак\t\n👽\textraterrestrial alien|alien\tпришелец, инопланетянин\t\n👾\talien monster|space invader\tкосмический захватчик, игра\t\n🤖\trobot face\tробот\t\n😺\tsmiling cat face with open mouth|smiley cat\tкот, улыбка\t\n😸\tgrinning cat face with smiling eyes|smile cat\tкот, улыбка\t\n😹\tcat face with tears of joy|joy cat\tкот, смех\t\n😻\tsmiling cat face with heart-shaped eyes|heart eyes cat\tкот, влюблён\t\n😼\tcat face with wry smile|smirk cat\tкот, ухмылка\t\n😽\tkissing cat face with closed eyes|kissing cat\tкот, поцелуй\t\n🙀\tweary cat face|scream cat\tкот, ужас\t\n😿\tcrying cat face\tкот, плачет\t\n😾\tpouting cat face|pouting cat\tкот, злой\t\n🙈\tsee-no-evil monkey|see no evil\tобезьяна, не вижу\t\n🙉\thear-no-evil monkey|hear no evil\tобезьяна, не слышу\t\n🙊\tspeak-no-evil monkey|speak no evil\tобезьяна, молчу\t\n💌\tlove letter\tлюбовное письмо\t\n💘\theart with arrow|cupid\tсердце со стрелой, амур\t\n💝\theart with ribbon|gift heart\tсердце с бантом, подарок\t\n💖\tsparkling heart\tсверкающее сердце\t\n💗\tgrowing heart|heartpulse\tрастущее сердце\t\n💓\tbeating heart|heartbeat\tбьющееся сердце\t\n💞\trevolving hearts\tсердца\t\n💕\ttwo hearts\tдва сердца\t\n💟\theart decoration\tсердце в рамке, украшение\t\n❣️\theart exclamation|heavy heart exclamation mark ornament\tсердце восклицание\t\n💔\tbroken heart\tразбитое сердце\t\n❤️‍🔥\theart on fire\tсердце в огне\t\n❤️‍🩹\tmending heart\tперевязанное сердце\t\n❤️\theavy black heart|heart\tсердце, сердечко, любовь, красное сердце\t\n🩷\tpink heart\tрозовое сердце\t\n🧡\torange heart\tоранжевое сердце\t\n💛\tyellow heart\tжёлтое сердце\t\n💚\tgreen heart\tзелёное сердце\t\n💙\tblue heart\tсинее сердце\t\n🩵\tlight blue heart\tголубое сердце\t\n💜\tpurple heart\tфиолетовое сердце\t\n🤎\tbrown heart\tкоричневое сердце\t\n🖤\tblack heart\tчёрное сердце\t\n🩶\tgrey heart\tсерое сердце\t\n🤍\twhite heart\tбелое сердце\t\n💋\tkiss mark|kiss\tпоцелуй, губы\t\n💯\thundred points symbol|100\tсто, 100\t\n💢\tanger symbol|anger\tзлость\t\n💥\tcollision symbol|boom|collision\tбум, взрыв\t\n💫\tdizzy symbol|dizzy\tзвёздочки\t\n💦\tsplashing sweat symbol|sweat drops\tкапли\t\n💨\tdash symbol|dash\tбежит, пыль\t\n🕳️\thole\tдыра\t\n💬\tspeech balloon\tсообщение, облачко\t\n👁️‍🗨️\teye in speech bubble\t\t\n🗨️\tleft speech bubble\tоблачко\t\n🗯️\tright anger bubble\tоблачко, злость\t\n💭\tthought balloon\tмысль, облачко\t\n💤\tsleeping symbol|zzz\tсон, спать\t", "👋\twaving hand sign|wave\tпривет, машет, пока\tt\n🤚\traised back of hand\tрука\tt\n🖐️\thand with fingers splayed|raised hand with fingers splayed\tладонь, рука\tt\n✋\traised hand|hand\tрука, стоп, дай пять\tt\n🖖\traised hand with part between middle and ring fingers|spock hand\tспок, вулкан\tt\n🫱\trightwards hand\tрука вправо\tt\n🫲\tleftwards hand\tрука влево\tt\n🫳\tpalm down hand\tладонь вниз\tt\n🫴\tpalm up hand\tладонь вверх\tt\n🫷\tleftwards pushing hand\tтолкает, стоп\tt\n🫸\trightwards pushing hand\tтолкает, стоп\tt\n👌\tok hand sign|ok hand\tокей, ок\tt\n🤌\tpinched fingers\tщепотка, итальянский жест\tt\n🤏\tpinching hand\tчуть-чуть, немного\tt\n✌️\tvictory hand|v\tпобеда, мир\tt\n🤞\thand with index and middle fingers crossed|crossed fingers\tскрещённые пальцы, удача\tt\n🫰\thand with index finger and thumb crossed\tсердечко пальцами\tt\n🤟\ti love you hand sign\tлюблю тебя\tt\n🤘\tsign of the horns|the horns\tкоза, рок\tt\n🤙\tcall me hand\tпозвони, шака\tt\n👈\twhite left pointing backhand index|point left\tналево, палец\tt\n👉\twhite right pointing backhand index|point right\tнаправо, палец\tt\n👆\twhite up pointing backhand index|point up 2\tвверх, палец\tt\n🖕\treversed hand with middle finger extended|middle finger\tсредний палец, фак\tt\n👇\twhite down pointing backhand index|point down\tвниз, палец\tt\n☝️\twhite up pointing index|point up\tвверх, палец\tt\n🫵\tindex pointing at the viewer\tты, на тебя\tt\n👍\tthumbs up sign|+1|thumbsup\tлайк, класс, большой палец вверх\tt\n👎\tthumbs down sign| 1|thumbsdown\tдизлайк, палец вниз\tt\n✊\traised fist|fist\tкулак\tt\n👊\tfisted hand sign|facepunch|punch\tкулак, удар\tt\n🤛\tleft-facing fist|left facing fist\tкулак\tt\n🤜\tright-facing fist|right facing fist\tкулак\tt\n👏\tclapping hands sign|clap\tаплодисменты, хлопки, браво\tt\n🙌\tperson raising both hands in celebration|raised hands\tура, руки вверх\tt\n🫶\theart hands\tсердце руками\tt\n👐\topen hands sign|open hands\tраскрытые ладони\tt\n🤲\tpalms up together\tладони\tt\n🤝\thandshake\tрукопожатие\tt\n🙏\tperson with folded hands|pray\tмолитва, пожалуйста, спасибо\tt\n✍️\twriting hand\tпишет\tt\n💅\tnail polish|nail care\tманикюр, ногти\tt\n🤳\tselfie\tселфи\tt\n💪\tflexed biceps|muscle\tбицепс, сила, мышцы\tt\n🦾\tmechanical arm\tпротез, рука\t\n🦿\tmechanical leg\t\t\n🦵\tleg\tнога\tt\n🦶\tfoot\tстопа\tt\n👂\tear\tухо\tt\n🦻\tear with hearing aid\t\tt\n👃\tnose\tнос\tt\n🧠\tbrain\tмозг\t\n🫀\tanatomical heart\tанатомическое сердце, орган\t\n🫁\tlungs\tлёгкие\t\n🦷\ttooth\tзуб\t\n🦴\tbone\tкость\t\n👀\teyes\tглаза, смотрю\t\n👁️\teye\tглаз\t\n👅\ttongue\tязык\t\n👄\tmouth|lips\tгубы\t\n🫦\tbiting lip\tкусает губу\t\n👶\tbaby\tмладенец, малыш\tt\n🧒\tchild\tребёнок\tt\n👦\tboy\tмальчик\tt\n👧\tgirl\tдевочка\tt\n🧑\tadult\tвзрослый, человек\tt\n👱\tperson with blond hair\t\tt\n👨\tman\tмужчина\tt\n🧔\tbearded person\tборода\tt\n🧔‍♂️\tman: beard|man with beard\t\tt\n🧔‍♀️\twoman: beard|woman with beard\t\tt\n👨‍🦰\tman: red hair|red haired man\t\tt\n👨‍🦱\tman: curly hair|curly haired man\t\tt\n👨‍🦳\tman: white hair|white haired man\t\tt\n👨‍🦲\tman: bald|bald man\t\tt\n👩\twoman\tженщина\tt\n👩‍🦰\twoman: red hair|red haired woman\t\tt\n🧑‍🦰\tperson: red hair|red haired person\t\tt\n👩‍🦱\twoman: curly hair|curly haired woman\t\tt\n🧑‍🦱\tperson: curly hair|curly haired person\t\tt\n👩‍🦳\twoman: white hair|white haired woman\t\tt\n🧑‍🦳\tperson: white hair|white haired person\t\tt\n👩‍🦲\twoman: bald|bald woman\t\tt\n🧑‍🦲\tperson: bald|bald person\t\tt\n👱‍♀️\twoman: blond hair|blond haired woman\t\tt\n👱‍♂️\tman: blond hair|blond haired man\t\tt\n🧓\tolder adult\tпожилой\tt\n👴\tolder man\tдедушка, старик\tt\n👵\tolder woman\tбабушка, старушка\tt\n🙍\tperson frowning\t\tt\n🙍‍♂️\tman frowning\t\tt\n🙍‍♀️\twoman frowning\t\tt\n🙎\tperson with pouting face\t\tt\n🙎‍♂️\tman pouting\t\tt\n🙎‍♀️\twoman pouting\t\tt\n🙅\tface with no good gesture|no good\tнет, запрет\tt\n🙅‍♂️\tman gesturing no\t\tt\n🙅‍♀️\twoman gesturing no\t\tt\n🙆\tface with ok gesture|ok woman\tокей\tt\n🙆‍♂️\tman gesturing ok\t\tt\n🙆‍♀️\twoman gesturing ok\t\tt\n💁\tinformation desk person\tсправка\tt\n💁‍♂️\tman tipping hand\t\tt\n💁‍♀️\twoman tipping hand\t\tt\n🙋\thappy person raising one hand|raising hand\tподнятая рука\tt\n🙋‍♂️\tman raising hand\t\tt\n🙋‍♀️\twoman raising hand\t\tt\n🧏\tdeaf person\t\tt\n🧏‍♂️\tdeaf man\t\tt\n🧏‍♀️\tdeaf woman\t\tt\n🙇\tperson bowing deeply|bow\tпоклон\tt\n🙇‍♂️\tman bowing\t\tt\n🙇‍♀️\twoman bowing\t\tt\n🤦\tface palm\tфейспалм, рукалицо\tt\n🤦‍♂️\tman facepalming\tфейспалм, рукалицо\tt\n🤦‍♀️\twoman facepalming\tфейспалм, рукалицо\tt\n🤷\tshrug\tпожимает плечами, не знаю\tt\n🤷‍♂️\tman shrugging\tпожимает плечами, не знаю\tt\n🤷‍♀️\twoman shrugging\tпожимает плечами, не знаю\tt\n🧑‍⚕️\thealth worker\t\tt\n👨‍⚕️\tman health worker|male doctor\t\tt\n👩‍⚕️\twoman health worker|female doctor\t\tt\n🧑‍🎓\tstudent\t\tt\n👨‍🎓\tman student|male student\t\tt\n👩‍🎓\twoman student|female student\t\tt\n🧑‍🏫\tteacher\t\tt\n👨‍🏫\tman teacher|male teacher\t\tt\n👩‍🏫\twoman teacher|female teacher\t\tt\n🧑‍⚖️\tjudge\t\tt\n👨‍⚖️\tman judge|male judge\t\tt\n👩‍⚖️\twoman judge|female judge\t\tt\n🧑‍🌾\tfarmer\t\tt\n👨‍🌾\tman farmer|male farmer\t\tt\n👩‍🌾\twoman farmer|female farmer\t\tt\n🧑‍🍳\tcook\t\tt\n👨‍🍳\tman cook|male cook\t\tt\n👩‍🍳\twoman cook|female cook\t\tt\n🧑‍🔧\tmechanic\t\tt\n👨‍🔧\tman mechanic|male mechanic\t\tt\n👩‍🔧\twoman mechanic|female mechanic\t\tt\n🧑‍🏭\tfactory worker\t\tt\n👨‍🏭\tman factory worker|male factory worker\t\tt\n👩‍🏭\twoman factory worker|female factory worker\t\tt\n🧑‍💼\toffice worker\t\tt\n👨‍💼\tman office worker|male office worker\t\tt\n👩‍💼\twoman office worker|female office worker\t\tt\n🧑‍🔬\tscientist\t\tt\n👨‍🔬\tman scientist|male scientist\t\tt\n👩‍🔬\twoman scientist|female scientist\t\tt\n🧑‍💻\ttechnologist\tпрограммист, компьютер\tt\n👨‍💻\tman technologist|male technologist\tпрограммист, компьютер\tt\n👩‍💻\twoman technologist|female technologist\tпрограммист, компьютер\tt\n🧑‍🎤\tsinger\t\tt\n👨‍🎤\tman singer|male singer\t\tt\n👩‍🎤\twoman singer|female singer\t\tt\n🧑‍🎨\tartist\t\tt\n👨‍🎨\tman artist|male artist\t\tt\n👩‍🎨\twoman artist|female artist\t\tt\n🧑‍✈️\tpilot\t\tt\n👨‍✈️\tman pilot|male pilot\t\tt\n👩‍✈️\twoman pilot|female pilot\t\tt\n🧑‍🚀\tastronaut\t\tt\n👨‍🚀\tman astronaut|male astronaut\t\tt\n👩‍🚀\twoman astronaut|female astronaut\t\tt\n🧑‍🚒\tfirefighter\t\tt\n👨‍🚒\tman firefighter|male firefighter\t\tt\n👩‍🚒\twoman firefighter|female firefighter\t\tt\n👮\tpolice officer|cop\tполиция, полицейский\tt\n👮‍♂️\tman police officer|male police officer\t\tt\n👮‍♀️\twoman police officer|female police officer\t\tt\n🕵️\tdetective|sleuth or spy\tдетектив, шпион\tt\n🕵️‍♂️\tman detective|male detective\t\tt\n🕵️‍♀️\twoman detective|female detective\t\tt\n💂\tguardsman\t\tt\n💂‍♂️\tman guard|male guard\t\tt\n💂‍♀️\twoman guard|female guard\t\tt\n🥷\tninja\tниндзя\tt\n👷\tconstruction worker\t\tt\n👷‍♂️\tman construction worker|male construction worker\t\tt\n👷‍♀️\twoman construction worker|female construction worker\t\tt\n🫅\tperson with crown\t\tt\n🤴\tprince\tпринц\tt\n👸\tprincess\tпринцесса\tt\n👳\tman with turban\t\tt\n👳‍♂️\tman wearing turban\t\tt\n👳‍♀️\twoman wearing turban\t\tt\n👲\tman with gua pi mao\t\tt\n🧕\tperson with headscarf\t\tt\n🤵\tman in tuxedo|person in tuxedo\t\tt\n🤵‍♂️\tman in tuxedo\t\tt\n🤵‍♀️\twoman in tuxedo\t\tt\n👰\tbride with veil\t\tt\n👰‍♂️\tman with veil\t\tt\n👰‍♀️\twoman with veil\t\tt\n🤰\tpregnant woman\t\tt\n🫃\tpregnant man\t\tt\n🫄\tpregnant person\t\tt\n🤱\tbreast-feeding|breast feeding\t\tt\n👩‍🍼\twoman feeding baby\t\tt\n👨‍🍼\tman feeding baby\t\tt\n🧑‍🍼\tperson feeding baby\t\tt\n👼\tbaby angel|angel\tангел\tt\n🎅\tfather christmas|santa\tдед мороз, санта\tt\n🤶\tmother christmas|mrs claus\tснегурочка, миссис клаус\tt\n🧑‍🎄\tmx claus\t\tt\n🦸\tsuperhero\tсупергерой\tt\n🦸‍♂️\tman superhero|male superhero\t\tt\n🦸‍♀️\twoman superhero|female superhero\t\tt\n🦹\tsupervillain\tзлодей\tt\n🦹‍♂️\tman supervillain|male supervillain\t\tt\n🦹‍♀️\twoman supervillain|female supervillain\t\tt\n🧙\tmage\tмаг, волшебник\tt\n🧙‍♂️\tman mage|male mage\t\tt\n🧙‍♀️\twoman mage|female mage\t\tt\n🧚\tfairy\tфея\tt\n🧚‍♂️\tman fairy|male fairy\t\tt\n🧚‍♀️\twoman fairy|female fairy\t\tt\n🧛\tvampire\tвампир\tt\n🧛‍♂️\tman vampire|male vampire\t\tt\n🧛‍♀️\twoman vampire|female vampire\t\tt\n🧜\tmerperson\tрусалка\tt\n🧜‍♂️\tmerman\t\tt\n🧜‍♀️\tmermaid\tрусалка\tt\n🧝\telf\tэльф\tt\n🧝‍♂️\tman elf|male elf\t\tt\n🧝‍♀️\twoman elf|female elf\t\tt\n🧞\tgenie\tджинн\t\n🧞‍♂️\tman genie|male genie\t\t\n🧞‍♀️\twoman genie|female genie\t\t\n🧟\tzombie\tзомби\t\n🧟‍♂️\tman zombie|male zombie\t\t\n🧟‍♀️\twoman zombie|female zombie\t\t\n🧌\ttroll\tтролль\t\n💆\tface massage|massage\t\tt\n💆‍♂️\tman getting massage\t\tt\n💆‍♀️\twoman getting massage\t\tt\n💇\thaircut\t\tt\n💇‍♂️\tman getting haircut\t\tt\n💇‍♀️\twoman getting haircut\t\tt\n🚶\tpedestrian|walking\tидёт, пешеход\tt\n🚶‍♂️\tman walking\t\tt\n🚶‍♀️\twoman walking\t\tt\n🧍\tstanding person\t\tt\n🧍‍♂️\tman standing\t\tt\n🧍‍♀️\twoman standing\t\tt\n🧎\tkneeling person\t\tt\n🧎‍♂️\tman kneeling\t\tt\n🧎‍♀️\twoman kneeling\t\tt\n🧑‍🦯\tperson with white cane|person with probing cane\t\tt\n👨‍🦯\tman with white cane|man with probing cane\t\tt\n👩‍🦯\twoman with white cane|woman with probing cane\t\tt\n🧑‍🦼\tperson in motorized wheelchair\t\tt\n👨‍🦼\tman in motorized wheelchair\t\tt\n👩‍🦼\twoman in motorized wheelchair\t\tt\n🧑‍🦽\tperson in manual wheelchair\t\tt\n👨‍🦽\tman in manual wheelchair\t\tt\n👩‍🦽\twoman in manual wheelchair\t\tt\n🏃\trunner|running\tбежит, бег\tt\n🏃‍♂️\tman running\t\tt\n🏃‍♀️\twoman running\t\tt\n💃\tdancer\tтанец, танцует\tt\n🕺\tman dancing\tтанец, танцует\tt\n🕴️\tperson in suit levitating|man in business suit levitating\t\tt\n👯\twoman with bunny ears|dancers\t\tt\n👯‍♂️\tmen with bunny ears|men with bunny ears partying|man with bunny ears partying\t\tt\n👯‍♀️\twomen with bunny ears|women with bunny ears partying|woman with bunny ears partying\t\tt\n🧖\tperson in steamy room\t\tt\n🧖‍♂️\tman in steamy room\t\tt\n🧖‍♀️\twoman in steamy room\t\tt\n🧗\tperson climbing\t\tt\n🧗‍♂️\tman climbing\t\tt\n🧗‍♀️\twoman climbing\t\tt\n🤺\tfencer\t\t\n🏇\thorse racing\t\tt\n⛷️\tskier\t\t\n🏂\tsnowboarder\t\tt\n🏌️\tperson golfing|golfer\t\tt\n🏌️‍♂️\tman golfing\t\tt\n🏌️‍♀️\twoman golfing\t\tt\n🏄\tsurfer\t\tt\n🏄‍♂️\tman surfing\t\tt\n🏄‍♀️\twoman surfing\t\tt\n🚣\trowboat\t\tt\n🚣‍♂️\tman rowing boat\t\tt\n🚣‍♀️\twoman rowing boat\t\tt\n🏊\tswimmer\t\tt\n🏊‍♂️\tman swimming\t\tt\n🏊‍♀️\twoman swimming\t\tt\n⛹️\tperson bouncing ball|person with ball\t\tt\n⛹️‍♂️\tman bouncing ball\t\tt\n⛹️‍♀️\twoman bouncing ball\t\tt\n🏋️\tperson lifting weights|weight lifter\t\tt\n🏋️‍♂️\tman lifting weights\t\tt\n🏋️‍♀️\twoman lifting weights\t\tt\n🚴\tbicyclist\t\tt\n🚴‍♂️\tman biking\t\tt\n🚴‍♀️\twoman biking\t\tt\n🚵\tmountain bicyclist\t\tt\n🚵‍♂️\tman mountain biking\t\tt\n🚵‍♀️\twoman mountain biking\t\tt\n🤸\tperson doing cartwheel\t\tt\n🤸‍♂️\tman cartwheeling\t\tt\n🤸‍♀️\twoman cartwheeling\t\tt\n🤼\twrestlers\t\tt\n🤼‍♂️\tmen wrestling|man wrestling\t\tt\n🤼‍♀️\twomen wrestling|woman wrestling\t\tt\n🤽\twater polo\t\tt\n🤽‍♂️\tman playing water polo\t\tt\n🤽‍♀️\twoman playing water polo\t\tt\n🤾\thandball\t\tt\n🤾‍♂️\tman playing handball\t\tt\n🤾‍♀️\twoman playing handball\t\tt\n🤹\tjuggling\t\tt\n🤹‍♂️\tman juggling\t\tt\n🤹‍♀️\twoman juggling\t\tt\n🧘\tperson in lotus position\t\tt\n🧘‍♂️\tman in lotus position\t\tt\n🧘‍♀️\twoman in lotus position\t\tt\n🛀\tbath\t\tt\n🛌\tsleeping accommodation\t\tt\n🧑‍🤝‍🧑\tpeople holding hands\t\t\n👭\ttwo women holding hands|women holding hands\t\tt\n👫\tman and woman holding hands|woman and man holding hands|couple\t\tt\n👬\ttwo men holding hands|men holding hands\t\tt\n💏\tkiss|couplekiss\tпоцелуй, пара\tt\n👩‍❤️‍💋‍👨\tkiss: woman, man|woman kiss man\t\t\n👨‍❤️‍💋‍👨\tkiss: man, man|man kiss man\t\t\n👩‍❤️‍💋‍👩\tkiss: woman, woman|woman kiss woman\t\t\n💑\tcouple with heart\tпара, любовь\tt\n👩‍❤️‍👨\tcouple with heart: woman, man|woman heart man\t\t\n👨‍❤️‍👨\tcouple with heart: man, man|man heart man\t\t\n👩‍❤️‍👩\tcouple with heart: woman, woman|woman heart woman\t\t\n👨‍👩‍👦\tfamily: man, woman, boy|man woman boy\t\t\n👨‍👩‍👧\tfamily: man, woman, girl|man woman girl\t\t\n👨‍👩‍👧‍👦\tfamily: man, woman, girl, boy|man woman girl boy\t\t\n👨‍👩‍👦‍👦\tfamily: man, woman, boy, boy|man woman boy boy\t\t\n👨‍👩‍👧‍👧\tfamily: man, woman, girl, girl|man woman girl girl\t\t\n👨‍👨‍👦\tfamily: man, man, boy|man man boy\t\t\n👨‍👨‍👧\tfamily: man, man, girl|man man girl\t\t\n👨‍👨‍👧‍👦\tfamily: man, man, girl, boy|man man girl boy\t\t\n👨‍👨‍👦‍👦\tfamily: man, man, boy, boy|man man boy boy\t\t\n👨‍👨‍👧‍👧\tfamily: man, man, girl, girl|man man girl girl\t\t\n👩‍👩‍👦\tfamily: woman, woman, boy|woman woman boy\t\t\n👩‍👩‍👧\tfamily: woman, woman, girl|woman woman girl\t\t\n👩‍👩‍👧‍👦\tfamily: woman, woman, girl, boy|woman woman girl boy\t\t\n👩‍👩‍👦‍👦\tfamily: woman, woman, boy, boy|woman woman boy boy\t\t\n👩‍👩‍👧‍👧\tfamily: woman, woman, girl, girl|woman woman girl girl\t\t\n👨‍👦\tfamily: man, boy|man boy\t\t\n👨‍👦‍👦\tfamily: man, boy, boy|man boy boy\t\t\n👨‍👧\tfamily: man, girl|man girl\t\t\n👨‍👧‍👦\tfamily: man, girl, boy|man girl boy\t\t\n👨‍👧‍👧\tfamily: man, girl, girl|man girl girl\t\t\n👩‍👦\tfamily: woman, boy|woman boy\t\t\n👩‍👦‍👦\tfamily: woman, boy, boy|woman boy boy\t\t\n👩‍👧\tfamily: woman, girl|woman girl\t\t\n👩‍👧‍👦\tfamily: woman, girl, boy|woman girl boy\t\t\n👩‍👧‍👧\tfamily: woman, girl, girl|woman girl girl\t\t\n🗣️\tspeaking head|speaking head in silhouette\tговорит\t\n👤\tbust in silhouette\tсилуэт, человек\t\n👥\tbusts in silhouette\tлюди\t\n🫂\tpeople hugging\tобъятия\t\n👪\tfamily\tсемья\t\n👣\tfootprints\tследы\t", "🐵\tmonkey face\tобезьяна\t\n🐒\tmonkey\tобезьяна\t\n🦍\tgorilla\tгорилла\t\n🦧\torangutan\t\t\n🐶\tdog face|dog\tсобака, пёс\t\n🐕\tdog|dog2\tсобака, пёс\t\n🦮\tguide dog\t\t\n🐕‍🦺\tservice dog\t\t\n🐩\tpoodle\tпудель\t\n🐺\twolf face|wolf\tволк\t\n🦊\tfox face\tлиса\t\n🦝\traccoon\tенот\t\n🐱\tcat face|cat\tкот, кошка\t\n🐈\tcat|cat2\tкот, кошка\t\n🐈‍⬛\tblack cat\tчёрный кот\t\n🦁\tlion face\tлев\t\n🐯\ttiger face|tiger\tтигр\t\n🐅\ttiger|tiger2\tтигр\t\n🐆\tleopard\tлеопард\t\n🐴\thorse face|horse\tлошадь, конь\t\n🫎\tmoose\tлось\t\n🫏\tdonkey\tосёл\t\n🐎\thorse|racehorse\tлошадь, конь\t\n🦄\tunicorn face\tединорог\t\n🦓\tzebra face\tзебра\t\n🦌\tdeer\tолень\t\n🦬\tbison\t\t\n🐮\tcow face|cow\tкорова\t\n🐂\tox\tбык\t\n🐃\twater buffalo\t\t\n🐄\tcow|cow2\tкорова\t\n🐷\tpig face|pig\tсвинья\t\n🐖\tpig|pig2\tсвинья\t\n🐗\tboar\tкабан\t\n🐽\tpig nose\t\t\n🐏\tram\t\t\n🐑\tsheep\tовца\t\n🐐\tgoat\tкоза\t\n🐪\tdromedary camel\t\t\n🐫\tbactrian camel|camel\tверблюд\t\n🦙\tllama\tлама\t\n🦒\tgiraffe face\tжираф\t\n🐘\telephant\tслон\t\n🦣\tmammoth\t\t\n🦏\trhinoceros\t\t\n🦛\thippopotamus\t\t\n🐭\tmouse face|mouse\tмышь\t\n🐁\tmouse|mouse2\tмышь\t\n🐀\trat\tкрыса\t\n🐹\thamster face|hamster\tхомяк\t\n🐰\trabbit face|rabbit\tкролик, заяц\t\n🐇\trabbit|rabbit2\tкролик, заяц\t\n🐿️\tchipmunk\tбурундук\t\n🦫\tbeaver\t\t\n🦔\thedgehog\tёж\t\n🦇\tbat\tлетучая мышь\t\n🐻\tbear face|bear\tмедведь\t\n🐻‍❄️\tpolar bear\tбелый медведь\t\n🐨\tkoala\tкоала\t\n🐼\tpanda face\tпанда\t\n🦥\tsloth\tленивец\t\n🦦\totter\tвыдра\t\n🦨\tskunk\tскунс\t\n🦘\tkangaroo\tкенгуру\t\n🦡\tbadger\t\t\n🐾\tpaw prints|feet\tлапы, следы\t\n🦃\tturkey\tиндейка\t\n🐔\tchicken\tкурица\t\n🐓\trooster\tпетух\t\n🐣\thatching chick\tцыплёнок\t\n🐤\tbaby chick\tцыплёнок\t\n🐥\tfront-facing baby chick|hatched chick\tцыплёнок\t\n🐦\tbird\tптица\t\n🐧\tpenguin\tпингвин\t\n🕊️\tdove|dove of peace\tголубь\t\n🦅\teagle\tорёл\t\n🦆\tduck\tутка\t\n🦢\tswan\tлебедь\t\n🦉\towl\tсова\t\n🦤\tdodo\t\t\n🪶\tfeather\t\t\n🦩\tflamingo\tфламинго\t\n🦚\tpeacock\tпавлин\t\n🦜\tparrot\tпопугай\t\n🪽\twing\t\t\n🐦‍⬛\tblack bird\t\t\n🪿\tgoose\tгусь\t\n🐸\tfrog face|frog\tлягушка, жаба\t\n🐊\tcrocodile\tкрокодил\t\n🐢\tturtle\tчерепаха\t\n🦎\tlizard\tящерица\t\n🐍\tsnake\tзмея\t\n🐲\tdragon face\tдракон\t\n🐉\tdragon\tдракон\t\n🦕\tsauropod\tдинозавр\t\n🦖\tt-rex|t rex\tдинозавр, тирекс\t\n🐳\tspouting whale|whale\tкит\t\n🐋\twhale|whale2\tкит\t\n🐬\tdolphin|flipper\tдельфин\t\n🦭\tseal\tтюлень\t\n🐟\tfish\tрыба\t\n🐠\ttropical fish\tрыбка\t\n🐡\tblowfish\tрыба фугу\t\n🦈\tshark\tакула\t\n🐙\toctopus\tосьминог\t\n🐚\tspiral shell|shell\tракушка\t\n🪸\tcoral\t\t\n🪼\tjellyfish\tмедуза\t\n🦀\tcrab\tкраб\t\n🦞\tlobster\tлобстер, омар\t\n🦐\tshrimp\tкреветка\t\n🦑\tsquid\tкальмар\t\n🦪\toyster\t\t\n🐌\tsnail\tулитка\t\n🦋\tbutterfly\tбабочка\t\n🐛\tbug\tгусеница, жук\t\n🐜\tant\tмуравей\t\n🐝\thoneybee|bee\tпчела\t\n🪲\tbeetle\tжук\t\n🐞\tlady beetle|ladybug\tбожья коровка\t\n🦗\tcricket\t\t\n🪳\tcockroach\tтаракан\t\n🕷️\tspider\tпаук\t\n🕸️\tspider web\tпаутина\t\n🦂\tscorpion\tскорпион\t\n🦟\tmosquito\tкомар\t\n🪰\tfly\tмуха\t\n🪱\tworm\tчервь\t\n🦠\tmicrobe\tмикроб, вирус\t\n💐\tbouquet\tбукет, цветы\t\n🌸\tcherry blossom\tсакура, цветок\t\n💮\twhite flower\t\t\n🪷\tlotus\t\t\n🏵️\trosette\t\t\n🌹\trose\tроза\t\n🥀\twilted flower\tувядший цветок\t\n🌺\thibiscus\t\t\n🌻\tsunflower\tподсолнух\t\n🌼\tblossom\tцветок\t\n🌷\ttulip\tтюльпан\t\n🪻\thyacinth\t\t\n🌱\tseedling\tросток\t\n🪴\tpotted plant\t\t\n🌲\tevergreen tree\tёлка, дерево\t\n🌳\tdeciduous tree\tдерево\t\n🌴\tpalm tree\tпальма\t\n🌵\tcactus\tкактус\t\n🌾\tear of rice\t\t\n🌿\therb\tтрава\t\n☘️\tshamrock\t\t\n🍀\tfour leaf clover\tклевер, удача\t\n🍁\tmaple leaf\tкленовый лист\t\n🍂\tfallen leaf\tлистья, осень\t\n🍃\tleaf fluttering in wind|leaves\tлистья\t\n🪹\tempty nest\t\t\n🪺\tnest with eggs\t\t\n🍄\tmushroom\tгриб\t", "🍇\tgrapes\tвиноград\t\n🍈\tmelon\tдыня\t\n🍉\twatermelon\tарбуз\t\n🍊\ttangerine\tмандарин\t\n🍋\tlemon\tлимон\t\n🍌\tbanana\tбанан\t\n🍍\tpineapple\tананас\t\n🥭\tmango\tманго\t\n🍎\tred apple|apple\tяблоко\t\n🍏\tgreen apple\tзелёное яблоко\t\n🍐\tpear\tгруша\t\n🍑\tpeach\tперсик\t\n🍒\tcherries\tвишня, черешня\t\n🍓\tstrawberry\tклубника\t\n🫐\tblueberries\tчерника\t\n🥝\tkiwifruit\tкиви\t\n🍅\ttomato\tпомидор\t\n🫒\tolive\t\t\n🥥\tcoconut\tкокос\t\n🥑\tavocado\tавокадо\t\n🍆\taubergine|eggplant\tбаклажан\t\n🥔\tpotato\tкартошка\t\n🥕\tcarrot\tморковь\t\n🌽\tear of maize|corn\tкукуруза\t\n🌶️\thot pepper\tперец, острый\t\n🫑\tbell pepper\t\t\n🥒\tcucumber\tогурец\t\n🥬\tleafy green\t\t\n🥦\tbroccoli\tброкколи\t\n🧄\tgarlic\tчеснок\t\n🧅\tonion\tлук\t\n🥜\tpeanuts\tарахис, орехи\t\n🫘\tbeans\t\t\n🌰\tchestnut\t\t\n🫚\tginger root\t\t\n🫛\tpea pod\t\t\n🍞\tbread\tхлеб\t\n🥐\tcroissant\tкруассан\t\n🥖\tbaguette bread\tбагет\t\n🫓\tflatbread\t\t\n🥨\tpretzel\tкрендель\t\n🥯\tbagel\t\t\n🥞\tpancakes\tблины, оладьи\t\n🧇\twaffle\tвафля\t\n🧀\tcheese wedge\tсыр\t\n🍖\tmeat on bone\tмясо\t\n🍗\tpoultry leg\tкурица, ножка\t\n🥩\tcut of meat\tстейк, мясо\t\n🥓\tbacon\tбекон\t\n🍔\thamburger\tбургер, гамбургер\t\n🍟\tfrench fries|fries\tкартошка фри\t\n🍕\tslice of pizza|pizza\tпицца\t\n🌭\thot dog|hotdog\tхот-дог\t\n🥪\tsandwich\tбутерброд, сэндвич\t\n🌮\ttaco\tтако\t\n🌯\tburrito\tбуррито, шаурма\t\n🫔\ttamale\t\t\n🥙\tstuffed flatbread\t\t\n🧆\tfalafel\t\t\n🥚\tegg\tяйцо\t\n🍳\tcooking|fried egg\tяичница\t\n🥘\tshallow pan of food\t\t\n🍲\tpot of food|stew\tсуп, рагу\t\n🫕\tfondue\t\t\n🥣\tbowl with spoon\t\t\n🥗\tgreen salad\tсалат\t\n🍿\tpopcorn\tпопкорн\t\n🧈\tbutter\t\t\n🧂\tsalt shaker|salt\tсоль\t\n🥫\tcanned food\t\t\n🍱\tbento box|bento\tбенто\t\n🍘\trice cracker\t\t\n🍙\trice ball\t\t\n🍚\tcooked rice|rice\tрис\t\n🍛\tcurry and rice|curry\tкарри\t\n🍜\tsteaming bowl|ramen\tрамен, лапша\t\n🍝\tspaghetti\tспагетти, макароны\t\n🍠\troasted sweet potato|sweet potato\t\t\n🍢\toden\t\t\n🍣\tsushi\tсуши\t\n🍤\tfried shrimp\t\t\n🍥\tfish cake with swirl design|fish cake\t\t\n🥮\tmoon cake\t\t\n🍡\tdango\t\t\n🥟\tdumpling\tпельмени\t\n🥠\tfortune cookie\t\t\n🥡\ttakeout box\t\t\n🍦\tsoft ice cream|icecream\tмороженое\t\n🍧\tshaved ice\t\t\n🍨\tice cream\tмороженое\t\n🍩\tdoughnut\tпончик\t\n🍪\tcookie\tпеченье\t\n🎂\tbirthday cake|birthday\tторт, день рождения\t\n🍰\tshortcake|cake\tторт, пирожное\t\n🧁\tcupcake\tкекс\t\n🥧\tpie\tпирог\t\n🍫\tchocolate bar\tшоколад\t\n🍬\tcandy\tконфета\t\n🍭\tlollipop\tледенец\t\n🍮\tcustard\t\t\n🍯\thoney pot\tмёд\t\n🍼\tbaby bottle\tбутылочка\t\n🥛\tglass of milk\tмолоко\t\n☕\thot beverage|coffee\tкофе\t\n🫖\tteapot\tчайник\t\n🍵\tteacup without handle|tea\tчай\t\n🍶\tsake bottle and cup|sake\t\t\n🍾\tbottle with popping cork|champagne\tшампанское\t\n🍷\twine glass\tвино\t\n🍸\tcocktail glass|cocktail\tкоктейль\t\n🍹\ttropical drink\tкоктейль\t\n🍺\tbeer mug|beer\tпиво\t\n🍻\tclinking beer mugs|beers\tпиво, чокаться\t\n🥂\tclinking glasses\tбокалы, тост\t\n🥃\ttumbler glass\tвиски\t\n🫗\tpouring liquid\t\t\n🥤\tcup with straw\tнапиток, газировка\t\n🧋\tbubble tea\tбабл ти\t\n🧃\tbeverage box\t\t\n🧉\tmate drink\t\t\n🧊\tice cube\tлёд\t\n🥢\tchopsticks\t\t\n🍽️\tfork and knife with plate|knife fork plate\t\t\n🍴\tfork and knife\tвилка и нож, еда\t\n🥄\tspoon\t\t\n🔪\thocho|knife\tнож\t\n🫙\tjar\t\t\n🏺\tamphora\t\t", "🌍\tearth globe europe-africa|earth africa\tземля, планета, мир\t\n🌎\tearth globe americas|earth americas\tземля, планета, мир\t\n🌏\tearth globe asia-australia|earth asia\tземля, планета, мир\t\n🌐\tglobe with meridians\tглобус, интернет\t\n🗺️\tworld map\tкарта мира\t\n🗾\tsilhouette of japan|japan\t\t\n🧭\tcompass\t\t\n🏔️\tsnow-capped mountain|snow capped mountain\t\t\n⛰️\tmountain\tгора\t\n🌋\tvolcano\tвулкан\t\n🗻\tmount fuji\t\t\n🏕️\tcamping\tкемпинг\t\n🏖️\tbeach with umbrella\tпляж\t\n🏜️\tdesert\tпустыня\t\n🏝️\tdesert island\tостров\t\n🏞️\tnational park\t\t\n🏟️\tstadium\t\t\n🏛️\tclassical building\t\t\n🏗️\tbuilding construction\t\t\n🧱\tbrick|bricks\t\t\n🪨\trock\t\t\n🪵\twood\t\t\n🛖\thut\t\t\n🏘️\thouses|house buildings\t\t\n🏚️\tderelict house|derelict house building\t\t\n🏠\thouse building|house\tдом\t\n🏡\thouse with garden\tдом, сад\t\n🏢\toffice building|office\tофис\t\n🏣\tjapanese post office|post office\t\t\n🏤\teuropean post office\t\t\n🏥\thospital\tбольница\t\n🏦\tbank\tбанк\t\n🏨\thotel\t\t\n🏩\tlove hotel\t\t\n🏪\tconvenience store\t\t\n🏫\tschool\tшкола\t\n🏬\tdepartment store\t\t\n🏭\tfactory\tзавод\t\n🏯\tjapanese castle\t\t\n🏰\teuropean castle\t\t\n💒\twedding\t\t\n🗼\ttokyo tower\t\t\n🗽\tstatue of liberty\t\t\n⛪\tchurch\tцерковь\t\n🕌\tmosque\t\t\n🛕\thindu temple\t\t\n🕍\tsynagogue\t\t\n⛩️\tshinto shrine\t\t\n🕋\tkaaba\t\t\n⛲\tfountain\t\t\n⛺\ttent\tпалатка\t\n🌁\tfoggy\t\t\n🌃\tnight with stars\t\t\n🏙️\tcityscape\tгород\t\n🌄\tsunrise over mountains\t\t\n🌅\tsunrise\tрассвет\t\n🌆\tcityscape at dusk|city sunset\t\t\n🌇\tsunset over buildings|city sunrise\t\t\n🌉\tbridge at night\t\t\n♨️\thot springs|hotsprings\t\t\n🎠\tcarousel horse\tкарусель\t\n🛝\tplayground slide\t\t\n🎡\tferris wheel\t\t\n🎢\troller coaster\tамериканские горки\t\n💈\tbarber pole|barber\t\t\n🎪\tcircus tent\t\t\n🚂\tsteam locomotive\tпаровоз, поезд\t\n🚃\trailway car\t\t\n🚄\thigh-speed train|bullettrain side\t\t\n🚅\thigh-speed train with bullet nose|bullettrain front\t\t\n🚆\ttrain|train2\tпоезд\t\n🚇\tmetro\tметро\t\n🚈\tlight rail\t\t\n🚉\tstation\t\t\n🚊\ttram\t\t\n🚝\tmonorail\t\t\n🚞\tmountain railway\t\t\n🚋\ttram car|train\t\t\n🚌\tbus\tавтобус\t\n🚍\toncoming bus\t\t\n🚎\ttrolleybus\t\t\n🚐\tminibus\t\t\n🚑\tambulance\tскорая\t\n🚒\tfire engine\tпожарная машина\t\n🚓\tpolice car\tполиция, машина\t\n🚔\toncoming police car\t\t\n🚕\ttaxi\tтакси\t\n🚖\toncoming taxi\t\t\n🚗\tautomobile|car|red car\tмашина, авто\t\n🚘\toncoming automobile\t\t\n🚙\trecreational vehicle|blue car\tмашина\t\n🛻\tpickup truck\t\t\n🚚\tdelivery truck|truck\tгрузовик\t\n🚛\tarticulated lorry\t\t\n🚜\ttractor\tтрактор\t\n🏎️\tracing car\tгоночная машина\t\n🏍️\tmotorcycle|racing motorcycle\tмотоцикл\t\n🛵\tmotor scooter\t\t\n🦽\tmanual wheelchair\t\t\n🦼\tmotorized wheelchair\t\t\n🛺\tauto rickshaw\t\t\n🚲\tbicycle|bike\tвелосипед\t\n🛴\tscooter\tсамокат\t\n🛹\tskateboard\tскейт\t\n🛼\troller skate\t\t\n🚏\tbus stop|busstop\t\t\n🛣️\tmotorway\t\t\n🛤️\trailway track\t\t\n🛢️\toil drum\t\t\n⛽\tfuel pump|fuelpump\t\t\n🛞\twheel\t\t\n🚨\tpolice cars revolving light|rotating light\tмигалка\t\n🚥\thorizontal traffic light|traffic light\t\t\n🚦\tvertical traffic light\t\t\n🛑\toctagonal sign\t\t\n🚧\tconstruction sign|construction\tстройка\t\n⚓\tanchor\tякорь\t\n🛟\tring buoy\t\t\n⛵\tsailboat|boat\tлодка, парусник\t\n🛶\tcanoe\t\t\n🚤\tspeedboat\t\t\n🛳️\tpassenger ship\t\t\n⛴️\tferry\t\t\n🛥️\tmotor boat\t\t\n🚢\tship\tкорабль\t\n✈️\tairplane\tсамолёт\t\n🛩️\tsmall airplane\t\t\n🛫\tairplane departure\t\t\n🛬\tairplane arriving\t\t\n🪂\tparachute\t\t\n💺\tseat\t\t\n🚁\thelicopter\tвертолёт\t\n🚟\tsuspension railway\t\t\n🚠\tmountain cableway\t\t\n🚡\taerial tramway\t\t\n🛰️\tsatellite\t\t\n🚀\trocket\tракета\t\n🛸\tflying saucer\tнло, тарелка\t\n🛎️\tbellhop bell\t\t\n🧳\tluggage\t\t\n⌛\thourglass\tпесочные часы\t\n⏳\thourglass with flowing sand|hourglass flowing sand\t\t\n⌚\twatch\tчасы\t\n⏰\talarm clock\tбудильник\t\n⏱️\tstopwatch\tсекундомер\t\n⏲️\ttimer clock\t\t\n🕰️\tmantelpiece clock\t\t\n🕛\tclock face twelve oclock|clock12\t\t\n🕧\tclock face twelve-thirty|clock1230\t\t\n🕐\tclock face one oclock|clock1\t\t\n🕜\tclock face one-thirty|clock130\t\t\n🕑\tclock face two oclock|clock2\t\t\n🕝\tclock face two-thirty|clock230\t\t\n🕒\tclock face three oclock|clock3\t\t\n🕞\tclock face three-thirty|clock330\t\t\n🕓\tclock face four oclock|clock4\t\t\n🕟\tclock face four-thirty|clock430\t\t\n🕔\tclock face five oclock|clock5\t\t\n🕠\tclock face five-thirty|clock530\t\t\n🕕\tclock face six oclock|clock6\t\t\n🕡\tclock face six-thirty|clock630\t\t\n🕖\tclock face seven oclock|clock7\t\t\n🕢\tclock face seven-thirty|clock730\t\t\n🕗\tclock face eight oclock|clock8\t\t\n🕣\tclock face eight-thirty|clock830\t\t\n🕘\tclock face nine oclock|clock9\t\t\n🕤\tclock face nine-thirty|clock930\t\t\n🕙\tclock face ten oclock|clock10\t\t\n🕥\tclock face ten-thirty|clock1030\t\t\n🕚\tclock face eleven oclock|clock11\t\t\n🕦\tclock face eleven-thirty|clock1130\t\t\n🌑\tnew moon symbol|new moon\t\t\n🌒\twaxing crescent moon symbol|waxing crescent moon\t\t\n🌓\tfirst quarter moon symbol|first quarter moon\t\t\n🌔\twaxing gibbous moon symbol|moon|waxing gibbous moon\tлуна\t\n🌕\tfull moon symbol|full moon\tполнолуние, луна\t\n🌖\twaning gibbous moon symbol|waning gibbous moon\t\t\n🌗\tlast quarter moon symbol|last quarter moon\t\t\n🌘\twaning crescent moon symbol|waning crescent moon\t\t\n🌙\tcrescent moon\tмесяц, луна\t\n🌚\tnew moon with face\tлуна\t\n🌛\tfirst quarter moon with face\t\t\n🌜\tlast quarter moon with face\t\t\n🌡️\tthermometer\t\t\n☀️\tblack sun with rays|sunny\tсолнце\t\n🌝\tfull moon with face\t\t\n🌞\tsun with face\tсолнце\t\n🪐\tringed planet\t\t\n⭐\twhite medium star|star\tзвезда\t\n🌟\tglowing star|star2\tзвезда\t\n🌠\tshooting star|stars\tпадающая звезда\t\n🌌\tmilky way\t\t\n☁️\tcloud\tоблако\t\n⛅\tsun behind cloud|partly sunny\tоблачно\t\n⛈️\tcloud with lightning and rain|thunder cloud and rain\t\t\n🌤️\tsun behind small cloud|mostly sunny|sun small cloud\t\t\n🌥️\tsun behind large cloud|barely sunny|sun behind cloud\t\t\n🌦️\tsun behind rain cloud|partly sunny rain\t\t\n🌧️\tcloud with rain|rain cloud\tдождь\t\n🌨️\tcloud with snow|snow cloud\tснег\t\n🌩️\tcloud with lightning|lightning|lightning cloud\tмолния, гроза\t\n🌪️\ttornado|tornado cloud\tторнадо, смерч\t\n🌫️\tfog\tтуман\t\n🌬️\twind face|wind blowing face\t\t\n🌀\tcyclone\t\t\n🌈\trainbow\tрадуга\t\n🌂\tclosed umbrella\t\t\n☂️\tumbrella\t\t\n☔\tumbrella with rain drops\tзонт, дождь\t\n⛱️\tumbrella on ground\t\t\n⚡\thigh voltage sign|zap\tмолния, электричество\t\n❄️\tsnowflake\tснежинка\t\n☃️\tsnowman\tснеговик\t\n⛄\tsnowman without snow\tснеговик\t\n☄️\tcomet\tкомета\t\n🔥\tfire\tогонь, пламя, горит\t\n💧\tdroplet\tкапля\t\n🌊\twater wave|ocean\tволна, море\t", "🎃\tjack-o-lantern|jack o lantern\tтыква, хэллоуин\t\n🎄\tchristmas tree\tёлка, новый год\t\n🎆\tfireworks\tсалют, фейерверк\t\n🎇\tfirework sparkler|sparkler\tбенгальский огонь\t\n🧨\tfirecracker\tпетарда\t\n✨\tsparkles\tискры, блёстки\t\n🎈\tballoon\tшарик\t\n🎉\tparty popper|tada\tхлопушка, праздник, ура\t\n🎊\tconfetti ball\tконфетти\t\n🎋\ttanabata tree\t\t\n🎍\tpine decoration|bamboo\t\t\n🎎\tjapanese dolls|dolls\t\t\n🎏\tcarp streamer|flags\t\t\n🎐\twind chime\t\t\n🎑\tmoon viewing ceremony|rice scene\t\t\n🧧\tred gift envelope|red envelope\t\t\n🎀\tribbon\tбант\t\n🎁\twrapped present|gift\tподарок\t\n🎗️\treminder ribbon\t\t\n🎟️\tadmission tickets\t\t\n🎫\tticket\tбилет\t\n🎖️\tmilitary medal|medal\t\t\n🏆\ttrophy\tкубок, победа\t\n🏅\tsports medal\tмедаль\t\n🥇\tfirst place medal\tзолото, первое место\t\n🥈\tsecond place medal\tсеребро, второе место\t\n🥉\tthird place medal\tбронза, третье место\t\n⚽\tsoccer ball|soccer\tфутбол, мяч\t\n⚾\tbaseball\t\t\n🥎\tsoftball\t\t\n🏀\tbasketball and hoop|basketball\tбаскетбол\t\n🏐\tvolleyball\tволейбол\t\n🏈\tamerican football|football\tамериканский футбол\t\n🏉\trugby football\t\t\n🎾\ttennis racquet and ball|tennis\tтеннис\t\n🥏\tflying disc\t\t\n🎳\tbowling\tбоулинг\t\n🏏\tcricket bat and ball\t\t\n🏑\tfield hockey stick and ball\t\t\n🏒\tice hockey stick and puck\tхоккей\t\n🥍\tlacrosse stick and ball|lacrosse\t\t\n🏓\ttable tennis paddle and ball\tпинг-понг\t\n🏸\tbadminton racquet and shuttlecock\t\t\n🥊\tboxing glove\tбокс\t\n🥋\tmartial arts uniform\t\t\n🥅\tgoal net\t\t\n⛳\tflag in hole|golf\tгольф\t\n⛸️\tice skate\t\t\n🎣\tfishing pole and fish\t\t\n🤿\tdiving mask\t\t\n🎽\trunning shirt with sash\t\t\n🎿\tski and ski boot|ski\tлыжи\t\n🛷\tsled\t\t\n🥌\tcurling stone\t\t\n🎯\tdirect hit|dart\tдартс, цель\t\n🪀\tyo-yo|yo yo\t\t\n🪁\tkite\tвоздушный змей\t\n🔫\tpistol|gun\tпистолет, водяной\t\n🎱\tbilliards|8ball\tбильярд\t\n🔮\tcrystal ball\tхрустальный шар\t\n🪄\tmagic wand\tволшебная палочка\t\n🎮\tvideo game\tигра, геймпад\t\n🕹️\tjoystick\tджойстик\t\n🎰\tslot machine\tказино, автомат\t\n🎲\tgame die\tкубик, кости\t\n🧩\tjigsaw puzzle piece|jigsaw\tпазл\t\n🧸\tteddy bear\tплюшевый мишка\t\n🪅\tpinata\t\t\n🪩\tmirror ball\tдиско шар\t\n🪆\tnesting dolls\tматрёшка\t\n♠️\tblack spade suit|spades\tпики\t\n♥️\tblack heart suit|hearts\tчервы\t\n♦️\tblack diamond suit|diamonds\tбубны\t\n♣️\tblack club suit|clubs\tтрефы\t\n♟️\tchess pawn\tшахматы, пешка\t\n🃏\tplaying card black joker|black joker\t\t\n🀄\tmahjong tile red dragon|mahjong\t\t\n🎴\tflower playing cards\t\t\n🎭\tperforming arts\tтеатр, маски\t\n🖼️\tframed picture|frame with picture\t\t\n🎨\tartist palette|art\tпалитра, рисование\t\n🧵\tspool of thread|thread\t\t\n🪡\tsewing needle\t\t\n🧶\tball of yarn|yarn\t\t\n🪢\tknot\t\t", "👓\teyeglasses\tочки\t\n🕶️\tsunglasses|dark sunglasses\tтёмные очки\t\n🥽\tgoggles\t\t\n🥼\tlab coat\t\t\n🦺\tsafety vest\t\t\n👔\tnecktie\tгалстук\t\n👕\tt-shirt|shirt|tshirt\tфутболка\t\n👖\tjeans\tджинсы\t\n🧣\tscarf\t\t\n🧤\tgloves\t\t\n🧥\tcoat\t\t\n🧦\tsocks\t\t\n👗\tdress\tплатье\t\n👘\tkimono\t\t\n🥻\tsari\t\t\n🩱\tone-piece swimsuit|one piece swimsuit\t\t\n🩲\tbriefs\t\t\n🩳\tshorts\t\t\n👙\tbikini\t\t\n👚\twomans clothes\t\t\n🪭\tfolding hand fan\t\t\n👛\tpurse\t\t\n👜\thandbag\t\t\n👝\tpouch\t\t\n🛍️\tshopping bags\t\t\n🎒\tschool satchel\t\t\n🩴\tthong sandal\t\t\n👞\tmans shoe|shoe\t\t\n👟\tathletic shoe\t\t\n🥾\thiking boot\t\t\n🥿\tflat shoe|womans flat shoe\t\t\n👠\thigh-heeled shoe|high heel\t\t\n👡\twomans sandal|sandal\t\t\n🩰\tballet shoes\t\t\n👢\twomans boots|boot\t\t\n🪮\thair pick\t\t\n👑\tcrown\tкорона\t\n👒\twomans hat\t\t\n🎩\ttop hat|tophat\tцилиндр, шляпа\t\n🎓\tgraduation cap|mortar board\tвыпускной\t\n🧢\tbilled cap\tкепка\t\n🪖\tmilitary helmet\t\t\n⛑️\trescue worker’s helmet|helmet with white cross\t\t\n📿\tprayer beads\t\t\n💄\tlipstick\tпомада\t\n💍\tring\tкольцо\t\n💎\tgem stone|gem\tалмаз, бриллиант\t\n🔇\tspeaker with cancellation stroke|mute\tбез звука\t\n🔈\tspeaker\t\t\n🔉\tspeaker with one sound wave|sound\t\t\n🔊\tspeaker with three sound waves|loud sound\tгромко\t\n📢\tpublic address loudspeaker|loudspeaker\tгромкоговоритель\t\n📣\tcheering megaphone|mega\tмегафон\t\n📯\tpostal horn\t\t\n🔔\tbell\tколокольчик\t\n🔕\tbell with cancellation stroke|no bell\t\t\n🎼\tmusical score\t\t\n🎵\tmusical note\tнота, музыка\t\n🎶\tmultiple musical notes|notes\tноты, музыка\t\n🎙️\tstudio microphone\tмикрофон\t\n🎚️\tlevel slider\t\t\n🎛️\tcontrol knobs\t\t\n🎤\tmicrophone\tмикрофон\t\n🎧\theadphone|headphones\tнаушники\t\n📻\tradio\tрадио\t\n🎷\tsaxophone\t\t\n🎺\ttrumpet\t\t\n🪗\taccordion\t\t\n🎸\tguitar\tгитара\t\n🎹\tmusical keyboard\tпианино, синтезатор\t\n🎻\tviolin\tскрипка\t\n🪕\tbanjo\t\t\n🥁\tdrum with drumsticks\tбарабан\t\n🪘\tlong drum\t\t\n🪇\tmaracas\t\t\n🪈\tflute\t\t\n📱\tmobile phone|iphone\tтелефон, смартфон\t\n📲\tmobile phone with rightwards arrow at left|calling\t\t\n☎️\tblack telephone|phone|telephone\tтелефон\t\n📞\ttelephone receiver\t\t\n📟\tpager\t\t\n📠\tfax machine|fax\t\t\n🔋\tbattery\tбатарейка\t\n🪫\tlow battery\tразряжена, батарейка\t\n🔌\telectric plug\t\t\n💻\tpersonal computer|computer\tноутбук, компьютер\t\n🖥️\tdesktop computer\tкомпьютер\t\n🖨️\tprinter\t\t\n⌨️\tkeyboard\tклавиатура\t\n🖱️\tcomputer mouse|three button mouse\tмышка\t\n🖲️\ttrackball\t\t\n💽\tminidisc\t\t\n💾\tfloppy disk\tдискета, сохранить\t\n💿\toptical disc|cd\t\t\n📀\tdvd\t\t\n🧮\tabacus\t\t\n🎥\tmovie camera\tкинокамера\t\n🎞️\tfilm frames\t\t\n📽️\tfilm projector\t\t\n🎬\tclapper board|clapper\tхлопушка, кино\t\n📺\ttelevision|tv\tтелевизор\t\n📷\tcamera\tфотоаппарат\t\n📸\tcamera with flash\tфото, вспышка\t\n📹\tvideo camera\tвидеокамера\t\n📼\tvideocassette|vhs\t\t\n🔍\tleft-pointing magnifying glass|mag\tлупа, поиск\t\n🔎\tright-pointing magnifying glass|mag right\t\t\n🕯️\tcandle\tсвеча\t\n💡\telectric light bulb|bulb\tлампочка, идея\t\n🔦\telectric torch|flashlight\tфонарик\t\n🏮\tizakaya lantern|lantern\t\t\n🪔\tdiya lamp\t\t\n📔\tnotebook with decorative cover\t\t\n📕\tclosed book\t\t\n📖\topen book|book\tкнига\t\n📗\tgreen book\t\t\n📘\tblue book\t\t\n📙\torange book\t\t\n📚\tbooks\tкниги\t\n📓\tnotebook\t\t\n📒\tledger\t\t\n📃\tpage with curl\t\t\n📜\tscroll\t\t\n📄\tpage facing up\t\t\n📰\tnewspaper\tгазета\t\n🗞️\trolled-up newspaper|rolled up newspaper\t\t\n📑\tbookmark tabs\t\t\n🔖\tbookmark\tзакладка\t\n🏷️\tlabel\t\t\n🪙\tcoin\tмонета\t\n💰\tmoney bag|moneybag\tмешок денег\t\n💴\tbanknote with yen sign|yen\t\t\n💵\tbanknote with dollar sign|dollar\tдоллары, деньги\t\n💶\tbanknote with euro sign|euro\tевро, деньги\t\n💷\tbanknote with pound sign|pound\t\t\n💸\tmoney with wings\tденьги улетают\t\n💳\tcredit card\tкарта\t\n🧾\treceipt\t\t\n💹\tchart with upwards trend and yen sign|chart\t\t\n✉️\tenvelope|email\tписьмо, почта\t\n📧\te-mail symbol|e mail\t\t\n📨\tincoming envelope\t\t\n📩\tenvelope with downwards arrow above|envelope with arrow\t\t\n📤\toutbox tray\t\t\n📥\tinbox tray\t\t\n📦\tpackage\tпосылка, коробка\t\n📫\tclosed mailbox with raised flag|mailbox\t\t\n📪\tclosed mailbox with lowered flag|mailbox closed\t\t\n📬\topen mailbox with raised flag|mailbox with mail\t\t\n📭\topen mailbox with lowered flag|mailbox with no mail\t\t\n📮\tpostbox\t\t\n🗳️\tballot box with ballot\t\t\n✏️\tpencil|pencil2\tкарандаш\t\n✒️\tblack nib\t\t\n🖋️\tfountain pen|lower left fountain pen\t\t\n🖊️\tpen|lower left ballpoint pen\t\t\n🖌️\tpaintbrush|lower left paintbrush\t\t\n🖍️\tcrayon|lower left crayon\t\t\n📝\tmemo|pencil\tзаметка\t\n💼\tbriefcase\tпортфель\t\n📁\tfile folder\t\t\n📂\topen file folder\t\t\n🗂️\tcard index dividers\t\t\n📅\tcalendar|date\tкалендарь, дата\t\n📆\ttear-off calendar|calendar\tкалендарь\t\n🗒️\tspiral notepad|spiral note pad\t\t\n🗓️\tspiral calendar|spiral calendar pad\t\t\n📇\tcard index\t\t\n📈\tchart with upwards trend\tрост, график\t\n📉\tchart with downwards trend\tпадение, график\t\n📊\tbar chart\tдиаграмма\t\n📋\tclipboard\t\t\n📌\tpushpin\tкнопка, закреп\t\n📍\tround pushpin\tметка, место\t\n📎\tpaperclip\tскрепка\t\n🖇️\tlinked paperclips\t\t\n📏\tstraight ruler\t\t\n📐\ttriangular ruler\t\t\n✂️\tblack scissors|scissors\tножницы\t\n🗃️\tcard file box\t\t\n🗄️\tfile cabinet\t\t\n🗑️\twastebasket\tмусорка, корзина\t\n🔒\tlock\tзамок, закрыто\t\n🔓\topen lock|unlock\tзамок, открыто\t\n🔏\tlock with ink pen\t\t\n🔐\tclosed lock with key\t\t\n🔑\tkey\tключ\t\n🗝️\told key\t\t\n🔨\thammer\tмолоток\t\n🪓\taxe\tтопор\t\n⛏️\tpick\t\t\n⚒️\thammer and pick\t\t\n🛠️\thammer and wrench\tинструменты\t\n🗡️\tdagger|dagger knife\tкинжал\t\n⚔️\tcrossed swords\tмечи, битва\t\n💣\tbomb\tбомба\t\n🪃\tboomerang\t\t\n🏹\tbow and arrow\tлук, стрела\t\n🛡️\tshield\tщит\t\n🪚\tcarpentry saw\t\t\n🔧\twrench\tгаечный ключ\t\n🪛\tscrewdriver\t\t\n🔩\tnut and bolt\t\t\n⚙️\tgear\tшестерёнка, настройки\t\n🗜️\tclamp|compression\t\t\n⚖️\tbalance scale|scales\t\t\n🦯\tprobing cane\t\t\n🔗\tlink symbol|link\tссылка, звено\t\n⛓️\tchains\tцепи\t\n🪝\thook\t\t\n🧰\ttoolbox\t\t\n🧲\tmagnet\tмагнит\t\n🪜\tladder\t\t\n⚗️\talembic\t\t\n🧪\ttest tube\tпробирка\t\n🧫\tpetri dish\t\t\n🧬\tdna double helix|dna\tднк\t\n🔬\tmicroscope\tмикроскоп\t\n🔭\ttelescope\tтелескоп\t\n📡\tsatellite antenna\t\t\n💉\tsyringe\tшприц, укол\t\n🩸\tdrop of blood\t\t\n💊\tpill\tтаблетка\t\n🩹\tadhesive bandage\t\t\n🩼\tcrutch\t\t\n🩺\tstethoscope\t\t\n🩻\tx-ray|x ray\t\t\n🚪\tdoor\tдверь\t\n🛗\televator\t\t\n🪞\tmirror\t\t\n🪟\twindow\t\t\n🛏️\tbed\tкровать\t\n🛋️\tcouch and lamp\t\t\n🪑\tchair\t\t\n🚽\ttoilet\tтуалет, унитаз\t\n🪠\tplunger\t\t\n🚿\tshower\tдуш\t\n🛁\tbathtub\tванна\t\n🪤\tmouse trap\t\t\n🪒\trazor\t\t\n🧴\tlotion bottle\t\t\n🧷\tsafety pin\t\t\n🧹\tbroom\t\t\n🧺\tbasket\t\t\n🧻\troll of paper\t\t\n🪣\tbucket\t\t\n🧼\tbar of soap|soap\tмыло\t\n🫧\tbubbles\t\t\n🪥\ttoothbrush\t\t\n🧽\tsponge\t\t\n🧯\tfire extinguisher\t\t\n🛒\tshopping trolley\tтележка, покупки\t\n🚬\tsmoking symbol|smoking\tсигарета, курение\t\n⚰️\tcoffin\tгроб\t\n🪦\theadstone\t\t\n⚱️\tfuneral urn\t\t\n🧿\tnazar amulet\t\t\n🪬\thamsa\t\t\n🗿\tmoyai\tмоаи, статуя, камень\t\n🪧\tplacard\t\t\n🪪\tidentification card\t\t", "🏧\tautomated teller machine|atm\t\t\n🚮\tput litter in its place symbol|put litter in its place\t\t\n🚰\tpotable water symbol|potable water\t\t\n♿\twheelchair symbol|wheelchair\t\t\n🚹\tmens symbol|mens\t\t\n🚺\twomens symbol|womens\t\t\n🚻\trestroom\t\t\n🚼\tbaby symbol\t\t\n🚾\twater closet|wc\t\t\n🛂\tpassport control\t\t\n🛃\tcustoms\t\t\n🛄\tbaggage claim\t\t\n🛅\tleft luggage\t\t\n⚠️\twarning sign|warning\tвнимание, предупреждение\t\n🚸\tchildren crossing\t\t\n⛔\tno entry\tвъезд запрещён\t\n🚫\tno entry sign\tзапрет\t\n🚳\tno bicycles\t\t\n🚭\tno smoking symbol|no smoking\t\t\n🚯\tdo not litter symbol|do not litter\t\t\n🚱\tnon-potable water symbol|non potable water\t\t\n🚷\tno pedestrians\t\t\n📵\tno mobile phones\t\t\n🔞\tno one under eighteen symbol|underage\t18+\t\n☢️\tradioactive|radioactive sign\tрадиация\t\n☣️\tbiohazard|biohazard sign\t\t\n⬆️\tupwards black arrow|arrow up\tстрелка вверх\t\n↗️\tnorth east arrow|arrow upper right\t\t\n➡️\tblack rightwards arrow|arrow right\tстрелка вправо\t\n↘️\tsouth east arrow|arrow lower right\t\t\n⬇️\tdownwards black arrow|arrow down\tстрелка вниз\t\n↙️\tsouth west arrow|arrow lower left\t\t\n⬅️\tleftwards black arrow|arrow left\tстрелка влево\t\n↖️\tnorth west arrow|arrow upper left\t\t\n↕️\tup down arrow|arrow up down\t\t\n↔️\tleft right arrow\t\t\n↩️\tleftwards arrow with hook\t\t\n↪️\trightwards arrow with hook|arrow right hook\t\t\n⤴️\tarrow pointing rightwards then curving upwards|arrow heading up\t\t\n⤵️\tarrow pointing rightwards then curving downwards|arrow heading down\t\t\n🔃\tclockwise downwards and upwards open circle arrows|arrows clockwise\t\t\n🔄\tanticlockwise downwards and upwards open circle arrows|arrows counterclockwise\tобновить, повтор\t\n🔙\tback with leftwards arrow above|back\tназад\t\n🔚\tend with leftwards arrow above|end\t\t\n🔛\ton with exclamation mark with left right arrow above|on\t\t\n🔜\tsoon with rightwards arrow above|soon\tскоро\t\n🔝\ttop with upwards arrow above|top\tтоп, вверх\t\n🛐\tplace of worship\t\t\n⚛️\tatom symbol\t\t\n🕉️\tom|om symbol\t\t\n✡️\tstar of david\t\t\n☸️\twheel of dharma\t\t\n☯️\tyin yang\tинь-ян\t\n✝️\tlatin cross\tкрест\t\n☦️\torthodox cross\tкрест\t\n☪️\tstar and crescent\t\t\n☮️\tpeace symbol\tмир, пацифик\t\n🕎\tmenorah with nine branches\t\t\n🔯\tsix pointed star with middle dot|six pointed star\t\t\n🪯\tkhanda\t\t\n♈\taries\t\t\n♉\ttaurus\t\t\n♊\tgemini\t\t\n♋\tcancer\t\t\n♌\tleo\t\t\n♍\tvirgo\t\t\n♎\tlibra\t\t\n♏\tscorpius\t\t\n♐\tsagittarius\t\t\n♑\tcapricorn\t\t\n♒\taquarius\t\t\n♓\tpisces\t\t\n⛎\tophiuchus\t\t\n🔀\ttwisted rightwards arrows\t\t\n🔁\tclockwise rightwards and leftwards open circle arrows|repeat\tповтор\t\n🔂\tclockwise rightwards and leftwards open circle arrows with circled one overlay|repeat one\t\t\n▶️\tblack right-pointing triangle|arrow forward\tиграть, плей\t\n⏩\tblack right-pointing double triangle|fast forward\t\t\n⏭️\tnext track button|black right pointing double triangle with vertical bar\t\t\n⏯️\tplay or pause button|black right pointing triangle with double vertical bar\t\t\n◀️\tblack left-pointing triangle|arrow backward\t\t\n⏪\tblack left-pointing double triangle|rewind\t\t\n⏮️\tlast track button|black left pointing double triangle with vertical bar\t\t\n🔼\tup-pointing small red triangle|arrow up small\t\t\n⏫\tblack up-pointing double triangle|arrow double up\t\t\n🔽\tdown-pointing small red triangle|arrow down small\t\t\n⏬\tblack down-pointing double triangle|arrow double down\t\t\n⏸️\tpause button|double vertical bar\tпауза\t\n⏹️\tstop button|black square for stop\t\t\n⏺️\trecord button|black circle for record\t\t\n⏏️\teject button|eject\t\t\n🎦\tcinema\t\t\n🔅\tlow brightness symbol|low brightness\t\t\n🔆\thigh brightness symbol|high brightness\t\t\n📶\tantenna with bars|signal strength\t\t\n🛜\twireless\t\t\n📳\tvibration mode\t\t\n📴\tmobile phone off\t\t\n♀️\tfemale sign\tженский знак\t\n♂️\tmale sign\tмужской знак\t\n⚧️\ttransgender symbol\t\t\n✖️\theavy multiplication x\tумножить, крестик\t\n➕\theavy plus sign\tплюс\t\n➖\theavy minus sign\tминус\t\n➗\theavy division sign\t\t\n🟰\theavy equals sign\t\t\n♾️\tinfinity\tбесконечность\t\n‼️\tdouble exclamation mark|bangbang\tвосклицательный знак\t\n⁉️\texclamation question mark|interrobang\tвопрос восклицание\t\n❓\tblack question mark ornament|question\tвопрос\t\n❔\twhite question mark ornament|grey question\t\t\n❕\twhite exclamation mark ornament|grey exclamation\t\t\n❗\theavy exclamation mark symbol|exclamation|heavy exclamation mark\tвосклицательный знак\t\n〰️\twavy dash\t\t\n💱\tcurrency exchange\t\t\n💲\theavy dollar sign\t\t\n⚕️\tmedical symbol|staff of aesculapius\t\t\n♻️\tblack universal recycling symbol|recycle\tпереработка\t\n⚜️\tfleur-de-lis|fleur de lis\t\t\n🔱\ttrident emblem|trident\t\t\n📛\tname badge\t\t\n🔰\tjapanese symbol for beginner|beginner\t\t\n⭕\theavy large circle|o\tкруг\t\n✅\twhite heavy check mark|white check mark\tгалочка, готово\t\n☑️\tballot box with check\t\t\n✔️\theavy check mark\tгалочка\t\n❌\tcross mark|x\tкрестик, нет\t\n❎\tnegative squared cross mark\t\t\n➰\tcurly loop\t\t\n➿\tdouble curly loop|loop\t\t\n〽️\tpart alternation mark\t\t\n✳️\teight spoked asterisk\t\t\n✴️\teight pointed black star\t\t\n❇️\tsparkle\t\t\n©️\tcopyright sign|copyright\tкопирайт\t\n®️\tregistered sign|registered\tзарегистрировано\t\n™️\ttrade mark sign|tm\tтоварный знак\t\n#️⃣\thash key|hash\t\t\n*️⃣\tkeycap: *|keycap star\t\t\n0️⃣\tkeycap 0|zero\t\t\n1️⃣\tkeycap 1|one\t\t\n2️⃣\tkeycap 2|two\t\t\n3️⃣\tkeycap 3|three\t\t\n4️⃣\tkeycap 4|four\t\t\n5️⃣\tkeycap 5|five\t\t\n6️⃣\tkeycap 6|six\t\t\n7️⃣\tkeycap 7|seven\t\t\n8️⃣\tkeycap 8|eight\t\t\n9️⃣\tkeycap 9|nine\t\t\n🔟\tkeycap ten\t\t\n🔠\tinput symbol for latin capital letters|capital abcd\t\t\n🔡\tinput symbol for latin small letters|abcd\t\t\n🔢\tinput symbol for numbers|1234\t\t\n🔣\tinput symbol for symbols|symbols\t\t\n🔤\tinput symbol for latin letters|abc\t\t\n🅰️\tnegative squared latin capital letter a|a\t\t\n🆎\tnegative squared ab|ab\t\t\n🅱️\tnegative squared latin capital letter b|b\t\t\n🆑\tsquared cl|cl\t\t\n🆒\tsquared cool|cool\tкруто\t\n🆓\tsquared free|free\tбесплатно\t\nℹ️\tinformation source\t\t\n🆔\tsquared id|id\t\t\nⓂ️\tcircled latin capital letter m|m\t\t\n🆕\tsquared new|new\tновое\t\n🆖\tsquared ng|ng\t\t\n🅾️\tnegative squared latin capital letter o|o2\t\t\n🆗\tsquared ok|ok\tок\t\n🅿️\tnegative squared latin capital letter p|parking\t\t\n🆘\tsquared sos|sos\tсос, помощь\t\n🆙\tsquared up with exclamation mark|up\t\t\n🆚\tsquared vs|vs\tпротив\t\n🈁\tsquared katakana koko|koko\t\t\n🈂️\tsquared katakana sa|sa\t\t\n🈷️\tsquared cjk unified ideograph-6708|u6708\t\t\n🈶\tsquared cjk unified ideograph-6709|u6709\t\t\n🈯\tsquared cjk unified ideograph-6307|u6307\t\t\n🉐\tcircled ideograph advantage|ideograph advantage\t\t\n🈹\tsquared cjk unified ideograph-5272|u5272\t\t\n🈚\tsquared cjk unified ideograph-7121|u7121\t\t\n🈲\tsquared cjk unified ideograph-7981|u7981\t\t\n🉑\tcircled ideograph accept|accept\t\t\n🈸\tsquared cjk unified ideograph-7533|u7533\t\t\n🈴\tsquared cjk unified ideograph-5408|u5408\t\t\n🈳\tsquared cjk unified ideograph-7a7a|u7a7a\t\t\n㊗️\tcircled ideograph congratulation|congratulations\t\t\n㊙️\tcircled ideograph secret|secret\t\t\n🈺\tsquared cjk unified ideograph-55b6|u55b6\t\t\n🈵\tsquared cjk unified ideograph-6e80|u6e80\t\t\n🔴\tlarge red circle|red circle\tкрасный круг\t\n🟠\tlarge orange circle\t\t\n🟡\tlarge yellow circle\t\t\n🟢\tlarge green circle\tзелёный круг\t\n🔵\tlarge blue circle\tсиний круг\t\n🟣\tlarge purple circle\t\t\n🟤\tlarge brown circle\t\t\n⚫\tmedium black circle|black circle\tчёрный круг\t\n⚪\tmedium white circle|white circle\tбелый круг\t\n🟥\tlarge red square\t\t\n🟧\tlarge orange square\t\t\n🟨\tlarge yellow square\t\t\n🟩\tlarge green square\t\t\n🟦\tlarge blue square\t\t\n🟪\tlarge purple square\t\t\n🟫\tlarge brown square\t\t\n⬛\tblack large square\t\t\n⬜\twhite large square\t\t\n◼️\tblack medium square\t\t\n◻️\twhite medium square\t\t\n◾\tblack medium small square\t\t\n◽\twhite medium small square\t\t\n▪️\tblack small square\t\t\n▫️\twhite small square\t\t\n🔶\tlarge orange diamond\t\t\n🔷\tlarge blue diamond\t\t\n🔸\tsmall orange diamond\t\t\n🔹\tsmall blue diamond\t\t\n🔺\tup-pointing red triangle|small red triangle\t\t\n🔻\tdown-pointing red triangle|small red triangle down\t\t\n💠\tdiamond shape with a dot inside\t\t\n🔘\tradio button\t\t\n🔳\twhite square button\t\t\n🔲\tblack square button\t\t", "🏁\tchequered flag|checkered flag\tфлаг\t\n🚩\ttriangular flag on post\tфлаг\t\n🎌\tcrossed flags\tфлаг\t\n🏴\twaving black flag\tфлаг\t\n🏳️\twhite flag|waving white flag\tфлаг\t\n🏳️‍🌈\trainbow flag\tфлаг\t\n🏳️‍⚧️\ttransgender flag\tфлаг\t\n🏴‍☠️\tpirate flag\tфлаг\t\n🇦🇨\tascension island flag|flag ac\t\t\n🇦🇩\tandorra flag|flag ad\tфлаг Андорра\t\n🇦🇪\tunited arab emirates flag|flag ae\tфлаг Объединенные Арабские Эмираты\t\n🇦🇫\tafghanistan flag|flag af\tфлаг Афганистан\t\n🇦🇬\tantigua & barbuda flag|flag ag\tфлаг Антигуа и Барбуда\t\n🇦🇮\tanguilla flag|flag ai\tфлаг Ангилья\t\n🇦🇱\talbania flag|flag al\tфлаг Албания\t\n🇦🇲\tarmenia flag|flag am\tфлаг Армения\t\n🇦🇴\tangola flag|flag ao\tфлаг Ангола\t\n🇦🇶\tantarctica flag|flag aq\tфлаг Антарктида\t\n🇦🇷\targentina flag|flag ar\tфлаг Аргентина\t\n🇦🇸\tamerican samoa flag|flag as\tфлаг Американское Самоа\t\n🇦🇹\taustria flag|flag at\tфлаг Австрия\t\n🇦🇺\taustralia flag|flag au\tфлаг Австралия\t\n🇦🇼\taruba flag|flag aw\tфлаг Аруба\t\n🇦🇽\tåland islands flag|flag ax\tфлаг Аландские острова\t\n🇦🇿\tazerbaijan flag|flag az\tфлаг Азербайджан\t\n🇧🇦\tbosnia & herzegovina flag|flag ba\tфлаг Босния и Герцеговина\t\n🇧🇧\tbarbados flag|flag bb\tфлаг Барбадос\t\n🇧🇩\tbangladesh flag|flag bd\tфлаг Бангладеш\t\n🇧🇪\tbelgium flag|flag be\tфлаг Бельгия\t\n🇧🇫\tburkina faso flag|flag bf\tфлаг Буркина-Фасо\t\n🇧🇬\tbulgaria flag|flag bg\tфлаг Болгария\t\n🇧🇭\tbahrain flag|flag bh\tфлаг Бахрейн\t\n🇧🇮\tburundi flag|flag bi\tфлаг Бурунди\t\n🇧🇯\tbenin flag|flag bj\tфлаг Бенин\t\n🇧🇱\tst. barthélemy flag|flag bl\tфлаг Сен-Бартельми\t\n🇧🇲\tbermuda flag|flag bm\tфлаг Бермуды\t\n🇧🇳\tbrunei flag|flag bn\tфлаг Бруней-Даруссалам\t\n🇧🇴\tbolivia flag|flag bo\tфлаг Боливия\t\n🇧🇶\tcaribbean netherlands flag|flag bq\tфлаг Бонайре, Синт-Эстатиус и Саба\t\n🇧🇷\tbrazil flag|flag br\tфлаг Бразилия\t\n🇧🇸\tbahamas flag|flag bs\tфлаг Багамы\t\n🇧🇹\tbhutan flag|flag bt\tфлаг Бутан\t\n🇧🇻\tbouvet island flag|flag bv\tфлаг о. Буве\t\n🇧🇼\tbotswana flag|flag bw\tфлаг Ботсвана\t\n🇧🇾\tbelarus flag|flag by\tфлаг Беларусь\t\n🇧🇿\tbelize flag|flag bz\tфлаг Белиз\t\n🇨🇦\tcanada flag|flag ca\tфлаг Канада\t\n🇨🇨\tcocos (keeling) islands flag|flag cc\tфлаг Кокосовые (Килинг) острова\t\n🇨🇩\tcongo - kinshasa flag|flag cd\tфлаг Демократическая Республика Конго\t\n🇨🇫\tcentral african republic flag|flag cf\tфлаг Центрально-Африканская Республика\t\n🇨🇬\tcongo - brazzaville flag|flag cg\tфлаг Конго\t\n🇨🇭\tswitzerland flag|flag ch\tфлаг Швейцария\t\n🇨🇮\tcôte d’ivoire flag|flag ci\tфлаг Кот д'Ивуар\t\n🇨🇰\tcook islands flag|flag ck\tфлаг о-ва Кука\t\n🇨🇱\tchile flag|flag cl\tфлаг Чили\t\n🇨🇲\tcameroon flag|flag cm\tфлаг Камерун\t\n🇨🇳\tchina flag|cn|flag cn\tфлаг Китай\t\n🇨🇴\tcolombia flag|flag co\tфлаг Колумбия\t\n🇨🇵\tclipperton island flag|flag cp\t\t\n🇨🇷\tcosta rica flag|flag cr\tфлаг Коста-Рика\t\n🇨🇺\tcuba flag|flag cu\tфлаг Куба\t\n🇨🇻\tcape verde flag|flag cv\tфлаг Кабо-Верде\t\n🇨🇼\tcuraçao flag|flag cw\tфлаг Кюрасао\t\n🇨🇽\tchristmas island flag|flag cx\tфлаг о. Рождества\t\n🇨🇾\tcyprus flag|flag cy\tфлаг Кипр\t\n🇨🇿\tczechia flag|flag cz\tфлаг Чешская Республика\t\n🇩🇪\tgermany flag|de|flag de\tфлаг Германия\t\n🇩🇬\tdiego garcia flag|flag dg\t\t\n🇩🇯\tdjibouti flag|flag dj\tфлаг Джибути\t\n🇩🇰\tdenmark flag|flag dk\tфлаг Дания\t\n🇩🇲\tdominica flag|flag dm\tфлаг Доминика\t\n🇩🇴\tdominican republic flag|flag do\tфлаг Доминиканская Республика\t\n🇩🇿\talgeria flag|flag dz\tфлаг Алжир\t\n🇪🇦\tceuta & melilla flag|flag ea\t\t\n🇪🇨\tecuador flag|flag ec\tфлаг Эквадор\t\n🇪🇪\testonia flag|flag ee\tфлаг Эстония\t\n🇪🇬\tegypt flag|flag eg\tфлаг Египет\t\n🇪🇭\twestern sahara flag|flag eh\t\t\n🇪🇷\teritrea flag|flag er\tфлаг Эритрея\t\n🇪🇸\tspain flag|es|flag es\tфлаг Испания\t\n🇪🇹\tethiopia flag|flag et\tфлаг Эфиопия\t\n🇪🇺\teuropean union flag|flag eu\t\t\n🇫🇮\tfinland flag|flag fi\tфлаг Финляндия\t\n🇫🇯\tfiji flag|flag fj\tфлаг Фиджи\t\n🇫🇰\tfalkland islands flag|flag fk\tфлаг Фолклендские острова\t\n🇫🇲\tmicronesia flag|flag fm\tфлаг Микронезия, Федеративные Штаты\t\n🇫🇴\tfaroe islands flag|flag fo\tфлаг Фарерские острова\t\n🇫🇷\tfrance flag|fr|flag fr\tфлаг Франция\t\n🇬🇦\tgabon flag|flag ga\tфлаг Габон\t\n🇬🇧\tunited kingdom flag|gb|uk|flag gb\tфлаг Соединенное Королевство\t\n🇬🇩\tgrenada flag|flag gd\tфлаг Гренада\t\n🇬🇪\tgeorgia flag|flag ge\tфлаг Грузия\t\n🇬🇫\tfrench guiana flag|flag gf\tфлаг Французская Гвиана\t\n🇬🇬\tguernsey flag|flag gg\tфлаг Гернси\t\n🇬🇭\tghana flag|flag gh\tфлаг Гана\t\n🇬🇮\tgibraltar flag|flag gi\tфлаг Гибралтар\t\n🇬🇱\tgreenland flag|flag gl\tфлаг Гренландия\t\n🇬🇲\tgambia flag|flag gm\tфлаг Гамбия\t\n🇬🇳\tguinea flag|flag gn\tфлаг Гвинея\t\n🇬🇵\tguadeloupe flag|flag gp\tфлаг Гваделупа\t\n🇬🇶\tequatorial guinea flag|flag gq\tфлаг Экваториальная Гвинея\t\n🇬🇷\tgreece flag|flag gr\tфлаг Греция\t\n🇬🇸\tsouth georgia & south sandwich islands flag|flag gs\tфлаг Южная Джорджия и Южные Сандвичевы о-ва\t\n🇬🇹\tguatemala flag|flag gt\tфлаг Гватемала\t\n🇬🇺\tguam flag|flag gu\tфлаг Гуам\t\n🇬🇼\tguinea-bissau flag|flag gw\tфлаг Гвинея-Бисау\t\n🇬🇾\tguyana flag|flag gy\tфлаг Гайана\t\n🇭🇰\thong kong sar china flag|flag hk\tфлаг Гонконг, CАР\t\n🇭🇲\theard & mcdonald islands flag|flag hm\tфлаг о-ва Херд и Макдональд\t\n🇭🇳\thonduras flag|flag hn\tфлаг Гондурас\t\n🇭🇷\tcroatia flag|flag hr\tфлаг Хорватия\t\n🇭🇹\thaiti flag|flag ht\tфлаг Гаити\t\n🇭🇺\thungary flag|flag hu\tфлаг Венгрия\t\n🇮🇨\tcanary islands flag|flag ic\t\t\n🇮🇩\tindonesia flag|flag id\tфлаг Индонезия\t\n🇮🇪\tireland flag|flag ie\tфлаг Ирландия\t\n🇮🇱\tisrael flag|flag il\tфлаг Израиль\t\n🇮🇲\tisle of man flag|flag im\tфлаг Мэн, о-в\t\n🇮🇳\tindia flag|flag in\tфлаг Индия\t\n🇮🇴\tbritish indian ocean territory flag|flag io\tфлаг Британская территория в Индийском океане\t\n🇮🇶\tiraq flag|flag iq\tфлаг Ирак\t\n🇮🇷\tiran flag|flag ir\tфлаг Иран\t\n🇮🇸\ticeland flag|flag is\tфлаг Исландия\t\n🇮🇹\titaly flag|it|flag it\tфлаг Италия\t\n🇯🇪\tjersey flag|flag je\tфлаг Джерси\t\n🇯🇲\tjamaica flag|flag jm\tфлаг Ямайка\t\n🇯🇴\tjordan flag|flag jo\tфлаг Иордания\t\n🇯🇵\tjapan flag|jp|flag jp\tфлаг Япония\t\n🇰🇪\tkenya flag|flag ke\tфлаг Кения\t\n🇰🇬\tkyrgyzstan flag|flag kg\tфлаг Киргизия\t\n🇰🇭\tcambodia flag|flag kh\tфлаг Камбоджа\t\n🇰🇮\tkiribati flag|flag ki\tфлаг Кирибати\t\n🇰🇲\tcomoros flag|flag km\tфлаг Коморы\t\n🇰🇳\tst. kitts & nevis flag|flag kn\tфлаг Сент-Китс и Невис\t\n🇰🇵\tnorth korea flag|flag kp\tфлаг Корея, Народно-Демократическая Республика\t\n🇰🇷\tsouth korea flag|kr|flag kr\tфлаг Корея, Республика\t\n🇰🇼\tkuwait flag|flag kw\tфлаг Кувейт\t\n🇰🇾\tcayman islands flag|flag ky\tфлаг Каймановы о-ва\t\n🇰🇿\tkazakhstan flag|flag kz\tфлаг Казахстан\t\n🇱🇦\tlaos flag|flag la\tфлаг Лаос\t\n🇱🇧\tlebanon flag|flag lb\tфлаг Ливан\t\n🇱🇨\tst. lucia flag|flag lc\tфлаг Сент-Люсия\t\n🇱🇮\tliechtenstein flag|flag li\tфлаг Лихтенштейн\t\n🇱🇰\tsri lanka flag|flag lk\tфлаг Шри-Ланка\t\n🇱🇷\tliberia flag|flag lr\tфлаг Либерия\t\n🇱🇸\tlesotho flag|flag ls\tфлаг Лесото\t\n🇱🇹\tlithuania flag|flag lt\tфлаг Литва\t\n🇱🇺\tluxembourg flag|flag lu\tфлаг Люксембург\t\n🇱🇻\tlatvia flag|flag lv\tфлаг Латвия\t\n🇱🇾\tlibya flag|flag ly\tфлаг Ливия\t\n🇲🇦\tmorocco flag|flag ma\tфлаг Марокко\t\n🇲🇨\tmonaco flag|flag mc\tфлаг Монако\t\n🇲🇩\tmoldova flag|flag md\tфлаг Молдова\t\n🇲🇪\tmontenegro flag|flag me\tфлаг Черногория\t\n🇲🇫\tst. martin flag|flag mf\tфлаг Сен-Мартен\t\n🇲🇬\tmadagascar flag|flag mg\tфлаг Мадагаскар\t\n🇲🇭\tmarshall islands flag|flag mh\tфлаг Маршалловы о-ва\t\n🇲🇰\tnorth macedonia flag|flag mk\tфлаг Северная Македония\t\n🇲🇱\tmali flag|flag ml\tфлаг Мали\t\n🇲🇲\tmyanmar (burma) flag|flag mm\tфлаг Мьянма\t\n🇲🇳\tmongolia flag|flag mn\tфлаг Монголия\t\n🇲🇴\tmacao sar china flag|flag mo\tфлаг Макао, САР\t\n🇲🇵\tnorthern mariana islands flag|flag mp\tфлаг Северные Марианские острова\t\n🇲🇶\tmartinique flag|flag mq\tфлаг Мартиника\t\n🇲🇷\tmauritania flag|flag mr\tфлаг Мавритания\t\n🇲🇸\tmontserrat flag|flag ms\tфлаг Монтсеррат\t\n🇲🇹\tmalta flag|flag mt\tфлаг Мальта\t\n🇲🇺\tmauritius flag|flag mu\tфлаг Маврикий\t\n🇲🇻\tmaldives flag|flag mv\tфлаг Мальдивы\t\n🇲🇼\tmalawi flag|flag mw\tфлаг Малави\t\n🇲🇽\tmexico flag|flag mx\tфлаг Мексика\t\n🇲🇾\tmalaysia flag|flag my\tфлаг Малайзия\t\n🇲🇿\tmozambique flag|flag mz\tфлаг Мозамбик\t\n🇳🇦\tnamibia flag|flag na\tфлаг Намибия\t\n🇳🇨\tnew caledonia flag|flag nc\tфлаг Новая Каледония\t\n🇳🇪\tniger flag|flag ne\tфлаг Нигер\t\n🇳🇫\tnorfolk island flag|flag nf\tфлаг о. Норфолк\t\n🇳🇬\tnigeria flag|flag ng\tфлаг Нигерия\t\n🇳🇮\tnicaragua flag|flag ni\tфлаг Никарагуа\t\n🇳🇱\tnetherlands flag|flag nl\tфлаг Нидерланды\t\n🇳🇴\tnorway flag|flag no\tфлаг Норвегия\t\n🇳🇵\tnepal flag|flag np\tфлаг Непал\t\n🇳🇷\tnauru flag|flag nr\tфлаг Науру\t\n🇳🇺\tniue flag|flag nu\tфлаг Ниуэ\t\n🇳🇿\tnew zealand flag|flag nz\tфлаг Новая Зеландия\t\n🇴🇲\toman flag|flag om\tфлаг Оман\t\n🇵🇦\tpanama flag|flag pa\tфлаг Панама\t\n🇵🇪\tperu flag|flag pe\tфлаг Перу\t\n🇵🇫\tfrench polynesia flag|flag pf\tфлаг Французская Полинезия\t\n🇵🇬\tpapua new guinea flag|flag pg\tфлаг Папуа — Новая Гвинея\t\n🇵🇭\tphilippines flag|flag ph\tфлаг Филиппины\t\n🇵🇰\tpakistan flag|flag pk\tфлаг Пакистан\t\n🇵🇱\tpoland flag|flag pl\tфлаг Польша\t\n🇵🇲\tst. pierre & miquelon flag|flag pm\tфлаг Сен-Пьер и Микелон\t\n🇵🇳\tpitcairn islands flag|flag pn\tфлаг о-ва Питкэрн\t\n🇵🇷\tpuerto rico flag|flag pr\tфлаг Пуэрто-Рико\t\n🇵🇸\tpalestinian territories flag|flag ps\tфлаг Палестинская Автономия\t\n🇵🇹\tportugal flag|flag pt\tфлаг Португалия\t\n🇵🇼\tpalau flag|flag pw\tфлаг Палау\t\n🇵🇾\tparaguay flag|flag py\tфлаг Парагвай\t\n🇶🇦\tqatar flag|flag qa\tфлаг Катар\t\n🇷🇪\tréunion flag|flag re\tфлаг Реюньон\t\n🇷🇴\tromania flag|flag ro\tфлаг Румыния\t\n🇷🇸\tserbia flag|flag rs\tфлаг Сербия\t\n🇷🇺\trussia flag|ru|flag ru\tфлаг Россия\t\n🇷🇼\trwanda flag|flag rw\tфлаг Руанда\t\n🇸🇦\tsaudi arabia flag|flag sa\tфлаг Саудовская Аравия\t\n🇸🇧\tsolomon islands flag|flag sb\tфлаг Соломоновы о-ва\t\n🇸🇨\tseychelles flag|flag sc\tфлаг Сейшельские о-ва\t\n🇸🇩\tsudan flag|flag sd\tфлаг Судан\t\n🇸🇪\tsweden flag|flag se\tфлаг Швеция\t\n🇸🇬\tsingapore flag|flag sg\tфлаг Сингапур\t\n🇸🇭\tst. helena flag|flag sh\tфлаг Святая Елена, остров Вознесения, Тристан-да-Кунья\t\n🇸🇮\tslovenia flag|flag si\tфлаг Словения\t\n🇸🇯\tsvalbard & jan mayen flag|flag sj\tфлаг Шпицберген\t\n🇸🇰\tslovakia flag|flag sk\tфлаг Словакия\t\n🇸🇱\tsierra leone flag|flag sl\tфлаг Сьерра-Леоне\t\n🇸🇲\tsan marino flag|flag sm\tфлаг Сан-Марино\t\n🇸🇳\tsenegal flag|flag sn\tфлаг Сенегал\t\n🇸🇴\tsomalia flag|flag so\tфлаг Сомали\t\n🇸🇷\tsuriname flag|flag sr\tфлаг Суринам\t\n🇸🇸\tsouth sudan flag|flag ss\tфлаг Южный Судан\t\n🇸🇹\tsão tomé & príncipe flag|flag st\tфлаг Сан-Томе и Принсипи\t\n🇸🇻\tel salvador flag|flag sv\tфлаг Эль-Сальвадор\t\n🇸🇽\tsint maarten flag|flag sx\tфлаг Синт-Мартен\t\n🇸🇾\tsyria flag|flag sy\tфлаг Сирия\t\n🇸🇿\teswatini flag|flag sz\tфлаг Свазиленд\t\n🇹🇦\ttristan da cunha flag|flag ta\t\t\n🇹🇨\tturks & caicos islands flag|flag tc\tфлаг Острова Теркс и Кайкос\t\n🇹🇩\tchad flag|flag td\tфлаг Чад\t\n🇹🇫\tfrench southern territories flag|flag tf\tфлаг Французские Южные Территории\t\n🇹🇬\ttogo flag|flag tg\tфлаг Того\t\n🇹🇭\tthailand flag|flag th\tфлаг Таиланд\t\n🇹🇯\ttajikistan flag|flag tj\tфлаг Таджикистан\t\n🇹🇰\ttokelau flag|flag tk\tфлаг Токелау\t\n🇹🇱\ttimor-leste flag|flag tl\tфлаг Тимор-Лесте\t\n🇹🇲\tturkmenistan flag|flag tm\tфлаг Туркменистан\t\n🇹🇳\ttunisia flag|flag tn\tфлаг Тунис\t\n🇹🇴\ttonga flag|flag to\tфлаг Тонга\t\n🇹🇷\ttürkiye flag|flag tr\tфлаг Турция\t\n🇹🇹\ttrinidad & tobago flag|flag tt\tфлаг Тринидад и Тобаго\t\n🇹🇻\ttuvalu flag|flag tv\tфлаг Тувалу\t\n🇹🇼\ttaiwan flag|flag tw\tфлаг Тайвань\t\n🇹🇿\ttanzania flag|flag tz\tфлаг Танзания\t\n🇺🇦\tukraine flag|flag ua\tфлаг Украина\t\n🇺🇬\tuganda flag|flag ug\tфлаг Уганда\t\n🇺🇲\tu.s. outlying islands flag|flag um\tфлаг США, Малые Тихоокеанские Отдаленные Острова\t\n🇺🇳\tunited nations flag|flag un\t\t\n🇺🇸\tunited states flag|us|flag us\tфлаг США\t\n🇺🇾\turuguay flag|flag uy\tфлаг Уругвай\t\n🇺🇿\tuzbekistan flag|flag uz\tфлаг Узбекистан\t\n🇻🇦\tvatican city flag|flag va\tфлаг Ватикан\t\n🇻🇨\tst. vincent & grenadines flag|flag vc\tфлаг Сент-Винсент и Гренадины\t\n🇻🇪\tvenezuela flag|flag ve\tфлаг Венесуэла\t\n🇻🇬\tbritish virgin islands flag|flag vg\tфлаг Британские Виргинские о-ва\t\n🇻🇮\tu.s. virgin islands flag|flag vi\tфлаг Виргинские острова США\t\n🇻🇳\tvietnam flag|flag vn\tфлаг Вьетнам\t\n🇻🇺\tvanuatu flag|flag vu\tфлаг Вануату\t\n🇼🇫\twallis & futuna flag|flag wf\tфлаг Уоллис и Футуна\t\n🇼🇸\tsamoa flag|flag ws\tфлаг Самоа\t\n🇽🇰\tkosovo flag|flag xk\tфлаг Косово\t\n🇾🇪\tyemen flag|flag ye\tфлаг Йемен\t\n🇾🇹\tmayotte flag|flag yt\tфлаг Майотта\t\n🇿🇦\tsouth africa flag|flag za\tфлаг Южная Африка\t\n🇿🇲\tzambia flag|flag zm\tфлаг Замбия\t\n🇿🇼\tzimbabwe flag|flag zw\tфлаг Зимбабве\t\n🏴󠁧󠁢󠁥󠁮󠁧󠁿\tengland flag|flag england\tфлаг\t\n🏴󠁧󠁢󠁳󠁣󠁴󠁿\tscotland flag|flag scotland\tфлаг\t\n🏴󠁧󠁢󠁷󠁬󠁳󠁿\twales flag|flag wales\tфлаг\t"]};

// ── src/main/78_emoji_model.js ──
/* Мир страницы: эмодзи для меню смайликов (вкладка «Эмодзи» в 79_emote_menu_ui.js).
 *
 * Данные — встроенные (78_emoji_data.js, собраны из набора эмодзи Chatterino = emoji-data, MIT);
 * разбираются один раз при первом открытии вкладки, не при загрузке страницы.
 * Вставка — самим эмодзи текстом (Twitch показывает их шрифтом системы, как любой текст).
 *
 *  • поиск — по английским именам и коротким именам (как у Chatterino/Discord) и по русским
 *    словам (основные эмодзи; флаги — названием страны);
 *  • оттенок кожи — один на все эмодзи, которые его поддерживают, запоминается (input.emojiTone);
 *  • недавние — input.emojiRecent (эмодзи без оттенка: сменили оттенок — недавние тоже в нём).
 *
 * API (CPX.emoji):
 *   .cats() → [{key, title, icon, items:[пункт]}] — разделы по порядку Unicode
 *   .search(q) → [пункт] — лучшие совпадения первыми
 *   .recent() → [пункт] · .pushRecent(пункт)
 *   .tone() → 0…5 · .setTone(0…5) · .TONES — образцы оттенков ["✋", "✋🏻", …]
 *   .text(пункт) → строка для вставки (с оттенком, если он поддерживается)
 *   пункт: {k: "emoji:" + эмодзи, e: эмодзи, en, ru, t: ""|"t"|"T…", cat}
 */

CPX.emoji = (() => {
  const log = CPX.log("emoji");
  const RECENT_KEY = "input.emojiRecent";
  const TONE_KEY = "input.emojiTone";
  const RECENT_MAX = 36;
  const TONE_CH = ["", "\u{1F3FB}", "\u{1F3FC}", "\u{1F3FD}", "\u{1F3FE}", "\u{1F3FF}"];

  let parsed = null; // {cats, all, byE}

  function parse() {
    if (parsed) return parsed;
    const D = CPX.emojiData;
    const cats = [];
    const all = [];
    const byE = new Map();
    if (!D || !Array.isArray(D.cats) || !Array.isArray(D.list)) {
      log.warn("нет данных эмодзи");
      return (parsed = { cats, all, byE });
    }
    const ru = CPX.i18n.lang === "ru";
    D.cats.forEach((c, i) => {
      const items = [];
      for (const line of String(D.list[i] || "").split("\n")) {
        if (!line) continue;
        const f = line.split("\t");
        const it = { k: "emoji:" + f[0], e: f[0], en: f[1] || "", ru: f[2] || "", t: f[3] || "", cat: c[0] };
        items.push(it);
        all.push(it);
        byE.set(it.e, it);
      }
      cats.push({ key: c[0], title: ru ? c[2] : c[1], icon: c[3], items });
    });
    parsed = { cats, all, byE };
    return parsed;
  }
  // Сменили язык — заголовки разделов пересобрать.
  CPX.settings.on("general.lang", () => {
    parsed = null;
  });

  /* ── оттенок кожи ───────────────────────────────────────────────────────── */

  const tone = () => {
    const v = +CPX.settings.get(TONE_KEY) || 0;
    return v >= 0 && v <= 5 ? v : 0;
  };
  let toneLocal = null; // свой выбор, пока фон не прислал сохранённое
  const curTone = () => (toneLocal != null ? toneLocal : tone());
  function setTone(v) {
    v = Math.max(0, Math.min(5, Math.round(+v || 0)));
    toneLocal = v;
    CPX.settings.set(TONE_KEY, v).catch((e) => log.warn("оттенок не сохранился:", e && e.message));
  }
  CPX.settings.on(TONE_KEY, () => {
    toneLocal = null;
  });

  // Оттенок — после первого знака (FE0F сразу за ним убрать), как в наборе Unicode; «T…» —
  // готовые варианты (сборка данных кладёт их, если правило не подходит).
  function withTone(it, t) {
    if (!t || !it.t) return it.e;
    if (it.t.charAt(0) === "T") {
      const v = it.t.slice(1).split(" ");
      return v[t - 1] || it.e;
    }
    const cps = Array.from(it.e);
    let rest = cps.slice(1);
    if (rest[0] === String.fromCharCode(0xfe0f)) rest = rest.slice(1);
    return cps[0] + TONE_CH[t] + rest.join("");
  }
  const text = (it) => withTone(it, curTone());

  /* ── поиск ──────────────────────────────────────────────────────────────── */

  // Ранг: 0 — имя целиком (короткое имя «heart» → ❤️, а не 😍), 1 — слово целиком, 2 — начало
  // слова, 3 — внутри слова. Английские и русские — вместе.
  function rank(hay, q, sep) {
    const at = hay.indexOf(q);
    if (at < 0) return -1;
    if (hay.split(sep).includes(q)) return 0;
    const r = rankWord(hay, q, at);
    return r < 0 ? r : r + 1;
  }
  function rankWord(hay, q, at) {
    let best = 2;
    for (let i = at; i >= 0; i = hay.indexOf(q, i + 1)) {
      const start = i === 0 || /[\s|,:-]/.test(hay.charAt(i - 1));
      if (!start) continue;
      const end = i + q.length >= hay.length || /[\s|,:-]/.test(hay.charAt(i + q.length));
      if (end) return 0;
      best = 1;
    }
    return best;
  }
  function search(q) {
    q = String(q || "").trim().toLowerCase().replace(/ё/g, "е");
    if (!q) return [];
    const P = parse();
    const direct = P.byE.get(q);
    const hits = [];
    P.all.forEach((it, i) => {
      if (it === direct) return;
      const a = rank(it.en, q, "|");
      const b = rank(it.ru.toLowerCase().replace(/ё/g, "е"), q, ", ");
      const r = a < 0 ? b : b < 0 ? a : Math.min(a, b);
      if (r >= 0) hits.push({ it, r, i });
    });
    hits.sort((x, y) => x.r - y.r || x.i - y.i);
    const out = hits.map((h) => h.it);
    if (direct) out.unshift(direct);
    return out;
  }

  /* ── недавние ───────────────────────────────────────────────────────────── */

  let recentLocal = null;
  let recentPending = null;
  function recentRaw() {
    const raw = recentLocal || CPX.settings.get(RECENT_KEY);
    return Array.isArray(raw) ? raw.filter((x) => typeof x === "string" && x && x.length <= 40).slice(0, RECENT_MAX) : [];
  }
  function recent() {
    const P = parse();
    const out = [];
    for (const e of recentRaw()) {
      const it = P.byE.get(e);
      if (it) out.push(it);
    }
    return out;
  }
  const saveRecent = CPX.debounce(() => {
    const list = recentPending;
    recentPending = null;
    if (!list) return;
    CPX.settings.set(RECENT_KEY, list).catch((e) => log.warn("недавние эмодзи не сохранились:", e && e.message));
  }, 600);
  function pushRecent(it) {
    if (!it || !it.e) return;
    recentLocal = [it.e].concat(recentRaw().filter((e) => e !== it.e)).slice(0, RECENT_MAX);
    recentPending = recentLocal;
    saveRecent();
  }
  CPX.settings.on(RECENT_KEY, () => {
    if (!recentPending) recentLocal = null;
  });

  CPX.diag.add("emoji", () => ({ parsed: !!parsed, count: parsed ? parsed.all.length : 0, recent: recentRaw().length, tone: curTone() }));

  return {
    cats: () => parse().cats,
    search,
    recent,
    pushRecent,
    tone: curTone,
    setTone,
    text,
    withTone,
    TONES: TONE_CH.map((t) => "✋" + t),
  };
})();

// ── src/main/78_emote_menu_data.js ──
/* Меню смайликов Chatterino+ у поля ввода — часть 1: данные (без окон).
 *
 * Окно — 79_emote_menu_fx.js (виды эффектов), 79_emote_menu_grid.js (сетка), 79_emote_menu_ui.js
 * (кнопка, всплывашка, вкладки). Эмодзи — 78_emoji_model.js, наборы Twitch — 78_emote_data_twitch.js.
 * Здесь: что показывать, в каком порядке, размеры плиток, поиск, недавние, избранное, строки
 * эффектов и запись для чата, картинки смайликов и живой предпросмотр эффекта в Shadow DOM.
 *
 * РАЗДЕЛЫ (сверху вниз; приоритет слова в чате — как 35_pipeline, 76_input_emotes):
 *   избранное → недавние → личные 7TV (КАЖДЫЙ набор своим разделом с названием; личный — первым,
 *   дальше по названию, как 7TV) → канал (7TV, BTTV, FFZ) → Twitch → глобальные 7TV/BTTV/FFZ.
 * Twitch — СОСТАВ как у родного окна (сверено 29.09 на живой странице владельца), ПОРЯДОК свой,
 * по виду: этот канал → каналы с подпиской (фолловерские того же канала — в его разделе) → только
 * фолловерские → хайп-трейн → ограниченные и коммерческие (по владельцу) → «Разблокированные»
 * (без владельца) → Turbo → Prime → 2FA → глобальные Twitch. Родное окно: этот канал → все каналы
 * вперемешку в порядке данных → хайп-трейн → «Разблокированные» → глобальные (Turbo и 2FA — без
 * своих разделов). Раскладка — по типу смайликов (Emote.type) и владельцу набора.
 * Смайлик, который в чате всё равно окажется ДРУГИМ (одноимённый выше по приоритету, родной
 * смайлик Twitch с тем же именем, код эффекта BTTV «w!»…), в меню не показываем: щелчок по нему
 * вставил бы имя, а в чате вышел бы не он. Выключенный в настройках сервис — не показываем.
 *
 * РАЗМЕР ПЛИТКИ — как в чате (57_emote_render): известный размер 1x как есть (широкие — широкие),
 * Twitch — 28×28, BTTV без размера — высота 28, ширина по картинке (узнаём при загрузке — learn();
 * пока не знаем — квадрат). Внутри раздела: zero-width — первыми, дальше по возрастанию
 * ширины (чем шире, тем ниже); «Недавние» — по свежести, поиск — по качеству совпадения.
 *
 * ИЗБРАННОЕ и НЕДАВНИЕ — скрытые настройки input.menuFav / input.menuRecent (pageWritable — иначе
 * фон не принял бы их со страницы): [{p, i, n}] (сервис + id + имя). Нет сейчас такого смайлика
 * (другой канал, выключен сервис) — просто не показываем, из списка не выкидываем. Избранного не
 * больше FAV_MAX: при полном новый не добавляется (toggleFav → null, окно скажет почему).
 *
 * ЭФФЕКТЫ (research/04 §3.4, клиент: SplitInput::addEmoteEffectMenu, EmotePopup::reloadEffects):
 *   • одна строка на эффект: бесплатные — кодом BTTV (короче и работает без подписки), если он
 *     применим, иначе кодом FFZ; на смайликах Twitch коды BTTV НЕ предлагаются (не работают ни у
 *     нас, ни в браузере); FFZ-коды — только если данные FFZ загружены (иначе и у нас не сработают);
 *   • платные: подписчик PLUS без поддержки FFZ — наш код «+spin» ПЕРЕД смайликом (увидят только
 *     в Chatterino+ — пометка PLUS); поддержавший FFZ — «ffzSpin» ПОСЛЕ (шире охват, даже с PLUS);
 *     ни того ни другого — строка заперта (видна и движется — по ней решают, нужна ли подписка);
 *   • запись для чата: наши коды, затем коды BTTV перед именем, коды FFZ после — как
 *     CPX.fx.recipe/клиент; отправка (77_input_send) всё равно выправит порядок.
 *   • вкладка «Эффекты» без выбранного смайлика — как в клиенте: три раздела (BTTV, FFZ, платные),
 *     щелчок кладёт один код в поле у курсора.
 *
 * ПРЕДПРОСМОТР. Ключевые кадры эффектов 55_effects собирает в <style id="cpx-effects> документа, а
 * внутрь закрытого Shadow DOM наших окон @keyframes документа НЕ проникают (проверено на живой
 * странице: анимаций 0). Поэтому fxWrap() после CPX.fx.apply копирует нужные правила (по именам из
 * --cpx-fx-an) в свой <style> окна — fxSync(). Остальные классы эффектов — в styles/ui-78-*.css
 * (копия правил page-55-effects.css; меняешь там — поменяй и там).
 *
 * API (CPX.emoteMenu; окно добавляет open/close/toggle/isOpen — см. 79_emote_menu_ui.js):
 *   .model({q, recent}) → {sections:[{id, title, nav, items | state+text, kind}], nav:[{id, tip, icon | avatar | item}],
 *                  all, byKey, q, results, twitch: состояние загрузки}
 *   .size(пункт) → {w, h} — размер показа как в чате · .learn(пункт, w, h) → true, если размер
 *   поменялся (узнали по картинке) · .urls(пункт) · .img(пункт, {size}) → <img>
 *   .recent() · .pushRecent(пункт) · .isFav(пункт) · .toggleFav(пункт) → true (стал избранным) |
 *   false (убран) | null (избранное заполнено) · .FAV_MAX
 *   .askSelf() — запросить свои личные 7TV (раз на канал) · .selfId() · .loadTwitch({force})
 *   .fx.state() · .fx.sig() — отпечаток состояния эффектов · .fx.rows(пункт | null) ·
 *   .fx.catalog() (вкладка) · .fx.recipe(имя, строки)
 *   .fx.pool() / .fx.pick(прежний?) — смайлик для предпросмотра · .fx.wrap(пункт, эффекты, {h, maxW}) ·
 *   .fx.sync(обёртка, <style>) · .fx.size(пункт, эффекты, {h, maxW}) → {w, h}
 */

CPX.emoteMenu = (() => {
  const log = CPX.log("emote-menu");
  const RECENT_KEY = "input.menuRecent";
  const FAV_KEY = "input.menuFav";
  const RECENT_MAX = 32;
  const FAV_MAX = 300;
  const PROVS = ["7tv", "bttv", "ffz"];
  const MAPKEY = { "7tv": "stv", bttv: "bttv", ffz: "ffz" };
  const SETTING = { "7tv": "emotes.stv", bttv: "emotes.bttv", ffz: "emotes.ffz" };
  const PNAME = { "7tv": "7TV", bttv: "BetterTTV", ffz: "FFZ", twitch: "Twitch" };
  const provOn = (p) => CPX.settings.get(SETTING[p]) !== false;
  // Наборы Twitch человека (78_emote_data_twitch). В мире Kick (15.11) их нет — разделов Twitch в меню нет.
  const TW = CPX.twitchEmoteSets || { sets: () => [], state: () => ({ status: "none" }), load: () => Promise.resolve(), on: () => () => {} };
  const MAX_H = 56; // выше — ужимаем (строка сетки не должна раздуваться)

  CPX.i18n.add({
    ru: {
      "emm.g.fav": "Избранное",
      "emm.g.recent": "Недавние",
      "emm.g.personal": "Личные 7TV",
      "emm.g.channel": "Канал",
      "emm.g.twitch": "Twitch",
      "emm.g.global": "Глобальные",
      "emm.s.channel": "{p} · канал {ch}",
      "emm.s.channelAnon": "{p} · канал",
      "emm.s.global": "{p} · глобальные",
      "emm.s.results": "Найдено",
      "emm.s.personal": "7TV · {name}",
      "emm.tw.current": "{name} · этот канал",
      "emm.tw.unlocked": "Разблокированные смайлики",
      "emm.tw.turbo": "Twitch Turbo",
      "emm.tw.prime": "Prime Gaming",
      "emm.tw.2fa": "Двухфакторная аутентификация",
      "emm.tw.global": "Twitch · глобальные",
      "emm.tw.loading": "Загружаем смайлики Twitch…",
      "emm.tw.error": "Смайлики Twitch не загрузились — откройте меню ещё раз чуть позже",
      "emm.empty.search": "Ничего не нашлось по «{q}»",
      "emm.empty.channel": "У канала нет смайликов 7TV, BetterTTV и FFZ",
      "emm.empty.nochat": "Чат канала ещё не открыт",
      "emm.empty.off": "Смайлики 7TV, BetterTTV и FFZ выключены в настройках",
      "emm.loading.channel": "Загружаем смайлики канала…",
      "emm.loading.global": "Загружаем глобальные смайлики…",
    },
    en: {
      "emm.g.fav": "Favorites",
      "emm.g.recent": "Recent",
      "emm.g.personal": "Personal 7TV",
      "emm.g.channel": "Channel",
      "emm.g.twitch": "Twitch",
      "emm.g.global": "Global",
      "emm.s.channel": "{p} · {ch}",
      "emm.s.channelAnon": "{p} · channel",
      "emm.s.global": "Global {p}",
      "emm.s.results": "Results",
      "emm.s.personal": "7TV · {name}",
      "emm.tw.current": "{name} · this channel",
      "emm.tw.unlocked": "Unlocked emotes",
      "emm.tw.turbo": "Twitch Turbo",
      "emm.tw.prime": "Prime Gaming",
      "emm.tw.2fa": "Two-factor authentication",
      "emm.tw.global": "Global Twitch",
      "emm.tw.loading": "Loading Twitch emotes…",
      "emm.tw.error": "Twitch emotes didn't load — reopen the menu a bit later",
      "emm.empty.search": "No emotes match “{q}”",
      "emm.empty.channel": "This channel has no 7TV, BetterTTV or FFZ emotes",
      "emm.empty.nochat": "The channel chat isn't open yet",
      "emm.empty.off": "7TV, BetterTTV and FFZ emotes are turned off in settings",
      "emm.loading.channel": "Loading channel emotes…",
      "emm.loading.global": "Loading global emotes…",
    },
  });

  const chat = () => CPX.chat.state || null;
  const chId = () => (chat() && chat().channelId) || "";
  const chLogin = () => (chat() && chat().login) || (CPX.route && CPX.route.login) || "";
  function me() {
    const st = chat();
    return (st && st.me) || (CPX.twitch && CPX.twitch.me()) || null; // мир Kick: себя не знаем (вход Kick не читаем)
  }

  // Для стенда: подменить данные/состояние разделов — только dev.
  //   channel / global: "loading" | "empty" | null;
  //   twitch: наборы как в ответе GraphQL [{id, owner:{id, login, displayName, profileImageURL}, emotes:[{id, token, type}]}];
  //   personal: Map имя → запись (старый вид) · personalSets: [{id, n, f, list:[записи]}].
  const devOverride = { channel: null, global: null, twitch: null, personal: null, personalSets: null };

  /* ── пункты и размеры ───────────────────────────────────────────────────── */

  function fromRec(rec, scope) {
    return { k: rec.p + ":" + rec.i, n: rec.n, p: rec.p, s: scope, rec, w: rec.w || 0, h: rec.h || 0, zw: !!rec.z, own: rec.o || "", base: rec.b || "" };
  }
  function fromTwitch(e, setTitle) {
    return { k: "twitch:" + e.id, n: e.token, p: "twitch", s: "twitch", tid: String(e.id), w: 0, h: 0, zw: false, own: "", set: setTitle || "", type: e.type || "" };
  }

  // Узнанные по картинке пропорции (BTTV без размера в API): ключ → w/h. На сессию страницы.
  const learned = new CPX.LRU(4000);

  /** Размер показа (px) — как в чате: известный 1x; Twitch 28×28; неизвестный — высота 28 и
   * узнанные пропорции (или квадрат). Слишком высокий — ужат до MAX_H. */
  function size(it) {
    if (it.p === "twitch") return { w: 28, h: 28 }; // коробка смайлика Twitch в чате (картинка — своего размера)
    let w = it.w;
    let h = it.h;
    if (!(w > 0 && h > 0)) {
      const r = learned.get(it.k);
      h = 28;
      w = r ? Math.max(8, Math.round(28 * r)) : 28;
    }
    if (h > MAX_H) {
      w = Math.max(1, Math.round((w * MAX_H) / h));
      h = MAX_H;
    }
    return { w, h };
  }
  /** Картинка пришла: запомнить пропорции смайлика без размера. true — размер поменялся. */
  function learn(it, nw, nh) {
    if (!it || it.w > 0 || it.p === "twitch" || !(nw > 0 && nh > 0)) return false;
    const r = Math.round((nw / nh) * 100) / 100;
    const was = learned.get(it.k);
    if (was && Math.abs(was - r) < 0.02) return false;
    learned.set(it.k, r);
    return !was ? Math.abs(r - 1) >= 0.05 : true;
  }

  /** Адреса картинки пункта {1,2,4} (уже проверенные CPX.safe.imgUrl). */
  function urls(it) {
    if (it.rec) return CPX.emotes.urls(it.rec);
    if (it.tid) {
      const u = CPX.emoteRender.twitchUrls(it.tid);
      return { 1: CPX.safe.imgUrl(u[1]), 2: CPX.safe.imgUrl(u[2]), 4: CPX.safe.imgUrl(u[4]) };
    }
    return {};
  }

  /** Первый кадр анимированного смайлика 7TV/BTTV {1,2,4} (null — не анимированный или другой
   * сервис): ~1 КБ против 30–90 КБ анимации. 🔴30.09 (замер на xqc: 966 смайликов 7TV, из них 664
   * анимированных, весь набор в 1x — 45,8 МБ): картинки меню шли с 7TV по 1–5 с, и при прокрутке
   * каждый новый экран снова стоял пустым. Теперь плитка сразу показывает первый кадр, анимация
   * встаёт на его место, когда пришла (79_emote_menu_ui fillEmote). ⚠️У НЕанимированных 7TV
   * «_static» нет (404) — их обычная картинка и так ~0,5 КБ. */
  function stillUrls(it) {
    const r = it.rec;
    if (!r || !r.a) return null;
    let u;
    if (r.p === "7tv") {
      const base = r.hu || "https://cdn.7tv.app/emote/" + r.i;
      const x = r.x || 4; // у старых смайликов бывает только до 3x
      const f = (s) => base + "/" + Math.min(s, x) + "x_static.webp";
      u = { 1: f(1), 2: f(2), 4: f(4) };
    } else if (r.p === "bttv") {
      const base = "https://cdn.betterttv.net/emote/" + r.i + "/static/";
      u = { 1: base + "1x.webp", 2: base + "2x.webp", 4: base + "3x.webp" };
    } else {
      return null;
    }
    const safe = { 1: CPX.safe.imgUrl(u[1]), 2: CPX.safe.imgUrl(u[2]), 4: CPX.safe.imgUrl(u[4]) };
    return safe[1] ? safe : null;
  }

  // Самая крупная картинка у Twitch и BTTV (и у старых 7TV) — 3x (как 57_emote_render).
  const density = (url) => (/(?:\/3\.0|\/3x(?:_static)?\.webp)$/.test(url) ? " 3x" : " 4x");
  function srcset(u) {
    if (!u[1]) return "";
    return u[1] + " 1x" + (u[2] && u[2] !== u[1] ? ", " + u[2] + " 2x" : "") + (u[4] && u[4] !== u[2] ? ", " + u[4] + density(u[4]) : "");
  }

  /** Размер показа в рамке box {w, h} с сохранением пропорций (подвал, предпросмотр). */
  function fit(it, box) {
    const s = size(it);
    const k = Math.min(box.w / s.w, box.h / s.h, 1.5);
    return { w: Math.max(1, Math.round(s.w * k)), h: Math.max(1, Math.round(s.h * k)) };
  }

  /** <img> пункта. o.size {w, h} — точный размер (плитка: как в чате); o.box — вписать в рамку;
   * у смайлика без известного размера — только высота (ширина по картинке). Картинки 7TV —
   * через CPX.imgRoute (прямо или зеркало PLUS, с очередью); не пришла совсем — onDead.
   * o.still — первый кадр (stillUrls; нет его — null); o.anchor — картинка грузится вне
   * документа, «на месте ли она» — по этой плитке (очередь зеркала не держит ушедшие); o.detached — вне документа и
   * без места (фоновая догрузка); o.prio — уровень очереди CPX.imgRoute (0 видимое, 1 анимации, 2 фоновое).
   * Подпись пустая (К7 правил 19.11: ни текста, ни значка «битой картинки» — имя у плитки в aria-label); onDead(img, why). */
  function img(it, o) {
    o = o || {};
    const u = o.still ? stillUrls(it) || {} : urls(it);
    if (!u[1]) return null;
    const im = document.createElement("img");
    im.className = o.className || "cpx-emm-img";
    im.alt = "";
    im.decoding = "async";
    im.draggable = false;
    const s = o.size || (o.box ? fit(it, o.box) : null);
    if (s) {
      const known = it.w > 0 && it.h > 0;
      // Twitch — картинкой своего размера (Kappa 25×28), как в чате; без размера — по высоте.
      if (known || learned.get(it.k)) im.width = s.w;
      if (it.p !== "twitch") im.height = s.h;
    }
    const set = srcset(u);
    const dead = (why) => o.onDead && CPX.safely("emote-menu:dead", () => o.onDead(im, typeof why === "string" ? why : "error"));
    const routed = CPX.imgRoute && CPX.imgRoute.load(im, u[1], set, dead, { anchor: o.anchor || null, detached: !!o.detached, prio: o.prio || 0 });
    if (!routed) {
      if (set) im.srcset = set;
      im.src = u[1];
      im.addEventListener("error", dead, { once: true });
    }
    return im;
  }

  /* ── наборы Twitch → разделы ────────────────────────────────────────────── */

  const GLOBAL_T = new Set(["GLOBALS", "SMILIES"]);
  const SUB_T = new Set(["SUBSCRIPTIONS", "BITS_BADGE_TIERS"]);

  // Чего больше всего среди смайликов набора (тип набора).
  function mainType(s) {
    const c = new Map();
    for (const e of s.emotes) c.set(e.type, (c.get(e.type) || 0) + 1);
    let best = "";
    let n = -1;
    for (const [t, k] of c) if (k > n) (best = t), (n = k);
    return best;
  }
  const has = (s, set) => s.emotes.some((e) => set.has(e.type));

  // Порядок видов: этот канал → подписки → фолловерские → хайп-трейн → события → разблокированные →
  // Turbo → Prime → 2FA → глобальные Twitch.
  const KIND_ORDER = { current: 0, sub: 1, follow: 2, hype: 3, event: 4, unlocked: 5, turbo: 6, prime: 7, "2fa": 8, twglobal: 9 };
  const KIND_TITLE = { unlocked: "emm.tw.unlocked", turbo: "emm.tw.turbo", prime: "emm.tw.prime", "2fa": "emm.tw.2fa", twglobal: "emm.tw.global" };
  const KIND_ICON = { unlocked: "emmUnlock", turbo: "emmBolt", prime: "emmCrown", "2fa": "shield", twglobal: "emmTwitch" };

  const twCache = { src: null, ch: "", lang: "", out: null };
  const TW_NONE = { sections: [], names: new Set() };
  /** Наборы Twitch человека → {sections, names}: разделы меню и имена его смайликов Twitch.
   * ⚠️Имена — только отсюда, НЕ из CPX.input.twitchTokens(): тот берёт все наборы провайдера, в
   * том числе подложенные расширениями BTTV/FFZ (стоят у многих — мы работаем поверх них), и тогда
   * все смайлики BTTV/FFZ считались бы «родными Twitch» и пропадали из меню. */
  function twitchData() {
    const src = devOverride.twitch ? devOverride.twitch : TW.sets();
    if (!Array.isArray(src) || !src.length) return TW_NONE;
    const ch = chId();
    const lang = CPX.i18n.lang;
    if (twCache.src === src && twCache.ch === ch && twCache.lang === lang) return twCache.out;
    const sets = devOverride.twitch ? devOverride.twitch.map((s) => Object.assign({}, s, { owner: s.owner ? { id: String(s.owner.id || ""), login: String(s.owner.login || ""), name: s.owner.displayName || s.owner.login, avatar: CPX.safe.imgUrl(s.owner.profileImageURL || "") } : null })) : src;
    const groups = new Map(); // ключ → {key, kind, title, avatar, icon, items, sub, follow, hype}
    const group = (key, init) => {
      let g = groups.get(key);
      if (!g) groups.set(key, (g = Object.assign({ key, items: [], sub: false, follow: false, hype: false }, init)));
      return g;
    };
    for (const s of sets) {
      if (!s || !Array.isArray(s.emotes) || !s.emotes.length) continue;
      const o = s.owner;
      let g;
      if (o && (o.id || o.login)) {
        g = group("o:" + (o.id || o.login), { title: o.name || o.login, avatar: o.avatar || "", cur: !!o.id && o.id === ch });
        if (has(s, SUB_T)) g.sub = true;
        else if (s.emotes.some((e) => e.type === "FOLLOWER")) g.follow = true;
        else if (s.emotes.some((e) => e.type === "HYPE_TRAIN")) g.hype = true;
      } else {
        const t = mainType(s);
        const kind = GLOBAL_T.has(t) ? "twglobal" : t === "TURBO" ? "turbo" : t === "PRIME" ? "prime" : t === "TWO_FACTOR" ? "2fa" : "unlocked";
        g = group("k:" + kind, { kind, title: CPX.t(KIND_TITLE[kind]), icon: KIND_ICON[kind] });
      }
      g.items.push(...s.emotes.map((e) => fromTwitch(e, g.title)));
    }
    const names = new Set();
    const seen = new Set();
    const list = [];
    for (const g of groups.values()) {
      if (!g.kind) g.kind = g.cur ? "current" : g.sub ? "sub" : g.follow ? "follow" : g.hype ? "hype" : "event";
      list.push(g);
    }
    const cmp = (a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
    list.sort(cmp);
    const sections = [];
    for (const g of list) {
      // Один смайлик в двух наборах — показываем в первом по порядку разделе.
      const items = [];
      for (const it of g.items) {
        if (seen.has(it.tid)) continue;
        seen.add(it.tid);
        names.add(it.n);
        it.set = g.title;
        items.push(it);
      }
      if (!items.length) continue;
      const title = g.kind === "current" ? CPX.t("emm.tw.current", { name: g.title }) : g.title;
      sections.push({ id: "tw:" + g.key.slice(0, 60), title, items: sortItems(items), kind: g.kind, nav: { id: "tw:" + g.key.slice(0, 60), tip: title, avatar: g.avatar || "", icon: g.icon || "emmTwitch" } });
    }
    const out = { sections, names };
    Object.assign(twCache, { src, ch, lang, out });
    return out;
  }

  /* ── свои личные смайлики 7TV ───────────────────────────────────────────── */

  // Один раз на канал спросить у косметики оформление самого человека: ответ придёт событием
  // cosm "change" с его id — меню пересоберётся. Сами, а не через подсказки поля ввода (76): там
  // это делается, только пока включены подсказки смайликов в поле.
  let askedSelf = "";
  function askSelf() {
    const m = me();
    const id = chId();
    if (!m || !m.id || !id || !provOn("7tv")) return;
    const key = m.id + "@" + id;
    if (key === askedSelf) return;
    askedSelf = key;
    CPX.safely("emote-menu:self", () => CPX.cosm.user(m.id, id));
  }
  const selfId = () => {
    const m = me();
    return m && m.id ? String(m.id) : "";
  };

  /** Личные наборы 7TV по отдельности: [{id, n: название, f: флаги, m: Map имя → запись}] в
   * порядке 51_cosmetics (сортирует model: личный — флаг 4 — первым, дальше по названию, как 7TV). */
  function personalSets() {
    const m = me();
    if (devOverride.personalSets) {
      return devOverride.personalSets.map((s) => ({ id: s.id, n: s.n, f: s.f, m: new Map((s.list || []).map((r) => [r.n, r])) }));
    }
    if (devOverride.personal) return [{ id: "personal", n: "", f: 4, m: devOverride.personal }];
    if (!m || !m.id || !provOn("7tv")) return [];
    if (typeof CPX.cosm.personalSets === "function") return CPX.cosm.personalSets(m.id);
    const one = CPX.cosm.personal(m.id);
    return one && one.size ? [{ id: "personal", n: "", f: 4, m: one }] : [];
  }

  /* ── недавние и избранное ───────────────────────────────────────────────── */

  // Список [{p, i, n}] из настройки (или своей свежей копии, пока фон не прислал изменение).
  function readList(raw, max) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    const seen = new Set();
    for (const r of raw) {
      if (!r || typeof r !== "object") continue;
      const p = String(r.p || "");
      const i = String(r.i || "");
      const n = String(r.n || "");
      if (!/^(7tv|bttv|ffz|twitch)$/.test(p) || !i || i.length > 80 || !n || n.length > 100) continue;
      const k = p + ":" + i;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ p, i, n, k });
      if (out.length >= max) break;
    }
    return out;
  }
  const entryOf = (it) => (it && it.p && (it.rec ? it.rec.i : it.tid) ? { p: it.p, i: String(it.rec ? it.rec.i : it.tid), n: it.n } : null);

  // Хранилище-список со своей свежей копией: пока фон не прислал сохранённое (или своё ещё не
  // отправлено) — читаем свою.
  function stored(key, max) {
    let local = null;
    let pending = null;
    const save = CPX.debounce(() => {
      const list = pending;
      pending = null;
      if (!list) return;
      CPX.settings.set(key, list).catch((e) => log.warn(key + " не сохранилось:", e && e.message));
    }, 600);
    CPX.settings.on(key, () => {
      if (!pending) local = null;
    });
    return {
      list: () => readList(local || CPX.settings.get(key), max),
      put(list) {
        local = list.slice(0, max).map((r) => ({ p: r.p, i: r.i, n: r.n }));
        pending = local;
        save();
      },
    };
  }
  const recentStore = stored(RECENT_KEY, RECENT_MAX);
  const favStore = stored(FAV_KEY, FAV_MAX);

  const recent = () => recentStore.list();
  function pushRecent(it) {
    const e = entryOf(it);
    if (!e) return;
    const k = e.p + ":" + e.i;
    recentStore.put([e].concat(recent().filter((r) => r.k !== k)));
  }

  let favKeys = null; // кэш ключей избранного для isFav (сбрасывается при изменении)
  const favList = () => favStore.list();
  function isFav(it) {
    if (!it) return false;
    if (!favKeys) favKeys = new Set(favList().map((r) => r.k));
    return favKeys.has(it.k);
  }
  /** Добавить/убрать из избранного; true — стал избранным, false — убран, null — избранное
   * заполнено (FAV_MAX), не добавлен: молча отрезать при сохранении нельзя — звёздочка горела бы,
   * а после перезагрузки смайлика в избранном не было бы. */
  function toggleFav(it) {
    const e = entryOf(it);
    if (!e) return false;
    const k = e.p + ":" + e.i;
    const cur = favList();
    const on = !cur.some((r) => r.k === k);
    if (on && cur.length >= FAV_MAX) return null;
    favStore.put(on ? cur.concat(e) : cur.filter((r) => r.k !== k));
    favKeys = null;
    return on;
  }
  CPX.settings.on(FAV_KEY, () => {
    favKeys = null;
  });

  /* ── модель меню ────────────────────────────────────────────────────────── */

  // Zero-width — первыми, дальше по ширине показа (как в чате), при равной — как было.
  function sortItems(items) {
    const w = items.map((it, i) => ({ it, i, z: it.zw ? 0 : 1, w: size(it).w }));
    w.sort((a, b) => a.z - b.z || a.w - b.w || a.i - b.i);
    return w.map((x) => x.it);
  }

  function model(opts) {
    const q = String((opts && opts.q) || "").trim().slice(0, 100);
    const twd = twitchData();
    const tw = twd.names; // родные смайлики Twitch человека (без подложенных BTTV/FFZ)
    const m = me();
    const id = chId();
    const anyOn = PROVS.some(provOn);
    const c = id && anyOn && devOverride.channel == null ? CPX.emotes.channel(id) : null;
    const G = CPX.emotes.global();
    const gLoaded = G && G.v !== -1 && devOverride.global == null;
    const psets = personalSets();
    const pers = new Map(); // все личные имена (первый набор важнее — как 51_cosmetics.personal)
    for (const s of psets) for (const [n, r] of s.m) if (!pers.has(n)) pers.set(n, r);
    const hidden = (n) => tw.has(n) || !!CPX.fx.bttv(n); // в чате окажется другим / это код эффекта
    const sections = [];
    const nav = [];

    // Личные 7TV — каждый набор своим разделом.
    const ps = psets.slice().sort((a, b) => ((b.f & 4) !== 0) - ((a.f & 4) !== 0) || String(a.n).localeCompare(String(b.n), undefined, { sensitivity: "base" }));
    ps.forEach((s, i) => {
      const items = [];
      for (const [n, r] of s.m) if (pers.get(n) === r && !hidden(n)) items.push(fromRec(r, "personal"));
      if (!items.length) return;
      const title = s.n ? CPX.t("emm.s.personal", { name: s.n }) : CPX.t("emm.g.personal");
      const sid = "ps:" + (s.id || i);
      const sorted = sortItems(items);
      sections.push({ id: sid, title, items: sorted, kind: "personal", nav: sid });
      // Значок в ленте — первый смайлик набора (наборы различимы глазом, не одним названием).
      nav.push({ id: sid, tip: title, icon: "logo7tv", item: sorted.find((x) => !x.zw) || sorted[0] });
    });

    // Канал.
    nav.push({ id: "channel", tip: CPX.t("emm.g.channel"), icon: "emmChannel" });
    const chSecs = [];
    if (!anyOn) chSecs.push({ id: "ch:off", state: "note", text: CPX.t("emm.empty.off") });
    else if (!id) chSecs.push({ id: "ch:none", state: "note", text: CPX.t("emm.empty.nochat") });
    else if (devOverride.channel === "empty") chSecs.push({ id: "ch:empty", state: "note", text: CPX.t("emm.empty.channel") });
    else if (!c) chSecs.push({ id: "ch:loading", state: "loading", text: CPX.t("emm.loading.channel") });
    else {
      const login = chLogin();
      for (const p of PROVS) {
        if (!provOn(p)) continue;
        const items = [];
        for (const [n, r] of c[MAPKEY[p]]) {
          if (c.merged.get(n) !== r || hidden(n) || pers.has(n)) continue;
          items.push(fromRec(r, "channel"));
        }
        if (items.length) {
          const title = login ? CPX.t("emm.s.channel", { p: PNAME[p], ch: login }) : CPX.t("emm.s.channelAnon", { p: PNAME[p] });
          chSecs.push({ id: "ch:" + p, title, items: sortItems(items) });
        }
      }
      if (!chSecs.length) chSecs.push({ id: "ch:empty", state: "note", text: CPX.t("emm.empty.channel") });
    }
    for (const s of chSecs) sections.push(Object.assign(s, { kind: "channel", nav: "channel", title: s.title || CPX.t("emm.g.channel") }));

    // Twitch (у анонима наборов нет — разделов тоже нет).
    const twSt = TW.state();
    if (twd.sections.length) {
      for (const s of twd.sections) {
        const n = s.nav;
        sections.push(Object.assign({}, s, { nav: n.id }));
        nav.push(n);
      }
    } else if (m && m.id && !devOverride.twitch && (twSt.status === "loading" || twSt.status === "none" || twSt.status === "error")) {
      const err = twSt.status === "error";
      sections.push({ id: "tw:state", kind: "twitch", nav: "tw:state", title: CPX.t("emm.g.twitch"), state: err ? "note" : "loading", text: CPX.t(err ? "emm.tw.error" : "emm.tw.loading") });
      nav.push({ id: "tw:state", tip: CPX.t("emm.g.twitch"), icon: "emmTwitch" });
    }

    // Глобальные.
    if (anyOn) {
      const gl = [];
      if (!gLoaded) gl.push({ id: "gl:loading", state: "loading", text: CPX.t("emm.loading.global") });
      else {
        for (const p of PROVS) {
          if (!provOn(p)) continue;
          const items = [];
          for (const [n, r] of G[MAPKEY[p]]) {
            if (G.merged.get(n) !== r || hidden(n) || pers.has(n) || (c && c.merged.has(n))) continue;
            items.push(fromRec(r, "global"));
          }
          if (items.length) gl.push({ id: "gl:" + p, title: CPX.t("emm.s.global", { p: PNAME[p] }), items: sortItems(items) });
        }
      }
      if (gl.length) {
        nav.push({ id: "global", tip: CPX.t("emm.g.global"), icon: "emmGlobe" });
        for (const s of gl) sections.push(Object.assign(s, { kind: "global", nav: "global", title: s.title || CPX.t("emm.g.global") }));
      }
    }

    // Все пункты по порядку разделов — для поиска, недавних, избранного и клавиатуры.
    const all = [];
    const byKey = new Map();
    for (const s of sections) {
      if (!s.items) continue;
      for (const it of s.items) {
        if (byKey.has(it.k)) continue;
        byKey.set(it.k, it);
        all.push(it);
      }
    }

    // Недавние и избранное — только те, что есть здесь и сейчас (смайлик другого канала сюда
    // не годится); сверху — избранное, под ним недавние.
    const pick = (list) => {
      const out = [];
      for (const r of list) {
        const it = byKey.get(r.k);
        if (it) out.push(it);
      }
      return out;
    };
    // opts.recent — снимок при открытии окна (в открытом окне «Недавние» не перестраиваются).
    const rec = pick(opts && Array.isArray(opts.recent) ? opts.recent : recent());
    if (rec.length) {
      sections.unshift({ id: "recent", kind: "recent", nav: "recent", title: CPX.t("emm.g.recent"), items: rec });
      nav.unshift({ id: "recent", tip: CPX.t("emm.g.recent"), icon: "clock" });
    }
    const fav = pick(favList());
    if (fav.length) {
      sections.unshift({ id: "fav", kind: "fav", nav: "fav", title: CPX.t("emm.g.fav"), items: sortItems(fav) });
      nav.unshift({ id: "fav", tip: CPX.t("emm.g.fav"), icon: "emmStar" });
    }

    let results = null;
    if (q) {
      const lq = q.toLowerCase();
      const hits = [];
      all.forEach((it, i) => {
        const ln = it.n.toLowerCase();
        const at = ln.indexOf(lq);
        let r = ln === lq ? 0 : at === 0 ? 1 : at > 0 ? 2 : -1;
        if (r < 0 && it.base && it.base.toLowerCase().indexOf(lq) >= 0) r = 3; // исходное имя 7TV
        if (r >= 0) hits.push({ it, r, i });
      });
      hits.sort((a, b) => a.r - b.r || a.i - b.i);
      results = hits.map((h) => h.it);
    }
    return { sections, nav, all, byKey, q, results, channelLoaded: !!c, globalLoaded: gLoaded, twitch: twSt.status };
  }

  /** Запросить наборы Twitch (кэш — в 78_emote_data_twitch). */
  const loadTwitch = (o) => (devOverride.twitch ? Promise.resolve() : TW.load(o));

  /* ── эффекты ────────────────────────────────────────────────────────────── */

  // Коды по эффекту из каталога 55_effects (единое место кодов).
  const CODE = { bttv: Object.create(null), ffz: Object.create(null), plus: Object.create(null) };
  for (const c of CPX.fx.CATALOG) if (!CODE[c.provider][c.effect]) CODE[c.provider][c.effect] = c.code;
  // Порядок строк — каталог клиента (emoteEffectCatalog): BTTV, затем FFZ.
  const BTTV_ORDER = CPX.fx.CATALOG.filter((c) => c.provider === "bttv").map((c) => c.effect);
  const FFZ_FREE = CPX.fx.CATALOG.filter((c) => c.provider === "ffz" && !c.requires).map((c) => c.effect);
  const PAID = CPX.fx.CATALOG.filter((c) => c.provider === "ffz" && c.requires).map((c) => c.effect);

  function fxState() {
    const m = me();
    const plus = !!(CPX.account && CPX.account.plusActive());
    const ffzSub = !!(m && m.login && CPX.emotes.ffzPaid(m.login));
    return {
      on: CPX.settings.get("emotes.effects") !== false,
      plus,
      ffzSub,
      usePlus: plus && !ffzSub, // клиент: usePlusForPaid
      unlocked: plus || ffzSub,
      bttv: provOn("bttv"),
      ffzOn: provOn("ffz"),
      ffzReady: !!CPX.emotes.ffzMod("ffzX", chId()), // данные FFZ-эффектов пришли
    };
  }
  // Отпечаток того, от чего зависят строки эффектов: сменился — виды эффектов пересобрать
  // (переподключение сокета или вход без смены подписок — не повод).
  const fxSig = () => {
    const s = fxState();
    return [s.on, s.plus, s.ffzSub, s.bttv, s.ffzOn, s.ffzReady].map(Number).join("");
  };

  const ffzHas = (code) => !!code && !!CPX.emotes.ffzMod(code, chId());

  function paidRow(e, st) {
    if (st.usePlus && CODE.plus[e]) return { effect: e, code: CODE.plus[e], src: "plus", group: "paid", plusOnly: true };
    const f = CODE.ffz[e];
    if (!f) return null;
    if (st.unlocked && !ffzHas(f)) return null; // поддержавший FFZ без данных FFZ — код не сработает
    return { effect: e, code: f, src: "ffz", group: "paid", locked: !st.unlocked };
  }

  /** Строки эффектов для смайлика (правый щелчок): одна строка на эффект. */
  function fxRows(it) {
    const st = fxState();
    const twitch = !!(it && it.p === "twitch");
    const rows = [];
    const seen = new Set();
    const put = (r) => r && !seen.has(r.effect) && (seen.add(r.effect), rows.push(r));
    // По каталогу клиента: код BTTV, если применим (не Twitch и BTTV включён); неприменимый —
    // пропускаем, эффект возьмёт строка FFZ дальше по каталогу (если данные FFZ есть).
    for (const c of CPX.fx.CATALOG) {
      if (c.provider === "plus" || seen.has(c.effect)) continue;
      if (c.provider === "bttv") {
        if (!twitch && st.bttv) put({ effect: c.effect, code: c.code, src: "bttv", group: "bttv" });
      } else if (c.requires) put(paidRow(c.effect, st));
      else if (ffzHas(c.code)) put({ effect: c.effect, code: c.code, src: "ffz", group: "ffz" });
    }
    return rows;
  }

  /** Вкладка «Эффекты» (без смайлика): разделы как у клиента — BTTV, FFZ, платные. */
  function fxCatalog() {
    const st = fxState();
    const out = [];
    if (st.bttv) out.push({ id: "bttv", rows: BTTV_ORDER.map((e) => ({ effect: e, code: CODE.bttv[e], src: "bttv", group: "bttv" })) });
    const free = FFZ_FREE.filter((e) => ffzHas(CODE.ffz[e])).map((e) => ({ effect: e, code: CODE.ffz[e], src: "ffz", group: "ffz" }));
    if (free.length) out.push({ id: "ffz", rows: free });
    const paid = PAID.map((e) => paidRow(e, st)).filter(Boolean);
    if (paid.length) out.push({ id: "paid", rows: paid });
    return out;
  }

  /** Запись для чата: наши коды и коды BTTV — перед именем, FFZ — после (один код на эффект). */
  function recipe(name, rows) {
    const pre = [];
    const bt = [];
    const post = [];
    for (const r of rows || []) {
      if (!r || !r.code || r.locked) continue;
      const to = r.src === "plus" ? pre : r.src === "bttv" ? bt : post;
      if (!to.includes(r.code)) to.push(r.code);
    }
    return pre.concat(bt, [name], post).join(" ");
  }

  /** Смайлики для предпросмотра: канал (7TV, BTTV, FFZ) → глобальные → Twitch (как клиент);
   * сами модификаторы и смайлики нулевой ширины не годятся. */
  function fxPool() {
    const mdl = model({});
    const pick = (scope) => mdl.all.filter((it) => it.s === scope && !it.zw && !(it.rec && it.rec.m));
    // Нагляднее — смайлик обычных пропорций (сверхширокий в колонке предпросмотра мелок); такие
    // есть — выбираем из них.
    const plain = (a) => {
      const b = a.filter((it) => it.w > 0 && it.h > 0 && it.w / it.h >= 0.6 && it.w / it.h <= 1.8);
      return b.length >= 5 ? b : a;
    };
    const chan = plain(pick("channel"));
    const glob = plain(pick("global").concat(pick("personal")));
    return { third: chan.length ? chan : glob, twitch: pick("twitch") };
  }

  /** Случайный смайлик для предпросмотра: {third, any} — third для кодов BTTV (не Twitch). */
  function fxPick(prev) {
    const p = fxPool();
    const rnd = (a) => {
      if (!a.length) return null;
      if (a.length === 1) return a[0];
      let x;
      do x = a[Math.floor(Math.random() * a.length)];
      while (prev && x.k === prev.k);
      return x;
    };
    const third = rnd(p.third);
    return { third, any: third || rnd(p.twitch) };
  }

  /* ── живой предпросмотр ─────────────────────────────────────────────────── */

  const maskOf = (effects) => (effects || []).reduce((m, e) => m | (CPX.fx.BITS[e] || 0), 0);

  /** Размер места со всеми эффектами при высоте h, не шире maxW (как клиент: PREVIEW_MAX_WIDTH). */
  function fxSize(aspect, effects, o) {
    let h = o.h;
    const m = maskOf(effects);
    let t = CPX.fx.targetSize(aspect * h, h, m);
    if (o.maxW && t.w > o.maxW) {
      h = (h * o.maxW) / t.w;
      t = CPX.fx.targetSize(aspect * h, h, m);
    }
    return { w: t.w, h: t.h, base: { w: aspect * h, h } };
  }

  /** Обёртка смайлика с эффектами (живыми). style — <style> окна, куда копировать кадры. */
  function fxWrap(it, effects, o) {
    const wrap = document.createElement("span");
    wrap.className = "cpx-emm-em";
    const im = img(it, { className: "cpx-emm-em__img" });
    if (!im) {
      wrap.classList.add("cpx-emm-em--text");
      wrap.textContent = it.n;
      return wrap;
    }
    wrap.appendChild(im);
    const known = it.w > 0 && it.h > 0;
    const fx = Array.isArray(effects) ? effects : [];
    const go = (aspect) => {
      const s = fxSize(aspect, fx, o);
      // Место и картинка — сразу (строка не прыгает); эффекты уточнят место сами.
      wrap.style.width = Math.round(s.w) + "px";
      wrap.style.height = Math.round(s.h) + "px";
      im.style.width = Math.round(s.base.w) + "px";
      im.style.height = Math.round(s.base.h) + "px";
      if (!fx.length) return;
      CPX.safely("emote-menu:fx", () => {
        CPX.fx.apply(wrap, fx, { w: s.base.w, h: s.base.h });
        if (o.style) fxSync(wrap, o.style);
      });
    };
    const natural = () => (im.naturalWidth > 0 && im.naturalHeight > 0 ? im.naturalWidth / im.naturalHeight : known ? it.w / it.h : 1);
    go(known ? it.w / it.h : 1);
    // У BTTV и Twitch пропорции знает только картинка; бегущей дорожке (ffzSlide) нужен адрес
    // уже загруженной картинки — пересчитать, когда она придёт.
    if (!known || fx.includes("slide")) {
      if (im.complete && im.naturalWidth) go(natural());
      else im.addEventListener("load", () => go(natural()), { once: true });
    }
    return wrap;
  }

  // Копирование ключевых кадров эффектов из документа в <style> нашего окна (см. шапку).
  // ⚠️Опора на внутренности 55_effects (лист <style id="cpx-effects">, имена в --cpx-fx-an):
  // поменяются там — предпросмотр замрёт; чтобы это не прошло молча — одно предупреждение в журнал.
  let kfWarned = false;
  const kfWarn = (why) => kfWarned || ((kfWarned = true), log.warn("предпросмотр эффектов без движения:", why));
  function fxSync(wrap, style) {
    const names = String(wrap.style.getPropertyValue("--cpx-fx-an") || "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s && s !== "none");
    if (!names.length) return;
    const have = style.__cpxKf || (style.__cpxKf = new Set());
    const want = names.filter((n) => !have.has(n));
    if (!want.length) return;
    const src = document.getElementById("cpx-effects");
    const sheet = src && src.sheet;
    if (!style.sheet) return;
    if (!sheet) return kfWarn("нет листа #cpx-effects");
    for (const rule of sheet.cssRules) {
      if (rule.type !== 7 /* KEYFRAMES_RULE */ || !want.includes(rule.name) || have.has(rule.name)) continue;
      try {
        style.sheet.insertRule(rule.cssText, style.sheet.cssRules.length);
        have.add(rule.name);
      } catch (e) {
        CPX.report("emote-menu:kf", e);
      }
    }
    const lost = want.filter((n) => !have.has(n));
    if (lost.length) kfWarn("в #cpx-effects нет кадров " + lost.slice(0, 3).join(", "));
  }

  CPX.diag.add("emoteMenu", () => {
    const m = model({});
    return {
      sections: m.sections.map((s) => s.id + ":" + (s.items ? s.items.length : s.state)),
      all: m.all.length,
      recent: recent().length,
      fav: favList().length,
      twitch: m.twitch,
      fx: fxState(),
    };
  });

  return {
    model,
    size,
    learn,
    urls,
    stillUrls,
    img,
    recent,
    pushRecent,
    isFav,
    toggleFav,
    FAV_MAX,
    askSelf,
    selfId,
    loadTwitch,
    PNAME,
    fx: { state: fxState, sig: fxSig, rows: fxRows, catalog: fxCatalog, recipe, pool: fxPool, pick: fxPick, wrap: fxWrap, sync: fxSync, size: fxSize, mask: maskOf },
    _devOverride: CPX.dev ? devOverride : null,
  };
})();

// ── src/main/79_emote_menu_fx.js ──
/* Меню смайликов Chatterino+ — часть 2: виды эффектов (вкладка «Эффекты» и эффекты для
 * выбранного смайлика по правому щелчку). Данные и правила — 78_emote_menu_data.js, окно —
 * 79_emote_menu_ui.js (оно же решает, куда вставлять и когда закрываться).
 *
 * Как в клиенте (research/04 §3.4, память «Интерфейс», «Вкладка Эффекты стала рабочей», «Меню
 * эффектов теперь ЖИВОЕ»):
 *  • строка: живой предпросмотр (в колонке общей ширины — названия не пляшут) | название | код
 *    справа моноширинным приглушённым; запертые (платные без подписки) приглушены, но ДВИЖУТСЯ —
 *    по ним человек решает, нужна ли подписка; «+код» подписчика PLUS — с пометкой PLUS («увидят
 *    только в Chatterino+»);
 *  • вкладка «Эффекты»: предпросмотр на случайном смайлике канала, один раз на открытие (иначе
 *    эффекты не сравнить между собой), кнопка «другой смайлик»; для кодов BTTV — только сторонний
 *    смайлик (на Twitch они не работают); щелчок кладёт код в поле;
 *  • правый щелчок по смайлику: строки с галочками, предпросмотр НА ЭТОМ смайлике, сверху —
 *    итог со всеми выбранными эффектами и готовая запись; «Вставить» кладёт запись в поле.
 * Клавиатура: ↑↓ — по строкам, Enter — выбрать (во вкладке) / вставить (у смайлика), пробел —
 * галочка, ← или Backspace — назад. ⚠️CPX.ui здесь есть только во время работы (файл 79 склеен
 * раньше 95–98) — на верхнем уровне его не трогать.
 *
 * API: CPX.emoteMenu.views.catalog({style, preview, q, onPick(row, e), onShuffle(), onHover(row|null)})
 *        → {el, key(e) → bool, filter(q), rows, scroller}
 *      CPX.emoteMenu.views.item({style, item, selected, onInsert(text, e, item), onBack()})
 *        → {el, item, scroller, key(e), focus(kb), selected(), text()}
 *      selected — отмеченные эффекты при пересборке вида; scroller — что прокручивается (для
 *      сохранения места при пересборке).
 */

(() => {
  const EM = CPX.emoteMenu;
  const PREVIEW_H = 24; // высота смайлика в строке (клиент: 22)
  const PREVIEW_MAX_W = 88; // потолок ширины: «вчетверо шире» не разносит окно (клиент: 88)
  const STAGE_H = 32; // смайлик в заготовке «эффекты для смайлика»
  const STAGE_MAX_W = 130;

  CPX.i18n.add({
    ru: {
      "emm.fx.previewOn": "Предпросмотр на",
      "emm.fx.shuffle": "Другой смайлик",
      "emm.fx.noPreview": "Нет смайлика для предпросмотра — эффекты показаны кодами",
      "emm.fx.sec.bttv": "BetterTTV",
      "emm.fx.sec.ffz": "FrankerFaceZ",
      "emm.fx.sec.paidPlus": "Эффекты подписчиков · PLUS",
      "emm.fx.sec.paidFfz": "Эффекты подписчиков · FrankerFaceZ",
      "emm.fx.sec.paidNone": "Эффекты подписчиков · PLUS (нужна подписка)",
      "emm.fx.plusOnly": "Этот код увидят только в Chatterino+",
      "emm.fx.locked": "Нужна подписка PLUS или поддержка FrankerFaceZ",
      "emm.fx.hint": "Код встанет у курсора. Смайлик ставьте с любой стороны — при отправке порядок выправится",
      "emm.fx.loading": "Эффекты смайликов ещё загружаются",
      "emm.fx.off": "Смайлики BetterTTV и FFZ выключены в настройках — их эффекты недоступны",
      "emm.fx.offNote": "BetterTTV и FFZ выключены в настройках — доступны только эффекты PLUS",
      "emm.fx.ffzLoading": "Эффекты FrankerFaceZ ещё загружаются",
      "emm.fx.noMatch": "Нет эффектов по «{q}»",
      "emm.fx.for": "Эффекты для {name}",
      "emm.fx.back": "Назад",
      "emm.fx.insert": "Вставить",
      "emm.fx.reset": "Сбросить",
      "emm.fx.pick": "Отметьте эффекты — запись появится здесь",
      "emm.fx.twitchNote": "Смайлик Twitch: коды BetterTTV на нём не работают — только FFZ и наши",
      "emm.fx.none": "Для этого смайлика эффектов нет",
      "emm.fx.check": "Отметить",
    },
    en: {
      "emm.fx.previewOn": "Preview on",
      "emm.fx.shuffle": "Another emote",
      "emm.fx.noPreview": "No emote to preview — effects are shown as codes",
      "emm.fx.sec.bttv": "BetterTTV",
      "emm.fx.sec.ffz": "FrankerFaceZ",
      "emm.fx.sec.paidPlus": "Subscriber effects · PLUS",
      "emm.fx.sec.paidFfz": "Subscriber effects · FrankerFaceZ",
      "emm.fx.sec.paidNone": "Subscriber effects · PLUS (subscription required)",
      "emm.fx.plusOnly": "Only Chatterino+ users will see this code",
      "emm.fx.locked": "Needs a PLUS subscription or FrankerFaceZ support",
      "emm.fx.hint": "The code goes at the cursor. Put the emote on either side — the order is fixed on send",
      "emm.fx.loading": "Emote effects are still loading",
      "emm.fx.off": "BetterTTV and FFZ emotes are turned off in settings — their effects are unavailable",
      "emm.fx.offNote": "BetterTTV and FFZ are turned off in settings — only PLUS effects are available",
      "emm.fx.ffzLoading": "FrankerFaceZ effects are still loading",
      "emm.fx.noMatch": "No effects match “{q}”",
      "emm.fx.for": "Effects for {name}",
      "emm.fx.back": "Back",
      "emm.fx.insert": "Insert",
      "emm.fx.reset": "Reset",
      "emm.fx.pick": "Tick effects — the chat text appears here",
      "emm.fx.twitchNote": "Twitch emote: BetterTTV codes don't work on it — only FFZ and ours",
      "emm.fx.none": "No effects for this emote",
      "emm.fx.check": "Toggle",
    },
  });

  const el = (tag, attrs, kids) => CPX.el(tag, attrs, kids);
  // Фокус внутри закрытого Shadow DOM: getRootNode() отдаёт теневой корень и в режиме closed.
  const focusIn = (box) => {
    const r = box && box.getRootNode && box.getRootNode();
    const a = r && r.activeElement;
    return !!a && box.contains(a);
  };
  const focus = (x) => x && x.isConnected && x.focus({ preventScroll: true });

  /** Предпросмотр строки: смайлик с эффектом или код (нет смайлика). */
  function previewOf(it, row, style, h, maxW) {
    if (!it) return el("span", { class: "cpx-emm-fxcode-chip cpx-k1", text: row.code });
    return EM.fx.wrap(it, [row.effect], { h, maxW, style });
  }

  /** Ширина колонки предпросмотра — самая широкая строка (клиент: previewColumn). */
  function columnWidth(rows, pick, maxW) {
    maxW = maxW || PREVIEW_MAX_W;
    let w = 0;
    for (const r of rows) {
      const it = pick(r);
      if (!it) {
        w = Math.max(w, 8 * r.code.length + 14);
        continue;
      }
      const a = it.w > 0 && it.h > 0 ? it.w / it.h : 1;
      w = Math.max(w, EM.fx.size(a, [r.effect], { h: PREVIEW_H, maxW }).w);
    }
    return Math.ceil(Math.min(maxW, Math.max(PREVIEW_H, w)));
  }

  // Колонка значка (PLUS / замок) — одной ширины во всём списке, код за ней — тоже колонкой
  // (ширина по самому длинному коду, в знаках моноширинного шрифта): значки стоят ровно друг под
  // другом, как в клиенте, а не скачут за кодами разной длины.
  // У эффектов смайлика (строки с галочками) замок стоит в клетке галочки — отдельная колонка
  // под него съедала место названий (noLock).
  function badgeCell(row, noLock) {
    const cell = el("span", { class: "cpx-emm-fxbadge" });
    if (row.plusOnly) cell.appendChild(el("span", { class: "cpx-emm-plus cpx-k1", text: "PLUS", "data-cpx-tip": CPX.t("emm.fx.plusOnly") }));
    else if (row.locked && !noLock) cell.appendChild(lockIcon());
    return cell;
  }
  function lockIcon() {
    const lock = el("span", { class: "cpx-emm-lock", "data-cpx-tip": CPX.t("emm.fx.locked") });
    lock.appendChild(CPX.ui.icon("emmLock", 14));
    return lock;
  }
  function columns(box, rows, noLock) {
    const badges = rows.some((r) => r.plusOnly || (r.locked && !noLock));
    box.classList.toggle("cpx-emm-fxcols--badge", badges);
    box.style.setProperty("--cpx-emm-cw", String(rows.reduce((n, r) => Math.max(n, r.code.length), 2)));
  }

  // Подпись платного раздела — четыре случая по просьбе владельца (клиент: EmotePopup::reloadEffects):
  // есть PLUS → «PLUS» (даже если есть и поддержка FFZ — коды тогда FFZ); только FFZ →
  // «FrankerFaceZ»; ни того ни другого → «PLUS (нужна подписка)».
  const paidTitle = (st) => CPX.t(st.plus ? "emm.fx.sec.paidPlus" : st.ffzSub ? "emm.fx.sec.paidFfz" : "emm.fx.sec.paidNone");

  // Пояснение над строками: оба сервиса выключены / FFZ ещё не загрузился.
  function stateNote(st) {
    const k = !st.bttv && !st.ffzOn ? "emm.fx.offNote" : st.ffzOn && !st.ffzReady ? "emm.fx.ffzLoading" : "";
    return k ? el("div", { class: "cpx-emm-fxnote cpx-mz cpx-k1 cpx-t-well", text: CPX.t(k) }) : null;
  }

  // Строки — кнопки; ↑↓ ходят по ним, активная видна и без фокуса (фокус может быть в поиске).
  function rowNav(list, onActivate) {
    let act = -1;
    const vis = () => list.filter((b) => !b.hidden);
    function set(b) {
      for (const x of list) x.classList.toggle("cpx-act", x === b);
      act = list.indexOf(b);
      if (b) b.scrollIntoView({ block: "nearest" });
    }
    return {
      move(d) {
        const v = vis();
        if (!v.length) return;
        const cur = v.indexOf(list[act]);
        set(v[cur < 0 ? (d > 0 ? 0 : v.length - 1) : Math.max(0, Math.min(v.length - 1, cur + d))]);
      },
      edge(last) {
        const v = vis();
        if (v.length) set(v[last ? v.length - 1 : 0]);
      },
      activate(e) {
        const b = list[act];
        if (!b || b.hidden) return false;
        onActivate(b, e);
        return true;
      },
      current: () => (act >= 0 && !list[act].hidden ? list[act] : null),
      set,
      reset: () => set(null),
    };
  }

  /* ── вкладка «Эффекты» ────────────────────────────────────────────────────── */

  function catalog(o) {
    const st = EM.fx.state();
    const root = el("div", { class: "cpx-emm-fx", role: "listbox", "aria-label": CPX.t("emm.fx.tab") });
    const pv = o.preview || { third: null, any: null };
    const secs = EM.fx.catalog();
    const rows = [];

    // Шапка: на каком смайлике показываем + «другой смайлик».
    const head = el("div", { class: "cpx-emm-fxhead" });
    if (pv.any) {
      head.appendChild(el("span", { class: "cpx-emm-fxhead__label", text: CPX.t("emm.fx.previewOn") }));
      head.appendChild(EM.fx.wrap(pv.any, [], { h: 20, maxW: 60 }));
      head.appendChild(el("span", { class: "cpx-emm-fxhead__name", text: pv.any.n }));
      const sh = CPX.ui.iconButton({ icon: "refresh", size: "sm", label: CPX.t("emm.fx.shuffle"), className: "cpx-emm-fxhead__btn", onClick: () => o.onShuffle && o.onShuffle() });
      head.appendChild(sh);
    } else head.appendChild(el("span", { class: "cpx-emm-fxhead__label", text: CPX.t("emm.fx.noPreview") }));
    root.appendChild(head);

    // Строк нет совсем: оба сервиса выключены (и платные не открыты) — так и сказать; иначе
    // данные ещё в пути (как клиент: «Эффекты ещё загружаются»).
    if (!secs.length) {
      root.appendChild(el("div", { class: "cpx-emm-fxempty", text: CPX.t(!st.bttv && !st.ffzOn ? "emm.fx.off" : "emm.fx.loading") }));
      return { el: root, key: () => false, filter() {}, rows };
    }
    const note = stateNote(st);
    if (note) root.appendChild(note);

    const pick = (r) => (r.src === "bttv" ? pv.third : pv.any);
    const all = [];
    for (const s of secs) all.push(...s.rows);
    const colW = columnWidth(all, pick, o.maxW);
    root.style.setProperty("--cpx-emm-pw", colW + "px");
    columns(root, all);

    const titles = [];
    for (const s of secs) {
      const title = s.id === "paid" ? paidTitle(st) : CPX.t("emm.fx.sec." + s.id);
      const t = el("div", { class: "cpx-emm-fxsec" + (s.id === "paid" && !st.unlocked ? " cpx-emm-fxsec--locked" : ""), text: title });
      titles.push({ t, rows: [] });
      root.appendChild(t);
      for (const r of s.rows) {
        const name = CPX.fx.title(r.effect);
        const b = el("button", { type: "button", class: "cpx-emm-fxrow cpx-mz cpx-k1" + (r.locked ? " cpx-emm-fxrow--locked" : ""), role: "option", tabindex: "-1", "aria-label": name + " " + r.code });
        b._row = r;
        b._q = (name + " " + r.code).toLowerCase();
        const col = el("span", { class: "cpx-emm-fxprev" });
        col.appendChild(previewOf(pick(r), r, o.style, PREVIEW_H, o.maxW || PREVIEW_MAX_W));
        b.appendChild(col);
        b.appendChild(el("span", { class: "cpx-emm-fxname", text: name }));
        b.appendChild(badgeCell(r));
        b.appendChild(el("span", { class: "cpx-emm-fxcode", text: r.code }));
        root.appendChild(b);
        rows.push(b);
        titles[titles.length - 1].rows.push(b);
      }
    }
    const empty = el("div", { class: "cpx-emm-fxempty", hidden: true });
    root.appendChild(empty);

    const nav = rowNav(rows, (b, e) => o.onPick && o.onPick(b._row, e));
    root.addEventListener("click", (e) => {
      const b = e.target.closest && e.target.closest(".cpx-emm-fxrow");
      if (!b || !root.contains(b)) return;
      nav.set(b);
      if (o.onPick) o.onPick(b._row, e);
    });
    root.addEventListener("mouseover", (e) => {
      const b = e.target.closest && e.target.closest(".cpx-emm-fxrow");
      if (o.onHover) o.onHover(b && root.contains(b) ? b._row : null);
    });
    root.addEventListener("mouseleave", () => o.onHover && o.onHover(null));

    function filter(q) {
      q = String(q || "").trim().toLowerCase();
      let n = 0;
      for (const x of titles) {
        let any = false;
        for (const b of x.rows) {
          b.hidden = !!q && b._q.indexOf(q) < 0;
          if (!b.hidden) any = true;
        }
        x.t.hidden = !any;
        if (any) n++;
      }
      empty.hidden = n > 0;
      if (!n) empty.textContent = CPX.t("emm.fx.noMatch", { q });
      const cur = nav.current();
      if (!cur) nav.reset();
      if (q) nav.edge(false);
    }
    if (o.q) filter(o.q);

    function key(e) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        nav.move(e.key === "ArrowDown" ? 1 : -1);
        return true;
      }
      if (e.key === "Enter" && !e.isComposing) return nav.activate(e);
      return false;
    }
    return { el: root, key, filter, rows, scroller: root };
  }

  /* ── эффекты для выбранного смайлика ─────────────────────────────────────── */

  function item(o) {
    const it = o.item;
    const rows = EM.fx.rows(it);
    const st = EM.fx.state();
    // Выбор переживает пересборку вида (сменилась подписка) — кроме строк, что стали заперты.
    const sel = new Set((o.selected || []).filter((e) => rows.some((r) => r.effect === e && !r.locked)));
    const root = el("div", { class: "cpx-emm-item" });

    const back = CPX.ui.iconButton({ icon: "arrowLeft", label: CPX.t("emm.fx.back"), tip: false, onClick: () => o.onBack && o.onBack() });
    const title = el("div", { class: "cpx-emm-item__title" });
    const pre = CPX.t("emm.fx.for", { name: "\u0000" }).split("\u0000");
    title.append(pre[0] || "", el("b", { text: it.n }), pre[1] || "");
    root.appendChild(el("div", { class: "cpx-emm-item__head" }, [back, title]));

    // Заготовка — одной полосой: смайлик со всеми выбранными эффектами слева, запись справа
    // (столбиком она съедала треть окна — строк было видно меньше половины).
    const stageEm = el("div", { class: "cpx-emm-stage__em" });
    const recipeEl = el("div", { class: "cpx-emm-stage__text" });
    const info = el("div", { class: "cpx-emm-stage__info" }, [recipeEl]);
    if (it.p === "twitch") info.appendChild(el("div", { class: "cpx-emm-stage__note", text: CPX.t("emm.fx.twitchNote") }));
    root.appendChild(el("div", { class: "cpx-emm-stage cpx-mz cpx-k1 cpx-t-well" }, [stageEm, info]));

    // Список сам принимает фокус: открыли мышью — фокус на нём, без кольца на первой строке
    // (кольцо рядом с подсветкой под мышью давало две «выбранные» строки).
    const list = el("div", { class: "cpx-emm-item__list", role: "group", tabindex: "-1", "aria-label": CPX.t("emm.fx.for", { name: it.n }) });
    const btns = [];
    const colW = columnWidth(rows, () => it, o.maxW);
    list.style.setProperty("--cpx-emm-pw", colW + "px");
    columns(list, rows, true);
    const note = rows.length ? stateNote(st) : null;
    if (note) list.appendChild(note);
    let paidShown = false;
    for (const r of rows) {
      if (r.group === "paid" && !paidShown) {
        // Платные — отдельным заголовком: чем открываются (или что нужна подписка).
        paidShown = true;
        list.appendChild(el("div", { class: "cpx-emm-fxsec" + (st.unlocked ? "" : " cpx-emm-fxsec--locked"), text: paidTitle(st) }));
      }
      const name = CPX.fx.title(r.effect);
      const b = el("button", { type: "button", class: "cpx-emm-fxrow cpx-mz cpx-k1 cpx-emm-fxrow--check" + (r.locked ? " cpx-emm-fxrow--locked" : ""), role: "checkbox", "aria-checked": "false", "aria-label": name + " " + r.code, tabindex: "-1" });
      b._row = r;
      if (r.locked) b.appendChild(lockIcon());
      else {
        // Галочка — квадрат из клеток, отметка — светлая клетка (CSS), без значка.
        b.appendChild(el("span", { class: "cpx-emm-check", "aria-hidden": "true" }));
      }
      const col = el("span", { class: "cpx-emm-fxprev" });
      col.appendChild(previewOf(it, r, o.style, PREVIEW_H, o.maxW || PREVIEW_MAX_W));
      b.appendChild(col);
      b.appendChild(el("span", { class: "cpx-emm-fxname", text: name }));
      b.appendChild(badgeCell(r, true));
      b.appendChild(el("span", { class: "cpx-emm-fxcode", text: r.code }));
      list.appendChild(b);
      btns.push(b);
    }
    if (!rows.length) list.appendChild(el("div", { class: "cpx-emm-fxempty", text: CPX.t(!st.bttv && !st.ffzOn ? "emm.fx.off" : "emm.fx.none") }));
    root.appendChild(list);

    const reset = CPX.ui.button({ label: CPX.t("emm.fx.reset"), kind: "ghost", size: "sm", onClick: () => (sel.clear(), paint()) });
    const insert = CPX.ui.button({ label: CPX.t("emm.fx.insert"), kind: "primary", size: "sm", onClick: (e) => doInsert(e) });
    root.appendChild(el("div", { class: "cpx-emm-item__foot" }, [reset, insert]));

    const chosen = () => rows.filter((r) => sel.has(r.effect));
    const text = () => EM.fx.recipe(it.n, chosen());
    function paint() {
      for (const b of btns) {
        const on = sel.has(b._row.effect);
        b.setAttribute("aria-checked", on ? "true" : "false");
        b.classList.toggle("cpx-on", on);
      }
      stageEm.textContent = "";
      stageEm.appendChild(EM.fx.wrap(it, [...sel], { h: STAGE_H, maxW: STAGE_MAX_W, style: o.style }));
      recipeEl.textContent = sel.size ? text() : CPX.t("emm.fx.pick");
      recipeEl.classList.toggle("cpx-emm-stage__text--dim", !sel.size);
      reset.setDisabled(!sel.size);
    }
    function toggle(b) {
      const r = b._row;
      if (r.locked) {
        CPX.ui.toast({ text: CPX.t("emm.fx.locked"), kind: "info" });
        return;
      }
      if (sel.has(r.effect)) sel.delete(r.effect);
      else sel.add(r.effect);
      paint();
    }
    function doInsert(e) {
      if (o.onInsert) o.onInsert(sel.size ? text() : it.n, e, it);
    }
    const nav = rowNav(btns, (b) => toggle(b));
    list.addEventListener("click", (e) => {
      const b = e.target.closest && e.target.closest(".cpx-emm-fxrow");
      if (!b || !list.contains(b)) return;
      nav.set(b);
      toggle(b);
    });
    paint();

    function key(e) {
      const k = e.key;
      if (k === "ArrowDown" || k === "ArrowUp") {
        nav.move(k === "ArrowDown" ? 1 : -1);
        const c = nav.current();
        if (c && focusIn(root)) focus(c);
        return true;
      }
      if (k === " " && !e.isComposing) {
        // Пробел на строке — галочка (своё, без «щелчка» кнопки: он пришёл бы вторым). Строка ещё
        // не выбрана (открыли мышью) — первый пробел только встаёт на первую строку.
        if (e.target && e.target.closest && e.target.closest("input, textarea")) return false;
        if (!nav.current()) {
          nav.edge(false);
          if (focusIn(root)) focus(nav.current());
          return true;
        }
        return nav.activate(e);
      }
      if (k === "Enter" && !e.isComposing) {
        // На кнопках «Сбросить»/«Назад» Enter — их собственный щелчок.
        const t = e.target && e.target.closest ? e.target.closest(".cpx-btn, .cpx-ibtn") : null;
        if (t) return false;
        doInsert(e);
        return true;
      }
      if (k === "Backspace" || k === "ArrowLeft") {
        if (o.onBack) o.onBack();
        return true;
      }
      return false;
    }
    return {
      el: root,
      item: it,
      scroller: list,
      key,
      /** kb — открыли с клавиатуры: сразу встать на первую строку; мышью — фокус на списке. */
      focus(kb) {
        if (!btns.length) focus(insert);
        else if (kb) {
          nav.edge(false);
          focus(btns[0]);
        } else focus(list);
      },
      selected: () => [...sel],
      text,
    };
  }

  EM.views = { catalog, item };
})();

// ── src/main/79_emote_menu_grid.js ──
/* Меню смайликов Chatterino+ — часть 3: виртуальная сетка (смайлики и эмодзи).
 * Данные — 78_emote_menu_data.js / 78_emoji_model.js, окно — 79_emote_menu_ui.js.
 *
 *  • ПЛИТКИ РАЗНОЙ ШИРИНЫ: ширину и высоту плитки даёт окно (tile(пункт) — смайлик в размер чата
 *    + поля). Ряды укладываются слева направо, пока плитка влезает; высота ряда — по самой
 *    высокой плитке (не ниже ROW_MIN). Широкие смайлики данные ставят в конец раздела — они
 *    ложатся своими рядами внизу.
 *  • ВИРТУАЛЬНАЯ: в документе только видимые ряды (+ запас OVERSCAN), перестановка — раз в кадр.
 *    Содержимое плиток (картинки) — только у рядов, продержавшихся в окне IMG_DELAY мс: ряды,
 *    пролетевшие при быстрой прокрутке, картинок не заказывают (важно для очереди зеркала PLUS).
 *  • КЛАВИАТУРА — по видимому порядку: ←→ — соседняя плитка (переходит через ряды и разделы),
 *    ↑↓ — плитка соседнего ряда, ближайшая по середине, PageUp/PageDown — на экран, Home/End.
 *    Пока не нажата первая ↓, стрелки ←→ двигают курсор в поиске (kb = false).
 *  • relayout({anchor}) — пересобрать с сохранением места: плитки верхнего видимого ряда остаются
 *    там же (узнали размер по картинке, звёздочка, правки наборов — сетка не прыгает). Опора и
 *    выбор — «раздел + ключ» (смайлик из избранного стоит и в своём разделе). Нарисованные плитки
 *    переходят в новую раскладку вместе с картинками (update() поправит изменившееся), видимые
 *    новые ряды заполняются сразу — сетка не мигает.
 *
 *  • ФОНОВАЯ ПОДГРУЗКА (o.pre, 30.09): пока окно открыто, картинки всех плиток грузятся в фоне от
 *    видимого места — при прокрутке они уже в кэше (см. preKick). К1 правил основного чата 19.11: только когда
 *    картинки видимого пришли (CPX.imgRoute.pending), и последним уровнем очереди 64.
 *
 * API: new CPX.emoteMenu.Grid({scroll, space, tile(it) → {w, h}, cell(it, i) → Element,
 *        fill(cellEl, it), update(cellEl, it, i)?, pre(it) → <img> | null?, onSpy(nav), onSel(it | null)})
 *   .set(sections) — [{id, nav, title, count, items | state:"loading"|"note", text, empty}]
 *   .relayout({anchor}) · .schedule() · .paint() · .setSel(i, scroll) · .selected() · .key(e) → bool
 *   .indexOf(el) · .node(i) · .jump(nav, smooth) · .find(name) · .reset() · .destroy()
 *   .rows · .flat · .sel · .kb · .cols (плиток в первом ряду — для стенда)
 */

(() => {
  const EM = CPX.emoteMenu;
  const HEAD = 30; // заголовок раздела
  const NOTE = 48; // строка-пояснение (пусто, выключено)
  const ROW_MIN = 40; // ряд плиток не ниже
  const GAP = 2; // между плитками
  const PADX = 8; // поля слева/справа (как .cpx-emm-row в ui-78)
  const TOP_PAD = 2;
  const OVERSCAN = 240;
  const IMG_DELAY = 90;
  const PRE_MAX = 16; // фоновая подгрузка: картинок одновременно (лёгкие, ~1 КБ — упор в ожидание ответа, не в объём)
  const PRE_WAIT = 30000; // не пришла за столько — место отдаём следующей (картинку не обрываем; К3 — не короче 30 с)
  const PRE_HOLD = 400; // видимое ещё не пришло — заглянуть снова через столько (К1)
  const PRE_KICK = 120; // прокрутка утихла — очередь с нового места

  class Grid {
    constructor(o) {
      this.o = o;
      this.scroll = o.scroll;
      this.space = o.space;
      this.sections = [];
      this.rows = [];
      this.flat = [];
      this.sel = -1;
      this.kb = false;
      this.width = 0;
      this.rendered = new Map();
      this.raf = 0;
      this.alive = true;
      this.nav = "";
      this.pool = null; // плитки прежней раскладки — только на время relayout()
      this.fillNow = false;
      this.preDone = new Set(); // ключи, чьи картинки уже подгружали фоном
      this.preBusy = 0;
      this.preDown = 0;
      this.preUp = -1;
      this.preT = 0;
    }

    set(sections) {
      this.sections = Array.isArray(sections) ? sections : [];
      this.relayout();
    }

    /** Пересобрать ряды. o.anchor — сохранить место (плитки верхнего видимого ряда остаются на
     * месте). Опора и выбор — парой «раздел + ключ»: один смайлик стоит и в своём разделе, и в
     * «Избранном»/«Недавних» наверху — по одному ключу нашлась бы верхняя копия и сетка уехала бы
     * в начало. Уже нарисованные плитки с картинками новая раскладка берёт себе (pool): картинки
     * не создаются заново — нет мигания, анимация не начинается сначала, зеркало PLUS не
     * спрашивается снова. */
    relayout(o) {
      const w = this.scroll.clientWidth;
      if (!w) return false; // ещё не показано — позовёт наблюдатель размера
      const secOf = (fi) => this.rows[this.flat[fi].row].sec;
      let anchors = null;
      if (o && o.anchor && this.rows.length) {
        const top = this.scroll.scrollTop;
        const bottom = top + (this.scroll.clientHeight || 320);
        anchors = [];
        // Несколько плиток верхних видимых рядов: первая исчезла (убрали из избранного) —
        // держимся за следующую.
        for (const r of this.rows) {
          if (r.y > bottom || anchors.length >= 48) break;
          if (r.y + r.h <= top || r.t !== "cells") continue;
          for (const fi of r.cells) anchors.push({ sec: r.sec, k: this.flat[fi].it.k, off: r.y - top });
        }
      }
      const keep = this.sel >= 0 && this.flat[this.sel] ? { sec: secOf(this.sel), k: this.flat[this.sel].it.k } : null;
      // Нарисованные плитки (с картинками) — в запас: ключ → [{sec, el}].
      const pool = new Map();
      for (const n of this.rendered.values()) {
        for (const b of n.children) {
          if (!b.dataset || !b.dataset.filled || b.dataset.i == null) continue;
          const f = this.flat[+b.dataset.i];
          if (!f) continue;
          let a = pool.get(f.it.k);
          if (!a) pool.set(f.it.k, (a = []));
          a.push({ sec: this.rows[f.row].sec, el: b });
        }
      }
      this.width = w;
      const inner = Math.max(40, w - PADX * 2);
      const rows = [];
      const flat = [];
      const at = new Map(); // раздел + ключ → номер плитки (первой в разделе)
      let y = TOP_PAD;
      const push = (r) => {
        r.y = y;
        y += r.h;
        rows.push(r);
      };
      for (const s of this.sections) {
        if (s.title != null) push({ t: "head", nav: s.nav, sec: s.id, title: s.title, n: s.count && s.items ? s.items.length : null, h: HEAD });
        if (s.state === "loading") {
          push({ t: "skel", nav: s.nav, sec: s.id, h: ROW_MIN });
          push({ t: "note", nav: s.nav, sec: s.id, text: s.text, h: NOTE - 12, dim: true });
        } else if (s.state === "note" || !s.items || !s.items.length) {
          push({ t: "note", nav: s.nav, sec: s.id, text: s.text || s.empty || "", h: NOTE });
        } else {
          let row = null;
          let x = 0;
          for (const it of s.items) {
            const tl = this.o.tile(it);
            const tw = Math.min(inner, Math.max(1, Math.round(tl.w)));
            if (!row || (row.cells.length && x + tw > inner)) {
              if (row) push(row);
              row = { t: "cells", nav: s.nav, sec: s.id, cells: [], h: ROW_MIN };
              x = 0;
            }
            const ak = s.id + "\n" + it.k;
            if (!at.has(ak)) at.set(ak, flat.length);
            row.cells.push(flat.length);
            flat.push({ it, row: rows.length, x, w: tw });
            row.h = Math.max(row.h, Math.round(tl.h));
            x += tw + GAP;
          }
          if (row) push(row);
        }
      }
      this.rows = rows;
      this.flat = flat;
      this.space.style.height = y + 8 + "px";
      for (const n of this.rendered.values()) n.remove();
      this.rendered.clear();
      // Выбор: тот же смайлик в том же разделе; раздела нет — тот же смайлик где есть.
      this.sel = !keep ? -1 : at.has(keep.sec + "\n" + keep.k) ? at.get(keep.sec + "\n" + keep.k) : flat.findIndex((f) => f.it.k === keep.k);
      if (anchors) {
        for (const a of anchors) {
          const i = at.get(a.sec + "\n" + a.k);
          if (i == null) continue;
          this.scroll.scrollTop = Math.max(0, rows[flat[i].row].y - a.off);
          break;
        }
        // Ни одной опоры не осталось — прокрутка как была (браузер сам подрежет по высоте).
      }
      // Ряды, видимые сразу после пересборки, заполняются тут же (не через IMG_DELAY): их не
      // «пролетают» прокруткой, а пустые плитки на кадр-другой — то самое мигание.
      this.pool = pool;
      this.fillNow = true;
      try {
        this.paint();
      } finally {
        this.fillNow = false;
        this.pool = null;
      }
      return true;
    }

    // Плитка из запаса: сначала из того же раздела, потом любая с тем же ключом.
    take(k, sec) {
      const a = this.pool && this.pool.get(k);
      if (!a || !a.length) return null;
      let i = a.findIndex((x) => x.sec === sec);
      if (i < 0) i = 0;
      return a.splice(i, 1)[0].el;
    }

    schedule() {
      if (!this.raf && this.alive) this.raf = requestAnimationFrame(() => CPX.safely("emote-menu:paint", () => this.paint()));
    }

    paint() {
      this.raf = 0;
      if (!this.alive) return;
      const rows = this.rows;
      const top = this.scroll.scrollTop;
      const h = this.scroll.clientHeight || 320;
      const lo = top - OVERSCAN;
      const hi = top + h + OVERSCAN;
      // Первый ряд, чей низ ниже lo (ряды идут по возрастанию y).
      let a = 0;
      let b = rows.length - 1;
      let first = rows.length;
      while (a <= b) {
        const m = (a + b) >> 1;
        if (rows[m].y + rows[m].h >= lo) {
          first = m;
          b = m - 1;
        } else a = m + 1;
      }
      let last = first - 1;
      for (let i = first; i < rows.length && rows[i].y <= hi; i++) last = i;
      for (const [i, n] of this.rendered) {
        if (i < first || i > last) {
          n.remove();
          this.rendered.delete(i);
        }
      }
      let frag = null;
      for (let i = first; i <= last; i++) {
        if (this.rendered.has(i)) continue;
        const n = this.rowEl(rows[i]);
        this.rendered.set(i, n);
        (frag || (frag = document.createDocumentFragment())).appendChild(n);
      }
      if (frag) this.space.appendChild(frag);
      this.spy(top, h);
      this.preKick();
      this.vis = [first, last];
      this.port = [top, top + h];
      if (this.o.onView) CPX.safely("emote-menu:view", () => this.o.onView());
    }

    /** Плитки на экране: [первая, последняя] (номера в flat), или null. */
    visibleRange() {
      if (!this.vis) return null;
      let a = -1;
      let b = -1;
      for (let i = this.vis[0]; i <= this.vis[1]; i++) {
        const r = this.rows[i];
        if (!r || r.t !== "cells" || !r.cells.length) continue;
        if (a < 0) a = r.cells[0];
        b = r.cells[r.cells.length - 1];
      }
      return a < 0 ? null : [a, b];
    }

    /** Очерёдность загрузки плитки (номер в flat): меньше — раньше. На экране — сверху вниз, слева
     * направо; выше и ниже экрана — после всех видимых, ближние раньше. */
    rank(fi) {
      const f = this.flat[fi];
      const r = f && this.rows[f.row];
      if (!r || !this.port) return 1e9;
      const [top, bot] = this.port;
      if (r.y + r.h > top && r.y < bot) return fi;
      return 1e6 + (r.y >= bot ? r.y - bot : top - (r.y + r.h));
    }

    rowEl(r) {
      const el = (t, a, k) => CPX.el(t, a, k);
      let n;
      if (r.t === "head") {
        n = el("div", { class: "cpx-emm-head" }, [el("span", { class: "cpx-emm-head__t", text: r.title })]);
        if (r.n != null) n.appendChild(el("span", { class: "cpx-emm-head__n", text: String(r.n) }));
      } else if (r.t === "note") {
        n = el("div", { class: "cpx-emm-note" + (r.dim ? " cpx-emm-note--dim" : " cpx-mz cpx-k1 cpx-t-well"), text: r.text });
      } else if (r.t === "skel") {
        n = el("div", { class: "cpx-emm-cells", "aria-hidden": "true" });
        const k = Math.max(4, Math.floor((this.width - PADX * 2) / (ROW_MIN + GAP)));
        for (let i = 0; i < k; i++) n.appendChild(el("span", { class: "cpx-emm-cell cpx-emm-cell--skel" }, [el("span", { class: "cpx-skel" })]));
      } else {
        n = el("div", { class: "cpx-emm-cells", role: "presentation" });
        for (const fi of r.cells) {
          const f = this.flat[fi];
          let c = this.take(f.it.k, r.sec);
          if (c) {
            // Своя прежняя плитка: новый номер, выбор и то, что могло смениться (звёздочка, оттенок).
            c.dataset.i = String(fi);
            c.classList.toggle("cpx-sel", fi === this.sel);
            if (this.o.update) this.o.update(c, f.it, fi);
          } else {
            c = this.o.cell(f.it, fi);
            if (fi === this.sel) c.classList.add("cpx-sel");
          }
          c.style.width = f.w + "px";
          n.appendChild(c);
        }
        if (this.fillNow) this.fill(n);
        else this.fillLater(n);
      }
      n.classList.add("cpx-emm-row");
      n.style.height = r.h + "px";
      n.style.transform = "translateY(" + r.y + "px)";
      return n;
    }

    fill(row) {
      CPX.safely("emote-menu:img", () => {
        for (const b of row.children) {
          const f = this.flat[+b.dataset.i];
          if (f && !b.dataset.filled) {
            b.dataset.filled = "1";
            this.o.fill(b, f.it);
          }
        }
      });
    }

    fillLater(row) {
      setTimeout(() => {
        // Ряд уже убран (прокрутили дальше, пересобрали сетку, окно закрыто) — не нужно.
        if (!this.alive || !row.isConnected) return;
        this.fill(row);
      }, IMG_DELAY);
    }

    /* ── Фоновая подгрузка (o.pre) ────────────────────────────────────────────
     * Пока окно открыто — картинки ВСЕХ плиток, от видимого места вниз, потом вверх: докрутили —
     * а они уже в кэше браузера (🔴30.09: иначе каждый новый экран 7TV стоял пустым по 1–5 с).
     * o.pre(пункт) → картинка, грузящаяся вне документа (лёгкий первый кадр), или null — не нужно.
     * Одновременно не больше PRE_MAX; утихла прокрутка — очередь с нового места; уже
     * подгруженное (ключ) не повторяется. */
    preKick() {
      if (!this.o.pre || !this.alive) return;
      clearTimeout(this.preT);
      this.preT = setTimeout(() => {
        this.preT = 0;
        const at = this.visibleIndex();
        this.preDown = at;
        this.preUp = at - 1;
        this.prePump();
      }, PRE_KICK);
    }

    /** Первая плитка на экране (номер в flat). */
    visibleIndex() {
      const top = this.scroll.scrollTop;
      for (const r of this.rows) if (r.t === "cells" && r.y + r.h > top) return r.cells[0];
      return 0;
    }

    preNext() {
      const f = this.flat;
      while (this.preDown < f.length) {
        const it = f[this.preDown++].it;
        if (!this.preDone.has(it.k)) return it;
      }
      while (this.preUp >= 0 && this.preUp < f.length) {
        const it = f[this.preUp--].it;
        if (!this.preDone.has(it.k)) return it;
      }
      return null;
    }

    /** Фоновая подгрузка ещё идёт (окно само сбавляет анимации, чтобы не отнимать у неё канал). */
    preActive() {
      return this.alive && !!this.o.pre && (this.preBusy > 0 || this.preT !== 0 || this.preDown < this.flat.length || this.preUp >= 0);
    }

    prePump() {
      // К1: пока картинки видимого (и их анимации) не пришли — фоновое в сеть не уходит.
      const R = CPX.imgRoute;
      if (this.alive && R && R.pending && R.pending(1) > 0) {
        clearTimeout(this.preHoldT);
        this.preHoldT = setTimeout(() => this.prePump(), PRE_HOLD);
        return;
      }
      while (this.alive && this.preBusy < PRE_MAX) {
        const it = this.preNext();
        if (!it) {
          if (!this.preBusy && this.o.onPreIdle) CPX.safely("emote-menu:pre-idle", () => this.o.onPreIdle());
          return;
        }
        this.preDone.add(it.k);
        const im = CPX.safely("emote-menu:pre", () => this.o.pre(it));
        if (!im) continue;
        this.preBusy++;
        let fin = false;
        const done = () => {
          if (fin) return;
          fin = true;
          clearTimeout(t);
          this.preBusy--;
          this.prePump();
        };
        const t = setTimeout(done, PRE_WAIT);
        im.addEventListener("load", done, { once: true });
        im.addEventListener("error", done, { once: true });
      }
    }

    node(i) {
      return this.space.querySelector('.cpx-emm-cell[data-i="' + i + '"]');
    }
    indexOf(el) {
      const c = el && el.closest ? el.closest(".cpx-emm-cell[data-i]") : null;
      return c && this.space.contains(c) ? +c.dataset.i : -1;
    }
    selected() {
      return this.sel >= 0 && this.flat[this.sel] ? this.flat[this.sel].it : null;
    }

    /* ── раздел под верхним краем ─────────────────────────────────────────── */
    spy(top, h) {
      if (!this.rows.length) return;
      let nav = this.rows[0].nav;
      if (top > 0 && top + h >= this.scroll.scrollHeight - 2) {
        // Докрутили до конца: короткий последний раздел до верха не доедет — берём его.
        for (const r of this.rows) if (r.t === "head" && r.y < top + h - HEAD) nav = r.nav;
      } else {
        for (const r of this.rows) {
          if (r.y > top + 8) break;
          nav = r.nav;
        }
      }
      if (nav !== this.nav) {
        this.nav = nav;
        if (this.o.onSpy) this.o.onSpy(nav);
      }
    }

    jump(nav, smooth) {
      const r = this.rows.find((x) => x.nav === nav);
      if (!r) return false;
      const top = Math.max(0, r.y - TOP_PAD);
      if (smooth) this.scroll.scrollTo({ top, behavior: "smooth" });
      else {
        this.scroll.scrollTop = top;
        this.paint();
      }
      return true;
    }

    /* ── выбор и клавиатура ───────────────────────────────────────────────── */
    setSel(i, scroll) {
      const old = this.sel;
      this.sel = i;
      if (old >= 0 && old !== i) {
        const c = this.node(old);
        if (c) c.classList.remove("cpx-sel");
      }
      if (i >= 0 && scroll) this.ensureVisible(i);
      const c = i >= 0 ? this.node(i) : null;
      if (c) c.classList.add("cpx-sel");
      if (this.o.onSel) this.o.onSel(this.selected());
    }

    ensureVisible(i) {
      const f = this.flat[i];
      if (!f) return;
      const r = this.rows[f.row];
      const prev = this.rows[f.row - 1];
      const y0 = prev && prev.t === "head" ? prev.y : r.y; // первый ряд раздела — вместе с заголовком
      const top = this.scroll.scrollTop;
      const h = this.scroll.clientHeight;
      if (y0 < top) this.scroll.scrollTop = y0;
      else if (r.y + r.h > top + h) this.scroll.scrollTop = r.y + r.h - h + 6;
      this.paint();
    }

    /** ↑↓ по рядам: плитка соседнего ряда, ближайшая по середине. false — выше первого ряда. */
    moveRow(d) {
      const F = this.flat;
      if (!F.length) return true;
      if (this.sel < 0) {
        if (d > 0) this.setSel(0, true);
        return d > 0;
      }
      const cur = F[this.sel];
      let r = cur.row + d;
      while (r >= 0 && r < this.rows.length && this.rows[r].t !== "cells") r += d;
      if (r < 0) return false;
      if (r >= this.rows.length) return true;
      const mid = cur.x + cur.w / 2;
      let best = -1;
      let bd = Infinity;
      for (const fi of this.rows[r].cells) {
        const f = F[fi];
        const dd = Math.abs(f.x + f.w / 2 - mid);
        if (dd < bd) (bd = dd), (best = fi);
      }
      this.setSel(best, true);
      return true;
    }

    /** Клавиши сетки; true — обработано. «Выше первого ряда» — o.onTop() (вернуться в поиск). */
    key(e, o) {
      const k = e.key;
      switch (k) {
        case "ArrowDown":
        case "ArrowUp":
          if (k === "ArrowDown" && !this.kb && this.sel >= 0) {
            // Поиск уже подсветил лучшее совпадение — первая ↓ лишь «входит» в сетку на нём.
            this.kb = true;
            this.setSel(this.sel, true);
            return true;
          }
          this.kb = true;
          if (!this.moveRow(k === "ArrowDown" ? 1 : -1)) {
            this.setSel(-1);
            this.kb = false;
            this.scroll.scrollTop = 0;
            this.paint();
            if (o && o.onTop) o.onTop();
          }
          return true;
        case "ArrowRight":
        case "ArrowLeft":
          if (!this.kb || this.sel < 0) return false;
          this.setSel(Math.max(0, Math.min(this.flat.length - 1, this.sel + (k === "ArrowRight" ? 1 : -1))), true);
          return true;
        case "Home":
        case "End":
          if (!this.kb || !this.flat.length) return false;
          this.setSel(k === "Home" ? 0 : this.flat.length - 1, true);
          return true;
        case "PageDown":
        case "PageUp": {
          if (!this.kb) return false;
          const n = Math.max(1, Math.floor(this.scroll.clientHeight / ROW_MIN) - 1);
          for (let i = 0; i < n; i++) if (!this.moveRow(k === "PageDown" ? 1 : -1)) break;
          return true;
        }
      }
      return false;
    }

    find(name) {
      return this.flat.findIndex((f) => f.it.n === name || f.it.e === name || f.it.k === name);
    }

    /** Сброс выбора и прокрутки (новый поиск). */
    reset() {
      this.kb = false;
      this.sel = -1;
      this.scroll.scrollTop = 0;
    }

    destroy() {
      this.alive = false;
      cancelAnimationFrame(this.raf);
      clearTimeout(this.preT);
      for (const n of this.rendered.values()) n.remove();
      this.rendered.clear();
    }

    get cols() {
      const r = this.rows.find((x) => x.t === "cells");
      return r ? r.cells.length : 0;
    }
  }

  EM.Grid = Grid;
  EM.GRID = { HEAD, NOTE, ROW_MIN, GAP, PADX };
})();

// ── src/main/79_emote_menu_ui.js ──
/* Меню смайликов Chatterino+ — часть 4: окно и родная кнопка Twitch.
 * Данные — 78_emote_menu_data.js (смайлики), 78_emoji_model.js (эмодзи); сетка —
 * 79_emote_menu_grid.js; виды эффектов — 79_emote_menu_fx.js; стили — styles/ui-78-*.css и
 * styles/page-78-*.css (родная кнопка).
 *
 * КНОПКА (решение владельца 29.09): меню открывает РОДНАЯ кнопка смайликов Twitch внутри поля
 * ввода (button[data-a-target="emote-picker-button"]) — перехват щелчка в фазе захвата на window
 * (раньше корня React, как 7TV подменяет её содержимое). Shift+щелчок — родное окно Twitch
 * (запасной путь: «гигантизировать смайлик» и прочее своё Twitch), подсказка на кнопке об этом.
 * Своей кнопки в ряду под полем больше нет. Настройка input.menu выключена — всё как у Twitch.
 * Только кнопка поля ввода чата канала (у шёпотов свой выбор смайликов). BTTV прячет родную
 * кнопку и ставит свою — пока наше меню включено, родная возвращается, а кнопка BTTV прячется
 * (styles/page-78, флаг data-cpx-emm на <html>; подробно — у syncNativeFlag).
 *
 * ОКНО — всплывашка общих окон (CPX.ui.popover) над полем ввода, справа, в нашем стиле:
 *   поиск (+ оттенок кожи на вкладке эмодзи) · вкладки «Смайлики · Эмодзи · GIF · Эффекты» ·
 *   сетка и справа лента разделов (избранное, недавние, личные 7TV, канал, каналы Twitch
 *   аватарками, глобальные; щелчок — к разделу, при прокрутке подсвечивается текущий) · внизу —
 *   смайлик под мышью/выбранный или подсказка по управлению.
 *  • keepFocus: щелчок по смайлику не уводит фокус — курсор остаётся в поиске (или в поле Twitch).
 *  • Щелчок — вставить (CPX.input.insert, с пробелами как у Twitch). Владелец 23.10 (input.menuKeep,
 *    по умолчанию вкл.): меню остаётся открытым и закрывается после отправки сообщения (CPX.input
 *    "sent"; гифка — тоже отправка), щелчок в поле ввода чата — не «мимо» (inside всплывашки).
 *    Выключено — как раньше: закрыть сразу, Shift — оставить открытым. Alt или квадратик на плитке —
 *    в избранное. Правый щелчок (клавиша меню, Shift+F10) — меню: избранное, эффекты этого смайлика.
 *  • Открепить (квадратная кнопка справа от поиска, владелец 23.10): то же содержимое (S.root)
 *    переезжает в наше окно CPX.ui.window — закреплённое, без шапки, таскается за пустые места
 *    (сетка и лента разделов — data-nodrag: полоса прокрутки не тащит окно). Щелчки мимо, выбор
 *    смайликов и отправка его не закрывают; на месте кнопки — крестик. Обратно не прикрепляется:
 *    закрыть и открыть заново.
 *  • Zero-width 7TV — первыми в разделе, с лавандовой обводкой и подсказкой.
 *  • Эмодзи — встроенные данные, поиск RU+EN, оттенок кожи (запоминается), недавние эмодзи.
 *  • GIF — вкладка соседа (CPX.gifPicker, файлы 79_gif_*): есть модуль и available() не hidden —
 *    вкладка есть; ok=false — приглушена, причина в подсказке. Нет модуля — вкладки нет.
 *  • Обновления (правки наборов, наборы Twitch, своё оформление, настройки) — не позже 250 мс
 *    после первого события; «Недавние» в ОТКРЫТОМ окне не перестраиваются (снимок при открытии):
 *    иначе при Shift-щелчках сетка уезжала бы из-под мыши.
 *  • Клавиатура: фокус в поиске; ↓ — в сетку, дальше стрелки по видимому порядку (79_grid),
 *    Enter — вставить (Shift+Enter — не закрывать), клавиша меню / Shift+F10 — меню смайлика,
 *    Esc — очистить поиск, затем закрыть.
 *
 * API: CPX.emoteMenu.open({view:"emotes"|"emoji"|"gif"|"effects", item, trigger}) · .close() ·
 *   .toggle(o) · .isOpen() · для стенда (dev) — CPX.emoteMenu._dev (detach(), detached()).
 */

(() => {
  const EM = CPX.emoteMenu;
  const log = CPX.log("emote-menu");
  // Кнопка, открывающая наше меню: у Twitch — его родная кнопка смайликов; мир Kick ставит СВОЮ рядом со своей
  // кнопкой Kick (src/kick/79_kick_emm.js: CPX.input.EMOTE_BTN) — меню Kick со смайликами Kick остаётся как было.
  const NATIVE = (CPX.input && CPX.input.EMOTE_BTN) || 'button[data-a-target="emote-picker-button"]';
  const BTTV_BTN = "#bttv-emote-picker-button-container button";
  const TILE_MIN = 36; // плитка смайлика не уже (Twitch 28 + поля)
  const TILE_PAD = 8; // поля плитки вокруг смайлика
  const EMOJI_TILE = { w: 38, h: 40 };
  const WIDTH = 404; // без поля ввода (стенд) — запасная ширина
  const WIDTH_MIN = 300;
  const WIDTH_MAX = 760;
  const NARROW = 380; // уже — компактный вид (вкладки без значков, предпросмотр эффектов уже)
  const fxPreviewMax = () => (S && S.root && S.root.clientWidth > 0 && S.root.clientWidth < NARROW ? 56 : 88);

  CPX.i18n.add({
    ru: {
      "emm.button": "Смайлики Chatterino+",
      "emm.nativeTip": "Смайлики Chatterino+ · Shift+щелчок — окно Twitch",
      "emm.bttvTip": "Смайлики Chatterino+ · Shift+щелчок — окно BetterTTV",
      "emm.search": "Поиск смайликов",
      "emm.searchEmoji": "Поиск эмодзи",
      "emm.searchFx": "Поиск эффектов",
      "emm.tab.emotes": "Смайлики",
      "emm.tab.emoji": "Эмодзи",
      "emm.tab.gif": "GIF",
      "emm.fx.tab": "Эффекты",
      "emm.tabs": "Вкладки меню",
      "emm.nav": "Разделы",
      "emm.grid": "Смайлики",
      "emm.hint": "Shift — не закрывать · квадратик — в избранное · правый щелчок — эффекты",
      "emm.hintNoFx": "Shift — не закрывать · квадратик или Alt — в избранное",
      "emm.hintEmoji": "Щелчок — вставить · Shift+щелчок — не закрывать",
      "emm.hintK": "Квадратик — в избранное · правый щелчок — эффекты",
      "emm.hintKNoFx": "Квадратик или Alt — в избранное",
      "emm.hintKEmoji": "Щелчок — вставить",
      "emm.detach": "Открепить окно",
      "emm.noInput": "Поле ввода не найдено — откройте чат канала",
      "emm.zw": "Zero-width: встаёт поверх предыдущего смайлика",
      "emm.zwShort": "Zero-width",
      "emm.fav.add": "В избранное",
      "emm.fav.remove": "Убрать из избранного",
      "emm.fav.added": "«{name}» — в избранном",
      "emm.fav.removed": "«{name}» убран из избранного",
      "emm.fav.full": "В избранном уже {n} смайликов — уберите лишние, чтобы добавить новый",
      "emm.menu.fx": "Эффекты…",
      "emm.menu.insert": "Вставить, не закрывая",
      "emm.tone": "Оттенок кожи",
      "emm.tone.0": "Без оттенка",
      "emm.tone.1": "Светлый",
      "emm.tone.2": "Средне-светлый",
      "emm.tone.3": "Средний",
      "emm.tone.4": "Средне-тёмный",
      "emm.tone.5": "Тёмный",
      "emm.emoji.recent": "Недавние",
      "emm.gif.off": "GIF недоступны",
      "emm.fx.added": "«{code}» у курсора — теперь выберите смайлик",
      "emm.fx.before": "Пишется перед смайликом",
      "emm.fx.beforePlus": "Перед смайликом · видно только в Chatterino+",
      "emm.fx.after": "Пишется после смайлика",
    },
    en: {
      "emm.button": "Chatterino+ emotes",
      "emm.nativeTip": "Chatterino+ emotes · Shift+click for the Twitch one",
      "emm.bttvTip": "Chatterino+ emotes · Shift+click for the BetterTTV one",
      "emm.search": "Search emotes",
      "emm.searchEmoji": "Search emoji",
      "emm.searchFx": "Search effects",
      "emm.tab.emotes": "Emotes",
      "emm.tab.emoji": "Emoji",
      "emm.tab.gif": "GIF",
      "emm.fx.tab": "Effects",
      "emm.tabs": "Menu tabs",
      "emm.nav": "Sections",
      "emm.grid": "Emotes",
      "emm.hint": "Shift keeps it open · square: favorite · Right-click: effects",
      "emm.hintNoFx": "Shift keeps it open · square or Alt: favorite",
      "emm.hintEmoji": "Click to insert · Shift+click keeps it open",
      "emm.hintK": "Square: favorite · Right-click: effects",
      "emm.hintKNoFx": "Square or Alt: favorite",
      "emm.hintKEmoji": "Click to insert",
      "emm.detach": "Detach the window",
      "emm.noInput": "Chat input not found — open a channel chat",
      "emm.zw": "Zero-width: sits on top of the previous emote",
      "emm.zwShort": "Zero-width",
      "emm.fav.add": "Add to favorites",
      "emm.fav.remove": "Remove from favorites",
      "emm.fav.added": "“{name}” added to favorites",
      "emm.fav.removed": "“{name}” removed from favorites",
      "emm.fav.full": "You already have {n} favorite emotes — remove some to add a new one",
      "emm.menu.fx": "Effects…",
      "emm.menu.insert": "Insert and keep open",
      "emm.tone": "Skin tone",
      "emm.tone.0": "Default",
      "emm.tone.1": "Light",
      "emm.tone.2": "Medium-light",
      "emm.tone.3": "Medium",
      "emm.tone.4": "Medium-dark",
      "emm.tone.5": "Dark",
      "emm.emoji.recent": "Recent",
      "emm.gif.off": "GIFs are unavailable",
      "emm.fx.added": "“{code}” is at the cursor — now pick an emote",
      "emm.fx.before": "Goes before the emote",
      "emm.fx.beforePlus": "Before the emote · only Chatterino+ shows it",
      "emm.fx.after": "Goes after the emote",
    },
  });

  const el = (tag, attrs, kids) => CPX.el(tag, attrs, kids);
  const t = (k, v) => CPX.t(k, v);
  const menuOn = () => CPX.settings.get("input.menu") !== false;
  const keepOn = () => CPX.settings.get("input.menuKeep") !== false;
  // Выбор смайлика окно не закрывает: откреплено или «не закрывать после выбора».
  const stays = () => !!(S && (S.win || keepOn()));
  const fxOn = () => CPX.settings.get("emotes.effects") !== false;
  const reduced = () => !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  const gifApi = () => (CPX.gifPicker && typeof CPX.gifPicker.mount === "function" ? CPX.gifPicker : null);

  let S = null; // состояние открытого окна
  let refreshT = 0;

  /* ── открыть / закрыть ──────────────────────────────────────────────────── */

  function isOpen() {
    return !!(S && S.h && (S.win ? S.h.isOpen : S.h.open));
  }

  function open(o) {
    o = o || {};
    if (isOpen()) {
      if (o.view) setView(o.view, o.item);
      return S.h;
    }
    S = {
      view: "emotes",
      q: { emotes: "", emoji: "", effects: "" },
      mdl: null,
      sig: "",
      hover: null,
      tab: null,
      nav: "",
      preview: null,
      fxView: null,
      back: "emotes",
      scrollTop: { emotes: 0, emoji: 0 },
      jump: null, // раздел, к которому перейти, когда сетка снова видна (переход из эффектов)
      fxSig: "",
      flash: null,
      focusInput: false,
      recentSnap: EM.recent(), // «Недавние» в открытом окне не перестраиваются
      gif: null, // {ok, reason, hidden} — ответ соседа
      gifH: null,
      trigger: o.trigger || null,
    };
    EM.askSelf();
    build();
    // Поле ввода есть — держимся за него (пропало — окно закроется); нет (стенд, чат без
    // поля) — угол колонки чата.
    const strict = !!CPX.ui.inputAnchor();
    const anchor = strict
      ? () => CPX.ui.inputAnchor()
      : () => {
          const r = CPX.ui.chatRect();
          return { left: r.right - 12, top: r.bottom - 12, width: 1, height: 1 };
        };
    const mine = S;
    S.h = CPX.ui.popover({
      anchor,
      side: "top",
      align: "end",
      offset: 8,
      width: WIDTH,
      // Владелец 01.10: окно — по ширине чата (край в край с полем ввода), а не 404 px поверх видео.
      // Узкий чат — не уже WIDTH_MIN (сетка слиплась бы), широкое окно чата — не шире WIDTH_MAX.
      matchWidth: strict ? { min: WIDTH_MIN, max: WIDTH_MAX } : null,
      className: "cpx-emm-pop",
      kind: "cpx-emote-menu",
      tone: "panel", // «Мозаика»: большая всплывашка — тон окна, выбоины в 1 клетку, без клювика

      keepFocus: true,
      trigger: o.trigger || null,
      // Не закрывается после выбора — значит, дальше пишут сообщение: щелчок в поле ввода не «мимо».
      inside: strict && keepOn() ? chatField : null,
      label: t("emm.button"),
      content: S.root,
      onClose: (reason) => closed(mine, reason),
    });
    nativeActive(true);
    refresh(true);
    setView(o.view || "emotes", o.item);
    probeGif();
    // Наборы Twitch: сразу — из кэша и данных Twitch у контроллера чата, свежие — запросом
    // (пришли — событие change → обновление).
    CPX.safely("emote-menu:tw", () => EM.loadTwitch());
    CPX.ui.ready.then(() =>
      requestAnimationFrame(() => {
        if (S !== mine || !isOpen()) return;
        relayout(); // размеры известны только после показа
        if (S.view !== "item") focusSearch();
      })
    );
    return S.h;
  }

  function close(reason) {
    if (isOpen()) S.h.close(reason || "close");
  }

  function toggle(o) {
    if (isOpen()) close("toggle");
    else open(o);
  }

  function closed(mine, reason) {
    if (mine.moving) return; // всплывашку закрыли при откреплении — содержимое живёт в окне
    if (mine.ro) mine.ro.disconnect();
    if (mine.grid) mine.grid.destroy();
    if (mine.egrid) mine.egrid.destroy();
    animReset();
    dropGif(mine);
    clearTimeout(mine.flashT);
    clearTimeout(mine.learnT);
    clearTimeout(refreshT);
    refreshT = 0;
    if (S === mine) S = null;
    nativeActive(false, mine);
    // После вставки и по Esc — курсор обратно в поле ввода (сообщение дописывают дальше);
    // щелчок мимо фокус не трогает.
    if (mine.focusInput || reason === "esc") CPX.safely("emote-menu:focus", () => CPX.input.focus());
    log.debug("меню закрыто:", reason);
  }

  // Вставка сделана и окно не нужно — закрыть и вернуть курсор в поле ввода.
  function finish() {
    if (!S) return;
    S.focusInput = true;
    close("done");
  }

  // Поле ввода чата (рамка с текстом и кнопкой смайликов) — inside всплывашки.
  function chatField() {
    const r = CPX.input.root();
    return (r && (r.querySelector(".chat-input__textarea") || r.querySelector('[data-a-target="chat-input"]'))) || null;
  }

  /** Открепить: содержимое — в наше окно на том же месте, всплывашка закрывается без разборки. */
  function detach() {
    if (!S || S.win || !isOpen()) return false;
    const mine = S;
    const pop = S.h;
    const r = pop.el.getBoundingClientRect();
    const win = CPX.ui.window({
      kind: "cpx-emote-menu",
      header: false,
      bare: true,
      pinned: true,
      pinnable: false,
      dragAnywhere: true,
      className: "cpx-emm-win",
      width: Math.round(r.width),
      body: S.root, // узел переезжает из всплывашки
      focus: false,
      label: t("emm.button"),
      onClose: (reason) => closed(mine, reason),
    });
    mine.moving = true;
    pop.close("float");
    mine.moving = false;
    S.win = win;
    S.h = win;
    win.move(r.left, r.top);
    setDetachBtn();
    CPX.ui.tip.hide();
    updateFoot();
    // Переезд узла снял фокус с поиска — вернуть.
    if (S.view === "gif") {
      if (S.gifH && S.gifH.focus) CPX.safely("emote-menu:gif:focus", () => S.gifH.focus());
    } else if (S.view !== "item") focusSearch();
    return true;
  }

  // Кнопка справа от поиска: открепить, а в откреплённом окне — закрыть.
  function setDetachBtn() {
    const b = S && S.detachBtn;
    if (!b) return;
    const label = S.win ? t("ui.close") : t("emm.detach");
    b.textContent = "";
    b.appendChild(CPX.ui.icon(S.win ? "close" : "external", 14));
    b.setAttribute("aria-label", label);
    b.setAttribute("data-cpx-tip", label);
    b.classList.toggle("cpx-emm-detach--x", !!S.win);
  }

  /* ── устройство окна ────────────────────────────────────────────────────── */

  function build() {
    S.style = document.createElement("style"); // ключевые кадры эффектов (78: fx.sync)
    S.search = CPX.ui.input({
      icon: "search",
      placeholder: t("emm.search"),
      clearable: true,
      className: "cpx-emm-search",
      onInput: (v) => setQuery(v),
      onEsc: () => {
        S.search.value = "";
        setQuery("");
      },
    });
    S.toneBtn = el("button", { type: "button", class: "cpx-emm-tone cpx-mz cpx-k1 cpx-t-field", "aria-label": t("emm.tone"), "data-cpx-tip": t("emm.tone"), hidden: true });
    S.toneBtn.addEventListener("click", onToneClick);
    S.top = el("div", { class: "cpx-emm-top" }, [S.search, S.toneBtn]);
    // Поиск вкладки GIF — на месте общего поиска (над вкладками): вкладки не прыгают при переходе.
    S.gifTop = el("div", { class: "cpx-emm-giftop", hidden: true });
    // Открепить / закрыть (владелец 23.10) — справа от обоих поисков, одной строкой с ними.
    S.detachBtn = el("button", { type: "button", class: "cpx-emm-detach cpx-mz cpx-k1 cpx-t-field" });
    S.detachBtn.addEventListener("click", () => (S && S.win ? close("close") : detach()));
    S.bar = el("div", { class: "cpx-emm-bar" }, [S.top, S.gifTop, S.detachBtn]);
    setDetachBtn();
    S.tabs = el("div", { class: "cpx-emm-tabs", role: "tablist", "aria-label": t("emm.tabs") });
    S.tabs.addEventListener("click", onTabClick);
    S.space = el("div", { class: "cpx-emm-space" });
    S.scroll = el("div", { class: "cpx-emm-scroll", role: "listbox", "aria-label": t("emm.grid") }, [S.space]);
    S.espace = el("div", { class: "cpx-emm-space" });
    S.escroll = el("div", { class: "cpx-emm-scroll", role: "listbox", "aria-label": t("emm.tab.emoji"), hidden: true }, [S.espace]);
    S.gifBox = el("div", { class: "cpx-emm-gifbox", hidden: true });
    S.fxBox = el("div", { class: "cpx-emm-fxbox", hidden: true });
    // data-nodrag: в откреплённом окне сетка и лента разделов не тащат окно (полоса прокрутки, промахи между плитками).
    S.main = el("div", { class: "cpx-emm-main", "data-nodrag": "" }, [S.scroll, S.escroll, S.gifBox, S.fxBox]);
    S.side = el("div", { class: "cpx-emm-side", role: "tablist", "aria-orientation": "vertical", "aria-label": t("emm.nav"), "data-nodrag": "" });
    S.side.addEventListener("click", onSideClick);
    S.body = el("div", { class: "cpx-emm-body" }, [S.main, S.side]);
    S.foot = el("div", { class: "cpx-emm-foot" });
    S.root = el("div", { class: "cpx-emm" }, [S.style, S.bar, S.tabs, S.body, S.foot]);
    // Как keepFocus всплывашки, и в откреплённом окне: щелчок по смайлику не уводит курсор из поля Twitch.
    S.root.addEventListener("mousedown", (e) => {
      const x = e.target;
      if (!(x instanceof Element) || !x.closest("input, textarea, select, [contenteditable='true'], [contenteditable='']")) e.preventDefault();
    });

    const mine = S;
    S.grid = new EM.Grid({
      scroll: S.scroll,
      space: S.space,
      tile: tileOf,
      cell: emoteCell,
      fill: fillEmote,
      update: updateEmoteCell,
      pre: preloadEmote,
      onPreIdle: () => S === mine && (animPump(), aheadKick()), // лёгкие догрузились — анимациям весь канал
      onView: () => S === mine && (animSweep(), aheadKick()), // прокрутили: ушедшим — прочь из очереди, наперёд — с нового места
      onSpy: (nav) => S === mine && S.view === "emotes" && !S.q.emotes && setNav(nav),
      onSel: () => S === mine && updateFoot(),
    });
    S.egrid = new EM.Grid({
      scroll: S.escroll,
      space: S.espace,
      tile: () => EMOJI_TILE,
      cell: emojiCell,
      fill: fillEmoji,
      update: (b, it) => b.dataset.filled && fillEmoji(b, it), // сменился оттенок кожи
      onSpy: (nav) => S === mine && S.view === "emoji" && !S.q.emoji && setNav(nav),
      onSel: () => S === mine && updateFoot(),
    });
    for (const [sc, g] of [
      [S.scroll, S.grid],
      [S.escroll, S.egrid],
    ]) {
      sc.addEventListener("scroll", () => g.schedule(), { passive: true });
      sc.addEventListener("click", (e) => onCellClick(e, g));
      sc.addEventListener("contextmenu", (e) => onCellMenu(e, g));
      sc.addEventListener("mouseover", (e) => onCellOver(e, g));
      sc.addEventListener("mouseleave", () => setHover(null));
    }
    S.root.addEventListener("keydown", onKey);
    S.ro = new ResizeObserver(
      CPX.guard("emote-menu:resize", () => {
        if (S !== mine) return;
        // Узкое окно (по ширине чата, 01.10): вкладки без значков — подписи целиком, без «Смай…».
        S.root.classList.toggle("cpx-emm--narrow", S.root.clientWidth > 0 && S.root.clientWidth < NARROW);
        const g = curGrid();
        if (!g) return;
        const w = g.scroll.clientWidth;
        if (w && w !== g.width) relayout();
        else g.schedule();
      })
    );
    S.ro.observe(S.root);
    S.ro.observe(S.scroll);
    S.ro.observe(S.escroll);
    renderTabs();
  }

  const curGrid = () => (!S ? null : S.view === "emotes" ? S.grid : S.view === "emoji" ? S.egrid : null);

  function focusSearch() {
    if (S && S.search && S.search.input.isConnected && !S.top.hidden) S.search.input.focus({ preventScroll: true });
  }

  /* ── вкладки ────────────────────────────────────────────────────────────── */

  function renderTabs() {
    S.tabs.textContent = "";
    const tab = (id, label, icon, extra) => {
      const b = el("button", Object.assign({ type: "button", class: "cpx-emm-ttab", role: "tab", "data-v": id, "aria-selected": "false" }, extra || {}));
      b.classList.add("cpx-mz", "cpx-k1");
      if (icon) b.appendChild(CPX.ui.icon(icon, 14));
      b.appendChild(el("span", { text: label }));
      S.tabs.appendChild(b);
      return b;
    };
    tab("emotes", t("emm.tab.emotes"), "smile");
    tab("emoji", t("emm.tab.emoji"), "emmEmoji");
    const g = S.gif;
    if (gifApi() && g && !g.hidden) {
      const b = tab("gif", t("emm.tab.gif"), "emmGif", g.ok ? {} : { "aria-disabled": "true", "data-cpx-tip": g.reason || t("emm.gif.off") });
      if (!g.ok) b.classList.add("cpx-emm-ttab--off");
    }
    if (fxOn()) tab("effects", t("emm.fx.tab"), "emmSparkle", { class: "cpx-emm-ttab cpx-emm-ttab--fx" });
    S.tab = null;
    setTabSel(S.view === "item" ? "effects" : S.view);
  }

  function setTabSel(v) {
    if (!S || v === S.tab) return;
    S.tab = v;
    for (const b of S.tabs.children) {
      const on = b.dataset.v === v;
      b.classList.toggle("cpx-on", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    }
  }

  function onTabClick(e) {
    const b = e.target.closest && e.target.closest(".cpx-emm-ttab");
    if (!b || !S) return;
    const v = b.dataset.v;
    if (b.getAttribute("aria-disabled") === "true") {
      CPX.ui.toast({ text: (S.gif && S.gif.reason) || t("emm.gif.off"), kind: "info" });
      return;
    }
    if (v === "effects" && S.view === "effects") return setView("emotes");
    setView(v);
    focusSearch();
  }

  // Сосед (GIF) спрашивается при каждом открытии: канал и права могли смениться.
  function probeGif() {
    const api = gifApi();
    if (!api) return;
    const mine = S;
    const ch = (CPX.chat.state && CPX.chat.state.channelId) || "";
    Promise.resolve()
      .then(() => (typeof api.available === "function" ? api.available(ch) : { ok: true }))
      .then((r) => {
        if (S !== mine) return;
        r = r || {};
        S.gif = { ok: !!r.ok, reason: typeof r.reason === "string" ? r.reason.slice(0, 200) : "", hidden: !!r.hidden };
        renderTabs();
        if (S.view === "gif" && (!S.gif.ok || S.gif.hidden)) setView("emotes");
      })
      .catch((e) => {
        CPX.report("emote-menu:gif", e);
        if (S === mine) {
          S.gif = { ok: false, reason: t("emm.gif.off"), hidden: false };
          renderTabs();
        }
      });
  }

  function dropGif(st) {
    st = st || S;
    if (st && st.gifH) {
      const h = st.gifH;
      st.gifH = null;
      CPX.safely("emote-menu:gif:destroy", () => h.destroy && h.destroy());
    }
  }

  /* ── смайлики: данные → сетка ───────────────────────────────────────────── */

  // Отпечаток модели: те же разделы с теми же смайликами — сетку не трогаем (событие «change»
  // приходит и на правки других каналов — партнёров общего чата, и на повторную загрузку).
  function sigOf(m) {
    const part = (x) => (x.items ? x.items.length + "/" + (x.items[0] ? x.items[0].k : "") + "/" + (x.items.length ? x.items[x.items.length - 1].k : "") : x.state);
    return m.sections.map((x) => x.id + "=" + part(x)).join(",") + "#" + (m.results ? m.results.length + "/" + (m.results[0] ? m.results[0].k : "") : -1);
  }

  const emoteModel = () => EM.model({ q: S.q.emotes, recent: S.recentSnap });

  // Пересобрать модель (правки наборов, вход, настройки) — место и выбранный смайлик сохраняем.
  function refresh(force) {
    if (!S) return;
    // Виды эффектов зависят от своего (подписки, данные FFZ) — пересобрать, только если сменилось.
    if ((S.view === "effects" || S.view === "item") && EM.fx.sig() !== S.fxSig) rebuildFx();
    const m = emoteModel();
    const sig = sigOf(m);
    if (!force && sig === S.sig) return;
    S.sig = sig;
    S.mdl = m;
    if (S.view === "emotes") {
      renderSide();
      S.grid.sections = gridSections(m);
      S.grid.relayout({ anchor: true });
      selectBest();
      updateFoot();
    } else S.dirty = true; // вернутся к смайликам — разложить заново
  }
  // Обновление — не позже чем через 250 мс после ПЕРВОГО события: таймер не откладывается
  // заново на каждое следующее (на людном канале поток событий иначе отодвигал бы обновление).
  function refreshSoon() {
    if (refreshT) return;
    refreshT = setTimeout(() => {
      refreshT = 0;
      CPX.safely("emote-menu:refresh", () => refresh(false));
    }, 250);
  }

  function gridSections(m) {
    if (m.q) return [{ id: "results", nav: "", title: t("emm.s.results"), count: true, items: m.results, empty: t("emm.empty.search", { q: m.q }) }];
    return m.sections.map((s) => ({ id: s.id, nav: s.nav, title: s.title, count: !!s.items, items: s.items, state: s.state, text: s.text }));
  }

  // Плитка — смайлик в размер чата + поля.
  function tileOf(it) {
    const s = EM.size(it);
    return { w: Math.max(TILE_MIN, s.w + TILE_PAD), h: s.h + TILE_PAD };
  }

  function relayout() {
    if (!S) return;
    if (S.view === "emotes") {
      if (!S.mdl) return;
      S.grid.sections = gridSections(S.mdl);
      S.grid.relayout({ anchor: true });
      selectBest();
    } else if (S.view === "emoji") {
      S.egrid.sections = emojiSections();
      S.egrid.relayout({ anchor: true });
      selectBest();
    }
    updateFoot();
  }

  // Поиск: лучшее совпадение — под Enter.
  function selectBest() {
    const g = curGrid();
    if (!g) return;
    const q = S.view === "emotes" ? S.q.emotes : S.q.emoji;
    if (q && g.sel < 0 && g.flat.length) g.setSel(0, false);
  }

  function setQuery(v) {
    if (!S) return;
    const q = String(v || "");
    if (S.view === "effects") {
      S.q.effects = q;
      if (S.fxView && S.fxView.filter) S.fxView.filter(q);
      return;
    }
    if (S.view === "emoji") {
      S.q.emoji = q;
      S.egrid.reset();
      S.egrid.set(emojiSections());
      selectBest();
      setNav(S.egrid.nav);
      updateFoot();
      return;
    }
    S.q.emotes = q;
    S.grid.reset();
    S.mdl = emoteModel();
    S.sig = sigOf(S.mdl);
    S.grid.set(gridSections(S.mdl));
    selectBest();
    setNav(S.grid.nav);
    updateFoot();
  }

  /* ── плитки ─────────────────────────────────────────────────────────────── */

  // Плитка сразу нужного размера, картинка — чуть позже (79_grid: fillLater).
  function emoteCell(it, i) {
    const fav = EM.isFav(it);
    const b = el("button", {
      type: "button",
      class: "cpx-emm-cell cpx-emm-cell--wait cpx-mz cpx-k1" + (it.zw ? " cpx-emm-cell--zw" : "") + (fav ? " cpx-emm-cell--fav" : ""),
      tabindex: "-1",
      role: "option",
      "aria-label": it.n,
      "data-i": String(i),
    });
    if (it.zw) b.dataset.cpxTip = t("emm.zw");
    // Звёздочка: видна при наведении (у избранного — всегда); щелчок по ней — избранное.
    // Без подсказки (владелец 05.10): звёздочка — избранное, это и так понятно; у плитки остаётся имя смайлика.
    b.appendChild(el("span", { class: "cpx-emm-star", "data-act": "fav", "aria-hidden": "true" }));
    // Лёгкая картинка — сразу, без ожидания ряда (~0,5–1 КБ, обычно уже в кэше: фоновая подгрузка
    // сетки), и пустых плиток при прокрутке нет: у анимированных 7TV/BTTV — первый кадр (анимацию
    // поставит fillEmote, когда ряд задержится), у неанимированных 7TV — сама картинка.
    // Не пришла — убрать картинку: остаётся ровная заглушка плитки (К7 правил основного чата 19.11 — ни имени текстом,
    // ни «битой картинки»; имя — в подсказке и aria-label плитки).
    const still = EM.img(it, {
      still: true,
      size: EM.size(it),
      prio: 0,
      className: "cpx-emm-img cpx-emm-img--still",
      onDead: (img) => img.remove(),
    });
    if (still) {
      learnFrom(it, still);
      loadedOf(b, still);
      b.insertBefore(still, b.firstChild);
    } else if (it.p === "7tv") {
      plainEmote(b, it);
    }
    return b;
  }

  const emoteText = (it) => el("span", { class: "cpx-emm-cell__txt", text: it.n });

  /** Пришла картинка плитки — заглушку (--wait) долой. */
  function loadedOf(b, im) {
    if (im.complete && im.naturalWidth > 0) return b.classList.remove("cpx-emm-cell--wait");
    im.addEventListener("load", () => b.classList.remove("cpx-emm-cell--wait"), { once: true });
  }

  /** 7TV сейчас «медленный» и зеркала нет (К5, 64_mirror_img): окно — только видимое, без анимаций в сетке. */
  function slow7tv() {
    const R = CPX.imgRoute;
    return !!(R && R.slow && R.slow() && !(R.state && R.state().on));
  }

  // Обычная картинка плитки (как было до неподвижных): не пришла — заглушка (К7). Нет адреса вовсе — имя текстом.
  function plainEmote(b, it) {
    const im = EM.img(it, { size: EM.size(it), prio: 0, onDead: (img) => img.remove() });
    if (!im) {
      b.classList.remove("cpx-emm-cell--wait");
      return b.insertBefore(emoteText(it), b.firstChild);
    }
    learnFrom(it, im);
    loadedOf(b, im);
    b.insertBefore(im, b.firstChild);
  }

  /* Анимации плиток — очередью, не больше ANIM_MAX сразу и только тем, кто ещё на экране. 🔴30.09:
   * разом полсотни анимаций по 30–90 КБ забивали канал, и лёгкие неподвижные картинки новых рядов
   * ждали за ними. Ушедшая с экрана плитка из очереди выпадает (вернётся — заполнится заново).
   * Закрыли окно — очередь сбрасывается (gen). */
  // 🔴01.10 (жалоба владельца «анимированные — только если долистал и подождал»): место в очереди
  // держали загрузки плиток, уже уехавших за экран, — до 10 с каждая; долистал — а очередь качает
  // пролистанное. Теперь ушедшая с экрана плитка место отдаёт (animSweep; сама картинка докачивается
  // в кэш — пригодится, если вернутся), и мест больше: у 7TV HTTP/2, параллельные запросы дёшевы.
  // Замер того же дня (ответ 7TV 1,5 с): при 8 местах экран (~100 анимаций) вставал за ~20 с — упор
  // в ожидание ответа, не в объём. Теперь мест вчетверо больше, очередь — по месту на экране (сверху
  // вниз; прокрутил — новые не ждут за прежними), а уже загруженные на странице (наперёд или в
  // прошлое открытие) идут из кэша браузера мимо очереди.
  const ANIM_MAX = 32;
  const ANIM_MAX_PRE = 24; // пока идёт фоновая подгрузка лёгких картинок (первые кадры всего набора — до минуты)
  const ANIM_GONE_MS = 500;
  const ANIM_SLOT_MS = 30000; // не пришла за столько — место отдаём следующей (сама картинка ещё может прийти); К3 — не короче 30 с
  const anim = { q: [], busy: 0, gen: 0, live: new Set(), dirty: false, soon: false };
  const animOk = new CPX.LRU(3000); // ключи анимаций, уже загруженных на этой странице (в кэше браузера)
  const animMax = () => (S && S.grid && S.grid.preActive() ? ANIM_MAX_PRE : ANIM_MAX);
  function animQueue(b, it) {
    const j = { b, it, gen: anim.gen, at: Date.now() };
    if (animOk.has(it.k)) return animLoad(Object.assign(j, { free: true })); // из кэша — без очереди
    anim.q.push(j);
    anim.dirty = true;
    // Ряд заполняется плитка за плиткой — очередь разобрать один раз, после всего ряда.
    if (anim.soon) return;
    anim.soon = true;
    queueMicrotask(() => {
      anim.soon = false;
      CPX.safely("emote-menu:anim", animPump);
    });
  }
  /** Загрузки плиток, ушедших с экрана дольше ANIM_GONE_MS, — место в очереди видимым. */
  function animSweep() {
    clearTimeout(anim.sweepT);
    anim.sweepT = 0;
    anim.dirty = true; // экран сдвинулся — очерёдность заново
    const now = Date.now();
    let wait = false;
    for (const rec of [...anim.live]) {
      if (rec.b.isConnected) {
        rec.goneAt = 0;
        continue;
      }
      if (!rec.goneAt) rec.goneAt = now;
      if (now - rec.goneAt >= ANIM_GONE_MS) {
        // Уехала с экрана — загрузку отменить: на медленной связи она делила канал с видимыми, и те
        // не приходили вовсе (замер 01.10: 300 КБ/с — после прокрутки 0 анимаций за 3 с).
        if (rec.im && !(CPX.imgRoute && CPX.imgRoute.cancel && CPX.imgRoute.cancel(rec.im))) {
          rec.im.removeAttribute("srcset");
          rec.im.removeAttribute("src");
        }
        rec.cancelled = true;
        rec.end();
      } else wait = true;
    }
    // Прокрутка утихла раньше срока — досмотреть самим.
    if (wait) anim.sweepT = setTimeout(() => CPX.safely("emote-menu:sweep", animSweep), ANIM_GONE_MS);
    animPump();
  }

  function animReset() {
    anim.gen++;
    anim.q.length = 0;
    anim.busy = 0;
    anim.live.clear();
    clearTimeout(anim.sweepT);
    ahead.gen++;
    ahead.busy = 0;
    ahead.spent = 0;
    ahead.done.clear();
    clearTimeout(ahead.t);
  }

  /* Анимации НАПЕРЁД (просьба владельца 01.10: анимированные вставали, только когда долистал до них и
   * подождал — каждая с 7TV идёт 1–5 с). Пока окно открыто, анимированные картинки плиток рядом с
   * экраном (два экрана ниже, один выше) грузятся заранее в кэш браузера — тем же адресом, что и
   * у плитки (EM.img), так что долистал — анимация встаёт сразу. Видимые грузит очередь выше (anim) —
   * наперёд начинаем, только когда она опустела. Бережно (замер 01.10: без меры за 10 с уходило 400
   * анимаций, ~15–20 МБ): полтора экрана ниже и пол-экрана выше, не больше AHEAD_MAX сразу (пока идёт
   * лёгкая подгрузка — AHEAD_MAX_PRE), не больше AHEAD_BUDGET за открытие окна (повторно — из кэша
   * браузера: 7TV отдаёт картинки с хранением на год); экономия трафика и медленный 7TV без зеркала (К5) — не грузим;
   * «сначала зеркало» — грузим (очередь зеркала с пределами, 64); прокрутка — окно наперёд пересчитывается (уже
   * загруженное не повторяется). Только когда видимое пришло (К1) и последним уровнем очереди 64. */
  const AHEAD_MAX = 16;
  const AHEAD_MAX_PRE = 12;
  const AHEAD_BUDGET = 250;
  const AHEAD_WAIT = 30000; // К3: срок не короче 30 с (место отдаём, картинку не обрываем)
  const AHEAD_KICK = 150;
  const ahead = { busy: 0, spent: 0, gen: 0, done: new Set(), t: 0 };

  // «Сначала зеркало» (PLUS) — наперёд можно: очередь зеркала с пределом запусков в секунду (64: MAX, RATE; замер 19.11 —
  // прослойка хостера 32 одновременных держит, основной чат: набор через зеркало — целиком).
  function aheadAllowed() {
    // К5: медленный 7TV — только видимое (сам 7TV пропускает take; BTTV — наперёд, как обычно).
    // К1: наперёд — только когда картинки видимого пришли.
    if (CPX.imgRoute && CPX.imgRoute.pending && CPX.imgRoute.pending(1) > 0) return false;
    const c = navigator.connection;
    return !(c && c.saveData);
  }

  function aheadKick() {
    clearTimeout(ahead.t);
    ahead.t = setTimeout(() => CPX.safely("emote-menu:ahead", aheadPump), AHEAD_KICK);
  }

  function aheadPump() {
    if (!S || !S.grid || S.view !== "emotes" || !isOpen() || !aheadAllowed()) return;
    const g = S.grid;
    const max = g.preActive() ? AHEAD_MAX_PRE : AHEAD_MAX;
    if (ahead.busy >= max || ahead.spent >= AHEAD_BUDGET) return;
    if (anim.q.length || anim.busy) return; // сначала видимые (их очередь позовёт снова)
    const vr = g.visibleRange();
    if (!vr) return;
    const [a, b] = vr;
    const n = Math.max(1, b - a + 1);
    const flat = g.flat || [];
    const hi = Math.min(flat.length - 1, b + Math.round(1.5 * n));
    const lo = Math.max(0, a - Math.round(0.5 * n));
    const gen = ahead.gen;
    const take = (i) => {
      const f = flat[i];
      const it = f && f.it;
      if (!it || ahead.done.has(it.k) || !EM.stillUrls(it)) return; // только анимированные
      if (it.p === "7tv" && slow7tv()) return; // К5: медленный 7TV — только видимое
      ahead.done.add(it.k);
      const im = EM.img(it, { size: EM.size(it), detached: true, prio: 2 });
      if (!im) return;
      ahead.busy++;
      ahead.spent++;
      let fin = false;
      const done = () => {
        if (fin) return;
        fin = true;
        clearTimeout(t);
        if (gen !== ahead.gen) return;
        ahead.busy = Math.max(0, ahead.busy - 1);
        aheadPump();
      };
      const t = setTimeout(done, AHEAD_WAIT);
      im.addEventListener("load", () => (animOk.set(it.k, 1), done()), { once: true });
      im.addEventListener("error", done, { once: true });
    };
    // Сначала вниз от экрана (туда листают чаще), потом вверх; видимые — не наши (очередь anim).
    for (let i = b + 1; i <= hi && ahead.busy < max && ahead.spent < AHEAD_BUDGET; i++) take(i);
    for (let i = a - 1; i >= lo && ahead.busy < max && ahead.spent < AHEAD_BUDGET; i--) take(i);
  }
  function animPump() {
    // Медленный 7TV без зеркала (К5/К6): анимаций 7TV в сетке больше не просим — ждущие 7TV снять (по наведению — можно);
    // BTTV отдаёт быстро — его анимации идут как обычно (ревью 19.11: снимались и они).
    if (slow7tv()) {
      const rest = [];
      for (const j of anim.q.splice(0)) {
        if (j.it && j.it.p === "7tv") delete j.b.dataset.filled;
        else rest.push(j);
      }
      anim.q.push(...rest);
      if (!rest.length) return;
    }
    if (anim.dirty) {
      anim.dirty = false;
      // Сначала видимые сверху вниз, потом ближние к экрану (79_grid rank). 🔴01.10: очередь в 200
      // плиток шла строго по приходу — прокрутил, и новые ждали за прежними.
      const g = S && S.grid;
      if (g && g.rank && anim.q.length > 1) {
        for (const j of anim.q) j.r = g.rank(+j.b.dataset.i);
        anim.q.sort((x, y) => x.r - y.r);
      }
    }
    while (anim.busy < animMax() && anim.q.length) {
      const j = anim.q.shift();
      // Ряды, видимые сразу после пересборки, заполняются ДО вставки в документ (79_grid fillNow) —
      // свежую плитку не считаем ушедшей.
      if (!j.b.isConnected && Date.now() - j.at > ANIM_GONE_MS) {
        delete j.b.dataset.filled;
        continue;
      }
      anim.busy++;
      animLoad(j);
    }
  }
  function animLoad(j) {
    const { b, it } = j;
    b.dataset.animOn = "1";
    let fin = false;
    const rec = { b, goneAt: 0, end: () => end() };
    anim.live.add(rec);
    const end = () => {
      if (fin) return;
      fin = true;
      clearTimeout(t);
      anim.live.delete(rec);
      if (j.gen !== anim.gen) return;
      if (!j.free) anim.busy = Math.max(0, anim.busy - 1);
      animPump();
      if (!anim.q.length && !anim.busy) aheadKick(); // видимые догрузились — наперёд
    };
    const t = setTimeout(end, ANIM_SLOT_MS);
    // Анимация грузится вне плитки и встаёт на место неподвижной, когда пришла (без пустого мига).
    // Не пришла совсем — остаётся неподвижная; нет и её — заглушка (К7).
    const im = EM.img(it, {
      size: EM.size(it),
      anchor: b,
      prio: j.prio != null ? j.prio : 1, // К1: после неподвижных кадров видимого; по наведению — как видимое
      onDead: () => {
        if (rec.cancelled) return;
        end();
        b.dataset.animDead = "1";
      },
    });
    if (!im) return end();
    rec.im = im;
    learnFrom(it, im);
    im.addEventListener(
      "load",
      () => {
        if (rec.cancelled) return;
        end();
        animOk.set(it.k, 1);
        b.classList.remove("cpx-emm-cell--wait");
        const cur = b.querySelector(".cpx-emm-img--still");
        if (cur) cur.replaceWith(im);
        else if (!im.isConnected) b.insertBefore(im, b.firstChild);
      },
      { once: true }
    );
  }

  // Размер не знали (BTTV) — узнали по картинке (первый кадр или анимация — что раньше):
  // сетку переложить (место сохраняется).
  function learnFrom(it, im) {
    if (it.w > 0 && it.h > 0) return;
    if (it.p === "twitch") return;
    im.addEventListener(
      "load",
      () => {
        if (EM.learn(it, im.naturalWidth, im.naturalHeight)) learnedSoon();
      },
      { once: true }
    );
  }

  // Фоновая подгрузка сетки (79_grid, o.pre): первые кадры анимированных 7TV и сами неподвижные
  // 7TV — медленный только 7TV, BTTV/FFZ/Twitch отдают картинки быстро. «Сначала зеркало» (PLUS) — тоже: очередь
  // зеркала держит пределы сервера (64: MAX, RATE; основной чат 19.11 — набор через зеркало приходит целиком).
  // Медленный 7TV без зеркала (К5) и экономия трафика в системе — нет.
  function preloadEmote(it) {
    if (it.p !== "7tv") return null;
    if (slow7tv()) return null; // К5: медленный 7TV — только видимое
    const c = navigator.connection;
    if (c && c.saveData) return null;
    // Фоновое — последним уровнем очереди (К1): видимое и его анимации идут раньше.
    return EM.img(it, Object.assign(EM.stillUrls(it) ? { still: true } : {}, { detached: true, prio: 2 }));
  }

  // Плитка перешла в новую раскладку (79_grid) или сменилось избранное — звёздочка и подсказка.
  function updateEmoteCell(b, it) {
    const fav = EM.isFav(it);
    b.classList.toggle("cpx-emm-cell--fav", fav);
  }

  function fillEmote(b, it) {
    // Первый кадр уже стоит (emoteCell) — анимация очередью, но только после него (К6).
    if (EM.stillUrls(it)) return animAfterStill(b, it);
    // Неанимированный 7TV уже с картинкой (emoteCell).
    if (b.querySelector(".cpx-emm-img, .cpx-emm-cell__txt")) return;
    plainEmote(b, it);
  }

  /** К6 (правила 19.11): анимация — только у клетки на экране и после её неподвижного кадра; 7TV медленный (без
   *  зеркала) — в сетке не запускаем вовсе, только по наведению (onCellOver). */
  function animAfterStill(b, it) {
    if (it.p === "7tv" && slow7tv()) return;
    const still = b.querySelector(".cpx-emm-img--still");
    if (!still || (still.complete && still.naturalWidth > 0)) return animQueue(b, it);
    still.addEventListener(
      "load",
      () => {
        if (b.isConnected && S && !b.dataset.animOn) animQueue(b, it);
      },
      { once: true }
    );
  }

  function learnedSoon() {
    if (!S || S.learnT) return;
    const mine = S;
    S.learnT = setTimeout(() => {
      if (S !== mine) return;
      S.learnT = 0;
      CPX.safely("emote-menu:learn", () => {
        if (S.view === "emotes") S.grid.relayout({ anchor: true });
        else S.dirty = true;
      });
    }, 200);
  }

  /* ── эмодзи ─────────────────────────────────────────────────────────────── */

  function emojiSections() {
    const E = CPX.emoji;
    const q = S.q.emoji.trim();
    if (q) return [{ id: "e:results", nav: "", title: t("emm.s.results"), count: true, items: E.search(q), empty: t("emm.empty.search", { q }) }];
    const out = [];
    const rec = E.recent();
    if (rec.length) out.push({ id: "e:recent", nav: "e:recent", title: t("emm.emoji.recent"), items: rec.slice(0, 27) });
    for (const c of E.cats()) out.push({ id: "e:" + c.key, nav: "e:" + c.key, title: c.title, count: true, items: c.items });
    return out;
  }

  function emojiCell(it, i) {
    return el("button", { type: "button", class: "cpx-emm-cell cpx-mz cpx-k1 cpx-emm-cell--emoji", tabindex: "-1", role: "option", "aria-label": it.en.split("|")[0], "data-i": String(i) });
  }
  function fillEmoji(b, it) {
    b.textContent = CPX.emoji.text(it);
  }

  function renderTone() {
    const tn = CPX.emoji.tone();
    S.toneBtn.textContent = CPX.emoji.TONES[tn];
    S.toneBtn.setAttribute("aria-label", t("emm.tone") + ": " + t("emm.tone." + tn));
    S.toneBtn.dataset.cpxTip = t("emm.tone") + ": " + t("emm.tone." + tn);
  }

  function onToneClick() {
    if (!S) return;
    const cur = CPX.emoji.tone();
    CPX.ui.menu({
      anchor: S.toneBtn,
      side: "bottom",
      align: "end",
      label: t("emm.tone"),
      items: CPX.emoji.TONES.map((g, i) => ({ id: "tone" + i, label: g + "  " + t("emm.tone." + i), checked: i === cur })),
      onSelect: (item) => {
        const v = +String(item.id).slice(4);
        CPX.emoji.setTone(v);
        if (!S) return;
        renderTone();
        // Эмодзи в сетке — заново (оттенок в тексте плиток).
        S.egrid.relayout({ anchor: true });
        updateFoot();
      },
    });
  }

  /* ── боковая лента разделов ─────────────────────────────────────────────── */

  function renderSide() {
    S.side.textContent = "";
    const v = S.view;
    S.side.hidden = !(v === "emotes" || v === "emoji");
    S.body.classList.toggle("cpx-emm-body--side", !S.side.hidden);
    if (S.side.hidden) return;
    const add = (nav, tip, fill) => {
      const b = el("button", { type: "button", class: "cpx-emm-sideb cpx-mz cpx-k1", role: "tab", "data-nav": nav, "aria-label": tip, "data-cpx-tip": tip, "data-cpx-tip-side": "left", "aria-selected": "false" });
      fill(b);
      S.side.appendChild(b);
    };
    if (v === "emotes") {
      if (!S.mdl) return;
      let last = "";
      for (const n of S.mdl.nav) {
        // Разделитель между группами: личные / канал / Twitch / глобальные.
        const grp = n.id.startsWith("tw:") ? "tw" : n.id.startsWith("ps:") ? "ps" : n.id;
        if (last && grp !== last && (grp === "tw" || grp === "global" || grp === "channel" || grp === "ps")) S.side.appendChild(el("span", { class: "cpx-emm-side__sep", "aria-hidden": "true" }));
        last = grp;
        add(n.id, n.tip, (b) => {
          const src = n.avatar && CPX.safe.imgUrl(n.avatar);
          const em = !src && n.item ? EM.img(n.item, { box: { w: 24, h: 22 }, className: "cpx-emm-side__em", onDead: (im) => im.replaceWith(CPX.ui.icon(n.icon || "smile", 16)) }) : null;
          if (em) b.appendChild(em);
          else if (src) {
            const im = el("img", { class: "cpx-emm-side__av cpx-k1", alt: "", draggable: "false", decoding: "async", loading: "lazy" });
            im.src = src;
            im.addEventListener("error", () => im.replaceWith(CPX.ui.icon(n.icon || "emmTwitch", 16)), { once: true });
            b.appendChild(im);
          } else b.appendChild(CPX.ui.icon(n.icon || "smile", 16));
        });
      }
    } else {
      if (CPX.emoji.recent().length) add("e:recent", t("emm.emoji.recent"), (b) => b.appendChild(CPX.ui.icon("clock", 16)));
      for (const c of CPX.emoji.cats()) add("e:" + c.key, c.title, (b) => b.appendChild(el("span", { class: "cpx-emm-side__emo", text: c.icon })));
    }
    S.nav = "";
    const g = curGrid();
    setNav(g ? g.nav : "");
  }

  function setNav(nav) {
    if (!S) return;
    S.nav = nav;
    const q = S.view === "emotes" ? S.q.emotes : S.q.emoji;
    for (const b of S.side.children) {
      if (!b.dataset || !b.dataset.nav) continue;
      const on = !q && b.dataset.nav === nav;
      if (on === b.classList.contains("cpx-on")) continue;
      b.classList.toggle("cpx-on", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
      // Лента длиннее окна — текущий раздел держим в виду.
      if (on && S.side.scrollHeight > S.side.clientHeight) {
        const top = b.offsetTop;
        if (top < S.side.scrollTop || top + b.offsetHeight > S.side.scrollTop + S.side.clientHeight) S.side.scrollTop = Math.max(0, top - S.side.clientHeight / 2);
      }
    }
  }

  function onSideClick(e) {
    const b = e.target.closest && e.target.closest(".cpx-emm-sideb");
    if (!b || !S) return;
    const nav = b.dataset.nav;
    const g = curGrid();
    if (!g) return;
    // Раздел ищут среди всех — поиск сбросить.
    const q = S.view === "emotes" ? S.q.emotes : S.q.emoji;
    if (q) {
      S.search.value = "";
      setQuery("");
    }
    g.jump(nav, !reduced());
    setNav(nav);
  }

  /* ── выбор, наведение, нижняя строка ────────────────────────────────────── */

  function setHover(it) {
    if (!S || it === S.hover) return;
    S.hover = it;
    updateFoot();
  }

  function onCellOver(e, g) {
    const i = g.indexOf(e.target);
    const it = i >= 0 && g.flat[i] ? g.flat[i].it : null;
    setHover(it);
    // Медленный 7TV: анимации в сетке не запускаем — только по наведению (К6), сразу, как видимое.
    if (it && it.p === "7tv" && g === S.grid && slow7tv() && EM.stillUrls(it)) {
      const b = g.node(i);
      if (b && !b.dataset.animOn) animLoad({ b, it, gen: anim.gen, at: Date.now(), free: true, prio: 0 });
    }
  }

  function itemLabel(it) {
    if (it.p === "twitch") return t("tip.emote.twitch") + (it.set && it.set !== "Twitch" ? " · " + it.set : "");
    if (it.p === "bttv" && it.s === "channel" && it.own) return t("tip.emote.bttv.shared");
    return t("tip.emote." + it.p + "." + (it.s === "personal" || it.s === "channel" ? it.s : "global"));
  }

  function updateFoot(fxRow) {
    if (!S || !S.foot) return;
    const f = S.foot;
    f.hidden = S.view === "item" || S.view === "gif";
    if (f.hidden) return;
    f.textContent = "";
    const hint = (text) => f.appendChild(el("div", { class: "cpx-emm-foot__hint", text }));
    if (S.view === "effects") {
      if (!fxRow) return hint(t("emm.fx.hint"));
      const name = CPX.fx.title(fxRow.effect);
      const where = t(fxRow.src === "ffz" ? "emm.fx.after" : "emm.fx.before");
      f.appendChild(
        el("div", { class: "cpx-emm-foot__text" }, [
          el("div", { class: "cpx-emm-foot__name" }, [name, " ", el("code", { class: "cpx-emm-foot__code", text: fxRow.code })]),
          el("div", { class: "cpx-emm-foot__sub", text: fxRow.locked ? t("emm.fx.locked") : fxRow.plusOnly ? t("emm.fx.beforePlus") : where }),
        ])
      );
      return;
    }
    const g = curGrid();
    const it = S.hover || (g ? g.selected() : null);
    if (!it) {
      if (S.flash && Date.now() < S.flash.until) {
        f.appendChild(el("div", { class: "cpx-emm-foot__hint cpx-emm-foot__hint--flash", text: S.flash.text }));
        return;
      }
      const k = stays() ? "emm.hintK" : "emm.hint";
      return hint(S.view === "emoji" ? t(stays() ? "emm.hintKEmoji" : "emm.hintEmoji") : t(fxOn() ? k : k + "NoFx"));
    }
    if (S.view === "emoji") {
      // По-русски — русское название (если есть) и английское строкой ниже; иначе — английское.
      const en = it.en.split("|")[0];
      const ru = CPX.i18n.lang === "ru" && it.ru ? it.ru.split(", ")[0] : "";
      f.appendChild(el("span", { class: "cpx-emm-foot__pic cpx-emm-foot__emo", text: CPX.emoji.text(it) }));
      const text = el("div", { class: "cpx-emm-foot__text" }, [el("div", { class: "cpx-emm-foot__name", text: ru || en })]);
      if (ru) text.appendChild(el("div", { class: "cpx-emm-foot__sub", text: en }));
      f.appendChild(text);
      return;
    }
    const pic = el("span", { class: "cpx-emm-foot__pic" });
    const im = EM.img(it, { box: { w: 56, h: 28 }, className: "cpx-emm-foot__img" });
    if (im) pic.appendChild(im);
    // Zero-width — первым словом (полная подсказка — у самой плитки).
    const sub = it.zw ? [t("emm.zwShort"), itemLabel(it)] : [itemLabel(it)];
    if (it.own && it.p !== "twitch") sub.push(t("tip.by", { name: it.own }));
    const name = el("div", { class: "cpx-emm-foot__name" }, [el("span", { text: it.n })]);
    if (EM.isFav(it)) name.appendChild(el("span", { class: "cpx-emm-foot__fav", "aria-label": t("emm.g.fav") }));
    f.appendChild(pic);
    f.appendChild(el("div", { class: "cpx-emm-foot__text" }, [name, el("div", { class: "cpx-emm-foot__sub", text: sub.join(" · ") })]));
  }

  function flash(text) {
    if (!S) return;
    S.flash = { text, until: Date.now() + 6000 };
    clearTimeout(S.flashT);
    const mine = S;
    S.flashT = setTimeout(() => S === mine && updateFoot(), 6100);
    updateFoot();
  }

  /* ── вставка и избранное ────────────────────────────────────────────────── */

  function put(text, keep, word) {
    const ok = CPX.safely("emote-menu:insert", () => CPX.input.insert(text, { word: word !== false }));
    if (!ok) {
      CPX.ui.toast.error(t("emm.noInput"));
      return false;
    }
    if (!keep && !stays()) finish();
    return true;
  }

  // Twitch после вставки сам ставит курсор в своё поле (и забирает фокус). Окно осталось открытым
  // по Shift — вернуть фокус в поиск, когда Twitch закончит, чтобы клавиатура шла дальше.
  function refocus() {
    const mine = S;
    setTimeout(() => S === mine && isOpen() && S.view !== "item" && focusSearch(), 150);
  }

  function insertItem(it, keep) {
    if (S && S.view === "emoji") {
      // Эмодзи — текстом, без насильных пробелов (как набранный с клавиатуры).
      if (put(CPX.emoji.text(it), keep, false)) CPX.emoji.pushRecent(it);
      return;
    }
    if (put(it.n, keep)) EM.pushRecent(it);
  }

  function toggleFav(it) {
    if (!it || !S) return;
    const on = EM.toggleFav(it);
    if (on === null) {
      // Тостом, а не строкой внизу: под мышью плитка — нижняя строка занята ею.
      CPX.ui.toast({ text: t("emm.fav.full", { n: EM.FAV_MAX }), kind: "info" });
      return;
    }
    flash(t(on ? "emm.fav.added" : "emm.fav.removed", { name: it.n }));
    // Звёздочки видимых плиток — сразу; разделы (избранное) — пересборкой с сохранением места.
    for (const c of S.space.querySelectorAll(".cpx-emm-cell[data-i]")) {
      const f = S.grid.flat[+c.dataset.i];
      if (f && f.it.k === it.k) updateEmoteCell(c, it);
    }
    refresh(false);
  }

  function onCellClick(e, g) {
    if (!S) return;
    const i = g.indexOf(e.target);
    if (i < 0 || !g.flat[i]) return;
    const it = g.flat[i].it;
    g.setSel(i, false);
    if (g === S.grid && (e.altKey || (e.target.closest && e.target.closest("[data-act='fav']")))) {
      toggleFav(it);
      return;
    }
    // Курсор был в нашем поиске — после Shift+щелчка вернуть его туда, как после Shift+Enter
    // (вставка уводит фокус в поле Twitch). Был в поле Twitch — там и остаётся.
    const a = S.root.getRootNode().activeElement;
    const inside = !!a && S.root.contains(a);
    insertItem(it, e.shiftKey);
    if (e.shiftKey && inside) refocus();
  }

  function onCellMenu(e, g) {
    if (!S) return;
    e.preventDefault();
    if (g !== S.grid) return;
    const i = g.indexOf(e.target);
    if (i < 0 || !g.flat[i]) return;
    g.setSel(i, false);
    itemMenu(g.flat[i].it, e);
  }

  // Меню смайлика (правый щелчок, клавиша меню, Shift+F10): избранное, эффекты, вставить не закрывая.
  function itemMenu(it, e, anchor) {
    const fav = EM.isFav(it);
    const items = [{ id: "fav", label: t(fav ? "emm.fav.remove" : "emm.fav.add"), icon: "emmStar" }];
    if (fxOn()) items.push({ id: "fx", label: t("emm.menu.fx"), icon: "emmSparkle" });
    if (!stays()) items.push("-", { id: "keep", label: t("emm.menu.insert"), icon: "plus" });
    CPX.ui.menu({
      items,
      event: e && e.clientX ? e : null,
      anchor: e && e.clientX ? null : anchor,
      // Хозяин — само меню смайликов: выбор пункта мышью не «щелчок мимо» (оно не закрывается).
      owner: S.h,
      label: it.n,
      onSelect: (x) => {
        if (!S) return;
        if (x.id === "fav") toggleFav(it);
        else if (x.id === "fx") setView("item", it, { kb: !(e && e.clientX) });
        else if (x.id === "keep") {
          insertItem(it, true);
          refocus();
        }
      },
    });
  }

  /* ── виды: смайлики / эмодзи / GIF / эффекты / эффекты смайлика ─────────── */

  /** o: {kb} — эффекты смайлика открыты с клавиатуры (встать на первую строку). */
  function setView(v, it, o) {
    if (!S) return;
    if ((v === "effects" || v === "item") && !fxOn()) v = "emotes";
    if (v === "item" && !it) v = "effects";
    if (v === "gif" && !(gifApi() && S.gif && S.gif.ok && !S.gif.hidden)) v = S.view === "gif" ? "emotes" : S.view || "emotes";
    const prev = S.view;
    if (prev === "emotes" || prev === "emoji") S.scrollTop[prev] = curGrid().scroll.scrollTop;
    if (prev === "gif" && v !== "gif") dropGif();
    if (v === "item") S.back = prev === "item" ? S.back : prev;
    S.view = v;
    S.root.dataset.view = v;
    S.scroll.hidden = v !== "emotes";
    S.escroll.hidden = v !== "emoji";
    S.gifBox.hidden = v !== "gif";
    S.fxBox.hidden = !(v === "effects" || v === "item");
    S.top.hidden = v === "item" || v === "gif";
    S.gifTop.hidden = v !== "gif";
    S.bar.hidden = v === "item"; // у эффектов смайлика своя строка «← назад»
    S.tabs.hidden = v === "item";
    S.toneBtn.hidden = v !== "emoji";
    S.fxBox.textContent = "";
    S.fxView = null;
    S.hover = null;
    if (v !== "item" && v !== "gif") {
      S.search.value = S.q[v] || "";
      S.search.input.placeholder = t(v === "effects" ? "emm.searchFx" : v === "emoji" ? "emm.searchEmoji" : "emm.search");
      S.search.input.setAttribute("aria-label", S.search.input.placeholder);
    }
    if (v === "emoji") renderTone();
    renderSide();
    if (v === "effects") renderCatalog();
    else if (v === "item") renderItem(it, { kb: !!(o && o.kb) });
    else if (v === "gif") mountGif();
    else {
      // Сетка снова видна: разложить сразу (чтение ширины само досчитает раскладку страницы) —
      // кадр ждём, только если размеров ещё нет (окно ещё не показано; в Firefox без окна кадры
      // почти не идут, и вкладка ждала бы их секундами).
      const mine = S;
      const show = () => {
        if (S !== mine || S.view !== v) return true;
        const g = curGrid();
        if (!g.scroll.clientWidth) return false;
        if (v === "emoji") {
          if (!g.rows.length || g.scroll.clientWidth !== g.width) g.set(emojiSections());
        } else if (S.dirty || g.scroll.clientWidth !== g.width || !g.rows.length) {
          S.dirty = false;
          g.sections = gridSections(S.mdl);
          g.relayout();
        }
        const j = v === "emotes" ? S.jump : null;
        S.jump = null;
        if (j) g.jump(j, false);
        else {
          g.scroll.scrollTop = S.scrollTop[v] || 0;
          g.paint();
        }
        selectBest();
        renderSide();
        updateFoot();
        return true;
      };
      if (!show()) requestAnimationFrame(show);
    }
    setTabSel(v === "item" ? "effects" : v);
    updateFoot();
  }

  function mountGif() {
    const api = gifApi();
    if (!api) return;
    dropGif();
    S.gifBox.textContent = "";
    S.gifTop.textContent = "";
    const mine = S;
    const ch = (CPX.chat.state && CPX.chat.state.channelId) || "";
    S.gifH =
      CPX.safely("emote-menu:gif:mount", () =>
        api.mount(S.gifBox, {
          channelId: ch,
          topHost: S.gifTop,
          onSent: () => S === mine && !S.win && finish(),
          onClose: () => S === mine && close("gif"),
        })
      ) || null;
    requestAnimationFrame(() => S === mine && S.gifH && S.gifH.focus && CPX.safely("emote-menu:gif:focus", () => S.gifH.focus()));
  }

  // Подписка, данные FFZ или настройки сменились — вид эффектов пересобрать на месте: прокрутка
  // остаётся, отмеченные у смайлика эффекты — тоже (кроме ставших запертыми).
  function rebuildFx() {
    if (!S || !S.fxView) return;
    const old = S.fxView;
    const top = old.scroller ? old.scroller.scrollTop : 0;
    const hadFocus = (() => {
      const a = S.root.getRootNode().activeElement;
      return !!a && old.el.contains(a);
    })();
    S.fxBox.textContent = "";
    S.fxView = null;
    if (S.view === "effects") {
      if (S.preview && !S.preview.any) S.preview = null; // смайлики канала пришли — есть на чём показать
      renderCatalog();
    } else if (S.view === "item" && old.item) renderItem(old.item, { selected: old.selected(), refocus: hadFocus });
    if (S.fxView && S.fxView.scroller) S.fxView.scroller.scrollTop = top;
  }

  function renderCatalog() {
    S.fxSig = EM.fx.sig();
    if (!S.preview) S.preview = EM.fx.pick(null);
    const v = EM.views.catalog({
      style: S.style,
      maxW: fxPreviewMax(),
      preview: S.preview,
      q: S.q.effects,
      onPick: pickEffect,
      onShuffle: () => {
        S.preview = EM.fx.pick(S.preview && S.preview.any);
        S.fxBox.textContent = "";
        renderCatalog();
      },
      onHover: (r) => updateFoot(r),
    });
    S.fxView = v;
    S.fxBox.appendChild(v.el);
  }

  function pickEffect(row, e) {
    if (row.locked) {
      CPX.ui.toast({ text: t("emm.fx.locked"), kind: "info" });
      return;
    }
    if (!put(row.code, true)) return;
    // Как в клиенте: код сразу в поле. Дальше нужен смайлик — показываем их (Shift — остаться).
    if (!(e && e.shiftKey)) {
      setView("emotes");
      flash(t("emm.fx.added", { code: row.code }));
    }
    refocus();
  }

  // o: {kb, selected, refocus} — открыто с клавиатуры / пересборка с прежним выбором.
  function renderItem(it, o) {
    o = o || {};
    S.fxSig = EM.fx.sig();
    const v = EM.views.item({
      style: S.style,
      maxW: fxPreviewMax(),
      item: it,
      selected: o.selected,
      onBack: () => {
        setView(S.back || "emotes");
        focusSearch();
      },
      onInsert: (text, e, item) => {
        if (put(text, !!(e && e.shiftKey))) EM.pushRecent(item);
      },
    });
    S.fxView = v;
    S.fxBox.appendChild(v.el);
    if (o.selected && !o.refocus) return; // пересборка, а фокус был не здесь — не трогать
    const mine = S;
    requestAnimationFrame(() => S === mine && S.fxView === v && v.focus(!!o.kb));
  }

  /* ── клавиатура ─────────────────────────────────────────────────────────── */

  function onKey(e) {
    if (!S || e.isComposing) return;
    let done = false;
    if (S.view === "emotes" || S.view === "emoji") done = keyGrid(e, curGrid());
    else if (S.view === "effects" || S.view === "item") done = S.fxView && S.fxView.key ? S.fxView.key(e) : false;
    if (done) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  function keyGrid(e, g) {
    const k = e.key;
    if (g.key(e, { onTop: focusSearch })) return true;
    if (k === "Enter") {
      const it = g.selected();
      if (!it) return false;
      const keep = e.shiftKey || stays();
      insertItem(it, keep);
      if (keep) refocus();
      return true;
    }
    if (g === S.grid && (k === "ContextMenu" || (k === "F10" && e.shiftKey))) {
      const it = g.selected();
      if (it) itemMenu(it, null, g.node(g.sel) || S.search.input);
      return true;
    }
    return false;
  }

  /* ── родная кнопка Twitch ───────────────────────────────────────────────── */

  // Кнопка поля ввода ЧАТА КАНАЛА (CPX.input.root = .chat-input): у окон шёпота Twitch свой выбор
  // смайликов — наше меню вставило бы смайлик в чат канала, а не в шёпот.
  function inChatInput(b) {
    const r = b && CPX.input.root();
    return r && r.contains(b) ? b : null;
  }
  const nativeBtn = () => {
    const r = CPX.input.root();
    return (r && r.querySelector(NATIVE)) || null;
  };
  // Кнопка под щелчком: родная Twitch или её замена от BTTV (см. syncNativeFlag).
  const pickerBtn = (target) => inChatInput(target && target.closest ? target.closest(NATIVE + ", " + BTTV_BTN) : null);

  // BTTV (меню смайликов у него включено по умолчанию) прячет родную кнопку (display:none через
  // класс на .chat-input) и ставит на её место свою #bttv-emote-picker-button-container. Своей
  // кнопки в ряду у нас больше нет — меню стало бы недоступно. Пока наше меню включено, на <html>
  // стоит data-cpx-emm="on": styles/page-78 возвращает родную кнопку и прячет кнопку BTTV — везде
  // одно и то же: щелчок — наше меню, Shift — окно Twitch. Не сработало правило (BTTV сменил
  // разметку) — щелчок по кнопке BTTV тоже открывает наше меню (Shift — окно BTTV).
  function syncNativeFlag() {
    const h = document.documentElement;
    if (!h) return;
    if (menuOn()) h.dataset.cpxEmm = "on";
    else delete h.dataset.cpxEmm;
  }

  // Наше меню открыто — кнопка «нажата» (вид — styles/page-78-*.css), для чтеца — aria-expanded.
  function nativeActive(on, st) {
    st = st || S;
    const b = (st && st.trigger && st.trigger.isConnected && st.trigger) || nativeBtn();
    if (!b) return;
    b.classList.toggle("cpx-emm-native--on", !!on);
    if (on) b.setAttribute("aria-expanded", "true");
    else b.setAttribute("aria-expanded", "false");
  }

  // Родное окно Twitch открыто (Shift+щелчок раньше) — закрыть его: окна не должны лежать друг на
  // друге. Как FFZ/7TV: props.closeEmotePicker КОНТРОЛЛЕРА ввода, если props.isShowingEmotePicker
  // (одноимённое свойство самого окна EmotePicker его не закрывает — проверено 29.09).
  function closeNative() {
    CPX.safely("emote-menu:closeNative", () => {
      const c = CPX.input.controller();
      const p = c && c.props;
      if (p && p.isShowingEmotePicker && typeof p.closeEmotePicker === "function") p.closeEmotePicker();
    });
  }

  function onNativeClick(e) {
    if (!menuOn()) return;
    const b = pickerBtn(e.target);
    if (!b) return;
    if (e.shiftKey) {
      // Запасной путь — родное окно Twitch (у кнопки BTTV — окно BTTV); наше закрыть.
      close("native");
      return;
    }
    e.preventDefault();
    e.stopImmediatePropagation();
    closeNative();
    CPX.ui.tip.hide();
    toggle({ trigger: b });
  }

  let tipFor = null;
  function onNativeOver(e) {
    if (!menuOn()) return;
    const b = pickerBtn(e.target);
    if (!b || b === tipFor) return;
    tipFor = b;
    CPX.ui.tip.show(b, t(b.matches(NATIVE) ? "emm.nativeTip" : "emm.bttvTip"), { side: "top", delay: 350 });
  }
  function onNativeOut(e) {
    if (!tipFor) return;
    const to = e.relatedTarget;
    if (to && tipFor.contains(to)) return;
    tipFor = null;
    CPX.ui.tip.hide();
  }

  /* ── запуск ─────────────────────────────────────────────────────────────── */

  function addIcons() {
    const ui = CPX.ui;
    // Свои значки 20×20 линией (как набор 95_ui).
    ui.addIcon("emmChannel", ["M3.3 4.8h13.4v9H3.3z", "M7.4 16.6h5.2", "M10 13.8v2.8"]);
    ui.addIcon("emmTwitch", ["M4.2 4.2h11.6a1 1 0 0 1 1 1v7.6a1 1 0 0 1-1 1H9.2l-4 3v-3h-1a1 1 0 0 1-1-1V5.2a1 1 0 0 1 1-1z", "M8.2 7.4v3.4M12 7.4v3.4"]);
    ui.addIcon("emmGlobe", ["M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0z", "M3.2 10h13.6", "M10 3c2 2 3 4.4 3 7s-1 5-3 7c-2-2-3-4.4-3-7s1-5 3-7z"]);
    ui.addIcon("emmSparkle", ["M9 3l1.5 4.2L14.7 8.7l-4.2 1.5L9 14.4l-1.5-4.2L3.3 8.7l4.2-1.5z", "M15 12.6l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6z"]);
    ui.addIcon("emmLock", ["M6.6 9V6.9a3.4 3.4 0 0 1 6.8 0V9", "M5.2 9h9.6v7.4H5.2z", "M10 12v1.6"]);
    ui.addIcon("emmUnlock", ["M6.6 9V6.9a3.4 3.4 0 0 1 6.6-1.2", "M5.2 9h9.6v7.4H5.2z", "M10 12v1.6"]);
    ui.addIcon("emmStar", ["M5 5h10v10H5z"]);
    ui.addIcon("emmBolt", ["M11 2.6L4.6 11h4.8l-1 6.4L15.4 9h-4.8z"]);
    ui.addIcon("emmCrown", ["M3.4 6.6l3.6 3 3-5 3 5 3.6-3-1.4 8.2H4.8z", "M4.8 16.6h10.4"]);
    ui.addIcon("emmEmoji", ["M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0z", "M7.3 8.3v.3M12.7 8.3v.3", "M6.8 11.8c.8 1.4 1.9 2.1 3.2 2.1s2.4-.7 3.2-2.1"]);
    ui.addIcon("emmGif", ["M3.2 4.6h13.6v10.8H3.2z", "M9 8.2H7.4a1.4 1.4 0 0 0-1.4 1.4v.8a1.4 1.4 0 0 0 1.4 1.4H9V10H8", "M11.2 8.2v3.6", "M13.4 11.8V8.2h2"]);
    // 7TV — настоящий логотип из общего набора (logo7tv, 95_ui).
  }

  /* Прогрев (30.09): смайлики канала пришли, меню закрыто — в тишине заранее подгружаем лёгкие
   * картинки первых экранов меню (WARM_N плиток 7TV, ~0,1–0,2 МБ, раз на канал за жизнь страницы):
   * первое открытие — без ожидания. Те же картинки и адреса, что у плиток (preloadEmote). */
  const WARM_N = 150;
  const WARM_MAX = 6;
  const WARM_DELAY = 4000; // после последней правки наборов (при входе их приходит несколько)
  const warmed = new Set();
  let warmT = 0;
  function warmSoon(id) {
    const st = CPX.chat.state;
    // Без входа в Twitch меню смайликов не открыть — греть его картинки незачем (ревью 05.10).
    if (!id || warmed.has(id) || !menuOn() || !st || st.channelId !== id || !(CPX.twitch && CPX.twitch.me())) return;
    clearTimeout(warmT);
    warmT = setTimeout(() => {
      const run = () => CPX.safely("emote-menu:warm", () => warm(id));
      if (window.requestIdleCallback) window.requestIdleCallback(run, { timeout: 5000 });
      else run();
    }, WARM_DELAY);
  }
  function warm(id) {
    const st = CPX.chat.state;
    if (isOpen() || warmed.has(id) || !st || st.channelId !== id) return;
    warmed.add(id);
    const list = [];
    for (const s of EM.model({ q: "" }).sections) {
      for (const it of s.items || []) if (list.length < WARM_N && it.p === "7tv") list.push(it);
      if (list.length >= WARM_N) break;
    }
    let i = 0;
    let busy = 0;
    const pump = () => {
      while (busy < WARM_MAX && i < list.length && !isOpen() && !slow7tv()) {
        const im = preloadEmote(list[i++]);
        if (!im) continue;
        busy++;
        let fin = false;
        const done = () => {
          if (fin) return;
          fin = true;
          clearTimeout(t);
          busy--;
          pump();
        };
        const t = setTimeout(done, 30000); // К3
        im.addEventListener("load", done, { once: true });
        im.addEventListener("error", done, { once: true });
      }
    };
    pump();
  }

  CPX.boot.add(
    "emote-menu",
    () => {
      addIcons();
      // Родная кнопка: захват на window — раньше корня React (обработчик Twitch не узнает о щелчке).
      window.addEventListener("click", CPX.guard("emote-menu:native", onNativeClick), true);
      window.addEventListener("pointerover", CPX.guard("emote-menu:nativeTip", onNativeOver), true);
      window.addEventListener("pointerout", CPX.guard("emote-menu:nativeTip", onNativeOut), true);
      syncNativeFlag();
      // Кнопка BTTV в поле появилась — метка на <html> (styles/page-78: вернуть родную кнопку). Раньше правило ловило её
      // через «.chat-input:has(#bttv-…)» — с ним Chrome на каждую букву пересчитывал стили всего блока ввода (отзыв 06.11).
      // Снимать не нужно: BTTV без перезагрузки страницы не уходит.
      CPX.dom.on("#bttv-emote-picker-button-container", () => document.documentElement.setAttribute("data-cpx-bttvbtn", ""));
      CPX.settings.onAny((ch) => {
        if ("input.menu" in ch) syncNativeFlag();
        if ("input.menu" in ch && !menuOn()) close("off");
        if ("general.lang" in ch) close("lang");
        if (!isOpen()) return;
        if ("emotes.effects" in ch) {
          // Вкладка «Эффекты» появляется/исчезает сразу, а не со следующим открытием.
          if (!fxOn() && (S.view === "effects" || S.view === "item")) setView("emotes");
          renderTabs();
          updateFoot();
        }
        if (Object.keys(ch).some((k) => k.startsWith("emotes.")) || "input.menuFav" in ch) refreshSoon();
        if ("input.emojiTone" in ch && S.view === "emoji") {
          renderTone();
          S.egrid.relayout({ anchor: true });
        }
      });
      // Смайлики: только своего канала или глобальные (null) — правки каналов-партнёров общего
      // чата меню не касаются.
      CPX.emotes.on("change", (id) => {
        if (!isOpen()) return warmSoon(id);
        const st = CPX.chat.state;
        if (!id || (st && st.channelId === id)) refreshSoon();
      });
      // Оформление: только своё (личные 7TV) — события о людях в чате идут потоком.
      CPX.cosm.on("change", (ids) => {
        if (!isOpen()) return;
        const me = EM.selfId();
        if (me && Array.isArray(ids) && ids.some((x) => String(x) === me)) refreshSoon();
      });
      if (CPX.twitchEmoteSets) CPX.twitchEmoteSets.on("change", () => isOpen() && refreshSoon());
      CPX.chat.on("attach", () => {
        // Личные 7TV — заранее, чтобы при открытии уже были. Наборы Twitch заранее НЕ спрашиваем:
        // до запроса меню берёт их у контроллера чата Twitch (78_emote_data_twitch), запрос — при
        // открытии меню.
        if (menuOn()) EM.askSelf();
        if (isOpen()) refreshSoon();
      });
      CPX.chat.on("detach", () => close("detach"));
      // Сообщение ушло — меню у поля ввода больше не нужно (input.menuKeep; откреплённое окно живёт).
      CPX.input.on("sent", () => {
        if (isOpen() && !S.win && keepOn()) close("sent");
      });
      // Вход/PLUS/сокет: виды эффектов — только если сменилось то, что влияет на строки.
      if (CPX.account)
        CPX.account.on(() => {
          if (isOpen() && (S.view === "effects" || S.view === "item") && EM.fx.sig() !== S.fxSig) rebuildFx();
        });
    },
    79
  );

  EM.open = open;
  EM.close = close;
  EM.toggle = toggle;
  EM.isOpen = isOpen;

  /* ── для стенда (только dev) ────────────────────────────────────────────── */
  if (CPX.dev) {
    const G = () => curGrid() || (S && S.grid);
    const find = (name) => (S ? G().find(name) : -1);
    const center = (n) => {
      if (!n) return null;
      const r = n.getBoundingClientRect();
      return r.width ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } : null;
    };
    EM._dev = {
      detach,
      detached: () => !!(S && S.win && isOpen()),
      state: () =>
        S && {
          open: isOpen(),
          view: S.view,
          q: S.q,
          sel: G().sel,
          selName: G().selected() ? G().selected().n || G().selected().e : null,
          selSec: G().selected() ? G().rows[G().flat[G().sel].row].sec : null,
          cols: G().cols,
          rows: G().rows.length,
          flat: G().flat.length,
          rendered: G().rendered.size,
          cellsInDom: S.root.querySelectorAll(".cpx-emm-cell").length,
          imgsInDom: S.space.querySelectorAll("img").length,
          tab: S.tab,
          nav: S.nav,
          tabs: [...S.tabs.children].map((b) => b.dataset.v + (b.getAttribute("aria-disabled") === "true" ? ":off" : "")),
          side: [...S.side.querySelectorAll(".cpx-emm-sideb")].map((b) => b.dataset.nav),
          sections: S.mdl && S.mdl.sections.map((s) => s.id + ":" + (s.items ? s.items.length : s.state) + ":" + s.title),
          foot: S.foot.textContent,
          scrollTop: G().scroll.scrollTop,
          scrollHeight: G().scroll.scrollHeight,
          focus: (() => {
            const a = S.root.getRootNode().activeElement;
            return !a ? null : a === S.search.input ? "search" : a.className || a.tagName;
          })(),
        },
      root: () => S && S.root,
      rect: () => {
        if (!isOpen()) return null;
        const r = S.h.el.getBoundingClientRect();
        return { x: r.left, y: r.top, w: r.width, h: r.height };
      },
      names: (n) => (S ? G().flat.slice(0, n || 20).map((f) => f.it.n || f.it.e) : []),
      /** Плитки раздела: [{n, x, w, row, zw}] — для проверки укладки. */
      tiles(sec) {
        if (!S) return null;
        const g = G();
        return g.flat.filter((f) => g.rows[f.row].sec === sec).map((f) => ({ n: f.it.n || f.it.e, x: f.x, w: f.w, row: f.row, zw: !!f.it.zw }));
      },
      find,
      /** Середина плитки на экране (прокрутит к ней) — для настоящих щелчков стенда. */
      cellAt(name) {
        if (!S) return null;
        const i = typeof name === "number" ? name : find(name);
        if (i < 0) return null;
        G().ensureVisible(i);
        return center(G().node(i));
      },
      /** Середина родной кнопки смайликов Twitch в поле ввода. */
      nativeAt: () => center(nativeBtn()),
      tabAt: (v) => center(S && S.tabs.querySelector('[data-v="' + v + '"]')),
      /** Середина строки эффекта с кодом. */
      fxAt(code) {
        const b = S && [...S.fxBox.querySelectorAll(".cpx-emm-fxrow")].find((x) => x.querySelector(".cpx-emm-fxcode").textContent === code);
        if (!b) return null;
        b.scrollIntoView({ block: "nearest" });
        return center(b);
      },
      /** Щелчок по плитке (прокрутит к ней): {shift, right, alt, star}. */
      click(name, o) {
        o = o || {};
        const i = typeof name === "number" ? name : find(name);
        if (i < 0) return false;
        G().setSel(i, true);
        const c = G().node(i);
        if (!c) return false;
        const target = o.star ? c.querySelector("[data-act='fav']") : c;
        target.dispatchEvent(new MouseEvent(o.right ? "contextmenu" : "click", { bubbles: true, cancelable: true, composed: true, shiftKey: !!o.shift, altKey: !!o.alt, button: o.right ? 2 : 0, clientX: 1, clientY: 1 }));
        return true;
      },
      key(key, o) {
        if (!S) return false;
        const target = S.root.getRootNode().activeElement || S.search.input;
        target.dispatchEvent(new KeyboardEvent("keydown", Object.assign({ key, bubbles: true, cancelable: true, composed: true }, o || {})));
        return true;
      },
      search(q) {
        if (!S) return false;
        S.search.value = q;
        setQuery(q);
        return true;
      },
      // name — имя/ключ смайлика из меню или готовый пункт {p, n, tid | rec} (например, Twitch).
      view: (v, name) => (S ? (setView(v, name && typeof name === "object" ? name : name ? S.mdl.byKey.get(name) || S.mdl.all.find((x) => x.n === name) : null), true) : false),
      jump(nav) {
        const b = S && S.side.querySelector('[data-nav="' + nav + '"]');
        if (b) b.click();
        return !!b;
      },
      scroll(y) {
        if (!S) return false;
        G().scroll.scrollTop = y;
        G().paint();
        return G().scroll.scrollTop;
      },
      /** Встать на плитку «с клавиатуры» (без вставки): дальше стрелки. */
      select(name) {
        const i = typeof name === "number" ? name : find(name);
        if (i < 0 || !S) return false;
        G().kb = true;
        G().setSel(i, true);
        return true;
      },
      hover(name) {
        const i = find(name);
        if (i < 0 || !S) return false;
        setHover(G().flat[i].it);
        return true;
      },
      tone: (v) => (CPX.emoji.setTone(v), S && S.view === "emoji" && (renderTone(), S.egrid.relayout({ anchor: true })), true),
      // Пункт берём ДО переключения: сетка пересоберётся, номера сдвинутся.
      fav: (name) => {
        const i = find(name);
        if (i < 0) return null;
        const it = G().flat[i].it;
        toggleFav(it);
        return EM.isFav(it);
      },
      fxRows: () => (S && S.fxView ? [...S.fxBox.querySelectorAll(".cpx-emm-fxrow")].map((b) => ({ name: b.querySelector(".cpx-emm-fxname").textContent, code: b.querySelector(".cpx-emm-fxcode").textContent, locked: b.classList.contains("cpx-emm-fxrow--locked"), on: b.classList.contains("cpx-on"), hidden: b.hidden })) : null),
      fxClick(code, o) {
        const b = S && [...S.fxBox.querySelectorAll(".cpx-emm-fxrow")].find((x) => x.querySelector(".cpx-emm-fxcode").textContent === code);
        if (!b) return false;
        b.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, composed: true, shiftKey: !!(o && o.shift) }));
        return true;
      },
      recipe: () => (S && S.fxView && S.fxView.text ? S.fxView.text() : null),
      stageText: () => (S ? (S.fxBox.querySelector(".cpx-emm-stage__text") || {}).textContent || null : null),
      anims: () => (S ? S.root.getAnimations({ subtree: true }).length : 0),
      animQueue: () => ({ q: anim.q.length, busy: anim.busy, gen: anim.gen }),
      ahead: () => ({ busy: ahead.busy, spent: ahead.spent, done: ahead.done.size }),
      pre: () => S && { done: S.grid.preDone.size, busy: S.grid.preBusy, down: S.grid.preDown, up: S.grid.preUp },
      override: (o) => (Object.assign(EM._devOverride, o || {}), S && refresh(true), true),
      refresh: () => (S && refresh(true), true),
    };
  }
})();

// ── src/kick/79_kick_emm.js ──
/* Мир Kick: кнопка нашего меню смайликов в поле ввода Kick (решение владельца 15.11: «наше меню смайликов в поле ввода
 * Kick — своё меню Kick 7TV не знает»). Меню — то же, что на Twitch (78_emote_menu_data, 79_emote_menu_*): 7TV канала и
 * глобальные, избранное, недавние, эмодзи, эффекты; смайликов Twitch в мире Kick нет.
 *
 * Кнопку Kick со смайликами Kick НЕ перехватываем (у Twitch наше меню встаёт на место родного — оно знает и смайлики
 * Twitch; смайликов Kick наше меню не знает): наша — отдельной кнопкой вплотную ПЕРЕД кнопкой Kick (последняя кнопка
 * рамки #chat-input-wrapper, стенд 15.11), с её классами (вид и наведение — как у Kick), значок — знак Chatterino+.
 * Щелчок по ней ловит само меню (CPX.input.EMOTE_BTN → 79_emote_menu_ui). Меню выключено в настройках («Поле ввода»
 * → «Меню смайликов») — кнопка спрятана (hidden; не по метке data-cpx-emm на <html>: в Firefox Kick снимает свои
 * атрибуты с корня страницы — стенд 15.11, кнопка пропадала).
 */

(() => {
  const CLS = "cpx-kemm";
  const LOGO =
    '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<path d="M17.66 6.34A8 8 0 1 0 17.66 17.66" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>' +
    '<path d="M12 8.75v6.5M8.75 12h6.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
  const S = { off: false };
  const menuOn = () => CPX.settings.get("input.menu") !== false;

  /** Кнопка смайликов Kick — последняя кнопка рамки поля (не наша). */
  function kickBtn(wrap) {
    const all = [...wrap.querySelectorAll(":scope > button")].filter((b) => !b.classList.contains(CLS));
    return all[all.length - 1] || null;
  }

  function mount(wrap) {
    if (S.off || !wrap.isConnected) return;
    const k = kickBtn(wrap);
    if (!k) return;
    let b = wrap.querySelector(":scope > ." + CLS);
    if (b && b.nextElementSibling === k) return;
    if (!b) {
      b = document.createElement("button");
      b.type = "button";
      b.className = k.className + " cpx-own " + CLS;
      b.setAttribute("aria-label", CPX.t("kick.emm"));
      b.setAttribute("aria-haspopup", "dialog");
      b.appendChild(CPX.el.trusted(LOGO));
      b.addEventListener("mouseenter", () => CPX.safely("kick:emm:tip", () => CPX.ui.tip.show(b, CPX.t("kick.emm"), { side: "top" })));
      b.addEventListener("mouseleave", () => CPX.ui.tip.hide());
    }
    b.hidden = !menuOn();
    wrap.insertBefore(b, k);
  }

  CPX.i18n.add({
    ru: { "kick.emm": "Смайлики Chatterino+ (7TV)" },
    en: { "kick.emm": "Chatterino+ emotes (7TV)" },
  });

  CPX.boot.add(
    "kick:emm",
    () => {
      if (window.top !== window) return;
      const stop = CPX.dom.on("#chat-input-wrapper", (w) => {
        CPX.safely("kick:emm", () => mount(w));
        // Kick перерисовал рамку (смена канала, ответ на сообщение) — вернуть кнопку на место.
        const mo = new MutationObserver(() => CPX.safely("kick:emm", () => mount(w)));
        mo.observe(w, { childList: true });
        CPX.dom.gone(w, () => mo.disconnect());
      });
      CPX.settings.on("input.menu", () => {
        for (const b of document.querySelectorAll("." + CLS)) b.hidden = !menuOn();
      });
      CPX.siteChat.on("off", () => {
        S.off = true;
        stop();
        for (const b of document.querySelectorAll("." + CLS)) b.remove();
        if (CPX.emoteMenu && CPX.emoteMenu.close) CPX.emoteMenu.close("off");
      });
    },
    79
  );
})();

// ── src/main/94_dock_event.js ──
/* Мир страницы: ивент в верхней панели (владелец 19.11 → 2.3.2) — вместо нашего плюса значок идущего ивента; у кого
 * его ещё нет (и у не вошедших) — мягкое свечение; ивент кончился — снова плюс. Данные — фон (bg/46_awards.js).
 *
 * БЕЗ МИГАНИЯ. Кнопку ставит 94_settings_panel, когда Twitch (или Kick) рисует верхнюю панель — часто раньше, чем мост
 * до фона ответил. Поэтому последнее состояние (картинка значка строкой data:, конец ивента, свечение) лежит в памяти
 * сайта (localStorage, ключ KEY): кнопка сразу рисуется нужной, без перехода «плюс → значок». Ответ фона только
 * подтверждает или меняет; смена на открытой странице — плавно (CSS: прозрачность за 180 мс). Конец ивента — своим
 * таймером (и проверкой при каждой отрисовке): кончился — плюс, даже если фон молчит.
 *
 * СВЕЧЕНИЕ — «ореол» (владелец 19.11 выбрал из трёх): сама картинка значка под ним, размытая — цвет берётся из значка
 * сам, ничего не считаем; неподвижное — ни кадров, ни перерисовки (styles/page-94-panel.css).
 *
 * API: CPX.dockEvent.active() → состояние для кнопки или null · .icon() → элемент значка или null (тогда — плюс) ·
 *   .on("change", fn) · стенд (dev): ._dev(состояние фона) — показать другое положение.
 */

CPX.dockEvent = (() => {
  const ev = new CPX.Emitter();
  const KEY = "cpx:dock";
  const DATA_RE = /^data:image\/(png|webp|gif);base64,[A-Za-z0-9+/=]+$/;
  const HTTP_RE = /^https:\/\/([a-z0-9-]+\.)*(eblo\.id|rish098\.xyz)\/[\w./-]+$/i;
  let st = null; // {id, ends, glow, title, img: {d1, d2, l1, l2}}
  let endT = 0;

  const nowSec = () => Math.floor((CPX.clock && CPX.clock.now ? CPX.clock.now() : Date.now()) / 1000);
  const okImg = (u) => typeof u === "string" && (DATA_RE.test(u) || HTTP_RE.test(u));
  const live = (s) => !!s && (!s.ends || s.ends > nowSec());

  // Все четыре картинки (и светлой темы — ревью 19.11) — той же проверкой: память сайта могут переписать скрипты страницы.
  const okOpt = (u) => !u || okImg(u);
  function valid(s) {
    return !!s && typeof s === "object" && Number.isInteger(s.id) && s.id > 0 && !!s.img && okImg(s.img.d1) && okOpt(s.img.d2) && okImg(s.img.l1) && okOpt(s.img.l2);
  }

  // Память сайта: прочитать сразу при запуске мира (раньше, чем появится панель).
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    if (valid(raw) && live(raw)) st = raw;
    else if (raw) localStorage.removeItem(KEY);
  } catch (_) {
    /* память сайта недоступна — нарисуем по ответу фона */
  }

  function save() {
    try {
      if (st) localStorage.setItem(KEY, JSON.stringify(st));
      else localStorage.removeItem(KEY);
    } catch (_) {
      /* переполнена/запрещена — не страшно */
    }
  }

  function planEnd() {
    clearTimeout(endT);
    if (!st || !st.ends) return;
    const ms = st.ends * 1000 - (CPX.clock && CPX.clock.now ? CPX.clock.now() : Date.now()) + 300;
    endT = setTimeout(() => CPX.safely("dock:end", () => set(null)), Math.max(500, Math.min(ms, 2 ** 31 - 1)));
  }

  function set(next) {
    const before = JSON.stringify(st);
    st = next && valid(next) && live(next) ? next : null;
    if (JSON.stringify(st) === before) return;
    save();
    planEnd();
    ev.emit("change", st);
  }

  /** Состояние фона → своё. Картинка у фона не скачалась (вместо строки data: — адрес сервера) — сначала проверить, что
   *  она грузится, и только тогда менять плюс (20.11: сервер отвечал 403 — вместо плюса была бы пустая кнопка). */
  let applyN = 0;
  function apply(a) {
    const n = ++applyN;
    if (!a || !a.ev || !a.img) return set(null);
    const next = {
      id: a.ev.id,
      ends: a.ev.ends_at || 0,
      glow: !!a.glow,
      title: String(a.ev.title || a.ev.badge.title || "").slice(0, 80),
      img: { d1: a.img.d1, d2: a.img.d2 || "", l1: a.img.l1 || a.img.d1, l2: a.img.l2 || a.img.d2 || "" },
    };
    const one = light() ? next.img.l1 : next.img.d1;
    if (!okImg(one)) return set(null);
    if (one.startsWith("data:")) return set(next);
    const im = new Image();
    im.onload = () => n === applyN && set(next);
    im.onerror = () => n === applyN && set(null);
    im.src = one;
  }

  const light = () => document.documentElement.classList.contains("tw-root--theme-light");
  const imageSet = (a, b) => (b ? 'image-set(url("' + a + '") 1x, url("' + b + '") 2x)' : 'url("' + a + '")');

  /** Значок ивента для кнопки (или null — рисовать плюс). */
  function icon() {
    if (!live(st)) return null;
    const lt = light();
    const one = lt ? st.img.l1 : st.img.d1;
    const two = lt ? st.img.l2 : st.img.d2;
    const box = CPX.el("span", { class: "cpx-navbtn__ev" + (st.glow ? " cpx-navbtn__ev--glow" : ""), "aria-hidden": "true" });
    box.style.setProperty("--cpx-ev", imageSet(one, two));
    if (st.glow) box.appendChild(CPX.el("i", { class: "cpx-navbtn__ev-glow" }));
    box.appendChild(CPX.el("i", { class: "cpx-navbtn__ev-img" }));
    return box;
  }


  CPX.boot.add(
    "dock-event",
    () => {
      if (window.top !== window) return; // верхней панели во фреймах нет
      planEnd();
      CPX.bg.on("awards.state", (a) => CPX.safely("dock:apply", () => apply(a)));
      const ask = () =>
        CPX.bg
          .call("awards.state")
          .then((a) => apply(a))
          .catch(() => {});
      ask();
      // Фон перезапустился (уснул и проснулся, обновили расширение) — его рассылка могла пройти мимо: переспросить.
      CPX.bg.on("bridge:bg", (d) => d && d.up && ask());
      // Сменилась тема Twitch — картинка светлой/тёмной темы (классы <html> меняются и по другим поводам — только тема).
      let lt = light();
      new MutationObserver(() => {
        if (light() === lt) return;
        lt = light();
        if (st) ev.emit("change", st);
      }).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    },
    93
  );

  CPX.diag.add("dockEvent", () => ({ on: live(st), id: st && st.id, glow: !!(st && st.glow), ends: st && st.ends }));

  const api = { active: () => (live(st) ? st : null), icon, on: (name, fn) => ev.on(name, fn) };
  if (CPX.dev) {
    /** Стенд: подставное состояние фона (без него — перерисовать как есть). */
    api._dev = (a) => {
      if (a !== undefined) apply(a);
      ev.emit("change", st);
      return !!st;
    };
  }
  return api;
})();

// ── src/kick/94_kick_nav.js ──
/* Мир Kick: наша кнопка (знак PLUS) в верхней панели Kick — открывает то же окно настроек, что на Twitch
 * (main/94_settings_panel.js: окно с pages/options.html?embed=1). Решение владельца 15.11: «наш значок плюса, слева от
 * сундучка».
 *
 * ГДЕ. Верхняя панель — nav.fixed.top-0; справа — группа кнопок (у гостя: язык, «Вход», «Регистрация»; у вошедшего:
 * сундучок наград, «Получить KICKs», аватарка; стенд 15.11). Кнопка — ПЕРВОЙ в этой группе, левее всех, в том числе
 * значков других расширений. Вид — классы родной кнопки-значка группы (круглая подложка при наведении — как у Kick),
 * значок — currentColor. Kick перерисовал группу и выкинул кнопку или поставил что-то перед ней — возвращаем на место.
 * В отдельном окне чата (popout) верхней панели нет — и кнопки нет. В узком окне (меньше 1024 px) у Kick своя панель
 * (тоже nav.fixed.top-0), широкая остаётся спрятанной: кнопка — в ВИДИМОЙ, при смене раскладки переезжает.
 */

(() => {
  const ROOT_ID = "cpx-navbtn";
  const NAV = "nav.fixed.top-0";
  const S = { mo: null, group: null, off: false };

  /** Правая группа кнопок: последний ребёнок панели, в котором есть кнопки (в узкой панели Kick такой один — логотип
   *  сам ссылка, внутри него кнопок нет). */
  function groupOf(nav) {
    const kids = [...nav.children].filter((c) => c.id !== ROOT_ID && c.querySelector("button, a"));
    const g = kids[kids.length - 1];
    return g && g !== nav.firstElementChild ? g : null; // первый ребёнок — левая часть (панель ещё дорисовывается)
  }

  /** Образец — родная кнопка-значок группы (значок без текста). */
  function template(g) {
    return [...g.querySelectorAll("button")].find((b) => !b.closest("#" + ROOT_ID) && b.querySelector("svg") && !b.textContent.trim()) || null;
  }

  function keepFirst(root, g) {
    if (S.mo) S.mo.disconnect();
    S.group = g;
    const fix = () => {
      if (!root.isConnected || root.parentElement !== g) return;
      if (g.firstElementChild !== root) g.insertBefore(root, g.firstElementChild);
    };
    S.mo = new MutationObserver(() => CPX.safely("kick:nav:keep", fix));
    S.mo.observe(g, { childList: true });
    fix();
  }

  /** Видимая панель: в узком окне (меньше 1024 px, в том числе при крупном масштабе) у Kick своя панель, а широкая
   *  остаётся в документе спрятанной (ревью 19.11: кнопка сидела в спрятанной — её не было видно). */
  function visibleNav() {
    for (const n of document.querySelectorAll(NAV)) if (n.getBoundingClientRect().height > 0) return n;
    return null;
  }

  function mount() {
    if (window.top !== window || S.off) return;
    const nav = visibleNav();
    const g = nav && groupOf(nav);
    if (!g) return;
    let root = document.getElementById(ROOT_ID);
    if (root && root.parentElement === g) return keepFirst(root, g);
    if (root) root.remove();
    root = document.createElement("div");
    root.id = ROOT_ID;
    root.className = "cpx-own cpx-navbtn cpx-knav";
    root.appendChild(CPX.settingsPanel.button(template(g)));
    g.insertBefore(root, g.firstElementChild);
    keepFirst(root, g);
    // Kick перерисовал панель и убрал кнопку — вернуть.
    CPX.dom.gone(root, () => setTimeout(() => CPX.safely("kick:nav", mount), 0));
  }

  CPX.boot.add(
    "kick:nav",
    () => {
      if (window.top !== window) return;
      const stop = CPX.dom.on(NAV, () => CPX.safely("kick:nav", mount));
      // Сменилась раскладка (окно сузили или расширили, масштаб) — кнопку в ту панель, что видна.
      let rt = 0;
      const onResize = () => {
        clearTimeout(rt);
        rt = setTimeout(() => CPX.safely("kick:nav", mount), 200);
      };
      window.addEventListener("resize", onResize, { passive: true });
      // Kick выключили в настройках — убрать кнопку и больше не ставить.
      CPX.siteChat.on("off", () => {
        S.off = true;
        stop();
        window.removeEventListener("resize", onResize);
        clearTimeout(rt);
        if (S.mo) S.mo.disconnect();
        const r = document.getElementById(ROOT_ID);
        if (r) r.remove();
        CPX.settingsPanel.close();
      });
    },
    94
  );

  CPX.diag.add("kickNav", () => {
    const r = document.getElementById(ROOT_ID);
    return { button: !!r, first: !!(r && r.parentElement && r.parentElement.firstElementChild === r) };
  });
})();

// ── src/main/94_settings_panel.js ──
/* Окно настроек Chatterino+ поверх страницы Twitch (волна 6, заказ владельца 01.10: «как у 7TV»).
 *
 * КНОПКА — в верхней панели Twitch ПЕРВОЙ в ряду значков: вплотную перед значком Prime (владелец 03.10;
 * было — слева от аватарки). Prime нет — перед первым родным значком ряда («Поиск» и значки 7TV/BTTV/FFZ
 * пропускаем); ряд без значков — перед аватаркой. Prime, скрытый настройкой «Интерфейс», остаётся в
 * разметке — кнопка всё равно первая. На кнопке — знак подписки PLUS (плюс со «сдвигом-тенью», как бейдж
 * PLUS у ника; решение владельца 04.10), одним цветом currentColor — цвет родных значков панели, без своей
 * окраски. В шапке окна — только надпись «Chatterino+» (владелец 04.10), в меню шестерёнки — знак Chatterino+
 * (дуга «C» и плюс) лавандой.
 * Кнопка берёт
 * КЛАССЫ СОСЕДНЕЙ родной кнопки-значка (Уведомления, Переписки, Prime): размер, круглая подложка
 * при наведении, нажатие, светлая тема — как у Twitch, без своих правил; родной не нашлось —
 * запасной вид из page-94-panel.css. Twitch перерисовывает панель — кнопка возвращается сама
 * (CPX.dom.on по кнопке меню аватарки, CPX.dom.gone по своей).
 *
 * ОКНО — наше окно (CPX.ui.window: закрытый Shadow DOM, перетаскивание за шапку, переезд в полный
 * экран), внутри — СТРАНИЦА РАСШИРЕНИЯ pages/options.html?embed=1 во фрейме. Почему фрейм, а не
 * форма в мире страницы: у страницы расширения полный доступ к chrome.* (вход и выход, согласие,
 * скрытые настройки — методы фона без {page:true} остаются недоступны миру страницы), скрипты Twitch
 * в чужой фрейм не заглядывают, и один код рисует и вкладку настроек, и это окно. Фрейм разрешён
 * только на twitch.tv (web_accessible_resources в манифесте). Esc внутри фрейма — фрейм просит
 * «закрыть» (postMessage; источник сверяем с contentWindow своего фрейма). Раздел — хэш адреса.
 * Загрузившемуся фрейму («hello») отдаём вид нашего чата (ширина строки, шрифт, тема) — живой пример
 * ползунка модерации там рисуется ровно как этот чат.
 *
 * ПУНКТ В МЕНЮ ШЕСТЕРЁНКИ ЧАТА «Настройки Chatterino+» — там, где верхней панели нет (всплывающий
 * чат, узкое окно): строка из разметки соседней родной строки (как «Защитный режим» —
 * 84_mod_shield.js), значок — наш знак лавандой.
 *
 * ИВЕНТ (владелец 19.11 → 2.3.2): пока идёт ивент, вместо знака PLUS — значок ивента (CPX.dockEvent, 94_dock_event),
 * у кого его нет — со свечением; смена — плавно, без перестройки кнопки; щелчок — окно на первой странице («Аккаунт»),
 * там полоса об ивенте (pages/20_pages.js).
 *
 * API: CPX.settingsPanel.open(раздел?) / close() / toggle() / isOpen() / button(образец) — наша кнопка с видом образца
 * (её ставит в свою панель мир Kick: src/kick/94_kick_nav.js, 15.11; в мире Kick кнопку и пункт шестерёнки Twitch не
 * ищем — их там нет).
 */

CPX.settingsPanel = (() => {
  const log = CPX.log("panel");
  const W = 900;
  const H = 640;
  const ROOT_ID = "cpx-navbtn";

  CPX.i18n.add({
    ru: { "panel.title": "Настройки Chatterino+", "panel.tip": "Chatterino+", "panel.tipEvent": "Chatterino+ · ивент «{title}»" },
    en: { "panel.title": "Chatterino+ settings", "panel.tip": "Chatterino+", "panel.tipEvent": "Chatterino+ · event “{title}”" },
  });

  // Знак Chatterino+: дуга «C» с разрывом справа и плюс внутри (currentColor) — в меню шестерёнки, лавандой.
  const LOGO =
    '<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false" role="presentation">' +
    '<path d="M17.66 6.34A8 8 0 1 0 17.66 17.66" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>' +
    '<path d="M12 8.75v6.5M8.75 12h6.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
  // Кнопка верхней панели — знак подписки PLUS: САМ рисунок бейджа (решение владельца 04.10: форма как есть,
  // меняется только палитра) — двумя масками (page-94-panel.css): лицо — цветом значков Twitch, объём — им же
  // приглушённо. Цвет — currentColor кнопки: наведение и светлая тема — как у родных значков.
  const plusIcon = () =>
    CPX.el("span", { class: "cpx-navbtn__plus", "aria-hidden": "true" }, [CPX.el("i", { class: "cpx-navbtn__plus-shade" }), CPX.el("i", { class: "cpx-navbtn__plus-face" })]);

  let win = null;
  let frame = null;
  let btn = null;

  /** Значок кнопки сейчас: идёт ивент — его значок, иначе знак PLUS. */
  const iconNow = () => (CPX.dockEvent && CPX.dockEvent.icon()) || plusIcon();
  /** Ивент начался/кончился/сменилось свечение — заменить значок на месте (кнопку не трогаем: её классы, место в
   *  панели и наведение Twitch остаются), новое проявляется за 180 мс (page-94-panel.css: .cpx-navbtn__in). */
  function swapIcon(b) {
    const old = b && b.querySelector(".cpx-navbtn__plus, .cpx-navbtn__ev");
    if (!old) return;
    const next = iconNow();
    next.classList.add("cpx-navbtn__in");
    old.replaceWith(next);
    requestAnimationFrame(() => requestAnimationFrame(() => next.classList.remove("cpx-navbtn__in")));
  }
  if (CPX.dockEvent) {
    CPX.dockEvent.on("change", () =>
      CPX.safely("panel:icon", () => {
        // Своя кнопка Twitch и кнопка, отданная миру сайта (button()), — обе.
        for (const b of new Set([btn, document.querySelector("#" + ROOT_ID + " button")])) if (b && b.isConnected) swapIcon(b);
      })
    );
  }

  /* ── Кнопка в верхней панели ─────────────────────────────────────────── */

  /** Образец — родная кнопка-значок той же группы (её классы и обёртки значка). Сначала Уведомления,
   * Переписки, Prime: кнопка «Поиск» тоже значок, но её обёртка на широком экране спрятана. */
  function template(group) {
    const all = [...group.querySelectorAll('button[class*="ScButtonIcon"]')].filter((b) => !b.closest("#" + ROOT_ID) && b.querySelector("svg"));
    const label = (b) => b.getAttribute("aria-label") || "";
    return all.find((b) => /уведомл|notif|переписк|whisper|prime/i.test(label(b))) || all.find((b) => !/поиск|search/i.test(label(b))) || all[0] || null;
  }

  function makeButton(tpl) {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("aria-label", CPX.t("panel.title"));
    b.setAttribute("aria-haspopup", "dialog");
    b.setAttribute("aria-expanded", "false");
    // Обёртки значка — как у образца (ButtonIconFigure → ScSvgWrapper), иначе значок не встанет по центру.
    const fig = tpl && tpl.firstElementChild && tpl.firstElementChild.querySelector("svg") ? tpl.firstElementChild : null;
    const wrap = fig && fig.querySelector("svg") ? fig.querySelector("svg").parentElement : null;
    if (tpl) b.className = tpl.className;
    else b.className = "cpx-navbtn__fallback";
    const icon = iconNow();
    if (fig && wrap && wrap !== fig) {
      const f = document.createElement("div");
      f.className = fig.className;
      const w = document.createElement("div");
      w.className = wrap.className;
      w.appendChild(icon);
      f.appendChild(w);
      b.appendChild(f);
    } else b.appendChild(icon);
    b.addEventListener("click", (e) => {
      e.preventDefault();
      CPX.ui.tip.hide();
      // Идёт ивент — окно на первой странице: там полоса об ивенте.
      toggle(CPX.dockEvent && CPX.dockEvent.active() ? "account" : undefined);
    });
    b.addEventListener("mouseenter", () =>
      CPX.safely("panel:tip", () => {
        const evNow = CPX.dockEvent && CPX.dockEvent.active();
        CPX.ui.tip.show(b, evNow && evNow.title ? CPX.t("panel.tipEvent", { title: evNow.title }) : CPX.t("panel.tip"), { side: "bottom" });
      })
    );
    b.addEventListener("mouseleave", () => CPX.ui.tip.hide());
    return b;
  }

  let groupMo = null;

  /** Кнопка меню аватарки появилась (вход, перерисовка панели) — поставить нашу кнопку перед ней. */
  function mount(avatar) {
    if (window.top !== window) return; // во фреймах Twitch верхней панели нет
    const nav = avatar.closest('nav[data-a-target="top-nav-container"], .top-nav');
    if (!nav) return;
    // Элемент группы кнопок, в котором аватарка: поднимаемся, пока у родителя меньше трёх детей.
    let slot = avatar;
    while (slot.parentElement && slot.parentElement !== nav && slot.parentElement.children.length < 3) slot = slot.parentElement;
    const group = slot.parentElement;
    if (!group || group === nav) return;
    const old = document.getElementById(ROOT_ID);
    if (old && old.parentElement === group && placed(old, anchorOf(group, slot))) return keepFirst(old, group, slot);
    if (old) old.remove();
    const tpl = template(group);
    // Обёртка — своя (поля 4 px, как у родных): классы обёрток Twitch прячут их на части ширин экрана.
    const root = document.createElement("div");
    root.id = ROOT_ID;
    root.className = "cpx-own cpx-navbtn";
    btn = makeButton(tpl);
    btn.setAttribute("aria-expanded", String(!!win));
    root.appendChild(btn);
    group.insertBefore(root, anchorOf(group, slot));
    CPX.dom.gone(root, () => {
      // Twitch убрал нашу кнопку, а аватарка осталась — вернуть.
      if (avatar.isConnected) setTimeout(() => CPX.safely("panel:mount", () => mount(avatar)), 0);
    });
    keepFirst(root, group, slot);
  }

  const FOREIGN = /seventv|ffz|bttv|betterttv/i;
  const isForeign = (c) => FOREIGN.test(String(c.className) + " " + c.id + " " + String((c.firstElementChild && c.firstElementChild.className) || ""));
  const childOf = (group, el) => {
    while (el && el.parentElement !== group) el = el.parentElement;
    return el || null;
  };
  /** Перед кем стоять: значок Prime; нет его — первый родной элемент ряда (не «Поиск», не наш, не чужого
   * расширения); нет и такого — блок аватарки. */
  function anchorOf(group, slot) {
    const prime = group.querySelector(":scope > .top-nav__prime") || childOf(group, group.querySelector('[data-a-target="prime-offers-icon"]'));
    if (prime) return prime;
    for (const c of group.children) {
      if (c.id === ROOT_ID || isForeign(c)) continue;
      const b = c.querySelector("button[aria-label]");
      if (b && /^(поиск|search)$/i.test(b.getAttribute("aria-label").trim())) continue;
      return c;
    }
    return slot;
  }

  /* Twitch дорисовывает значки (Prime, Bits, «месяц без рекламы») уже ПОСЛЕ нас (ревью 01.10) — следим
   * только за детьми этой группы и держим кнопку перед якорем; после переноса условие выполнено — по кругу
   * не ходит. Между нами и якорем — только значки других расширений (7TV/BTTV/FFZ ставят свои перед Prime) —
   * это и есть «первые», не спорим. Расширение, которое всё же двигает нас, не раскачает: больше MOVE_MAX
   * переносов за MOVE_WIN — пауза MOVE_REST (стенд 03.10: «упрямый» сосед — 8 переносов и тишина). Блок
   * аватарки пересоздан — mount() зовёт снова. */
  const MOVE_MAX = 8;
  const MOVE_WIN = 3000;
  const MOVE_REST = 20000;
  let moves = [];
  /** Стоим перед якорем, между нами — только чужие значки. */
  function placed(root, a) {
    let x = root.nextElementSibling;
    while (x && x !== a && isForeign(x)) x = x.nextElementSibling;
    return x === a;
  }
  let restUntil = 0;
  function keepFirst(root, group, slot) {
    if (groupMo) groupMo.disconnect();
    const fix = () => {
      if (!root.isConnected || !slot.isConnected || slot.parentElement !== group) return groupMo && groupMo.disconnect();
      const a = anchorOf(group, slot);
      if (a === root || placed(root, a)) return;
      const now = Date.now();
      if (now < restUntil) return;
      moves = moves.filter((t) => now - t < MOVE_WIN);
      if (moves.length >= MOVE_MAX) {
        restUntil = now + MOVE_REST;
        log.warn("кнопку в верхней панели кто-то переставляет — не спорим", MOVE_REST / 1000, "с");
        setTimeout(() => CPX.safely("panel:keep", fix), MOVE_REST + 50);
        return;
      }
      moves.push(now);
      group.insertBefore(root, a);
    };
    groupMo = new MutationObserver(() => CPX.safely("panel:keep", fix));
    groupMo.observe(group, { childList: true });
    fix();
  }

  /* ── Пункт в меню шестерёнки чата ─────────────────────────────────────── */

  function templateRow(bal) {
    return (
      bal.querySelector('[data-test-selector="recent-raids-button"]') ||
      [...bal.querySelectorAll("button.tw-interactable")].find((b) => b.children.length === 1 && b.firstElementChild.children.length === 2 && b.querySelector("svg"))
    );
  }

  function ensureGearItem(bal) {
    if (!bal.isConnected || bal.querySelector(".cpx-set-item")) return;
    const tpl = templateRow(bal);
    if (!tpl) return;
    const item = tpl.cloneNode(true);
    item.classList.add("cpx-set-item");
    item.removeAttribute("data-test-selector");
    item.removeAttribute("data-a-target");
    item.firstElementChild.firstElementChild.textContent = CPX.t("panel.title");
    const svg = item.querySelector("svg");
    if (svg) {
      const ico = CPX.el("span", { style: { display: "inline-flex", color: "#b8a7f0" } }, [CPX.el.trusted(LOGO)]);
      svg.replaceWith(ico);
    }
    item.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Меню закрываем, как Twitch, — повторным нажатием шестерёнки; затем окно.
      const gear = document.querySelector('[data-a-target="chat-settings"]');
      if (gear) gear.click();
      setTimeout(() => open(), 0);
    });
    tpl.parentElement.appendChild(item);
  }

  function watchGear() {
    CPX.dom.on('[data-a-target="chat-settings-balloon"]', (bal) => {
      CPX.safely("panel:gear", () => ensureGearItem(bal));
      // Внутри меню Twitch перерисовывает список (подменю и обратно) — вернуть пункт.
      let queued = false;
      const mo = new MutationObserver(() => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => {
          queued = false;
          CPX.safely("panel:gear", () => ensureGearItem(bal));
        });
      });
      mo.observe(bal, { childList: true, subtree: true });
      CPX.dom.gone(bal, () => mo.disconnect());
    });
  }

  /* ── Окно ─────────────────────────────────────────────────────────────── */

  let baseUrl = null;
  async function pageUrl() {
    if (!baseUrl) baseUrl = await CPX.bg.call("iso.url", { path: "pages/options.html" });
    return baseUrl + "?embed=1";
  }

  async function open(section) {
    const hash = section ? "#" + CPX.safe.ident(String(section)) : "";
    if (win) {
      if (section && frame) showIn(CPX.safe.ident(String(section)));
      win.focus();
      return win;
    }
    let url;
    try {
      url = (await pageUrl()) + hash;
    } catch (e) {
      log.warn("адрес страницы настроек не получить:", e && e.message);
      return null;
    }
    if (win) return win; // пока ждали адрес, окно открыли ещё раз
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const sizeW = () => Math.max(320, Math.min(W, window.innerWidth - 32));
    const sizeH = () => Math.max(320, Math.min(H, window.innerHeight - 96));
    const w = sizeW();
    const h = sizeH();
    frame = CPX.el("iframe", { class: "cpx-set__frame", src: url, title: CPX.t("panel.title") });
    shown = section ? CPX.safe.ident(String(section)) : "";
    const title = CPX.el("span", { class: "cpx-set__title", text: "Chatterino+" });
    // Точка «курсора»: окно встаёт со сдвигом (−w/3, −h/5) — считаем так, чтобы оно было по центру.
    const x = (vw - w) / 2 + w / 3;
    const y = Math.max(56, (vh - h) / 2) + h / 5;
    win = CPX.ui.window({
      kind: "cpx-settings",
      title,
      label: CPX.t("panel.title"),
      body: frame,
      width: w,
      height: h,
      at: { x, y },
      pinnable: false,
      autoClose: false,
      className: "cpx-set",
      trigger: btn,
      onClose: () => {
        window.removeEventListener("resize", onResize);
        win = null;
        frame = null;
        if (btn) btn.setAttribute("aria-expanded", "false");
      },
    });
    // Окно браузера сузили (или ушли в полноэкранный) — окно настроек ужимается тоже: прежде размер ставился
    // только при открытии, и крестик уезжал за край (ревью 05.10). Вписать в экран — fit ядра окон.
    function onResize() {
      if (!win || !win.el) return;
      win.el.style.width = sizeW() + "px";
      win.el.style.height = sizeH() + "px";
      win.fit();
    }
    window.addEventListener("resize", onResize);
    if (btn) btn.setAttribute("aria-expanded", "true");
    return win;
  }

  function close() {
    if (win) win.close("close");
  }

  function toggle(section) {
    if (win) close();
    else open(section);
  }

  /* Сообщения фрейма (только своего): «закрыть» (Esc внутри него), «открыт раздел», «загрузился».
   * Раздел помним здесь и отдаём фрейму сообщением, когда он загрузился заново (Firefox перезагружает
   * фрейм при переносе в полноэкранный элемент). ⚠️Адрес фрейма НЕ меняем: каждая смена адреса — запись
   * в истории вкладки, «Назад» потом съедал нажатия (проверка 01.10). */
  let shown = "";
  function showIn(id) {
    if (!frame || !frame.contentWindow || !baseUrl) return;
    try {
      frame.contentWindow.postMessage({ cpxPanel: "show", id }, new URL(baseUrl).origin);
    } catch (_) {
      /* фрейм ещё грузится — спросит сам */
    }
  }
  /** Вид нашего списка чата — для живого примера ползунка модерации на странице настроек (30_mod_editor.js):
   * ширина строки, шрифт, тема и цвета Twitch, показ времени, мой ник (подпись «… от <ник>»). Только числа,
   * цвета и ник — ничего о других людях. Списка нет — пусто (пример возьмёт обычный вид Twitch). */
  function chatLook() {
    const root = CPX.list && typeof CPX.list.root === "function" ? CPX.list.root() : null;
    const line = root && root.querySelector(".cpx-msg:not(.cpx-msg--inline)");
    if (!line) return { known: false };
    const cs = getComputedStyle(line);
    const v = (n) => cs.getPropertyValue(n).trim();
    const st = CPX.chat.state;
    return {
      known: true,
      w: Math.round(line.getBoundingClientRect().width),
      fs: parseFloat(cs.fontSize) || 0,
      lh: parseFloat(cs.lineHeight) || 0,
      light: document.documentElement.classList.contains("tw-root--theme-light"),
      ts: root.classList.contains("cpx-ts-on"),
      me: (st && st.me && (st.me.displayName || st.me.login)) || "",
      c: { bg: v("--color-background-base"), text: v("--color-text-base"), alt: v("--color-text-alt"), alt2: v("--color-text-alt-2"), hover: v("--color-background-interactable-alpha-hover") },
    };
  }
  function sendLook() {
    if (!frame || !frame.contentWindow || !baseUrl) return;
    try {
      frame.contentWindow.postMessage({ cpxPanel: "look", look: chatLook() }, new URL(baseUrl).origin);
    } catch (e) {
      log.warn("вид чата окну настроек не передан:", e && e.message);
    }
  }
  function onMessage(e) {
    if (!frame || e.source !== frame.contentWindow) return;
    const d = e.data;
    if (!d || typeof d !== "object") return;
    if (d.cpxPanel === "close") close();
    else if (d.cpxPanel === "section" && typeof d.id === "string") shown = CPX.safe.ident(d.id) || shown;
    else if (d.cpxPanel === "hello") {
      sendLook();
      if (shown) showIn(shown);
    }
  }

  // Язык сменили (в самом окне) — подписи кнопки и фрейма на новом языке.
  function relabel() {
    if (btn) btn.setAttribute("aria-label", CPX.t("panel.title"));
    if (frame) frame.title = CPX.t("panel.title");
    if (win && win.el) win.el.setAttribute("aria-label", CPX.t("panel.title"));
  }

  CPX.boot.add(
    "settings-panel",
    () => {
      if (window.top !== window) return;
      window.addEventListener("message", CPX.guard("panel:msg", onMessage));
      if (CPX.world !== "kick") {
        CPX.dom.on('[data-a-target="user-menu-toggle"]', (n) => CPX.safely("panel:mount", () => mount(n)));
        watchGear();
      }
      CPX.settings.on("general.lang", () => setTimeout(() => CPX.safely("panel:lang", relabel), 0));
    },
    94
  );

  CPX.diag.add("settingsPanel", () => ({ button: !!document.getElementById(ROOT_ID), open: !!win }));

  return {
    open,
    close,
    toggle,
    isOpen: () => !!win,
    /** Наша кнопка (знак PLUS, щелчок — окно) с классами родной кнопки-образца; она же — «вызвавшая» окно. */
    button(tpl) {
      btn = makeButton(tpl || null);
      btn.setAttribute("aria-expanded", String(!!win));
      return btn;
    },
  };
})();

// ── src/main/95_ui.js ──
/* Общий набор наших окон — часть 1 (ядро): слой Shadow DOM, стили, тема, значки, подсказки,
 * расстановка всплывающего относительно якоря, «щелчок мимо» и Esc.
 *
 * Файлы набора: 95_ui (это), 96_ui_forms (элементы форм), 97_ui_windows (всплывашка, меню,
 * модалка, тосты, окно), 98_ui_input (кнопки у поля ввода Twitch), 98_ui_showcase (витрина, dev).
 * Стили — styles/ui-0*; вид — «Мозаика» (задание Z:\_memstudy\design\mosaic\PROMPT.md): поверхности из
 * клеток (styles/_mosaic.css — основа, styles/_tokens.css — цвета; оба вставляет сборка, текстуры и маски
 * считает tools/mosaic.py), ступенчатые края с выбоинами, жёсткая тень, появление маской из клеток.
 *
 * СЛОЙ. Все наши окна живут в ОДНОМ закрытом Shadow DOM (<cpx-ui class="cpx-own"> на
 * documentElement): стили Twitch и чужих расширений внутрь не проникают, наши — наружу.
 * Стили — ui.css: сборка склеивает styles/ui-*.css (свои стили области кладите в styles/ui-80-*,
 * ui-85-*, ui-88-*, ui-90-*), текст приходит через мост (iso.getText) и ставится одной таблицей
 * (adoptedStyleSheets) во все наши теневые корни. Пока таблицы нет — слой скрыт (ничего не мелькает
 * без стилей), расстановка окон — по её приходу. Полноэкранный режим: элемент переезжает внутрь
 * document.fullscreenElement (иначе окна не видны поверх полноэкранного плеера), при выходе —
 * обратно (как BTTV shadow_dom); во весь экран — НАШ элемент (плеер поста eblo.id) — слой не двигается, а Esc
 * выхода не закрывает окно под ним. Тема: окна всегда в фирменной тёмной палитре клиента; на светлом
 * Twitch — другая тень и тёмная обводка (класс cpx-ui--light). Клавиши, набранные в наших полях,
 * не доходят до горячих клавиш Twitch. Всё — RU+EN, клавиатура, фокус-кольцо, reduced-motion.
 *
 * ── API (CPX.ui) ─────────────────────────────────────────────────────────────────────────────
 * ⚠️КОГДА ДОСТУПНО. CPX.ui объявляется в 95–98, а модерация (80–84), карточка (85–87), общие баны
 * (88–89) и опросы (90–94) склеиваются РАНЬШЕ: на верхнем уровне их файлов CPX.ui ещё НЕТ (вызов
 * CPX.ui.addIcon/inputButton там упадёт). Звать только изнутри CPX.boot.add(…) или обработчиков.
 * Все фабрики возвращают готовые элементы/ручки; тексты людей — только textContent.
 * «Якорь» (anchor) везде: DOM-элемент (в том числе внутри нашего Shadow DOM), прямоугольник
 * {left,top,width,height} или точка {x,y}, или функция → одно из этого (тогда всплывающее едет
 * за якорем). Подсказка у любого нашего элемента — атрибут data-cpx-tip="текст"
 * (data-cpx-tip-side="top|bottom|left|right").
 *
 * Ядро (95):
 *   CPX.ui.ready                       Promise — стили пришли, окна видимы. Не пришли (мост молчит)
 *     — ждёт: загрузка повторяется при следующем открытии окна, окна появятся с её успехом.
 *   CPX.ui.icon(имя, размер=16, набор) → <svg>; CPX.ui.icons() → имена; CPX.ui.addIcon(имя, путь|части)
 *     Набор по умолчанию — клеточный «Мозаики» (CPX.glyphs, src/common/07_glyphs.js), "line" — прежний
 *     линейный (места в строках Twitch). Ниже — линейный набор (его же берёт клеточный, если рисунка нет):
 *     Значки (20×20, линия): close check checkCircle plus minus chevronDown/Up/Left/Right
 *     arrowDown/Up/Left/Right kebab dots search clock ban unban trash pin pinFilled sword warning
 *     info copy external smile poll prediction user history refresh eye link message sliders
 *     calendar shield. ban и unban — ОДИН глиф «кирпич» (решение владельца, research/04 §1.4):
 *     разбан отличается только цветом — зелёный #3fb950 (kind "ok" у кнопок). logo7tv — настоящий
 *     логотип 7TV заливкой (клеточного нет: 12.10 клеточные «77» вместо логотипа владелец счёл багом).
 *   CPX.ui.tip.show(якорь, текст, {side, delay}) / CPX.ui.tip.hide() — подсказка вручную. Текст — строка
 *     или табличка {head, value, rows:[[название, значение, "lav"?]], text, foot}; смена содержимого у
 *     видимой подсказки — на месте, без повторного появления.
 *   CPX.ui.chatRect() → прямоугольник колонки чата (или окна браузера) — куда ставить тосты/окна.
 *   CPX.ui.mount(node, слой="win") — положить свой узел прямо в слой (редко нужно).
 *
 * Формы (96) — возвращают элементы с добавочными методами:
 *   CPX.ui.button({label, icon, kind, size, full, disabled, loading, tip, onClick}) → <button>
 *     kind: primary | secondary | ghost | danger | danger-soft | ok; size: sm | md | lg.
 *     onClick вернул Promise — кнопка сама крутится до конца. Методы: setLoading, setDisabled, setLabel.
 *   CPX.ui.iconButton({icon, label, kind, size, active, disabled, tip, tipSide, onClick}) → <button>
 *     label — и подпись для диктора, и всплывающая подсказка; tip: false — без подсказки (очевидный значок:
 *     крестик, булавка, «⋮», стрелки, корзина — владелец 05.10: такие подсказки бесполезны)
 *     label — и подпись для чтеца, и подсказка. kind: accent | danger | ok. Методы: setActive,
 *     setIcon, setLabel, setDisabled.
 *   CPX.ui.input({value, placeholder, type, icon, label, hint, maxLength, counter, multiline, rows,
 *     mono, clearable, disabled, autofocus, onInput(v,e), onEnter(v,e), onEsc(v,e)}) → <label.cpx-field>
 *     .input, .value (чтение/запись), .setError(текст|null), .setHint(текст), .focus()
 *     Enter в многострочном — Ctrl+Enter. onEsc: Esc в НЕПУСТОМ поле зовёт его, и окно/всплывашка
 *     НЕ закрываются; очистить поле — дело onEsc (тогда второй Esc закроет окно). Пустое поле
 *     или поле без onEsc — Esc закрывает окно как обычно.
 *   CPX.ui.toggle({checked, label, hint, disabled, look:"switch"|"check", onChange(v)}) → <label>
 *     .checked (чтение/запись), .input, .setDisabled(v)
 *   CPX.ui.chips({items:[{value,label,icon,tip,disabled}], value, multi, size:"sm", nowrap, label,
 *     onChange(value, item, e), onPick(item, e)}) → <div>; .value (для multi — массив), .setItems()
 *     onPick без value — «кнопки-чипы» без выбора (лента длительностей).
 *   CPX.ui.list({items, render(item,i)→Node|строка, onPick(item,e), key(item), selected, flat,
 *     maxHeight, empty, emptyIcon, loadingText}) → <div.cpx-list> со своей прокруткой
 *     .setItems(items), .setLoading(текст?), .setEmpty(текст?), .setError(текст, повторить?),
 *     .setSelected(key), .items. Стрелки ↑↓ ходят по строкам, Enter/пробел — onPick.
 *   CPX.ui.spinner(размер) → <span>;  CPX.ui.skeleton({lines, width}) → <div>
 *
 * Окна (97):
 *   CPX.ui.popover({anchor, content, side:"bottom", align:"center", offset, arrow, width, className,
 *     kind, owner, trigger, focus, keepFocus, follow=true, closeOnOutside=true, closeOnEsc=true, label,
 *     matchWidth {min, max} — ширина по якорю (следит и за его сменой), inside() → элемент — щелчок в нём
 *     тоже не «мимо» (меню смайликов: поле ввода чата),
 *     tone: "tip" | "panel" (большие — меню смайликов, опросы), cell — клетка в px (по умолчанию 6),
 *     onClose(reason)}) → {el, body, update(), setContent(node), close(), open}. Переворот на другую
 *     сторону, если не влезает; зажим в окне браузера; клювик указывает на якорь. Якорь-элемент
 *     скрылся (удалён, ушёл за край окна ИЛИ за край своей прокрутки — строка чата уехала под
 *     закреп) — всплывашка закрывается (reason "anchor"). kind — вторая с тем же kind закрывает
 *     первую. owner — ручка окна (ui.window) или модалки (ui.modal): щелчок во всплывашке не
 *     закрывает окно; с хозяином она и закрывается (другие объекты не принимаются).
 *     trigger — элемент, который её открыл (кнопка-переключатель): нажатие на него — не «щелчок
 *     мимо», и обработчик кнопки сам решает, закрыть или открыть. У меню/окна, открытых с
 *     event левого щелчка, trigger берётся из события сам (ближайшая кнопка/ссылка/[data-cpx-trigger]
 *     к e.target); у правого щелчка — нет. keepFocus — щелчки внутри не отнимают фокус (курсор
 *     остаётся в поле ввода Twitch — для меню смайликов; поля внутри фокус получают как обычно).
 *   CPX.ui.menu({items, event | anchor | at:{x,y}, side:"bottom", align:"start", owner, trigger, minWidth,
 *     label, keyboard, onSelect(item, e)}) → {el, close(), setItems(items), open}
 *     owner — как у всплывашки, плюс ручка всплывашки (popover): меню, открытое из неё (или с
 *     якорем/кнопкой внутри неё), — её часть: выбор пункта её не закрывает, закрывается вместе с ней.
 *     Пункт: {id, label, icon, hint (справа моноширинно), danger, disabled, checked (true/false —
 *     колонка галочек), tip, items (подменю: массив или функция), keepOpen, onClick(item, e)};
 *     {type:"separator"} (или "-") и {type:"header", label}. event правого щелчка — меню у курсора
 *     (как у системного). Клавиши: ↑↓ Home End, Enter/пробел, → подменю, ← назад, Esc, буквы.
 *     Пункт с checked при нажатии САМ переключает it.checked и галочку (onClick видит новое
 *     значение; с keepOpen меню остаётся открытым). Пустой items — меню не открывается (open false).
 *   CPX.ui.modal({title, body | text, buttons:[{label, kind, value, full, icon, autofocus,
 *     onClick(e, h) → false|Promise}], width, dismissable=true, danger, className, onClose(value, reason)})
 *     → {el, body, close(value), result: Promise(value|null)}. Фокус заперт внутри, Esc/фон/× — null.
 *     Пока открыта модалка, окна под ней «щелчком мимо» не закрываются (щелчки в её меню и
 *     всплывашках — тоже). Всплывашки с якорем/trigger внутри модалки или owner: модалка
 *     закрываются вместе с ней.
 *   CPX.ui.confirm({title, text | body, ok, cancel, danger, okIcon, width}) → Promise<bool>
 *     danger — красная кнопка во всю ширину и под ней «Отмена» (как подтверждения клиента).
 *   CPX.ui.toast(текст | {text, kind:"info"|"ok"|"error", timeout, action:{label, onClick}, dismiss:{label, onClick}, where})
 *     (dismiss — крестик справа «больше не показывать»; onClick(e) — щелчок по самому тосту: действие и закрыть,
 *     тост с рукой-указателем и подсветкой при наведении)
 *     → {el, close()}; CPX.ui.toast.ok(текст), CPX.ui.toast.error(текст). Появляется над полем
 *     ввода по центру колонки чата (следует за ней), гаснет сам (наведение — ждёт), не больше трёх
 *     сразу. Щелчок по тосту и его кнопке («Вернуть») — не «щелчок мимо» для окон и всплывашек.
 *     where:"page" — внизу по центру страницы мимо чата, никогда не поверх него (плашка обновления, 05.11).
 *   CPX.ui.window({kind, title, body, width, height, at:{x,y} | event | anchor, trigger, parent, pinned,
 *     pinnable=true, closable=true, autoClose=true, header=true, bare, dragAnywhere, actions:[узлы],
 *     focus=true, label, className, onClose(reason), onPin(v)}) → ручка окна:
 *     {el, head, body, kind, pinned, isOpen, parent, pin(v), close(), move(x,y), fit(), setTitle(t),
 *      addAction(node), dragHandle(el), pinButton(), closeButton(), onClose(fn) → отписка, focus(),
 *      children()}
 *     Правила (как клиент, research/05 §2.2): открывается у курсора со сдвигом (−w/3, −h/5) и
 *     вписывается в окно браузера (после роста — сдвигается обратно); таскается за шапку (или за
 *     свои ручки dragHandle; dragAnywhere — за любое «пустое» место); булавка закрепляет;
 *     незакреплённое закрывается щелчком мимо (родня — родитель/дети/их всплывашки — «не мимо»);
 *     одно незакреплённое окно данного kind (новое заменяет прежнее, кроме своих предков);
 *     дочерние (parent — ручка окна; другое не принимается) закрываются вместе с родителем
 *     (закреплённые остаются); Esc закрывает окно с фокусом. Прокрутке чата не мешает (своя
 *     прокрутка тела с overscroll-behavior: contain).
 *     overModal — ручка модалки: окно ПОВЕРХ неё (слой over; карточка из повтора чата окна клипа, владелец 19.10);
 *     его дочерние — тоже. Такие окна закрываются вместе с модалкой, щелчком мимо (и в самой модалке), Esc — раньше
 *     модалки.
 *     reason в onClose: close | esc | outside | replaced | parent.
 *   CPX.ui.windows(kind?) → открытые ручки; CPX.ui.closeWindows(kind?) — закрыть (кроме закреплённых).
 *
 * У поля ввода (98):
 *   CPX.ui.inputButton({id, order=50, icon, title, visible()→bool, onClick(e, el), accent, menu: {label, icon}})
 *     menu — ряд не влез в строку: кнопка уходит пунктом в меню шестерёнки (onClick с якорем-шестерёнкой);
 *     → {el, update(), remove(), setActive(v), setIcon(имя), setTitle(t)} — наша кнопка в ряду под
 *     полем ввода Twitch (перед «Настройками чата»; в режиме модератора — перед «Отправить»),
 *     переживает перерисовку React. Порядок — по order слева направо. visible() проверяется при
 *     каждой перестановке; поменялось своё условие — позвать update(). Всплывашку/окно от кнопки
 *     открывать с trigger: el — тогда повторное нажатие закрывает (переключатель).
 *   CPX.ui.inputButtons.refresh() — перепроверить visible() всех кнопок (сменилось общее условие).
 *   CPX.ui.inputAnchor() → прямоугольник поля ввода (или null). Всплывашка над полем:
 *     CPX.ui.popover({anchor: CPX.ui.inputAnchor, side: "top", align: "end", …}).
 *
 * Внутреннее для 96–98 (CPX.ui._): surface(el, {tone, shape, cell}) — классы поверхности и
 *   элемент тени; mzj(el, {kind, body, bites, steps, maxDepth, smallK2}) / unmzj / reshape — форма с
 *   выбоинами (общий ResizeObserver); appear / vanish(el, done) / tap — маска из клеток.
 *
 * Витрина (98_ui_showcase.js, только dev): CPX.ui.demo() — все компоненты (для проверки стендом).
 * В сборке для магазина её можно не собирать: --exclude "src/main/98_ui_showcase.js,styles/ui-09-*".
 */

CPX.ui = (() => {
  const log = CPX.log("ui");
  const ui = {};
  const U = {}; // внутреннее для частей 96–98 (другим модулям — не трогать)
  ui._ = U;

  CPX.i18n.add({
    ru: {
      "ui.close": "Закрыть",
      "ui.pin": "Закрепить",
      "ui.unpin": "Открепить",
      "ui.cancel": "Отмена",
      "ui.ok": "ОК",
      "ui.confirm": "Подтвердить",
      "ui.loading": "Загрузка…",
      "ui.empty": "Пока пусто",
      "ui.error": "Не удалось загрузить",
      "ui.retry": "Повторить",
      "ui.clear": "Очистить",
      "ui.search": "Поиск",
      "ui.more": "Ещё",
      "ui.dismiss": "Скрыть",
    },
    en: {
      "ui.close": "Close",
      "ui.pin": "Pin",
      "ui.unpin": "Unpin",
      "ui.cancel": "Cancel",
      "ui.ok": "OK",
      "ui.confirm": "Confirm",
      "ui.loading": "Loading…",
      "ui.empty": "Nothing here yet",
      "ui.error": "Couldn't load",
      "ui.retry": "Retry",
      "ui.clear": "Clear",
      "ui.search": "Search",
      "ui.more": "More",
      "ui.dismiss": "Dismiss",
    },
  });

  const reduceMq = window.matchMedia ? matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  U.reduced = () => reduceMq.matches;
  // Появление/уход/нажатие клетками — ещё и по настройке «Отключить анимации появления» (general.noAppear).
  // U.reduced — только системное «меньше движения» (им пользуются и не-появления: прокрутка меню, GIF).
  U.still = () => U.reduced() || CPX.mz.off();
  U.cls = (...a) => a.filter(Boolean).join(" ");

  /* ── слой ─────────────────────────────────────────────────────────────────────
   * Сам элемент — нулевого размера и fixed: окна внутри — тоже fixed, от окна браузера. Стиль
   * элемента — встроенный: он сильнее правила :host {all: initial} из нашей же таблицы. */
  const HOST_STYLE =
    "position:fixed;left:0;top:0;width:0;height:0;margin:0;padding:0;border:0;overflow:visible;display:block;z-index:2147483000;";
  const LAYERS = ["win", "modal", "over", "pop", "toast", "tip"]; // over — окна поверх модалки (ui.window overModal)
  const FS_ESC_MS = 500;
  const L = { host: null, shadow: null, root: null, layers: {}, sheet: null, styled: false, loading: false, failedAt: 0 };
  const shadows = new Set(); // все наши теневые корни (слой + ряды кнопок у поля ввода)
  const roots = new Set(); // их корневые .cpx-ui (тема)
  const readyFns = [];
  let readyResolve;
  ui.ready = new Promise((r) => (readyResolve = r));

  function build() {
    const host = document.createElement("cpx-ui");
    host.className = "cpx-own";
    host.setAttribute("style", HOST_STYLE);
    const shadow = host.attachShadow({ mode: "closed" });
    const root = document.createElement("div");
    root.className = "cpx-ui";
    root.hidden = !L.styled;
    for (const n of LAYERS) {
      const d = document.createElement("div");
      d.className = "cpx-l cpx-l--" + n;
      root.appendChild(d);
      L.layers[n] = d;
    }
    shadow.appendChild(root);
    L.host = host;
    L.shadow = shadow;
    L.root = root;
    track(shadow, root, true);
    adopt(shadow, root);
    document.addEventListener("fullscreenchange", syncFullscreen);
    document.addEventListener("webkitfullscreenchange", syncFullscreen);
  }

  /** Корень слоя (или его подслой win|modal|pop|toast|tip); создаётся при первом обращении. */
  function layer(name) {
    if (!L.root) build();
    if (!L.host.isConnected) (target() || document.documentElement).appendChild(L.host);
    if (!L.sheet) loadStyles(); // прошлая загрузка не удалась — повторить при новом окне
    return name ? L.layers[name] : L.root;
  }
  U.layer = layer;
  ui.mount = (node, name) => layer(name || "win").appendChild(node);

  /* ── полноэкранный режим ──────────────────────────────────────────────────── */
  const REPLACED = /^(VIDEO|IFRAME|IMG|CANVAS|OBJECT|EMBED)$/;
  function fsElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }
  function target() {
    const fs = fsElement();
    // Внутрь «заменяемых» элементов (сам <video>) дети не рисуются — тогда остаёмся на месте.
    if (fs && fs.nodeType === 1 && !REPLACED.test(fs.tagName)) return fs;
    return document.documentElement;
  }
  const fsFns = [];
  U.onFullscreen = (fn) => fsFns.push(fn);
  function syncFullscreen() {
    if (!L.host) return;
    // Во весь экран — наш же элемент (плеер поста eblo.id, 86_eblo_player.js): document.fullscreenElement — сам хозяин
    // слоя. Слой не двигаем (переезд в самого себя бросил бы ошибку, а вынос из полноэкранного окна Twitch его бы
    // закрыл); выход запоминаем — Esc выхода не должен закрыть окно поста (onEscape ниже).
    const own = fsElement() === L.host;
    if (L.fsOwn && !own) L.fsOwnAt = Date.now();
    L.fsOwn = own;
    if (own) return;
    const t = target();
    if (!t || L.host.parentNode === t) return;
    // moveBefore (Chrome 133+) переносит, не перезагружая фреймы внутри (окно настроек — страница
    // расширения во фрейме: при appendChild она грузилась заново, ревью 01.10). Нет — как раньше.
    if (typeof t.moveBefore === "function") {
      try {
        t.moveBefore(L.host, null);
      } catch (_) {
        t.appendChild(L.host);
      }
    } else t.appendChild(L.host); // таблица стилей (adoptedStyleSheets) переезжает вместе с корнем
    for (const fn of fsFns) CPX.safely("ui:fullscreen", fn);
  }
  // Для стенда: полноэкранный режим без жеста человека не включить — зовём обработчик сами.
  ui._syncFullscreen = syncFullscreen;
  ui._host = () => L.host;

  /* ── стили ────────────────────────────────────────────────────────────────── */
  function adopt(shadow, root) {
    shadows.add(shadow);
    if (root) {
      roots.add(root);
      applyTheme(root);
      root.classList.toggle("cpx-no-appear", CPX.mz.off()); // стили слоя гасят клеточные кадры (_mosaic.css)
      watchTheme();
    }
    if (L.sheet) shadow.adoptedStyleSheets = [L.sheet];
    else loadStyles();
  }
  U.adopt = adopt;

  async function loadStyles() {
    // После неудачи — не чаще раза в 10 с (layer() зовёт нас при каждом новом окне).
    if (L.loading || L.sheet || Date.now() - L.failedAt < 10000) return;
    L.loading = true;
    for (let i = 0; i < 5; i++) {
      try {
        const text = await CPX.bg.call("iso.getText", { path: "ui.css" }, { timeout: 15000 });
        if (typeof text !== "string" || text.length < 100) throw new Error("ui.css пуст");
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(text);
        L.sheet = sheet;
        for (const s of shadows) s.adoptedStyleSheets = [sheet];
        L.styled = true;
        warmMasks(text);
        if (L.root) L.root.hidden = false;
        readyResolve();
        for (const fn of readyFns.splice(0)) CPX.safely("ui:ready", fn);
        return;
      } catch (e) {
        if (e && e.code === "dead") break;
        await CPX.sleep(700 * (i + 1));
      }
    }
    L.loading = false;
    L.failedAt = Date.now();
    log.warn("стили окон не загрузились — окна Chatterino+ появятся после удачного повтора");
  }
  // Кадры маски появления — SVG-картинки: при первом показе браузер разбирает каждую как отдельный
  // документ, и первое окно «спотыкалось» на появлении (стенд 04.10: ~90 мс без кадров). Разбираем их
  // заранее, в простое, и держим (иначе кэш их отпустит).
  function warmMasks(text) {
    const urls = [...new Set(String(text).match(/url\("data:image\/svg\+xml,[^"]+"\)/g) || [])];
    if (!urls.length) return;
    const run = () => {
      L.warm = urls.map((u) => {
        const im = new Image();
        im.src = u.slice(5, -2);
        if (typeof im.decode === "function") im.decode().catch(() => {});
        return im;
      });
    };
    if (typeof requestIdleCallback === "function") requestIdleCallback(run, { timeout: 3000 });
    else setTimeout(run, 500);
  }
  // Стили — заранее, в главной рамке: тост «Chatterino+ обновился — обновите страницу» (99_start)
  // появляется, когда моста уже нет, — загрузить ui.css тогда нечем, и тост оставался невидимым.
  // Не ждём: запуск остальных частей стилями не задерживается.
  CPX.boot.add("ui:styles", () => {
    if (window.top === window) loadStyles();
  }, 90);
  /** fn — сразу, если стили уже есть, иначе по их приходу (до этого размеры окон нулевые). */
  U.whenStyled = (fn) => (L.styled ? CPX.safely("ui:ready", fn) : readyFns.push(fn));
  U.styled = () => L.styled;

  /* ── тема Twitch ──────────────────────────────────────────────────────────── */
  const isLight = () => document.documentElement.classList.contains("tw-root--theme-light");
  function applyTheme(root) {
    root.classList.toggle("cpx-ui--light", isLight());
  }
  /* ── «Отключить анимации появления» (general.noAppear) ─────────────────────── */
  function syncAppear() {
    CPX.mz.setOff(!!CPX.settings.get("general.noAppear")); // документ Twitch: класс на <html>
    for (const r of roots) r.classList.toggle("cpx-no-appear", CPX.mz.off());
  }
  syncAppear();
  CPX.settings.on("general.noAppear", syncAppear);

  let themeMo = null;
  function watchTheme() {
    if (themeMo) return;
    themeMo = new MutationObserver(() => {
      for (const r of roots) applyTheme(r);
      // Классы <html> переставил Twitch — вернуть свой «без анимаций появления» (то же состояние — без записи).
      document.documentElement.classList.toggle("cpx-no-appear", CPX.mz.off());
    });
    themeMo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  }

  /* ── фокус внутри наших теневых корней ────────────────────────────────────── */
  /** Элемент с фокусом с учётом наших закрытых теневых корней. */
  U.active = function () {
    let a = document.activeElement;
    for (const s of shadows) {
      if (a && s.host === a) {
        a = s.activeElement || a;
        break;
      }
    }
    return a;
  };
  U.focusIn = (el) => {
    const a = U.active();
    return !!(a && el && el.contains(a));
  };
  U.focus = (el) => {
    if (el && el.isConnected && typeof el.focus === "function") {
      try {
        el.focus({ preventScroll: true });
      } catch (_) {}
    }
  };
  const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  U.focusables = (root) => [...root.querySelectorAll(FOCUSABLE)].filter((e) => e.offsetParent !== null || e.getClientRects().length);

  /* ── события в наших корнях: путь щелчка, подсказки, клавиши ─────────────────
   * Слушатель на окне страницы не видит, КУДА внутри закрытого Shadow DOM пришёлся щелчок
   * (composedPath обрезан на нашем элементе). Поэтому путь записывает слушатель самого теневого
   * корня, а решение «щелчок мимо» принимается после всей раздачи события (setTimeout 0). */
  const innerPaths = new WeakMap();
  function track(shadow, root, isLayer) {
    shadow.addEventListener("pointerdown", (e) => innerPaths.set(e, e.composedPath()), true);
    root.addEventListener("mouseover", onTipOver);
    root.addEventListener("mouseout", onTipOut);
    root.addEventListener("focusin", onTipFocus);
    root.addEventListener("focusout", onTipOut);
    if (isLayer) {
      // Набранное в наших окнах не должно включать горячие клавиши Twitch (плеер, чат).
      const stop = (e) => e.stopPropagation();
      root.addEventListener("keydown", stop);
      root.addEventListener("keyup", stop);
      root.addEventListener("keypress", stop);
    }
  }
  U.track = track;

  let epoch = 0;
  /** Метка рождения окна/всплывающего: закрывать «щелчком мимо» только то, что было открыто
   * до этого щелчка (иначе меню, открытое тем же щелчком, тут же закрылось бы). */
  U.born = () => ++epoch;
  const outsideFns = [];
  U.onOutside = (fn) => outsideFns.push(fn);
  U.hasOpen = () => false; // переопределяет 97
  window.addEventListener(
    "pointerdown",
    (e) => {
      hideTip();
      if (!outsideFns.length || !U.hasOpen()) return;
      const outer = e.composedPath();
      const ep = epoch;
      setTimeout(() => {
        const path = innerPaths.get(e) || outer;
        for (const fn of outsideFns) CPX.safely("ui:outside", () => fn(path, ep, e));
      }, 0);
    },
    true
  );

  const escFns = [];
  U.onEscape = (fn) => escFns.push(fn);
  window.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Escape" || e.isComposing) return;
      hideTip();
      // Наш плеер во весь экран: Esc только выходит из полноэкранного (браузер иногда выходит раньше нас — тогда
      // FS_ESC_MS после выхода Esc тоже ничего не закрывает).
      if (fsElement() === L.host || Date.now() - (L.fsOwnAt || 0) < FS_ESC_MS) {
        if (fsElement() === L.host && document.exitFullscreen) document.exitFullscreen().catch(() => {});
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      // Наш слушатель — на окне в фазе перехвата, он раньше самого поля. Непустое поле с onEsc
      // (96 помечает его data-cpx-esc) разбирается само: сначала очистить, окно — вторым Esc.
      const a = U.active();
      if (a && a.hasAttribute && a.hasAttribute("data-cpx-esc") && a.value) return;
      for (const fn of escFns) {
        if (CPX.safely("ui:esc", () => fn(e)) === true) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
      }
    },
    true
  );

  /* ── расстановка всплывающего ─────────────────────────────────────────────── */
  U.viewW = () => document.documentElement.clientWidth || window.innerWidth;
  U.viewH = () => document.documentElement.clientHeight || window.innerHeight;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  U.clamp = clamp;

  /** Прямоугольник якоря или null (элемент пропал / не якорь). */
  function rectOf(a) {
    if (typeof a === "function") a = CPX.safely("ui:anchor", a);
    if (!a || typeof a !== "object") return null;
    if (typeof Element !== "undefined" && a instanceof Element) {
      if (!a.isConnected) return null;
      const r = a.getBoundingClientRect();
      if (!r.width && !r.height && !r.left && !r.top) return null; // спрятан (display:none)
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    }
    const x = typeof a.left === "number" ? a.left : a.x;
    const y = typeof a.top === "number" ? a.top : a.y;
    if (typeof x !== "number" || typeof y !== "number") return null;
    const w = Number(a.width) || 0;
    const h = Number(a.height) || 0;
    return { left: x, top: y, right: x + w, bottom: y + h, width: w, height: h };
  }
  U.rectOf = rectOf;

  function alignPos(lo, hi, size, align, max, m) {
    let p = align === "start" ? lo : align === "end" ? hi - size : (lo + hi) / 2 - size / 2;
    // Как у системных меню: не влезло с этой стороны — отразить через якорь/курсор.
    if (align === "start" && p + size > max - m && hi - size >= m) p = hi - size;
    else if (align === "end" && p < m && lo + size <= max - m) p = lo;
    return p;
  }

  /** Поставить el (position: fixed) у прямоугольника a.
   *  o: side (top|bottom|left|right), align (start|center|end), offset, margin, arrow (элемент).
   *  Не влезает со своей стороны — переворот на противоположную (или туда, где просторнее),
   *  затем зажим в окне браузера. Высота — не больше окна (дальше — своя прокрутка). → сторона */
  function place(el, a, o) {
    o = o || {};
    const m = o.margin != null ? o.margin : 8;
    const vw = U.viewW();
    const vh = U.viewH();
    const off = o.offset != null ? o.offset : 6;
    el.style.maxHeight = Math.max(80, vh - 2 * m) + "px";
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const space = { top: a.top - off - m, bottom: vh - a.bottom - off - m, left: a.left - off - m, right: vw - a.right - off - m };
    const opp = { top: "bottom", bottom: "top", left: "right", right: "left" };
    let side = space[o.side] != null ? o.side : "bottom";
    const need = side === "top" || side === "bottom" ? h : w;
    if (space[side] < need) {
      if (space[opp[side]] >= need || space[opp[side]] > space[side]) side = opp[side];
    }
    const vert = side === "top" || side === "bottom";
    let x;
    let y;
    if (vert) {
      y = side === "bottom" ? a.bottom + off : a.top - off - h;
      x = alignPos(a.left, a.right, w, o.align || "center", vw, m);
    } else {
      x = side === "right" ? a.right + off : a.left - off - w;
      y = alignPos(a.top, a.bottom, h, o.align || "center", vh, m);
    }
    x = clamp(x, m, Math.max(m, vw - w - m));
    y = clamp(y, m, Math.max(m, vh - h - m));
    el.style.left = Math.round(x) + "px";
    el.style.top = Math.round(y) + "px";
    el.dataset.side = side;
    if (o.arrow) {
      const along = vert ? (a.left + a.right) / 2 - x : (a.top + a.bottom) / 2 - y;
      const size = vert ? w : h;
      const pad = 16;
      const at = Math.round(clamp(along, pad, Math.max(pad, size - pad)) - 6);
      o.arrow.style.left = vert ? at + "px" : "";
      o.arrow.style.top = vert ? "" : at + "px";
    }
    return side;
  }
  U.place = place;

  /** Колонка чата (наш список, иначе чат Twitch), обрезанная окном браузера; нет — всё окно. */
  ui.chatRect = function () {
    const vw = U.viewW();
    const vh = U.viewH();
    const fs = fsElement();
    const cands = [
      CPX.list && typeof CPX.list.root === "function" ? CPX.list.root() : null,
      CPX.chat && typeof CPX.chat.root === "function" ? CPX.chat.root() : null, // мир Kick: видимый чат Kick
      document.querySelector(".chat-list--default, .chat-list--other"),
      document.querySelector(".stream-chat"),
      document.querySelector(".chat-shell"),
    ];
    for (const el of cands) {
      if (!el || !el.isConnected || (fs && !fs.contains(el))) continue;
      const r = el.getBoundingClientRect();
      const left = Math.max(0, r.left);
      const top = Math.max(0, r.top);
      const right = Math.min(vw, r.right);
      const bottom = Math.min(vh, r.bottom);
      if (right - left >= 160 && bottom - top >= 120) return { left, top, right, bottom, width: right - left, height: bottom - top };
    }
    return { left: 0, top: 0, right: vw, bottom: vh, width: vw, height: vh };
  };

  /* ── появление/исчезновение («Мозаика» §5.4) ───────────────────────────────────
   * Маска из клеток кадрами (styles/_mosaic.css: cpx-mz-in 170 мс, cpx-mz-out 140 мс, cpx-mz-tap 120 мс,
   * steps(1, end)). Класс ставится В ТОЙ ЖЕ задаче, в которой элемент становится видимым, — первый
   * отрисованный кадр уже замаскирован (раньше: класс начального состояния после измерения + снятие
   * в следующем кадре — «вспышка с провалом»). Конец — animationend ИЛИ страховочный таймер
   * (длительность + 60 мс): в фоновой вкладке и при display:none посреди анимации события нет, окно
   * зависло бы полупрозрачным. Повторный показ во время ухода отменяет уход (жетон). */
  const MZ_DUR = { "cpx-mz-in": 170, "cpx-mz-out": 140, "cpx-mz-tap": 120 };
  function onAnimEnd(el, name, fn) {
    let fired = false;
    let t = 0;
    const h = (e) => e.target === el && e.animationName === name && fin();
    function fin() {
      if (fired) return;
      fired = true;
      el.removeEventListener("animationend", h);
      clearTimeout(t);
      CPX.safely("ui:anim", fn);
    }
    el.addEventListener("animationend", h);
    t = setTimeout(fin, (MZ_DUR[name] || 200) + 60);
  }
  function restart(el, name) {
    if (el.classList.contains(name)) {
      el.classList.remove(name);
      void el.offsetWidth; // тот же класс заново — иначе анимация не начнётся сначала
    }
    el.classList.add(name);
  }
  /** Появление маской. Элемент уже в слое и расставлен (размеры посчитаны). */
  U.appear = function (el) {
    el._cpxOut = null; // отменить уход, если шёл
    el.classList.remove("cpx-mz-out");
    if (U.still() || !L.styled) return;
    const tok = (el._cpxIn = {});
    restart(el, "cpx-mz-in");
    onAnimEnd(el, "cpx-mz-in", () => el._cpxIn === tok && el.classList.remove("cpx-mz-in"));
  };
  /** Уход маской, затем узел удаляется (done — после удаления). Пустого кадра до удаления нет:
   * последний кадр маски (m0) держится до el.remove(). */
  U.vanish = function (el, done) {
    // Подсказка у элемента внутри уходящего — прятать сразу (мышь могла и не двинуться).
    if (tip.anchor instanceof Node && el.contains(tip.anchor)) hideTip();
    const fin = () => {
      el.remove();
      if (done) CPX.safely("ui:vanish", done);
    };
    el._cpxIn = null;
    el.classList.remove("cpx-mz-in");
    if (U.still() || !L.styled || !el.isConnected) return fin();
    const tok = (el._cpxOut = {});
    restart(el, "cpx-mz-out");
    onAnimEnd(el, "cpx-mz-out", () => el._cpxOut === tok && fin());
  };
  /** Нажатие: маска m4 → m5 → нет за 120 мс (одно проигрывание). */
  U.tap = function (el) {
    if (!el || U.still()) return;
    restart(el, "cpx-mz-tap");
    onAnimEnd(el, "cpx-mz-tap", () => el.classList.remove("cpx-mz-tap"));
  };

  /* ── поверхность и форма окон («Мозаика» §4.3–§4.6) ───────────────────────────
   * U.surface(el, {tone, shape, cell}) — классы поверхности (cpx-mz + форма cpx-k1|k2|k21 или
   * «окно с выбоинами» mzj + тон cpx-t-*). Теней нет (владелец 04.10).
   * U.mzj / U.unmzj / U.reshape — форма с выбоинами (common/09_mzj.js, там же подробности). */
  U.surface = function (el, o) {
    o = o || {};
    el.classList.add("cpx-mz", "cpx-t-" + (o.tone || "panel"));
    if (o.shape === "mzj") el.classList.add("cpx-mzj");
    else el.classList.add("cpx-" + (o.shape || "k2"));
    if (o.cell) el.style.setProperty("--cpx-c", o.cell + "px");
    return el;
  };
  // Форма с выбоинами — общий модуль (common/09_mzj.js): им же пользуются страницы расширения.
  U.hash = CPX.mzj.hash;
  U.mzj = CPX.mzj.attach;
  U.unmzj = CPX.mzj.detach;
  U.reshape = CPX.mzj.reshape;

  /* ── значки ───────────────────────────────────────────────────────────────────
   * Свои, 20×20, линией 1.6 (как тонкие глифы клиента). Часть: строка — путь линией;
   * {d, fill:true} — залитый путь. Глифы модерации — по описанию клиента (research/04 §1.3–1.4):
   * «кирпич» бана/разбана — круг с диагональю, мут — циферблат, корзина — крышка, ручка,
   * трапеция, 3 ребра. */
  const SVG_NS = "http://www.w3.org/2000/svg";
  const RING = "M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0z";
  const dot = (x, y, r) => ({ d: "M" + (x - r) + " " + y + "a" + r + " " + r + " 0 1 0 " + 2 * r + " 0a" + r + " " + r + " 0 1 0 " + -2 * r + " 0z", fill: true });
  const ICONS = {
    close: "M5.5 5.5l9 9M14.5 5.5l-9 9",
    check: "M4.5 10.5l3.6 3.6L15.5 6.5",
    plus: "M10 4.5v11M4.5 10h11",
    minus: "M4.5 10h11",
    chevronDown: "M5.5 8l4.5 4.5L14.5 8",
    chevronUp: "M5.5 12l4.5-4.5 4.5 4.5",
    chevronLeft: "M12 5.5L7.5 10l4.5 4.5",
    chevronRight: "M8 5.5l4.5 4.5L8 14.5",
    arrowDown: "M10 4v12M5.5 11.5L10 16l4.5-4.5",
    arrowUp: "M10 16V4M5.5 8.5L10 4l4.5 4.5",
    arrowLeft: "M16 10H4M8.5 5.5L4 10l4.5 4.5",
    arrowRight: "M4 10h12M11.5 5.5L16 10l-4.5 4.5",
    kebab: [dot(10, 4.6, 1.55), dot(10, 10, 1.55), dot(10, 15.4, 1.55)],
    dots: [dot(4.6, 10, 1.55), dot(10, 10, 1.55), dot(15.4, 10, 1.55)],
    search: ["M13.8 8.8a5 5 0 1 1-10 0 5 5 0 0 1 10 0z", "M12.4 12.4L16.5 16.5"],
    clock: [RING, "M10 6.2V10l2.8 1.8"],
    ban: [RING, "M5.05 5.05l9.9 9.9"],
    // Разбан — тот же «кирпич», отличие только цветом (зелёный, решение владельца).
    unban: [RING, "M5.05 5.05l9.9 9.9"],
    checkCircle: [RING, "M6.8 10.2l2.2 2.2 4.3-4.6"],
    trash: ["M3.8 5.6h12.4", "M8 5.6V3.8h4v1.8", "M5.4 5.6l.9 10.6h7.4l.9-10.6", "M8.3 8.6v4.8M10 8.6v4.8M11.7 8.6v4.8"],
    pin: ["M6.5 3.2h7", "M8 3.2v4.4L5.3 11.2h9.4L12 7.6V3.2", "M10 11.2v5.6"],
    pinFilled: ["M6.5 3.2h7", { d: "M8 3.2h4v4.4l2.7 3.6H5.3L8 7.6z", fill: true }, "M8 3.2v4.4L5.3 11.2h9.4L12 7.6V3.2", "M10 11.2v5.6"],
    sword: ["M16.5 3.5l-.7 3.3-6.9 6.9-2.6-2.6 6.9-6.9z", "M4.6 10.6l4.8 4.8", "M6.4 13.6l-2.9 2.9"],
    warning: ["M10 3.3l7.4 13H2.6z", "M10 8.2v3.6", "M10 14.1v.1"],
    info: [RING, "M10 9.2v4.6", "M10 6.4v.1"],
    copy: ["M7.2 7.2h8.3v9.3H7.2z", "M12.8 7.2V3.5H4.5v9.3h2.7"],
    external: ["M11.5 3.8h4.7v4.7", "M16.2 3.8l-7 7", "M14.5 11.8v3.7a.8.8 0 0 1-.8.8H4.5a.8.8 0 0 1-.8-.8V6.3a.8.8 0 0 1 .8-.8h3.7"],
    smile: [RING, "M7 11.6c.8 1.3 1.8 1.9 3 1.9s2.2-.6 3-1.9", "M7.6 7.9v.3M12.4 7.9v.3"],
    poll: ["M3.8 5.5h7.4", "M3.8 10h12.4", "M3.8 14.5h9.4"],
    prediction: ["M6.5 16V4", "M3.8 6.7L6.5 4l2.7 2.7", "M13.5 4v12", "M10.8 13.3l2.7 2.7 2.7-2.7"],
    user: ["M13 6.8a3 3 0 1 1-6 0 3 3 0 0 1 6 0z", "M4.2 16.5c.7-2.8 3-4.3 5.8-4.3s5.1 1.5 5.8 4.3"],
    history: ["M3.6 10a6.4 6.4 0 1 0 1.9-4.5", "M3.4 3.8v3h3", "M10 6.6V10l2.4 1.5"],
    refresh: ["M16 10a6 6 0 1 1-1.8-4.3", "M16.2 3.6v3.5h-3.5"],
    eye: ["M2.5 10s2.8-5 7.5-5 7.5 5 7.5 5-2.8 5-7.5 5-7.5-5-7.5-5z", "M12.3 10a2.3 2.3 0 1 1-4.6 0 2.3 2.3 0 0 1 4.6 0z"],
    link: ["M8.6 11.4l2.8-2.8", "M9.3 6.3l1.2-1.2a3 3 0 0 1 4.3 4.3l-1.2 1.2", "M10.7 13.7l-1.2 1.2a3 3 0 0 1-4.3-4.3l1.2-1.2"],
    message: ["M4.2 4.2h11.6a1 1 0 0 1 1 1v7.6a1 1 0 0 1-1 1H9.2l-4 3v-3h-1a1 1 0 0 1-1-1V5.2a1 1 0 0 1 1-1z"],
    sliders: ["M3.8 6h6.2M14.8 6h1.4M3.8 14h1.4M9.8 14h6.4", "M14.6 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM9.6 14a2 2 0 1 1-4 0 2 2 0 0 1 4 0z"],
    calendar: ["M4 5.5h12v10.7H4z", "M4 8.8h12", "M7.2 3.6v3.4M12.8 3.6v3.4"],
    shield: ["M10 3.2l6 2.3v4.2c0 3.6-2.6 6-6 7.1-3.4-1.1-6-3.5-6-7.1V5.5z"],
    // Логотип 7TV (как у клиента в строках 7TV — :/buttons/seventv.png): форма из исходников расширения 7TV
    // (research/upstream/seventv/public/logo.svg, 109.6×80.9), вписана по ширине в 20×20.
    logo7tv: [{ d: "M15.35 6.67l.91-1.59 .49-.84L15.84 2.66V2.62H10.97l.91 1.59 .91 1.59 .51 .88H15.35zM5.29 17.33l.91-1.59 .91-1.59 .91-1.59 .91-1.59 .91-1.59 .91-1.59L11.44 6.63l-.91-1.59-.91-1.59L9.11 2.64H1.41l-.91 1.59L0 5.06l.91 1.59v.04h5.84l-.91 1.59-.91 1.59-.91 1.59-.91 1.59-.91 1.59L1.55 15.76l.91 1.59v.04H5.29zM12.92 17.33H15.71l.91-1.59 .91-1.59 .91-1.59 .91-1.59 .64-1.09-.91-1.59v-.04H16.28l-.91 1.59-.91 1.59-.13 .24-.91-1.59-.91-1.59-.13-.24-.91 1.59-.91 1.59L10.04 12.31l.91 1.59 .91 1.59 .91 1.59 .15 .26z", fill: true }],
  };
  /** Значок. Набор (set): по умолчанию — клеточный «Мозаики» (src/common/07_glyphs.js; нет рисунка —
   * линейный); "line" — линейный, для мест в строках Twitch (кнопки у поля ввода, пункты меню
   * шестерёнки, кнопки модерации в строках чата) — рядом с родными значками Twitch. */
  ui.icon = function (name, size, set) {
    size = size || 16;
    if (set !== "line") {
      const g = CPX.glyph(name === "unban" ? "ban" : name, size);
      if (g) return g;
    }
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("width", size);
    svg.setAttribute("height", size);
    svg.setAttribute("viewBox", "0 0 20 20");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.setAttribute("class", "cpx-ico cpx-ico--" + CPX.safe.ident(name));
    let def = ICONS[name];
    if (!def) def = ICONS.dots;
    for (const part of Array.isArray(def) ? def : [def]) {
      const p = document.createElementNS(SVG_NS, "path");
      const fill = typeof part === "object" && part.fill;
      p.setAttribute("d", typeof part === "string" ? part : part.d);
      if (fill) {
        p.setAttribute("fill", "currentColor");
      } else {
        p.setAttribute("fill", "none");
        p.setAttribute("stroke", "currentColor");
        p.setAttribute("stroke-width", "1.6");
        p.setAttribute("stroke-linecap", "round");
        p.setAttribute("stroke-linejoin", "round");
      }
      svg.appendChild(p);
    }
    return svg;
  };
  ui.icons = () => Object.keys(ICONS);
  /** Свой значок: путь-строка (линией) или массив частей (строки и {d, fill:true}), 20×20. */
  ui.addIcon = (name, def) => {
    if (name && def) ICONS[name] = def;
  };

  /* ── подсказка ────────────────────────────────────────────────────────────────
   * Одна на весь слой; для элементов с data-cpx-tip в любом нашем теневом корне. */
  // Вид — «Мозаика»: тон tip, форма k1 (клетка 3), хвостик-лесенка к якорю. Появление маской — только при
  // первом показе; смена текста и места у видимой подсказки — без анимации (задержка эфира обновляет
  // текст раз в секунду). Уход — маской, затем скрыта (узел один на весь слой и не удаляется).
  // Содержимое — строка (как раньше) или табличка {head, value, rows:[[название, значение, "lav"?]], text,
  // foot} (задержка эфира, «в чате», догон): шапка с крупным значением лавандой, строки «название —
  // значение» табличными цифрами, под чертой — приглушённая строка. Обновление на месте: тот же якорь и
  // то же содержимое — ничего не трогаем; другое — меняем только содержимое (без появления).
  const tip = { el: null, body: null, tail: null, anchor: null, timer: 0, watch: 0, shown: false, key: "" };
  function tipBox() {
    if (!tip.el) {
      tip.el = U.surface(CPX.el("div", { class: "cpx-tip", role: "tooltip" }), { tone: "tip", shape: "k1" });
      tip.body = CPX.el("div", { class: "cpx-tip__text" });
      tip.tail = CPX.el("i", { class: "cpx-mz-tail", "aria-hidden": "true" });
      tip.el.append(tip.body, tip.tail);
      layer("tip").appendChild(tip.el);
    }
    if (!tip.el.isConnected) layer("tip").appendChild(tip.el);
    return tip.el;
  }
  function tipKey(c) {
    return typeof c === "string" ? "s:" + c : "o:" + JSON.stringify(c);
  }
  function fillTip(c) {
    const b = tip.body;
    b.textContent = "";
    const rich = typeof c !== "string";
    tip.el.classList.toggle("cpx-tip--rich", rich);
    b.className = rich ? "cpx-tip__rich" : "cpx-tip__text";
    if (!rich) {
      b.textContent = c;
      return;
    }
    if (c.head || c.value != null) {
      b.appendChild(
        CPX.el("div", { class: "cpx-tip__head" }, [
          CPX.el("span", { text: String(c.head || "") }),
          c.value != null ? CPX.el("b", { class: "cpx-tip__val", text: String(c.value) }) : null,
        ])
      );
    }
    if (c.text) b.appendChild(CPX.el("div", { class: "cpx-tip__p", text: String(c.text) }));
    if (Array.isArray(c.rows) && c.rows.length) {
      const g = CPX.el("div", { class: "cpx-tip__rows" });
      for (const r of c.rows) {
        if (!r) continue;
        g.append(CPX.el("span", { class: "cpx-tip__k", text: String(r[0]) }), CPX.el("span", { class: "cpx-tip__v" + (r[2] === "lav" ? " cpx-tip__v--lav" : ""), text: String(r[1] == null ? "" : r[1]) }));
      }
      b.appendChild(g);
    }
    if (c.foot) b.appendChild(CPX.el("div", { class: "cpx-tip__foot", text: String(c.foot) }));
  }
  function showTip(anchor, text, side, delay) {
    clearTimeout(tip.timer);
    tip.anchor = anchor;
    // Видимая подсказка меняет якорь/текст сразу (без новой задержки и без появления).
    tip.timer = setTimeout(() => {
      if (tip.anchor !== anchor || !text) return;
      const r = rectOf(anchor);
      if (!r) return hideTip();
      const b = tipBox();
      const key = tipKey(text);
      if (key !== tip.key) {
        tip.key = key;
        fillTip(text);
      }
      b.style.maxHeight = "";
      U.whenStyled(() => {
        if (tip.anchor !== anchor) return;
        const sd = place(b, r, { side: side || "top", align: "center", offset: 8, margin: 6 });
        // Хвостик — против середины якоря (подсказка могла упереться в край окна).
        if (sd === "top" || sd === "bottom") {
          const x = clamp((r.left + r.right) / 2 - parseFloat(b.style.left) - 6, 6, Math.max(6, b.offsetWidth - 18));
          b.style.setProperty("--cpx-tail-x", Math.round(x) + "px");
        }
        if (!tip.shown) {
          tip.shown = true;
          b.classList.add("cpx-on");
          U.appear(b);
        }
        // Якорь убрали программно (перерисовка списка, закрытие по таймеру) — мышь не двигалась,
        // событий нет; редкая проверка, пока подсказка видна.
        clearInterval(tip.watch);
        if (anchor instanceof Element) tip.watch = setInterval(() => tip.anchor === anchor && !rectOf(anchor) && hideTip(), 400);
      });
    }, tip.shown ? 0 : delay || 0);
  }
  function hideTip() {
    clearTimeout(tip.timer);
    clearInterval(tip.watch);
    tip.anchor = null;
    if (!tip.el || !tip.shown) return;
    tip.shown = false;
    const b = tip.el;
    b._cpxIn = null;
    b.classList.remove("cpx-mz-in");
    if (U.still() || !b.isConnected) return b.classList.remove("cpx-on");
    const tok = (b._cpxOut = {});
    restart(b, "cpx-mz-out");
    onAnimEnd(b, "cpx-mz-out", () => {
      if (b._cpxOut !== tok) return;
      b.classList.remove("cpx-mz-out", "cpx-on");
    });
  }
  ui.tip = {
    /** text — строка или табличка {head, value, rows:[[название, значение, "lav"?]], text, foot}. */
    show(anchor, text, opts) {
      const c = text && typeof text === "object" ? text : String(text == null ? "" : text);
      showTip(anchor, c, opts && opts.side, (opts && opts.delay) || 0);
    },
    /** anchor — спрятать, только если подсказка всё ещё у него (не чужую, показанную позже). */
    hide(anchor) {
      if (!(anchor instanceof Element) || tip.anchor === anchor) hideTip();
    },
  };
  function tipTarget(t) {
    return t && t.closest ? t.closest("[data-cpx-tip]") : null;
  }
  function onTipOver(e) {
    const el = tipTarget(e.target);
    if (!el) return;
    if (el === tip.anchor) return;
    showTip(el, el.dataset.cpxTip, el.dataset.cpxTipSide, 120);
  }
  function onTipOut(e) {
    if (!tip.anchor) return;
    const to = e.relatedTarget;
    if (to && tip.anchor.contains && tip.anchor.contains(to)) return;
    hideTip();
  }
  function onTipFocus(e) {
    const el = tipTarget(e.target);
    // Только с клавиатуры: щелчок мышью сам ставит фокус, подсказка тогда мешала бы.
    if (el && el === e.target && el.matches(":focus-visible")) showTip(el, el.dataset.cpxTip, el.dataset.cpxTipSide, 0);
  }
  window.addEventListener("wheel", hideTip, { capture: true, passive: true });
  window.addEventListener("blur", hideTip);
  U.hideTip = hideTip;

  CPX.diag.add("ui", () => ({
    layer: !!(L.host && L.host.isConnected),
    styled: L.styled,
    inFullscreen: !!(L.host && fsElement() && L.host.parentNode === fsElement()),
    light: isLight(),
    shadows: shadows.size,
    tip: !!(tip.el && tip.el.classList.contains("cpx-on")),
  }));

  return ui;
})();

// ── src/main/96_ui_forms.js ──
/* Общий набор наших окон — часть 2: элементы форм (кнопка, кнопка-значок, поле, переключатель,
 * чипы, список с прокруткой, загрузка). API — в шапке 95_ui.js.
 *
 * Вид — «Мозаика» (styles/ui-01-forms.css): кнопки, кнопки-значки, чипы, коробки полей и список —
 * поверхности из клеток (классы cpx-mz + форма + тон ставятся здесь), нажатие — маска клеток (U.tap),
 * загрузка — перебор клеток (ui.spinner — значок 3×3, ui.skeleton — ряды клеток).
 *
 * Фабрики возвращают сами DOM-элементы (их можно сразу класть в окно) с добавочными методами
 * (setLoading, setError, .value …). Обработчики — через CPX.guard: ошибка в обработчике модуля
 * не ломает окно, пишется в журнал один раз.
 */

(() => {
  const ui = CPX.ui;
  const U = ui._;
  const cls = U.cls;

  const guard = (scope, fn) => (typeof fn === "function" ? CPX.guard(scope, fn) : null);

  /* ── кнопка ───────────────────────────────────────────────────────────────── */
  // Тон поверхности по виду кнопки («Мозаика» §8.3): главная — acc (форма k21), опасная — одна сплошная
  // красная (bads), «Бан» — bad со штриховкой, «Снять бан» — raised с зелёными текстом и кромкой.
  const BTN_TONE = { primary: "acc", secondary: "raised", ghost: "ghost", danger: "bads", "danger-soft": "bad", ok: "raised" };
  ui.button = function (o) {
    o = o || {};
    const kind = o.kind || "secondary";
    const b = CPX.el("button", {
      type: o.type || "button",
      class: cls(
        "cpx-btn",
        "cpx-btn--" + kind,
        o.size && o.size !== "md" && "cpx-btn--" + o.size,
        o.full && "cpx-btn--full",
        "cpx-mz cpx-mzb",
        kind === "primary" ? "cpx-k21" : "cpx-k1",
        "cpx-t-" + (BTN_TONE[kind] || "raised"),
        o.className
      ),
    });
    const iconSize = o.size === "sm" ? 14 : 16;
    let label = null;
    if (o.icon) b.appendChild(ui.icon(o.icon, iconSize));
    if (o.label != null) {
      label = CPX.el("span", { class: "cpx-btn__label", text: String(o.label) });
      b.appendChild(label);
    }
    if (o.tip) b.dataset.cpxTip = o.tip;
    if (o.ariaLabel) b.setAttribute("aria-label", o.ariaLabel);
    let spin = null;
    b.setLoading = (v) => {
      v = !!v;
      b.classList.toggle("cpx-busy", v);
      b.setAttribute("aria-busy", v ? "true" : "false");
      if (v && !spin) {
        spin = ui.spinner(14);
        b.insertBefore(spin, b.firstChild);
      } else if (!v && spin) {
        spin.remove();
        spin = null;
      }
    };
    b.setDisabled = (v) => {
      b.disabled = !!v;
    };
    b.setLabel = (t) => {
      if (!label) {
        label = CPX.el("span", { class: "cpx-btn__label" });
        b.appendChild(label);
      }
      label.textContent = String(t == null ? "" : t);
    };
    const click = guard("ui:button", o.onClick);
    if (click) {
      b.addEventListener("click", (e) => {
        if (b.disabled || b.classList.contains("cpx-busy")) return;
        U.tap(b);
        const r = click(e, b);
        if (r && typeof r.then === "function") {
          b.setLoading(true);
          r.then(
            () => b.isConnected && b.setLoading(false),
            () => b.isConnected && b.setLoading(false)
          );
        }
      });
    }
    if (o.disabled) b.disabled = true;
    if (o.loading) b.setLoading(true);
    return b;
  };

  /* ── кнопка-значок ────────────────────────────────────────────────────────── */
  ui.iconButton = function (o) {
    o = o || {};
    const size = o.size || "md";
    const iconSize = o.iconSize || (size === "sm" ? 14 : size === "lg" ? 18 : 16);
    const b = CPX.el("button", {
      type: "button",
      class: cls("cpx-ibtn", o.kind && "cpx-ibtn--" + o.kind, size !== "md" && "cpx-ibtn--" + size, "cpx-mz cpx-mzb cpx-k1", o.className),
    });
    let icon = ui.icon(o.icon, iconSize);
    b.appendChild(icon);
    b.setLabel = (t) => {
      t = String(t == null ? "" : t);
      if (t) b.setAttribute("aria-label", t);
      else b.removeAttribute("aria-label");
      if (o.tip !== false && t) b.dataset.cpxTip = t;
      else delete b.dataset.cpxTip;
    };
    b.setLabel(o.label);
    if (o.tipSide) b.dataset.cpxTipSide = o.tipSide;
    b.setActive = (v) => {
      b.classList.toggle("cpx-on", !!v);
      b.setAttribute("aria-pressed", v ? "true" : "false");
    };
    if ("active" in o) b.setActive(o.active);
    b.setIcon = (name) => {
      const n = ui.icon(name, iconSize);
      b.replaceChild(n, icon);
      icon = n;
    };
    b.setDisabled = (v) => {
      b.disabled = !!v;
    };
    if (o.disabled) b.disabled = true;
    const click = guard("ui:iconButton", o.onClick);
    if (click) {
      b.addEventListener("click", (e) => {
        if (b.disabled) return;
        U.tap(b);
        click(e, b);
      });
    }
    return b;
  };

  /* ── поле ввода ───────────────────────────────────────────────────────────── */
  ui.input = function (o) {
    o = o || {};
    const multi = !!o.multiline;
    const wrap = CPX.el("label", { class: cls("cpx-field", multi && "cpx-field--multi", o.mono && "cpx-field--mono", o.className) });
    if (o.label) wrap.appendChild(CPX.el("span", { class: "cpx-field__label", text: o.label }));
    const box = CPX.el("span", { class: "cpx-field__box cpx-mz cpx-k1 cpx-t-field" });
    if (o.icon) box.appendChild(ui.icon(o.icon, 16));
    const inp = multi
      ? CPX.el("textarea", { class: "cpx-field__input", rows: String(o.rows || 3) })
      : CPX.el("input", { class: "cpx-field__input", type: o.type === "search" ? "text" : o.type || "text" });
    if (o.placeholder) inp.placeholder = o.placeholder;
    if (o.maxLength) inp.maxLength = o.maxLength;
    if (o.inputMode) inp.inputMode = o.inputMode;
    if (o.name) inp.name = o.name;
    inp.autocomplete = "off";
    inp.spellcheck = o.spellcheck === true;
    if (o.value != null) inp.value = String(o.value);
    if (o.label) inp.setAttribute("aria-label", o.label);
    else if (o.placeholder) inp.setAttribute("aria-label", o.placeholder);
    box.appendChild(inp);
    let clear = null;
    if (o.clearable) {
      clear = ui.iconButton({
        icon: "close",
        size: "sm",
        iconSize: 12,
        label: CPX.t("ui.clear"),
        tip: false, // крестик в поле — без подписи
        className: "cpx-field__clear",
        onClick: (e) => {
          e.preventDefault();
          inp.value = "";
          sync();
          inp.focus();
          if (onInput) onInput("", e);
        },
      });
      box.appendChild(clear);
    }
    let count = null;
    if (o.counter && o.maxLength) {
      count = CPX.el("span", { class: "cpx-field__count", "aria-hidden": "true" });
      box.appendChild(count);
    }
    wrap.appendChild(box);
    const hint = CPX.el("span", { class: "cpx-field__hint" });
    hint.hidden = !o.hint;
    if (o.hint) hint.textContent = o.hint;
    wrap.appendChild(hint);

    function sync() {
      if (clear) clear.hidden = !inp.value;
      if (count) count.textContent = inp.value.length + "/" + o.maxLength;
    }
    sync();
    const onInput = guard("ui:input", o.onInput);
    const onEnter = guard("ui:input:enter", o.onEnter);
    const onEsc = guard("ui:input:esc", o.onEsc);
    // Метка для ядра (95): его Esc-обработчик срабатывает раньше поля и пропустит непустое такое.
    if (onEsc) inp.setAttribute("data-cpx-esc", "");
    inp.addEventListener("input", (e) => {
      sync();
      if (wrap.classList.contains("cpx-field--error") && o.clearErrorOnInput !== false) wrap.setError(null);
      if (onInput) onInput(inp.value, e);
    });
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.isComposing && onEnter && (!multi || e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        onEnter(inp.value, e);
      } else if (e.key === "Escape" && !e.isComposing && onEsc && inp.value) {
        // Esc в непустом поле — сначала очистить/отменить (своё), окно закроется вторым нажатием.
        e.preventDefault();
        e.stopPropagation();
        onEsc(inp.value, e);
      }
    });
    wrap.input = inp;
    Object.defineProperty(wrap, "value", {
      get: () => inp.value,
      set: (v) => {
        inp.value = String(v == null ? "" : v);
        sync();
      },
    });
    const baseHint = o.hint || "";
    wrap.setError = (msg) => {
      wrap.classList.toggle("cpx-field--error", !!msg);
      // Ошибка проверки — короткое «нажатие» маской по полю (вместо тряски, «Мозаика» §8.4).
      if (msg) U.tap(box);
      inp.setAttribute("aria-invalid", msg ? "true" : "false");
      hint.textContent = msg || baseHint;
      hint.hidden = !(msg || baseHint);
    };
    wrap.setHint = (t) => {
      if (wrap.classList.contains("cpx-field--error")) return;
      hint.textContent = t || "";
      hint.hidden = !t;
    };
    wrap.setDisabled = (v) => {
      inp.disabled = !!v;
      wrap.classList.toggle("cpx-field--disabled", !!v);
    };
    wrap.focus = () => U.focus(inp);
    if (o.disabled) wrap.setDisabled(true);
    if (o.error) wrap.setError(o.error);
    if (o.autofocus) U.whenStyled(() => setTimeout(() => U.focus(inp), 0));
    return wrap;
  };

  /* ── переключатель / галочка ──────────────────────────────────────────────── */
  ui.toggle = function (o) {
    o = o || {};
    const check = o.look === "check";
    const wrap = CPX.el("label", { class: cls("cpx-toggle", check && "cpx-toggle--check", o.className) });
    const inp = CPX.el("input", { type: "checkbox", class: "cpx-toggle__input" });
    if (!check) inp.setAttribute("role", "switch");
    inp.checked = !!o.checked;
    const track = CPX.el("span", { class: "cpx-toggle__track", "aria-hidden": "true" }, check ? ui.icon("check", 14) : CPX.el("span", { class: "cpx-toggle__thumb" }));
    wrap.append(inp, track);
    if (o.label || o.hint) {
      const text = CPX.el("span", { class: "cpx-toggle__text" });
      if (o.label) text.appendChild(CPX.el("span", { class: "cpx-toggle__label", text: o.label }));
      if (o.hint) text.appendChild(CPX.el("span", { class: "cpx-toggle__hint", text: o.hint }));
      wrap.appendChild(text);
    }
    if (o.label) inp.setAttribute("aria-label", o.label);
    const onChange = guard("ui:toggle", o.onChange);
    inp.addEventListener("change", (e) => onChange && onChange(inp.checked, e));
    wrap.input = inp;
    Object.defineProperty(wrap, "checked", {
      get: () => inp.checked,
      set: (v) => (inp.checked = !!v),
    });
    wrap.setDisabled = (v) => {
      inp.disabled = !!v;
      wrap.classList.toggle("cpx-toggle--disabled", !!v);
    };
    if (o.disabled) wrap.setDisabled(true);
    return wrap;
  };

  /* ── чипы ─────────────────────────────────────────────────────────────────── */
  ui.chips = function (o) {
    o = o || {};
    const multi = !!o.multi;
    const action = !!o.onPick && !o.onChange && o.value === undefined; // «кнопки-чипы» без выбора
    const box = CPX.el("div", {
      class: cls("cpx-chips", o.size === "sm" && "cpx-chips--sm", o.nowrap && "cpx-chips--nowrap", o.className),
      role: action ? "group" : multi ? "group" : "radiogroup",
    });
    if (o.label) box.setAttribute("aria-label", o.label);
    let value = multi ? new Set(o.value || []) : o.value;
    let items = [];
    const onChange = guard("ui:chips", o.onChange);
    const onPick = guard("ui:chips:pick", o.onPick);
    const selected = (v) => (multi ? value.has(v) : value === v);
    function paint() {
      if (action) return;
      const any = !multi && [...box.children].some((b) => selected(b._item.value));
      for (const b of box.children) {
        const on = selected(b._item.value);
        if (multi) b.setAttribute("aria-pressed", on ? "true" : "false");
        else {
          b.setAttribute("aria-checked", on ? "true" : "false");
          // Одна точка входа по Tab у группы-переключателя (как у радиокнопок).
          b.tabIndex = on || (!any && b === box.firstElementChild) ? 0 : -1;
        }
      }
    }
    function render() {
      box.textContent = "";
      for (const it of items) {
        if (!it) continue;
        const b = CPX.el("button", { type: "button", class: "cpx-chip cpx-mz cpx-mzb cpx-k1 cpx-t-raised", role: action || multi ? null : "radio" });
        if (it.icon) b.appendChild(ui.icon(it.icon, 14));
        if (it.label != null) b.appendChild(document.createTextNode(String(it.label)));
        if (it.tip) b.dataset.cpxTip = it.tip;
        if (it.disabled) b.disabled = true;
        b._item = it;
        box.appendChild(b);
      }
      paint();
    }
    box.addEventListener("click", (e) => {
      const b = e.target.closest && e.target.closest(".cpx-chip");
      if (!b || b.disabled || !box.contains(b)) return;
      const it = b._item;
      U.tap(b);
      if (onPick) onPick(it, e);
      if (action) return;
      if (multi) {
        if (value.has(it.value)) value.delete(it.value);
        else value.add(it.value);
      } else {
        if (value === it.value && !o.allowDeselect) return;
        value = value === it.value ? undefined : it.value;
      }
      paint();
      if (onChange) onChange(multi ? [...value] : value, it, e);
    });
    // Стрелки ← → между чипами (Home/End — к краям).
    box.addEventListener("keydown", (e) => {
      const list = [...box.querySelectorAll(".cpx-chip:not(:disabled)")];
      const i = list.indexOf(U.active());
      if (i < 0) return;
      let j = -1;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") j = (i + 1) % list.length;
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") j = (i - 1 + list.length) % list.length;
      else if (e.key === "Home") j = 0;
      else if (e.key === "End") j = list.length - 1;
      if (j < 0) return;
      e.preventDefault();
      U.focus(list[j]);
      if (!multi && !action && o.followFocus) list[j].click();
    });
    box.setItems = (arr) => {
      items = Array.isArray(arr) ? arr.slice() : [];
      render();
    };
    Object.defineProperty(box, "value", {
      get: () => (multi ? [...value] : value),
      set: (v) => {
        value = multi ? new Set(v || []) : v;
        paint();
      },
    });
    box.setItems(o.items);
    return box;
  };

  /* ── загрузка: перебор клеток ─────────────────────────────────────────────── */
  /** Значок 3×3 клетки (каждая мигает в своём ритме) вместо крутилки; size — примерный размер. */
  ui.spinner = function (size) {
    const s = CPX.el("span", { class: "cpx-scan3", role: "progressbar", "aria-label": CPX.t("ui.loading") });
    const c = size >= 18 ? 5 : size && size <= 12 ? 3 : 4;
    s.style.setProperty("--cpx-sc", c + "px");
    for (let i = 0; i < 9; i++) s.appendChild(CPX.el("i"));
    return s;
  };
  ui.skeleton = function (o) {
    o = o || {};
    const box = CPX.el("div", { class: "cpx-skels", "aria-hidden": "true", style: { display: "flex", flexDirection: "column", gap: "8px" } });
    const widths = [92, 76, 84, 64, 88];
    for (let i = 0; i < (o.lines || 3); i++) {
      const l = CPX.el("span", { class: "cpx-skel" });
      l.style.width = (o.width || widths[i % widths.length]) + "%";
      box.appendChild(l);
    }
    return box;
  };

  /* ── список с прокруткой и состояниями ────────────────────────────────────── */
  ui.list = function (o) {
    o = o || {};
    const pick = guard("ui:list:pick", o.onPick);
    const render = guard("ui:list:render", o.render) || ((it) => String(it));
    const keyOf = typeof o.key === "function" ? o.key : null;
    // Поверхность (well k2) — на неподвижной обёртке, строки и прокрутка — у списка внутри (sc).
    const box = CPX.el("div", {
      class: cls("cpx-list", pick && "cpx-list--pick", o.flat && "cpx-list--flat", !o.flat && "cpx-mz cpx-k2 cpx-t-well", o.className),
      role: pick ? "listbox" : "list",
    });
    const sc = CPX.el("div", { class: "cpx-list__scroll" });
    box.appendChild(sc);
    if (o.label) box.setAttribute("aria-label", o.label);
    if (o.maxHeight) box.style.maxHeight = typeof o.maxHeight === "number" ? o.maxHeight + "px" : o.maxHeight;
    let items = [];
    let sel = o.selected;

    function state(kind, icon, text, extra) {
      sc.textContent = "";
      box.setAttribute("aria-busy", kind === "loading" ? "true" : "false");
      const st = CPX.el("div", { class: "cpx-list__state cpx-list__state--" + kind, role: kind === "error" ? "alert" : "status" });
      if (icon) st.appendChild(icon);
      if (text) st.appendChild(CPX.el("div", { text }));
      if (extra) st.appendChild(extra);
      sc.appendChild(st);
    }
    box.setLoading = (text) => {
      items = [];
      sc.textContent = "";
      box.setAttribute("aria-busy", "true");
      if (o.skeleton === false) return state("loading", ui.spinner(18), text || o.loadingText || CPX.t("ui.loading"));
      for (let i = 0; i < (o.skeletonRows || 3); i++) {
        sc.appendChild(CPX.el("div", { class: "cpx-list__skel", "aria-hidden": "true" }, [CPX.el("span", { class: "cpx-skel" }), CPX.el("span", { class: "cpx-skel", style: { width: [70, 52, 62][i % 3] + "%" } })]));
      }
      sc.appendChild(CPX.el("span", { class: "cpx-sr", text: text || CPX.t("ui.loading"), style: { position: "absolute", width: "1px", height: "1px", overflow: "hidden", clip: "rect(0 0 0 0)" } }));
    };
    box.setEmpty = (text) => {
      items = [];
      state("empty", ui.icon(o.emptyIcon || "message", 22), text || o.empty || CPX.t("ui.empty"));
    };
    box.setError = (text, retry) => {
      items = [];
      const r = typeof retry === "function" ? ui.button({ label: CPX.t("ui.retry"), icon: "refresh", size: "sm", kind: "secondary", onClick: retry }) : null;
      state("error", ui.icon("warning", 22), text || CPX.t("ui.error"), r);
    };
    // Одна точка входа по Tab (выбранная строка или первая), дальше — стрелками: в досье на сотню
    // строк сотня остановок Tab была бы мучением.
    function roving(target) {
      if (!pick) return;
      const rows = box.querySelectorAll(".cpx-list__row");
      let cur = target || null;
      if (!cur && keyOf) for (const r of rows) if (keyOf(r._item) === sel) cur = r;
      if (!cur) cur = rows[0] || null;
      for (const r of rows) r.tabIndex = r === cur ? 0 : -1;
    }
    function paintSel() {
      if (keyOf) for (const row of sc.children) if (row._item !== undefined) row.setAttribute("aria-selected", keyOf(row._item) === sel ? "true" : "false");
      roving(null);
    }
    box.setSelected = (k) => {
      sel = k;
      paintSel();
    };
    box.setItems = (arr) => {
      items = Array.isArray(arr) ? arr.slice() : [];
      if (!items.length) return box.setEmpty();
      box.setAttribute("aria-busy", "false");
      const frag = document.createDocumentFragment();
      items.forEach((it, i) => {
        const row = CPX.el("div", { class: "cpx-list__row cpx-mz cpx-k1", role: pick ? "option" : "listitem" });
        const c = render(it, i);
        if (c != null) CPX.el.append(row, c);
        row._item = it;
        frag.appendChild(row);
      });
      sc.textContent = "";
      sc.appendChild(frag);
      paintSel();
    };
    Object.defineProperty(box, "items", { get: () => items.slice() });
    if (pick) {
      box.addEventListener("click", (e) => {
        const row = e.target.closest && e.target.closest(".cpx-list__row");
        if (!row || !box.contains(row)) return;
        // Щелчок по своей кнопке/ссылке внутри строки — дело этой кнопки, не выбор строки.
        const ctl = e.target.closest("button, a, input, textarea, select, label");
        if (ctl && ctl !== row && row.contains(ctl)) return;
        roving(row);
        pick(row._item, e);
      });
    }
    box.addEventListener("keydown", (e) => {
      const rows = [...box.querySelectorAll(".cpx-list__row")];
      const cur = U.active();
      const i = rows.indexOf(cur);
      if (i < 0) return;
      let j = -1;
      if (e.key === "ArrowDown") j = Math.min(rows.length - 1, i + 1);
      else if (e.key === "ArrowUp") j = Math.max(0, i - 1);
      else if (e.key === "Home") j = 0;
      else if (e.key === "End") j = rows.length - 1;
      else if ((e.key === "Enter" || e.key === " ") && pick && cur === rows[i]) {
        e.preventDefault();
        pick(rows[i]._item, e);
        return;
      }
      if (j < 0) return;
      e.preventDefault();
      roving(rows[j]);
      U.focus(rows[j]);
      rows[j].scrollIntoView({ block: "nearest" });
    });
    if (o.items) box.setItems(o.items);
    else if (o.loading) box.setLoading();
    else box.setEmpty();
    return box;
  };
})();

// ── src/main/97_ui_windows.js ──
/* Общий набор наших окон — часть 3: всплывашка, меню, модалка/подтверждение, тосты, окно.
 * API — в шапке 95_ui.js.
 *
 * «Щелчок мимо» и Esc решаются здесь по сигналам ядра (95): ядро знает настоящий путь щелчка
 * внутри закрытого Shadow DOM и зовёт нас после раздачи события. Правила — как у окон клиента
 * (src/widgets/DraggablePopup.cpp): связка окон (родитель ⇄ дети, транзитивно) живёт, пока щелчки
 * внутри неё; щелчок мимо закрывает всю незакреплённую связку; закреплённое булавкой не трогаем;
 * у родителя за раз одно незакреплённое дитя данного вида.
 */

(() => {
  const ui = CPX.ui;
  const U = ui._;
  const cls = U.cls;

  const floats = []; // открытые всплывашки и меню, снизу вверх
  const wins = []; // открытые окна
  const modals = []; // открытые модалки, снизу вверх
  let zTop = 1;

  U.hasOpen = () => floats.length > 0 || wins.length > 0;

  const drop = (arr, x) => {
    const i = arr.indexOf(x);
    if (i >= 0) arr.splice(i, 1);
  };
  const inPath = (path, el) => !!el && path.indexOf(el) >= 0;
  // Хозяин/родитель — только НАШИ ручки нужного вида: чужой объект (ручка модалки вместо окна)
  // ронял сбор связки окон («x.children is not iterable»).
  const winOfHandle = (h) => (h && h._w && h._w.children instanceof Set ? h._w : null);
  const modalOfHandle = (h) => (h && h._m && h._m.type === "modal" ? h._m : null);
  const floatOfHandle = (h) => (h && h._f && (h._f.type === "popover" || h._f.type === "menu") ? h._f : null);

  /** Окно, внутри которого элемент нашего слоя. */
  function winOf(el) {
    if (!el) return null;
    for (const w of wins) if (!w.closed && w.el.contains(el)) return w;
    return null;
  }
  /** Верхняя всплывашка/меню, внутри которой элемент. */
  function floatOf(el) {
    if (!el) return null;
    for (let i = floats.length - 1; i >= 0; i--) if (!floats[i].closed && floats[i].el.contains(el)) return floats[i];
    return null;
  }
  /** Связка окна: предки, потомки, их потомки… (как linkedGroup клиента — транзитивно). */
  function groupOf(w) {
    const out = new Set([w]);
    const q = [w];
    while (q.length) {
      const x = q.shift();
      const next = [...x.children];
      if (x.parent) next.push(x.parent);
      for (const n of next) {
        if (!out.has(n)) {
          out.add(n);
          q.push(n);
        }
      }
    }
    return out;
  }
  function ancestors(w) {
    const s = new Set();
    for (let x = w; x; x = x.parent) s.add(x);
    return s;
  }
  function floatRoot(f) {
    while (f.parent) f = f.parent;
    return f;
  }
  /** Щелчок пришёлся в f или в её дочерние всплывающие (подменю, меню, открытые из неё — host).
   * list — открытые в миг нажатия (снимок) + открытые сейчас: пункт меню, выбранный быстрым
   * щелчком, закрывает меню раньше, чем мы решаем, — щелчок в нём всё равно «внутри». */
  function floatHit(f, path, list) {
    for (const g of list || floats) {
      for (let x = g; x; x = x.parent || x.host) {
        if (x === f) {
          if (inPath(path, g.el)) return true;
          break;
        }
      }
    }
    return false;
  }
  function restore(prev) {
    if (prev && prev.isConnected && prev !== document.body && prev !== document.documentElement) U.focus(prev);
  }
  /** Что открыло окно/всплывашку (кнопка из события или явный trigger): нажатие на него —
   * не «щелчок мимо», иначе переключатель закрыл бы окно и тут же открыл его снова.
   * Из события — только настоящая кнопка/ссылка/[data-cpx-trigger] и только левым щелчком:
   * контекстное меню по нику иначе не закрывалось бы щелчком по тому же нику, а окно, открытое
   * горячей клавишей (цель — body), — вообще ничем. */
  function triggerOf(o) {
    if (typeof Element === "undefined") return null;
    if (o.trigger instanceof Element) return o.trigger;
    const e = o.event;
    if (!e || e.type === "contextmenu" || e.button === 2) return null;
    const t = e.target;
    if (!(t instanceof Element)) return null;
    const b = t.closest("button, a, [role='button'], [data-cpx-trigger]");
    return b && b !== document.body && b !== document.documentElement ? b : null;
  }
  /** Якорь в документе целиком закрыт чужим элементом сверху: в трёх его точках (центр и два угла)
   * верхним оказывается не он, не его предок/потомок и не наш слой. Прозрачное для щелчков
   * (подсказки, pointer-events: none) не считается. Якорь внутри нашего Shadow DOM — всегда виден. */
  function covered(a, r) {
    const vw = U.viewW();
    const vh = U.viewH();
    const pts = [
      [r.left + r.width / 2, r.top + r.height / 2],
      [r.left + 2, r.top + 2],
      [r.right - 2, r.bottom - 2],
    ];
    let n = 0;
    for (const [x, y] of pts) {
      if (x < 0 || y < 0 || x >= vw || y >= vh) continue;
      const hit = document.elementFromPoint(x, y);
      if (!hit || hit === a || a.contains(hit) || hit.contains(a) || (hit.classList && hit.classList.contains("cpx-own"))) return false;
      n++;
    }
    return n > 0;
  }
  function topWin(pred) {
    let best = null;
    for (const w of wins) if (!w.closed && pred(w) && (!best || w.z > best.z)) best = w;
    return best;
  }

  /* ── щелчок мимо ──────────────────────────────────────────────────────────── */
  // Решение принимается после раздачи события (ядро, setTimeout 0), а к тому времени щелчок уже
  // мог закрыть модалку (щелчок по фону) или меню окна (выбор пункта) — при быстром нажатии
  // click приходит раньше таймера. Поэтому что было открыто — запоминаем в миг нажатия.
  const downSnap = new WeakMap();
  window.addEventListener(
    "pointerdown",
    (e) => {
      if (floats.length || modals.length) downSnap.set(e, { modal: modals.length > 0, floats: floats.slice() });
    },
    true
  );
  U.onOutside((path, ep, e) => {
    const snap = (e && downSnap.get(e)) || { modal: modals.length > 0, floats: floats.slice() };
    // Тост («Вернуть») и подсказка — не «мимо»: бан из карточки → «Вернуть» не закрывает карточку.
    if (inPath(path, U.layer("toast")) || inPath(path, U.layer("tip"))) return;
    // Всплывающие — сверху вниз; щелчок по своему якорю не считается «мимо» (якорь сам
    // переключает всплывашку).
    const hitList = snap.floats.concat(floats);
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i];
      if (!f || f.closed || f.born > ep || !f.closeOnOutside) continue;
      if (floatHit(f, path, hitList) || inPath(path, f.anchorEl) || inPath(path, f.triggerEl)) continue;
      if (f.inside && inPath(path, f.inside())) continue;
      f.close("outside");
    }
    // Модалка перекрывает страницу: пока она открыта, окна под ней щелчками не закрываются —
    // ни щелчком в ней, ни в её меню/всплывашках (они живут в слое pop, вне модалки). Окна ПОВЕРХ модалки (overModal) —
    // как обычные: щелчок мимо них (и в самой модалке) закрывает.
    if (snap.modal || modals.length) {
      let over = null;
      for (const w of wins) if (!w.closed && w.modal && inPath(path, w.el)) over = w;
      const keepO = over ? groupOf(over) : null;
      for (const w of wins.slice()) {
        if (!w.modal || w.closed || w.born > ep || w.pinned || !w.autoClose) continue;
        if (keepO && keepO.has(w)) continue;
        if (inPath(path, w.anchorEl) || inPath(path, w.triggerEl)) continue;
        w.close("outside");
      }
      return;
    }
    let hit = null;
    for (const w of wins) {
      if (!w.closed && inPath(path, w.el)) {
        hit = w;
        break;
      }
    }
    if (!hit) {
      // По снимку: меню окна, закрытое этим же щелчком (выбран пункт), — всё равно «внутри».
      for (const f of snap.floats) {
        if (f.owner && inPath(path, f.el)) {
          hit = f.owner;
          break;
        }
      }
    }
    const keep = hit && !hit.closed ? groupOf(hit) : null;
    for (const w of wins.slice()) {
      if (w.closed || w.born > ep || w.pinned || !w.autoClose) continue;
      if (keep && keep.has(w)) continue;
      if (inPath(path, w.anchorEl) || inPath(path, w.triggerEl)) continue;
      w.close("outside");
    }
  });

  /* ── Esc: верхнее всплывающее → модалка → окно с фокусом ─────────────────── */
  U.onEscape(() => {
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i];
      if (!f.closed && f.closeOnEsc) {
        f.close("esc");
        return true;
      }
    }
    const ow = topWin((x) => !!x.modal && x.closable);
    if (ow) {
      ow.close("esc");
      return true;
    }
    const m = modals[modals.length - 1];
    if (m) {
      if (m.dismissable) m.close(null, "esc");
      return true;
    }
    const a = U.active();
    if (a) {
      const w = topWin((x) => x.el.contains(a));
      if (w && w.closable) {
        w.close("esc");
        return true;
      }
    }
    return false;
  });

  /* ── размеры окна браузера / полноэкранный режим ──────────────────────────── */
  function relayout() {
    for (const f of floats.slice()) if (f.update) f.update();
    for (const w of wins) if (w.placed) setPos(w, w.x, w.y);
    placeToasts();
  }
  window.addEventListener("resize", CPX.throttle(relayout, 50));
  U.onFullscreen(() => requestAnimationFrame(relayout));

  /* ── всплывашка ───────────────────────────────────────────────────────────── */
  ui.popover = function (o) {
    o = o || {};
    if (o.kind) for (const f of floats.slice()) if (f.kind === o.kind) f.close("replaced");
    const keepFocus = !!o.keepFocus;
    const el = CPX.el("div", { class: cls("cpx-pop", o.className), role: o.role || "dialog", tabindex: keepFocus ? null : "-1" });
    if (o.label) el.setAttribute("aria-label", o.label);
    if (o.width) el.style.width = typeof o.width === "number" ? o.width + "px" : o.width;
    if (keepFocus) {
      // Меню смайликов у поля ввода: щелчок по смайлику/кнопке не должен уводить курсор из поля
      // Twitch. Поля внутри всплывашки (поиск) фокус получают как обычно.
      el.addEventListener("mousedown", (e) => {
        const t = e.target;
        if (!(t instanceof Element) || !t.closest("input, textarea, select, [contenteditable='true'], [contenteditable='']")) e.preventDefault();
      });
    }
    const body = CPX.el("div", { class: "cpx-pop__body" });
    el.appendChild(body);
    // Клювик — лесенка цвета кромки (только там, где он был: лента мута); есть не у всех всплывашек.
    const arrow = o.arrow ? CPX.el("span", { class: "cpx-pop__arrow cpx-mz-tail", "aria-hidden": "true" }) : null;
    if (arrow) el.appendChild(arrow);
    // «Мозаика»: тон tip (большие — panel, задаёт модуль: tone), выбоины по порогу (≥ 240×120), иначе k2.
    U.surface(el, { tone: o.tone || "tip", shape: "mzj", cell: o.cell });
    U.mzj(el, { kind: o.kind || o.className || "pop", body, bites: 0.08, smallK2: true });
    const anchorEl = typeof Element !== "undefined" && o.anchor instanceof Element ? o.anchor : null;
    const parent = floatOfHandle(o.parent) || floatOf(anchorEl);
    const triggerEl = triggerOf(o);
    const f = {
      type: "popover",
      kind: o.kind ? String(o.kind) : "",
      el,
      anchorEl,
      triggerEl,
      parent,
      owner: winOfHandle(o.owner) || winOf(anchorEl) || winOf(triggerEl) || (parent && parent.owner) || null,
      modal: modalOfHandle(o.owner) || (parent && parent.modal) || null,
      closeOnOutside: o.closeOnOutside !== false,
      closeOnEsc: o.closeOnEsc !== false,
      // Ещё один элемент «не мимо» (меню смайликов — поле ввода чата, 23.10): функция → элемент | null.
      inside: typeof o.inside === "function" ? o.inside : null,
      closed: false,
      born: U.born(),
      prevFocus: U.active(),
    };
    const setContent = (c) => {
      body.textContent = "";
      if (c != null) CPX.el.append(body, c);
    };
    setContent(o.content);
    floats.push(f);
    U.layer("pop").appendChild(el);
    const offset = o.offset != null ? o.offset : arrow ? 11 : 6;
    f.update = () => {
      if (f.closed || !U.styled()) return;
      const r = U.rectOf(o.anchor);
      if (!r) return f.close("anchor");
      // Якорь уехал из виду (строку чата унесло прокруткой) или целиком ушёл под чужой слой
      // (закреп Twitch лежит ПОВЕРХ списка, а не обрезает его) — всплывашка ему больше не нужна.
      if (anchorEl && (r.bottom < 0 || r.top > U.viewH() || r.right < 0 || r.left > U.viewW() || covered(anchorEl, r))) return f.close("anchor");
      // Ширина по якорю (меню смайликов — край в край с полем ввода чата), в пределах {min, max}.
      if (o.matchWidth) {
        const m = o.matchWidth;
        const w = Math.round(Math.min(m.max || Infinity, Math.max(m.min || 0, r.width)));
        if (w !== f.w) {
          f.w = w;
          el.style.width = w + "px";
        }
      }
      U.place(el, r, { side: o.side || "bottom", align: o.align || "center", offset, arrow });
    };
    // Якорь-элемент или функция — следим за его местом раз в кадр, пока открыто (чат доезжает
    // анимацией transform: событий прокрутки при этом нет).
    const follow = o.follow !== false && (anchorEl || typeof o.anchor === "function");
    let raf = 0;
    let sig = "";
    const loop = () => {
      raf = 0;
      if (f.closed) return;
      const r = U.rectOf(o.anchor);
      const s = r ? Math.round(r.left) + "," + Math.round(r.top) + "," + Math.round(r.width) + "," + Math.round(r.height) : "";
      if (s !== sig) {
        sig = s;
        f.update();
      }
      if (!f.closed) raf = requestAnimationFrame(loop);
    };
    const ro = new ResizeObserver(() => f.update());
    ro.observe(el);
    // Якорь спрятан краем СВОЕЙ прокрутки (строку чата унесло под закреп/полосу подарков), хотя
    // в окне браузера он ещё есть: наблюдатель пересечений учитывает обрезку всеми предками.
    const io =
      anchorEl && typeof IntersectionObserver === "function"
        ? new IntersectionObserver((entries) => {
            const en = entries[entries.length - 1];
            if (en && !en.isIntersecting) f.close("anchor");
          })
        : null;
    f.close = (reason) => {
      if (f.closed) return;
      f.closed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      U.unmzj(el);
      if (io) io.disconnect();
      drop(floats, f);
      for (const g of floats.slice()) if (g.parent === f || g.host === f) g.close("parent");
      const had = U.focusIn(el);
      U.vanish(el);
      if (had && reason !== "outside") restore(f.prevFocus);
      if (typeof o.onClose === "function") CPX.safely("ui:popover:onClose", () => o.onClose(reason));
    };
    // Показ — после того, как есть f.close: расстановка может сразу закрыть (якоря уже нет).
    U.whenStyled(() => {
      if (f.closed) return;
      f.update();
      if (f.closed) return;
      U.appear(el);
      if (follow) raf = requestAnimationFrame(loop);
      if (io) io.observe(anchorEl);
      if (o.focus) U.focus(U.focusables(el)[0] || el);
    });
    f.h = {
      _f: f,
      el,
      body,
      update: () => f.update(),
      setContent,
      close: (r) => f.close(r || "close"),
      get open() {
        return !f.closed;
      },
    };
    return f.h;
  };

  /* ── меню ─────────────────────────────────────────────────────────────────── */
  const isRealItem = (it) => !!it && it !== "-" && it.type !== "separator" && it.type !== "header";
  ui.menu = function (o) {
    o = o || {};
    // Нечего показать — не открываем пустую коробку (ручка сразу закрыта).
    if (!Array.isArray(o.items) || !o.items.some(isRealItem)) return { el: null, close() {}, setItems() {}, open: false };
    for (const f of floats.slice()) if (f.type === "menu" && !f.parent) f.close("replaced");
    return openMenu(o, null, null).h;
  };

  function openMenu(o, parent, row) {
    const rootO = parent ? parent.rootO : o;
    const el = CPX.el("div", { class: cls("cpx-menu", rootO.className), role: "menu", tabindex: "-1" });
    // Подложка рисуется псевдоэлементами обёртки: прокручивайся обёртка сама — подложка уехала бы вместе
    // с пунктами. Поэтому пункты — в списке внутри, прокрутка — у него.
    const rowsEl = CPX.el("div", { class: "cpx-menu__list" });
    el.appendChild(rowsEl);
    U.surface(el, { tone: "tip", shape: "k2" });
    if (!parent && o.label) el.setAttribute("aria-label", o.label);
    if (!parent && o.minWidth) el.style.minWidth = o.minWidth + "px";
    let anchor = null;
    let side = o.side || "bottom";
    let align = o.align || "start";
    let offset = 4;
    let keyboard = !!o.keyboard;
    if (parent) {
      // Первый пункт подменю — вровень со своим пунктом (поля меню 4 + рамка 1).
      anchor = () => {
        const r = U.rectOf(row);
        return r && { left: r.left, top: r.top - 5, width: r.width, height: r.height };
      };
      side = "right";
      align = "start";
      offset = 6;
    } else if (o.anchor) {
      anchor = o.anchor;
    } else if (o.at) {
      anchor = { x: o.at.x, y: o.at.y };
      offset = 2;
    } else if (o.event) {
      const e = o.event;
      if (e.clientX || e.clientY) {
        anchor = { x: e.clientX, y: e.clientY };
        offset = 2;
      } else {
        // С клавиатуры (Shift+F10, клавиша меню) — у элемента, и сразу первый пункт.
        anchor = e.target instanceof Element ? e.target : null;
        keyboard = true;
      }
    }
    if (!anchor) anchor = { x: U.viewW() / 2, y: U.viewH() / 3 };
    const anchorEl = parent ? row : anchor instanceof Element ? anchor : null;
    const triggerEl = parent ? null : triggerOf(o);
    // Меню, открытое из всплывашки (owner — её ручка, или якорь/кнопка внутри неё): щелчок по его
    // пункту — не «мимо» для всплывашки, и закрывается оно вместе с ней.
    const host = parent ? null : floatOfHandle(o.owner) || floatOf(anchorEl) || floatOf(triggerEl);
    const f = {
      type: "menu",
      el,
      parent,
      host,
      rootO,
      anchorEl,
      triggerEl,
      owner: parent ? parent.owner : winOfHandle(o.owner) || winOf(anchorEl) || winOf(triggerEl) || (host && host.owner) || null,
      modal: parent ? parent.modal : modalOfHandle(o.owner) || (host && host.modal) || null,
      closeOnOutside: true,
      closeOnEsc: true,
      closed: false,
      born: U.born(),
      prevFocus: parent ? null : U.active(),
      rows: [],
      act: -1,
      sub: null,
      subRow: null,
      timer: 0,
    };

    function render(items) {
      rowsEl.textContent = "";
      f.rows = [];
      f.act = -1;
      const list = (Array.isArray(items) ? items : []).filter(Boolean);
      const hasCheck = list.some((it) => typeof it.checked === "boolean");
      const hasIcon = list.some((it) => it.icon);
      for (const it of list) {
        if (it === "-" || it.type === "separator") {
          rowsEl.appendChild(CPX.el("div", { class: "cpx-menu__sep", role: "separator" }));
          continue;
        }
        if (it.type === "header") {
          rowsEl.appendChild(CPX.el("div", { class: "cpx-menu__head", role: "presentation", text: String(it.label == null ? "" : it.label) }));
          continue;
        }
        const sub = !!it.items;
        const chk = typeof it.checked === "boolean";
        const r = CPX.el("div", {
          class: cls("cpx-menu__item cpx-mz cpx-k1", it.danger && "cpx-menu__item--danger"),
          role: chk ? "menuitemcheckbox" : "menuitem",
          id: "cpx-mi-" + CPX.uid(),
          "aria-disabled": it.disabled ? "true" : null,
          "aria-checked": chk ? String(it.checked) : null,
          "aria-haspopup": sub ? "menu" : null,
          "aria-expanded": sub ? "false" : null,
        });
        // Галочка — светлая клетка (рисует CSS по aria-checked пункта).
        if (hasCheck) r.appendChild(CPX.el("span", { class: "cpx-menu__check", "aria-hidden": "true" }));
        if (hasIcon) r.appendChild(CPX.el("span", { class: "cpx-menu__icon" }, it.icon ? ui.icon(it.icon, 16) : null));
        r.appendChild(CPX.el("span", { class: "cpx-menu__label", text: String(it.label == null ? "" : it.label) }));
        if (it.hint) r.appendChild(CPX.el("span", { class: "cpx-menu__hint", text: String(it.hint) }));
        if (sub) r.appendChild(CPX.el("span", { class: "cpx-menu__sub" }, ui.icon("chevronRight", 14)));
        if (it.tip) {
          r.dataset.cpxTip = it.tip;
          r.dataset.cpxTipSide = "right";
        }
        r._it = it;
        rowsEl.appendChild(r);
        f.rows.push(r);
      }
    }
    const usable = (r) => !!(r && r._it && !r._it.disabled);
    function setAct(i, scroll) {
      const prev = f.rows[f.act];
      if (prev) prev.classList.remove("cpx-act");
      f.act = i;
      const r = f.rows[i];
      if (r) {
        r.classList.add("cpx-act");
        el.setAttribute("aria-activedescendant", r.id);
        if (scroll) r.scrollIntoView({ block: "nearest" });
      } else el.removeAttribute("aria-activedescendant");
    }
    function move(d) {
      const n = f.rows.length;
      let i = f.act;
      for (let k = 0; k < n; k++) {
        i = i < 0 ? (d > 0 ? 0 : n - 1) : (i + d + n) % n;
        if (usable(f.rows[i])) return setAct(i, true);
      }
    }
    f.first = () => {
      f.act = -1;
      move(1);
    };
    function closeSub() {
      if (f.sub) f.sub.close("back");
    }
    function openSub(r, focusFirst) {
      if (f.sub && f.subRow === r) {
        if (focusFirst) {
          U.focus(f.sub.el);
          f.sub.first();
        }
        return;
      }
      closeSub();
      let items = r._it.items;
      if (typeof items === "function") items = CPX.safely("ui:menu:items", items);
      if (!Array.isArray(items) || !items.length) return;
      const s = openMenu({ items, keyboard: focusFirst }, f, r);
      f.sub = s;
      f.subRow = r;
      r.setAttribute("aria-expanded", "true");
    }
    function activate(r, e) {
      const it = r && r._it;
      if (!it || it.disabled) return;
      if (it.items) return openSub(r, true);
      if (typeof it.checked === "boolean") {
        // Галочка переключается сама (с keepOpen это и видно сразу); onClick видит новое значение.
        it.checked = !it.checked;
        r.setAttribute("aria-checked", String(it.checked));
      }
      // Сначала закрыть (и вернуть фокус), потом действие: оно может открыть окно/подтверждение.
      if (!it.keepOpen) floatRoot(f).close("select");
      CPX.safely("ui:menu:click", () => {
        if (typeof it.onClick === "function") it.onClick(it, e);
        if (typeof rootO.onSelect === "function") rootO.onSelect(it, e);
      });
    }

    el.addEventListener("mouseover", (e) => {
      const r = e.target.closest && e.target.closest(".cpx-menu__item");
      if (!r || !el.contains(r)) return;
      const i = f.rows.indexOf(r);
      if (i !== f.act) setAct(i, false);
      if (!U.focusIn(el)) U.focus(el);
      clearTimeout(f.timer);
      if (parent) clearTimeout(parent.timer); // указатель дошёл до подменю — не закрывать его
      const hasSub = !!r._it.items && !r._it.disabled;
      if (hasSub && f.subRow === r) return;
      f.timer = setTimeout(
        () => {
          if (f.closed) return;
          if (hasSub) openSub(r, false);
          else closeSub();
        },
        hasSub ? 110 : 180
      );
    });
    el.addEventListener("mouseleave", () => {
      clearTimeout(f.timer);
      if (!f.sub && f.act >= 0) setAct(-1);
    });
    el.addEventListener("click", (e) => {
      const r = e.target.closest && e.target.closest(".cpx-menu__item");
      if (r && el.contains(r)) activate(r, e);
    });
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    el.addEventListener("keydown", (e) => {
      const k = e.key;
      if (k === "ArrowDown") move(1);
      else if (k === "ArrowUp") move(-1);
      else if (k === "Home") f.first();
      else if (k === "End") {
        f.act = -1;
        move(-1);
      } else if (k === "ArrowRight") {
        const r = f.rows[f.act];
        if (usable(r) && r._it.items) openSub(r, true);
      } else if (k === "ArrowLeft") {
        if (!parent) return;
        f.close("back");
        U.focus(parent.el);
      } else if (k === "Enter" || k === " ") {
        const r = f.rows[f.act];
        if (r) activate(r, e);
      } else if (k === "Tab") {
        floatRoot(f).close("tab");
        return;
      } else if (k.length === 1 && /\S/.test(k) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // Быстрый переход по первой букве пункта.
        const n = f.rows.length;
        const ch = k.toLowerCase();
        for (let s = 1; s <= n; s++) {
          const i = (Math.max(f.act, -1) + s + n) % n;
          const r = f.rows[i];
          if (usable(r) && String(r._it.label || "").toLowerCase().startsWith(ch)) {
            setAct(i, true);
            break;
          }
        }
      } else return;
      e.preventDefault();
      e.stopPropagation();
    });

    render(o.items);
    floats.push(f);
    U.layer("pop").appendChild(el);
    f.update = () => {
      if (f.closed || !U.styled()) return;
      const r = U.rectOf(anchor);
      if (!r) return f.close("anchor");
      U.place(el, r, { side, align, offset });
    };
    f.close = (reason) => {
      if (f.closed) return;
      f.closed = true;
      clearTimeout(f.timer);
      if (f.sub) f.sub.close("parent");
      drop(floats, f);
      if (parent) {
        if (parent.sub === f) {
          parent.sub = null;
          parent.subRow = null;
        }
        row.setAttribute("aria-expanded", "false");
      }
      const had = U.focusIn(el);
      U.vanish(el);
      if (had && !parent && reason !== "outside") restore(f.prevFocus);
      if (!parent && typeof o.onClose === "function") CPX.safely("ui:menu:onClose", () => o.onClose(reason));
    };
    U.whenStyled(() => {
      if (f.closed) return;
      f.update();
      if (f.closed) return;
      U.appear(el);
      U.focus(el);
      if (keyboard) f.first();
    });
    f.h = {
      _f: f,
      el,
      close: (r) => f.close(r || "close"),
      setItems: (items) => {
        if (f.closed) return;
        closeSub();
        if (!Array.isArray(items) || !items.some(isRealItem)) return f.close("empty");
        render(items);
        f.update();
      },
      get open() {
        return !f.closed;
      },
    };
    return f;
  }

  /* ── модалка и подтверждение ──────────────────────────────────────────────── */
  ui.modal = function (o) {
    o = o || {};
    let resolve;
    const result = new Promise((r) => (resolve = r));
    const wrap = CPX.el("div", { class: "cpx-modal-wrap cpx-in" });
    const box = CPX.el("div", {
      class: cls("cpx-modal", o.danger && "cpx-modal--danger", o.className),
      role: o.alert ? "alertdialog" : "dialog",
      "aria-modal": "true",
      tabindex: "-1",
    });
    if (o.width) box.style.width = typeof o.width === "number" ? o.width + "px" : o.width;
    const m = { type: "modal", wrap, box, dismissable: o.dismissable !== false, closed: false, born: U.born(), prevFocus: U.active() };
    if (o.title || m.dismissable) {
      const head = CPX.el("div", { class: "cpx-modal__head" });
      const titleId = "cpx-mt-" + CPX.uid();
      head.appendChild(CPX.el("div", { class: "cpx-modal__title", id: titleId, text: o.title ? String(o.title) : "" }));
      if (o.title) box.setAttribute("aria-labelledby", titleId);
      // Крестик, булавка, «очистить» — без всплывающей подписи (владелец 05.10: значок и так понятен); название —
      // для экранного диктора (aria-label).
      if (m.dismissable) head.appendChild(ui.iconButton({ icon: "close", label: CPX.t("ui.close"), tip: false, onClick: () => close(null, "close") }));
      box.appendChild(head);
    }
    const body = CPX.el("div", { class: "cpx-modal__body" });
    if (o.body != null) CPX.el.append(body, o.body);
    else if (o.text != null) for (const para of String(o.text).split(/\n{2,}/)) body.appendChild(CPX.el("p", { text: para }));
    if (body.childNodes.length) box.appendChild(body);
    const btns = Array.isArray(o.buttons) ? o.buttons.filter(Boolean) : [{ label: CPX.t("ui.ok"), kind: "primary", value: true, autofocus: true }];
    let auto = null;
    const handle = { _m: m, el: box, body, close: (v) => close(v === undefined ? null : v, "close"), result };
    if (btns.length) {
      const stack = btns.some((b) => b.full);
      const foot = CPX.el("div", { class: cls("cpx-modal__foot", stack && "cpx-modal__foot--stack") });
      for (const b of btns) {
        const value = b.value !== undefined ? b.value : b.label;
        const btn = ui.button({
          label: b.label,
          icon: b.icon,
          kind: b.kind || "secondary",
          full: stack,
          disabled: b.disabled,
          onClick: (e) => {
            if (typeof b.onClick !== "function") return close(value, "button");
            // onClick вернул false — окно остаётся (например, ошибка проверки); Promise — ждём.
            const r = b.onClick(e, handle);
            if (r && typeof r.then === "function") {
              return r.then(
                (x) => x !== false && close(value, "button"),
                (err) => CPX.report("ui:modal:button", err)
              );
            }
            if (r !== false) close(value, "button");
          },
        });
        if (b.autofocus && !auto) auto = btn;
        foot.appendChild(btn);
      }
      box.appendChild(foot);
    }
    // Фокус заперт в модалке: Tab ходит по кругу.
    box.addEventListener("keydown", (e) => {
      if (e.key !== "Tab") return;
      const list = U.focusables(box);
      if (!list.length) return e.preventDefault();
      const i = list.indexOf(U.active());
      if (e.shiftKey && i <= 0) {
        e.preventDefault();
        U.focus(list[list.length - 1]);
      } else if (!e.shiftKey && (i < 0 || i === list.length - 1)) {
        e.preventDefault();
        U.focus(list[0]);
      }
    });
    let downOnWrap = false;
    wrap.addEventListener("pointerdown", (e) => (downOnWrap = e.target === wrap));
    wrap.addEventListener("click", (e) => {
      if (e.target === wrap && downOnWrap && m.dismissable) close(null, "backdrop");
      downOnWrap = false;
    });
    // «Мозаика»: коробка — окно panel с выбоинами и жёсткой тенью; подложка — ровное затемнение (без
    // размытия), проступает прозрачностью, коробка — маской из клеток.
    U.surface(box, { tone: "panel", shape: "mzj" });
    U.mzj(box, { kind: "modal" + (o.danger ? "-danger" : ""), body, bites: 0.07 });
    wrap.appendChild(box);
    modals.push(m);
    U.layer("modal").appendChild(wrap);
    U.hideTip();
    U.whenStyled(() => {
      if (m.closed) return;
      U.appear(box);
      void wrap.offsetWidth;
      requestAnimationFrame(() => wrap.classList.remove("cpx-in"));
      U.focus(auto || box);
    });
    function close(v, reason) {
      if (m.closed) return;
      m.closed = true;
      drop(modals, m);
      // Её всплывашки (хозяин — она, якорь или открывшая кнопка — внутри) уходят вместе с ней.
      const mine = (x) => x && box.contains(x);
      for (const f of floats.slice()) if (f.modal === m || mine(f.anchorEl) || mine(f.triggerEl)) f.close("owner");
      for (const w of wins.slice()) if (w.modal === m && !w.closed) w.close("parent"); // окна поверх неё (overModal)
      const had = U.focusIn(wrap);
      U.unmzj(box);
      wrap.classList.add("cpx-out");
      U.vanish(box, () => wrap.remove());
      if (had) restore(m.prevFocus);
      resolve(v === undefined ? null : v);
      if (typeof o.onClose === "function") CPX.safely("ui:modal:onClose", () => o.onClose(v, reason));
    }
    m.close = close;
    return handle;
  };

  ui.confirm = function (o) {
    o = o || {};
    const buttons = o.danger
      ? [
          // Как подтверждения клиента: одна красная кнопка во всю ширину, под ней — отмена.
          { label: o.ok || CPX.t("ui.confirm"), kind: "danger", icon: o.okIcon, value: true, autofocus: true, full: true },
          { label: o.cancel || CPX.t("ui.cancel"), kind: "ghost", value: false, full: true },
        ]
      : [
          { label: o.cancel || CPX.t("ui.cancel"), kind: "ghost", value: false },
          { label: o.ok || CPX.t("ui.ok"), kind: "primary", icon: o.okIcon, value: true, autofocus: true },
        ];
    return ui
      .modal({ title: o.title, body: o.body, text: o.text, buttons, width: o.width, danger: !!o.danger, className: o.className })
      .result.then((v) => v === true);
  };

  /* ── тосты ────────────────────────────────────────────────────────────────── */
  // chat — обычные тосты; page — тосты с where:"page" (плашка обновления), у каждого вида своя стопка.
  const stacks = { chat: null, page: null };
  function toastStack(where) {
    let s = stacks[where];
    if (!s || !s.isConnected) {
      s = stacks[where] = CPX.el("div", { class: "cpx-toasts" });
      U.layer("toast").appendChild(s);
    }
    return s;
  }
  const PLAYER_BAR = 64; // кнопки плеера Twitch с полосой перемотки
  /** Место тостов where:"page" — страница мимо колонки чата, внизу по центру (владелец 05.11: плашка обновления никогда
   * не поверх чата). Чат справа — всё левее него, чат слева — правее; чат во всю ширину (под плеером в узком окне) —
   * над ним, а занял весь экран — сверху окна; чата нет — всё окно. Низ — у низа плеера (кинорежим, полный экран, чат
   * под плеером) — над его кнопками. */
  function pageArea() {
    const vw = U.viewW();
    const vh = U.viewH();
    const c = ui.chatRect();
    let a = { left: 0, right: vw, bottom: vh, fromTop: 0 };
    if (c.width < vw || c.height < vh) {
      if (Math.max(c.left, vw - c.right) >= 240) a = c.left >= vw - c.right ? { left: 0, right: c.left, bottom: vh } : { left: c.right, right: vw, bottom: vh };
      else if (c.top >= 80) a.bottom = c.top;
      else a.fromTop = 14;
    }
    // Основной плеер страницы (не спрятанный предпросмотр левой панели — у него тоже .video-player).
    const p = document.querySelector(".persistent-player") || document.querySelector(".video-player__default-player");
    const r = p && p.getBoundingClientRect();
    // Плеер кончается у низа места (кинорежим, полный экран; чат под плеером — между ними ещё шапка чата) — выше его кнопок.
    if (!a.fromTop && r && r.bottom > a.bottom - PLAYER_BAR - 48 && r.top < a.bottom - PLAYER_BAR * 2 && r.left < a.right && r.right > a.left)
      a.bottom = Math.min(a.bottom, r.bottom) - PLAYER_BAR;
    return a;
  }
  let toastTimer = 0;
  /** Обычные — над полем ввода, по центру колонки чата (нет чата — внизу окна браузера); where:"page" — pageArea().
   * Пока тосты видны — сверка раз в полсекунды: колонка могла съехать (театр, свёрнутый чат) без resize. */
  function placeToasts() {
    const live = Object.keys(stacks).filter((k) => stacks[k] && stacks[k].childElementCount);
    if (!live.length) {
      clearInterval(toastTimer);
      toastTimer = 0;
      return;
    }
    if (!toastTimer) toastTimer = setInterval(placeToasts, 500);
    const vh = U.viewH();
    for (const k of live) {
      const s = stacks[k];
      const r = k === "page" ? pageArea() : ui.chatRect();
      s.style.left = Math.round(r.left + 10) + "px";
      s.style.width = Math.max(140, Math.round(r.right - r.left - 20)) + "px";
      s.style.top = r.fromTop ? r.fromTop + "px" : "";
      s.style.bottom = r.fromTop ? "" : Math.round(Math.max(14, vh - r.bottom + 14)) + "px";
    }
  }
  ui.toast = function (o) {
    if (typeof o === "string") o = { text: o };
    o = o || {};
    const kind = o.kind === "ok" || o.kind === "error" ? o.kind : "info";
    const go = typeof o.onClick === "function" ? CPX.guard("ui:toast:click", o.onClick) : null;
    const el = CPX.el("div", { class: cls("cpx-toast", "cpx-toast--" + kind, go && "cpx-toast--link"), role: kind === "error" ? "alert" : "status" });
    U.surface(el, { tone: "raised", shape: "k2" });
    el.appendChild(CPX.el("span", { class: "cpx-toast__icon", "aria-hidden": "true" }, ui.icon(kind === "ok" ? "check" : kind === "error" ? "warning" : "info", 14)));
    el.appendChild(CPX.el("span", { class: "cpx-toast__text", text: String(o.text == null ? "" : o.text) }));
    let closed = false;
    let timer = 0;
    const close = () => {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
      U.vanish(el, placeToasts);
    };
    if (o.action && o.action.label) {
      const act = typeof o.action.onClick === "function" ? CPX.guard("ui:toast:action", o.action.onClick) : null;
      el.appendChild(
        CPX.el("button", {
          type: "button",
          class: "cpx-toast__action cpx-mz cpx-mzb cpx-k1 cpx-t-acc",
          text: String(o.action.label),
          onclick: (e) => {
            e.stopPropagation();
            if (act) act(e);
            close();
          },
        })
      );
    }
    // dismiss {label, onClick} — крестик справа: «больше не показывать» (подсказка про PLUS, владелец 23.10).
    if (o.dismiss && o.dismiss.label) {
      const fn = typeof o.dismiss.onClick === "function" ? CPX.guard("ui:toast:dismiss", o.dismiss.onClick) : null;
      const x = CPX.el("button", { type: "button", class: "cpx-toast__x", "aria-label": String(o.dismiss.label), "data-cpx-tip": String(o.dismiss.label) }, ui.icon("close", 12));
      x.addEventListener("click", (e) => {
        e.stopPropagation();
        if (fn) fn(e);
        close();
      });
      el.appendChild(x);
    }
    // onClick — щелчок по самому тосту (не по крестику): действие и закрыть; без него щелчок просто закрывает.
    el.addEventListener("click", (e) => {
      if (go) go(e);
      close();
    });
    const ms = o.timeout != null ? o.timeout : kind === "error" ? 6000 : 3500;
    const arm = () => {
      clearTimeout(timer);
      if (ms > 0 && !closed) timer = setTimeout(close, ms);
    };
    el.addEventListener("mouseenter", () => clearTimeout(timer));
    el.addEventListener("mouseleave", arm);
    const s = toastStack(o.where === "page" ? "page" : "chat");
    // Не больше трёх сразу: самые старые уходят.
    const live = [...s.children].filter((x) => !x.classList.contains("cpx-mz-out"));
    for (let i = 0; i < live.length - 2; i++) if (live[i]._cpxClose) live[i]._cpxClose();
    el._cpxClose = close;
    s.appendChild(el);
    U.whenStyled(() => {
      if (closed) return;
      placeToasts();
      U.appear(el);
      arm();
    });
    return { el, close };
  };
  ui.toast.ok = (text, o) => ui.toast(Object.assign({}, o, { text, kind: "ok" }));
  ui.toast.error = (text, o) => ui.toast(Object.assign({}, o, { text, kind: "error" }));

  /* ── плавающее окно ───────────────────────────────────────────────────────── */
  const INTERACTIVE =
    "button, a, input, textarea, select, label, summary, [contenteditable=''], [contenteditable='true'], [role='button'], [role='slider'], [role='menuitem'], [data-nodrag], .cpx-nodrag, .cpx-list, .cpx-chips";
  const M = 8; // поле от краёв окна браузера

  function setPos(w, x, y) {
    const vw = U.viewW();
    const vh = U.viewH();
    const ww = w.el.offsetWidth;
    const hh = w.el.offsetHeight;
    w.x = U.clamp(x, M, Math.max(M, vw - ww - M));
    w.y = U.clamp(y, M, Math.max(M, vh - hh - M));
    w.el.style.left = Math.round(w.x) + "px";
    w.el.style.top = Math.round(w.y) + "px";
  }
  function raise(w) {
    w.z = ++zTop;
    w.el.style.zIndex = String(w.z);
  }

  ui.window = function (o) {
    o = o || {};
    const kind = o.kind ? String(o.kind) : "";
    let parent = winOfHandle(o.parent);
    if (parent && parent.closed) parent = null;
    // Одно незакреплённое окно данного вида: новое заменяет прежнее (кроме своих предков —
    // цепочка «карточка → досье → карточка другого» живёт целиком).
    if (kind) {
      const anc = ancestors(parent);
      for (const x of wins.slice()) if (x.kind === kind && !x.pinned && !anc.has(x)) x.close("replaced");
    }
    const el = CPX.el("section", {
      class: cls("cpx-win", o.bare && "cpx-win--bare", o.header === false && "cpx-win--frameless", o.className),
      role: o.role || "dialog",
      tabindex: "-1",
    });
    if (o.width) el.style.width = typeof o.width === "number" ? o.width + "px" : o.width;
    if (o.height) el.style.height = typeof o.height === "number" ? o.height + "px" : o.height;
    const ev = o.event && typeof o.event.clientX === "number" ? o.event : null;
    const w = {
      kind,
      el,
      parent,
      children: new Set(),
      // Окно поверх модалки (overModal; дочерние — как у родителя): слой over, живёт, пока жива модалка.
      modal: modalOfHandle(o.overModal) || (parent && parent.modal) || null,
      pinned: !!o.pinned,
      autoClose: o.autoClose !== false,
      closable: o.closable !== false,
      closed: false,
      born: U.born(),
      prevFocus: U.active(),
      // Щелчок по тому, что открыло окно, — не «мимо» (открывающий сам решает: заново/закрыть).
      anchorEl: o.anchor instanceof Element ? o.anchor : null,
      triggerEl: triggerOf(o),
      x: 0,
      y: 0,
      z: 0,
      placed: false,
      closeFns: [],
      pinBtns: [],
    };
    if (w.pinned) el.classList.add("cpx-win--pinned");

    function pinButton() {
      // Булавка: включена — лавандовый значок без подложки (решение владельца).
      const b = ui.iconButton({ icon: w.pinned ? "pinFilled" : "pin", label: CPX.t(w.pinned ? "ui.unpin" : "ui.pin"), tip: false, className: "cpx-ibtn--bare", onClick: () => pin(!w.pinned) });
      b.setActive(w.pinned);
      w.pinBtns.push(b);
      return b;
    }
    const closeButton = () => ui.iconButton({ icon: "close", label: CPX.t("ui.close"), kind: "danger", tip: false, onClick: () => close("close") });

    let head = null;
    let titleEl = null;
    let actions = null;
    let tail = null; // первая из «своих» кнопок шапки (булавка/крестик) — свои действия встают перед ней
    if (o.header !== false) {
      head = CPX.el("header", { class: "cpx-win__head" });
      titleEl = CPX.el("div", { class: "cpx-win__title" });
      actions = CPX.el("div", { class: "cpx-win__actions" });
      for (const a of o.actions || []) if (a) actions.appendChild(a);
      if (o.pinnable !== false) {
        tail = pinButton();
        actions.appendChild(tail);
      }
      if (w.closable) {
        const c = closeButton();
        if (!tail) tail = c;
        actions.appendChild(c);
      }
      head.append(titleEl, actions);
      el.appendChild(head);
    }
    function setTitle(t) {
      if (typeof t === "string" && !o.label) el.setAttribute("aria-label", t);
      if (!titleEl) return;
      titleEl.textContent = "";
      if (t instanceof Node) titleEl.appendChild(t);
      else titleEl.textContent = String(t == null ? "" : t);
    }
    setTitle(o.title);
    if (o.label) el.setAttribute("aria-label", o.label);
    const body = CPX.el("div", { class: "cpx-win__body" });
    if (o.body != null) CPX.el.append(body, o.body);
    el.appendChild(body);
    // «Мозаика»: окно panel с выбоинами (клетка 8, глубина 1), жёсткая тень. Обрезка — у тела (его
    // обрезает внутренний контур): у самого окна overflow нет — тень и кольца фокуса не режутся.
    U.surface(el, { tone: "panel", shape: "mzj" });
    U.mzj(el, { kind: kind || o.className || "win", body, bites: 0.07 });

    function dragHandle(t) {
      t.addEventListener("pointerdown", (e) => {
        if (e.button !== 0 || w.closed || e.isPrimary === false) return;
        const x = e.target;
        const ia = x instanceof Element ? x.closest(INTERACTIVE) : null;
        if (ia && ia !== t && t.contains(ia)) return;
        e.preventDefault(); // без выделения текста при перетаскивании
        raise(w);
        if (!U.focusIn(el)) U.focus(el);
        const sx = e.clientX - w.x;
        const sy = e.clientY - w.y;
        try {
          t.setPointerCapture(e.pointerId);
        } catch (_) {}
        el.classList.add("cpx-dragging");
        U.hideTip();
        const mv = (ev2) => setPos(w, ev2.clientX - sx, ev2.clientY - sy);
        const up = () => {
          t.removeEventListener("pointermove", mv);
          t.removeEventListener("pointerup", up);
          t.removeEventListener("pointercancel", up);
          el.classList.remove("cpx-dragging");
        };
        t.addEventListener("pointermove", mv);
        t.addEventListener("pointerup", up);
        t.addEventListener("pointercancel", up);
      });
    }
    if (head) dragHandle(head);
    if (o.dragAnywhere) dragHandle(el);

    function pin(v) {
      w.pinned = !!v;
      el.classList.toggle("cpx-win--pinned", w.pinned);
      U.hideTip();
      for (const b of w.pinBtns) {
        b.setIcon(w.pinned ? "pinFilled" : "pin");
        b.setActive(w.pinned);
        b.setLabel(CPX.t(w.pinned ? "ui.unpin" : "ui.pin"));
      }
      if (typeof o.onPin === "function") CPX.safely("ui:window:onPin", () => o.onPin(w.pinned));
    }

    const ro = new ResizeObserver(() => {
      // Выросло от пришедших данных — вернуть в пределы окна браузера (как applyCardSize клиента).
      if (!w.closed && w.placed) setPos(w, w.x, w.y);
    });

    function close(reason) {
      if (w.closed) return;
      w.closed = true;
      ro.disconnect();
      U.unmzj(el);
      // Дети: незакреплённые закрываются с родителем, закреплённые живут сами по себе.
      for (const c of [...w.children]) {
        if (c.pinned) c.parent = null;
        else c.close("parent");
      }
      w.children.clear();
      if (w.parent) w.parent.children.delete(w);
      for (const f of floats.slice()) if (f.owner === w) f.close("owner");
      drop(wins, w);
      const had = U.focusIn(el);
      U.vanish(el);
      if (had && reason !== "outside") {
        const p = w.parent && !w.parent.closed ? w.parent.el : null;
        if (p) U.focus(p);
        else restore(w.prevFocus);
      }
      for (const fn of w.closeFns.splice(0)) CPX.safely("ui:window:onClose", () => fn(reason));
    }
    w.close = close;
    if (typeof o.onClose === "function") w.closeFns.push(o.onClose);

    function initialPlace() {
      const ww = el.offsetWidth;
      const hh = el.offsetHeight;
      let x = null;
      let y = null;
      const pt = o.at || (ev && (ev.clientX || ev.clientY) ? { x: ev.clientX, y: ev.clientY } : null);
      if (pt) {
        // Как клиент (ChannelView.cpp:4758): курсор − (ширина/3, высота/5), затем вписать.
        x = pt.x - ww / 3;
        y = pt.y - hh / 5;
      } else if (o.anchor) {
        const r = U.rectOf(o.anchor);
        if (r) {
          x = r.left;
          y = r.bottom + 8;
          if (y + hh > U.viewH() - M && r.top - 8 - hh >= M) y = r.top - 8 - hh;
        }
      }
      if (x == null) {
        const c = ui.chatRect();
        x = c.left + (c.width - ww) / 2;
        y = c.top + Math.max(12, (c.height - hh) / 3);
      }
      setPos(w, x, y);
    }

    wins.push(w);
    if (parent) parent.children.add(w);
    raise(w);
    el.addEventListener("pointerdown", () => raise(w), true);
    U.layer(w.modal && !w.modal.closed ? "over" : "win").appendChild(el);
    ro.observe(el);
    U.whenStyled(() => {
      if (w.closed) return;
      initialPlace();
      w.placed = true;
      U.appear(el);
      if (o.focus !== false) U.focus(el);
    });

    const h = {
      _w: w,
      el,
      head,
      body,
      kind,
      get pinned() {
        return w.pinned;
      },
      get isOpen() {
        return !w.closed;
      },
      get parent() {
        return w.parent ? w.parent.h : null;
      },
      pin: (v) => pin(v === undefined ? true : v),
      close: (r) => close(r || "close"),
      move: (x, y) => w.placed && setPos(w, x, y),
      fit: () => w.placed && setPos(w, w.x, w.y),
      setTitle,
      addAction(node) {
        if (actions && node) actions.insertBefore(node, tail && tail.parentNode === actions ? tail : null);
      },
      dragHandle: (t) => t && dragHandle(t),
      pinButton,
      closeButton,
      onClose(fn) {
        w.closeFns.push(fn);
        return () => drop(w.closeFns, fn);
      },
      focus: () => U.focus(el),
      children: () => [...w.children].map((c) => c.h),
    };
    w.h = h;
    return h;
  };

  ui.windows = (kind) => wins.filter((w) => !w.closed && (!kind || w.kind === kind)).map((w) => w.h);
  ui.closeWindows = (kind) => {
    for (const w of wins.slice()) if (!w.closed && !w.pinned && (!kind || w.kind === kind)) w.close("close");
  };
  // Сменился язык интерфейса: открытые окна (карточка, редактор ссылок, общие баны…) нарисованы на
  // прежнем — закрываем все, и закреплённые тоже (как меню смайликов); откроются уже на новом.
  // Кроме окна настроек: язык меняют в нём же, а страница во фрейме перезагружается сама.
  CPX.settings.on("general.lang", () => {
    for (const w of wins.slice()) if (!w.closed && w.kind !== "cpx-settings") w.close("close");
  });

  CPX.diag.add("uiOpen", () => ({ windows: wins.length, floats: floats.length, modals: modals.length, toasts: stack ? stack.childElementCount : 0 }));
})();

// ── src/main/99_start.js ──
/* Мир страницы: запуск. Последний файл бандла main.js. */

(() => {
  const root = document.documentElement;
  CPX.i18n.add({
    ru: {
      "start.dead": "Chatterino+ обновился — обновите страницу",
      "start.gone": "Chatterino+ выключен или обновлён — обновите страницу",
      "start.reload": "Обновить",
      "start.twin": "Включены две копии Chatterino+",
      "start.twinText":
        "Работает {run}, вторая копия{other} ждёт. Оставьте одну: лишнюю выключите на странице расширений браузера и обновите эту страницу — иначе копии мешают друг другу, а вход и настройки у них разные.",
      "start.twinReload": "Обновить страницу",
      "start.twinClose": "Закрыть",
    },
    en: {
      "start.dead": "Chatterino+ was updated — reload the page",
      "start.gone": "Chatterino+ was turned off or updated — reload the page",
      "start.reload": "Reload",
      "start.twin": "Two copies of Chatterino+ are on",
      "start.twinText":
        "{run} is running, the other copy{other} is waiting. Keep one: turn off the extra one on the browser's extensions page and reload this page — the copies get in each other's way, and their sign-in and settings are separate.",
      "start.twinReload": "Reload page",
      "start.twinClose": "Close",
    },
  });

  /* Уже запущена другая копия — не запускаемся дважды. Бывает так:
   *   • прежняя копия этого же расширения после обновления или выключения (Firefox при установке и включении сам
   *     ставит скрипты в открытые вкладки): её мост мёртв, она сама просит обновить страницу и помечает это
   *     (data-cpx-dead, ниже);
   *   • включены две разные копии — из магазина и из «Раннего доступа» (у сборки для сайта свой id; 12.10, жалоба
   *     подписчиков): работает вставшая первой. Стили обеих копий браузер ставит всё равно (page.css из манифеста) —
   *     версии смешиваются, поэтому лишнюю нужно выключить: говорит об этом и уступившая копия, и работающая (она
   *     видит чужое рукопожатие — "bridge:twin"; старые версии сами не скажут). Плашка одна на страницу.
   * Решаем через 6 с: прежняя копия могла ещё не заметить, что её мост умер (Firefox: проверка до 5 с). Уступившая
   * говорит, только если встала при загрузке страницы: вставленная в готовую страницу (Firefox — обновление или
   * включение расширения) почти всегда стоит рядом с прежней мёртвой копией того же расширения, а та старой версии
   * не помечает себя мёртвой — двойная плашка рядом с «обновите страницу» только путала бы.
   * В журнал — не предупреждением: Chrome собирал его в «Ошибки» расширения, и люди думали, что оно сломано. */
  const twinLater = (run, other) =>
    window.top === window && setTimeout(() => CPX.safely("start:twin", () => !root.dataset.cpxDead && twinNotice(run, other)), 6000);
  if (root && root.dataset.cpx) {
    CPX.log("start").info("на странице уже работает Chatterino+ " + root.dataset.cpx + " — эта копия (" + CPX.version + ") не стартует");
    if (document.readyState === "loading") twinLater(root.dataset.cpx, CPX.version);
    return;
  }
  if (root) root.dataset.cpx = CPX.version;
  CPX.bg.on("bridge:twin", (d) => twinLater(CPX.version, d && d.ver));

  if (CPX.dev) {
    // Только для стенда проверки: доступ к внутренностям из консоли/CDP.
    Object.defineProperty(window, "__CPX__", { value: CPX, configurable: true });
  }

  CPX.settings.ready.then(() => CPX.boot.run());

  // Мост умер (расширение обновилось или перезагрузилось): эта копия больше ничего не спросит у фона
  // — сказать человеку, а не молчать (иначе кнопки и окна просто «не работают»).
  CPX.bg.on("bridge:dead", (d) =>
    CPX.safely("start:dead", () => {
      if (root) root.dataset.cpxDead = "1"; // новая копия в этой вкладке не примет нас за живую
      const text = CPX.t(d && d.reason === "gone" ? "start.gone" : "start.dead");
      if (CPX.ui && CPX.ui.toast) CPX.ui.toast({ text, timeout: 0, action: { label: CPX.t("start.reload"), onClick: () => location.reload() } });
    })
  );

  /** Плашка «две копии» — своими силами: окна Chatterino+ (CPX.ui) у этой копии не запущены. В теневом корне,
   *  чтобы стили Twitch и обеих копий её не трогали; шрифт — страницы. */
  function twinNotice(run, other) {
    if (!document.body || document.querySelector("[data-cpx-twin]")) return;
    const host = document.createElement("div");
    host.setAttribute("data-cpx-twin", "");
    const sh = host.attachShadow({ mode: "open" });
    const css = document.createElement("style");
    css.textContent =
      ".b{position:fixed;top:60px;left:50%;transform:translateX(-50%);z-index:2147483000;width:min(440px,calc(100vw - 32px));" +
      "box-sizing:border-box;padding:12px 14px;background:#18181b;color:#efeff1;border:1px solid #b8a7f0;border-radius:6px;" +
      "box-shadow:0 6px 24px rgba(0,0,0,.5);font-size:13px;line-height:1.45}" +
      ".t{font-weight:700;margin:0 0 4px}.x{margin:0 0 10px;color:#c8c8d0}.r{display:flex;gap:8px;justify-content:flex-end}" +
      "button{font:inherit;font-weight:600;padding:5px 12px;border-radius:4px;cursor:pointer;border:1px solid #3a3a44;background:#26262c;color:#efeff1}" +
      "button.p{background:#b8a7f0;border-color:#b8a7f0;color:#18181b}";
    const box = CPX.el("div", { class: "b", role: "status" }, [
      CPX.el("p", { class: "t", text: CPX.t("start.twin") }),
      CPX.el("p", { class: "x", text: CPX.t("start.twinText", { run, other: other ? " (" + other + ")" : "" }) }),
    ]);
    const reload = CPX.el("button", { type: "button", class: "p", text: CPX.t("start.twinReload") });
    const close = CPX.el("button", { type: "button", text: CPX.t("start.twinClose") });
    reload.addEventListener("click", () => location.reload());
    close.addEventListener("click", () => host.remove());
    box.appendChild(CPX.el("div", { class: "r" }, [close, reload]));
    sh.append(css, box);
    document.body.appendChild(host);
  }
})();
})();

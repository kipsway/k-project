/* Chatterino+ 2.4.0 — iso. Собрано tools/build.py из src/; читаемый исходник, без минификации. */
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
CPX.world = "iso";
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

// ── src/iso/10_bridge.js ──
/* ISOLATED-мир: мост между миром страницы и фоном расширения.
 *
 * • Принимает ТОЛЬКО первое рукопожатие от мира страницы (наш MAIN-скрипт шлёт его
 *   при document_start, до скриптов Twitch) с меткой своей сборки (BUILD, tools/build.py) и только в первые
 *   секунды жизни вкладки — позднее «рукопожатие» мог бы прислать чужой скрипт. Канал создаёт сам и отдаёт
 *   сообщением «port» с той же меткой (05_bridge: так две копии Chatterino+ на странице не соединяются
 *   крест-накрест — 12.10).
 * • Держит runtime-порт к фону. Фон MV3 засыпает; тогда порт рвётся — мост
 *   переподключается сам и сообщает странице "bridge:bg" {up}. Пока вкладка жива,
 *   раз в 25 с шлёт фону «пульс», чтобы фон не засыпал посреди работы, и сразу отвечает на «ты тут?» фона
 *   (KEEP в 10_router: таймеры вкладки браузер тормозит, ответ на сообщение — нет).
 * • Методы "iso.*" выполняет сам (например, адрес ресурса расширения), остальное
 *   пересылает фону как есть; что можно звать со страницы, решает фон.
 *   Другие файлы ISOLATED-мира: CPX.iso.method("iso.<имя>", fn(p)) — свой метод для мира страницы (его может
 *   позвать и чужой скрипт страницы — проверять своё состояние), CPX.iso.emit(событие, данные) — событие миру
 *   страницы (только публичное: без номеров и ключей). Загрузка на eblo.id — iso/20_eblo_upload.js.
 * • После обновления/перезагрузки расширения старый контент-скрипт «осиротевает»
 *   (chrome.runtime пропадает) — сообщаем странице "bridge:dead".
 * • ⚠️Порт может умереть МОЛЧА (ревью 01.10, проверено в Chrome): страница вернулась кнопкой
 *   «Назад» из кэша вперёд-назад (Chrome закрывает порт, onDisconnect не приходит, отправка в
 *   него не бросает — сообщения пропадают) или вкладку разморозили после сна фона (отправка
 *   бросает). Тогда — resetBg(): старый порт прочь, сразу новый; модули повторят подписки по
 *   "bridge:bg" {up:true}. События старого порта после замены не принимаем.
 */

(() => {
  const log = CPX.log("iso-bridge");
  const HANDSHAKE_WINDOW_MS = 15000;
  const bornAt = Date.now();
  let pagePort = null;
  let bgPort = null;
  let bgUp = false;
  let dead = false;
  let retry = 0;
  let retryTimer = 0;
  const inflight = new Map(); // id запроса → true (чтобы ответить ошибкой при обрыве)

  function toPage(msg) {
    if (pagePort) pagePort.postMessage(msg);
  }

  function evt(e, d) {
    toPage({ t: "evt", e, d });
  }

  function runtimeAlive() {
    try {
      return !!(chrome.runtime && chrome.runtime.id);
    } catch (_) {
      return false;
    }
  }

  function markDead() {
    if (dead) return;
    dead = true;
    bgUp = false;
    evt("bridge:dead", {});
    log.warn("расширение перезапущено — связь с фоном потеряна до обновления страницы");
  }

  function failInflight(code) {
    for (const id of inflight.keys()) toPage({ t: "res", id, ok: false, e: "фон недоступен", code });
    inflight.clear();
  }

  function connectBg() {
    clearTimeout(retryTimer);
    retryTimer = 0;
    if (dead) return;
    if (!runtimeAlive()) return markDead();
    let port;
    try {
      port = chrome.runtime.connect({ name: "cpx-tab" });
    } catch (e) {
      if (!runtimeAlive() || /context invalidated/i.test(String(e && e.message))) return markDead();
      scheduleReconnect();
      return;
    }
    bgPort = port;
    port.onMessage.addListener((m) => {
      if (bgPort !== port) return; // порт уже заменён (resetBg)
      if (!m || typeof m !== "object") return;
      if (m.t === "res") inflight.delete(m.id);
      if (m.t === "hello") {
        const wasDown = !bgUp;
        bgUp = true;
        retry = 0;
        if (wasDown) evt("bridge:bg", { up: true });
        return;
      }
      if (m.t === "keep") {
        // «Ты тут?» фона — ответ сразу: входящее сообщение продлевает жизнь фона (Firefox), а свой пульс вкладки
        // по таймеру браузер в фоновой вкладке может задержать.
        try {
          port.postMessage({ t: "ping" });
        } catch (_) {
          /* порт умер — разберётся onDisconnect / resetBg */
        }
        return;
      }
      toPage(m);
    });
    port.onDisconnect.addListener(() => {
      // lastError читаем, чтобы Chrome не ругался «Unchecked runtime.lastError».
      void chrome.runtime.lastError;
      if (bgPort !== port) return; // запоздалое событие заменённого порта
      bgPort = null;
      if (bgUp) {
        bgUp = false;
        evt("bridge:bg", { up: false });
      }
      failInflight("bg-down");
      if (!runtimeAlive()) return markDead();
      scheduleReconnect();
    });
  }

  /** Связь с фоном оборвалась без onDisconnect — сбросить порт и подключиться заново сразу. */
  function resetBg(why) {
    if (dead) return;
    const old = bgPort;
    bgPort = null;
    if (old) {
      try {
        old.disconnect();
      } catch (_) {
        /* уже закрыт */
      }
    }
    if (bgUp) {
      bgUp = false;
      evt("bridge:bg", { up: false });
    }
    failInflight("bg-down");
    if (!runtimeAlive()) return markDead();
    log.debug("связь с фоном заново:", why);
    retry = 0;
    connectBg();
  }

  function scheduleReconnect() {
    const delay = Math.min(5000, 200 * Math.pow(2, retry++));
    retryTimer = setTimeout(connectBg, delay);
  }

  function handleIso(m) {
    switch (m.m) {
      case "iso.ping":
        // Мир страницы проверяет, жив ли этот мост (Firefox молча уничтожает старый ISOLATED).
        return true;
      case "iso.url":
        return chrome.runtime.getURL(String((m.p && m.p.path) || ""));
      case "iso.getText": {
        // Текст ресурса расширения (например, ui.css для Shadow DOM).
        const url = chrome.runtime.getURL(String((m.p && m.p.path) || ""));
        return fetch(url).then((r) => r.text());
      }
      default: {
        const fn = isoMethods.get(m.m);
        if (fn) return fn((m.p && typeof m.p === "object" && m.p) || {});
        throw new Error("неизвестный метод моста: " + m.m);
      }
    }
  }
  const isoMethods = new Map(); // "iso.<имя>" → fn — методы других файлов ISOLATED-мира (CPX.iso.method)
  CPX.iso = { method: (name, fn) => isoMethods.set(name, fn), emit: (e, d) => evt(e, d) };

  function onPageMessage(e) {
    const m = e.data;
    if (!m || typeof m !== "object" || m.t !== "req" || typeof m.m !== "string") return;
    if (m.m.startsWith("iso.")) {
      Promise.resolve()
        .then(() => handleIso(m))
        .then(
          (r) => toPage({ t: "res", id: m.id, ok: true, r }),
          (err) => toPage({ t: "res", id: m.id, ok: false, e: String(err && err.message) })
        );
      return;
    }
    if (dead) return toPage({ t: "res", id: m.id, ok: false, e: "расширение перезапущено", code: "dead" });
    if (!bgPort) {
      // Фон просыпается — подождём его, но не вечно (страница сама решит, повторять ли).
      connectBg();
      if (!bgPort) return toPage({ t: "res", id: m.id, ok: false, e: "фон недоступен", code: "bg-down" });
    }
    inflight.set(m.id, true);
    try {
      bgPort.postMessage({ t: "req", id: m.id, m: m.m, p: m.p });
    } catch (e) {
      // Порт умер — сброс связи (ответит и этому запросу); иначе (данные не переложить, BigInt и т.п.)
      // отказ ОДНОМУ запросу: чужой скрипт не должен уметь рвать связь всем (проверка 01.10).
      if (/disconnect|closed|invalidated/i.test(String(e && e.message))) resetBg("send");
      else {
        inflight.delete(m.id);
        toPage({ t: "res", id: m.id, ok: false, e: "запрос не передать", code: "bad" });
      }
    }
  }

  const BUILD = "b5e4bf1be77c"; // метка этой сборки — та же у нашего MAIN (tools/build.py)
  window.addEventListener("message", (e) => {
    const d = e.data;
    if (e.source !== window || !d || d.cpxBridge !== "hello" || d.b !== BUILD) return;
    if (pagePort) return;
    if (Date.now() - bornAt > HANDSHAKE_WINDOW_MS) {
      log.warn("позднее рукопожатие отклонено");
      return;
    }
    const ch = new MessageChannel();
    pagePort = ch.port1;
    pagePort.onmessage = onPageMessage;
    window.postMessage({ cpxBridge: "port", b: BUILD, bgUp }, "*", [ch.port2]);
  });

  // Если наш MAIN-скрипт успел послать рукопожатие раньше, чем мы начали слушать, —
  // попросим повторить.
  window.postMessage({ cpxBridge: "iso-ready", b: BUILD }, "*");

  connectBg();

  // Пульс: пока вкладка открыта, фон не засыпает (Chrome 114+: сообщение по порту
  // продлевает жизнь service worker).
  setInterval(() => {
    if (bgPort) {
      try {
        bgPort.postMessage({ t: "ping" });
      } catch (_) {
        resetBg("ping");
      }
    } else if (!dead && !retryTimer) {
      connectBg();
    }
  }, 25000);

  // Вернулись «Назад» из кэша вперёд-назад или вкладку разморозили — порт мог умереть молча.
  window.addEventListener("pageshow", (e) => e.persisted && resetBg("bfcache"));
  document.addEventListener("resume", () => resetBg("resume"));

  CPX.diag.add("iso", () => ({ page: !!pagePort, bgUp, dead }));
})();

// ── src/iso/20_eblo_upload.js ──
/* ISOLATED-мир: загрузка файлов на eblo.id из чата Twitch (общий план с клиентом — Z:\_memstudy\eblo\PLAN.md §6, §8.4;
 * ошибки — §3.3). Что видит человек (зона, строка над полем, вставка ссылки) рисует мир страницы — main/77_input_eblo.js.
 *
 * ПОЧЕМУ ЗДЕСЬ. Файл и одноразовый номер не должны попадать в мир страницы: там же скрипты Twitch и чужих расширений.
 * Берём файлы ТОЛЬКО из событий с isTrusted (перетаскивание и Ctrl+V делает человек): синтетическое событие со своим
 * файлом чужой скрипт сделать может — мы его не берём, иначе он загрузил бы что угодно в аккаунт человека. Номер на
 * каждую попытку фон выдаёт только сюда ({cpxIso:"eblo.ticket"}). Отправляет невидимая страница расширения во фрейме
 * (pages/eblo_upload.html, src/upload/10_upload.js): ей — срез файла (Blob, см. viaFrame), имя, upload_id и номер через postMessage с портом
 * MessageChannel, адресат — только адрес расширения (фрейм подменили — сообщение не дойдёт), ответы — только в порт.
 *
 * ОТКУДА. Перетаскивание файлов на колонку чата (.chat-room__content — список и поле ввода): dragover/drop отменяем —
 *   браузер не откроет файл сам. Ctrl+V в поле ввода, если в буфере файл/картинка и НЕТ текста (текст из Word/Excel
 *   несёт ещё и картинку — это обычная вставка). Только при включённой eblo.upload: копия у фона — prep {on, connected,
 *   maxBytes, exts} ({cpxIso:"eblo.prep"}); освежается при начале перетаскивания, фокусе поля и по просьбе мира страницы
 *   (iso.eblo.refresh: поменялась настройка или вход). Решение «брать ли» нужно сразу, в обработчике события.
 * ЗОНА (§6.2) — событие "eblo.zone" {s:"can"|"auth"|"bad", why, ext, mb, r:{l,t,w,h}} | null. Имени и размера при
 *   перетаскивании Chrome не отдаёт — «нельзя» по формату только по MIME (MIME_EXT), по размеру — где файл виден
 *   (getAsFile); незнакомое — «можно», окончательно решает проверка при отпускании.
 * ПРОВЕРКИ (§6.3): расширение из списка сайта, размер ≤ maxBytes, за раз не больше MAX_FILES (остальные — отказ), имя —
 *   cleanName (транслит), картинка из буфера — screenshot-ГГГГ-ММ-ДД_ЧЧ-ММ-СС.png как есть (без пересжатия).
 * ОЧЕРЕДЬ: по одному. Попытка — новый номер; upload_id — один на файл, тот же при повторах (сайт не плодит посты). §3.3:
 *   401 — фон уже стёр ключ, пауза с «Подключить»; 429 с retry_after ≤ 60 с — сами через него (не больше 3 раз подряд),
 *   иначе «Повторить»; 5xx/сеть — через 10, 30, 60 с, потом «Повторить»; 403 — стоп; 400/413 — файл пропускаем (в пачке
 *   — пометка в итоге). Пауза живёт PAUSE_MS. «Остановить» — прервать; пост успел создаться — мир страницы удалит его.
 * НЕ ПОДКЛЮЧЕНО (§6.6): {cpxIso:"eblo.connect"} — окно входа eblo.id сразу (разрешения на сайт нет — 13.10); вошёл —
 *   продолжаем тем же файлом; отказ — «Загрузка отменена: eblo.id не подключён»; сайт не отвечает, браузер не умеет
 *   окно входа, незнакомая сайту копия — своя строка (why "site" / "identity" / "unknown", как в настройках).
 *
 * Миру страницы — событие "eblo.up" {j (номер пачки), k, …}, только публичное (имя, ход, ссылка, код поста):
 *   progress {name, i, n, loaded, total} · connect · wait {why:"429"|"5xx", sec, name, i, n} · link {url, code} ·
 *   done {links, codes, note} · error {why, error, ext, mb, act:"retry"|"connect"|""} · stopped {codes} · idle.
 *   why: "400" | "401" | "403" | "413" | "429" | "fail" | "conn" | "site" | "identity" | "unknown" | "ext" | "size" |
 *   "many"; note — та же ошибка (+ name).
 * Методы для мира страницы (их может позвать и чужой скрипт — каждый сверяет своё состояние): iso.eblo.stop,
 *   iso.eblo.refresh. «Повторить» / «Подключить» — НЕ методом: только настоящим щелчком человека (isTrusted) по кнопке
 *   строки с data-cpx-eblo-act (её рисует мир страницы), не больше MAX_MANUAL раз на пачку — иначе скрипт страницы открыл
 *   бы окно входа и гонял повторную отправку файла без человека (проверка перед 2.0.0).
 * ПЕРЕТАСКИВАНИЕ ИЗНУТРИ СТРАНИЦЫ (смайлик, ссылка, картинка чата) — не загрузка: скрипт страницы мог подложить в него
 *   свой файл, а Firefox отдаёт его в drop как настоящий. Признак — свой dragstart в этом документе (до dragend/drop, не
 *   дольше INNER_MS) и mozSourceNode в Firefox.
 * Пачке — свой номер (job.id): фон продлевает срок «Отменить» только её постам; конец пачки — {cpxIso:"eblo.touch"}.
 * Фрейм отправки после «start» сторожим: пропал из документа, подменён или молчит дольше STALL_MS — итог «сеть» (обычные
 *   повторы с новым номером), иначе строка хода висела бы вечно.
 */

(() => {
  if (!CPX.iso) return;
  const log = CPX.log("eblo-up");
  const COL = ".chat-room__content";
  const COL2 = ".stream-chat, .chat-shell";
  const EDITOR = ".chat-wysiwyg-input__editor, div[data-a-target='chat-input']";
  const MAX_FILES = 10;
  const MAX_MANUAL = 5;
  const INNER_MS = 60000;
  const STALL_MS = 250000; // дольше сторожей самого фрейма (ни байта 60 с, ответа после отправки 180 с)
  const RETRY_S = [10, 30, 60];
  const MAX_429 = 3;
  const PAUSE_MS = 2 * 60000;
  const ORIGIN = chrome.runtime.getURL("").replace(/\/$/, "");
  // Частые MIME форматов, которых нет в списке сайта: «нельзя» видно уже при перетаскивании (имени там нет).
  const MIME_EXT = {
    "application/x-msdownload": "exe",
    "application/x-ms-dos-executable": "exe",
    "application/x-msdos-program": "exe",
    "application/vnd.microsoft.portable-executable": "exe",
    "application/x-msi": "msi",
    "application/vnd.android.package-archive": "apk",
    "application/x-iso9660-image": "iso",
    "image/svg+xml": "svg",
    "image/tiff": "tiff",
    "image/heic": "heic",
    "image/avif": "avif",
    "image/x-icon": "ico",
    "image/vnd.microsoft.icon": "ico",
    "text/html": "html",
    "text/javascript": "js",
    "application/msword": "doc",
    "application/vnd.ms-excel": "xls",
    "application/vnd.ms-powerpoint": "ppt",
    "video/x-flv": "flv",
    "video/x-ms-wmv": "wmv",
  };
  const IMG_EXT = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/bmp": "bmp", "image/webp": "webp" };

  const send = (msg) =>
    new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(msg, (r) => {
          void chrome.runtime.lastError;
          resolve(r == null ? null : r);
        });
      } catch (_) {
        resolve(null); // расширение перезапущено — до обновления страницы
      }
    });
  const emit = (k, d) => CPX.iso.emit("eblo.up", Object.assign({ j: job ? job.id : 0, k }, d));

  /* ── состояние у фона ─────────────────────────────────────────────────────── */
  let prep = null; // {on, connected, maxBytes, exts}
  let prepAt = 0;
  let prepP = null;
  function refresh(force) {
    if (prepP && (!force || Date.now() - prepAt < 300)) return prepP;
    if (!force && Date.now() - prepAt < 1500) return Promise.resolve(prep);
    prepAt = Date.now();
    prepP = send({ cpxIso: "eblo.prep" }).then((r) => {
      prepP = null;
      if (r && typeof r === "object") prep = { on: !!r.on, connected: !!r.connected, maxBytes: Number(r.maxBytes) || 0, exts: Array.isArray(r.exts) ? r.exts.map(String) : [] };
      return prep;
    });
    return prepP;
  }
  const mb = () => Math.round(((prep && prep.maxBytes) || 209715200) / 1048576);

  /* ── проверки и имя (§6.3) ────────────────────────────────────────────────── */
  const extOf = (name) => {
    const i = String(name || "").lastIndexOf(".");
    return i > 0 ? String(name).slice(i + 1).toLowerCase() : "";
  };
  /** null — можно; иначе {why:"ext", ext} | {why:"size", mb}. strict — при отпускании (имя есть); иначе по MIME. */
  function verdict(ext, size, strict) {
    if (ext ? !prep.exts.includes(ext) : strict) return { why: "ext", ext };
    if (size > prep.maxBytes) return { why: "size", mb: mb() };
    return null;
  }

  // Транслит (ГОСТ-подобный, §6.3): ж→zh, х→kh, ц→ts, ч→ch, ш→sh, щ→shch, ю→yu, я→ya, ь/ъ → пусто; + украинские буквы.
  const TR = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m",
    н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch",
    ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya", і: "i", ї: "yi", є: "ye", ґ: "g", ў: "u",
  };
  const pad2 = (n) => String(n).padStart(2, "0");
  function stamp() {
    const d = new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()) + "_" + pad2(d.getHours()) + "-" + pad2(d.getMinutes()) + "-" + pad2(d.getSeconds());
  }
  /** Имя для сайта: только [A-Za-z0-9._-], до 80 знаков, расширение — в нижнем регистре. */
  function cleanName(name, ext, shot) {
    const dot = String(name || "").lastIndexOf(".");
    let base = shot ? "" : dot > 0 ? String(name).slice(0, dot) : String(name || "");
    base = base
      .normalize("NFC")
      .replace(/[а-яёіїєґў]/gi, (ch) => {
        const lo = ch.toLowerCase();
        const r = TR[lo];
        return ch === lo || !r ? r : r.charAt(0).toUpperCase() + r.slice(1);
      })
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // é → e
      .replace(/\s+/g, "-")
      .replace(/[^A-Za-z0-9._-]/g, "-")
      .replace(/-{2,}/g, "-")
      .replace(/^[-._]+|[-._]+$/g, "");
    base = base.slice(0, 80 - ext.length - 1).replace(/[-._]+$/g, "");
    if (!base) base = (shot ? "screenshot-" : "file-") + stamp();
    return base + "." + ext;
  }

  /* ── пачка ────────────────────────────────────────────────────────────────── */
  let job = null; // {id, items, i, links, codes, note, state: run|paused|done|stopped, err, busy, timer, wake, abort}
  let jobSeq = 0;

  /** Файлы от человека (drop / вставка) → в очередь. Отказ — пометка пачки; ничего не годится — сразу ошибка. */
  function add(files, pasted) {
    if (job && job.state !== "run") job = null;
    const fresh = !job;
    if (!job) job = { id: ++jobSeq, items: [], i: 0, links: [], codes: [], note: null, state: "run", manual: 0 };
    const my = job;
    let taken = 0;
    for (const f of files) {
      if (taken >= MAX_FILES || my.items.length - my.i >= MAX_FILES) {
        my.note = my.note || { why: "many" };
        continue;
      }
      // Картинка из буфера: браузер даёт ей своё имя (Chrome — image.png, Firefox — на языке системы: «изображение.png»)
      // и метку «сейчас»; у файла, скопированного в проводнике, — настоящее имя и дата правки.
      const shot = pasted && /^image\//.test(f.type) && (!f.name || /^image\.\w+$/i.test(f.name) || Date.now() - f.lastModified < 60000);
      const ext = shot ? IMG_EXT[f.type] || "png" : extOf(f.name);
      const bad = verdict(ext, f.size, true);
      if (bad) {
        my.note = my.note || Object.assign({ name: f.name }, bad);
        continue;
      }
      taken++;
      my.items.push({ file: f, name: cleanName(f.name, ext, shot), uploadId: crypto.randomUUID(), w5: 0, w429: 0 });
    }
    if (fresh && !my.items.length) {
      job = null;
      CPX.iso.emit("eblo.up", Object.assign({ j: my.id, k: "error", act: "" }, my.note, { name: undefined }));
      return;
    }
    pump(my);
  }

  async function pump(my) {
    if (my.busy) return;
    my.busy = true;
    try {
      while (job === my && my.state === "run" && my.i < my.items.length) {
        const r = await attempt(my, my.items[my.i]);
        if (r !== "next") return;
        my.i++;
      }
      if (job === my && my.state === "run") finish(my);
    } catch (e) {
      CPX.report("eblo-up:pump", e);
      if (job === my && my.state === "run") pause(my, { why: "fail", act: "retry" });
    } finally {
      my.busy = false;
    }
  }

  const live = (my) => job === my && my.state === "run";

  /** Один файл до итога: "next" — дальше; "pause" / "stop" — пачка ждёт человека или кончилась. */
  async function attempt(my, it) {
    for (;;) {
      progress(my, it, 0, it.file.size);
      const t = await send({ cpxIso: "eblo.ticket", batch: my.id });
      if (!live(my)) return "stop";
      if (t && t.reason === "off") {
        stop(); // настройку выключили посреди пачки
        return "stop";
      }
      if (t && t.reason === "auth") {
        if (await connect(my)) continue;
        if (live(my)) fail(my, { why: CONN_WHY.has(my.connWhy) ? my.connWhy : "conn" });
        return "stop";
      }
      const r = t && t.ok && t.nonce ? await viaFrame(my, it, t.nonce) : { status: 0 };
      if (!live(my)) {
        if (r.code) emit("stopped", { codes: [r.code] }); // остановили, а пост успел создаться
        return "stop";
      }
      const s = r.status;
      if (s === 200 && r.url) {
        my.links.push(r.url);
        my.codes.push(r.code || ""); // вровень со ссылками: без кода пост не отменить
        emit("link", { url: r.url, code: r.code || "" });
        return "next";
      }
      if (s === 401) return pause(my, { why: "401", act: "connect" });
      if (s === 429 && r.retryAfter > 0 && r.retryAfter <= 60 && it.w429 < MAX_429) {
        it.w429++;
        if (!(await wait(my, it, "429", Math.ceil(r.retryAfter)))) return "stop";
        continue;
      }
      if (s === 429) return pause(my, { why: "429", act: "retry" });
      if (s === 0 || s >= 500) {
        if (it.w5 < RETRY_S.length) {
          if (!(await wait(my, it, "5xx", RETRY_S[it.w5++]))) return "stop";
          continue;
        }
        return pause(my, { why: "fail", act: "retry" });
      }
      const e = { why: s === 403 ? "403" : s === 413 ? "413" : "400", error: r.error || "", mb: mb() };
      if (s === 403) {
        fail(my, e); // аккаунту загрузка закрыта — остальные файлы тоже не пройдут
        return "stop";
      }
      my.note = my.note || Object.assign({ name: it.file.name }, e);
      return "next";
    }
  }

  function progress(my, it, loaded, total) {
    emit("progress", { name: it.name, i: my.i + 1, n: my.items.length, loaded: Math.max(0, Number(loaded) || 0), total: Math.max(0, Number(total) || it.file.size) });
  }

  /** Ждать sec секунд (обратный отсчёт строкой); false — пачку остановили. */
  function wait(my, it, why, sec) {
    return new Promise((resolve) => {
      let left = sec;
      my.wake = () => resolve(false);
      const tick = () => {
        if (!live(my)) return resolve(false);
        if (left <= 0) return resolve(true);
        emit("wait", { why, sec: left, name: it.name, i: my.i + 1, n: my.items.length });
        left--;
        my.timer = setTimeout(tick, 1000);
      };
      tick();
    });
  }

  /** Не подключено: окно входа eblo.id (§6.6). true — подключено, продолжаем тем же файлом. */
  const CONN_WHY = new Set(["site", "identity", "unknown"]); // отказы входа со своей строкой (остальные — «не подключён»)
  async function connect(my) {
    emit("connect", {});
    const r = await send({ cpxIso: "eblo.connect" });
    if (!live(my)) return false;
    my.connWhy = (r && r.reason) || "";
    if (!(r && r.ok)) return false;
    await refresh(true);
    return true;
  }

  function pause(my, err) {
    my.state = "paused";
    my.err = err;
    emit("error", Object.assign({ mb: mb() }, err));
    my.timer = setTimeout(() => job === my && my.state === "paused" && (job = null), PAUSE_MS);
    return "pause";
  }
  function fail(my, err) {
    my.state = "done";
    send({ cpxIso: "eblo.touch", batch: my.id });
    emit("error", Object.assign({ mb: mb(), act: "" }, err));
  }
  function finish(my) {
    my.state = "done";
    send({ cpxIso: "eblo.touch", batch: my.id }); // срок «Отменить» всей пачки — с этого момента
    if (my.links.length) emit("done", { links: my.links.slice(), codes: my.codes.slice(), note: my.note });
    else if (my.note) emit("error", Object.assign({ act: "" }, my.note, { name: undefined }));
    else emit("idle", {});
  }

  function stop() {
    const my = job;
    if (!my || (my.state !== "run" && my.state !== "paused")) return false;
    my.state = "stopped";
    clearTimeout(my.timer);
    if (my.wake) my.wake(false);
    if (my.abort) my.abort();
    emit("idle", {});
    return true;
  }

  /* ── фрейм отправки ───────────────────────────────────────────────────────── */
  let frame = null;
  let frameP = null;
  function getFrame() {
    if (frame && frame.isConnected && frame.contentWindow) return frameP;
    if (frame) frame.remove();
    const f = document.createElement("iframe");
    f.className = "cpx-own";
    f.setAttribute("aria-hidden", "true");
    f.tabIndex = -1;
    f.style.cssText = "position:fixed;left:-10000px;top:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none;";
    frameP = new Promise((res) => {
      f.addEventListener("load", () => res(true), { once: true });
      setTimeout(() => res(false), 10000);
    });
    f.src = chrome.runtime.getURL("pages/eblo_upload.html");
    (document.body || document.documentElement).appendChild(f);
    frame = f;
    return frameP;
  }
  const GOOD_URL = CPX.dev ? /^(https:\/\/eblo\.id|http:\/\/127\.0\.0\.1:\d{2,5})\/[^\s"'<>\\]+$/ : /^https:\/\/eblo\.id\/[^\s"'<>\\]+$/;

  /** Одна попытка через фрейм → {status, url?, code?, error?, retryAfter?}. Фрейм молчит 15 с — он сломан (его могли
   *  подменить): пересоздаём, итог — как сеть. */
  async function viaFrame(my, it, nonce) {
    await getFrame();
    const f = frame;
    if (!live(my) || !f || !f.contentWindow) return { status: 0 };
    return new Promise((resolve) => {
      const ch = new MessageChannel();
      let started = false;
      let over = false;
      let stopT = 0;
      let heard = Date.now();
      const end = (r) => {
        if (over) return;
        over = true;
        clearTimeout(ackT);
        clearTimeout(stopT);
        clearInterval(dog);
        my.abort = null;
        ch.port1.close();
        resolve(r);
      };
      const ackT = setTimeout(() => {
        if (started) return;
        if (frame === f) frame = null;
        f.remove();
        end({ status: 0 });
      }, 15000);
      // Фрейм пропал (его удалил или перенаправил скрипт страницы, упал процесс) или молчит — дальше как сбой сети.
      const dog = setInterval(() => {
        if (!started) return;
        if (f.isConnected && frame === f && Date.now() - heard < STALL_MS) return;
        if (frame === f) frame = null;
        f.remove();
        end({ status: 0 });
      }, 5000);
      ch.port1.onmessage = (e) => {
        const m = e.data;
        if (!m || typeof m !== "object") return;
        heard = Date.now();
        if (m.t === "start") started = true;
        else if (m.t === "progress") {
          started = true;
          if (live(my)) progress(my, it, m.loaded, m.total);
        } else if (m.t === "done") {
          const url = typeof m.url === "string" && GOOD_URL.test(m.url) ? m.url : "";
          end({
            status: Number(m.status) || 0,
            url,
            code: url && typeof m.code === "string" && /^[A-Za-z0-9]{7}$/.test(m.code) ? m.code : "",
            error: typeof m.error === "string" ? m.error.slice(0, 200) : "",
            retryAfter: Number(m.retryAfter) || 0,
          });
        }
      };
      // «Остановить»: фрейм прерывает запрос и отвечает "done" (если пост успел создаться — с кодом).
      my.abort = () => {
        try {
          ch.port1.postMessage({ t: "abort" });
        } catch (_) {
          /* порт закрыт */
        }
        stopT = setTimeout(() => end({ status: 0 }), 5000);
      };
      try {
        // Не сам File, а его срез (Blob): File из перетаскивания Chrome отдаёт с путём на диске, читать который вправе
        // только процесс страницы Twitch, — у фрейма расширения (другой процесс) отправка падала сетевой ошибкой
        // (стенд 13.10). Срез — без пути и без чтения в память: данные читает сам браузер.
        const body = it.file.slice(0, it.file.size, it.file.type);
        f.contentWindow.postMessage({ cpxUpload: 1, nonce, file: body, name: it.name, uploadId: it.uploadId }, ORIGIN, [ch.port2]);
      } catch (e) {
        log.warn("фрейм отправки недоступен:", e && e.message);
        end({ status: 0 });
      }
    });
  }

  /* ── события человека ─────────────────────────────────────────────────────── */
  const isFiles = (dt) => !!dt && Array.from(dt.types || []).includes("Files");
  function colRect(x, y) {
    const pick = (sel) => {
      for (const el of document.querySelectorAll(sel)) {
        const r = el.getBoundingClientRect();
        if (r.width >= 120 && r.height >= 120 && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return r;
      }
      return null;
    };
    return pick(COL) || (!document.querySelector(COL) && pick(COL2)) || null;
  }

  let zoneKey = "";
  let zoneT = 0;
  function zone(z) {
    clearTimeout(zoneT);
    // Курсор ушёл за окно браузера — dragleave бывает не всегда: без dragover 400 мс зона гаснет сама.
    if (z) zoneT = setTimeout(() => zone(null), 400);
    const key = z ? JSON.stringify(z) : "";
    if (key === zoneKey) return;
    zoneKey = key;
    CPX.iso.emit("eblo.zone", z);
  }

  function dragState(dt) {
    if (!prep.connected) return { s: "auth" };
    let bad = null;
    let ok = false;
    for (const it of Array.from(dt.items || [])) {
      if (it.kind !== "file") continue;
      let f = null;
      try {
        f = it.getAsFile(); // Chrome при перетаскивании файла не отдаёт (null), Firefox — отдаёт
      } catch (_) {
        f = null;
      }
      const ext = (f && extOf(f.name)) || MIME_EXT[String(it.type || "").toLowerCase()] || "";
      const v = verdict(ext, f ? f.size : 0, !!(f && f.name));
      if (v) bad = bad || v;
      else ok = true;
    }
    return !ok && bad ? Object.assign({ s: "bad" }, bad) : { s: "can" };
  }

  let innerAt = 0; // время своего dragstart (перетаскивание изнутри страницы), 0 — нет
  const fromPage = (dt) => (innerAt && Date.now() - innerAt < INNER_MS) || !!(dt && dt.mozSourceNode);
  function onDragOver(e) {
    if (!e.isTrusted || !isFiles(e.dataTransfer) || fromPage(e.dataTransfer)) return;
    if (e.type === "dragenter") refresh(false);
    const r = prep && prep.on ? colRect(e.clientX, e.clientY) : null;
    if (!r) return zone(null);
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    zone(Object.assign(dragState(e.dataTransfer), { r: { l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) } }));
  }
  function onDragLeave(e) {
    if (e.isTrusted && !e.relatedTarget) zone(null); // ушли за пределы страницы
  }
  function onDrop(e) {
    const inner = fromPage(e.dataTransfer);
    innerAt = 0;
    if (!e.isTrusted || !isFiles(e.dataTransfer) || inner) return;
    zone(null);
    if (!prep || !prep.on || !colRect(e.clientX, e.clientY)) return;
    e.preventDefault();
    e.stopPropagation();
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length) add(files, false);
  }
  function inEditor(t) {
    const el = t && (t.nodeType === 1 ? t : t.parentElement);
    return !!(el && el.closest && el.closest(EDITOR));
  }
  function onPaste(e) {
    if (!e.isTrusted || !prep || !prep.on || !inEditor(e.target)) return;
    const cd = e.clipboardData;
    if (!cd || (cd.getData("text/plain") || "").trim()) return; // текст — обычная вставка
    let files = Array.from(cd.files || []);
    if (!files.length) files = Array.from(cd.items || []).filter((i) => i.kind === "file").map((i) => i.getAsFile()).filter(Boolean);
    if (!files.length) return;
    e.preventDefault();
    e.stopPropagation();
    add(files, true);
  }

  window.addEventListener("dragstart", (e) => e.isTrusted && (innerAt = Date.now()), true);
  window.addEventListener("dragenter", onDragOver, true);
  window.addEventListener("dragover", onDragOver, true);
  window.addEventListener("dragleave", onDragLeave, true);
  window.addEventListener("drop", onDrop, true);
  window.addEventListener(
    "dragend",
    () => {
      innerAt = 0;
      zone(null);
    },
    true
  );
  window.addEventListener("paste", onPaste, true);
  document.addEventListener("focusin", (e) => inEditor(e.target) && refresh(false), true);

  CPX.iso.method("iso.eblo.stop", () => stop());
  function retry() {
    const my = job;
    if (!my || my.state !== "paused" || !my.err || !my.err.act || my.manual >= MAX_MANUAL) return false;
    my.manual++;
    clearTimeout(my.timer);
    const it = my.items[my.i];
    if (it) it.w5 = it.w429 = 0;
    my.state = "run";
    my.err = null;
    pump(my);
    return true;
  }
  window.addEventListener(
    "click",
    (e) => {
      if (!e.isTrusted || e.button !== 0) return;
      const t = e.target;
      const b = t && t.closest ? t.closest("button[data-cpx-eblo-act]") : null;
      if (b && b.isConnected && b.getAttribute("data-cpx-eblo-act") === "retry") retry();
    },
    true
  );
  CPX.iso.method("iso.eblo.refresh", () => refresh(true).then((p) => !!p));
  refresh(true);

  CPX.diag.add("ebloUp", () => ({ prep: prep && { on: prep.on, connected: prep.connected, exts: prep.exts.length }, job: job && { id: job.id, state: job.state, i: job.i, n: job.items.length, links: job.links.length } }));
})();
})();

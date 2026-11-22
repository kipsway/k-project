/* Chatterino+ 2.4.0 — bg. Собрано tools/build.py из src/; читаемый исходник, без минификации. */
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
CPX.world = "bg";
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

// ── src/bg/10_router.js ──
/* Фон: приём запросов от вкладок Twitch и страниц расширения, рассылка событий.
 *
 * Регистрация метода:
 *   CPX.router.handle("emotes.channel", async (params, ctx) => {...}, { page: true });
 * { page: true } — метод можно звать из мира страницы Twitch. Без этого флага метод
 * доступен только страницам самого расширения (popup, настройки, согласие).
 * ⚠️Мир страницы доверенный лишь наполовину: там же работают скрипты Twitch и других
 * расширений. Методы для страницы не должны отдавать секреты (пропуск, ключ) и не должны
 * позволять «сделать что угодно от имени человека».
 *
 * ctx: { from: "page"|"ext", tab (для page), sender }.
 *
 * Вкладки: порт "cpx-tab" от ISOLATED-мира. У вкладки есть набор открытых каналов
 * (метод tab.setChannels) — по нему события уходят только тем, кому нужны.
 * БОДРОСТЬ ФОНА (KEEP). Пока открыта хоть одна вкладка Twitch, фон раз в KEEP_MS спрашивает вкладки «ты тут?»
 * ({t:"keep"}), мост вкладки сразу отвечает «пульсом». Зачем: в Firefox фон расширения (неперсистентная страница)
 * выгружается после 30 с без входящих событий, открытый порт и сокет нашего сервера его не держат, а свой пульс
 * вкладки (раз в 25 с, iso/10_bridge) идёт по таймеру ВКЛАДКИ — его Firefox задерживает в фоновой вкладке, которая
 * много тратит процессора (живой Twitch). Фон выгружался — сокет закрывался кодом 1001 и через миг открывался снова:
 * сервер видел у Firefox половину сессий по 25–65 с (находка сервера 19.10). Таймеры самого фона так не тормозятся,
 * а ответ вкладки — не таймер. Вкладок нет — не спрашиваем: фону можно спать, сокет закрыт (40_ws).
 * Страницы расширения: порт "cpx-ext" (события) и chrome.runtime.sendMessage({cpxCall}) (запросы).
 *
 * События модулям фона: CPX.router.ev — "tab:open"(tab), "tab:close"(tab),
 * "tab:channels"(tab) — сменился набор каналов вкладки; "channels"(Set всех открытых каналов).
 *
 * САЙТЫ КРОМЕ TWITCH — Kick (15.11; YouTube был 18.11, убран 19.11): bg/15_sites.js встраивает наш мир страницы туда, когда
 * человек разрешил сайт. Их вкладки — ОТДЕЛЬНО, у вкладки tab.site = "kick":
 *   • router.tabs / router.channels() / события tab:* и "channels" — по-прежнему ТОЛЬКО Twitch (модулям Twitch — модерации,
 *     эстафете, программе Chatterino+, присутствию 7TV — вкладка другого сайта не нужна и не должна им попадаться);
 *   • router.siteTabs / router.siteChannels() / события "site:open", "site:close", "site:channels" — вкладки сайтов;
 *     каналы — "kick:<номер владельца канала на Kick>" (номера разных площадок — разные люди);
 *   • router.pageTabs() — сколько всего вкладок со страницей: держать сокет, список PLUS, глобальные смайлики.
 * ⚠️Граница доверия: мир страницы сайта видят скрипты этого сайта. Методы для вкладок сайтов — только из SITE_METHODS,
 * события — только из SITE_EVENTS (settings.changed — без настроек, которые им не нужны: siteSetting). Свои данные сайта
 * (список PLUS на номерах площадки) модули шлют явно — router.toSite(сайт, …).
 */

CPX.router = (() => {
  const log = CPX.log("router");
  const ev = new CPX.Emitter();
  const handlers = new Map();
  const tabs = new Set(); // вкладки Twitch: { port, tabId, frameId, url, site: "twitch", channels: Map(id → login) }
  const siteTabs = new Set(); // вкладки сайтов: то же, site: "kick", каналы "<сайт>:<номер>"
  const extPorts = new Set();
  const TWITCH_URL = /^https:\/\/([a-z0-9-]+\.)*twitch\.tv\//i;
  const SITE_URL = { kick: /^https:\/\/kick\.com\//i };
  const SITE_ID = { kick: /^kick:\d{1,20}$/ };
  const siteOfId = (id) => Object.keys(SITE_ID).find((k) => SITE_ID[k].test(id)) || "";
  // Что можно вкладке сайта (см. шапку): смайлики, косметика, список PLUS (свой, на номерах площадки), зеркало, нужные настройки.
  const SITE_METHODS = new Set([
    "awards.state", // ивент в верхней панели (46_awards): публичные сведения об ивенте и «есть ли значок» — свой человек
    "tab.setChannels",
    "settings.getAll",
    "settings.set",
    "clock.get",
    "emotes.global",
    "emotes.channel",
    "emotes.keep",
    "cosm.users",
    "cosm.sets",
    "plus.roster",
    "mirror.page",
    "mirror.note",
    "mirror.hintClaim",
    "mirror.hintShown",
    "diag.bg",
  ]);
  const SITE_EVENTS = new Set(["settings.changed", "clock", "emotes.global", "emotes.channel", "cosm.update", "mirror.page", "mirror.revive", "site.off", "awards.state"]);
  // Настройки, которые нужны миру сайта (читать и, если pageWritable, писать): язык, смайлики и косметика, зеркало, ввод,
  // подсветка плеера. Прочее (свои кнопки модерации, списки, быстрые ссылки…) странице сайта не показываем.
  const SITE_SETTING = /^(general\.(lang|noAppear|consent)$|emotes\.|mirror\.|input\.|player\.ambient|kick\.|dev\.mirrorBase$)/;
  const siteSetting = (k) => SITE_SETTING.test(String(k));
  function siteEvent(e, d) {
    if (!SITE_EVENTS.has(e)) return undefined;
    if (e !== "settings.changed") return d;
    const ch = {};
    for (const k in (d && d.changes) || {}) if (siteSetting(k)) ch[k] = d.changes[k];
    return Object.keys(ch).length ? { changes: ch } : undefined;
  }
  function sendEvt(t, e, d) {
    if (t.site !== "twitch") {
      d = siteEvent(e, d);
      if (d === undefined) return;
    }
    post(t.port, { t: "evt", e, d });
  }
  const KEEP_MS = 20000; // меньше 30 с простоя, после которых Firefox выгружает фон
  let keepTimer = 0;
  const pageTabs = () => tabs.size + siteTabs.size;
  function keepAwake() {
    if (pageTabs() && !keepTimer) {
      keepTimer = setInterval(() => {
        for (const t of tabs) post(t.port, { t: "keep" });
        for (const t of siteTabs) post(t.port, { t: "keep" });
      }, KEEP_MS);
    } else if (!pageTabs() && keepTimer) {
      clearInterval(keepTimer);
      keepTimer = 0;
    }
  }

  function handle(name, fn, opts) {
    handlers.set(name, { fn, page: !!(opts && opts.page) });
  }

  async function dispatch(name, params, ctx) {
    const h = handlers.get(name);
    if (!h) throw Object.assign(new Error("неизвестный метод " + name), { code: "unknown" });
    if (ctx.from === "page" && !h.page) throw Object.assign(new Error("метод недоступен странице: " + name), { code: "forbidden" });
    if (ctx.tab && ctx.tab.site !== "twitch" && !SITE_METHODS.has(name)) throw Object.assign(new Error("метод недоступен сайту " + ctx.tab.site + ": " + name), { code: "forbidden" });
    return await h.fn(params || {}, ctx);
  }

  function post(port, msg) {
    try {
      port.postMessage(msg);
      return true;
    } catch (_) {
      return false;
    }
  }

  function allChannels(set) {
    const out = new Map();
    for (const t of set || tabs) for (const [id, login] of t.channels) out.set(id, login);
    return out;
  }

  chrome.runtime.onConnect.addListener((port) => {
    const sender = port.sender || {};
    if (sender.id !== chrome.runtime.id) return port.disconnect();

    if (port.name === "cpx-ext") {
      // Страница расширения (popup/настройки): только события.
      if (!sender.url || !sender.url.startsWith(chrome.runtime.getURL(""))) return port.disconnect();
      extPorts.add(port);
      port.onDisconnect.addListener(() => extPorts.delete(port));
      return;
    }

    if (port.name !== "cpx-tab") return port.disconnect();
    const site = !sender.url ? "" : TWITCH_URL.test(sender.url) ? "twitch" : Object.keys(SITE_URL).find((k) => SITE_URL[k].test(sender.url)) || "";
    if (!site) return port.disconnect();
    const other = site !== "twitch";
    const set = other ? siteTabs : tabs;

    const tab = {
      port,
      tabId: sender.tab ? sender.tab.id : -1,
      frameId: sender.frameId || 0,
      url: sender.url,
      site,
      channels: new Map(),
    };
    set.add(tab);
    keepAwake();
    post(port, { t: "hello" });
    ev.emit(other ? "site:open" : "tab:open", tab);

    port.onMessage.addListener((m) => {
      if (!m || typeof m !== "object") return;
      if (m.t === "ping") return;
      if (m.t !== "req" || typeof m.m !== "string") return;
      dispatch(m.m, m.p, { from: "page", tab, sender }).then(
        (r) => post(port, { t: "res", id: m.id, ok: true, r: r === undefined ? null : r }),
        (e) => {
          if (e && e.code !== "forbidden" && e.code !== "unknown" && !e.quiet) CPX.report("call:" + m.m, e);
          post(port, { t: "res", id: m.id, ok: false, e: String((e && e.message) || e), code: e && e.code });
        }
      );
    });

    port.onDisconnect.addListener(() => {
      void chrome.runtime.lastError;
      set.delete(tab);
      keepAwake();
      const had = tab.channels.size > 0;
      tab.channels.clear();
      ev.emit(other ? "site:close" : "tab:close", tab);
      if (had) ev.emit(other ? "site:channels" : "channels", allChannels(set));
    });
  });

  // Запросы страниц расширения (popup, настройки, согласие). ⚠️Пускаем по АДРЕСУ отправителя:
  // у настроек и экрана согласия, открытых во вкладке, есть sender.tab, а контент-скрипты
  // (у них адрес — страница Twitch) сюда не должны попадать.
  const EXT_ORIGIN = chrome.runtime.getURL("");
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || !msg.cpxCall || sender.id !== chrome.runtime.id) return false;
    if (typeof sender.url !== "string" || !sender.url.startsWith(EXT_ORIGIN)) return false;
    dispatch(msg.m, msg.p, { from: "ext", sender }).then(
      (r) => sendResponse({ ok: true, r: r === undefined ? null : r }),
      (e) => sendResponse({ ok: false, e: String((e && e.message) || e), code: e && e.code })
    );
    return true;
  });

  // Вкладка сообщает, какие каналы у неё открыты: [{id, login}] (обычно один). Вкладка сайта — только "<её сайт>:<номер>",
  // вкладка Twitch — только номер Twitch.
  handle(
    "tab.setChannels",
    (p, ctx) => {
      const other = ctx.tab.site !== "twitch";
      const list = Array.isArray(p.channels) ? p.channels.slice(0, 10) : [];
      const next = new Map();
      for (const c of list) {
        const id = String((c && c.id) || "");
        if (other ? siteOfId(id) === ctx.tab.site : /^\d{1,20}$/.test(id)) next.set(id, String(c.login || "").toLowerCase().slice(0, 40));
      }
      ctx.tab.channels = next;
      if (other) ev.emit("site:channels", allChannels(siteTabs));
      else {
        ev.emit("tab:channels", ctx.tab);
        ev.emit("channels", allChannels());
      }
      return true;
    },
    { page: true }
  );

  // Диагностика фона: странице — только в dev-сборке (стенд проверки).
  handle("diag.bg", () => CPX.diag(), { page: CPX.dev });

  return {
    handle,
    dispatch,
    ev,
    /** Событие одной вкладке (вкладке сайта — только из SITE_EVENTS). */
    toTab(tab, e, d) {
      sendEvt(tab, e, d);
    },
    /** Событие всем вкладкам, где открыт канал channelId. */
    toChannel(channelId, e, d) {
      const id = String(channelId);
      for (const t of siteOfId(id) ? siteTabs : tabs) if (t.channels.has(id)) sendEvt(t, e, d);
    },
    /** Событие всем вкладкам (сайтам — только из SITE_EVENTS) и страницам расширения. */
    broadcast(e, d) {
      for (const t of tabs) post(t.port, { t: "evt", e, d });
      for (const t of siteTabs) sendEvt(t, e, d);
      for (const p of extPorts) post(p, { t: "evt", e, d });
    },
    /** Событие только вкладкам Twitch (мир страницы — доверие наполовину). */
    toTabs(e, d) {
      for (const t of tabs) post(t.port, { t: "evt", e, d });
    },
    /** Событие вкладкам одного сайта — своё, нарочно для них собранное (список PLUS на номерах площадки). */
    toSite(site, e, d) {
      for (const t of siteTabs) if (t.site === site) post(t.port, { t: "evt", e, d });
    },
    /** Событие только страницам расширения (popup, настройки, окно настроек во фрейме). */
    toExt(e, d) {
      for (const p of extPorts) post(p, { t: "evt", e, d });
    },
    get tabs() {
      return tabs;
    },
    get siteTabs() {
      return siteTabs;
    },
    pageTabs,
    channels: () => allChannels(tabs),
    siteChannels: () => allChannels(siteTabs),
    siteSetting,
    siteOfId,
  };
})();

CPX.diag.add("router", () => ({
  tabs: CPX.router.tabs.size,
  channels: [...CPX.router.channels().values()],
  siteTabs: [...CPX.router.siteTabs].map((t) => t.site + (t.frameId ? "@" + t.frameId : "")),
  siteChannels: [...CPX.router.siteChannels().keys()],
}));

// ── src/bg/15_sites.js ──
/* Фон: сайты кроме Twitch — Kick (15.11): наш мир страницы там, где человек разрешил сайт (решение владельца 15.11).
 * YouTube был здесь же с 18.11 — убран 19.11 (владелец: «стала не нужна»); устройство общее, таблица SITES — на будущее.
 *
 * ПОЧЕМУ ТАК. Права на эти сайты — НЕОБЯЗАТЕЛЬНЫЕ (optional_host_permissions): добавь их в обязательные — Chrome при
 * обновлении выключил бы расширение у всех до ручного подтверждения. Поэтому скриптов этих сайтов в манифесте нет: человек
 * включает сайт (окно значка или настройки, src/pages) → браузер спрашивает разрешение → здесь, по событию
 * permissions.onAdded, скрипты регистрируются на лету (scripting.registerContentScripts) и сразу ставятся в уже открытые
 * вкладки. Выключил (permissions.remove) или отозвал право в настройках браузера — снимаем регистрацию, а открытым вкладкам
 * сайта шлём "site.off": их мир снимает свои вставки и замолкает (связь не рвём: мост переподключался бы каждые 5 с).
 * Включено = выдано право; отдельной настройки нет — не разойдутся. Сверка при каждом запуске фона (sync): регистрация
 * могла не пережить обновление расширения или браузер.
 *   Kick: kick-iso.js + kick.css — мост и стили, kick.js — мир страницы, на всей kick.com.
 *
 * ПОДСКАЗКА «ВКЛЮЧИТЕ САЙТ» (решение владельца 15.11). Пока права нет, на страницах сайта значок расширения — с цветной
 * меткой (у Kick — зелёной): у Chromium правило declarativeContent
 * (SetIcon, прав на сайт не требует); у Firefox его нет — значок в адресной строке (page_action с show_matches в манифесте
 * Firefox, tools/build.py), после включения фон прячет его на вкладках, где наш мир уже работает. Нажатие — окно значка с
 * кнопкой «Включить на …».
 *
 * CPX.sites: .on(сайт) — включён ли (известно после первой сверки), .anyOn(), .ready (Promise), .ev "change"(сайт, on).
 * Метод для страниц расширения: sites.state → {kick: {on}}.
 */

CPX.sites = (() => {
  const log = CPX.log("sites");
  const ev = new CPX.Emitter();
  const SITES = {
    kick: {
      label: "Kick",
      origins: ["https://kick.com/*"],
      tabs: ["https://kick.com/*"],
      scripts: [
        { id: "cpx-kick-iso", matches: ["https://kick.com/*"], js: ["kick-iso.js"], css: ["kick.css"], runAt: "document_start", allFrames: false },
        { id: "cpx-kick-main", matches: ["https://kick.com/*"], js: ["kick.js"], runAt: "document_start", allFrames: false, world: "MAIN" },
      ],
      hint: { id: "cpx-kick-hint", icon: "kick", url: { hostEquals: "kick.com", schemes: ["https"] } },
    },
  };
  const ST = {};
  for (const k of Object.keys(SITES)) ST[k] = { on: false, known: false };
  let chain = Promise.resolve();
  let readyResolve;
  const ready = new Promise((r) => (readyResolve = r));

  async function granted(site) {
    try {
      return await chrome.permissions.contains({ origins: SITES[site].origins });
    } catch (_) {
      return false;
    }
  }

  // ── регистрация скриптов ────────────────────────────────────────────────────
  const sig = (s) => JSON.stringify([s.id, s.matches, s.js || [], s.css || [], s.runAt, !!s.allFrames, s.world || "ISOLATED"]);

  async function syncScripts(site, want) {
    const S = chrome.scripting;
    if (!S || !S.registerContentScripts) return;
    const list = SITES[site].scripts;
    const have = await S.getRegisteredContentScripts({ ids: list.map((s) => s.id) }).catch(() => []);
    if (!want) {
      if (have.length) await S.unregisterContentScripts({ ids: have.map((s) => s.id) });
      return;
    }
    if (have.length === list.length && list.every((s) => have.some((h) => sig(h) === sig(s)))) return;
    if (have.length) await S.unregisterContentScripts({ ids: have.map((s) => s.id) });
    try {
      await S.registerContentScripts(list.map((s) => Object.assign({ persistAcrossSessions: true }, s)));
    } catch (e) {
      // Старый Firefox без persistAcrossSessions — без него (регистрацию всё равно сверяем при каждом запуске фона).
      if (!/persistAcrossSessions/i.test(String(e && e.message))) throw e;
      await S.registerContentScripts(list);
    }
    log.info("скрипты", SITES[site].label, "зарегистрированы");
  }

  /** Только что включили: поставить мир в уже открытые вкладки сайта, чтобы не обновлять их руками. */
  async function injectOpen(site) {
    const S = chrome.scripting;
    const cfg = SITES[site];
    const open = await chrome.tabs.query({ url: cfg.tabs }).catch(() => []);
    const ours = new Set([...CPX.router.siteTabs].filter((t) => t.site === site).map((t) => t.tabId));
    const iso = cfg.scripts.find((s) => !s.world);
    const main = cfg.scripts.find((s) => s.world === "MAIN");
    for (const t of open) {
      if (typeof t.id !== "number" || ours.has(t.id) || t.discarded) continue;
      const target = { tabId: t.id };
      try {
        if (iso.css) await S.insertCSS({ target, files: iso.css });
        await S.executeScript({ target, files: iso.js });
        await S.executeScript({ target, files: main.js, world: "MAIN" });
      } catch (e) {
        log.warn("не встал во вкладку", cfg.label + ":", e && e.message);
      }
    }
  }

  // ── подсказка на вкладках сайта ─────────────────────────────────────────────
  async function iconData(name) {
    const out = {};
    for (const n of [16, 32]) {
      const r = await fetch(chrome.runtime.getURL("icons/" + name + "-" + n + ".png"));
      const bmp = await createImageBitmap(await r.blob());
      const c = new OffscreenCanvas(n, n);
      const g = c.getContext("2d");
      g.drawImage(bmp, 0, 0, n, n);
      out[n] = g.getImageData(0, 0, n, n);
    }
    return out;
  }

  async function syncHint(site, want) {
    const dc = chrome.declarativeContent;
    if (!dc || !dc.onPageChanged) return; // Firefox — значок в адресной строке (page_action), см. шапку
    const h = SITES[site].hint;
    const rules = await new Promise((r) => dc.onPageChanged.getRules([h.id], (x) => r(x || [])));
    if (want === rules.length > 0) return;
    await new Promise((r) => dc.onPageChanged.removeRules([h.id], () => r()));
    if (!want) return;
    const imageData = await iconData(h.icon);
    await new Promise((r) =>
      dc.onPageChanged.addRules([{ id: h.id, conditions: [new dc.PageStateMatcher({ pageUrl: h.url })], actions: [new dc.SetIcon({ imageData })] }], () => r())
    );
  }

  /** Firefox: включено — спрятать значок в адресной строке на вкладке, где наш мир этого сайта уже работает. */
  function hidePageAction(tab) {
    const pa = chrome.pageAction;
    if (!tab || !ST[tab.site] || !ST[tab.site].on || !pa || !pa.hide || typeof tab.tabId !== "number" || tab.tabId < 0) return;
    Promise.resolve(pa.hide(tab.tabId)).catch(() => {});
  }

  // ── сверка ──────────────────────────────────────────────────────────────────
  function sync(site, reason) {
    chain = chain
      .then(async () => {
        const st = ST[site];
        const g = await granted(site);
        const was = st.on;
        st.on = g;
        await syncScripts(site, g).catch((e) => CPX.report("sites:scripts:" + site, e));
        await syncHint(site, !g).catch((e) => CPX.report("sites:hint:" + site, e));
        if (!st.known || was !== g) {
          st.known = true;
          log.info(SITES[site].label, g ? "включён" : "выключен", "(" + reason + ")");
          ev.emit("change", site, g);
          const tabs = [...CPX.router.siteTabs].filter((t) => t.site === site);
          if (g && was === false && reason === "added") await injectOpen(site).catch((e) => CPX.report("sites:inject:" + site, e));
          if (!g) for (const t of tabs) CPX.router.toTab(t, "site.off", {});
          if (g) for (const t of tabs) hidePageAction(t);
        }
      })
      .catch((e) => CPX.report("sites:sync", e));
    return chain;
  }
  const syncAll = (reason) => Promise.all(Object.keys(SITES).map((s) => sync(s, reason)));

  /** Какие сайты задевает изменение прав (их адреса — среди наших). */
  const touched = (p) => Object.keys(SITES).filter((s) => !!(p && Array.isArray(p.origins) && p.origins.some((o) => SITES[s].origins.includes(o))));
  if (chrome.permissions && chrome.permissions.onAdded) {
    chrome.permissions.onAdded.addListener((p) => touched(p).forEach((s) => sync(s, "added")));
    chrome.permissions.onRemoved.addListener((p) => touched(p).forEach((s) => sync(s, "removed")));
  }
  CPX.router.ev.on("site:open", hidePageAction);
  CPX.router.ev.on("site:channels", () => {
    for (const t of CPX.router.siteTabs) hidePageAction(t);
  });
  // Уборка после YouTube (был в 2.3.1 до выдачи, убран 19.11): регистрация его скриптов и метка значка, если их успели
  // включить, — снять (иначе браузер помнил бы скрипты, файлов которых больше нет).
  if (chrome.scripting && chrome.scripting.unregisterContentScripts) chrome.scripting.unregisterContentScripts({ ids: ["cpx-yt-iso", "cpx-yt-main"] }).catch(() => {});
  if (chrome.declarativeContent && chrome.declarativeContent.onPageChanged) chrome.declarativeContent.onPageChanged.removeRules(["cpx-yt-hint"], () => void chrome.runtime.lastError);
  syncAll("start").finally(() => readyResolve());

  CPX.router.handle("sites.state", async () => {
    await ready;
    const out = {};
    for (const s of Object.keys(SITES)) out[s] = { on: await granted(s) };
    return out;
  });

  return {
    ev,
    ready,
    on: (site) => !!(ST[site] && ST[site].on),
    anyOn: () => Object.values(ST).some((x) => x.on),
    list: () => Object.keys(SITES),
  };
})();

CPX.diag.add("sites", () => {
  const out = {};
  for (const s of CPX.sites.list()) out[s] = { on: CPX.sites.on(s), tabs: [...CPX.router.siteTabs].filter((t) => t.site === s).length };
  return out;
});

// ── src/bg/20_settings.js ──
/* Фон: хранение настроек. Единственный, кто пишет в chrome.storage.local["settings"].
 *
 * Методы:
 *   settings.getAll            → { ключ: значение } (все, с умолчаниями)       [page]
 *   settings.set {changes}     → применить изменения (скрытые ключи — только ext) [page]
 *   settings.reset {keys?}     → вернуть умолчания (все или перечисленные)       [ext]
 * Событие всем: "settings.changed" { changes: {ключ: новое значение} }.
 */

CPX.settings = (() => {
  const log = CPX.log("settings");
  const STORAGE_KEY = "settings";
  let values = CPX.settingsDefaults();
  let loaded = null;

  function load() {
    if (!loaded) {
      loaded = chrome.storage.local.get(STORAGE_KEY).then((r) => {
        const saved = (r && r[STORAGE_KEY]) || {};
        const next = CPX.settingsDefaults();
        for (const k in saved) {
          const v = CPX.settingsCoerce(k, saved[k], true);
          if (v !== undefined) next[k] = v;
        }
        // Разовый перенос (ревью 05.10): с 04.10 способ модерации по умолчанию — «Ползунок», а он своих кнопок
        // не показывает. Кто настроил свои кнопки (mod.actions не как по умолчанию) и способ не выбирал, — на
        // «Кнопках», иначе они молча пропали бы из чата. Отметка mod.modeChosen — только один раз. Кто уже трогал
        // ползунок (его настройки в сохранённых), тот им пользуется — не переносим.
        const slid = ["mod.slider", "mod.sliderDel", "mod.sliderBan", "mod.sliderStep"].some((k) => k in saved);
        const moveMode = !next["mod.modeChosen"] && "mod.actions" in saved && !("mod.mode" in saved) && !next["mod.classic"] && !slid;
        if (moveMode) Object.assign(next, { "mod.mode": "buttons", "mod.modeChosen": true });
        // Разовый перенос (владелец 21.10, ведомый догон): уведомление над видео теперь по умолчанию выключено и следует
        // за скоростью догона (tieNotice). Кто сам выключал уведомление (было сохранено «выкл.»), — помним: «выкл.» стало
        // умолчанием и больше не хранилось бы. Кто сам поставил скорость выше 1,1×, — уведомление включено, как и было.
        // Порог и «Беречь запас» из описаний убраны — при записи уйдут сами (хранятся только известные настройки). Цель
        // вернулась тем же днём: прежний выбор, не стёртый такой записью, снова в силе (неизвестное значение — «авто»).
        const cuMove = !(Number(next["player.catchupMig"]) >= 1);
        if (cuMove) {
          if (saved["player.catchupNotice"] === false) next["player.catchupNoticeOff"] = true;
          else if (next["player.catchupMaxRate"] > CPX.CATCHUP_SAFE + 1e-9) Object.assign(next, { "player.catchupNotice": true, "player.catchupNoticeAuto": true });
          next["player.catchupMig"] = 1;
        }
        // Разовый перенос (владелец 30.10): «Отслеживаемые — по числу зрителей» (ui.sideSortViewers) убрана — она запирала
        // выбор способа сортировки и сортировала сама. Кто её включал — Twitch один раз ставит «Аудитория (по убыв.)»
        // (страница: ui.sideSortOnce) и подпись под заголовком остаётся скрытой, как была; дальше выбор свободен.
        const sortMove = !(Number(next["ui.sideSortMig"]) >= 1);
        if (sortMove) {
          if (saved["ui.sideSortViewers"] === true) Object.assign(next, { "ui.sideSortOnce": true, "ui.sideHideSortLabel": true });
          next["ui.sideSortMig"] = 1;
        }
        values = next;
        if (moveMode || cuMove || sortMove) persist().catch((e) => log.warn("перенос настроек не записан:", e && e.message));
        CPX.i18n.setLang(values["general.lang"]);
        return values;
      });
      // Сбой хранилища браузера не запоминаем (владелец 02.11): иначе до перезапуска фона падала бы любая запись
      // настроек, в том числе согласие, — следующий вызов прочитает заново.
      loaded.catch(() => {
        loaded = null;
      });
    }
    return loaded;
  }

  async function persist() {
    // Храним только отличия от умолчаний: новые умолчания в обновлениях доезжают сами.
    const defs = CPX.settingsDefaults();
    const diff = {};
    for (const k in values) if (JSON.stringify(values[k]) !== JSON.stringify(defs[k])) diff[k] = values[k];
    await chrome.storage.local.set({ [STORAGE_KEY]: diff });
  }

  /** Уведомление над видео следует за скоростью догона (владелец 21.10, src/common/49_settings_player.js): скорость
   *  подняли выше 1,1× — включить (если человек его ни разу не выключал сам), вернули 1,1× — выключить, если включали
   *  мы. Человек сам переключил уведомление — его выбор: выключил — запомнить навсегда (до общего сброса). */
  function tieNotice(applied) {
    const derived = {};
    if ("player.catchupNotice" in applied) {
      if (!applied["player.catchupNotice"]) derived["player.catchupNoticeOff"] = true;
      derived["player.catchupNoticeAuto"] = false;
    } else if ("player.catchupMaxRate" in applied) {
      const fast = applied["player.catchupMaxRate"] > CPX.CATCHUP_SAFE + 1e-9;
      if (fast && !values["player.catchupNotice"] && !values["player.catchupNoticeOff"])
        Object.assign(derived, { "player.catchupNotice": true, "player.catchupNoticeAuto": true });
      else if (!fast && values["player.catchupNotice"] && values["player.catchupNoticeAuto"])
        Object.assign(derived, { "player.catchupNotice": false, "player.catchupNoticeAuto": false });
    }
    for (const k in derived) {
      if (JSON.stringify(derived[k]) === JSON.stringify(values[k])) continue;
      values[k] = derived[k];
      applied[k] = derived[k];
    }
  }

  async function apply(changes, fromPage, reset) {
    await load();
    const applied = {};
    for (const k in changes || {}) {
      const d = CPX.settingsDefs.get(k);
      if (!d) continue;
      // Со страницы Twitch — только белый список pageWritable (там же работают чужие скрипты:
      // ловушка в своих кнопках модерации, выключение функций, огромные списки — ревью 01.10).
      // На стенде (dev) — как раньше: всё, кроме скрытых без pageWritable.
      if (fromPage && (d.extOnly || !(d.pageWritable || (CPX.dev && !d.hidden)))) continue;
      const v = CPX.settingsCoerce(k, changes[k]);
      if (v === undefined || JSON.stringify(v) === JSON.stringify(values[k])) continue;
      values[k] = v;
      applied[k] = v;
    }
    if (!reset) tieNotice(applied);
    if (Object.keys(applied).length) {
      await persist();
      if ("general.lang" in applied) CPX.i18n.setLang(applied["general.lang"]);
      CPX.router.broadcast("settings.changed", { changes: applied });
      ev.emit("changed", applied);
      log.debug("изменено", Object.keys(applied));
    }
    return applied;
  }

  const ev = new CPX.Emitter();

  // Вкладке сайта (Kick) — только нужные ей настройки (CPX.router.siteSetting; её мир видят скрипты сайта).
  const kickOnly = (o, ctx) => {
    if (!ctx.tab || ctx.tab.site === "twitch" || !o || typeof o !== "object") return o;
    const out = {};
    for (const k in o) if (CPX.router.siteSetting(k)) out[k] = o[k];
    return out;
  };
  CPX.router.handle("settings.getAll", async (p, ctx) => kickOnly(Object.assign({}, await load()), ctx), { page: true });
  CPX.router.handle("settings.set", (p, ctx) => apply(kickOnly(p.changes, ctx), ctx.from === "page"), { page: true });
  CPX.router.handle("settings.reset", async (p) => {
    await load();
    const defs = CPX.settingsDefaults();
    const keys = Array.isArray(p.keys) ? p.keys : Object.keys(defs);
    const ch = {};
    for (const k of keys) {
      const d = CPX.settingsDefs.get(k);
      if (d && (!d.hidden || d.reset)) ch[k] = defs[k]; // reset: скрытое, которое общий сброс всё же возвращает
    }
    return apply(ch, false, true);
  });

  return {
    load,
    get: (k) => values[k],
    set: (changes) => apply(changes, false),
    on: (fn) => ev.on("changed", fn),
  };
})();

// ── src/bg/22_consent.js ──
/* Фон: согласие ↔ разрешение Firefox на сбор данных (Firefox 140+; ревью 01.10, блокер AMO).
 *
 * Страница согласия включает general.consent только после permissions.request (src/pages/20_pages.js).
 * Здесь — обратная сторона: человек отозвал разрешение в настройках Firefox (about:addons →
 * «Разрешения») — снимаем и наше согласие; при запуске согласие есть, а разрешения нет (например,
 * дано до этой версии расширения) — тоже снимаем: без разрешения браузера о человеке не шлём ничего.
 * Chrome и старый Firefox (нет data_collection в permissions.getAll) — ничего не делаем.
 */

(() => {
  const log = CPX.log("consent");

  function off(why) {
    if (!CPX.settings.get("general.consent")) return;
    log.info("разрешение Firefox на сбор данных снято — согласие выключено (" + why + ")");
    CPX.settings.set({ "general.consent": false });
  }

  // Слушатель — синхронно при загрузке фона (иначе проснувшийся по событию фон его пропустит).
  try {
    chrome.permissions.onRemoved.addListener((p) => {
      if (p && Array.isArray(p.data_collection) && p.data_collection.length) CPX.settings.load().then(() => off("отозвано"));
    });
  } catch (_) {
    /* нет permissions API */
  }

  // Только страницам расширения (без {page:true}): окно настроек во фрейме не может само открыть
  // вкладку и снять разрешение Firefox — у него нет chrome.tabs/permissions (проверка 01.10).
  CPX.router.handle("consent.openWelcome", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("pages/welcome.html") });
    return true;
  });
  CPX.router.handle("consent.revoke", async () => {
    try {
      const all = await chrome.permissions.getAll();
      if (all && Array.isArray(all.data_collection)) await chrome.permissions.remove({ data_collection: CPX.DATA_COLLECTION });
    } catch (_) {
      /* не Firefox 140+ */
    }
    await CPX.settings.set({ "general.consent": false });
    return true;
  });

  CPX.boot.add(
    "consent",
    async () => {
      let all = null;
      try {
        all = await chrome.permissions.getAll();
      } catch (_) {
        return;
      }
      if (!all || !Array.isArray(all.data_collection)) return; // не Firefox 140+
      await CPX.settings.load();
      const have = new Set(all.data_collection);
      if (CPX.settings.get("general.consent") && !CPX.DATA_COLLECTION.every((k) => have.has(k))) off("нет разрешения");
    },
    22
  );
})();

// ── src/bg/23_update.js ──
/* Фон: вышло обновление расширения, а вкладки Twitch открыты (ревью 01.10).
 *
 * Chrome ставит обновление, только когда фон уснёт, а пульс вкладок Twitch (и наш сокет) не дают
 * ему уснуть: у того, кто держит Twitch открытым сутками, правка доехала бы лишь после закрытия всех
 * вкладок Twitch. Поэтому: runtime.onUpdateAvailable → вкладкам событие "ext.update" (тост с кнопкой
 * «Обновить», src/main/93_update_notice.js); по кнопке — вкладкам "ext.reloadSoon" (перезагрузятся
 * сами через 1,5 с, уже с новой версией), фон перезапускает расширение — обновление ставится.
 * Вкладок Twitch нет — ничего не делаем: браузер поставит обновление сам, когда фон уснёт.
 *   ext.update        → { version } | null   [page]
 *   ext.applyUpdate   → bool (обновления нет — false)   [page]
 */

(() => {
  const log = CPX.log("update");
  let ready = null; // версия, которая ждёт установки

  // Слушатель — синхронно при загрузке фона (иначе проснувшийся по событию фон его пропустит).
  // ⚠️Только Chrome: в Firefox сама подписка на событие откладывает установку обновления до
  // перезапуска расширения (MDN), а без неё он ставит его сразу (проверка 01.10).
  const chromium = chrome.runtime.getURL("").startsWith("chrome-extension://");
  try {
    if (chromium) chrome.runtime.onUpdateAvailable.addListener((d) => {
      ready = String((d && d.version) || "").slice(0, 32) || "?";
      log.info("вышло обновление", ready);
      CPX.router.toTabs("ext.update", { version: ready });
    });
  } catch (_) {
    /* браузер не сообщает об обновлениях */
  }

  CPX.router.handle("ext.update", () => (ready ? { version: ready } : null), { page: true });

  // Окно «Обнаружены конфликты» (main/93_conflicts.js, владелец 23.10): страница расширений браузера. Chromium (Chrome,
  // Edge, Brave, Opera, Яндекс) открывает chrome://extensions — у каждого это его страница расширений. Firefox и Zen
  // расширениям about:addons не открывают — false: страница покажет сочетание клавиш.
  CPX.router.handle(
    "ext.openExtensions",
    async () => {
      try {
        await chrome.tabs.create({ url: chromium ? "chrome://extensions/" : "about:addons" });
        return true;
      } catch (_) {
        return false;
      }
    },
    { page: true }
  );

  CPX.router.handle(
    "ext.applyUpdate",
    () => {
      if (!ready) return false;
      CPX.router.toTabs("ext.reloadSoon", {});
      setTimeout(() => chrome.runtime.reload(), 400);
      return true;
    },
    { page: true }
  );
})();

// ── src/bg/24_sound.js ──
/* Свой звук упоминаний (раздел «Упоминания», src/pages/33_mentions.js; играет чат — 46_list_mentions через CPX.sound).
 * Файл человека — в chrome.storage.local («cpx.mentionSound»: {name, mime, b64}), не в настройках: настройки ходят во
 * все вкладки при каждой смене, а звук нужен только при игре. В настройке chat.mentionSoundFile — метка «<время>/<имя>»:
 * по её смене чат перечитывает файл; "" — стёклышко. Общий сброс настроек метку обнуляет — тогда и файл стираем.
 *   sound.get   (и страница Twitch) → {name, mime, b64} | null;
 *   sound.set   (только страницы расширения) {name, mime, b64} → {ok, key} | {ok:false, reason:"big"|"bad"};
 *   sound.clear (только страницы расширения).
 * Звук — не секрет: его отдаём и странице Twitch.
 */

(() => {
  const KEY = "cpx.mentionSound";
  const MAX = 512 * 1024; // байт самого файла (его же проверяет страница настроек)
  const B64 = /^[A-Za-z0-9+/]+={0,2}$/;

  CPX.router.handle("sound.get", async () => (await chrome.storage.local.get(KEY))[KEY] || null, { page: true });

  CPX.router.handle("sound.set", async (p) => {
    const b64 = typeof p.b64 === "string" ? p.b64 : "";
    if (b64.length > Math.ceil(MAX / 3) * 4) return { ok: false, reason: "big" };
    if (!b64 || !B64.test(b64)) return { ok: false, reason: "bad" };
    const name = String(p.name || "").replace(/[\u0000-\u001f\u007f/\\]/g, "").trim().slice(0, 120) || "sound";
    const mime = /^audio\/[\w.+-]{1,60}$/i.test(String(p.mime || "")) ? String(p.mime) : "";
    await chrome.storage.local.set({ [KEY]: { name, mime, b64 } });
    const key = Date.now().toString(36) + "/" + name;
    await CPX.settings.set({ "chat.mentionSoundFile": key });
    return { ok: true, key };
  });

  CPX.router.handle("sound.clear", async () => {
    await CPX.settings.set({ "chat.mentionSoundFile": "" });
    await chrome.storage.local.remove(KEY);
    return { ok: true };
  });

  // Метку обнулили (общий сброс настроек) — файл больше не нужен.
  CPX.settings.on((ch) => {
    if (ch && ch["chat.mentionSoundFile"] === "") chrome.storage.local.remove(KEY).catch(() => {});
  });
})();

// ── src/bg/29_clock.js ──
/* Фон: часы серверов (common/06_clock.js). Замеры — заголовок Date ответов нашего сервера и
 * gql.twitch.tv (CPX.clock.fromResponse зовёт 30_net на каждый ответ; точность — секунда, ответ из
 * кэша со старой датой оценку не испортит: берётся наибольшее). Оценку — вкладкам: вызов "clock.get"
 * → {off, own} и событие "clock" при заметной смене; в журнал — «компьютер отстаёт/спешит от серверов
 * на N с» (следующую жалобу на сбитые часы видно сразу).
 */

(() => {
  const log = CPX.log("clock");
  const HOSTS = /^https:\/\/(?:[a-z0-9-]+\.)*(?:eblo\.id|rish098\.xyz)\/|^https:\/\/gql\.twitch\.tv\//i;
  let logged = 0;

  /** Ответ fetch только что пришёл (заголовки получены) — замер по его Date. */
  CPX.clock.fromResponse = (url, res) => {
    if (!res || !res.headers || !HOSTS.test(String(url || ""))) return;
    const d = Date.parse(res.headers.get("Date") || "");
    if (d > 0) CPX.clock.sample(d, Date.now());
  };

  const reply = () => {
    const s = CPX.clock.state();
    return { off: s.own ? CPX.clock.offset() : null };
  };

  CPX.router.handle("clock.get", () => reply(), { page: true });

  CPX.clock.on(
    CPX.guard("clock:change", (o) => {
      CPX.router.broadcast("clock", reply());
      if (Math.abs(o) >= 2000 && Math.abs(o - logged) >= 1000) {
        logged = o;
        log.info("часы: компьютер " + (o > 0 ? "отстаёт от серверов" : "спешит относительно серверов") + " на " + (Math.abs(o) / 1000).toFixed(1) + " с");
      }
    })
  );

  CPX.diag.add("clock", () => CPX.clock.state());
})();

// ── src/bg/30_net.js ──
/* Фон: сеть для смайликов и косметики — одна точка на все запросы к сторонним службам.
 *
 *   CPX.net.fetchJSON(url, opts) → Promise(данные | null)
 *     opts: timeout (мс, по умолчанию 15000; ⚠️срок ЗАСТОЯ — до заголовков и между кусками тела; весь запрос — не дольше 90 с),
 *           method, body (объект → JSON), headers, retries (сколько повторов при сбое, 1),
 *           missingOk (404 → {} — «у канала нет смайликов», а не сбой),
 *           etag (true — помнить ETag и слать If-None-Match; 304 → прежние данные),
 *           full (true — вернуть {ok, status, data, notModified}).
 *   null — сбой (сеть, тайм-аут, код ошибки, битый JSON): вызывающий повторит позже.
 *
 *   CPX.net.route(url) — адрес с учётом МАРШРУТА для 7TV (7tv.io, cdn.7tv.app, events.7tv.io).
 *   CPX.net.setRoute(fn) — крючок для зеркала PLUS (этап 5): fn(url) → url | {url, headers}.
 *     Пока крючка нет — всё идёт к 7TV напрямую. Модули, которые держат живые соединения
 *     с 7TV, подписываются на смену маршрута: CPX.net.onRoute(fn).
 *   CPX.net.setTransport(fn) — зеркало PLUS (52_mirror_fetch): запросы к 7TV идут через
 *     fn(url, init, {timeout}) → Promise<Response> (сама решает «прямо → зеркало» и сроки попыток).
 *   CPX.net.stats() — счётчики запросов (проверка нагрузки: сколько и куда ходим).
 *   CPX.net.json(url, opts) → данные; сбой — исключение {netFail, status, retryAfter} (для пауз ниже). Повторов нет.
 *   new CPX.net.Backoff() — пауза после сбоев по правилам «Поток запросов» (основной чат, 18.11,
 *     chatterino7-src/docs/plus/ПОТОК-ЗАПРОСОВ-ПРАВИЛА-ДЛЯ-ПРОГРАММ-1118.md): сбой (сеть, 5xx, 429, отказ зеркала) — 5 с,
 *     дальше вдвое до 5 минут; «нельзя» (4xx, кроме 408/425/429) — сразу 5 минут; Retry-After — нижняя граница;
 *     ±20% разброса, чтобы копии не ходили строем. Пока пауза — запрос не шлём; по её концу — ОДНА проба.
 *     .ready() · .left() · .ok() · .fail(ответ | исключение json | null) → пауза, мс · .n — сбоев подряд.
 *
 * ⚠️CORS. Запросы идут из фона с Origin chrome-extension://<id>; 7TV, BTTV, FFZ, Chatterino,
 * Homies и FFZ:AP такие запросы разрешают (проверено 28.09.2026), отдельные host_permissions
 * не нужны. НО заголовок If-None-Match не из «простых» — с ним браузер сначала шлёт
 * предварительный запрос OPTIONS, а сторонние службы его не везде пропускают. Поэтому etag:true —
 * только для нашего сервера (на него есть host_permissions — CORS не действует); для
 * остальных кэш держат модули (в памяти + chrome.storage) и HTTP-кэш браузера.
 *
 * Одинаковые GET-запросы, идущие одновременно, сливаются в один (два открытых канала в двух
 * вкладках не качают набор дважды).
 */

CPX.net = (() => {
  const log = CPX.log("net");
  const STV_HOSTS = /^https?:\/\/(?:[a-z0-9-]+\.)*(?:7tv\.io|7tv\.app)(?:[/:?#]|$)|^wss?:\/\/(?:[a-z0-9-]+\.)*7tv\.io(?:[/:?#]|$)/i;
  const etags = new Map(); // url → { etag, data }
  const inflight = new Map(); // url → Promise (только GET без тела)
  const routeEv = new CPX.Emitter();
  let routeFn = null;
  let transportFn = null;
  const st = { total: 0, fail: 0, notModified: 0, byHost: Object.create(null), recent: [] };

  function isStv(url) {
    return STV_HOSTS.test(String(url || ""));
  }

  /** Адрес (и доп. заголовки) с учётом маршрута. Не 7TV — как есть. */
  function routeFull(url) {
    if (!routeFn || !isStv(url)) return { url, headers: null };
    try {
      const r = routeFn(url);
      if (!r) return { url, headers: null };
      if (typeof r === "string") return { url: r, headers: null };
      return { url: r.url || url, headers: r.headers || null };
    } catch (e) {
      CPX.report("net:route", e);
      return { url, headers: null };
    }
  }

  function count(url, status, ms) {
    st.total++;
    let host = "?";
    try {
      host = new URL(url).hostname;
    } catch (_) {
      /* мимо */
    }
    st.byHost[host] = (st.byHost[host] || 0) + 1;
    st.recent.push({ t: Date.now(), url: url.length > 160 ? url.slice(0, 160) + "…" : url, status, ms });
    if (st.recent.length > 200) st.recent.shift();
  }

  // Общий потолок одного запроса, если тело идёт медленно, но идёт (срок o.timeout — на застой).
  const BODY_CAP = 90000;

  /** JSON из ответа, читая тело кусками: onChunk() на каждый кусок (продлевает срок застоя). */
  async function readJSON(res, onChunk) {
    if (!res.body || typeof res.body.getReader !== "function") return res.json();
    const reader = res.body.getReader();
    const parts = [];
    let n = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
      n += value.length;
      onChunk();
    }
    const buf = new Uint8Array(n);
    let off = 0;
    for (const x of parts) {
      buf.set(x, off);
      off += x.length;
    }
    return JSON.parse(new TextDecoder().decode(buf));
  }

  async function once(url, o) {
    const r = routeFull(url);
    const headers = Object.assign({}, o.headers || {}, r.headers || {});
    const init = { method: o.method || "GET", headers };
    if (o.body !== undefined) {
      init.body = typeof o.body === "string" ? o.body : JSON.stringify(o.body);
      headers["Content-Type"] = "application/json";
    }
    const cached = o.etag ? etags.get(url) : null;
    if (cached && cached.etag) headers["If-None-Match"] = cached.etag;
    const ctl = new AbortController();
    init.signal = ctl.signal;
    const tmo = o.timeout || 15000;
    let timer = setTimeout(() => ctl.abort(), tmo);
    const capT = setTimeout(() => ctl.abort(), Math.max(BODY_CAP, tmo * 2));
    const t0 = Date.now();
    let status = 0;
    try {
      const res = transportFn && isStv(url) ? await transportFn(r.url, init, { timeout: o.timeout || 15000 }) : await fetch(r.url, init);
      CPX.clock.fromResponse(r.url, res); // часы серверов: Date ответа нашего сервера (29_clock)
      status = res.status;
      if (status === 304 && cached) {
        st.notModified++;
        return { ok: true, status, data: cached.data, notModified: true };
      }
      if (status === 404 && o.missingOk) return { ok: true, status, data: {}, notModified: false };
      if (!res.ok) {
        const ra = Number(res.headers.get("Retry-After"));
        return { ok: false, status, retryAfter: Number.isFinite(ra) && ra > 0 ? ra * 1000 : 0 };
      }
      // Тело — потоком: срок tmo — на ЗАСТОЙ (каждый пришедший кусок его продлевает), общий потолок —
      // capT. «Замёрзшее» после первых килобайт скачивание (у зрителей из РФ с 7TV бывает) по-прежнему
      // обрывается, а медленное, но живое — докачивается: раньше срок был на весь ответ, и набор 7TV
      // крупного канала (~250 КБ) на связи ~100 кбит/с не докачивался никогда (ревью 01.10).
      const data = await readJSON(res, () => {
        clearTimeout(timer);
        timer = setTimeout(() => ctl.abort(), tmo);
      });
      if (o.etag) {
        const tag = res.headers.get("ETag");
        if (tag) etags.set(url, { etag: tag, data });
      }
      return { ok: true, status, data, notModified: false };
    } catch (e) {
      return { ok: false, status, error: String((e && e.name === "AbortError" ? "тайм-аут" : e && e.message) || e) };
    } finally {
      clearTimeout(timer);
      clearTimeout(capT);
      count(r.url, status, Date.now() - t0);
    }
  }

  async function run(url, o) {
    const tries = 1 + Math.max(0, o.retries == null ? 1 : o.retries);
    let last = null;
    for (let i = 0; i < tries; i++) {
      last = await once(url, o);
      if (last.ok) return last;
      // 4xx (кроме 429 и 408) — повторять бессмысленно: «нет такого» или запрещено.
      if (last.status >= 400 && last.status < 500 && last.status !== 429 && last.status !== 408) break;
      if (i + 1 < tries) {
        const pause = last.retryAfter || (o.retryDelay || 2000) * (i + 1) * (0.75 + Math.random() * 0.5);
        await CPX.sleep(Math.min(pause, 60000));
      }
    }
    st.fail++;
    log.debug("сбой запроса", url.slice(0, 160), last && (last.status || last.error));
    return last || { ok: false, status: 0 };
  }

  function fetchJSON(url, opts) {
    const o = opts || {};
    const key = !o.method || o.method === "GET" ? url + (o.missingOk ? "|m" : "") : null;
    let p = key && inflight.get(key);
    if (!p) {
      p = run(url, o);
      if (key) {
        inflight.set(key, p);
        p.finally(() => inflight.delete(key));
      }
    }
    return p.then((r) => (o.full ? r : r.ok ? r.data : null));
  }

  /** Как fetchJSON, но без повторов и со сбоем-исключением: вызывающий ставит свою паузу (Backoff). */
  async function json(url, opts) {
    const r = await fetchJSON(url, Object.assign({ retries: 0 }, opts, { full: true }));
    if (r.ok) return r.data;
    throw Object.assign(new Error("сбой " + (r.status || r.error || "сети")), { netFail: true, quiet: true, status: r.status || 0, retryAfter: r.retryAfter || 0 });
  }

  class Backoff {
    constructor(min, max) {
      this.min = min || 5000;
      this.max = max || 300000;
      this.n = 0;
      this.until = 0;
    }
    ready(now) {
      return (now || Date.now()) >= this.until;
    }
    left() {
      return Math.max(0, this.until - Date.now());
    }
    ok() {
      this.n = 0;
      this.until = 0;
    }
    fail(r) {
      const s = (r && r.status) || 0;
      const refused = s >= 400 && s < 500 && s !== 408 && s !== 425 && s !== 429;
      this.n++;
      let w = refused ? this.max : Math.min(this.max, this.min * Math.pow(2, this.n - 1));
      w = Math.max(w * (0.8 + Math.random() * 0.4), (r && r.retryAfter) || 0);
      this.until = Date.now() + w;
      return w;
    }
  }

  CPX.diag.add("net", () => ({ total: st.total, fail: st.fail, notModified: st.notModified, byHost: Object.assign({}, st.byHost) }));

  return {
    fetchJSON,
    json,
    Backoff,
    isStv,
    route: (url) => routeFull(url).url,
    routeFull,
    setRoute(fn) {
      routeFn = typeof fn === "function" ? fn : null;
      routeEv.emit("change");
    },
    onRoute: (fn) => routeEv.on("change", fn),
    setTransport(fn) {
      transportFn = typeof fn === "function" ? fn : null;
    },
    stats: () => ({ total: st.total, fail: st.fail, notModified: st.notModified, byHost: Object.assign({}, st.byHost), recent: st.recent.slice() }),
  };
})();

// ── src/bg/31_emote_parse.js ──
/* Фон: разбор ответов 7TV / BTTV / FFZ в единую КОМПАКТНУЮ запись смайлика.
 *
 * Запись (так она хранится в памяти фона, в chrome.storage и уходит странице):
 *   { n: имя, p: "7tv"|"bttv"|"ffz", i: id, w, h: размер 1x в px (0 — неизвестен),
 *     a: 1 — анимированный, z: 1 — нулевой ширины (ложится на предыдущий),
 *     o: автор/владелец (для подсказки), b: исходное имя 7TV, если в наборе переименован,
 *     x: наибольший масштаб картинки 7TV (4 — есть 4x), hu: нестандартный адрес 7TV,
 *     u: {1,2,4} адреса картинок FFZ, m: modifier_flags FFZ (у эффектов-модификаторов),
 *     mod: 1 — код-модификатор BTTV (w! h! …) }
 * Адреса 7TV и BTTV строятся из id на странице — так записи в разы меньше (набор большого
 * канала 7TV — 2,3 МБ в ответе API, у нас ≈100 КБ).
 *
 * Правила — как в экранном чате OBS (overlay/10_data.js, НАШ код) и клиенте:
 *  • zero-width 7TV: флаг 1 у записи набора ИЛИ флаг 256 у самого смайлика;
 *  • BTTV zero-width — по списку имён (у BTTV флага нет), как у BTTV и клиента;
 *  • FFZ: если есть анимированная версия — берём её.
 */

CPX.emoteParse = (() => {
  const STV_CDN = "//cdn.7tv.app/emote/";
  const BTTV_ZW = new Set(["SoSnowy", "IceCold", "SantaHat", "TopHat", "ReinDeer", "CandyCane", "cvMask", "cvHazmat"]);

  const str = (v, max = 100) => (typeof v === "string" ? v.slice(0, max) : v == null ? "" : String(v).slice(0, max));
  const int = (v) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n > 0 && n < 4096 ? n : 0;
  };

  /** Запись набора 7TV ({id, name, flags, data:{…}}) → запись или null (удалён в 7TV / без картинки /
   *  не разрешён). o.personal — набор из личных выдач человека: там только смайлики, одобренные 7TV
   *  для личного использования (state PERSONAL). Как клиент (SeventvEmotes.cpp checkEmoteVisibility):
   *  смайлик с пометкой 7TV «запрещено на Twitch» (флаг 1<<24) не показывается нигде. */
  function stv(e, o) {
    if (!e || typeof e !== "object") return null;
    const data = e.data;
    if (!data || typeof data !== "object") return null;
    if ((Number(data.flags) || 0) & (1 << 24)) return null;
    if (o && o.personal === true && !(Array.isArray(data.state) && data.state.includes("PERSONAL"))) return null;
    const host = data.host || {};
    const id = str(data.id || e.id, 40);
    const name = str(e.name || data.name);
    if (!id || !name || !host.url || !Array.isArray(host.files) || !host.files.length) return null;
    const webp = host.files.filter((f) => f && f.format === "WEBP");
    const has = (n) => webp.some((f) => f.name === n);
    const one = webp.find((f) => f.name === "1x.webp") || {};
    const rec = { n: name, p: "7tv", i: id, w: int(one.width), h: int(one.height) };
    if (data.animated) rec.a = 1;
    if (((e.flags || 0) & 1) === 1 || ((data.flags || 0) & 256) === 256) rec.z = 1;
    const owner = data.owner && (data.owner.display_name || data.owner.username);
    if (owner) rec.o = str(owner, 40);
    if (data.name && data.name !== name) rec.b = str(data.name);
    rec.x = has("4x.webp") ? 4 : has("3x.webp") ? 3 : has("2x.webp") ? 2 : 1;
    if (rec.x === 4) delete rec.x;
    const url = String(host.url);
    if (url !== STV_CDN + id) rec.hu = url.startsWith("//") ? "https:" + url : url;
    return rec;
  }

  /** Смайлик BTTV (глобальный/канала/общий). shared — чужой смайлик в наборе канала. */
  function bttv(e, shared) {
    if (!e || typeof e !== "object" || !e.id || !e.code) return null;
    const rec = { n: str(e.code), p: "bttv", i: str(e.id, 40), w: int(e.width), h: int(e.height) };
    if (e.animated) rec.a = 1;
    if (BTTV_ZW.has(rec.n)) rec.z = 1;
    if (e.modifier) rec.mod = 1;
    if (shared && e.user) rec.o = str(e.user.displayName || e.user.name, 40);
    return rec;
  }

  /** Смайлик FFZ. У модификатора (эффекта) — m: modifier_flags. */
  function ffz(e) {
    if (!e || typeof e !== "object" || e.id == null || !e.name) return null;
    const pick = (src) => {
      if (!src || typeof src !== "object") return null;
      const one = src["1"];
      if (!one) return null;
      const fix = (u) => (typeof u === "string" && u.startsWith("//") ? "https:" + u : u);
      return { 1: fix(one), 2: fix(src["2"] || one), 4: fix(src["4"] || src["2"] || one) };
    };
    const anim = pick(e.animated);
    const urls = anim || pick(e.urls);
    if (!urls) return null;
    const rec = { n: str(e.name), p: "ffz", i: str(e.id, 20), w: int(e.width), h: int(e.height), u: urls };
    if (anim) rec.a = 1;
    const owner = e.owner && (e.owner.display_name || e.owner.name);
    if (owner) rec.o = str(owner, 40);
    if (e.modifier) rec.m = Number(e.modifier_flags) || 0;
    return rec;
  }

  /** Все смайлики из ответа FFZ (set/global или room): модификаторы — отдельно.
   * defaults — у set/global: обычные смайлики берём только из наборов default_sets (как клиент,
   * FfzEmotes.cpp): остальные наборы ответа — для избранных людей, не для всех. Эффекты-
   * модификаторы — из всех наборов (платные лежат как раз в «не общем» наборе). */
  function ffzSets(d, defaults) {
    const list = [];
    const mods = [];
    const only = Array.isArray(defaults) ? new Set(defaults.map(String)) : null;
    for (const sid of Object.keys((d && d.sets) || {})) {
      for (const e of (d.sets[sid] && d.sets[sid].emoticons) || []) {
        const r = ffz(e);
        if (!r) continue;
        // Эффект FFZ (модификатор с флагами) — не смайлик, а указание для предыдущего.
        // Модификатор без флагов (наложение) — обычный смайлик.
        if (r.m) mods.push(r);
        else if (!only || only.has(sid)) {
          delete r.m;
          list.push(r);
        }
      }
    }
    return { list, mods };
  }

  /** Короткий отпечаток строки (FNV-1a, 32 бита) — «изменилось ли содержимое». */
  function hash(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(36);
  }

  /** Отпечаток содержимого (записи, Map записей, что угодно сериализуемое). Записи собираются
   * разбором в одном и том же порядке полей — одинаковое содержимое даёт одинаковый отпечаток. */
  const sig = (x) => hash(JSON.stringify(x instanceof Map ? [...x.values()] : x === undefined ? null : x) || "");

  /* Правки набора 7TV (канала или личного) — как клиент и экранный чат OBS:
   *  • правки одной транзакции приходят ОДНИМ событием; переименование (тот же id, другое имя)
   *    и подмена (то же имя, другой смайлик) — парой «убрали + добавили»;
   *  • порядок: снятия и правки, потом вставки (иначе снятие сносило только что вставленное);
   *  • data: null — смайлик удалён в самом 7TV;
   *  • правка может прийти неполной (только новое имя) — картинка прежняя.
   * Меняет mp (Map имя → запись) на месте. reload — собрать правку из события нельзя, набор
   * надо перечитать. ev — что произошло, для строки в чате (как клиент, TwitchChannel.cpp
   * add/update/removeSeventvEmote): {t:"add"|"del", e} · {t:"ren"|"rep", from: прежнее имя, e};
   * e — запись (без картинки — только {n}). Повтор того же события строк не даёт: снимать уже
   * нечего, а вставка уже стоящего — не новость. */
  function applyStvChanges(mp, body) {
    const res = { changed: false, reload: false, ev: [] };
    const list = (arr, k) => (Array.isArray(arr) ? arr : []).filter((x) => x && x.key === "emotes" && x[k]).map((x) => x[k]);
    const pushed = list(body.pushed, "value");
    const pulled = list(body.pulled, "old_value");
    const used = [];
    const full = (v) => v.data && v.data.host && (v.data.host.files || []).length > 0;
    function take(o) {
      const cur = o.name ? mp.get(o.name) : null;
      if (cur && (!o.id || cur.i === o.id)) {
        mp.delete(o.name);
        res.changed = true;
        return cur;
      }
      if (o.id) {
        for (const [n, e] of mp) {
          if (e.i === o.id) {
            mp.delete(n);
            res.changed = true;
            return e;
          }
        }
      }
      return null;
    }
    function put(v, prev) {
      let e = full(v) ? stv(v) : null;
      if (!e && prev && v.name && (!v.id || v.id === prev.i)) e = Object.assign({}, prev, { n: str(v.name) });
      if (!e) {
        if (v.data !== null) res.reload = true;
        return null;
      }
      mp.set(e.n, e);
      res.changed = true;
      return e;
    }
    const named = (e, name) => e || { n: str(name) };
    // Сняли prev и поставили на его место v (запись e): тот же смайлик — переименование, другой — подмена.
    function note(prev, o, v, e) {
      const to = (e && e.n) || str(v.name);
      if (!prev || !to) return;
      const from = prev.n || str(o.name);
      const same = !!(v.id && v.id === prev.i);
      if (same && from === to) return; // сменились только флаги (нулевая ширина) — не новость
      res.ev.push({ t: same ? "ren" : "rep", from, e: named(e, to) });
    }
    for (const o of pulled) {
      let i = pushed.findIndex((p, j) => !used[j] && p.id && p.id === o.id);
      if (i < 0) i = pushed.findIndex((p, j) => !used[j] && p.name && p.name === o.name);
      const prev = take(o);
      if (i < 0) {
        if (prev) res.ev.push({ t: "del", e: prev });
        continue;
      }
      used[i] = true;
      note(prev, o, pushed[i], put(pushed[i], prev));
    }
    for (const u of Array.isArray(body.updated) ? body.updated : []) {
      if (!u) continue;
      if (u.key === "origins") {
        res.reload = true;
        continue;
      }
      if (u.key !== "emotes") continue;
      const o = u.old_value || {};
      const v = u.value || {};
      const nv = Object.assign({}, v, { id: v.id || o.id, name: v.name || o.name });
      const prev = take(o);
      note(prev, o, nv, put(nv, prev && nv.id === prev.i ? prev : null));
    }
    pushed.forEach((p, j) => {
      if (used[j]) return;
      const had = p.name ? mp.get(p.name) : null;
      const e = put(p, null);
      if (had && e) {
        if (had.i !== e.i) res.ev.push({ t: "rep", from: had.n, e }); // имя заняли другим смайликом
        return;
      }
      if (e || (p.data !== null && p.name)) res.ev.push({ t: "add", e: named(e, p.name) });
    });
    return res;
  }

  /** Map имя → запись из массива записей (позже записанный перекрывает). */
  function toMap(list) {
    const m = new Map();
    for (const r of list || []) if (r && r.n) m.set(r.n, r);
    return m;
  }

  return { stv, bttv, ffz, ffzSets, applyStvChanges, toMap, hash, sig, BTTV_ZW };
})();

// ── src/bg/32_emotes.js ──
/* Фон: наборы смайликов 7TV / BTTV / FFZ — глобальные и по каналам. Один набор на все вкладки.
 *
 * Методы для страницы ({page:true}):
 *   emotes.global              → { v, stv:[], bttv:[], ffz:[], ffzMods:[], ffzPaid:[логины], ready }
 *   emotes.channel {id, login} → { id, login, v, stv, bttv, ffz, ffzMods, stvSetId, ffzBadges, ready }
 *                                 (вкладка ПОДПИСЫВАЕТСЯ на правки этого канала — в том числе
 *                                 канала-партнёра общего чата)
 *   emotes.keep {ids:[…]}      → вкладка оставляет подписку только на эти каналы (ушла с канала,
 *                                 партнёр общего чата замолчал) — остальные снимаются
 * События вкладкам: "emotes.global" (всем), "emotes.channel" (подписанным на канал) — полные
 * данные после изменения (живая правка, обновление по таймеру, включили сервис).
 * Записи смайликов — в формате CPX.emoteParse (компактные).
 * v — ОТПЕЧАТОК содержимого (а не счётчик): плановая перезагрузка того же набора и
 * проснувшийся фон дают тот же v — страница не перерисовывает строки впустую.
 *
 * Сервисы не ждут друг друга: каждый применяется и рассылается, как только ответил (у
 * зрителей из РФ 7TV бывает «висит» до тайм-аута — BTTV и FFZ не должны ждать его). Метод
 * отвечает странице после ПЕРВОГО ответившего сервиса, остальное досылается событием
 * (близкие по времени ответы сливаются в одно событие — 250 мс: 7TV/BTTV/FFZ обычно отвечают
 * с разницей 100–250 мс: страница перерисует строки не трижды, а дважды — ответ метода + событие).
 *
 * Для других модулей фона: CPX.emoteStore.channel(id), .wanted() (открытые каналы + каналы,
 * на которые подписаны вкладки — для живых сокетов), .onStvDispatch(type, body),
 * .bttvLive(channelId, name, data), .ffzRoom(id), .ffzPaid(login),
 * .ev ("stvSets" — сменились наборы 7TV каналов; "subs" — сменились подписки вкладок;
 * "ffzRoom" — сменились бейджи FFZ канала).
 *
 * Нагрузка (решено так):
 *  • глобальные — раз в час; наборы канала 7TV и BTTV — раз в час (правки приходят живьём),
 *    FFZ — раз в 15 минут (живых правок у нас нет); обновляются только нужные каналы;
 *  • при сбое — пауза по правилам «Поток запросов» (основной чат 18.11; CPX.net.Backoff): 5 с, дальше вдвое до 5 минут,
 *    отказ 4xx — сразу 5 минут, Retry-After (зеркало: upstream) — нижняя граница; за паузу — одна проба. Паузу НЕ
 *    обходят другие поводы перечитать (вкладка спросила, сменились каналы, такт, переподключение сокета живых правок) —
 *    раньше обходили, и лежащий 7TV получал повтор того же адреса каждые 10–30 с (замер сервера 18.11: 36% запросов
 *    наборов через зеркало). Обходят только «/refresh» человека и «связь с 7TV вернулась» (revive зеркала). Мгновенного
 *    повтора внутри запроса нет (retries 0);
 *  • chrome.storage.local — быстрый старт: проснувшийся фон отвечает вкладке сразу из
 *    сохранённого, а свежее досылает событием. Хранится не больше STORE_MAX каналов.
 */

CPX.emoteStore = (() => {
  const log = CPX.log("emotes");
  const P = CPX.emoteParse;
  const net = CPX.net;
  const ev = new CPX.Emitter();
  const MIN = 60000;
  const TTL = { g: 60 * MIN, stv: 60 * MIN, bttv: 60 * MIN, ffz: 15 * MIN };
  const STORE_MAX = 12;
  const PUSH_MS = 250;
  const KEY_G = "cpx.em.g";
  const KEY_C = "cpx.em.c.";
  const KEY_IDX = "cpx.em.idx";
  const PROV = ["stv", "bttv", "ffz"];
  // Канал — номер Twitch или "kick:<номер владельца на Kick>" (15.11). У Kick — только 7TV (решение владельца): BTTV и FFZ
  // Kick не знают.
  const ID_RE = /^(kick:)?\d{1,20}$/;
  const provOf = (c) => (c.site ? ["stv"] : PROV);
  const SETTING = { stv: "emotes.stv", bttv: "emotes.bttv", ffz: "emotes.ffz" };

  const on = (p) => CPX.settings.get(SETTING[p]) !== false;

  // ── состояние ─────────────────────────────────────────────────────────────
  const G = { stv: null, bttv: null, ffz: null, ffzMods: new Map(), ffzPaid: new Set(), sig: {}, at: {}, restored: null, loading: null, first: null, miss: new Set(), bo: {} };
  const channels = new Map(); // id → entry

  function entry(id, login) {
    let c = channels.get(id);
    if (!c) {
      c = {
        id,
        site: id.startsWith("kick:") ? "kick" : "",
        login: login || "",
        stv: null,
        stvSetId: "",
        stvOwner: "",
        stvOrigins: [],
        bttv: null,
        ffz: null,
        ffzMods: new Map(),
        ffzRoom: null,
        sig: {},
        at: {},
        subs: new Set(),
        restored: null,
        loading: null,
        first: null,
        pushT: 0,
        miss: new Set(),
        bo: {}, // сервис → пауза после сбоев (CPX.net.Backoff)
        retryT: 0,
        used: Date.now(),
      };
      channels.set(id, c);
    }
    if (login && !c.login) c.login = login;
    return c;
  }

  // ── отпечатки ─────────────────────────────────────────────────────────────
  // Что входит в отпечаток сервиса — ровно то, что уходит странице по этому сервису.
  const roomBadges = (c) => (c.ffzRoom ? { mod: c.ffzRoom.mod || null, vip: c.ffzRoom.vip || null } : null);
  function sigG(p) {
    if (G[p] === null) return "";
    if (p === "ffz") return P.sig([[...G.ffz.values()], [...G.ffzMods.values()], [...G.ffzPaid]]);
    return P.sig(G[p]);
  }
  function sigC(c, p) {
    if (c[p] === null) return "";
    if (p === "stv") return P.sig([[...c.stv.values()], c.stvSetId]);
    if (p === "ffz") return P.sig([[...c.ffz.values()], [...c.ffzMods.values()], roomBadges(c)]);
    return P.sig(c[p]);
  }
  // Версия выдачи странице: отпечатки включённых сервисов (выключенный — «-»).
  const version = (sig) => P.hash(PROV.map((p) => (on(p) ? sig[p] || "" : "-")).join("|"));

  // ── хранилище ─────────────────────────────────────────────────────────────
  const arr = (m) => (m ? [...m.values()] : null);

  function packGlobal() {
    return { at: G.at, stv: arr(G.stv), bttv: arr(G.bttv), ffz: arr(G.ffz), ffzMods: arr(G.ffzMods), ffzPaid: [...G.ffzPaid] };
  }
  function packChannel(c) {
    return {
      at: c.at,
      login: c.login,
      stv: arr(c.stv),
      stvSetId: c.stvSetId,
      stvOwner: c.stvOwner,
      stvOrigins: c.stvOrigins,
      bttv: arr(c.bttv),
      ffz: arr(c.ffz),
      ffzMods: arr(c.ffzMods),
      ffzRoom: c.ffzRoom,
    };
  }

  const saveQueue = new Set();
  const saveSoon = CPX.debounce(async () => {
    const items = {};
    for (const k of saveQueue) {
      if (k === "g") items[KEY_G] = packGlobal();
      else {
        const c = channels.get(k);
        if (c) items[KEY_C + k] = packChannel(c);
      }
    }
    saveQueue.clear();
    try {
      // Порядок недавности каналов — чтобы не держать в хранилище больше STORE_MAX.
      const got = await chrome.storage.local.get(KEY_IDX);
      let idx = Array.isArray(got[KEY_IDX]) ? got[KEY_IDX] : [];
      for (const k in items) {
        if (!k.startsWith(KEY_C)) continue;
        const id = k.slice(KEY_C.length);
        idx = [id].concat(idx.filter((x) => x !== id));
      }
      const drop = idx.slice(STORE_MAX);
      idx = idx.slice(0, STORE_MAX);
      items[KEY_IDX] = idx;
      await chrome.storage.local.set(items);
      if (drop.length) await chrome.storage.local.remove(drop.map((id) => KEY_C + id));
    } catch (e) {
      log.warn("не удалось сохранить смайлики:", e && e.message);
    }
  }, 3000);
  function save(k) {
    saveQueue.add(k);
    saveSoon();
  }

  function restoreGlobal() {
    if (!G.restored) {
      G.restored = chrome.storage.local
        .get(KEY_G)
        .then((r) => {
          const d = r && r[KEY_G];
          if (!d || PROV.some((p) => G[p] !== null)) return;
          G.at = d.at || {};
          if (d.stv) G.stv = P.toMap(d.stv);
          if (d.bttv) G.bttv = P.toMap(d.bttv);
          if (d.ffz) G.ffz = P.toMap(d.ffz);
          G.ffzMods = P.toMap(d.ffzMods);
          G.ffzPaid = new Set(d.ffzPaid || []);
          for (const p of PROV) G.sig[p] = sigG(p);
        })
        .catch(() => {});
    }
    return G.restored;
  }

  function restoreChannel(c) {
    if (!c.restored) {
      c.restored = chrome.storage.local
        .get(KEY_C + c.id)
        .then((r) => {
          const d = r && r[KEY_C + c.id];
          if (!d || PROV.some((p) => c[p] !== null)) return;
          c.at = d.at || {};
          if (d.login && !c.login) c.login = d.login;
          if (d.stv) c.stv = P.toMap(d.stv);
          c.stvSetId = d.stvSetId || "";
          c.stvOwner = d.stvOwner || "";
          c.stvOrigins = d.stvOrigins || [];
          if (d.bttv) c.bttv = P.toMap(d.bttv);
          if (d.ffz) c.ffz = P.toMap(d.ffz);
          c.ffzMods = P.toMap(d.ffzMods);
          c.ffzRoom = d.ffzRoom || null;
          for (const p of PROV) c.sig[p] = sigC(c, p);
        })
        .catch(() => {});
    }
    return c.restored;
  }

  // ── загрузка ──────────────────────────────────────────────────────────────
  // Загрузчики только ЧИТАЮТ сервис и возвращают новые поля (null — сбой); применяет их
  // общий код ниже — сравнивая отпечатки.
  const API_STV = "https://7tv.io/v3/";
  const API_BTTV = "https://api.betterttv.net/3/cached/";
  const API_FFZ = "https://api.frankerfacez.com/v1/";
  // FFZ бывает медленным (у нас замеры до 18 с) — ждём дольше.
  const T = { stv: 20000, bttv: 15000, ffz: 25000 };

  const LOAD_G = {
    async stv() {
      const d = await net.json(API_STV + "emote-sets/global", { timeout: T.stv });
      if (!d || !Array.isArray(d.emotes)) return null;
      return { stv: P.toMap(d.emotes.map(P.stv)) };
    },
    async bttv() {
      const d = await net.json(API_BTTV + "emotes/global", { timeout: T.bttv });
      if (!Array.isArray(d)) return null;
      return { bttv: P.toMap(d.map((e) => P.bttv(e, false))) };
    },
    async ffz() {
      const d = await net.json(API_FFZ + "set/global", { timeout: T.ffz });
      if (!d || !d.sets) return null;
      const { list, mods } = P.ffzSets(d, Array.isArray(d.default_sets) ? d.default_sets : null);
      // Кто поддержал FFZ (набор «Subwoofer Emote Effects»): им доступны платные эффекты.
      const paid = new Set();
      for (const sid of Object.keys(d.users || {})) for (const l of d.users[sid] || []) paid.add(String(l).toLowerCase());
      return { ffz: P.toMap(list), ffzMods: P.toMap(mods), ffzPaid: paid };
    },
  };

  // Свои значки модератора и VIP канала FFZ: только адреса 1/2/4 (проверит страница).
  function roomUrls(o) {
    if (!o || typeof o !== "object") return null;
    const out = {};
    for (const k of ["1", "2", "4"]) if (typeof o[k] === "string") out[k] = o[k].slice(0, 300);
    return out["1"] ? out : null;
  }

  const LOAD_C = {
    async stv(c) {
      // Kick (15.11): набор канала — по номеру ПОЛЬЗОВАТЕЛЯ-владельца на Kick (не канала и не чата), тот же ответ.
      const path = c.site === "kick" ? "users/kick/" + c.id.slice(5) : "users/twitch/" + c.id;
      const d = await net.json(API_STV + path, { timeout: T.stv, missingOk: true });
      if (!d) return null;
      const set = d.emote_set || null;
      return {
        stv: P.toMap(((set && set.emotes) || []).map(P.stv)),
        stvSetId: (set && set.id) || "",
        stvSetName: String((set && set.name) || "").slice(0, 100),
        stvOwner: (d.user && d.user.id) || "",
        stvOrigins: ((set && set.origins) || []).map((o) => o && o.id).filter(Boolean),
      };
    },
    async bttv(c) {
      const d = await net.json(API_BTTV + "users/twitch/" + c.id, { timeout: T.bttv, missingOk: true });
      if (!d) return null;
      const list = (d.channelEmotes || []).map((e) => P.bttv(e, false)).concat((d.sharedEmotes || []).map((e) => P.bttv(e, true)));
      return { bttv: P.toMap(list) };
    },
    async ffz(c) {
      const d = await net.json(API_FFZ + "room/id/" + c.id, { timeout: T.ffz, missingOk: true });
      if (!d) return null;
      const { list, mods } = P.ffzSets(d);
      const room = d.room || {};
      return {
        ffz: P.toMap(list),
        ffzMods: P.toMap(mods),
        ffzRoom: {
          mod: roomUrls(room.mod_urls),
          vip: roomUrls(room.vip_badge),
          userBadgeIds: room.user_badge_ids && typeof room.user_badge_ids === "object" ? room.user_badge_ids : {},
        },
      };
    },
  };

  function stale(at, p, ttl) {
    return !at[p] || Date.now() - at[p] > ttl;
  }

  /** Пауза после сбоев сервиса p у записи x (глобальные G или канал). */
  const bo = (x, p) => x.bo[p] || (x.bo[p] = new net.Backoff());
  /** Пора грузить сервис p записи x: нет данных, устарели или прошлый раз сорвалось — и пауза после сбоя истекла. */
  const due = (x, p, ttl) => (x[p] === null || stale(x.at, p, ttl) || x.miss.has(p)) && bo(x, p).ready();
  /** Загрузчик сервиса: данные или null; сбой — пауза (её срок — из ответа: 4xx, Retry-After). */
  async function attempt(x, p, run, where) {
    let data = null;
    let why = null;
    try {
      data = await run();
    } catch (e) {
      if (e && e.netFail) why = e;
      else CPX.report(where, e);
    }
    if (data) bo(x, p).ok();
    else bo(x, p).fail(why);
    return data;
  }
  /** Ближайшая проба для записи x: конец самой короткой паузы среди сорвавшихся сервисов. */
  const nextProbe = (x) => Math.min(...[...x.miss].map((p) => bo(x, p).left()));

  const pushGlobalSoon = CPX.debounce(() => CPX.router.broadcast("emotes.global", globalPayload()), PUSH_MS);

  /** Один сервис глобальных: загрузить и применить. true — ответил. */
  async function loadOneG(p) {
    const data = await attempt(G, p, () => LOAD_G[p](), "emotes:g:" + p);
    if (!data) {
      G.miss.add(p);
      return false;
    }
    G.at[p] = Date.now();
    G.miss.delete(p);
    Object.assign(G, data);
    const s = sigG(p);
    if (s !== G.sig[p]) {
      G.sig[p] = s;
      pushGlobalSoon();
    }
    save("g"); // время загрузки — тоже (проснувшийся фон не перекачает свежее)
    return true;
  }

  /** Глобальные: догрузить устаревшее/недостающее. force — все включённые.
   * → Promise, выполняется, когда ответил ПЕРВЫЙ сервис (или все не ответили). */
  async function loadGlobal(force) {
    await restoreGlobal();
    if (G.loading) return G.first;
    const want = PROV.filter((p) => on(p) && (force || due(G, p, TTL.g)));
    if (!want.length) return;
    let firstDone;
    G.first = new Promise((r) => (firstDone = r));
    G.loading = Promise.all(want.map((p) => loadOneG(p).then((ok) => ok && firstDone())))
      .then(() => {
        firstDone();
        if (G.miss.size) retryGlobal();
      })
      .finally(() => (G.loading = null));
    return G.first;
  }

  let gRetryT = 0;
  function retryGlobal() {
    clearTimeout(gRetryT);
    gRetryT = setTimeout(() => {
      gRetryT = 0;
      if (openAll().size || CPX.router.pageTabs()) loadGlobal(false);
    }, nextProbe(G) + 50);
  }

  function pushChannelSoon(c) {
    clearTimeout(c.pushT);
    c.pushT = setTimeout(() => {
      c.pushT = 0;
      pushChannel(c);
    }, PUSH_MS);
  }

  /** Один сервис канала: загрузить и применить. true — ответил. */
  async function loadOneC(c, p) {
    const data = await attempt(c, p, () => LOAD_C[p](c), "emotes:c:" + p);
    if (!data) {
      c.miss.add(p);
      return false;
    }
    c.at[p] = Date.now();
    c.miss.delete(p);
    const stvKey = c.stvSetId + "|" + c.stvOwner + "|" + c.stvOrigins.join(",");
    const ubIds = c.ffzRoom ? JSON.stringify(c.ffzRoom.userBadgeIds) : "";
    Object.assign(c, data);
    if (p === "stv" && stvKey !== c.stvSetId + "|" + c.stvOwner + "|" + c.stvOrigins.join(",")) ev.emit("stvSets");
    if (p === "stv") switchNotice(c);
    if (p === "ffz" && ubIds !== JSON.stringify(c.ffzRoom.userBadgeIds)) ev.emit("ffzRoom", c.id);
    const s = sigC(c, p);
    if (s !== c.sig[p]) {
      c.sig[p] = s;
      pushChannelSoon(c);
    }
    save(c.id);
    return true;
  }

  /** Канал: догрузить устаревшее/недостающее. → Promise «первый сервис ответил». */
  async function loadChannel(c, force) {
    await restoreChannel(c);
    if (c.loading) return c.first;
    const want = provOf(c).filter((p) => on(p) && (force || due(c, p, TTL[p])));
    if (!want.length) return;
    let firstDone;
    c.first = new Promise((r) => (firstDone = r));
    c.loading = Promise.all(want.map((p) => loadOneC(c, p).then((ok) => ok && firstDone())))
      .then(() => {
        firstDone();
        if (c.miss.size) retryChannel(c);
      })
      .finally(() => (c.loading = null));
    return c.first;
  }

  function retryChannel(c) {
    clearTimeout(c.retryT);
    c.retryT = setTimeout(() => {
      c.retryT = 0;
      if (isWanted(c)) loadChannel(c, false);
    }, nextProbe(c) + 50);
  }

  // ── выдача странице ───────────────────────────────────────────────────────
  function globalPayload() {
    return {
      v: version(G.sig),
      stv: on("stv") ? arr(G.stv) || [] : [],
      bttv: on("bttv") ? arr(G.bttv) || [] : [],
      ffz: on("ffz") ? arr(G.ffz) || [] : [],
      ffzMods: on("ffz") ? arr(G.ffzMods) || [] : [],
      ffzPaid: [...G.ffzPaid],
      ready: PROV.filter((p) => G[p] !== null),
    };
  }

  function channelPayload(c) {
    return {
      id: c.id,
      login: c.login,
      v: version(c.sig),
      stv: on("stv") ? arr(c.stv) || [] : [],
      bttv: on("bttv") ? arr(c.bttv) || [] : [],
      ffz: on("ffz") ? arr(c.ffz) || [] : [],
      ffzMods: on("ffz") ? arr(c.ffzMods) || [] : [],
      ffzBadges: on("ffz") ? roomBadges(c) : null,
      stvSetId: c.stvSetId,
      ready: PROV.filter((p) => c[p] !== null),
    };
  }

  function pushChannel(c) {
    if (!c.subs.size) return;
    const d = channelPayload(c);
    for (const tab of c.subs) CPX.router.toTab(tab, "emotes.channel", d);
  }

  /** Канал нужен кому-то: открыт во вкладке или вкладка на него подписана (общий чат). */
  function isWanted(c) {
    return c.subs.size > 0 || (c.site ? CPX.router.siteChannels() : CPX.router.channels()).has(c.id);
  }
  /** Открытые каналы всех вкладок: Twitch и сайтов ("kick:<номер>"). */
  const openAll = () => new Map([...CPX.router.channels(), ...CPX.router.siteChannels()]);

  /** Все нужные каналы: открытые + подписки вкладок (id → логин) — для живых сокетов. */
  function wanted() {
    const out = openAll();
    for (const c of channels.values()) if (c.subs.size && !out.has(c.id)) out.set(c.id, c.login);
    return out;
  }

  CPX.router.handle(
    "emotes.global",
    async (p, ctx) => {
      await restoreGlobal();
      // Есть сохранённое — отвечаем сразу, свежее придёт событием.
      const first = loadGlobal(false);
      if (PROV.every((x) => G[x] === null)) await first;
      // Вкладке Kick — только 7TV (BTTV и FFZ Kick не знают; лишнего через порт не гоняем).
      const g = globalPayload();
      return ctx.tab && ctx.tab.site !== "twitch" ? Object.assign(g, { bttv: [], ffz: [], ffzMods: [], ffzPaid: [] }) : g;
    },
    { page: true }
  );

  CPX.router.handle(
    "emotes.channel",
    async (p, ctx) => {
      const id = String(p.id || "");
      if (!ID_RE.test(id)) throw Object.assign(new Error("неверный id канала"), { quiet: true });
      const c = entry(id, String(p.login || "").toLowerCase().slice(0, 25));
      c.used = Date.now();
      if (ctx.tab && !c.subs.has(ctx.tab)) {
        c.subs.add(ctx.tab);
        // Подписок одной вкладки — не больше 12 каналов (общий чат — до 6).
        const mine = [...channels.values()].filter((x) => x.subs.has(ctx.tab));
        if (mine.length > 12) {
          const oldest = mine.filter((x) => x !== c).sort((a, b) => a.used - b.used)[0];
          if (oldest) oldest.subs.delete(ctx.tab);
        }
        ev.emit("subs");
      }
      await restoreChannel(c);
      const first = loadChannel(c, false);
      if (PROV.every((x) => c[x] === null)) await first;
      return channelPayload(c);
    },
    { page: true }
  );

  // Команда /refresh (src/main/34_chat_link.js, владелец 30.10): наборы канала и общие — заново мимо сроков свежести.
  // Не чаще раза в REFRESH_GAP_MS на канал: команду можно набрать подряд, а сервисы считают запросы.
  const REFRESH_GAP_MS = 20000;
  const refreshedAt = new Map();
  CPX.router.handle(
    "emotes.refresh",
    async (p) => {
      const id = String((p && p.id) || "");
      if (!/^\d{1,20}$/.test(id)) throw Object.assign(new Error("неверный id канала"), { quiet: true });
      const now = Date.now();
      if (now - (refreshedAt.get(id) || 0) < REFRESH_GAP_MS) return false;
      refreshedAt.set(id, now);
      if (refreshedAt.size > 50) refreshedAt.delete(refreshedAt.keys().next().value);
      const c = entry(id, String(p.login || "").toLowerCase().slice(0, 25));
      c.used = now;
      await Promise.all([loadGlobal(true), loadChannel(c, true)]);
      return true;
    },
    { page: true }
  );

  // Вкладка ушла с канала / партнёр общего чата замолчал — снять её подписки на остальное.
  CPX.router.handle(
    "emotes.keep",
    (p, ctx) => {
      if (!ctx.tab) return false;
      const keep = new Set((Array.isArray(p.ids) ? p.ids : []).slice(0, 12).map(String));
      let changed = false;
      for (const c of channels.values()) {
        if (c.subs.has(ctx.tab) && !keep.has(c.id)) {
          c.subs.delete(ctx.tab);
          changed = true;
        }
      }
      if (changed) ev.emit("subs");
      return true;
    },
    { page: true }
  );

  const onClose = (tab) => {
    let changed = false;
    for (const c of channels.values()) if (c.subs.delete(tab)) changed = true;
    if (changed) ev.emit("subs");
  };
  CPX.router.ev.on("tab:close", onClose);
  CPX.router.ev.on("site:close", onClose);

  // ── живые правки ──────────────────────────────────────────────────────────
  /** Сокет живых правок сервиса p переподключился после разрыва: правки за время разрыва пропали
   *  (возобновления сессии нет) — перечитать наборы нужных каналов, вразбивку по 0,7 с. since — когда сокет упал:
   *  набор, загруженный уже после этого, правки разрыва видел — не трогаем (сокет, который часто рвётся, иначе
   *  перечитывал бы все наборы на каждом переподключении). */
  function refresh(p, since) {
    if (!on(p)) return;
    let i = 0;
    for (const c of channels.values()) {
      if (!isWanted(c) || (since && c.at[p] >= since)) continue;
      setTimeout(() => {
        if (!isWanted(c) || (since && c.at[p] >= since)) return;
        c.at[p] = 0;
        loadChannel(c, false);
      }, 700 * i++);
    }
  }

  const reloadStvT = new Map();
  function reloadStv(c) {
    clearTimeout(reloadStvT.get(c.id));
    // Пачка событий — одним запросом.
    reloadStvT.set(
      c.id,
      setTimeout(() => {
        reloadStvT.delete(c.id);
        c.at.stv = 0;
        loadChannel(c, false);
      }, 1500)
    );
  }

  // Правка набора применена на месте — пересчитать отпечаток и разослать.
  function changedLive(c, p) {
    c.sig[p] = sigC(c, p);
    save(c.id);
    pushChannel(c);
  }

  /* Строки в чате о правках набора 7TV (клиент: TwitchChannel.cpp add/update/removeSeventvEmote,
   * updateSeventvUser) — вкладкам, где открыт этот канал; рисует и склеивает страница (59_emote_notices).
   * Кто сделал — 7TV-имя (display_name); логин — только если совпадает с ним (тогда это и ник Twitch:
   * щелчок по нему открывает карточку). */
  function actorOf(body) {
    const a = (body && body.actor) || {};
    const name = String(a.display_name || a.username || "").slice(0, 40);
    const u = String(a.username || "").toLowerCase();
    return { name, login: /^[a-z0-9_]{1,25}$/.test(u) && name.toLowerCase() === u ? u : "" };
  }
  function notice(c, actor, ev) {
    CPX.router.toChannel(c.id, "emotes.stvNotice", { id: c.id, actor, ev: ev.slice(0, 200) });
  }
  // Смена набора: строка — после перечитывания и только если набор канала на Twitch правда сменился
  // (у человека в 7TV бывают разные наборы для Twitch и Kick — событие о любом из них).
  function switchNotice(c) {
    const sw = c.stvSwitch;
    if (!sw) return;
    c.stvSwitch = null;
    if (Date.now() - sw.at > 60000 || c.stvSetId !== sw.id) return;
    notice(c, sw.actor, [{ t: "set", n: c.stvSetName || sw.name }]);
  }

  /** Событие EventAPI 7TV. true — событие про набор/владельца канала (обработано здесь). */
  function onStvDispatch(type, body) {
    if (!body) return false;
    if (type === "emote_set.update") {
      let hit = false;
      for (const c of channels.values()) {
        if (c.stvSetId && body.id === c.stvSetId && c.stv) {
          const res = P.applyStvChanges(c.stv, body);
          if (res.changed) changedLive(c, "stv");
          if (res.reload) reloadStv(c);
          if (res.ev.length) notice(c, actorOf(body), res.ev);
          hit = true;
        } else if (c.stvOrigins.includes(body.id)) {
          reloadStv(c); // набор-источник: смайлики канала собираются из него
          hit = true;
        }
      }
      return hit;
    }
    if (type === "user.update") {
      let hit = false;
      for (const c of channels.values()) {
        if (c.stvOwner && body.id === c.stvOwner) {
          // Стример сменил активный набор: {updated: [{key: "connections", value: [{key: "emote_set",
          // old_value, value: набор}]}]} (клиент: eventapi/Client.cpp onUserUpdate).
          for (const u of Array.isArray(body.updated) ? body.updated : []) {
            if (!u || u.key !== "connections" || !Array.isArray(u.value)) continue;
            for (const v of u.value) {
              const set = v && v.key === "emote_set" && v.value;
              if (set && set.id && set.id !== c.stvSetId) c.stvSwitch = { id: String(set.id), name: String(set.name || "").slice(0, 100), actor: actorOf(body), at: Date.now() };
            }
          }
          reloadStv(c);
          hit = true;
        }
      }
      return hit;
    }
    return false;
  }

  /** Событие сокета BTTV (emote_create / emote_update / emote_delete) по каналу. */
  function bttvLive(channelId, name, d) {
    const c = channels.get(String(channelId));
    if (!c || !c.bttv || !d) return;
    const m = new Map(c.bttv);
    if (name === "emote_create" && d.emote) {
      const r = P.bttv(d.emote, !!d.emote.user);
      if (r) m.set(r.n, r);
    } else if (name === "emote_update" && d.emote) {
      let base = null;
      for (const [n, x] of m) {
        if (x.i === d.emote.id) {
          base = x;
          m.delete(n);
        }
      }
      if (base && d.emote.code) m.set(String(d.emote.code), Object.assign({}, base, { n: String(d.emote.code).slice(0, 100) }));
    } else if (name === "emote_delete") {
      for (const [n, x] of m) if (x.i === d.emoteId) m.delete(n);
    } else return;
    c.bttv = m;
    changedLive(c, "bttv");
  }

  // ── обслуживание ──────────────────────────────────────────────────────────
  function tick() {
    const open = openAll();
    if (open.size || CPX.router.pageTabs()) loadGlobal(false);
    for (const [id, login] of open) loadChannel(entry(id, login), false);
    for (const c of channels.values()) {
      if (!open.has(c.id) && c.subs.size) loadChannel(c, false);
      // Давно никому не нужный канал — из памяти вон (в хранилище остаётся).
      if (!isWanted(c) && Date.now() - c.used > 30 * MIN) {
        clearTimeout(c.retryT);
        clearTimeout(c.pushT);
        channels.delete(c.id);
      }
    }
  }

  const onOpen = (open) => {
    for (const [id, login] of open) {
      const c = entry(id, login);
      c.used = Date.now();
      loadChannel(c, false);
    }
    loadGlobal(false);
  };
  CPX.router.ev.on("channels", onOpen);
  CPX.router.ev.on("site:channels", onOpen);

  // Включили сервис — догрузить его (выключенный просто не отдаётся странице).
  CPX.settings.on((applied) => {
    const turnedOn = PROV.some((p) => applied[SETTING[p]] === true);
    const turnedAny = PROV.some((p) => SETTING[p] in applied);
    if (!turnedAny) return;
    if (turnedOn) {
      loadGlobal(false);
      for (const c of channels.values()) if (isWanted(c)) loadChannel(c, false);
    }
    CPX.router.broadcast("emotes.global", globalPayload());
    for (const c of channels.values()) pushChannel(c);
    ev.emit("stvSets");
  });

  CPX.boot.add(
    "emotes",
    () => {
      setInterval(CPX.guard("emotes:tick", tick), 5 * MIN);
      restoreGlobal();
    },
    30
  );

  const sizeOf = (m) => (m ? m.size : null);
  CPX.diag.add("emotes", () => ({
    global: { v: version(G.sig), stv: sizeOf(G.stv), bttv: sizeOf(G.bttv), ffz: sizeOf(G.ffz), ffzMods: G.ffzMods.size, ffzPaid: G.ffzPaid.size, miss: [...G.miss] },
    channels: [...channels.values()].map((c) => ({
      id: c.id,
      login: c.login,
      v: version(c.sig),
      stv: sizeOf(c.stv),
      bttv: sizeOf(c.bttv),
      ffz: sizeOf(c.ffz),
      ffzMods: c.ffzMods.size,
      stvSetId: c.stvSetId,
      subs: c.subs.size,
      miss: [...c.miss],
    })),
  }));

  return {
    ev,
    channel: (id) => channels.get(String(id)) || null,
    channels: () => channels,
    wanted,
    onStvDispatch,
    bttvLive,
    ffzRoom: (id) => {
      const c = channels.get(String(id));
      return (c && c.ffzRoom) || null;
    },
    ffzPaid: (login) => G.ffzPaid.has(String(login || "").toLowerCase()),
    loadGlobal,
    loadChannel: (id, login) => loadChannel(entry(String(id), login), false),
    /** Связь с 7TV вернулась (revive зеркала, не чаще раза в минуту): паузы 7TV снять и догрузить нужное. */
    revive() {
      bo(G, "stv").ok();
      loadGlobal(false);
      for (const [id, login] of wanted()) {
        const c = entry(id, login);
        bo(c, "stv").ok();
        loadChannel(c, false);
      }
    },
    refresh,
  };
})();

// ── src/bg/33_stv_events.js ──
/* Фон: живые правки 7TV (EventAPI, wss://events.7tv.io/v3) — ОДИН сокет на все вкладки.
 *
 * Подписки — по нужным каналам (CPX.emoteStore.wanted(): открытые во вкладках + партнёры общего
 * чата, на которые подписаны вкладки), как у расширения 7TV и клиента:
 *   • emote_set.* {object_id: набор канала} — правки смайликов канала;
 *   • emote_set.update {object_id: набор-источник} — набор канала собран из другого;
 *   • user.* {object_id: 7TV-пользователь канала} — стример сменил активный набор;
 *   • entitlement.*, cosmetic.*, emote_set.* {ctx:"channel", platform:"TWITCH", id: канал} —
 *     пейнты, бейджи и личные наборы людей, которые «присутствуют» в этом канале.
 * Нет нужных каналов — сокет закрывается (через минуту: переход между каналами его не рвёт).
 *
 * События: CPX.emoteStore.onStvDispatch (наборы каналов) и CPX.stvEvents.on("dispatch", fn)
 * для косметики (35_cosmetics). CPX.stvEvents.sessionId — для «присутствия» 7TV.
 * Маршрут (зеркало PLUS, этап 5) — CPX.mirror.socketRoute: у подписчика, когда прямой путь не
 * работает, — «труба» wss://<наш сервер>/mirror/ws/events.7tv.io/v3?<тот же query> с подпротоколами
 * ["c7mirror", "c7p.<пропуск>"] (браузерный WebSocket не умеет Authorization). Итог подключения
 * (поздоровался / не открылся / замолчал) — маршрутизатору (noteSocket); он же просит
 * переподключиться, когда путь сменился (CPX.mirror.on("socket")).
 */

CPX.stvEvents = (() => {
  const log = CPX.log("stv-events");
  const ev = new CPX.Emitter();
  const BASE = "wss://events.7tv.io/v3?app=chatterino-plus-ext&version=" + encodeURIComponent(CPX.version);
  let ws = null;
  let sessionId = "";
  let hbMs = 45000;
  let lastMsg = 0;
  let connectAt = 0;
  let attempts = 0;
  let retryT = 0;
  let downAt = 0; // когда оборвалось нежданно (были нужные каналы) — для перечитывания наборов
  let closeT = 0;
  let sockVia = false; // текущее соединение — трубой через наше зеркало
  let sockHost = "events.7tv.io";
  let noted = false; // итог подключения уже сообщён маршрутизатору
  const subs = new Map(); // ключ → {type, condition} — подписано на этом соединении
  const st = { connects: 0, viaMirror: 0, dispatch: 0, subs: 0, errors: 0 };

  const stvOn = () => CPX.settings.get("emotes.stv") !== false;
  const cosmOn = () =>
    CPX.settings.get("emotes.paints") !== false || CPX.settings.get("emotes.badges.stv") !== false || stvOn();

  const key = (type, cond) => type + "|" + JSON.stringify(cond);

  function wanted() {
    const out = new Map();
    const add = (type, condition) => out.set(key(type, condition), { type, condition });
    for (const id of CPX.emoteStore.wanted().keys()) {
      if (cosmOn()) {
        // Канал Kick (15.11) — "kick:<номер владельца на Kick>": та же подписка с platform KICK.
        const cond = id.startsWith("kick:") ? { ctx: "channel", platform: "KICK", id: id.slice(5) } : { ctx: "channel", platform: "TWITCH", id };
        add("entitlement.*", cond);
        add("cosmetic.*", cond);
        add("emote_set.*", cond);
      }
      const c = CPX.emoteStore.channel(id);
      if (c && stvOn()) {
        if (c.stvSetId) add("emote_set.*", { object_id: c.stvSetId });
        for (const o of c.stvOrigins.slice(0, 5)) add("emote_set.update", { object_id: o });
        if (c.stvOwner) add("user.*", { object_id: c.stvOwner });
      }
    }
    return out;
  }

  function send(obj) {
    if (ws && ws.readyState === 1) {
      try {
        ws.send(JSON.stringify(obj));
        return true;
      } catch (_) {
        return false;
      }
    }
    return false;
  }

  /** Привести подписки к нужным; нужно пусто — закрыть сокет (с задержкой). */
  function sync() {
    const want = wanted();
    if (!want.size) {
      if (ws && !closeT) closeT = setTimeout(() => ((closeT = 0), wanted().size || close()), 60000);
      return;
    }
    clearTimeout(closeT);
    closeT = 0;
    if (!ws) return connect();
    if (ws.readyState !== 1 || !sessionId) return; // подпишемся по hello
    for (const [k, s] of subs) {
      if (!want.has(k)) {
        send({ op: 36, d: { type: s.type, condition: s.condition } });
        subs.delete(k);
      }
    }
    for (const [k, s] of want) {
      if (!subs.has(k) && send({ op: 35, d: { type: s.type, condition: s.condition } })) {
        subs.set(k, s);
        st.subs++;
      }
    }
  }
  const syncSoon = CPX.debounce(CPX.guard("stv-events:sync", sync), 300);

  function connect() {
    clearTimeout(retryT);
    retryT = 0;
    if (ws) return;
    let sock;
    const r = CPX.mirror ? CPX.mirror.socketRoute(BASE) : { url: CPX.net.route(BASE), protocols: undefined, viaMirror: false, host: "events.7tv.io" };
    try {
      sock = r.protocols ? new WebSocket(r.url, r.protocols) : new WebSocket(r.url);
    } catch (e) {
      return retry();
    }
    ws = sock;
    sockVia = !!r.viaMirror;
    sockHost = r.host || "events.7tv.io";
    noted = false;
    connectAt = Date.now();
    sessionId = "";
    subs.clear();
    st.connects++;
    if (sockVia) st.viaMirror++;
    sock.onmessage = (e) => {
      if (ws !== sock) return;
      lastMsg = Date.now();
      let m;
      try {
        m = JSON.parse(e.data);
      } catch (_) {
        return;
      }
      CPX.safely("stv-events:msg", () => onMessage(m));
    };
    sock.onclose = () => {
      if (ws !== sock) return;
      // Закрылось, так и не поздоровавшись, — путь не работает (прямой или труба).
      if (!sessionId) note(false);
      ws = null;
      sessionId = "";
      subs.clear();
      if (wanted().size) {
        if (!downAt) downAt = Date.now();
        retry();
      }
    };
    sock.onerror = () => {
      /* закрытие придёт следом */
    };
  }

  function onMessage(m) {
    const d = m.d || {};
    switch (m.op) {
      case 1: // HELLO
        sessionId = String(d.session_id || "");
        hbMs = Math.max(10000, Number(d.heartbeat_interval) || 45000);
        attempts = 0;
        note(true);
        subs.clear();
        sync();
        // Разрыв дольше 10 с — правки наборов за это время не пришли: перечитать (ревью 01.10).
        if (downAt && Date.now() - downAt > 10000) {
          const since = downAt;
          CPX.safely("stv-events:refresh", () => CPX.emoteStore.refresh("stv", since));
        }
        downAt = 0;
        ev.emit("hello", sessionId);
        break;
      case 0: // DISPATCH
        st.dispatch++;
        // Наборы каналов ведёт CPX.emoteStore, пейнты/бейджи/личные наборы — косметика
        // (она пропускает чужие для неё наборы сама).
        CPX.emoteStore.onStvDispatch(d.type, d.body);
        ev.emit("dispatch", d.type, d.body || {});
        break;
      case 4: // RECONNECT
        drop();
        break;
      case 6: // ERROR
        st.errors++;
        log.debug("ошибка EventAPI", d);
        break;
      case 7: // END_OF_STREAM
        log.debug("EventAPI закрыл поток", d.code, d.message);
        drop();
        break;
      default: // HEARTBEAT (2), ACK (5)
        break;
    }
  }

  /** Итог подключения — маршрутизатору зеркала (один раз на соединение; force — замолчал после
   * приветствия: так выглядит «заморозка» фильтрацией после первых килобайт, это тоже сбой пути). */
  function note(ok, force) {
    if ((noted && !force) || !CPX.mirror) return;
    noted = true;
    CPX.safely("stv-events:note", () => CPX.mirror.noteSocket(sockHost, sockVia, ok));
  }

  /** Путь сменился (зеркало ↔ прямо) — переподключиться сразу, без паузы повтора. */
  function reroute() {
    const s = ws;
    ws = null;
    sessionId = "";
    subs.clear();
    if (s) {
      s.onclose = null;
      s.onmessage = null;
      try {
        s.close();
      } catch (_) {
        /* уже */
      }
    }
    clearTimeout(retryT);
    retryT = 0;
    if (wanted().size) connect();
  }

  function onMirrorSocket(m) {
    const what = m && m.what;
    // Связь с 7TV вернулась — переподключаем то, что висит или ждёт повтора; открытое и уже
    // поздоровавшееся соединение не рвём: подписки на нём живы, в разрыве терялись бы события.
    if (what === "reconnect") return ws && ws.readyState === 1 && sessionId ? undefined : reroute();
    if (!ws) {
      // Ждём паузу повтора после сбоя, а путь уже сменился — не ждём.
      if (what === "unhealthy" && retryT) reroute();
      return;
    }
    if (what === "mirrored" && sockVia) return reroute();
    if (what === "unhealthy" && (ws.readyState !== 1 || !sessionId)) return reroute();
  }

  function retry() {
    if (retryT) return;
    // 1, 2, 4 … 60 с с разбросом: сотни браузеров после сбоя 7TV не придут в одну секунду.
    const wait = Math.min(60000, 1000 * Math.pow(2, attempts++)) * (0.5 + Math.random());
    retryT = setTimeout(() => {
      retryT = 0;
      if (wanted().size) connect();
    }, wait);
  }

  function drop() {
    const s = ws;
    ws = null;
    sessionId = "";
    subs.clear();
    if (s && wanted().size && !downAt) downAt = Date.now(); // для перечитывания наборов после возврата
    if (s) {
      s.onclose = null;
      s.onmessage = null;
      try {
        s.close();
      } catch (_) {
        /* уже */
      }
    }
    if (wanted().size) retry();
  }

  function close() {
    clearTimeout(retryT);
    retryT = 0;
    const s = ws;
    ws = null;
    sessionId = "";
    subs.clear();
    if (s) {
      s.onclose = null;
      try {
        s.close();
      } catch (_) {
        /* уже */
      }
    }
  }

  // Сторож: «зависшее» подключение (15 с) или тишина дольше трёх сердцебиений — рвём.
  function watch() {
    if (!ws) return;
    const now = Date.now();
    if (ws.readyState === 0 && now - connectAt > 15000) {
      note(false);
      return drop();
    }
    if (ws.readyState === 1 && now - Math.max(lastMsg, connectAt) > hbMs * 3) {
      note(false, true);
      return drop();
    }
  }

  CPX.router.ev.on("channels", syncSoon);
  CPX.router.ev.on("site:channels", syncSoon);
  CPX.emoteStore.ev.on("stvSets", syncSoon);
  CPX.emoteStore.ev.on("subs", syncSoon);
  CPX.net.onRoute(() => ws && drop());
  CPX.settings.on((applied) => {
    if (Object.keys(applied).some((k) => k.startsWith("emotes."))) syncSoon();
  });

  CPX.boot.add(
    "stv-events",
    () => {
      setInterval(CPX.guard("stv-events:watch", watch), 5000);
      if (CPX.mirror) CPX.mirror.on("socket", CPX.guard("stv-events:route", onMirrorSocket));
      syncSoon();
    },
    33
  );

  CPX.diag.add("stvEvents", () => ({
    state: ws ? ["connecting", "open", "closing", "closed"][ws.readyState] : "none",
    via: ws ? (sockVia ? "mirror" : "direct") : null,
    session: !!sessionId,
    subs: subs.size,
    stats: Object.assign({}, st),
  }));

  return {
    on: (name, fn) => ev.on(name, fn),
    get sessionId() {
      return sessionId;
    },
    sync: syncSoon,
  };
})();

// ── src/bg/34_bttv_socket.js ──
/* Фон: живые правки смайликов BTTV (wss://sockets.betterttv.net/ws) — один сокет на все вкладки.
 *
 * join_channel {name:"twitch:<id>"} по каждому нужному каналу (открытые + партнёры общего чата —
 * CPX.emoteStore.wanted()); приходят emote_create /
 * emote_update / emote_delete {channel:"twitch:<id>", …} → CPX.emoteStore.bttvLive.
 * Своего пульса у BTTV нет — живость видим по закрытию. Нет открытых каналов (или BTTV
 * выключен) — сокет закрываем через минуту.
 * «Присутствие» BTTV (broadcast_me) и личные смайлики BTTV Pro не шлём и не показываем:
 * это отправка сведений о человеке, а клиент Chatterino+ их тоже не рисует.
 */

(() => {
  const log = CPX.log("bttv-socket");
  // ⚠️Не называть URL: перекрыло бы встроенный конструктор адресов во всём файле.
  const WS_URL = "wss://sockets.betterttv.net/ws";
  let ws = null;
  let attempts = 0;
  let retryT = 0;
  let downAt = 0; // когда оборвалось нежданно — для перечитывания наборов
  let closeT = 0;
  const joined = new Set();
  const st = { connects: 0, events: 0 };

  const wanted = () => (CPX.settings.get("emotes.bttv") === false ? new Set() : new Set(CPX.emoteStore.wanted().keys()));

  function send(name, data) {
    if (!ws || ws.readyState !== 1) return false;
    try {
      ws.send(JSON.stringify({ name, data }));
      return true;
    } catch (_) {
      return false;
    }
  }

  function sync() {
    const want = wanted();
    if (!want.size) {
      if (ws && !closeT) closeT = setTimeout(() => ((closeT = 0), wanted().size || close()), 60000);
      return;
    }
    clearTimeout(closeT);
    closeT = 0;
    if (!ws) return connect();
    if (ws.readyState !== 1) return;
    for (const id of joined) {
      if (!want.has(id)) {
        send("part_channel", { name: "twitch:" + id });
        joined.delete(id);
      }
    }
    for (const id of want) if (!joined.has(id) && send("join_channel", { name: "twitch:" + id })) joined.add(id);
  }
  const syncSoon = CPX.debounce(CPX.guard("bttv-socket:sync", sync), 300);

  function connect() {
    clearTimeout(retryT);
    retryT = 0;
    if (ws) return;
    let sock;
    try {
      sock = new WebSocket(WS_URL);
    } catch (_) {
      return retry();
    }
    ws = sock;
    joined.clear();
    st.connects++;
    sock.onopen = () => {
      if (ws !== sock) return;
      attempts = 0;
      sync();
      // Разрыв дольше 10 с — правки за это время пропали: перечитать наборы (ревью 01.10).
      if (downAt && Date.now() - downAt > 10000) {
        const since = downAt;
        CPX.safely("bttv-socket:refresh", () => CPX.emoteStore.refresh("bttv", since));
      }
      downAt = 0;
    };
    sock.onmessage = (e) => {
      if (ws !== sock) return;
      let m;
      try {
        m = JSON.parse(e.data);
      } catch (_) {
        return;
      }
      const d = (m && m.data) || {};
      if (!/^emote_(create|update|delete)$/.test(m && m.name)) return;
      const ch = /^twitch:(\d{1,20})$/.exec(String(d.channel || ""));
      if (!ch) return;
      st.events++;
      CPX.safely("bttv-socket:event", () => CPX.emoteStore.bttvLive(ch[1], m.name, d));
    };
    sock.onclose = () => {
      if (ws !== sock) return;
      ws = null;
      joined.clear();
      if (wanted().size) {
        if (!downAt) downAt = Date.now();
        retry();
      }
    };
    sock.onerror = () => {
      /* закрытие придёт следом */
    };
  }

  function retry() {
    if (retryT) return;
    // Потолок 60 с (было 120 с × до 1,5 — после возврата сети правки BTTV оживали до 3 мин).
    const wait = Math.min(60000, 2000 * Math.pow(2, attempts++)) * (0.5 + Math.random());
    retryT = setTimeout(() => {
      retryT = 0;
      if (wanted().size) connect();
    }, wait);
  }

  function close() {
    clearTimeout(retryT);
    retryT = 0;
    const s = ws;
    ws = null;
    joined.clear();
    if (s) {
      s.onclose = null;
      try {
        s.close();
      } catch (_) {
        /* уже */
      }
    }
    log.debug("сокет BTTV закрыт — каналов нет");
  }

  CPX.router.ev.on("channels", syncSoon);
  CPX.emoteStore.ev.on("subs", syncSoon);
  CPX.settings.on((applied) => "emotes.bttv" in applied && syncSoon());
  CPX.boot.add("bttv-socket", () => syncSoon(), 34);

  CPX.diag.add("bttvSocket", () => ({
    state: ws ? ["connecting", "open", "closing", "closed"][ws.readyState] : "none",
    joined: joined.size,
    stats: Object.assign({}, st),
  }));
})();

// ── src/bg/35_cosmetics.js ──
/* Фон: косметика людей — пейнты и бейджи 7TV, личные наборы смайликов 7TV, сторонние бейджи.
 *
 * Откуда берём 7TV (каталог косметики нашего сервера расширению закрыт — research/03 §5.2):
 *   • EventAPI (33_stv_events): выдачи (entitlement.*) и описания (cosmetic.create) людей,
 *     «присутствующих» в открытом канале, — сами приходят, запросов не нужно;
 *   • GraphQL 7TV пачкой до 40 человек (userByConnection → paint_id, badge_id, роли, наборы) —
 *     для тех, о ком EventAPI молчит (как экранный чат OBS); не чаще раза в 1,5 с, кэш 30 мин. У подписчика PLUS
 *     с закрытым 7TV — через зеркало (сервер п.164, 18.11; строка полей сверяется буква в букву — 50_mirror WHO_FIELDS).
 *     ПОТОК ЗАПРОСОВ (правила основного чата 18.11): сбой (сеть, 5xx, 429, отказ зеркала, ответ без data) — пауза
 *     CPX.net.Backoff (5 с → вдвое → 5 мин, Retry-After — нижняя граница), за паузу — ОДНА пробная пачка; очередь при
 *     сбое не копится: кого не спросили — «забываем» (cosm.update forget), страница спросит снова, когда человек
 *     опять появится в чате. О ком сервер не узнал (псевдонима нет в data — 7TV не ответил, в запасе нет) — не
 *     «косметики нет»: забыть и не спрашивать раньше минуты. Описания и личные наборы — те же паузы.
 *     ПРЕДЕЛ СЛОЖНОСТИ 7TV (записка основного чата 18.11): запрос «сложнее» 400 7TV отклоняет целиком — 200 с
 *     data:null и «Query is too complex.»; наша пачка с этими полями проходит ровно до 50 человек — берём 40 (запас).
 *     Такой отказ — не «7TV лёг»: без паузы, в отчёт, повтор теми же людьми половинами (предел пачки до перезапуска
 *     фона — вдвое меньше). ⚠️Добавили поле в запрос — перемерить предел (и сказать основному чату: зеркало сверяет
 *     строку полей буква в букву, 50_mirror WHO_FIELDS);
 *   • описания пейнтов/бейджей по номерам — GraphQL cosmetics(list:[…]) пачкой до 50;
 *   • содержимое личного набора — событиями emote_set.create/update или REST emote-sets/{id}.
 * Личные наборы — только у подписчиков 7TV (роль Subscriber), флаги набора 4 (личный) или
 * 8 (набор события 7TV), как у клиента и экранного чата.
 *
 * Методы для страницы:
 *   cosm.users {ids:[twitch id…] (≤200), channelId} → {
 *     users: {id: {p: пейнт 7TV | null, b: бейдж 7TV | null, s: [наборы], x: [ключи сторонних
 *             бейджей], q: 1 — 7TV ещё спрашиваем}},
 *     paints: {id: описание}, badges: {id: {title, u:{1,2,4}}}, setV: {id набора: версия},
 *     xdefs: {ключ: {title, u:{1,2,4}, color?}} }
 *   cosm.sets {ids:[…] (≤50)} → {sets: {id: {v, list:[записи смайликов], n: название, f: флаги}}}
 * Содержимое личных наборов в cosm.users/cosm.update НЕ кладётся: там только версия (отпечаток
 * содержимого). Страница сама дозапрашивает набор (cosm.sets), только если такой версии у неё нет —
 * общий «событийный» набор, который носят десятки людей, не гоняется через порт с каждым из них.
 * Событие всем вкладкам "cosm.update" — тот же формат, что cosm.users, когда что-то ИЗМЕНИЛОСЬ
 * (выдача из EventAPI, ответ GraphQL с новым, пришло описание, сменился набор, загрузился список
 * сторонних бейджей). Человек, о котором 7TV ответил то же самое, в рассылку не попадает —
 * только в список done:[id…] (страница снимает у него q, ничего не перерисовывая).
 *
 * Сторонние бейджи регистрируют себя: CPX.cosm.addSource({name, keys(id, channelId) → [ключи],
 * def(ключ) → описание}), а после загрузки своего списка зовут CPX.cosm.sourceChanged().
 *
 * KICK (15.11). Человек с Kick — ключ "kick:<номер на Kick>" (номера Twitch и Kick — разные люди): 7TV спрашиваем
 * userByConnection(platform:KICK), выдачи EventAPI раскладываем по ВСЕМ привязкам человека в 7TV (connections TWITCH и
 * KICK — у одного 7TV-аккаунта два ключа). Сторонние бейджи (BTTV, FFZ, Chatterino…) — только Twitch.
 */

CPX.cosm = (() => {
  const log = CPX.log("cosm");
  const P = CPX.emoteParse;
  const net = CPX.net;
  const ev = new CPX.Emitter();
  const GQL = "https://7tv.io/v3/gql";
  const REST = "https://7tv.io/v3/";
  const SUB_ROLE = "01F37R3RFR0000K96678WEQT01"; // роль «Subscriber» 7TV
  const SET_PERSONAL = 4;
  const SET_COMMERCIAL = 8;
  const USER_TTL = 30 * 60000;
  const ID_RE = /^(kick:)?\d{1,20}$/;
  const OID_RE = /^[A-Za-z0-9]{1,40}$/; // идентификаторы 7TV (ULID) — идут в текст запроса

  const users = new CPX.LRU(30000); // twitch id → {p, b, s:[], at, ev}
  const asked = new CPX.LRU(30000); // кого спрашивали страницы (им шлём позднее узнанное)
  const paints = new CPX.LRU(3000); // id → описание
  const badges = new CPX.LRU(1000);
  const sets = new CPX.LRU(800); // id набора → {m: Map имя → запись, v: отпечаток} | null (не личный)
  const sources = [];
  const st = { gqlUsers: 0, gqlCosm: 0, restSets: 0, events: 0, lookFails: 0, unknown: 0, tooComplex: 0 };

  const stvOn = () =>
    CPX.settings.get("emotes.paints") !== false || CPX.settings.get("emotes.badges.stv") !== false || CPX.settings.get("emotes.stv") !== false;
  const usable = (flags) => ((+flags || 0) & (SET_PERSONAL | SET_COMMERCIAL)) !== 0;

  // ── нормализация описаний ────────────────────────────────────────────────
  const rgba = (c) => (c == null || !Number.isFinite(+c) ? null : +c >>> 0);
  function layer(g) {
    if (!g || typeof g !== "object") return null;
    const fn = ["LINEAR_GRADIENT", "RADIAL_GRADIENT", "URL"].includes(g.function) ? g.function : "LINEAR_GRADIENT";
    const out = { fn, angle: +g.angle || 0, shape: g.shape === "ellipse" ? "ellipse" : "circle", repeat: !!g.repeat };
    if (fn === "URL") out.img = typeof g.image_url === "string" ? g.image_url.slice(0, 500) : "";
    out.stops = (Array.isArray(g.stops) ? g.stops : [])
      .slice(0, 32)
      .map((s) => [Math.min(1, Math.max(0, +s.at || 0)), rgba(s.color)])
      .filter((s) => s[1] != null);
    if (Array.isArray(g.at) && g.at.length === 2) out.at = [+g.at[0] || 0, +g.at[1] || 0];
    // Размер слоя: в EventAPI — size, в GraphQL — canvas_size.
    const size = Array.isArray(g.size) ? g.size : g.canvas_size;
    if (Array.isArray(size) && size.length === 2) out.size = [+size[0] || 1, +size[1] || 1];
    if (typeof g.canvas_repeat === "string" && /^[a-z-]{0,20}$/.test(g.canvas_repeat)) out.rep = g.canvas_repeat;
    return out;
  }
  function normPaint(d) {
    if (!d || !d.id) return null;
    const layers = (Array.isArray(d.gradients) && d.gradients.length ? d.gradients : [d]).slice(0, 6).map(layer).filter(Boolean);
    return {
      id: String(d.id).slice(0, 40),
      name: String(d.name || "").slice(0, 60),
      color: rgba(d.color),
      layers,
      shadows: (Array.isArray(d.shadows) ? d.shadows : [])
        .slice(0, 4)
        .map((s) => [+s.x_offset || 0, +s.y_offset || 0, Math.max(0, +s.radius || 0), rgba(s.color)])
        .filter((s) => s[3] != null),
    };
  }
  function normBadge(d) {
    if (!d || !d.id) return null;
    const host = d.host || {};
    let base = String(host.url || "");
    if (!base) return null;
    if (base.startsWith("//")) base = "https:" + base;
    const files = (host.files || []).filter((f) => f && (!f.format || f.format === "WEBP")).map((f) => f.name);
    // Первое имеющееся из списка; список файлов не пришёл — стандартные имена 7TV.
    const pick = (...names) => base + "/" + (files.length ? names.find((n) => files.includes(n)) || "1x.webp" : names[0]);
    return {
      id: String(d.id).slice(0, 40),
      title: String(d.tooltip || d.name || "7TV").slice(0, 80),
      u: { 1: pick("1x.webp"), 2: pick("2x.webp", "1x.webp"), 4: pick("4x.webp", "3x.webp", "2x.webp", "1x.webp") },
    };
  }

  // ── накопление изменений и рассылка ──────────────────────────────────────
  // done — о ком 7TV ответил «то же самое»: странице только снять «ещё спрашиваем» (q).
  // forget — о ком НЕ узнали (сбой, пауза, сервер не знает): странице забыть его и спросить снова, когда он появится.
  const dirty = { users: new Set(), paints: new Set(), badges: new Set(), sets: new Set(), done: new Set(), forget: new Set() };
  const setVer = (id) => {
    const s = sets.get(id);
    return s ? s.v : "";
  };
  const flushSoon = CPX.debounce(CPX.guard("cosm:flush", flush), 250);
  function mark(kind, id) {
    dirty[kind].add(id);
    flushSoon();
  }

  function userOut(id, channelId, out) {
    const rec = users.get(id);
    const u = { p: null, b: null, s: [], x: [] };
    if (rec) {
      u.p = rec.p || null;
      u.b = rec.b || null;
      u.s = rec.s || [];
    } else if (stvOn()) u.q = 1;
    for (const src of id.startsWith("kick:") ? [] : sources) {
      try {
        for (const k of src.keys(id, channelId) || []) {
          u.x.push(k);
          if (out && !out.xdefs[k]) {
            const d = src.def(k);
            if (d) out.xdefs[k] = d;
          }
        }
      } catch (e) {
        CPX.report("cosm:source:" + src.name, e);
      }
    }
    if (out) {
      if (u.p && paints.has(u.p)) out.paints[u.p] = paints.get(u.p);
      if (u.b && badges.has(u.b)) out.badges[u.b] = badges.get(u.b);
      for (const s of u.s) if (setVer(s)) out.setV[s] = setVer(s);
    }
    return u;
  }

  function flush() {
    if (!dirty.users.size && !dirty.paints.size && !dirty.badges.size && !dirty.sets.size && !dirty.done.size && !dirty.forget.size) return;
    const out = { users: {}, paints: {}, badges: {}, setV: {}, xdefs: {} };
    for (const id of dirty.users) {
      const ch = asked.map.get(id); // канал, из которого спрашивали (бейджи FFZ канала)
      out.users[id] = userOut(id, typeof ch === "string" ? ch : null, out);
    }
    for (const id of dirty.paints) if (paints.has(id)) out.paints[id] = paints.get(id);
    for (const id of dirty.badges) if (badges.has(id)) out.badges[id] = badges.get(id);
    for (const id of dirty.sets) if (setVer(id)) out.setV[id] = setVer(id);
    const done = [...dirty.done].filter((id) => !dirty.users.has(id));
    if (done.length) out.done = done;
    const forget = [...dirty.forget].filter((id) => !dirty.users.has(id) && !users.has(id));
    if (forget.length) out.forget = forget;
    for (const k in dirty) dirty[k].clear();
    CPX.router.broadcast("cosm.update", out);
  }

  // ── описания пейнтов/бейджей по номерам (GraphQL пачкой) ─────────────────
  const defWant = new Set();
  const defFails = new Map();
  let defBusy = false;
  let defNextAt = 0; // не раньше: после сбоя — пауза defBo, и новые номера в очереди её не обходят
  const defBo = new net.Backoff();
  let defT = 0;
  const defSoon = CPX.debounce(() => defBatch(), 300);

  /* Режим зеркала (PLUS, 7TV напрямую не открывается). Белый список сервера пропускает к GraphQL
   * 7TV ТОЛЬКО «все пейнты» или «один пейнт по номеру», без бейджей (mirror.py GQL_RE) — пачка
   * по номерам с бейджами через зеркало отвергается, и пейнты приходили бы только событиями.
   * Берём ПО ОДНОМУ номеру: полный каталог весит ~6 МБ (замер 29.09), а за сеанс нужны десятки
   * пейнтов по ~6 КБ; сервер кэширует каждый ответ. Бейджи 7TV в этом режиме приходят событиями
   * трубы EventAPI. ⚠️Текст запроса должен совпадать с шаблоном сервера посимвольно: «query{…}»,
   * без запятых в выборке, выборка ≤400 знаков. */
  const PAINT_SEL =
    "id name function color angle shape image_url repeat stops{at color} gradients{function canvas_repeat canvas_size at stops{at color} image_url shape angle repeat} shadows{x_offset y_offset radius color}";
  const onePaintQ = (id) => "query{cosmetics(list:[" + JSON.stringify(id) + "]){paints{" + PAINT_SEL + "}}}";
  function viaMirrorFirst() {
    try {
      const M = CPX.mirror;
      if (!M || typeof M.route !== "function") return false;
      // Тело — строкой, как уйдёт в сеть: маршрутизатор сверяет её с белым списком сервера.
      const r = M.route(GQL, "POST", JSON.stringify({ query: onePaintQ("01FQ8S87J8000BDD0YMN21KEXG") }));
      return !!(r && r.mirrorable && r.mirrorFirst);
    } catch (_) {
      return false;
    }
  }
  /** По одному номеру через зеркало → null (всё прошло) или ответ, на котором сорвалось (номера вернуть в очередь).
   *  Первый же сбой — стоп: остальные номера через тот же сломанный путь не гоним (поток запросов, 18.11). */
  async function defViaMirror(ids) {
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      st.gqlCosm++;
      const r = await net.fetchJSON(GQL, { method: "POST", body: { query: onePaintQ(id) }, timeout: 15000, retries: 0, full: true });
      const d = r.ok ? r.data : null;
      const list = d && d.data && d.data.cosmetics && d.data.cosmetics.paints;
      if (!Array.isArray(list)) {
        // Сбой — этот и оставшиеся номера вернуть в очередь, но не больше трёх попыток на номер (как у прямого пути).
        for (const x of ids.slice(i)) {
          const n = (defFails.get(x) || 0) + 1;
          defFails.set(x, n);
          if (n <= 3) defWant.add(x);
        }
        return r;
      }
      for (const raw of list) {
        const n = normPaint(raw);
        if (n) {
          paints.set(n.id, n);
          mark("paints", n.id);
        }
      }
      // Пусто — это бейдж или неизвестный номер: ждём событие трубы, повторно не просим.
    }
    return null;
  }

  function needDef(id) {
    if (!id || !OID_RE.test(id) || paints.has(id) || badges.has(id)) return;
    defWant.add(id);
    defSoon();
  }
  async function defBatch() {
    if (defBusy || !defWant.size) return;
    const wait = defNextAt - Date.now();
    if (wait > 0) {
      if (!defT) defT = setTimeout(() => ((defT = 0), defBatch()), wait);
      return;
    }
    defBusy = true;
    const ids = [...defWant].slice(0, 50);
    ids.forEach((i) => defWant.delete(i));
    if (viaMirrorFirst()) {
      let bad = null;
      try {
        bad = await defViaMirror(ids.filter((i) => !badges.has(i)));
      } catch (e) {
        bad = { status: 0 };
        CPX.report("cosm:mirror", e);
      }
      defBusy = false;
      if (bad) defBo.fail(bad);
      else defBo.ok();
      defNextAt = bad ? defBo.until : Date.now() + 300;
      if (defWant.size) defBatch();
      return;
    }
    const q =
      "{cosmetics(list:[" +
      ids.map((i) => JSON.stringify(i)).join(",") +
      "]){paints{id name function color angle shape image_url repeat stops{at color} gradients{function canvas_repeat canvas_size at stops{at color} image_url shape angle repeat} shadows{x_offset y_offset radius color}} badges{id name tooltip host{url files{name format}}}}}";
    st.gqlCosm++;
    const r = await net.fetchJSON(GQL, { method: "POST", body: { query: q }, timeout: 15000, retries: 0, full: true });
    defBusy = false;
    const d = r.ok ? r.data : null;
    const c = d && d.data && d.data.cosmetics;
    if (!c) {
      // Сбой — вернуть в очередь (до трёх попыток на номер), иначе ник так и остался бы без пейнта.
      for (const i of ids) {
        const n = (defFails.get(i) || 0) + 1;
        defFails.set(i, n);
        if (n <= 3) defWant.add(i);
      }
      if (defFails.size > 2000) defFails.clear();
    }
    if (c) {
      for (const p of c.paints || []) {
        const n = normPaint(p);
        if (n) {
          paints.set(n.id, n);
          mark("paints", n.id);
        }
      }
      for (const b of c.badges || []) {
        const n = normBadge(b);
        if (n) {
          badges.set(n.id, n);
          mark("badges", n.id);
        }
      }
    }
    if (c) defBo.ok();
    else defBo.fail(r);
    defNextAt = c ? Date.now() + 300 : defBo.until;
    if (defWant.size) defBatch();
  }

  // ── личные наборы ────────────────────────────────────────────────────────
  const setQueue = [];
  const setFails = new Map();
  const setBo = new net.Backoff();
  let setBusy = false;
  let setT = 0;
  function needSet(id) {
    if (!id || !OID_RE.test(id) || setQueue.includes(id)) return;
    // Уже знаем. Исключение — пустой набор, заведённый событием emote_set.create: если правки
    // с содержимым прошли мимо нас (подписались позже), набор так и остался бы пустым.
    const cur = sets.get(id);
    if (cur === null || (cur && !(cur.ev && !cur.m.size))) return;
    setQueue.push(id);
    if (setQueue.length > 200) setQueue.shift();
    pumpSets();
  }
  async function pumpSets() {
    if (setBusy || !setQueue.length) return;
    // Пауза после сбоя — и для новых наборов в очереди (раньше каждый новый шёл сразу, мимо паузы: замер 18.11).
    if (!setBo.ready()) {
      if (!setT) setT = setTimeout(() => ((setT = 0), pumpSets()), setBo.left() + 50);
      return;
    }
    setBusy = true;
    const id = setQueue.shift();
    st.restSets++;
    const r = await net.fetchJSON(REST + "emote-sets/" + id, { timeout: 15000, missingOk: true, retries: 0, full: true });
    const d = r.ok ? r.data : null;
    if (d) setBo.ok();
    else setBo.fail(r);
    if (d && d.id) {
      if (d.flags != null && !usable(d.flags)) sets.set(id, null);
      else {
        // Фильтр «только одобренные для личного использования» — лишь у набора с флагом 7TV
        // «личный» (4), как клиент (SeventvEmotes.cpp:1080); событийные наборы (NNYS…) — как есть.
        const personal = ((+d.flags || 0) & 4) === 4;
        const m = P.toMap((d.emotes || []).map((x) => P.stv(x, { personal })));
        const v = P.sig(m);
        const was = sets.get(id);
        // n, f — название и флаги набора: меню смайликов показывает каждый личный набор
        // своим разделом с названием, личный (флаг 4) — первым, как 7TV.
        sets.set(id, { m, v, n: String(d.name || "").slice(0, 80), f: +d.flags || 0 });
        if (!was || was.v !== v) mark("sets", id);
      }
    } else if (d) sets.set(id, null); // 404 — набора нет
    else {
      // Сбой — ещё попытка позже (до трёх раз).
      const n = (setFails.get(id) || 0) + 1;
      setFails.set(id, n);
      if (n <= 3) setQueue.push(id);
      if (setFails.size > 1000) setFails.clear();
    }
    setBusy = false;
    if (setQueue.length && !setT) setT = setTimeout(() => ((setT = 0), pumpSets()), d ? 250 : setBo.left() + 50);
  }

  function userRec(id) {
    let r = users.get(id);
    if (!r) {
      r = { p: null, b: null, s: [], at: 0, ev: 0 };
      users.set(id, r);
    }
    return r;
  }

  // ── пачка людей в GraphQL ────────────────────────────────────────────────
  const lookQ = [];
  const lookSet = new Set();
  let lookT = 0;
  let lookBusy = false;
  let lastBatch = 0;
  const lookBo = new net.Backoff(); // пауза после сбоев пачки (см. шапку)
  const later = new CPX.LRU(5000); // человек → не спрашивать раньше (сервер о нём не узнал)
  const LATER_MS = 60000;
  let batchSize = 40; // людей в пачке (см. шапку «ПРЕДЕЛ СЛОЖНОСТИ»); после отказа «слишком сложно» — вдвое меньше
  const PROBE = 50; // пока пауза — в очереди не больше одной пробной пачки

  /** Не спросили и не спросим сейчас — странице забыть его (спросит снова, когда человек появится). */
  function forget(id) {
    lookSet.delete(id);
    mark("forget", id);
  }
  function needUser(id) {
    if (!stvOn() || !ID_RE.test(id) || lookSet.has(id)) return;
    const r = users.get(id);
    if (r && Date.now() - r.at < USER_TTL) return;
    const t = later.get(id);
    if ((t && Date.now() < t) || (!lookBo.ready() && lookQ.length >= PROBE)) return forget(id);
    lookSet.add(id);
    lookQ.push(id);
    if (lookQ.length > 3000) forget(lookQ.shift());
    scheduleLook();
  }
  function scheduleLook() {
    if (lookT || lookBusy || !lookQ.length) return;
    // Людный чат: полная пачка — сразу, но не чаще раза в 1,5 с; неполную копим до 3 с —
    // меньше запросов к 7TV (активных людей 7TV и так приносит EventAPI). После сбоя — не раньше конца паузы.
    const gap = Math.max(0, lastBatch + 1500 - Date.now(), lookBo.left());
    lookT = setTimeout(() => {
      lookT = 0;
      lookBatch();
    }, Math.max(gap, lookQ.length >= batchSize ? 0 : 3000));
  }
  async function lookBatch() {
    const ids = lookQ.splice(0, batchSize);
    if (!ids.length) return;
    lookBusy = true;
    lastBatch = Date.now();
    const q =
      "{" +
      ids
        .map((t, i) => {
          const [platform, id] = t.startsWith("kick:") ? ["KICK", t.slice(5)] : ["TWITCH", t];
          return "a" + i + ":userByConnection(platform:" + platform + ',id:"' + id + '"){style{paint_id badge_id} roles emote_sets(entitled:true){id flags}}';
        })
        .join(" ") +
      "}";
    st.gqlUsers++;
    const res = await net.fetchJSON(GQL, { method: "POST", body: { query: q }, timeout: 15000, retries: 0, full: true });
    lookBusy = false;
    const data = res.ok && res.data && typeof res.data.data === "object" ? res.data.data : null;
    const errs = res.ok && res.data && Array.isArray(res.data.errors) ? res.data.errors : [];
    if (!data && ids.length > 1 && errs.some((e) => /too complex/i.test(String((e && e.message) || "")))) {
      // Предел сложности 7TV: не сбой 7TV — те же люди снова в очередь, пачки вдвое меньше.
      CPX.report("cosm:too-complex", new Error("7TV: Query is too complex (пачка " + ids.length + ")"));
      st.tooComplex++;
      batchSize = Math.max(1, Math.min(batchSize, Math.floor(ids.length / 2)));
      lookQ.unshift(...ids);
      scheduleLook();
      return;
    }
    if (!data) {
      // Сбой, предел, отказ зеркала, ошибка GraphQL целиком — пауза; этих и очередь сверх пробной пачки — забыть.
      lookBo.fail(res);
      st.lookFails++;
      for (const t of ids) forget(t);
      while (lookQ.length > PROBE) forget(lookQ.pop());
      scheduleLook();
      return;
    }
    lookBo.ok();
    ids.forEach((t, i) => {
      lookSet.delete(t);
      // Псевдонима нет в data (он в errors): сервер не узнал — не «косметики нет».
      if (!Object.hasOwn(data, "a" + i)) {
        later.set(t, Date.now() + LATER_MS);
        st.unknown++;
        mark("forget", t);
        return;
      }
      const u = data["a" + i] || {};
      const style = u.style || {};
      const r = userRec(t);
      const fresh = r.ev && Date.now() - r.ev < 10 * 60000; // выдача из EventAPI свежее
      const before = JSON.stringify([r.p, r.b, r.s]);
      if (!fresh) {
        r.p = typeof style.paint_id === "string" && OID_RE.test(style.paint_id) ? style.paint_id : null;
        r.b = typeof style.badge_id === "string" && OID_RE.test(style.badge_id) ? style.badge_id : null;
      }
      if ((u.roles || []).includes(SUB_ROLE)) {
        const s = (u.emote_sets || []).filter((x) => x && usable(x.flags) && OID_RE.test(x.id)).map((x) => x.id);
        r.s = [...new Set(r.s.concat(s))].slice(0, 8);
      }
      r.at = Date.now();
      if (r.p) needDef(r.p);
      if (r.b) needDef(r.b);
      for (const s of r.s) needSet(s);
      // Рассылаем, только если 7TV сказал НОВОЕ: «то же самое» и «ничего» страница уже знает
      // (иначе каждая пачка перерисовывала бы у всех строки этих людей впустую).
      if (before !== JSON.stringify([r.p, r.b, r.s])) mark("users", t);
      else if (asked.has(t)) mark("done", t);
    });
    scheduleLook();
  }

  // ── события EventAPI ─────────────────────────────────────────────────────
  /** Наши ключи человека из 7TV: номер Twitch и "kick:<номер>" — по его привязкам. */
  function keysOf(u) {
    const out = [];
    for (const x of (u && u.connections) || []) {
      if (!x || !/^\d{1,20}$/.test(String(x.id))) continue;
      if (x.platform === "TWITCH") out.push(String(x.id));
      else if (x.platform === "KICK") out.push("kick:" + x.id);
    }
    return out;
  }

  function onDispatch(type, body) {
    st.events++;
    const o = (body && body.object) || {};
    if (type === "cosmetic.create") {
      if (o.kind === "PAINT" && o.data) {
        const n = normPaint(o.data);
        if (n) {
          paints.set(n.id, n);
          mark("paints", n.id);
        }
      } else if (o.kind === "BADGE" && o.data) {
        const n = normBadge(o.data);
        if (n) {
          badges.set(n.id, n);
          mark("badges", n.id);
        }
      }
    } else if (type === "entitlement.create" || type === "entitlement.delete") {
      const keys = keysOf(o.user);
      const ref = String(o.ref_id || "");
      if (!keys.length || !OID_RE.test(ref) || !["PAINT", "BADGE", "EMOTE_SET"].includes(o.kind)) return;
      const on = type === "entitlement.create";
      for (const tid of keys) {
        const r = userRec(tid);
        if (o.kind === "PAINT") r.p = on ? ref : r.p === ref ? null : r.p;
        else if (o.kind === "BADGE") r.b = on ? ref : r.b === ref ? null : r.b;
        else r.s = on ? [...new Set(r.s.concat(ref))].slice(0, 8) : r.s.filter((x) => x !== ref);
        r.ev = Date.now();
        if (!r.at) r.at = Date.now();
        mark("users", tid);
      }
      if (on && o.kind === "EMOTE_SET") needSet(ref);
      if (on && (o.kind === "PAINT" || o.kind === "BADGE")) needDef(ref);
    } else if (type === "entitlement.reset") {
      // Как клиент (eventapi/Client.cpp:212, SeventvBadges::onEntitlementReset): сброс приходит
      // при переподключении/массовой переподписке — ДОБАВЛЯЕМ бейдж из него (и описание, если
      // оно вложено), но ничего не стираем, иначе переподключение снимало бы бейджи.
      if (o.kind !== "BADGE") return;
      const ref = String(o.ref_id || "");
      if (o.data && o.data.host) {
        const n = normBadge(Object.assign({ id: ref }, o.data));
        if (n && JSON.stringify(badges.get(n.id) || null) !== JSON.stringify(n)) {
          badges.set(n.id, n);
          mark("badges", n.id);
        }
      }
      if (!OID_RE.test(ref)) return;
      let any = false;
      for (const tid of keysOf(o.user)) {
        const r = userRec(tid);
        if (r.b === ref) continue;
        r.b = ref;
        r.ev = Date.now();
        if (!r.at) r.at = Date.now();
        mark("users", tid);
        any = true;
      }
      if (any) needDef(ref);
    } else if (type === "emote_set.create") {
      // Личный набор/набор события: содержимое придёт следом правками emote_set.update.
      if (o.id && OID_RE.test(o.id) && usable(o.flags) && !sets.get(o.id)) sets.set(o.id, { m: new Map(), v: "", ev: 1, n: String(o.name || "").slice(0, 80), f: +o.flags || 0 });
    } else if (type === "emote_set.update") {
      const s = body && body.id && sets.get(body.id);
      if (!s) return;
      const res = P.applyStvChanges(s.m, body);
      if (res.changed) {
        s.v = P.sig(s.m);
        mark("sets", body.id);
      }
      if (res.reload) {
        sets.delete(body.id);
        needSet(body.id);
      }
    }
  }

  CPX.stvEvents.on("dispatch", CPX.guard("cosm:dispatch", onDispatch));

  // ── метод для страницы ───────────────────────────────────────────────────
  CPX.router.handle(
    "cosm.users",
    (p) => {
      const ids = (Array.isArray(p.ids) ? p.ids : []).slice(0, 200).map(String).filter((x) => ID_RE.test(x));
      const channelId = ID_RE.test(String(p.channelId || "")) ? String(p.channelId) : null;
      const out = { users: {}, paints: {}, badges: {}, setV: {}, xdefs: {} };
      for (const id of ids) {
        asked.set(id, channelId || 1);
        needUser(id);
        const u = userOut(id, channelId, out);
        if (u.p && !out.paints[u.p]) needDef(u.p);
        if (u.b && !out.badges[u.b]) needDef(u.b);
        for (const s of u.s) if (!out.setV[s]) needSet(s);
        out.users[id] = u;
      }
      return out;
    },
    { page: true }
  );

  // Содержимое наборов — по запросу страницы, когда у неё нет такой версии.
  CPX.router.handle(
    "cosm.sets",
    (p) => {
      const out = { sets: {} };
      for (const id of (Array.isArray(p.ids) ? p.ids : []).slice(0, 50).map(String)) {
        if (!OID_RE.test(id)) continue;
        const s = sets.get(id);
        if (s && s.v) out.sets[id] = { v: s.v, list: [...s.m.values()], n: s.n || "", f: s.f || 0 };
        else if (s === undefined) needSet(id);
      }
      return out;
    },
    { page: true }
  );

  // Включили косметику 7TV — тех, о ком спрашивали, спросить у 7TV заново.
  CPX.settings.on((applied) => {
    if (["emotes.paints", "emotes.badges.stv", "emotes.stv"].some((k) => applied[k] === true)) {
      for (const id of [...asked.map.keys()].slice(-500)) needUser(id);
    }
  });

  CPX.diag.add("cosm", () => ({
    users: users.size,
    withPaint: [...users.map.values()].filter((r) => r.p).length,
    withBadge: [...users.map.values()].filter((r) => r.b).length,
    withSets: [...users.map.values()].filter((r) => r.s.length).length,
    paints: paints.size,
    badges: badges.size,
    sets: sets.size,
    asked: asked.size,
    queue: lookQ.length,
    stats: Object.assign({}, st),
  }));

  return {
    ev,
    addSource(src) {
      sources.push(src);
    },
    /** Источник сторонних бейджей загрузился/сменился: разослать тем, о ком спрашивали. */
    sourceChanged() {
      for (const [id, ch] of asked.map) {
        for (const src of sources) {
          let ks = null;
          try {
            ks = src.keys(id, typeof ch === "string" ? ch : null);
          } catch (_) {
            /* мимо */
          }
          if (ks && ks.length) {
            mark("users", id);
            break;
          }
        }
      }
      flushSoon();
    },
    user: (id) => users.get(String(id)) || null,
    /** Только для стенда проверки (dev): подать событие EventAPI, как от сокета. */
    _dispatch: CPX.dev ? onDispatch : undefined,
    paint: (id) => paints.get(id) || null,
    badge: (id) => badges.get(id) || null,
  };
})();

// ── src/bg/36_badges3p.js ──
/* Фон: сторонние бейджи — BTTV, FFZ (+ бейджи FFZ канала), Chatterino, Chatterino Homies, FFZ:AP.
 *
 * Каждый источник грузится, только когда включён в настройках (Chatterino, Homies, FFZ:AP по
 * умолчанию выключены), и обновляется раз в 6 часов. Списки хранятся компактно:
 * ключ бейджа → описание {title, u:{1,2,4}, color?} и ключ → [twitch id]; по человеку — индекс.
 * Быстрый старт — chrome.storage.local; Homies-1 (≈4 МБ) — в Cache Storage фона: в
 * chrome.storage.local у расширения без unlimitedStorage всего 10 МБ на всё.
 * Перезагрузка по таймеру с тем же содержимым (отпечаток) людям не рассылается.
 * Ключи бейджей: "<источник>:<id>" — по приставке страница ставит их в порядке клиента.
 * В косметику людей (35_cosmetics) подключается как источник CPX.cosm.addSource.
 */

(() => {
  const log = CPX.log("badges3p");
  const net = CPX.net;
  const TTL = 6 * 3600000;
  const KEY = "cpx.b3.";

  const SOURCES = {
    bttv: {
      setting: "emotes.badges.bttv",
      store: true,
      async load() {
        const d = await net.fetchJSON("https://api.betterttv.net/3/cached/badges/twitch", { timeout: 15000 });
        if (!Array.isArray(d)) return null;
        const defs = {};
        const lists = {};
        for (const b of d) {
          if (!b || !b.badge || !b.badge.svg || !b.providerId) continue;
          // Бейдж BTTV — по виду (type): один на всех с этим видом.
          const k = "bttv:" + (b.badge.type != null ? b.badge.type : b.badge.svg);
          if (!defs[k]) defs[k] = { title: String(b.badge.description || "BetterTTV").slice(0, 80), u: { 1: b.badge.svg, 2: b.badge.svg, 4: b.badge.svg } };
          (lists[k] = lists[k] || []).push(String(b.providerId));
        }
        return { defs, lists };
      },
    },
    ffz: {
      setting: "emotes.badges.ffz",
      store: true,
      async load() {
        // ⚠️Ответ ≈400 КБ и FFZ отвечает медленно (у нас до 18 с) — ждём долго, грузим редко.
        const d = await net.fetchJSON("https://api.frankerfacez.com/v1/badges/ids", { timeout: 40000 });
        if (!d || !Array.isArray(d.badges)) return null;
        const defs = {};
        const lists = {};
        for (const b of d.badges) {
          if (!b || !b.urls || b.id == null) continue;
          const k = "ffz:" + b.id;
          defs[k] = {
            title: String(b.title || "FrankerFaceZ").slice(0, 80),
            u: { 1: b.urls["1"], 2: b.urls["2"] || b.urls["1"], 4: b.urls["4"] || b.urls["2"] || b.urls["1"] },
            // Картинка FFZ — белый знак на цвете бейджа.
            color: typeof b.color === "string" ? b.color : null,
          };
        }
        for (const bid of Object.keys(d.users || {})) {
          if (defs["ffz:" + bid]) lists["ffz:" + bid] = (d.users[bid] || []).map(String);
        }
        return { defs, lists };
      },
    },
    chatterino: {
      setting: "emotes.badges.chatterino",
      store: true,
      load: () => chatterinoLike("chatterino", "https://api.chatterino.com/badges"),
    },
    // Chatterino Homies — как их клиент: свой загруженный бейдж и два общих списка.
    homies1: { setting: "emotes.badges.homies", store: "cache", load: () => chatterinoLike("homies1", "https://chatterinohomies.com/api/badges/list", 40000) },
    homies2: { setting: "emotes.badges.homies", store: true, load: () => chatterinoLike("homies2", "https://itzalex.github.io/badges") },
    homies3: { setting: "emotes.badges.homies", store: true, load: () => chatterinoLike("homies3", "https://itzalex.github.io/badges2") },
    ffzap: {
      setting: "emotes.badges.ffzap",
      store: true,
      async load() {
        const d = await net.fetchJSON("https://api.ffzap.com/v1/supporters", { timeout: 15000 });
        if (!Array.isArray(d)) return null;
        const defs = {};
        const lists = {};
        for (const s of d) {
          if (!s || !/^\d{1,20}$/.test(String(s.id))) continue;
          const k = "ffzap:" + s.id;
          const u = "https://api.ffzap.com/v1/user/badge/" + s.id + "/";
          defs[k] = { title: "FFZ:AP Supporter", u: { 1: u + "1", 2: u + "2", 4: u + "3" }, color: s.badge_is_colored ? null : s.badge_color || null };
          lists[k] = [String(s.id)];
        }
        return { defs, lists };
      },
    },
  };

  // Формат Chatterino и Homies: {badges:[{tooltip, image1..3, users[] | userId}]}.
  async function chatterinoLike(src, url, timeout) {
    const d = await net.fetchJSON(url, { timeout: timeout || 15000 });
    if (!d || !Array.isArray(d.badges)) return null;
    const defs = {};
    const lists = {};
    d.badges.forEach((b, i) => {
      if (!b || !b.image1) return;
      const k = src + ":" + (b.id != null ? String(b.id).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40) || i : i);
      defs[k] = { title: String(b.tooltip || "").slice(0, 80), u: { 1: b.image1, 2: b.image2 || b.image1, 4: b.image3 || b.image2 || b.image1 } };
      const ids = (b.users || []).map(String);
      if (b.userId) ids.push(String(b.userId));
      lists[k] = (lists[k] || []).concat(ids);
    });
    return { defs, lists };
  }

  // ── хранилище ─────────────────────────────────────────────────────────────
  // Cache Storage понимает только http(s)-адреса как ключи; этот адрес никуда не запрашивается.
  const CACHE = "cpx-badges3p";
  const cacheKey = (name) => "https://cpx.invalid/b3/" + name;
  async function readStore(name, how) {
    if (how === "cache") {
      const r = await (await caches.open(CACHE)).match(cacheKey(name));
      return r ? await r.json() : null;
    }
    const r = await chrome.storage.local.get(KEY + name);
    return (r && r[KEY + name]) || null;
  }
  async function writeStore(name, how, d) {
    if (how === "cache") {
      await (await caches.open(CACHE)).put(cacheKey(name), new Response(JSON.stringify(d), { headers: { "Content-Type": "application/json" } }));
      return;
    }
    await chrome.storage.local.set({ [KEY + name]: d });
  }

  // ── состояние ─────────────────────────────────────────────────────────────
  const state = {}; // имя → {defs, byUser: Map id → [ключи], at, sig, job, tries}
  for (const name of Object.keys(SOURCES)) state[name] = { defs: {}, byUser: new Map(), at: 0, sig: "", job: null, tries: 0, restored: false };

  function index(s, data) {
    s.defs = data.defs || {};
    const by = new Map();
    for (const k of Object.keys(data.lists || {})) {
      for (const id of data.lists[k]) {
        const list = by.get(id);
        if (list) list.push(k);
        else by.set(id, [k]);
      }
    }
    s.byUser = by;
  }

  const enabled = (name) => CPX.settings.get(SOURCES[name].setting) === true;

  async function ensure(name, force) {
    const src = SOURCES[name];
    const s = state[name];
    if (!enabled(name)) return;
    if (s.job) return s.job;
    s.job = (async () => {
      if (!s.restored && src.store) {
        s.restored = true;
        try {
          const d = await readStore(name, src.store);
          if (d && d.defs && !s.at) {
            index(s, d);
            s.at = d.at || 1;
            s.sig = d.sig || "";
            CPX.cosm.sourceChanged();
          }
        } catch (_) {
          /* мимо */
        }
      }
      if (!force && s.at && Date.now() - s.at < TTL) return;
      const data = await src.load().catch((e) => (CPX.report("badges3p:" + name, e), null));
      if (!data) {
        // Сбой — ещё попытка через 1–2 мин, до 5 раз (потом — при следующем обходе).
        if (s.tries++ < 5) setTimeout(() => ensure(name), 60000 * (1 + Math.random()));
        return;
      }
      s.tries = 0;
      s.at = Date.now();
      const sig = CPX.emoteParse.sig([data.defs, data.lists]);
      const same = sig === s.sig;
      if (!same) {
        index(s, data);
        s.sig = sig;
        CPX.cosm.sourceChanged();
      }
      if (src.store) {
        try {
          await writeStore(name, src.store, { at: s.at, sig, defs: data.defs, lists: data.lists });
        } catch (e) {
          log.warn("не удалось сохранить бейджи", name, e && e.message);
        }
      }
    })().finally(() => (s.job = null));
    return s.job;
  }

  function ensureAll() {
    if (!CPX.router.tabs.size) return;
    for (const name of Object.keys(SOURCES)) ensure(name);
  }

  // Источник для косметики людей. Порядок источников = порядок ключей у человека.
  CPX.cosm.addSource({
    name: "badges3p",
    keys(id, channelId) {
      let out = null;
      for (const name of Object.keys(SOURCES)) {
        if (!enabled(name)) continue;
        const ks = state[name].byUser.get(id);
        if (ks) out = (out || []).concat(ks);
      }
      // Бейджи FFZ этого канала (room.user_badge_ids): того же бейджа из общего списка
      // у человека может уже быть — не дублируем.
      if (channelId && enabled("ffz")) {
        const room = CPX.emoteStore.ffzRoom(channelId);
        const ub = room && room.userBadgeIds;
        if (ub) {
          for (const bid of Object.keys(ub)) {
            const k = "ffz:" + bid;
            if (!state.ffz.defs[k] || (out && out.includes(k))) continue;
            if ((ub[bid] || []).some((u) => String(u) === id)) out = (out || []).concat(k);
          }
        }
      }
      return out || [];
    },
    def(k) {
      const name = k.slice(0, k.indexOf(":"));
      const s = state[name];
      return (s && s.defs[k]) || null;
    },
  });

  CPX.router.ev.on("tab:open", () => ensureAll());
  CPX.emoteStore.ev.on("ffzRoom", () => CPX.cosm.sourceChanged());
  CPX.settings.on((applied) => {
    if (!Object.keys(applied).some((k) => k.startsWith("emotes.badges."))) return;
    ensureAll();
    CPX.cosm.sourceChanged();
  });

  CPX.boot.add(
    "badges3p",
    () => {
      ensureAll();
      setInterval(CPX.guard("badges3p:tick", ensureAll), 30 * 60000);
    },
    36
  );

  CPX.diag.add("badges3p", () => {
    const out = {};
    for (const name of Object.keys(SOURCES)) {
      const s = state[name];
      out[name] = { on: enabled(name), users: s.byUser.size, badges: Object.keys(s.defs).length, loaded: !!s.at };
    }
    return out;
  });
})();

// ── src/bg/37_plus_roster.js ──
/* Фон: список подписчиков PLUS — публичное API /api/v1/plus/roster нашего сервера.
 *
 * АДРЕС (задание основного чата 18.11, решение владельца 18.11 «без туннеля»): перед chat.eblo.id хостер ставит
 * «проверку браузера» — фону отвечает 403 со страницей Browser Check. Поэтому основной адрес — ws.chat.eblo.id (там
 * проверки нет, ответы те же), запасной — chat.eblo.id; туннель ws.rish098.xyz для списка НЕ берём. Сбой адреса —
 * любой отказ, ответ не JSON или JSON не того вида: сразу одна попытка у другого адреса, удачный помним до его сбоя.
 * ETag у каждого адреса свой (30_net хранит по полному адресу). Ссылки на картинки — только из ответов сервера, как
 * есть; копия в хранилище со старыми ссылками на chat.eblo.id (до 18.11) — не доверяем: первым — полный список и каталог.
 *
 * Формат (research/03 §5.1, chat/docs/API.md): {version, users:[{id, login, badge, paint, paint_v, badge_id?,
 * months?}], paints:{"<n>":{v, spec}}, badges:{plus:{title, urls:{1x,2x,4x}}, set:{<номер>:{title, urls, light}}}}.
 *
 * ЗНАЧОК ПЕРЕД НИКОМ (сервер с 20.10, plus_badges.py): у подписчика коллекция значков по месяцам подписки,
 * badge_id — надетый (только если НЕ стандартный «m1»; нет поля — стандартный badges.plus). set — каталог:
 * картинки 1x/2x/4x тёмной темы (urls) и светлой (light); solo:true — особый значок (24.10: «own», «Владелец Chatterino+»):
 * подсказка — только его название, без стажа. Номер — только [a-z0-9], адреса — только из каталога.
 * СВЕРКА (сервер п.135, 09.11): есть своя версия (вид — шестнадцатеричный) — GET /plus/roster?since=<версия> →
 * {version, since, changes:[{login, user|null, paint|null}]} — только изменения (~70 байт без правок, ~400 с одной;
 * полный список — 34 КБ сжатого, и раньше его качала КАЖДАЯ копия после каждой правки любого подписчика: ~46 ГБ в
 * сутки на сервере). Сервер не помнит версию — полный ответ (users); ответ к чужой версии или отказ 400 — полный список
 * мимо ETag. Нет версии (первый запуск) — полный список с If-None-Match (ETag = версия). Записи changes — БЕЗ цвета ника
 * и аватарки (их даёт только сокет): применяются не «полным профилем» (applyOne(…, false)), слой не стирается.
 * Частота — раз в минуту, пока открыта хоть одна вкладка Twitch; пока список по сокету живой (CPX.plus.rosterLive:
 * сокет открыт, мы держатель, пропуск правки виден по версиям) — раз в 5 минут; сокет оборвался — снова раз в минуту.
 * Каждый срок — со случайным сдвигом ±15% (владелец 18.11: частоту оставить, «чтобы копии не ходили строем»).
 * Каталог значков в «только изменениях» не приходит — отдельно GET /plus/badges (ETag) раз в час и сразу, когда в сверке
 * сменился отпечаток bs (awSignal); надетый номер, которого нет в каталоге, — сразу мимо ETag (не чаще раза в 10 минут,
 * setLag в tick). Версия ивентов aw из сверки — в 46_awards. На наш сервер есть host_permissions.
 * Это публичный список: о человеке ничего не отправляется, поэтому работает и до согласия.
 * Быстрый старт — копия в chrome.storage.local.
 *
 * Метод для страницы: plus.roster → {version, users, paints, badge, set}.
 * Событие всем вкладкам "plus.roster" — тот же формат после изменения.
 *
 * Для модуля нашего сервера (дорожка Б): CPX.plusRoster.apply(d)
 *   d = {users:[…], paints:{…}, version} — полная замена списка (например, c7roster по сокету);
 *   d = {user:{id, login, badge, paint, paint_v, badge_id?, months?, color?} | null, login, paint:{id, v, spec},
 *        version} — правка одного человека (как кадр /plus/events: user:null — больше не подписчик);
 *   d = {layer:[{id, months, color}…]} — только стаж и цвет ника всех подписчиков (из c7roster),
 *        сам список не трогается.
 *
 * ⚠️Стаж (months; в публичном списке — только с сервера 20.10), цвет ника (color) и своя аватарка (avatar,
 * владелец 16.10 — на странице Twitch вместо аватарки Twitch, src/main/63_plus_avatars.js) в публичном
 * /plus/roster НЕТ — они приходят от сокета. Поэтому они живут отдельным СЛОЕМ по id (extra), который перезагрузка публичного
 * списка не затирает: иначе после первой же правки любого подписчика (сосед по ней перечитывает
 * список) цвета ников PLUS пропадали бы у всех. Правка человека по сокету — полный профиль:
 * нет цвета в ней — значит цвета больше нет.
 *
 * KICK (15.11, задание основного чата; сервер п.141/143). Привязка «подписчик ↔ аккаунт Kick» — поле kick {id, name}
 * профиля ТОЛЬКО по сокету (c7roster и правки профилей; в публичном /plus/roster её нет и не будет) — живёт в том же слое
 * (extra): полный профиль без kick — отвязал, с другим — перепривязал. 🔴Пару «Twitch ↔ Kick» страницам НЕ показываем:
 * вкладкам Twitch список уходит без kick (payload), вкладкам Kick — свой список (sitePayload): только привязанные, с
 * id "kick:<номер на Kick>" и без логина Twitch — страница Kick узнаёт лишь «у этого номера Kick такое оформление PLUS».
 * Сопоставление — только по номеру Kick (sender.id сообщения), никогда по нику.
 */

CPX.plusRoster = (() => {
  const log = CPX.log("plus-roster");
  // ⚠️Не называть URL: перекрыло бы встроенный конструктор адресов во всём файле.
  const BASES = ["https://ws.chat.eblo.id", "https://chat.eblo.id"]; // см. шапку «АДРЕС»
  const ROSTER_PATH = "/api/v1/plus/roster";
  const BADGES_PATH = "/api/v1/plus/badges";
  const OLD_HOST = "://chat.eblo.id/"; // старые ссылки на картинки в сохранённой копии (до 18.11)
  const BADGES_MS = 3600000;
  const KEY = "cpx.plus.roster";
  const R = { version: "", users: new Map(), paints: new Map(), badge: null, set: null, at: 0 };
  const extra = new Map(); // id → {months?, color?} — слой от сокета (см. шапку)
  const EXTRA_MAX = 20000;
  let restored = null;
  let busy = null;
  let fails = 0;
  let nextAt = 0;
  let freshAt = 0; // когда последний раз перечитывали каталог мимо ETag из-за отставшего номера значка
  let okAt = 0; // последняя удачная сверка списка
  let jit = 1; // случайный сдвиг срока текущей сверки
  let baseIdx = 0; // адрес, который ответил последним (BASES)
  let badgesAt = 0; // последняя сверка каталога значков
  let badgesBusy = null;
  const st = { since: 0, full: 0, changes: 0, mismatch: 0, badges: 0, last: "" }; // для диагностики

  const ID_RE = /^\d{1,20}$/;
  const BID_RE = /^[a-z0-9]{1,16}$/;
  const VER_RE = /^[0-9a-f]{8,64}$/; // версия списка у сервера — шестнадцатеричная (b6269703adaa4d15); иная — «?since» не шлём

  function cleanUser(u) {
    if (!u || !ID_RE.test(String(u.id || ""))) return null;
    const out = {
      id: String(u.id),
      login: String(u.login || "").toLowerCase().slice(0, 25),
      badge: u.badge !== false && u.badge !== 0,
      paint: u.paint != null && Number.isFinite(+u.paint) ? +u.paint : null,
      paint_v: +u.paint_v || 0,
    };
    if (typeof u.badge_id === "string" && BID_RE.test(u.badge_id)) out.badge_id = u.badge_id;
    if (Number.isFinite(+u.months) && +u.months > 0) out.months = Math.min(999, Math.round(+u.months));
    if (typeof u.color === "string") out.color = u.color.slice(0, 9);
    const av = CPX.safe.imgUrl(u.avatar);
    if (av) out.avatar = av;
    const k = cleanKick(u.kick);
    if (k) out.kick = k;
    return out;
  }

  /** Привязка Kick {id: номер, name: ник на Kick} или null. */
  function cleanKick(k) {
    if (!k || typeof k !== "object" || !/^\d{1,20}$/.test(String(k.id || ""))) return null;
    return { id: String(k.id), name: String(k.name || "").slice(0, 32) };
  }

  /** Запомнить стаж/цвет из записи, где они ЕСТЬ (full — полный профиль: нет цвета = нет цвета). */
  function seedExtra(u, full) {
    const x = Object.assign({}, extra.get(u.id));
    if (u.months != null) x.months = u.months;
    else if (full) delete x.months;
    if (u.color) x.color = u.color;
    else if (full) delete x.color;
    if (u.avatar) x.avatar = u.avatar;
    else if (full) delete x.avatar;
    if (u.kick) x.kick = u.kick;
    else if (full) delete x.kick;
    extra.delete(u.id);
    if (Object.keys(x).length) extra.set(u.id, x);
    if (extra.size > EXTRA_MAX) extra.delete(extra.keys().next().value);
  }

  /** Запись человека с наложенным слоем стажа/цвета/аватарки. */
  function withExtra(c) {
    const x = extra.get(c.id);
    if (!x) return c;
    const out = Object.assign({}, c);
    if (x.months != null) out.months = x.months;
    if (x.color) out.color = x.color;
    if (x.avatar) out.avatar = x.avatar;
    if (x.kick) out.kick = x.kick;
    else delete out.kick;
    return out;
  }

  /** Каталог значков перед ником: {номер: {title, title_en?, kind?, months?, urls:{1x,2x,4x}, light:{…} | null, solo}}
   *  (title_en, kind, months — с п.135 сервера 09.11; title_en — подсказка при английском интерфейсе, 62_badges). */
  function cleanSet(s) {
    const three = (u) => (u && typeof u === "object" ? { "1x": u["1x"], "2x": u["2x"], "4x": u["4x"] } : null);
    const out = {};
    // До 512: с 19.11 владелец заводит свои значки ивентов в админке, сервер ставит новые в конец — при старом пределе
    // 64 срезались бы как раз свежие (и их носители вызывали бы перекачку каталога раз в 10 минут впустую).
    for (const k of Object.keys(s).slice(0, 512)) {
      const b = s[k];
      if (!BID_RE.test(k) || !b || !b.urls) continue;
      const e = { title: String(b.title || "PLUS").slice(0, 80), urls: three(b.urls), light: three(b.light), solo: b.solo === true };
      if (typeof b.title_en === "string" && b.title_en) e.title_en = b.title_en.slice(0, 80);
      if (typeof b.kind === "string" && /^[a-z]{1,16}$/.test(b.kind)) e.kind = b.kind;
      if (Number.isFinite(+b.months) && +b.months > 0) e.months = Math.min(999, Math.round(+b.months));
      out[k] = e;
    }
    return out;
  }

  /** Отпечаток картинок значков: сменился — разослать вкладкам и при той же версии списка. */
  const lookSig = () => JSON.stringify([R.badge, R.set]);

  /** Список для вкладок Twitch (и для своего хранилища — keep: с привязками Kick). */
  function payload(keep) {
    const paints = {};
    for (const [k, v] of R.paints) paints[k] = v;
    const users = [...R.users.values()].map((u) => {
      if (keep || !u.kick) return u;
      const c = Object.assign({}, u);
      delete c.kick;
      return c;
    });
    return { version: R.version, users, paints, badge: R.badge, set: R.set };
  }

  /** Список для вкладок Kick (см. шапку): только привязанные, на номерах Kick, без логина и номера Twitch. */
  function sitePayload(site) {
    const users = [];
    const paints = {};
    for (const u of R.users.values()) {
      const link = site === "kick" ? u.kick : null;
      if (!link) continue;
      const k = Object.assign({}, u, { id: site + ":" + link.id, login: "" });
      delete k.kick;
      users.push(k);
      const p = u.paint != null && R.paints.get(String(u.paint));
      if (p) paints[String(u.paint)] = p;
    }
    return { version: R.version, users, paints, badge: R.badge, set: R.set };
  }

  function persist() {
    chrome.storage.local.set({ [KEY]: Object.assign(payload(true), { at: R.at }) }).catch(() => {});
  }

  function broadcast() {
    CPX.router.broadcast("plus.roster", payload());
    for (const site of new Set([...CPX.router.siteTabs].map((t) => t.site))) CPX.router.toSite(site, "plus.roster", sitePayload(site));
  }

  function applyFull(d) {
    if (!d || !Array.isArray(d.users)) return false;
    const users = new Map();
    for (const u of d.users) {
      const c = cleanUser(u);
      if (!c) continue;
      seedExtra(c, false); // в публичном списке этих полей нет — слой не трогается
      users.set(c.id, withExtra(c));
    }
    R.users = users;
    const paints = new Map();
    for (const k of Object.keys(d.paints || {})) {
      const p = d.paints[k];
      if (p && p.spec && typeof p.spec === "object") paints.set(String(+k), { v: +p.v || 0, spec: p.spec });
    }
    // Пейнты, которых нет в новом ответе, но кто-то их носит (правка по сокету) — оставляем.
    for (const [k, v] of R.paints) if (!paints.has(k) && [...users.values()].some((u) => String(u.paint) === k)) paints.set(k, v);
    R.paints = paints;
    // badges.* — ответ сервера; badge и set — своя копия в storage (payload). Раньше копия читалась только как
    // badges.plus, и после перезапуска фона значка PLUS не было до первой правки списка.
    const bs = d.badges || {};
    const b = bs.plus || d.badge;
    if (b && b.urls) R.badge = { title: String(b.title || "Chatterino+ PLUS").slice(0, 80), urls: { "1x": b.urls["1x"], "2x": b.urls["2x"], "4x": b.urls["4x"] } };
    const set = bs.set || d.set;
    if (set && typeof set === "object") R.set = cleanSet(set);
    if (d.version) R.version = String(d.version).slice(0, 64);
    R.at = Date.now();
    return true;
  }

  /** Один человек: d = {user | null, login, paint?}. full — полный профиль от сокета (нет в нём стажа/цвета/аватарки —
   *  значит их нет); иначе — запись публичного API (?since=): цвета ника и аватарки в ней не бывает НИКОГДА, слой не
   *  трогаем, как в applyFull (стаж — есть, обновляется). 🔴Публичная запись «полным профилем» стёрла бы человеку цвет
   *  ника и аватарку PLUS. */
  function applyOne(d, full) {
    const c = cleanUser(d.user);
    const login = String((d.user && d.user.login) || d.login || "").toLowerCase();
    for (const [k, u] of R.users) {
      if (u.login !== login) continue;
      R.users.delete(k);
      if (full || !c || k !== c.id) extra.delete(k); // тот же человек из публичной записи — слой остаётся
    }
    if (c) {
      seedExtra(c, full);
      R.users.set(c.id, withExtra(c));
    }
    if (d.paint && d.paint.id != null && d.paint.spec) R.paints.set(String(+d.paint.id), { v: +d.paint.v || 0, spec: d.paint.spec });
  }

  function restore() {
    if (!restored) {
      restored = chrome.storage.local
        .get(KEY)
        .then((r) => {
          const d = r && r[KEY];
          if (d && !R.at) {
            applyFull(d);
            R.at = d.at || 1;
            // Копия со ссылками на закрытый адрес (до п.158 сервера): не сверять «только изменения» от её версии —
            // ссылки в ней так и остались бы старыми. Полный список и каталог мимо ETag.
            if (JSON.stringify([R.badge, R.set, [...R.paints.values()]]).includes(OLD_HOST)) {
              R.version = "";
              st.migrated = 1;
            }
          }
        })
        .catch(() => {});
    }
    return restored;
  }

  /** Запрос к нашему API: текущий адрес, при сбое — сразу один раз другой (см. шапку «АДРЕС»). ok — данные нужного
   *  вида (check). → удачный ответ или сбой ПЕРВОГО адреса: пауза — по нему (ревью 19.11: chat.eblo.id фону отвечает
   *  403 «проверкой браузера», и срок «повтори через» основного адреса терялся). 400 и 429 — ответ самого сервера, другой
   *  адрес (тот же сервер) не пробуем: 400 — ?since= не принят (loadSince), 429 — «слишком часто». */
  async function api(path, opts, check) {
    let first = null;
    for (let i = 0; i < BASES.length; i++) {
      const k = (baseIdx + i) % BASES.length;
      let r = await CPX.net.fetchJSON(BASES[k] + path, Object.assign({ timeout: 15000, retries: 0, full: true }, opts));
      if (r.ok && (r.notModified || check(r.data))) {
        if (k !== baseIdx) log.info("список PLUS: адрес", BASES[k]);
        baseIdx = k;
        return r;
      }
      if (r.ok) r = { ok: false, status: 0, error: "ответ не того вида" };
      if (!first) first = r;
      if (r.status === 400 || r.status === 429) return r;
    }
    return first;
  }
  const isRoster = (d) => !!d && typeof d === "object" && (Array.isArray(d.users) || Array.isArray(d.changes));
  /** Сигналы в ответе сверки (сервер п.169, выложен 19.11), и в полном списке, и в «только изменениях»:
   *  aw — версия идущих ивентов ("" — ивентов нет; это тоже версия: иначе досрочное выключение последнего ивента ждало
   *  бы сверки раз в 10 минут) — сравнивает с последней сам 46_awards;
   *  bs — отпечаток каталога значков (владелец загрузил или заменил свой значок): сменился — каталог сразу, адресом с
   *  ?bs= (кэши по дороге примут его за новый). Сравнивать с прошлым bs, не с version каталога — это разные подписи.
   *  Первый bs после запуска — только запомнить: каталог и так сверяется при первом тике (badgesAt = 0). Принятым bs
   *  считаем, только когда каталог с ним перекачан (ревью 19.11): шла часовая сверка или сеть мигнула — tick повторит. */
  let bsSeen = null; // последний bs из сверки
  let bsDone = null; // bs, с которым каталог перекачан
  let bsTryAt = 0;
  function awSignal(d) {
    if (!d || typeof d !== "object") return;
    if (typeof d.aw === "string" && CPX.awards) CPX.awards.poke(d.aw.slice(0, 64));
    if (typeof d.bs === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(d.bs)) {
      if (bsSeen === null) bsDone = d.bs;
      bsSeen = d.bs;
      syncBs();
    }
  }
  async function syncBs() {
    if (bsSeen === bsDone || badgesBusy || Date.now() - bsTryAt < 60000) return;
    const bs = bsSeen;
    bsTryAt = Date.now();
    if (await loadBadges(true, bs)) bsDone = bs;
  }
  const isBadges = (d) => !!d && typeof d === "object" && !!d.badges && typeof d.badges === "object";

  // Сокет держит список (каждая правка приходит по нему, пропуск виден по версиям — 44_plus) — сверка раз в 5 минут;
  // нет сокета — раз в минуту (задание п.135 сервера, P2).
  const period = () => (CPX.plus && typeof CPX.plus.rosterLive === "function" && CPX.plus.rosterLive() ? 300000 : 60000);
  function done() {
    fails = 0;
    okAt = Date.now();
    jit = 0.85 + Math.random() * 0.3;
    nextAt = okAt + 60000 * jit;
    return true;
  }
  function failed(r) {
    fails++;
    // Сбой или 429 — реже: 1, 2, 4 … 10 минут (Retry-After — не раньше), со сдвигом.
    const ra = (r && r.retryAfter) || 0;
    nextAt = Date.now() + Math.max(ra, Math.min(600000, 60000 * Math.pow(2, fails - 1)) * (0.85 + Math.random() * 0.3));
    return false;
  }
  /** Полный ответ (users) уже пришёл: применить, разослать, если что-то сменилось. */
  function takeFull(data) {
    const before = R.version;
    const look = lookSig();
    if (!applyFull(data)) return false;
    if (R.version !== before || !before || lookSig() !== look) {
      persist();
      broadcast();
      log.debug("список PLUS обновлён:", R.users.size, "подписчиков");
    }
    return true;
  }

  /** Полный список; fresh — мимо ETag. */
  async function loadFull(fresh) {
    st.full++;
    st.last = "full";
    const r = await api(ROSTER_PATH, { etag: !fresh }, (d) => !!d && Array.isArray(d.users));
    if (!r.ok) return failed(r);
    done();
    if (!r.notModified) awSignal(r.data);
    if (r.notModified && R.version) {
      R.at = Date.now();
      return true;
    }
    return takeFull(r.data);
  }

  /** «Только изменения» с нашей версии (?since=, сервер п.135): {version, since, changes:[{login, user|null, paint|null}]}
   *  — по одной последней записи на человека; сервер не помнит нашу версию (перезапуск, давно, много правок) — обычный
   *  полный ответ (users). Адрес каждый раз свой — без ETag (копились бы в 30_net впустую). Ответ не к нашей версии —
   *  сверка не удалась: сразу полный список мимо ETag, чужие изменения не применяем. */
  async function loadSince() {
    st.since++;
    const since = R.version;
    const r = await api(ROSTER_PATH + "?since=" + encodeURIComponent(since), { etag: false }, isRoster);
    // 400 — сервер не принял нашу версию («since: roster version expected», проверено 09.11): со своей версией мы бы
    // так и сбоили с паузами до 10 минут — берём полный список. Остальные сбои (сеть, 429, 5xx) — как раньше.
    if (!r.ok && r.status === 400) {
      st.mismatch++;
      return loadFull(true);
    }
    if (!r.ok) return failed(r);
    const d = r.data;
    awSignal(d);
    if (d && Array.isArray(d.changes)) {
      if (String(d.since || "") !== since || !d.version) {
        st.mismatch++;
        log.warn("ответ «только изменения» не к нашей версии — беру полный список");
        return loadFull(true);
      }
      done();
      const list = d.changes.filter((c) => c && typeof c === "object").slice(0, 1000);
      for (const c of list) applyOne(c, false);
      const moved = String(d.version).slice(0, 64) !== since;
      R.version = String(d.version).slice(0, 64);
      R.at = Date.now();
      st.last = "since:" + list.length;
      if (list.length || moved) {
        st.changes += list.length;
        persist();
        broadcast();
        log.debug("список PLUS: изменений", list.length);
      }
      return true;
    }
    if (d && Array.isArray(d.users)) {
      done();
      st.last = "since→full";
      return takeFull(d);
    }
    return failed();
  }

  /** Есть версия — «только изменения», иначе (первый запуск, пустая копия) или fresh — полный список. */
  async function load(fresh) {
    if (busy) return busy;
    busy = (async () => {
      await restore();
      return !fresh && VER_RE.test(R.version) ? loadSince() : loadFull(fresh);
    })().finally(() => (busy = null));
    return busy;
  }

  /** Каталог значков отдельно (/plus/badges, ETag, кэш сервера — минута): в «только изменениях» его нет, а без него не
   *  дошли бы новые значки, их правки и подписи по-английски. Раз в час, сразу — когда каталог отстал (setLag) и когда
   *  сменился отпечаток bs (адрес с ?bs=, мимо ETag). */
  async function loadBadges(fresh, bs) {
    if (badgesBusy) return badgesBusy;
    badgesBusy = (async () => {
      badgesAt = Date.now();
      st.badges++;
      const r = await api(BADGES_PATH + (bs ? "?bs=" + encodeURIComponent(bs) : ""), { etag: !fresh && !bs }, isBadges);
      const b = r.ok && !r.notModified && r.data && r.data.badges;
      if (!b || typeof b !== "object") return false;
      const look = lookSig();
      R.set = cleanSet(b);
      // Стандартный значок (default каталога, «m1») — и в badge: старая копия badges.plus иначе жила бы до полного списка.
      const def = typeof r.data.default === "string" && Object.hasOwn(R.set, r.data.default) ? R.set[r.data.default] : null;
      if (def && def.urls) R.badge = { title: (R.badge && R.badge.title) || "Chatterino+ PLUS", urls: def.urls };
      if (lookSig() !== look) {
        persist();
        broadcast();
        log.debug("каталог значков PLUS обновлён:", Object.keys(R.set).length);
      }
      return true;
    })().finally(() => (badgesBusy = null));
    return badgesBusy;
  }

  /** Есть надетый значок, которого нет в каталоге, — пора перечитать каталог мимо ETag (не чаще раза в 10 минут). */
  function setLag() {
    if (Date.now() - freshAt < 600000) return false;
    for (const u of R.users.values()) {
      if (u.badge_id && !(R.set && Object.hasOwn(R.set, u.badge_id))) {
        freshAt = Date.now();
        return true;
      }
    }
    return false;
  }

  function tick() {
    if (!CPX.router.pageTabs()) return;
    const now = Date.now();
    if (now >= nextAt && now - okAt >= period() * jit) load();
    else if (bsSeen !== bsDone) syncBs();
    else if (setLag()) loadBadges(true);
    else if (now - badgesAt >= BADGES_MS) loadBadges(false);
  }

  /** Подмена/правка списка модулем нашего сервера (сокет). */
  function apply(d) {
    if (!d || typeof d !== "object") return false;
    if (Array.isArray(d.users)) {
      if (!applyFull(d)) return false;
    } else if (Array.isArray(d.layer)) {
      // Только слой стажа/цвета: пересобрать записи тех, кто уже в списке.
      for (const u of d.layer) {
        const c = cleanUser(u);
        if (c) seedExtra(c, true);
      }
      for (const [k, u] of R.users) {
        const bare = Object.assign({}, u);
        delete bare.months;
        delete bare.color;
        delete bare.avatar;
        delete bare.kick;
        R.users.set(k, withExtra(bare));
      }
    } else if ("user" in d) {
      applyOne(d, true);
      if (d.version) R.version = String(d.version).slice(0, 64);
    } else return false;
    persist();
    broadcast();
    return true;
  }

  CPX.router.handle(
    "plus.roster",
    async (p, ctx) => {
      await restore();
      if (!R.at) await load();
      else tick();
      return ctx.tab && ctx.tab.site !== "twitch" ? sitePayload(ctx.tab.site) : payload();
    },
    { page: true }
  );

  CPX.boot.add(
    "plus-roster",
    () => {
      restore();
      setInterval(CPX.guard("plus-roster:tick", tick), 10000);
    },
    37
  );

  CPX.diag.add("plusRoster", () => ({
    version: R.version,
    users: R.users.size,
    kick: [...R.users.values()].filter((u) => u.kick).length,
    paints: R.paints.size,
    set: R.set ? Object.keys(R.set).length : 0,
    fails,
    every: period() / 1000,
    base: BASES[baseIdx],
    stats: Object.assign({}, st),
  }));

  return {
    apply,
    load,
    get: (id) => R.users.get(String(id)) || null,
    get version() {
      return R.version;
    },
  };
})();

// ── src/bg/38_stv_presence.js ──
/* Фон: «присутствие» 7TV — чтобы мой пейнт/бейдж 7TV видели другие (как у расширения 7TV).
 *
 * POST https://7tv.io/v3/users/{мой 7TV id}/presences
 *   {kind:1, passive, session_id, data:{platform:"TWITCH", id: канал}} (research/01 §3.9):
 *   • при входе в канал — «пассивное» с id нашего сокета EventAPI: 7TV присылает мои выдачи
 *     только мне (чтобы мой пейнт был и у меня самого);
 *   • когда я пишу в чат — «активное», не чаще раза в 10 с на канал: 7TV рассылает мои
 *     выдачи всем, кто сидит в этом канале.
 * Нужен 7TV-аккаунт: мой 7TV id узнаём по twitch id (GraphQL, кэш на час). Нет аккаунта — ничего.
 *
 * ⚠️Это отправка сведений о человеке (какой канал он смотрит) сторонней службе — только после
 * согласия (general.consent) и при включённой настройке emotes.stvPresence.
 *
 * Метод для страницы: stv.presence {userId, channelId, active}.
 */

(() => {
  const log = CPX.log("stv-presence");
  const ID_RE = /^\d{1,20}$/;
  const stvIds = new Map(); // twitch id → {id: 7TV id | "", at}
  const lastActive = new Map(); // канал → время
  const lastPassive = new Map(); // канал → session_id, с которым слали
  const tabUser = new WeakMap(); // вкладка → twitch id (одна вкладка — один человек)
  const st = { active: 0, passive: 0, lookups: 0 };

  const allowed = () =>
    CPX.settings.get("general.consent") === true && CPX.settings.get("emotes.stvPresence") !== false && CPX.settings.get("emotes.stv") !== false;

  async function stvIdOf(tid) {
    const c = stvIds.get(tid);
    if (c && Date.now() - c.at < 3600000) return c.id;
    st.lookups++;
    const q = '{u:userByConnection(platform:TWITCH,id:"' + tid + '"){id}}';
    const d = await CPX.net.fetchJSON("https://7tv.io/v3/gql", { method: "POST", body: { query: q }, timeout: 15000 });
    const id = d && d.data && d.data.u && d.data.u.id;
    // Нет аккаунта 7TV — 7TV отвечает нулевым id.
    const ok = typeof id === "string" && /^[A-Za-z0-9]{10,40}$/.test(id) && !/^0+$/.test(id) ? id : "";
    if (d) stvIds.set(tid, { id: ok, at: Date.now() });
    return ok;
  }

  async function send(tid, channelId, active) {
    const stvId = await stvIdOf(tid);
    if (!stvId) return false;
    const session = CPX.stvEvents.sessionId;
    const body = { kind: 1, passive: !active, data: { platform: "TWITCH", id: channelId } };
    if (!active) {
      if (!session) return false; // пассивное без сокета бессмысленно
      body.session_id = session;
    }
    const r = await CPX.net.fetchJSON("https://7tv.io/v3/users/" + stvId + "/presences", { method: "POST", body, timeout: 15000, retries: 0, full: true });
    if (r.ok) st[active ? "active" : "passive"]++;
    return r.ok;
  }

  CPX.router.handle(
    "stv.presence",
    async (p, ctx) => {
      if (!allowed()) return false;
      const tid = String(p.userId || "");
      const channelId = String(p.channelId || "");
      if (!ID_RE.test(tid) || !ID_RE.test(channelId)) return false;
      // Кто вошёл на twitch.tv, фон знает сам (доклады верхних рамок вкладок, 42_auth) —
      // чужой id со страницы не пройдёт.
      const me = CPX.auth && CPX.auth.me;
      if (me && me.id && me.id !== tid) return false;
      if (ctx.tab) {
        const was = tabUser.get(ctx.tab);
        if (was && was !== tid) return false;
        tabUser.set(ctx.tab, tid);
      }
      const now = Date.now();
      if (p.active) {
        if (now - (lastActive.get(channelId) || 0) < 10000) return false;
        lastActive.set(channelId, now);
        return send(tid, channelId, true);
      }
      const session = CPX.stvEvents.sessionId;
      if (!session || lastPassive.get(channelId) === session) return false;
      lastPassive.set(channelId, session);
      return send(tid, channelId, false);
    },
    { page: true }
  );

  // Сокет EventAPI переподключился (новый session_id) — повторить пассивное присутствие
  // во всех открытых каналах, иначе свои выдачи до нас больше не дойдут.
  CPX.stvEvents.on(
    "hello",
    CPX.guard("stv-presence:hello", (session) => {
      if (!allowed() || !session) return;
      const me = CPX.auth && CPX.auth.me;
      for (const tab of CPX.router.tabs) {
        const tid = tabUser.get(tab);
        if (!tid || (me && me.id && me.id !== tid)) continue;
        for (const channelId of tab.channels.keys()) {
          if (lastPassive.get(channelId) === session) continue;
          lastPassive.set(channelId, session);
          send(tid, channelId, false);
        }
      }
    })
  );

  CPX.diag.add("stvPresence", () => ({ allowed: allowed(), stats: Object.assign({}, st) }));
})();

// ── src/bg/40_ws.js ──
/* Фон: сокет нашего сервера (typingws) — ОДИН на браузер.
 *
 * Зачем один: сервер держит не больше 4 соединений на логин и вытесняет старые (код 4000);
 * сокет на каждую вкладку + десктопный клиент давали бы «карусель вытеснения»
 * (research/03 §1.2 п.6, память project_chatterino_server_scale).
 *
 * Когда открыт: есть согласие (general.consent) И открыта хоть одна вкладка Twitch.
 * Закрылась последняя вкладка — ждём 15 с (перезагрузка страницы не должна рвать связь)
 * и закрываем: фон уснёт, сервер не держит лишнее соединение.
 *
 * Протокол (research/03 §1): первый кадр — {op:"hello",v:2,ticket,lid,cn,why,xv} (пустой ticket —
 * публичный режим); ответ {op:"hello",heartbeat,verified,plus?}; сервер шлёт {op:"heartbeat"} раз в 12 с.
 * Метка запуска (задание чата клиента 19.10 — сервер отличает расширение по поведению; поле n в ответе и
 * кадр prove — только для клиента, их не трогаем):
 *  • lid — 16 знаков 0-9a-f, одна на СЕАНС БРАУЗЕРА: хранится в chrome.storage.session вместе со
 *    счётчиком, поэтому перезапуск фона MV3 (браузер его гасит и поднимает сам) — не новый запуск;
 *    нет storage.session — метка в памяти фона (меняется при его перезапуске, это допустимо);
 *  • cn — номер соединения в этом запуске (1, 2, 3… — растёт на каждом открытом сокете);
 *  • why — почему поднято это соединение: start (первое за запуск), busy (сервер закрыл с 1013),
 *    evict (4000 — вытеснено новым входом того же логина), stall (сервер молчал > 75 с), retry
 *    (прошлая попытка не открылась или повисла), renew (пропуск продлён/перевыпущен), ticket (свежий
 *    пропуск для модерации), account (сменился человек на twitch.tv), drop (прочие обрывы поработавшего
 *    соединения); свои слова расширения: wake (браузер перезапустил фон — соединение поднято заново),
 *    login / logout (вход и выход Chatterino+ — сокет меняет пропуск), idle (связь закрывали мы: не было
 *    вкладок Twitch или согласия);
 *  • xv — версия расширения из манифеста.
 * Этот пульс и держит service worker живым (Chrome 116+, research/02 §1.3).
 *
 * Грабли клиента, которые здесь НЕ повторяем:
 *  • дверь (основная / запасная через Cloudflare) меняем ТОЛЬКО после нездоровой попытки
 *    (не открылась или прожила < 30 с); после здорового обрыва — снова основная: туннель CF
 *    душит объём (project_chatterino_ws_disconnects_root);
 *  • пауза переподключения 1…64 с С РАЗБРОСОМ в треть: после перезапуска службы тысячи
 *    клиентов не должны вернуться одной волной (project_chatterino_server_scale);
 *  • сторож тишины 75 с и сторож зависшего подключения 30 с;
 *  • сервер занят: кадр {op:"busy",retry:N} и закрытие 1013 (как клиент 5.5.1, 19.10) — следующая попытка не
 *    раньше N + случайное(0…N/2) с, N ограничен 1…600; это не неудача адреса: дверь не меняем (запасная через
 *    Cloudflare урезана, а сервер жив), ступень лестницы не наращиваем; retry одноразовый;
 *  • в hello — только пропуск ТОГО, кто сейчас вошёл на twitch.tv (решает CPX.auth через
 *    setTicketSource), иначе публичный режим (project_chatterino_identity_race_switch);
 *  • кадры — компактный JSON: сервер узнаёт «лёгкие» кадры (c7who/paint_get/c7roster) по
 *    подстроке "op":"c7who" и считает их в отдельном ведре (research/03 §1.3);
 *  • свои вёдра кадров чуть строже серверных: лишнее сервер выбрасывает МОЛЧА.
 *
 * API для модулей фона:
 *   CPX.ws.send(op, data)  → true, если кадр ушёл или встал в очередь (сокет открыт)
 *   CPX.ws.on(op, fn(msg)) → отписка; особые события: "open" {verified, identity} — после
 *                            ответа сервера на hello (здесь повторять подписки: sbwatch и т.п.),
 *                            "close" {code, reason}, "state" (публичное состояние), "tick" (раз в 10 с)
 *   CPX.ws.state           → { status, verified, door, identity, ... } (без секретов)
 *   CPX.ws.isOpen()        → сокет открыт и hello получен
 *   CPX.ws.apiBase()       → https-адрес той же двери (для /auth/*): у кого закрыт прямой путь,
 *                            у того он закрыт и для HTTPS
 *   CPX.ws.reconnect(why, code) → переподключиться сразу (смена личности, новый пропуск); code — повод
 *                            для сервера (renew, ticket, account, login, logout — см. метку запуска)
 *   CPX.ws.setTicketSource(fn, ready, prepare) — источник пропуска для hello (его ставит CPX.auth)
 * Методы для страницы/popup: ws.state [page].
 */

CPX.ws = (() => {
  const log = CPX.log("ws");
  const ev = new CPX.Emitter();

  const DOORS = [
    { id: "main", url: "wss://ws.chat.eblo.id/", api: "https://ws.chat.eblo.id" },
    // Запасная дверь: тот же сервер через туннель Cloudflare (прямой адрес режут часть провайдеров).
    { id: "cf", url: "wss://ws.rish098.xyz/", api: "https://ws.rish098.xyz" },
  ];

  const LIVENESS_MS = 75000; // без единого кадра от сервера — соединение мёртвое
  const CONNECT_TIMEOUT_MS = 30000; // подключение повисло
  const CHECK_MS = 10000; // такт сторожа
  const HEALTHY_MS = 30000; // прожило дольше — «здоровое»
  const BACKOFF_MAX_STEP = 7; // ступени 1,2,4…64 с
  const EVICTED_DELAY_MS = 30000; // после вытеснения (4000) не спешим — иначе вытесним соседа
  const CLOSE_GRACE_MS = 15000; // последняя вкладка закрыта — ждём перед закрытием
  const PREPARE_MAX_MS = 8000; // сколько ждём продления пропуска перед подключением
  const MAX_FRAME_BYTES = 16000; // сервер: 16384 байт на кадр

  // Вёдра исходящих кадров (сервер: общее 200 запас / 40 в с, лёгкое 40 / 8 в с).
  const ESSENTIAL = new Set(["c7who", "paint_get", "c7roster"]);
  const buckets = {
    ess: { tokens: 30, max: 30, rate: 6, at: Date.now() },
    gen: { tokens: 150, max: 150, rate: 30, at: Date.now() },
  };
  const QUEUE_MAX = 400;
  let queue = []; // { raw, b }
  let flushTimer = 0;

  let sock = null;
  let gen = 0; // поколение: поздние события старого сокета не трогают новый
  let status = "off"; // off | connecting | hello | open | wait
  let verified = false;
  let identity = null; // { uid, login, iat, at } — кем представились в hello (только при verified)
  let presented = null; // что предъявили в hello (для разбора отказа)
  let doorIdx = 0;
  let step = 0; // ступень паузы
  let openedAt = 0;
  let startedAt = 0;
  let hadOpen = false;
  let lastRx = 0;
  let reconnectTimer = 0;
  let reconnectAt = 0;
  let checkTimer = 0;
  let graceTimer = 0;
  let lastClose = null;
  let busyRetry = 0; // с из кадра busy — для ближайшего закрытия 1013
  let booted = false;
  let ticketSource = () => null;
  let ticketReady = Promise.resolve();
  let prepareFn = null;
  let preparing = 0; // поколение, для которого идёт подготовка пропуска
  const stats = { opens: 0, closes: 0, rx: 0, tx: 0, dropped: 0, heartbeats: 0 };
  const forced = []; // времена принудительных переподключений (защита от карусели)

  /* ── Метка запуска для hello (см. шапку) ─────────────────────────────────── */
  const RUN_KEY = "cpx.ws.run";
  const LID_RE = /^[0-9a-f]{16}$/;
  const WHY_RE = /^[a-z]{1,12}$/;
  const XV = (() => {
    const v = String((chrome.runtime.getManifest() || {}).version || "");
    return /^\d{1,3}(\.\d{1,5}){1,3}$/.test(v) ? v : "";
  })();
  let run = { lid: "", cn: 0, w: "start" }; // w — повод для СЛЕДУЮЩЕГО соединения
  const runReady = (async () => {
    try {
      const r = chrome.storage.session ? (await chrome.storage.session.get(RUN_KEY))[RUN_KEY] : null;
      if (r && LID_RE.test(r.lid) && Number.isInteger(r.cn) && r.cn >= 0 && r.cn <= 999999) {
        // Тот же сеанс браузера, фон поднят заново: повод — что успели записать (idle, retry…), иначе wake.
        run = { lid: r.lid, cn: r.cn, w: WHY_RE.test(r.w) ? r.w : "wake" };
      }
    } catch (_) {
      /* нет storage.session — метка живёт в памяти фона */
    }
    if (!run.lid) {
      const b = new Uint8Array(8);
      crypto.getRandomValues(b);
      run.lid = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
      saveRun();
    }
  })();
  function saveRun() {
    try {
      if (chrome.storage.session) chrome.storage.session.set({ [RUN_KEY]: run }).catch(() => {});
    } catch (_) {
      /* без session — только память */
    }
  }
  /** Повод для следующего соединения (последнее событие перед ним). */
  function cause(w) {
    if (!WHY_RE.test(w) || run.w === w) return;
    run.w = w;
    saveRun();
  }
  // Только dev: последние кадры (op, комната, число id) — стенд проверяет порядок sbwatch → sbq.
  const frameLog = CPX.dev ? [] : null;
  function logFrame(raw) {
    if (!frameLog) return;
    let m;
    try {
      m = JSON.parse(raw);
    } catch (_) {
      return;
    }
    const f = { t: Date.now(), op: m.op };
    if (m.room) f.room = m.room;
    if (Array.isArray(m.ids)) f.n = m.ids.length;
    if (m.op === "hello") Object.assign(f, { lid: m.lid, cn: m.cn, why: m.why, xv: m.xv, tk: !!m.ticket });
    frameLog.push(f);
    if (frameLog.length > 400) frameLog.shift();
  }

  const door = () => DOORS[doorIdx % DOORS.length];

  function want() {
    // Вкладки Kick (15.11) — тоже: список PLUS по сокету (c7roster) нужен и им (оформление PLUS у ников Kick).
    return booted && !!CPX.settings.get("general.consent") && CPX.router.pageTabs() > 0;
  }

  function publicState() {
    return {
      status,
      verified,
      door: door().id,
      identity: identity ? { uid: identity.uid, login: identity.login } : null,
      consent: !!CPX.settings.get("general.consent"),
      tabs: CPX.router.tabs.size,
      since: status === "open" ? openedAt : 0,
      reconnectIn: status === "wait" && reconnectAt ? Math.max(0, reconnectAt - Date.now()) : 0,
      lastClose,
    };
  }

  let stateSent = "";
  function setStatus(s) {
    status = s;
    const st = publicState();
    const key = JSON.stringify([st.status, st.verified, st.door, st.identity, st.consent]);
    if (key === stateSent) return;
    stateSent = key;
    ev.emit("state", st);
    CPX.router.broadcast("ws.changed", st);
  }

  /* ── Подключение ─────────────────────────────────────────────────────────── */

  function connect() {
    clearTimeout(reconnectTimer);
    reconnectTimer = 0;
    reconnectAt = 0;
    if (!want()) {
      stopChecks();
      return setStatus("off");
    }
    if (sock || preparing) return;
    const myGen = ++gen;
    hadOpen = false;
    startedAt = Date.now();
    lastRx = startedAt;
    verified = false;
    identity = null;
    setStatus("connecting");
    startChecks();
    if (!prepareFn) return openSocket(myGen);
    // Сначала — подготовить пропуск (например, продлить протухший после долгого сна фона):
    // иначе подключились бы публично и через секунду переподключались с пропуском.
    preparing = myGen;
    let p;
    try {
      p = Promise.resolve(prepareFn());
    } catch (e) {
      p = Promise.resolve();
    }
    Promise.race([p.catch(() => {}), CPX.sleep(PREPARE_MAX_MS)]).then(() => {
      if (preparing === myGen) preparing = 0;
      if (myGen === gen) openSocket(myGen);
    });
  }

  function openSocket(myGen) {
    if (!want()) {
      stopChecks();
      return setStatus("off");
    }
    const d = door();
    startedAt = Date.now();
    lastRx = startedAt;
    let s;
    try {
      s = new WebSocket(d.url);
    } catch (e) {
      log.warn("не удалось создать сокет:", e && e.message);
      cause("retry");
      scheduleReconnect(false);
      return;
    }
    sock = s;
    log.info("подключаемся:", d.id);

    s.onopen = () => {
      if (myGen !== gen) return;
      hadOpen = true;
      openedAt = Date.now();
      lastRx = openedAt;
      stats.opens++;
      // hello — ПЕРВЫМ кадром. Пропуск только того, кто сейчас вошёл на twitch.tv.
      let t = null;
      try {
        t = ticketSource();
      } catch (e) {
        CPX.report("ws:ticketSource", e);
      }
      presented = t && t.ticket ? { uid: t.uid, login: t.login, iat: t.iat, at: t.at || 0 } : null;
      run.cn = run.cn >= 999999 ? 1 : run.cn + 1;
      const why = run.cn === 1 ? "start" : run.w || "drop";
      run.w = "";
      saveRun();
      const hello = { op: "hello", v: 2, ticket: presented ? t.ticket : "", lid: run.lid, cn: run.cn, why };
      if (XV) hello.xv = XV;
      rawSend(JSON.stringify(hello));
      setStatus("hello");
    };
    s.onmessage = (e) => {
      if (myGen !== gen) return;
      lastRx = Date.now();
      stats.rx++;
      let m;
      try {
        m = JSON.parse(e.data);
      } catch (_) {
        return;
      }
      if (!m || typeof m !== "object" || typeof m.op !== "string") return;
      if (m.op === "heartbeat") {
        stats.heartbeats++;
        return;
      }
      if (m.op === "busy") {
        const n = Math.round(Number(m.retry));
        busyRetry = Number.isFinite(n) ? Math.min(600, Math.max(1, n)) : 0;
        return;
      }
      if (m.op === "hello") {
        verified = !!m.verified && !!presented;
        identity = verified ? presented : null;
        setStatus("open");
        log.info("на связи:", door().id, verified ? "вход подтверждён" : "публичный режим");
        ev.emit("hello", m, { presented });
        ev.emit("open", { verified, identity: identity ? { uid: identity.uid, login: identity.login } : null });
        return;
      }
      ev.emit(m.op, m);
    };
    s.onclose = (e) => {
      if (myGen !== gen) return;
      cause(e.code === 4000 ? "evict" : e.code === 1013 ? "busy" : hadOpen ? "drop" : "retry");
      dropSocket(e.code, e.reason);
      const lived = hadOpen ? Date.now() - openedAt : 0;
      log.info("соединение закрыто:", e.code, lastClose.reason, "жило", Math.round(lived / 1000), "с");
      if (e.code === 4000) scheduleReconnect(true, EVICTED_DELAY_MS);
      else if (e.code === 1013 && busyRetry) {
        const n = busyRetry;
        busyRetry = 0;
        scheduleReconnect("keep", n * 1000);
      } else scheduleReconnect(hadOpen && lived > HEALTHY_MS);
    };
    s.onerror = () => {
      /* подробностей браузер не даёт; закрытие придёт в onclose */
    };
  }

  /** Закрыть текущий сокет без переподключения — ЕДИНЫЙ путь закрытия (обрыв, сторож,
   * переподключение, выключение): всем модулям приходит "close". */
  function dropSocket(code, reason) {
    gen++;
    preparing = 0;
    const s = sock;
    sock = null;
    verified = false;
    identity = null;
    presented = null;
    queue = [];
    clearTimeout(flushTimer);
    flushTimer = 0;
    if (!s) return;
    stats.closes++;
    s.onopen = s.onmessage = s.onclose = s.onerror = null;
    try {
      if (s.readyState === 0 || s.readyState === 1) s.close(1000);
    } catch (_) {
      /* уже закрыт */
    }
    lastClose = { code: code || 0, reason: String(reason || "").slice(0, 80), at: Date.now() };
    ev.emit("close", { code: lastClose.code, reason: lastClose.reason });
  }

  /** healthy: true — здоровый обрыв (основная дверь, лестница с начала); false — неудача (следующая дверь,
   * ступень выше); "keep" — сервер занят (дверь и ступень как есть). */
  function scheduleReconnect(healthy, minDelay) {
    if (!want()) {
      stopChecks();
      return setStatus("off");
    }
    if (healthy === "keep") {
      /* дверь и ступень — без изменений */
    } else if (healthy) {
      // После здорового обрыва — снова основная дверь и короткая пауза.
      doorIdx = 0;
      step = 0;
    } else {
      doorIdx++;
      step = Math.min(step + 1, BACKOFF_MAX_STEP);
    }
    const base = 1000 * Math.pow(2, Math.max(0, step - 1)); // 1 с (здоровый обрыв и первая неудача), 2, 4 … 64 с
    let delay = base + Math.floor(Math.random() * Math.max(1, base / 3));
    if (minDelay) delay = Math.max(delay, minDelay + Math.floor(Math.random() * (minDelay / 2)));
    clearTimeout(reconnectTimer);
    reconnectAt = Date.now() + delay;
    reconnectTimer = setTimeout(connect, delay);
    setStatus("wait");
  }

  /* ── Сторож ──────────────────────────────────────────────────────────────── */

  function startChecks() {
    if (!checkTimer) checkTimer = setInterval(CPX.guard("ws:check", check), CHECK_MS);
  }
  function stopChecks() {
    clearInterval(checkTimer);
    checkTimer = 0;
  }

  function check() {
    const now = Date.now();
    if (sock && !hadOpen && now - startedAt > CONNECT_TIMEOUT_MS) {
      log.warn("подключение повисло — пробуем снова");
      cause("retry");
      dropSocket(0, "connect timeout");
      return scheduleReconnect(false);
    }
    if (sock && hadOpen && now - lastRx > LIVENESS_MS) {
      log.warn("сервер молчит дольше 75 с — переподключаемся");
      cause("stall");
      dropSocket(0, "silence");
      return scheduleReconnect(now - openedAt > HEALTHY_MS);
    }
    if (status === "open") ev.emit("tick");
  }

  /* ── Отправка ────────────────────────────────────────────────────────────── */

  function rawSend(raw) {
    try {
      sock.send(raw);
      stats.tx++;
      logFrame(raw);
      return true;
    } catch (_) {
      return false;
    }
  }

  function refill(b, now) {
    b.tokens = Math.min(b.max, b.tokens + ((now - b.at) / 1000) * b.rate);
    b.at = now;
  }

  function flush() {
    flushTimer = 0;
    if (!sock || sock.readyState !== 1) {
      queue = [];
      return;
    }
    const now = Date.now();
    refill(buckets.ess, now);
    refill(buckets.gen, now);
    const rest = [];
    for (const q of queue) {
      const b = buckets[q.b];
      if (b.tokens >= 1 && !rest.some((r) => r.b === q.b)) {
        b.tokens -= 1;
        rawSend(q.raw);
      } else rest.push(q);
    }
    queue = rest;
    if (queue.length) flushTimer = setTimeout(flush, 200);
  }

  function send(op, data) {
    if (!sock || sock.readyState !== 1 || status === "connecting") return false;
    if (typeof op !== "string" || !op) return false;
    const raw = JSON.stringify(Object.assign({ op }, data || {}, { op }));
    // Точный размер в байтах считаем только для длинных (кириллица — 2 байта на знак).
    if (raw.length > MAX_FRAME_BYTES / 3 && new TextEncoder().encode(raw).length > MAX_FRAME_BYTES) {
      log.warn("кадр слишком большой, не отправлен:", op, raw.length);
      return false;
    }
    const bn = ESSENTIAL.has(op) ? "ess" : "gen";
    const b = buckets[bn];
    refill(b, Date.now());
    if (!queue.length && b.tokens >= 1) {
      b.tokens -= 1;
      return rawSend(raw);
    }
    if (queue.length >= QUEUE_MAX) {
      queue.shift();
      stats.dropped++;
      if (stats.dropped === 1 || stats.dropped % 100 === 0) log.warn("очередь кадров переполнена, отброшено:", stats.dropped);
    }
    queue.push({ raw, b: bn });
    if (!flushTimer) flushTimer = setTimeout(flush, 200);
    return true;
  }

  /* ── Управление ──────────────────────────────────────────────────────────── */

  /** Пересчитать «нужна ли связь» (согласие, вкладки). */
  function evaluate() {
    if (!booted) return;
    if (want()) {
      clearTimeout(graceTimer);
      graceTimer = 0;
      if (!sock && !reconnectTimer && !preparing) {
        step = 0;
        connect();
      }
      return;
    }
    if (!CPX.settings.get("general.consent")) {
      // Согласие отозвано — закрываем сразу, без ожидания.
      clearTimeout(graceTimer);
      graceTimer = 0;
      return shutdown("согласие отозвано");
    }
    if ((sock || reconnectTimer) && !graceTimer) {
      graceTimer = setTimeout(() => {
        graceTimer = 0;
        if (!want()) shutdown("нет вкладок Twitch");
      }, CLOSE_GRACE_MS);
    }
  }

  function shutdown(why) {
    clearTimeout(reconnectTimer);
    reconnectTimer = 0;
    reconnectAt = 0;
    stopChecks();
    if (sock) {
      log.info("закрываем связь:", why);
      dropSocket(1000, why);
      cause("idle");
    }
    doorIdx = 0;
    step = 0;
    setStatus("off");
  }

  /** Переподключиться сразу (новый пропуск, смена человека на twitch.tv). code — повод для сервера (why в hello). */
  function reconnect(why, code) {
    if (!want()) return;
    cause(code || "drop");
    const now = Date.now();
    while (forced.length && now - forced[0] > 60000) forced.shift();
    forced.push(now);
    log.info("переподключение:", why || "");
    if (sock) dropSocket(1000, why);
    if (forced.length > 6) {
      // Что-то гоняет нас по кругу — не долбим сервер, обычная пауза с разбросом.
      log.warn("слишком частые переподключения — пауза");
      return scheduleReconnect(false);
    }
    // Дверь та же (она у человека открывается), пауза минимальная.
    clearTimeout(reconnectTimer);
    reconnectTimer = 0;
    connect();
  }

  CPX.router.ev.on("tab:open", () => evaluate());
  CPX.router.ev.on("tab:close", () => evaluate());
  CPX.router.ev.on("site:open", () => evaluate());
  CPX.router.ev.on("site:close", () => evaluate());
  CPX.settings.on((ch) => {
    if ("general.consent" in ch) evaluate();
  });

  CPX.boot.add(
    "ws",
    async () => {
      // Ждём пропуски из хранилища: иначе подключились бы публично и тут же переподключались.
      try {
        await ticketReady;
      } catch (_) {
        /* без пропусков — публичный режим */
      }
      await runReady; // метка запуска — до первого hello
      booted = true;
      evaluate();
    },
    45
  );

  CPX.router.handle("ws.state", () => publicState(), { page: true });

  CPX.diag.add("ws", () =>
    Object.assign(
      publicState(),
      { queue: queue.length, stats: Object.assign({}, stats), lastRxAgo: lastRx ? Date.now() - lastRx : null, run: { cn: run.cn, next: run.w, xv: XV } },
      frameLog ? { frames: frameLog.slice(-120) } : {}
    )
  );
  // Только dev: стенд обрывает связь со страницы (обрыв сети / молчание сервера) или подаёт кадр «от сервера».
  if (CPX.dev)
    CPX.router.handle(
      "ws.debug",
      (p) => {
        if (p.kill && sock) sock.close(4999, "debug");
        // как от сервера: кадр busy с retry и закрытие 1013
        if (p.busy && sock && sock.onmessage && sock.onclose) {
          const s = sock;
          s.onmessage({ data: JSON.stringify({ op: "busy", retry: p.busy }) });
          s.onclose({ code: 1013, reason: "busy" });
        }
        if (p.silence && sock) {
          lastRx = Date.now() - LIVENESS_MS - 1000;
          check();
        }
        // как от сервера: любой кадр (например, plus_update — правка подписчика)
        if (p.frame && sock && sock.onmessage) sock.onmessage({ data: JSON.stringify(p.frame) });
        return true;
      },
      { page: true }
    );

  return {
    send,
    on: (name, fn) => ev.on(name, fn),
    once: (name, fn) => ev.once(name, fn),
    get state() {
      return publicState();
    },
    isOpen: () => status === "open" && !!sock && sock.readyState === 1,
    get verified() {
      return status === "open" && verified;
    },
    /** Что предъявили в hello (пока ждём ответа) — { uid, login, iat, at } или null. */
    get presented() {
      return sock && presented ? Object.assign({}, presented) : null;
    },
    /** Кем представились в hello (только при подтверждённом входе) — { uid, login, iat, at } (at — когда получен пропуск, по нашим часам) или null. */
    get identity() {
      return status === "open" && identity ? Object.assign({}, identity) : null;
    },
    apiBase: () => door().api,
    doors: () => DOORS.map((d) => d.api),
    reconnect,
    evaluate,
    /** fn() → {ticket, uid, login, iat, at} | null — пропуск для hello (синхронно, в момент открытия);
     * ready — Promise «пропуски загружены»; prepare() → Promise — подготовить пропуск перед
     * подключением (ждём не дольше 8 с). */
    setTicketSource(fn, ready, prepare) {
      ticketSource = fn;
      if (ready) ticketReady = ready;
      if (prepare) prepareFn = prepare;
    },
    /** Только для стенда проверки (dev): оборвать сокет как при сбое сети. */
    _debugKill: CPX.dev
      ? () => {
          if (sock) sock.close(4999, "debug");
        }
      : undefined,
    /** Только для стенда проверки (dev): сделать вид, что сервер молчит дольше 75 с. */
    _debugSilence: CPX.dev
      ? () => {
          lastRx = Date.now() - LIVENESS_MS - 1000;
          check();
        }
      : undefined,
  };
})();

// ── src/bg/42_auth.js ──
/* Фон: вход в Chatterino+ (подтверждение личности), пропуск и его продление.
 *
 * Путь «вкладка + опрос» — без правок сервера (research/03 §2.2–2.3):
 *   1) кнопка «Войти» → GET /auth/begin?uid=<id человека, вошедшего на twitch.tv>;
 *   2) открываем выданную ссылку (страница согласия Twitch) во вкладке;
 *   3) раз в 1,5 с GET /auth/poll?state=… (до 15 мин);
 *   4) итог {ticket, exp, renew, renew_exp, login, name, uid, scoped} → в ячейку ТОГО uid,
 *      для которого вход начат; закрываем свою вкладку; переподключаем сокет с пропуском.
 * Продление: POST /auth/renew {renew} заранее (за 10 мин до конца 12-часового пропуска),
 * при отказе пропуска в hello и немедленно при authstale reason:"stale" (мод-операциям нужен
 * пропуск не старше 30 мин — CPX.auth.freshTicket()).
 * Токен Twitch к нам НЕ попадает: страница возврата сервера берёт из адреса только
 * удостоверение личности (id_token) и сама его отправляет.
 *
 * 🔴Привязка к аккаунту — главные грабли клиента (память project_chatterino_auth_identity_bind,
 * project_chatterino_identity_race_switch), здесь их нет по устройству:
 *  • uid фиксируется В МОМЕНТ нажатия «Войти» и передаётся серверу (?uid=) — подтверждение
 *    другого человека сервер отвергнет (409 → denied), а мы ещё и сверяем uid сами;
 *  • ответ входа/продления кладётся в ячейку uid, для которого запрос НАЧАТ, а не «текущего
 *    на момент ответа»; пропуск с чужим владельцем не сохраняется и не предъявляется;
 *  • в hello — только пропуск того, кто СЕЙЧАС вошёл на twitch.tv (по докладам ВЕРХНИХ рамок
 *    обычных вкладок, см. recomputeMe); сменился человек — публичный режим до его собственного
 *    входа, начатый вход отменяется;
 *  • фон проснулся «с нуля» — пропуск не предъявляем, пока вкладка не доложит, кто на twitch.tv
 *    (до 2 с, см. waitMe): в хранилище лежит прежний человек;
 *  • «Выйти» стирает ячейку этого человека.
 *
 * Хранение: chrome.storage.local["cpx.auth"] = { uid: {ticket, exp, iat, renew, renew_exp,
 * login, name, uid, scoped, at} } — ТОЛЬКО в фоне; в мир страницы и в события не уходит никогда.
 * Начатый вход — chrome.storage.session["cpx.authPending"] (переживает засыпание фона).
 *
 * Методы: auth.me {me, top} [page] — вкладка сообщает, кто вошёл на twitch.tv;
 *         auth.state [page] — вошёл ли человек этой вкладки, логин, подтвердил ли он связь
 *           (verified); «совпадает ли вход с человеком на странице» вкладка считает сама
 *           (72_account.js): события фона общие для всех вкладок;
 *         auth.login / auth.logout / auth.cancel — только страницы расширения.
 * Событие всем: "auth.changed" (публичное состояние, без секретов).
 */

CPX.auth = (() => {
  const log = CPX.log("auth");
  const ev = new CPX.Emitter();

  const STORE_KEY = "cpx.auth";
  const ME_KEY = "cpx.me";
  const PENDING_KEY = "cpx.authPending";
  const POLL_ALARM = "cpx-auth-poll";

  const RENEW_MARGIN_SEC = 600; // продлеваем за 10 мин до конца
  const RENEW_MIN_GAP_MS = 60000; // обычная пауза между продлениями (растёт на неудачах)
  const STALE_GAP_MS = 10 * 60000; // authstale без reason — не чаще раза в 10 мин
  const FRESH_MAX_AGE_SEC = 25 * 60; // сервер: мод-операции — пропуск не старше 30 мин
  const POLL_MS = 1500;
  const POLL_MAX_MS = 15 * 60000;
  const TAB_CLOSED_GRACE_MS = 10000; // вкладку входа закрыли — ещё чуть-чуть ждём итог
  const FETCH_TIMEOUT_MS = 15000;
  const ME_FRESH_MS = 5 * 60000; // доклад вкладки старше — вкладка, похоже, заморожена браузером
  const ME_WAIT_MS = 2000; // сколько ждём первого доклада вкладки перед hello

  const ID_RE = /^\d{1,20}$/;
  const LOGIN_RE = /^[a-z0-9_]{1,25}$/;

  let records = Object.create(null); // uid → запись (секреты!)
  let me = null; // { id, login, displayName } — кто вошёл на twitch.tv
  const tabMe = new Map(); // рамка вкладки → { me, at, seq, incognito, top }
  let meSeq = 0; // порядок докладов: часы бывают равны до миллисекунды
  // Смена человека на ДРУГОЙ аккаунт — не чаще раза в SWITCH_MIN_MS (ревью безопасности 01.10):
  // «кто на twitch.tv» сообщает мир страницы, а там работают и чужие скрипты; без предела они
  // могли бы гонять сокет по сохранённым аккаунтам («карусель»). meSince — с какого момента
  // держится нынешний (0 — с запуска фона: после сна фона личность не «новая»).
  const SWITCH_MIN_MS = 60000;
  let meSince = 0;
  let switchT = 0;
  let lastId = ""; // последний НЕпустой человек — переход «X → никто → Y» тоже смена
  let meWaiters = []; // ждут первого доклада верхней рамки (см. waitMe)
  let pending = null; // начатый вход
  let loginInFlight = null; // идёт /auth/begin — повторное нажатие получает тот же вход
  let pollTimer = 0;
  let polling = false;
  let lastError = null; // { code, got?, at }
  const renewing = new Map(); // uid → Promise
  let renewFail = 0;
  let lastRenewAt = 0;
  let lastStaleAt = 0;
  let freshInFlight = null;

  /* ── Хранилище ───────────────────────────────────────────────────────────── */

  const loaded = (async () => {
    try {
      const r = await chrome.storage.local.get([STORE_KEY, ME_KEY]);
      const saved = r && r[STORE_KEY];
      if (saved && typeof saved === "object") {
        for (const uid in saved) if (ID_RE.test(uid) && saved[uid] && typeof saved[uid] === "object") records[uid] = saved[uid];
      }
      me = cleanMe(r && r[ME_KEY]);
    } catch (e) {
      log.warn("не удалось прочитать пропуски:", e && e.message);
    }
    try {
      const s = await chrome.storage.session.get(PENDING_KEY);
      const p = s && s[PENDING_KEY];
      if (p && p.state && ID_RE.test(p.uid) && p.deadline > Date.now() && CPX.ws.doors().includes(p.api)) {
        pending = p;
        startPolling();
      } else if (p) {
        chrome.storage.session.remove(PENDING_KEY).catch(() => {});
      }
    } catch (_) {
      /* нет session — не страшно */
    }
  })();

  function save() {
    return chrome.storage.local.set({ [STORE_KEY]: records }).catch((e) => log.warn("не удалось сохранить пропуск:", e && e.message));
  }

  function savePending() {
    const op = pending ? chrome.storage.session.set({ [PENDING_KEY]: pending }) : chrome.storage.session.remove(PENDING_KEY);
    return op.catch(() => {});
  }

  /* ── Кто вошёл на twitch.tv ──────────────────────────────────────────────── */

  function cleanMe(m) {
    if (!m || typeof m !== "object") return null;
    const id = String(m.id || "");
    const login = String(m.login || "").toLowerCase();
    if (!ID_RE.test(id) || !LOGIN_RE.test(login)) return null;
    return { id, login, displayName: String(m.displayName || login).slice(0, 40) };
  }

  function recomputeMe() {
    // Личность связи определяют только ВЕРХНИЕ рамки обычных вкладок:
    //  • чат Twitch, встроенный в чужой сайт (www.twitch.tv/embed/…/chat), без сторонних кук
    //    (Brave, строгий режим Edge, запрет в Chrome) докладывает «никто не вошёл», а с
    //    разделёнными куками может знать ДРУГОГО человека;
    //  • инкогнито (если расширению там разрешено) — другой набор кук.
    // Все верхние рамки видят одни куки, поэтому побеждает самый свежий НЕпустой доклад
    // (вкладка, ещё не перечитавшая куку, не перебьёт свежую смену аккаунта), а «никто не
    // вошёл» — только если так говорят все: настоящий выход с twitch.tv каждая вкладка заметит
    // сама за ~10 с. Доклады старше 5 мин не учитываем, если есть свежие: живая вкладка
    // подтверждает себя раз в минуту (72_account.js), а замороженная браузером молчит — она
    // держала бы прежнего человека после выхода.
    const now = Date.now();
    const all = [];
    for (const r of tabMe.values()) if (r.top && !r.incognito) all.push(r);
    if (!all.length) return; // докладов нет — помним последнего известного
    const fresh = all.filter((r) => now - r.at < ME_FRESH_MS);
    let best = null;
    for (const r of fresh.length ? fresh : all) if (r.me && (!best || r.seq > best.seq)) best = r;
    setMe(best ? best.me : null);
  }

  function heardTop() {
    for (const r of tabMe.values()) if (r.top && !r.incognito) return true;
    return false;
  }

  /** Перед hello: ни одна вкладка ещё не доложила, кто на twitch.tv (фон проснулся «с нуля», в
   * хранилище — прежний человек), — ждём первого доклада до 2 с. Иначе hello мог уйти с пропуском
   * прежнего аккаунта — узор граблей клиента 5.2.3 (project_chatterino_identity_race_switch). */
  function waitMe() {
    if (heardTop() || !CPX.router.tabs.size) return Promise.resolve();
    return new Promise((resolve) => {
      const t = setTimeout(done, ME_WAIT_MS);
      function done() {
        clearTimeout(t);
        meWaiters = meWaiters.filter((f) => f !== done);
        resolve();
      }
      meWaiters.push(done);
    });
  }

  function setMe(next) {
    const prevId = me ? me.id : "";
    const nextId = next ? next.id : "";
    const sameLogin = me && next && me.login === next.login && me.displayName === next.displayName;
    if (prevId === nextId && (sameLogin || !next)) return;
    if (nextId && lastId && nextId !== lastId && meSince && Date.now() - meSince < SWITCH_MIN_MS) {
      // Только что меняли — новую смену применим, когда выйдет пауза (выход «никто» — сразу).
      if (!switchT)
        switchT = setTimeout(() => {
          switchT = 0;
          recomputeMe();
        }, SWITCH_MIN_MS - (Date.now() - meSince) + 50);
      return;
    }
    me = next;
    chrome.storage.local.set({ [ME_KEY]: me }).catch(() => {});
    if (prevId !== nextId) {
      if (nextId && nextId !== lastId) {
        if (lastId) {
          meSince = Date.now();
          setTimeout(() => CPX.router.toTabs("auth.stable", {}), SWITCH_MIN_MS + 100);
        }
        lastId = nextId;
      }
      log.info("на twitch.tv сейчас:", me ? me.login : "(не вошли)");
      // На twitch.tv теперь ДРУГОЙ человек — начатый вход был для прежнего: отменяем (сервер его
      // всё равно отверг бы). «Никто не вошёл» вход не отменяет: страница входа Twitch сама
      // бывает на www.twitch.tv/login, а итог и так сверяется с uid, для которого вход начат.
      if (pending && nextId && pending.uid !== nextId) finishLogin("cancelled", { why: "account" });
      syncSocket("смена аккаунта на twitch.tv", "account");
    }
    changed();
  }

  /* ── Пропуск ─────────────────────────────────────────────────────────────── */

  /** Полезная часть пропуска (base64url JSON до точки) — сверить владельца и время выдачи. */
  function decodeTicket(t) {
    try {
      const b = String(t).split(".")[0].replace(/-/g, "+").replace(/_/g, "/");
      const json = decodeURIComponent(
        Array.from(atob(b + "===".slice((b.length + 3) % 4)), (c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0")).join("")
      );
      const p = JSON.parse(json);
      return p && typeof p === "object" ? p : null;
    } catch (_) {
      return null;
    }
  }

  // Срок пропуска (exp) — время СЕРВЕРА: сравниваем с его «сейчас» (часы компьютера бывают сбиты).
  const nowSec = () => Math.floor(CPX.clock.now() / 1000);

  function usable(rec) {
    return !!(rec && rec.ticket && !rec.foreign && rec.exp > nowSec() + 30);
  }

  /** Возраст пропуска в секундах — по НАШИМ часам (at — когда получили, выдан он тогда же):
   * часы компьютера бывают сбиты на минуты, а мерить нужно «не старше 25 мин». */
  function ticketAge(x) {
    return x && x.at ? (Date.now() - x.at) / 1000 : Infinity;
  }

  /** Пропуск для hello: только того, кто СЕЙЧАС вошёл на twitch.tv. */
  function ticketForHello() {
    if (!me) return null;
    const rec = records[me.id];
    if (!usable(rec) || rec.uid !== me.id) return null;
    return { ticket: rec.ticket, uid: rec.uid, login: rec.login, iat: rec.iat || 0, at: rec.at || 0 };
  }

  /** Сокет представился не тем, кем надо (или публично, хотя пропуск есть), — переподключить. */
  function syncSocket(why, code) {
    const st = CPX.ws.state.status;
    // Сокет ещё не представился (или его нет) — при открытии он сам возьмёт нужный пропуск.
    if (st !== "hello" && st !== "open") return;
    const want = ticketForHello();
    // Кем представились: подтверждённая личность, а пока ждём ответа на hello — что предъявили.
    const id = st === "open" ? CPX.ws.identity : CPX.ws.presented;
    if ((want ? want.uid : "") !== (id ? id.uid : "")) CPX.ws.reconnect(why, code);
  }

  /** Принять ответ входа/продления в ячейку slotUid. false — пропуск чужой, не сохранён. */
  function storeReply(slotUid, j) {
    const ticket = String((j && j.ticket) || "");
    const exp = Number(j && j.exp) || 0;
    if (!ticket || exp <= 0) return false;
    const p = decodeTicket(ticket);
    const owner = String((j && j.uid) || (p && p.u) || "");
    if (owner !== slotUid || (p && String(p.u) !== slotUid)) {
      // Чужой пропуск в ячейке — не сохраняем и не предъявляем. Ключ продления (если был) не
      // стираем (обновления никого не разлогинивают), но и не продлеваем по кругу: ждём входа.
      const rec = records[slotUid];
      if (rec) {
        rec.foreign = true;
        save();
      }
      log.warn("пропуск выдан другому человеку — не сохранён (ячейка", slotUid + ")");
      return false;
    }
    const prev = records[slotUid] || {};
    records[slotUid] = {
      ticket,
      exp,
      iat: Number(p && p.iat) || nowSec(),
      renew: String(j.renew || prev.renew || ""),
      renew_exp: Number(j.renew_exp) || prev.renew_exp || 0,
      login: String(j.login || (p && p.l) || prev.login || "").toLowerCase(),
      name: String(j.name || (p && p.n) || prev.name || "").slice(0, 40),
      uid: slotUid,
      scoped: j.scoped != null ? !!j.scoped : !!prev.scoped,
      at: Date.now(),
    };
    save();
    return true;
  }

  async function api(method, path, body) {
    // Та же дверь, через которую открывается сокет: у кого закрыт прямой путь — закрыт и HTTPS.
    const bases = [CPX.ws.apiBase(), ...CPX.ws.doors().filter((b) => b !== CPX.ws.apiBase())];
    let lastErr = null;
    for (const base of bases) {
      try {
        const r = await fetch(base + path, {
          method,
          headers: body ? { "Content-Type": "application/json" } : undefined,
          body: body ? JSON.stringify(body) : undefined,
          cache: "no-store",
          credentials: "omit",
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        CPX.clock.fromResponse(base + path, r);
        let json = null;
        try {
          json = await r.json();
        } catch (_) {
          /* не JSON (429 без тела, страница прослойки) */
        }
        return { status: r.status, json, base };
      } catch (e) {
        lastErr = e; // сеть/таймаут — пробуем другую дверь
      }
    }
    return { status: 0, json: null, error: String((lastErr && lastErr.message) || "network") };
  }

  /** Продлить пропуск ячейки uid. → true, если свежий пропуск сохранён. */
  function renew(uid, opts) {
    if (renewing.has(uid)) return renewing.get(uid);
    const force = !!(opts && opts.force);
    const rec = records[uid];
    if (!rec || !rec.renew || rec.foreign) return Promise.resolve(false);
    const now = Date.now();
    const gap = force ? 1500 : RENEW_MIN_GAP_MS * Math.min(renewFail + 1, 10);
    if (now - lastRenewAt < gap) return Promise.resolve(false);
    lastRenewAt = now;
    const p = (async () => {
      const r = await api("POST", "/auth/renew", { renew: rec.renew });
      if (r.status === 200 && r.json) {
        if (!storeReply(uid, r.json)) return false;
        renewFail = 0;
        log.info("пропуск продлён:", records[uid].login);
        changed();
        return true;
      }
      renewFail++;
      if (r.status === 401) {
        // Ключ продления больше не годен — войти заново. Пропуск оставляем до его срока.
        log.warn("ключ продления отвергнут сервером — нужен новый вход");
        const cur = records[uid];
        if (cur) {
          cur.renew = "";
          if (!usable(cur)) delete records[uid];
          save();
        }
        if (me && me.id === uid) lastError = { code: "relogin", at: Date.now() };
        changed();
      } else if (r.status === 429 && renewFail <= 3) {
        // Сервер пускает одно продление в секунду с адреса — повторим через пару секунд.
        lastRenewAt = 0;
        setTimeout(() => ensureTicket(), 2000 * renewFail);
      } else {
        log.warn("продление не удалось:", r.status || r.error);
      }
      return false;
    })()
      .catch((e) => {
        CPX.report("auth:renew", e);
        return false;
      })
      .finally(() => renewing.delete(uid));
    renewing.set(uid, p);
    return p;
  }

  /** Пропуск текущего человека протух или скоро протухнет — продлить. */
  function ensureTicket() {
    if (!me || !CPX.settings.get("general.consent")) return Promise.resolve(false);
    const rec = records[me.id];
    if (!rec || !rec.renew || rec.foreign) return Promise.resolve(false);
    if (rec.ticket && rec.exp - RENEW_MARGIN_SEC > nowSec()) return Promise.resolve(true);
    const uid = me.id;
    return renew(uid).then((ok) => {
      if (ok) syncSocket("пропуск продлён", "renew");
      return ok;
    });
  }

  /** Для мод-операций соседей: соединение подтверждено пропуском не старше ~25 мин.
   * → Promise<boolean>. При необходимости продлевает и переподключает сокет. */
  function freshTicket(maxAgeSec) {
    const maxAge = Math.min(maxAgeSec || FRESH_MAX_AGE_SEC, FRESH_MAX_AGE_SEC);
    const young = (x) => ticketAge(x) < maxAge;
    const id = CPX.ws.identity;
    if (id && me && id.uid === me.id && young(id)) return Promise.resolve(true);
    if (freshInFlight) return freshInFlight;
    freshInFlight = (async () => {
      if (!me || !records[me.id]) return false;
      const uid = me.id;
      // Свежий пропуск уже лежит в ячейке (обычное продление только что прошло — принудительное
      // тогда откажет по паузе) — просто переподключаемся с ним; иначе продлеваем принудительно.
      if (!(usable(records[uid]) && young(records[uid]))) {
        await renew(uid, { force: true });
        if (!(usable(records[uid]) && young(records[uid]))) return false;
      }
      if (!me || me.id !== uid) return false;
      const opened = new Promise((res) => {
        const t = setTimeout(() => {
          off();
          res(false);
        }, 15000);
        const off = CPX.ws.on("open", (d) => {
          clearTimeout(t);
          off();
          res(!!(d.verified && d.identity && d.identity.uid === uid));
        });
      });
      CPX.ws.reconnect("свежий пропуск для модерации", "ticket");
      return await opened;
    })().finally(() => (freshInFlight = null));
    return freshInFlight;
  }

  /* ── Вход ────────────────────────────────────────────────────────────────── */

  function authError(code, extra) {
    lastError = Object.assign({ code, at: Date.now() }, extra || {});
    changed();
    return Object.assign(new Error(code), { code, quiet: true });
  }

  /** «Войти». Повторное нажатие, пока идёт /auth/begin (popup и настройки открыты вместе, popup
   * открыли заново), получает ТОТ ЖЕ вход — иначе две вкладки Twitch и висящий первый вход. */
  function login() {
    if (!loginInFlight) loginInFlight = beginLogin().finally(() => (loginInFlight = null));
    return loginInFlight;
  }

  async function beginLogin() {
    await loaded;
    if (!CPX.settings.get("general.consent")) throw authError("consent");
    if (!me) throw authError("no-twitch");
    // ⚠️Личность фиксируем ЗДЕСЬ, на нажатии кнопки.
    const uid = me.id;
    const wantLogin = me.login;
    if (pending && pending.uid === uid && pending.deadline > Date.now()) {
      if (pending.tabId) chrome.tabs.update(pending.tabId, { active: true }).catch(() => {});
      return { ok: true, pending: true };
    }
    if (pending) await finishLogin("cancelled", { why: "restart" });
    lastError = null;

    let r = null;
    for (let i = 1; i <= 3; i++) {
      r = await api("GET", "/auth/begin?uid=" + encodeURIComponent(uid));
      if (r.status === 200) break;
      if (r.status === 503) throw authError("server-off");
      if (i < 3) await CPX.sleep(r.status === 429 ? 2200 : 2500 * i);
    }
    if (!me || me.id !== uid) throw authError("cancelled", { why: "account" });
    if (!r || r.status !== 200 || !r.json) throw authError("network", { status: r ? r.status : 0 });
    const state = String(r.json.state || "");
    const url = String(r.json.url || "");
    let host = "";
    try {
      const u = new URL(url);
      host = u.protocol === "https:" ? u.hostname : "";
    } catch (_) {
      /* плохой адрес */
    }
    // Ссылка — только на страницу входа Twitch по https (даже от своего сервера).
    if (!state || !(host === "twitch.tv" || host.endsWith(".twitch.tv"))) throw authError("bad-reply");

    let opener;
    try {
      const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (active && typeof active.id === "number") opener = active.id;
    } catch (_) {
      /* без возврата на исходную вкладку */
    }
    let tab;
    try {
      tab = await chrome.tabs.create(opener != null ? { url, openerTabId: opener } : { url });
    } catch (_) {
      tab = await chrome.tabs.create({ url });
    }
    const wait = Math.min(POLL_MAX_MS, Math.max(60000, (Number(r.json.wait) || 900) * 1000 - 5000));
    pending = { state, uid, login: wantLogin, api: r.base, tabId: tab && tab.id, startedAt: Date.now(), deadline: Date.now() + wait, tabClosedAt: 0 };
    await savePending();
    log.info("вход начат для", wantLogin);
    startPolling();
    changed();
    return { ok: true };
  }

  function startPolling() {
    // Будильник — страховка: фон может уснуть, пока человек на странице Twitch.
    Promise.resolve(chrome.alarms.create(POLL_ALARM, { periodInMinutes: 0.5 })).catch(() => {});
    if (!pollTimer && !polling) pollTimer = setTimeout(pollOnce, POLL_MS);
  }

  async function pollOnce() {
    pollTimer = 0;
    if (!pending || polling) return;
    const p = pending;
    if (Date.now() > p.deadline) return finishLogin("expired");
    if (p.tabClosedAt && Date.now() - p.tabClosedAt > TAB_CLOSED_GRACE_MS) return finishLogin("cancelled", { why: "tab" });
    polling = true;
    let r;
    try {
      r = await fetch(p.api + "/auth/poll?state=" + encodeURIComponent(p.state), {
        cache: "no-store",
        credentials: "omit",
        signal: AbortSignal.timeout(10000),
      }).then(async (res) => ({ status: res.status, json: await res.json().catch(() => null) }));
    } catch (_) {
      r = { status: 0, json: null };
    } finally {
      polling = false;
    }
    if (pending !== p) return; // отменили, пока ждали ответ
    if (r.status === 0) {
      // Дверь, через которую начали вход, не отвечает — следующий опрос через другую:
      // сервер за ними один, ожидание входа у него общее.
      const other = CPX.ws.doors().find((b) => b !== p.api);
      if (other) {
        p.api = other;
        savePending();
      }
    }
    const j = r.json;
    if (r.status === 404) return finishLogin("expired");
    if (r.status === 200 && j) {
      if (j.denied) return finishLogin("denied", { got: String(j.got || "").slice(0, 40) });
      if (j.ticket) {
        // Своя сверка поверх серверной: по числовому id (ник меняется, id — нет).
        if (j.uid && String(j.uid) !== p.uid) return finishLogin("denied", { got: String(j.login || "").slice(0, 40) });
        if (!storeReply(p.uid, j)) return finishLogin("denied", { got: String(j.login || "").slice(0, 40) });
        return finishLogin("ok");
      }
    }
    pollTimer = setTimeout(pollOnce, r.status === 429 || r.status === 0 ? POLL_MS * 2 : POLL_MS);
  }

  async function finishLogin(result, extra) {
    const p = pending;
    if (!p) return;
    pending = null;
    clearTimeout(pollTimer);
    pollTimer = 0;
    Promise.resolve(chrome.alarms.clear(POLL_ALARM)).catch(() => {});
    await savePending();
    if (result === "ok") {
      lastError = null;
      const rec = records[p.uid];
      log.info("вход подтверждён:", rec && rec.login, rec && rec.scoped ? "(права модератора выяснены)" : "");
      // Свою вкладку входа закрываем; при отказе — оставляем: там написано, что не так.
      if (p.tabId != null && !p.tabClosedAt) chrome.tabs.remove(p.tabId).catch(() => {});
      syncSocket("вход подтверждён", "login");
    } else {
      if (result === "cancelled" && p.tabId != null && !p.tabClosedAt && (extra && extra.why) !== "tab") {
        chrome.tabs.remove(p.tabId).catch(() => {});
      }
      lastError = result === "cancelled" && extra && extra.why === "restart" ? null : Object.assign({ code: result, at: Date.now() }, extra || {});
      log.info("вход не завершён:", result);
    }
    changed();
  }

  async function logout(uid) {
    await loaded;
    uid = String(uid || (me && me.id) || "");
    if (pending && pending.uid === uid) await finishLogin("cancelled", { why: "logout" });
    if (records[uid]) {
      delete records[uid];
      await save();
      log.info("выход: пропуск стёрт");
    }
    lastError = null;
    syncSocket("выход", "logout");
    changed();
    return true;
  }

  chrome.alarms.onAlarm.addListener((a) => {
    if (a.name !== POLL_ALARM) return;
    loaded.then(() => {
      if (!pending) Promise.resolve(chrome.alarms.clear(POLL_ALARM)).catch(() => {});
      else if (!pollTimer && !polling) pollOnce();
    });
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    if (pending && pending.tabId === tabId && !pending.tabClosedAt) {
      pending.tabClosedAt = Date.now();
      savePending();
    }
  });

  /* ── Состояние для страниц ───────────────────────────────────────────────── */

  function publicState(forMe) {
    const cur = forMe === undefined ? me : forMe;
    const rec = cur ? records[cur.id] : null;
    const good = !!(rec && !rec.foreign && (rec.renew || usable(rec)));
    const id = CPX.ws.identity;
    return {
      consent: !!CPX.settings.get("general.consent"),
      twitch: cur ? { id: cur.id, login: cur.login, name: cur.displayName } : null,
      loggedIn: good,
      // Пропуск ещё годен, но сервер отверг ключ продления (401) — нужна кнопка «Войти заново».
      relogin: good && !rec.renew,
      login: good ? rec.login : "",
      name: good ? rec.name || rec.login : "",
      uid: good ? rec.uid : "",
      scoped: good ? !!rec.scoped : false,
      verified: !!(id && cur && id.uid === cur.id),
      // Вход есть у других аккаунтов этого браузера (подсказка «вы вошли как X, а на Twitch — Y»).
      others: Object.values(records)
        .filter((r) => r && (!cur || r.uid !== cur.id) && !r.foreign && (r.renew || usable(r)))
        .map((r) => r.login)
        .slice(0, 5),
      pending: pending ? { login: pending.login, since: pending.startedAt, until: pending.deadline } : null,
      error: lastError,
    };
  }

  /** Для мира страницы Twitch — без логинов других аккаунтов этого браузера (там же работают
   *  чужие скрипты; подсказка «вход есть у…» нужна только страницам расширения). */
  const forPage = (st) => Object.assign({}, st, { others: [] });

  const changed = CPX.debounce(() => {
    const st = publicState();
    ev.emit("changed", st);
    CPX.router.toTabs("auth.changed", forPage(st));
    CPX.router.toExt("auth.changed", st);
  }, 50);

  /* ── Связь с сокетом ─────────────────────────────────────────────────────── */

  CPX.ws.setTicketSource(ticketForHello, loaded, () => waitMe().then(() => ensureTicket()));

  CPX.ws.on("hello", (m, info) => {
    const pr = info && info.presented;
    if (pr && !m.verified) {
      // Пропуск предъявлен, но сервер его не принял (протух, сменился секрет подписи).
      // Соединение не рвём — работаем публично, пропуск перевыпускаем в фоне.
      const rec = records[pr.uid];
      if (rec && rec.ticket) {
        rec.ticket = "";
        rec.exp = 0;
        save();
      }
      renewFail++;
      renew(pr.uid).then((ok) => ok && syncSocket("пропуск перевыпущен", "renew"));
      changed();
    } else {
      changed();
    }
  });

  CPX.ws.on("tick", () => {
    // Продление — заранее, на ЖИВОМ соединении (иначе о протухшем узнаём только при обрыве).
    ensureTicket();
  });

  CPX.ws.on("authstale", (m) => {
    const stale = m && m.reason === "stale";
    const now = Date.now();
    if (!stale && now - lastStaleAt < STALE_GAP_MS) return; // не крутим карусель
    lastStaleAt = now;
    const id = CPX.ws.identity;
    if (!id) return;
    renew(id.uid, { force: true }).then((ok) => ok && CPX.ws.reconnect("authstale", "renew"));
  });

  CPX.ws.on("state", () => changed());

  CPX.router.ev.on("tab:close", (tab) => {
    if (tabMe.delete(tab)) recomputeMe();
  });

  CPX.settings.on((ch) => {
    if ("general.consent" in ch) {
      if (!ch["general.consent"] && pending) finishLogin("cancelled", { why: "consent" });
      changed();
    }
  });

  /* ── Методы ──────────────────────────────────────────────────────────────── */

  CPX.router.handle(
    "auth.me",
    async (p, ctx) => {
      await loaded;
      const m = cleanMe(p && p.me);
      if (ctx.tab) {
        const s = ctx.sender || {};
        const incognito = !!(s.tab && s.tab.incognito);
        // Верхняя рамка — номер 0. У предзагруженной страницы (prerender: Chrome грузит twitch.tv
        // заранее по набору в адресной строке) номер другой, и порт с ним живёт до конца —
        // тогда верим признаку самой рамки: он из того же мира, что и сам доклад, а чужой сайт
        // во вложенную рамку twitch.tv не пролезет.
        const top = ctx.tab.frameId === 0 || (s.documentLifecycle === "prerender" && !!(p && p.top === true));
        tabMe.set(ctx.tab, { me: m, at: Date.now(), seq: ++meSeq, incognito, top });
        if (top && !incognito) {
          recomputeMe();
          for (const f of meWaiters.slice()) f();
        }
      }
      // Ответ — про человека, ПРИНЯТОГО фоном, а не про доложенного: иначе перебором id можно было
      // бы узнать, у кого из аккаунтов есть вход в этом браузере (ревью 01.10).
      return forPage(publicState());
    },
    { page: true }
  );

  CPX.router.handle(
    "auth.state",
    async (p, ctx) => {
      await loaded;
      if (ctx.from === "page") return forPage(publicState()); // не по докладу вкладки — без перебора аккаунтов
      const r = ctx.tab && tabMe.get(ctx.tab);
      return publicState(r ? r.me : undefined);
    },
    { page: true }
  );

  CPX.router.handle("auth.login", () => login());
  CPX.router.handle("auth.logout", (p) => logout(p && p.uid));
  CPX.router.handle("auth.cancel", async () => {
    await finishLogin("cancelled", { why: "user" });
    lastError = null;
    changed();
    return true;
  });

  CPX.diag.add("auth", () => ({
    me: me ? me.login : null,
    accounts: Object.values(records).map((r) => ({ login: r.login, ticket: !!r.ticket, exp: r.exp, renew: !!r.renew, foreign: !!r.foreign })),
    pending: !!pending,
    error: lastError && lastError.code,
  }));

  return {
    loaded,
    get me() {
      return me ? Object.assign({}, me) : null;
    },
    /** Сколько мс держится нынешний человек после смены аккаунта (Infinity — смены не было). */
    meStableMs: () => (meSince ? Date.now() - meSince : Infinity),
    /** Публичное состояние (без секретов). */
    state: () => publicState(),
    on: (name, fn) => ev.on(name, fn),
    freshTicket,
    ensureTicket,
    /** Пропуск текущего человека годен и сокет подтверждён им (для мод-операций соседей). */
    isVerified: () => {
      const id = CPX.ws.identity;
      return !!(id && me && id.uid === me.id);
    },
    login,
    logout,
    /** Только для стенда проверки (dev): подставить «кто вошёл на twitch.tv». */
    _debugSetMe: CPX.dev ? (m) => setMe(cleanMe(m)) : undefined,
    /** Только для стенда проверки (dev): подставить запись пропуска. */
    _debugPut: CPX.dev
      ? (uid, rec) => {
          records[uid] = rec;
          return save();
        }
      : undefined,
  };
})();

// ── src/bg/44_plus.js ──
/* Фон: подписка PLUS — свой статус, «кто из них наш» (c7who), список подписчиков (c7roster).
 *
 * Свой статус приходит ТОЛЬКО от сервера (research/03 §3.1): блок plus в ответе на hello и
 * кадры plus_self (смена подписки, флагов, продление пропуска зеркала). Клиент ничего не решает
 * сам; платные функции сервер проверяет у себя. Как в клиенте (PlusService::isActive):
 * сервер на связи — верим серверу; нет связи — по сроку until; иначе неделя доверия снимку.
 * Снимок (без секретов) — chrome.storage.local["cpx.plusSelf"], по ячейкам uid.
 *
 * Пропуск зеркала (plus.mirror, 3 суток) — секрет: держим только здесь, для этапа 5
 * (CPX.plus.mirror()); в страницу и в события не уходит. В том же блоке сервер может прислать first:true —
 * «всё 7TV сначала через зеркало» (владелец вписал человека на сервере, задание mirrorwatch 23.10): блок без
 * него — обычный режим.
 *
 * c7who (research/03 §3.2, typingws.py:4296): пачки ≤40 логинов, не чаще раза в 0,5 с;
 * ответ {asked, users, online, seen, plus?}. ⚠️Нет поля plus — сбор у сервера сорвался:
 * ничего не стираем (иначе у всей пачки пропали бы бейджи и пейнты).
 *
 * c7roster + plus_update: соединение, спросившее список, становится «держателем» и получает
 * каждую правку. Правка несёт версии rv (после) и rb (до): не совпала наша версия с rb —
 * мы что-то пропустили, перекачиваем список. Живые правки уходят модулю косметики
 * (CPX.plusRoster.apply в его формате — см. toNeighbor) и событиями
 * CPX.plus.on("roster" {version, users} | "update" {login, profile|null, version, base}).
 *
 * Жалоба на пейнт (5.4.0, решение владельца 03.10): кадр paint_report {paint, login, reason, comment, ref} по
 * тому же сокету, нужен подтверждённый вход (иначе сервер — «auth»); ответ {op:"paint_report", ref, ok | error}
 * (already · rate · self · not_found · auth · bad · server). Ответ ищем по ref; нет ответа REPORT_WAIT_MS —
 * «timeout»; сокет закрыт (сейчас или пока ждали) — «offline». Решает и ограничивает частоту СЕРВЕР
 * (раз в 3 с с соединения, 10 в час / 30 в сутки на человека, одна жалоба на пейнт у носящего) — здесь только
 * проверка полей, чтобы не слать заведомый «bad». Методом может воспользоваться любой скрипт на twitch.tv (как
 * эстафетой массбана) — от его имени жалоба уйдёт только с ограничениями сервера.
 *
 * Методы: plus.state [page] (публичная часть статуса), plus.who {logins} [page],
 *         plus.paintReport {paint, login, reason, comment} [page] → {ok:true} | {error},
 *         plus.setProfile {show_badge?, show_online?, hide_sharedban_badge?} — только страницы расширения.
 * Событие всем: "plus.changed" (публичное состояние).
 */

CPX.plus = (() => {
  const log = CPX.log("plus");
  const ev = new CPX.Emitter();

  const SNAP_KEY = "cpx.plusSelf";
  const SUB_URL = "https://chat.eblo.id/chatterino/sub/";
  const SNAPSHOT_TRUST_MS = 7 * 86400000;
  const WHO_BATCH = 40;
  const WHO_GAP_MS = 550; // сервер: 1 кадр c7who в 0,5 с (лишнее копит и отвечает позже)
  const WHO_FRESH_MS = 40000; // ответ свежий — не переспрашиваем
  const WHO_TIMEOUT_MS = 12000;
  const WHO_MAX_PER_CALL = 100;
  const ROSTER_REFRESH_MS = 5 * 60000;
  const ROSTER_TIMEOUT_MS = 25000;
  const ROSTER_MIN_GAP_MS = 21000; // сервер: не чаще раза в 20 с
  const PROFILE_SEND_GAP_MS = 1100; // сервер: plus_profile не чаще раза в секунду (лишнее — молча)

  const LOGIN_RE = /^[a-z0-9_]{1,25}$/;
  const ID_RE = /^\d{1,20}$/;
  const OUR_HOSTS = ["eblo.id", "rish098.xyz"];

  /* ── Очистка данных сервера (второй рубеж: числа, #rrggbb, адреса по белому списку) ── */

  const int = (v, lo, hi) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : 0;
  };

  function ourUrl(u) {
    try {
      const x = new URL(String(u || ""));
      const h = x.hostname.toLowerCase();
      if (x.protocol === "https:" && OUR_HOSTS.some((d) => h === d || h.endsWith("." + d))) return x.href;
    } catch (_) {
      /* не адрес */
    }
    return "";
  }

  function cleanProfile(p) {
    if (!p || typeof p !== "object") return null;
    const login = String(p.login || "").toLowerCase();
    if (!LOGIN_RE.test(login)) return null;
    const out = {
      login,
      uid: ID_RE.test(String(p.uid || "")) ? String(p.uid) : "",
      months: int(p.months, 0, 1200),
      badge: !!p.badge,
      online_visible: !!p.online_visible,
      color: CPX.safe.hex(p.color) || null,
      paint: Number.isInteger(p.paint) && p.paint > 0 ? p.paint : null,
      paint_v: int(p.paint_v, 0, 1e9),
    };
    // Надетый значок перед ником (37_plus_roster: каталог) — только если не стандартный.
    if (typeof p.badge_id === "string" && /^[a-z0-9]{1,16}$/.test(p.badge_id)) out.badge_id = p.badge_id;
    // Привязка Kick (сервер п.143, 15.11) — в слой списка PLUS (37_plus_roster: страницам пару не показываем).
    if (p.kick && typeof p.kick === "object" && /^\d{1,20}$/.test(String(p.kick.id || ""))) out.kick = { id: String(p.kick.id), name: String(p.kick.name || "").slice(0, 32) };
    for (const k of ["avatar", "banner"]) {
      const u = CPX.safe.imgUrl(p[k]);
      if (u) {
        out[k] = u;
        if (p[k + "_anim"]) out[k + "_anim"] = 1;
      }
    }
    return out;
  }

  function cleanSelf(b) {
    const pr = (b && b.profile) || {};
    const site = ourUrl(b.site) || SUB_URL;
    return {
      active: !!b.active,
      due: !!b.due,
      auto: !!b.auto,
      renew_at: int(b.renew_at, 0, 4e9),
      until: int(b.until, 0, 4e9),
      months: int(b.months, 0, 1200),
      months_paid: int(b.months_paid, 0, 1200),
      left_days: int(b.left_days, 0, 100000),
      days: int(b.days, 0, 1000000),
      cancelled: !!b.cancelled,
      profile: {
        name_color: CPX.safe.hex(pr.name_color) || null,
        paint_id: Number.isInteger(pr.paint_id) && pr.paint_id > 0 ? pr.paint_id : null,
        show_badge: !!pr.show_badge,
        show_online: !!pr.show_online,
        hide_sharedban_badge: !!pr.hide_sharedban_badge,
        avatar_id: int(pr.avatar_id, 0, 1e12),
        banner_id: int(pr.banner_id, 0, 1e12),
      },
      enforce: !!b.enforce,
      early: Array.isArray(b.early) ? b.early.filter((x) => typeof x === "string" && x.length < 64).slice(0, 20) : [],
      site,
      // Значки (ивент в верхней панели, 46_awards): надетый и — когда сервер начнёт присылать — вся коллекция (owned).
      badge_id: typeof b.badge_id === "string" && /^[a-z0-9]{1,16}$/.test(b.badge_id) ? b.badge_id : "",
      owned: Array.isArray(b.owned) ? b.owned.filter((x) => typeof x === "string" && /^[a-z0-9]{1,16}$/.test(x)).slice(0, 200) : null,
    };
  }

  /* ── Свой статус ─────────────────────────────────────────────────────────── */

  let snaps = Object.create(null); // uid → { data, at, login }
  let live = null; // { uid, at } — статус, полученный на ТЕКУЩЕМ соединении
  let mirror = null; // { t, exp, uid } — секрет
  let lastMirrorAsk = 0;

  const loaded = chrome.storage.local
    .get(SNAP_KEY)
    .then((r) => {
      const s = r && r[SNAP_KEY];
      if (s && typeof s === "object") for (const uid in s) if (ID_RE.test(uid) && s[uid] && s[uid].data) snaps[uid] = s[uid];
    })
    .catch(() => {});

  const saveSnaps = CPX.debounce(() => chrome.storage.local.set({ [SNAP_KEY]: snaps }).catch(() => {}), 500);

  function applySelf(uid, block, login) {
    if (!ID_RE.test(String(uid || "")) || !block || typeof block !== "object") return;
    const data = cleanSelf(block);
    snaps[uid] = { data, at: Date.now(), login: login || (snaps[uid] && snaps[uid].login) || "" };
    live = { uid, at: Date.now() };
    const m = block.mirror;
    if (m && typeof m.t === "string" && m.t.length < 4096 && Number(m.exp) > 0) mirror = { t: m.t, exp: Number(m.exp), uid, first: m.first === true };
    else if (!data.active) mirror = null; // подписка кончилась — в зеркало больше не ходим
    saveSnaps();
    changed();
  }

  function currentUid() {
    const me = CPX.auth.me;
    return me ? me.id : "";
  }

  function isLive(uid) {
    const id = CPX.ws.identity;
    return !!(live && live.uid === uid && id && id.uid === uid);
  }

  /** Активна ли подписка у того, кто сейчас вошёл на twitch.tv. */
  function isActive() {
    const uid = currentUid();
    const s = uid && snaps[uid];
    if (!s) return false;
    if (isLive(uid)) return !!s.data.active;
    if (s.data.until && s.data.until * 1000 > CPX.clock.now()) return true; // срок — время сервера
    return !!s.data.active && Date.now() - s.at < SNAPSHOT_TRUST_MS;
  }

  function publicState() {
    const uid = currentUid();
    const s = uid && snaps[uid];
    const auth = CPX.auth.state();
    const base = { known: false, live: false, active: false, loggedIn: !!auth.loggedIn, subscribeUrl: SUB_URL };
    if (!s || !auth.loggedIn) return base;
    return Object.assign(base, s.data, {
      known: true,
      live: isLive(uid),
      active: isActive(),
      at: s.at,
      login: s.login || auth.login,
    });
  }

  let lastSent = "";
  const changed = CPX.debounce(() => {
    const st = publicState();
    const key = JSON.stringify(st, (k, v) => (k === "at" ? undefined : v));
    if (key === lastSent) return;
    lastSent = key;
    ev.emit("changed", st);
    CPX.router.broadcast("plus.changed", st);
  }, 60);

  /** Пропуск зеркала текущего человека (для этапа 5) — { t, exp, first } или null. Только фон! */
  function getMirror() {
    const uid = currentUid();
    if (!mirror || mirror.uid !== uid || mirror.exp * 1000 <= CPX.clock.now()) return null;
    return { t: mirror.t, exp: mirror.exp, first: !!mirror.first };
  }

  /** Попросить у сервера свежий пропуск зеркала (сервер: не чаще раза в 20 с). */
  function requestMirror() {
    if (!CPX.ws.verified || Date.now() - lastMirrorAsk < 21000) return false;
    lastMirrorAsk = Date.now();
    return CPX.ws.send("plus_mirror", {});
  }

  /* ── c7who ───────────────────────────────────────────────────────────────── */

  const whoCache = new CPX.LRU(3000); // login → { at, ours, online, seen, presenceKnown, plus, plusKnown }
  const waiters = new Map(); // login → Set(fn)
  const askQueue = new Set();
  const asked = new Map(); // login → когда спросили (ответ ещё не пришёл)
  let whoTimer = 0;
  let lastWhoAt = 0;

  function view(c) {
    if (!c) return null;
    return {
      ours: c.ours,
      online: c.online,
      seen: c.seen,
      presenceKnown: c.presenceKnown,
      plusKnown: c.plusKnown,
      plus: c.plus || null,
      at: c.at,
    };
  }

  function scheduleWho() {
    if (whoTimer || !askQueue.size) return;
    whoTimer = setTimeout(flushWho, Math.max(0, lastWhoAt + WHO_GAP_MS - Date.now()));
  }

  function flushWho() {
    whoTimer = 0;
    if (!CPX.ws.isOpen()) return; // спросим после подключения
    const batch = [];
    for (const l of askQueue) {
      askQueue.delete(l);
      batch.push(l);
      if (batch.length >= WHO_BATCH) break;
    }
    if (!batch.length) return;
    lastWhoAt = Date.now();
    for (const l of batch) asked.set(l, lastWhoAt);
    CPX.ws.send("c7who", { logins: batch });
    scheduleWho();
  }

  function onWho(m) {
    const now = Date.now();
    const hasPlus = Array.isArray(m.plus);
    const plusMap = new Map();
    if (hasPlus) {
      for (const p of m.plus) {
        const c = cleanProfile(p);
        if (c) plusMap.set(c.login, c);
      }
    }
    const lower = (a) => (Array.isArray(a) ? a.map((x) => String(x || "").toLowerCase()) : []);
    const users = new Set(lower(m.users));
    const online = new Set(lower(m.online));
    const seen = m.seen && typeof m.seen === "object" ? m.seen : {};
    // Присутствие (online/seen) сервер отдаёт только соединению, подтверждённому платящим зрителем
    // (typingws.py _c7who_answer, признак st["plus_active"] из hello/plus_self), — иначе списки
    // пустые и ничего не значат. Поэтому «достоверно» — только если ЭТО соединение подтверждено
    // человеком со страницы и живой статус с сервера на нём говорит «активна». Снимок подписки
    // (неделя доверия, срок «до») тут не годится: в минуты публичного режима (пропуск отвергнут,
    // продление не удалось, связь ещё не переподключилась) все оказались бы «точно не в сети».
    const uid = currentUid();
    const presenceKnown = Array.isArray(m.online) && isLive(uid) && !!(snaps[uid] && snaps[uid].data.active);
    for (const login of lower(m.asked)) {
      if (!LOGIN_RE.test(login)) continue;
      const prev = whoCache.get(login);
      const entry = {
        at: now,
        ours: users.has(login),
        online: online.has(login),
        seen: int(seen[login], 0, 4e9),
        presenceKnown,
        plus: hasPlus ? plusMap.get(login) || null : prev ? prev.plus : null,
        plusKnown: hasPlus || !!(prev && prev.plusKnown),
      };
      whoCache.set(login, entry);
      asked.delete(login);
      const ws = waiters.get(login);
      if (ws) {
        waiters.delete(login);
        for (const fn of ws) fn();
      }
    }
  }

  /** Кто из логинов — пользователи Chatterino+ (и профили PLUS). → { login: view | null } */
  async function who(list, opts) {
    const force = !!(opts && opts.force);
    const out = Object.create(null);
    const need = [];
    const now = Date.now();
    for (const raw of (Array.isArray(list) ? list : []).slice(0, WHO_MAX_PER_CALL)) {
      const login = String(raw || "").toLowerCase();
      if (!LOGIN_RE.test(login) || login in out) continue;
      const c = whoCache.get(login);
      if (c && !force && now - c.at < WHO_FRESH_MS) out[login] = view(c);
      else {
        out[login] = view(c);
        need.push(login);
      }
    }
    if (!need.length || !CPX.ws.isOpen()) return out;
    await new Promise((resolve) => {
      let left = need.length;
      const mine = []; // [login, fn] — свои ожидания, чтобы снять их при завершении
      const timer = setTimeout(done, WHO_TIMEOUT_MS);
      function done() {
        if (left < 0) return;
        clearTimeout(timer);
        left = -1;
        // Снять СВОИ ожидания (по таймауту они иначе оставались бы в наборах навсегда
        // и переспрашивались после каждого переподключения); неотвеченный вопрос — забыть.
        const now2 = Date.now();
        for (const [login, fn] of mine) {
          const set = waiters.get(login);
          if (set) {
            set.delete(fn);
            if (!set.size) waiters.delete(login);
          }
          const at = asked.get(login);
          if (at && now2 - at >= WHO_TIMEOUT_MS) asked.delete(login);
        }
        resolve();
      }
      for (const login of need) {
        const fn = () => {
          if (left > 0 && --left === 0) done();
        };
        let set = waiters.get(login);
        if (!set) waiters.set(login, (set = new Set()));
        set.add(fn);
        mine.push([login, fn]);
        const at = asked.get(login);
        if (!at || Date.now() - at > WHO_TIMEOUT_MS) askQueue.add(login);
      }
      scheduleWho();
    });
    for (const login of need) out[login] = view(whoCache.get(login));
    return out;
  }

  // Ждущие без ответа (кадр ушёл в оборвавшийся сокет) — переспросить после подключения.
  function reaskPending() {
    asked.clear();
    for (const login of waiters.keys()) askQueue.add(login);
    scheduleWho();
  }

  /* ── Список подписчиков ──────────────────────────────────────────────────── */

  const roster = { ver: "", map: new Map(), synced: false, parts: null, partsVer: "", partsGot: 0, askedAt: 0, lastAsk: 0, fails: 0 };
  let rosterTimer = 0;

  /* Живые правки — модулю косметики (src/bg/37_plus_roster.js, он же берёт публичный
   * /api/v1/plus/roster с той же версией, что у c7roster).
   * ⚠️Полный список из сокета ему НЕ подсовываем: в c7roster нет описаний пейнтов, а с той же
   * версией его следующий запрос получил бы 304 — новые пейнты остались бы без описания.
   * Версия разошлась — просим его перечитать публичный список. Правку одного человека
   * отдаём в его формате, с описанием пейнта (paint_get по сокету); версию передаём, только
   * если он был ровно на предыдущей (rb) и описание пейнта есть — иначе пусть сверится сам. */
  const paintWait = new Map(); // id → [fn]

  function paintSpec(id) {
    return new Promise((resolve) => {
      if (!CPX.ws.isOpen()) return resolve(null);
      const t = setTimeout(() => done(null), 3000);
      function done(v) {
        clearTimeout(t);
        const list = paintWait.get(id);
        if (list) {
          const i = list.indexOf(done);
          if (i >= 0) list.splice(i, 1);
          if (!list.length) paintWait.delete(id);
        }
        resolve(v);
      }
      const list = paintWait.get(id) || [];
      if (!list.length) CPX.ws.send("paint_get", { ids: [id] });
      list.push(done);
      paintWait.set(id, list);
    });
  }

  function onPaint(m) {
    const paints = m.paints && typeof m.paints === "object" ? m.paints : {};
    for (const k in paints) {
      const list = paintWait.get(Number(k));
      if (!list) continue;
      const p = paints[k];
      const v = p && p.spec && typeof p.spec === "object" ? { v: int(p.v, 0, 1e9), spec: p.spec } : null;
      for (const fn of list.slice()) fn(v);
    }
  }

  function neighborUser(p) {
    if (!p || !p.uid) return null;
    return { id: p.uid, login: p.login, badge: p.badge, badge_id: p.badge_id, paint: p.paint, paint_v: p.paint_v, months: p.months, color: p.color || undefined, avatar: p.avatar || undefined, kick: p.kick || undefined };
  }

  async function toNeighbor(msg) {
    ev.emit(msg.type, msg);
    const pr = CPX.plusRoster;
    if (!pr || typeof pr.apply !== "function") return;
    if (msg.type === "roster") {
      if (msg.version && pr.version !== msg.version && typeof pr.load === "function") CPX.safely("plus:roster-load", () => pr.load());
      // Стаж, цвет ника и своя аватарка есть только в списке по сокету (в публичном /api/v1 их нет) — отдаём
      // их слоем сразу по всем подписчикам, а не по одному при отдельных правках.
      const layer = (msg.users || [])
        .map(neighborUser)
        .filter(Boolean)
        .map((u) => ({ id: u.id, login: u.login, months: u.months, color: u.color, avatar: u.avatar, kick: u.kick }));
      if (layer.length) CPX.safely("plus:roster-layer", () => pr.apply({ layer }));
      return;
    }
    const before = pr.version;
    const d = { user: neighborUser(msg.profile), login: msg.login };
    let specOk = !msg.profile || !msg.profile.paint;
    if (msg.profile && msg.profile.paint) {
      const s = await paintSpec(msg.profile.paint);
      if (s) {
        d.paint = { id: msg.profile.paint, v: s.v, spec: s.spec };
        specOk = true;
      }
    }
    if (msg.version && msg.base && before === msg.base && specOk) d.version = msg.version;
    CPX.safely("plus:roster-apply", () => pr.apply(d));
  }

  function requestRoster() {
    if (!CPX.ws.isOpen()) return;
    const now = Date.now();
    if (now - roster.lastAsk < ROSTER_MIN_GAP_MS) {
      // Сервер ответит молчанием — подождём окно.
      clearTimeout(rosterTimer);
      rosterTimer = setTimeout(requestRoster, roster.lastAsk + ROSTER_MIN_GAP_MS - now);
      return;
    }
    roster.lastAsk = now;
    roster.askedAt = now;
    CPX.ws.send("c7roster", { v: roster.synced || roster.map.size ? roster.ver : "" });
    clearTimeout(rosterTimer);
    rosterTimer = setTimeout(rosterTimeout, ROSTER_TIMEOUT_MS);
  }

  function rosterTimeout() {
    if (!roster.askedAt) return;
    roster.askedAt = 0;
    roster.synced = false;
    const wait = Math.min(ROSTER_REFRESH_MS, ROSTER_TIMEOUT_MS << Math.min(roster.fails, 4));
    roster.fails++;
    clearTimeout(rosterTimer);
    rosterTimer = setTimeout(requestRoster, wait);
  }

  function scheduleRosterRefresh() {
    clearTimeout(rosterTimer);
    rosterTimer = setTimeout(requestRoster, ROSTER_REFRESH_MS);
  }

  function onRoster(m) {
    const ver = String(m.v || "");
    const parts = int(m.parts, 1, 10000) || 1;
    if (parts > 1) {
      // Большой список сервер шлёт частями; копим по порядку, пропуск — начинаем заново.
      const part = Number.isInteger(m.part) ? m.part : -1;
      if (part === 0 || ver !== roster.partsVer) {
        roster.parts = [];
        roster.partsVer = ver;
        roster.partsGot = 0;
      }
      if (part !== roster.partsGot || !roster.parts) {
        roster.parts = null;
        roster.partsVer = "";
        roster.partsGot = 0;
        return;
      }
      if (Array.isArray(m.plus)) roster.parts.push(...m.plus);
      if (++roster.partsGot < parts) return;
      const whole = { v: ver, plus: roster.parts };
      roster.parts = null;
      roster.partsVer = "";
      roster.partsGot = 0;
      return onRoster(whole);
    }
    roster.askedAt = 0;
    roster.fails = 0;
    scheduleRosterRefresh();
    if (m.same) {
      if (ver && ver === roster.ver && roster.map.size) roster.synced = true;
      return;
    }
    if (!Array.isArray(m.plus)) return;
    const next = new Map();
    for (const p of m.plus) {
      const c = cleanProfile(p);
      if (c) next.set(c.login, c);
    }
    roster.map = next;
    roster.ver = ver;
    roster.synced = true;
    log.info("список подписчиков:", next.size);
    toNeighbor({ type: "roster", version: ver, users: [...next.values()] });
  }

  function onUpdate(m) {
    const login = String(m.login || "").toLowerCase();
    if (!LOGIN_RE.test(login)) return;
    const profile = m.plus && typeof m.plus === "object" ? cleanProfile(Object.assign({}, m.plus, { login })) : null;
    if (profile) roster.map.set(login, profile);
    else roster.map.delete(login);
    const c = whoCache.get(login);
    if (c) {
      c.plus = profile;
      c.plusKnown = true;
    }
    const rv = String(m.rv || "");
    const rb = String(m.rb || "");
    if (rv && roster.synced && rb) {
      if (rb === roster.ver) roster.ver = rv;
      else {
        // Пропустили правку — версия разошлась. Перекачаем список.
        roster.synced = false;
        requestRoster();
      }
    }
    toNeighbor({ type: "update", login, profile, version: rv, base: rb });
  }

  /* ── Тумблеры профиля (бейдж, «в сети», значок общих банов) ─────────────── */

  let profilePatch = null;
  let profileTimer = 0;
  let lastProfileSend = 0;

  function sendProfile() {
    profileTimer = 0;
    if (!profilePatch) return;
    const wait = lastProfileSend + PROFILE_SEND_GAP_MS - Date.now();
    if (wait > 0) {
      profileTimer = setTimeout(sendProfile, wait);
      return;
    }
    const patch = profilePatch;
    profilePatch = null;
    lastProfileSend = Date.now();
    CPX.ws.send("plus_profile", patch);
  }

  function setProfile(p) {
    if (!CPX.ws.verified || !isActive()) throw Object.assign(new Error("нужна активная подписка и связь"), { code: "not-active", quiet: true });
    const patch = {};
    for (const k of ["show_badge", "show_online", "hide_sharedban_badge"]) if (p && k in p) patch[k] = p[k] ? 1 : 0;
    if (!Object.keys(patch).length) return { ok: false };
    profilePatch = Object.assign(profilePatch || {}, patch);
    if (!profileTimer) sendProfile();
    return { ok: true };
  }

  /* ── Жалоба на пейнт ───────────────────────────────────────────────────── */

  // Коды кнопок окна жалобы (main/87_card_report.js, владелец 12.10) и «other» — текст без кнопки.
  const REPORT_REASONS = new Set(["unreadable", "strobe", "trash", "other"]);
  const REPORT_COMMENT_MAX = 300;
  const REPORT_WAIT_MS = 8000;
  const reportWait = new Map(); // ref → done(ответ)
  let reportRef = 0;
  // Стенд (dev): подменный ответ вместо сервера — код ответа, "noreply" (молчит), "close" (связь оборвалась)
  // или "server" (как сервер: первая жалоба на пейнт у человека — ok, повторная — already).
  const reportStub = { mode: null, sent: new Set(), last: null };

  function paintReport(p) {
    p = p || {};
    const paint = Number(p.paint);
    const login = String(p.login || "").trim().toLowerCase();
    const reason = String(p.reason || "");
    const comment = String(p.comment || "")
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, REPORT_COMMENT_MAX);
    if (!Number.isInteger(paint) || paint <= 0 || !/^[a-z0-9_]{1,25}$/.test(login) || !REPORT_REASONS.has(reason)) return Promise.resolve({ error: "bad" });
    const stub = CPX.dev && reportStub.mode;
    if (!stub && !CPX.ws.isOpen()) return Promise.resolve({ error: "offline" });
    if (!stub && !CPX.ws.verified) return Promise.resolve({ error: "auth" });
    const ref = ++reportRef;
    const frame = { paint, login, reason, comment, ref };
    return new Promise((resolve) => {
      let t = 0;
      const done = (r) => {
        if (reportWait.get(ref) !== done) return;
        reportWait.delete(ref);
        clearTimeout(t);
        resolve(r);
      };
      t = setTimeout(() => done({ error: "timeout" }), REPORT_WAIT_MS);
      reportWait.set(ref, done);
      if (stub) return stubReply(frame, done);
      if (!CPX.ws.send("paint_report", frame)) done({ error: "offline" });
    });
  }
  function stubReply(frame, done) {
    reportStub.last = frame;
    const mode = reportStub.mode;
    if (mode === "noreply") return;
    setTimeout(() => {
      if (mode === "close") return done({ error: "offline" });
      if (mode === "server") {
        const key = frame.paint + ":" + frame.login;
        if (reportStub.sent.has(key)) return done({ error: "already" });
        reportStub.sent.add(key);
        return done({ ok: true });
      }
      done(mode === "ok" ? { ok: true } : { error: mode });
    }, 300);
  }
  CPX.ws.on("paint_report", (m) => {
    const done = reportWait.get(Number(m.ref));
    if (done) done(m.ok === true ? { ok: true } : { error: String(m.error || "server").slice(0, 40) });
  });

  /* ── Связь с сокетом ─────────────────────────────────────────────────────── */

  CPX.ws.on("hello", (m, info) => {
    const pr = info && info.presented;
    if (m.verified && pr) {
      if (m.plus && typeof m.plus === "object") applySelf(pr.uid, m.plus, pr.login);
      else {
        live = null;
        changed();
      }
    } else {
      live = null;
      changed();
    }
  });
  CPX.ws.on("plus_self", (m) => {
    const id = CPX.ws.identity;
    if (id && m.plus && typeof m.plus === "object") applySelf(id.uid, m.plus, id.login);
  });
  CPX.ws.on("open", () => {
    reaskPending();
    requestRoster();
  });
  CPX.ws.on("close", () => {
    // Ждали ответа на жалобу — его уже не будет.
    for (const done of [...reportWait.values()]) done({ error: "offline" });
    live = null;
    roster.askedAt = 0;
    clearTimeout(rosterTimer);
    rosterTimer = 0;
    changed();
  });
  CPX.ws.on("c7who", CPX.guard("plus:c7who", onWho));
  CPX.ws.on("c7roster", CPX.guard("plus:c7roster", onRoster));
  CPX.ws.on("plus_update", CPX.guard("plus:update", onUpdate));
  CPX.ws.on("paint", CPX.guard("plus:paint", onPaint));
  CPX.ws.on("tick", () => {
    // Пропуск зеркала живёт 3 суток; соединение может жить дольше — просим новый за сутки.
    const m = getMirror();
    if (m && m.exp * 1000 - CPX.clock.now() < 86400000 && Date.now() - lastMirrorAsk > 3600000) requestMirror();
  });
  CPX.auth.on("changed", () => changed());

  /* ── Методы ──────────────────────────────────────────────────────────────── */

  CPX.router.handle(
    "plus.state",
    async () => {
      await loaded;
      return publicState();
    },
    { page: true }
  );
  CPX.router.handle("plus.who", (p) => who(p && p.logins, { force: !!(p && p.force) }), { page: true });
  CPX.router.handle("plus.paintReport", (p) => paintReport(p), { page: true });
  CPX.router.handle("plus.setProfile", (p) => setProfile(p));

  CPX.diag.add("plus", () => ({
    state: (() => {
      const s = publicState();
      return { known: s.known, live: s.live, active: s.active, until: s.until || 0 };
    })(),
    mirror: !!getMirror(),
    who: { cache: whoCache.size, waiting: waiters.size, queue: askQueue.size },
    roster: { size: roster.map.size, ver: roster.ver.slice(0, 12), synced: roster.synced },
  }));

  return {
    loaded,
    on: (name, fn) => ev.on(name, fn),
    /** Публичная часть своего статуса (без секретов). */
    get self() {
      return publicState();
    },
    isActive,
    /** Для модулей фона: { login: {ours, online, seen, presenceKnown, plus, plusKnown} | null }. */
    who,
    /** Профиль подписчика из списка (или undefined, если список ещё не пришёл). */
    profile: (login) => (roster.synced || roster.map.size ? roster.map.get(String(login || "").toLowerCase()) || null : undefined),
    roster: () => ({ version: roster.ver, synced: roster.synced, users: [...roster.map.values()] }),
    /** Список по сокету живой: сокет открыт и мы — «держатель» со сверенной версией (правки идут сюда; пропуск виден
     *  по rv/rb). Публичный список тогда сверяется реже (37_plus_roster). ⚠️synced после обрыва не сбрасывается —
     *  поэтому ещё и «сокет открыт». */
    rosterLive: () => !!roster.synced && CPX.ws.isOpen(),
    mirror: getMirror,
    requestMirror,
    SUB_URL,
    /** Только для стенда проверки (dev): подставить свой статус. */
    _debugApplySelf: CPX.dev ? (uid, block, login) => applySelf(uid, block, login) : undefined,
    /** Только для стенда (dev): подменный ответ на жалобу (см. reportStub). */
    _reportStub: CPX.dev ? reportStub : undefined,
  };
})();

// ── src/bg/46_awards.js ──
/* Фон: ивент в верхней панели (владелец 19.11 → 2.3.2). Пока идёт ивент (сервер: plus_awards.py), наш плюс в верхней
 * панели Twitch и Kick — значок ивента (src/main/94_dock_event.js); у кого значка ещё нет (и у не вошедших — владелец
 * 19.11) — с мягким свечением; нажатие — настройки на первой странице с полосой об ивенте (src/pages/20_pages.js).
 * Ивент кончился (или выключен в админке) — снова наш плюс. Всё — от сервера, без обновления расширения.
 *
 * ОТКУДА. Публичная ручка …/chatterino/sub/api/awards/public (без входа; ws.chat.eblo.id, запасной chat.eblo.id — как
 * список PLUS, 37_plus_roster): идущие ивенты — название, значок (картинки тёмной и светлой темы), площадка, каналы со
 * ссылками, категории, начало и конец, «только в эфир». Сервер кэширует ответ 20 с.
 *   • Когда спрашивать: при запуске и раз в EVERY, пока открыта хоть одна вкладка Twitch или Kick; сразу — по сигналу
 *     «ивенты изменились» (poke: версия aw в ответе сверки списка PLUS — раз в минуту; сервер п.169, выложен 19.11:
 *     включили, выключили в админке, изменили, начался, кончился); сбой — пауза CPX.net.Backoff (поток запросов 18.11).
 *     Конец ивента (ends_at) — своим таймером, в ту же секунду, без запроса.
 *   • Есть ли значок у человека: коллекция owned в plus_self (номера значков; сервер шлёт её заново при каждой выдаче и
 *     отборе — свечение гаснет сразу); старый сервер без owned — надетый значок.
 *   • Значки ивентов — и встроенные (gta6), и свои значки владельца из админки (ev1, ev2…): картинки по адресам
 *     сервера; 18/36/72 — всегда квадрат, 128/512 — 128×112 и 512×448 (вписываем, не растягиваем). Новая картинка —
 *     новый адрес (версия в имени файла) и новая aw.
 *   • Куда вести: targets сервера (каналы, потом категории; url "" — сервер ещё не узнал адрес категории — строим сами);
 *     условие — hint (пишет владелец; только как текст), пустое — пишем сами.
 *   • Картинку значка (36 и 72 px, тёмная и светлая) фон держит у себя строкой data: — мир страницы кладёт её в свою
 *     память сайта и при следующем открытии Twitch рисует значок сразу, до ответа фона (без мигания).
 *
 * Метод для страниц и вкладок (page:true): awards.state → состояние (ниже). Событие всем: "awards.state" — то же,
 * когда что-то сменилось. CPX.awards.poke(aw) — версия ивентов из сверки списка PLUS (37_plus_roster).
 * Состояние: {ev: null} | {ev: {id, title, badge:{id, title, big}, platform, channels:[{name, url, live}],
 *   categories:[…], targets:[{kind, name, url}], starts_at, ends_at, need_live, live, hint}, img: {d1, d2, l1, l2},
 *   me: {logged, known, plus, got, kick}, glow}
 */

CPX.awards = (() => {
  const log = CPX.log("awards");
  const BASES = ["https://ws.chat.eblo.id", "https://chat.eblo.id"];
  const PATH = "/chatterino/sub/api/awards/public";
  const KEY = "cpx.awards";
  const EVERY = 10 * 60000; // без сигнала «изменились» (см. шапку)
  const FRESH_MS = 25000; // ответ сервера свежий к новой версии aw, если спрошен не раньше (сервер держит ответ 20 с)
  const IMG_MAX = 96 * 1024;
  const IMG_TIMEOUT = 15000;
  const IMG_HOST = /^https:\/\/([a-z0-9-]+\.)*(eblo\.id|rish098\.xyz)\//i;
  const ID_RE = /^[a-z0-9]{1,16}$/;

  // aw — версия ивентов, к которой список уже свежий (помним между запусками); want — последняя из сверки списка PLUS.
  const S = { list: [], at: 0, imgs: {}, restored: null, aw: null, want: null, wantAt: 0 };
  const bo = new CPX.net.Backoff(30000, 30 * 60000);
  let baseIdx = 0;
  let busy = null;
  let endT = 0;
  let lastSent = "";

  // ── разбор ответа ───────────────────────────────────────────────────────────
  const str = (v, n) => String(v == null ? "" : v).slice(0, n);
  const num = (v) => (Number.isFinite(+v) && +v > 0 ? Math.floor(+v) : 0);
  const imgUrl = (u) => (typeof u === "string" && IMG_HOST.test(u) ? CPX.safe.imgUrl(u) : "");
  function linkUrl(u, platform) {
    try {
      const x = new URL(String(u));
      const ok = platform === "kick" ? x.hostname === "kick.com" : /(^|\.)twitch\.tv$/.test(x.hostname);
      return x.protocol === "https:" && ok ? x.href : "";
    } catch (_) {
      return "";
    }
  }
  /** Адрес категории площадки по названию — пока сервер не присылает готовый (targets). */
  function catUrl(name, platform) {
    const slug = String(name)
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (!slug) return "";
    return platform === "kick" ? "https://kick.com/category/" + slug : "https://www.twitch.tv/directory/category/" + slug;
  }

  function cleanEvent(e) {
    if (!e || typeof e !== "object" || !e.badge || !ID_RE.test(String(e.badge.id || ""))) return null;
    const platform = e.platform === "kick" ? "kick" : e.platform === "twitch" ? "twitch" : "";
    if (!platform) return null;
    const img = e.badge.img || {};
    const pick = (t, n) => imgUrl(img[t] && img[t][n]);
    const out = {
      id: num(e.id),
      title: str(e.title, 80),
      badge: { id: String(e.badge.id), title: str(e.badge.title, 80), big: pick("dark", "128") || pick("dark", "72") },
      // big — для полосы в настройках: тоже строкой data: (страница не ходит за картинкой сама — 20.11 там была битая).
      src: { d1: pick("dark", "36"), d2: pick("dark", "72"), l1: pick("light", "36"), l2: pick("light", "72"), big: pick("dark", "128") || pick("dark", "72") },
      platform,
      channels: (Array.isArray(e.channels) ? e.channels : [])
        .slice(0, 10)
        .map((c) => c && { name: str(c.name, 40), url: linkUrl(c.url, platform), live: !!c.live })
        .filter((c) => c && c.name && c.url),
      categories: (Array.isArray(e.categories) ? e.categories : []).slice(0, 10).map((c) => str(c, 80)).filter(Boolean),
      targets: [],
      starts_at: num(e.starts_at),
      ends_at: num(e.ends_at),
      need_live: e.need_live !== false,
      live: !!e.live,
      hint: str(e.hint, 200),
    };
    if (!out.id || !out.src.d1) return null;
    // Куда вести кнопку: готовые адреса сервера (targets) — иначе каналы, иначе категории (адрес по названию).
    for (const t of Array.isArray(e.targets) ? e.targets.slice(0, 10) : []) {
      const url = t && linkUrl(t.url, platform);
      if (url) out.targets.push({ kind: t.kind === "channel" ? "channel" : "category", name: str(t.name, 80), url });
    }
    if (!out.targets.length) {
      for (const c of out.channels) out.targets.push({ kind: "channel", name: c.name, url: c.url });
      if (!out.channels.length) for (const c of out.categories) out.targets.push({ kind: "category", name: c, url: catUrl(c, platform) });
    }
    out.targets = out.targets.filter((t) => t.url);
    return out;
  }

  // ── картинки значка строкой data: ───────────────────────────────────────────
  /** Картинка строкой data:. Не вышла по адресу сервера — тот же путь через другую дверь того же сервера (ws.chat.eblo.id
   *  ↔ chat.eblo.id, как BASES): хостер включает «проверку браузера» то на одной, то на другой (20.11: на ws — 403 на
   *  картинки и API, chat — отдавал). Картинок у ивента 5 и качаются раз — запросов это почти не прибавляет. */
  async function dataUrl(url) {
    try {
      return await dataUrlOnce(url);
    } catch (e) {
      const alt = CPX.safe.otherDoor(url);
      if (!alt) throw e;
      return dataUrlOnce(alt);
    }
  }
  async function dataUrlOnce(url) {
    // Свой срок: повисший ответ держал бы загрузку «занятой» — и ивенты не обновлялись бы до перезапуска фона.
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), IMG_TIMEOUT);
    try {
      return await readImg(url, ctl.signal);
    } finally {
      clearTimeout(t);
    }
  }
  async function readImg(url, signal) {
    const r = await fetch(url, { credentials: "omit", signal });
    const type = String(r.headers.get("Content-Type") || "").split(";")[0].trim();
    if (!r.ok || !/^image\/(png|webp|gif)$/.test(type)) throw new Error("картинка: " + r.status + " " + type);
    const b = new Uint8Array(await r.arrayBuffer());
    if (!b.length || b.length > IMG_MAX) throw new Error("картинка: размер " + b.length);
    let s = "";
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    return "data:" + type + ";base64," + btoa(s);
  }
  /** Картинки текущего ивента — в память (уже есть — не качаем). Не вышло — останется https-адрес (рисуется и так). */
  async function fetchImgs(ev) {
    let changed = false;
    for (const u of Object.values(ev.src)) {
      if (!u || S.imgs[u]) continue;
      try {
        S.imgs[u] = await dataUrl(u);
        changed = true;
      } catch (e) {
        log.debug("значок ивента:", e && e.message);
      }
    }
    // Чужие (прошлых ивентов) — вон.
    const keep = new Set(Object.values(ev.src));
    for (const u of Object.keys(S.imgs)) if (!keep.has(u)) delete S.imgs[u];
    return changed;
  }

  // ── состояние ───────────────────────────────────────────────────────────────
  const nowSec = () => Math.floor(CPX.clock.now() / 1000);
  const activeList = () => S.list.filter((e) => (!e.starts_at || e.starts_at <= nowSec()) && (!e.ends_at || e.ends_at > nowSec()));

  function me() {
    const P = (CPX.plus && CPX.plus.self) || {};
    const pr = P.login && CPX.plus.profile ? CPX.plus.profile(P.login) : null;
    return { logged: !!P.loggedIn, known: !!P.known, plus: !!P.active, badge: P.badge_id || "", owned: Array.isArray(P.owned) ? P.owned : null, kick: !!(pr && pr.kick) };
  }
  const gotOf = (ev, m) => !!(m.known && (m.owned ? m.owned.includes(ev.badge.id) : m.badge === ev.badge.id));

  /** Какой ивент показывать: из идущих — тот, чьего значка ещё нет; все есть — первый (сервер отдаёт свежие первыми). */
  function current() {
    const m = me();
    const list = activeList();
    const ev = list.find((e) => !gotOf(e, m)) || list[0] || null;
    if (!ev) return { ev: null };
    const got = gotOf(ev, m);
    const img = {};
    for (const [k, u] of Object.entries(ev.src)) img[k] = S.imgs[u] || u;
    const pub = Object.assign({}, ev);
    delete pub.src;
    return { ev: pub, img, me: { logged: m.logged, known: m.known, plus: m.plus, got, kick: m.kick }, glow: !got };
  }

  function push() {
    const st = current();
    const key = JSON.stringify(st);
    planEnd();
    if (key === lastSent) return;
    lastSent = key;
    CPX.router.broadcast("awards.state", st);
  }

  /** Таймер на ближайший конец идущего ивента или начало будущего: значок меняется в ту же секунду. Только пересчёт
   *  состояния, БЕЗ запроса (ревью 19.11): у всех людей ивент кончается в одну секунду — запрос отсюда был бы всплеском
   *  всех копий разом, а сервер ещё 20 с отдаёт прежний ответ. Свежий список принесёт сигнал aw из сверки. */
  function planEnd() {
    clearTimeout(endT);
    const now = nowSec();
    const at = S.list
      .flatMap((e) => [e.starts_at, e.ends_at])
      .filter((t) => t && t > now);
    if (!at.length) return;
    const ms = Math.min(...at) * 1000 - CPX.clock.now() + 500;
    endT = setTimeout(CPX.guard("awards:end", push), Math.max(1000, Math.min(ms, 2 ** 31 - 1)));
  }

  function persist() {
    chrome.storage.local.set({ [KEY]: { list: S.list, imgs: S.imgs, at: S.at, aw: S.aw } }).catch(() => {});
  }
  function restore() {
    if (!S.restored) {
      S.restored = chrome.storage.local
        .get(KEY)
        .then((r) => {
          const d = r && r[KEY];
          if (d && Array.isArray(d.list) && !S.at) {
            // Своя копия уже разобранных ивентов — проверить только вид.
            S.list = d.list.filter((e) => e && e.id && e.badge && ID_RE.test(String(e.badge.id)) && e.src && IMG_HOST.test(String(e.src.d1 || "")) && Array.isArray(e.targets));
            S.imgs = {};
            for (const [u, v] of Object.entries((d.imgs && typeof d.imgs === "object" && d.imgs) || {})) {
              if (IMG_HOST.test(u) && typeof v === "string" && /^data:image\/(png|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(v) && v.length < IMG_MAX * 1.4) S.imgs[u] = v;
            }
            S.at = d.at || 1;
          }
          if (d && S.aw === null && typeof d.aw === "string") S.aw = d.aw.slice(0, 64);
        })
        .catch(() => {});
    }
    return S.restored;
  }

  // ── загрузка ────────────────────────────────────────────────────────────────
  /** Запрос: текущий адрес, при сбое — сразу один раз другой (как список PLUS, 37: «проверку браузера» хостер включает то
   *  на одной двери, то на другой — 18.11 на chat, 20.11 на ws). Не пробуем другой только на 429 («слишком часто» — тот
   *  же сервер). Оба не ответили — итог первого адреса (его срок «повтори через»). q — добавка к адресу. */
  async function api(q) {
    let first = null;
    for (let i = 0; i < BASES.length; i++) {
      const k = (baseIdx + i) % BASES.length;
      let r = await CPX.net.fetchJSON(BASES[k] + PATH + (q || ""), { timeout: 15000, retries: 0, full: true });
      if (r.ok && r.data && Array.isArray(r.data.events)) {
        baseIdx = k;
        return r;
      }
      if (r.ok) r = { ok: false, status: 0 };
      first = first || r;
      if (r.status === 429) break;
    }
    return first;
  }

  function load() {
    if (busy) return busy;
    if (!bo.ready()) return Promise.resolve(false);
    busy = (async () => {
      await restore();
      // Есть версия из сверки — адрес с ней (?aw=): кэши по дороге и самого браузера (max-age 15) отдадут свежее.
      const want = S.want;
      const fresh = want !== null && Date.now() - S.wantAt >= FRESH_MS;
      const r = await api(want !== null ? "?aw=" + encodeURIComponent(want || "-") : "");
      if (!r.ok) {
        // 403 нашего сервера — «проверка браузера» хостера, а не запрет: пауза как на сбой (30 с, растёт), не сразу 30 минут.
        bo.fail(r.status === 403 ? { status: 0, retryAfter: r.retryAfter } : r);
        return false;
      }
      bo.ok();
      // Спросили позже, чем сервер успел сменить свой ответ, — список свежий к этой версии.
      if (fresh && want === S.want) S.aw = want;
      S.list = r.data.events.slice(0, 10).map(cleanEvent).filter(Boolean);
      S.at = Date.now();
      const cur = current();
      const ev = cur.ev && S.list.find((e) => e.id === cur.ev.id);
      if (ev) await fetchImgs(ev);
      else S.imgs = {};
      persist();
      push();
      return true;
    })()
      .catch((e) => (CPX.report("awards:load", e), false))
      .finally(() => (busy = null));
    return busy;
  }

  let pokeT = 0;
  /** Версия идущих ивентов aw из сверки списка PLUS (37; "" — ивентов нет). Новая — спросить сейчас (ответ может быть ещё
   *  прежним: сервер держит его 20 с) и через FRESH_MS; свежей версию считаем, только когда её список пришёл (load), — до
   *  тех пор tick догружает раз в минуту, пока пускает пауза (ревью 19.11: версия запоминалась до загрузки, и сорвавшаяся
   *  загрузка откладывала ивент на 10–30 минут). */
  async function poke(aw) {
    await restore();
    if (typeof aw !== "string" || aw === S.want) return;
    S.want = aw;
    S.wantAt = Date.now();
    if (aw === S.aw) return;
    load();
    clearTimeout(pokeT);
    pokeT = setTimeout(CPX.guard("awards:poke", () => load()), FRESH_MS + 500);
  }

  function tick() {
    if (!CPX.router.pageTabs()) return;
    const behind = S.want !== null && S.want !== S.aw && Date.now() - S.wantAt >= FRESH_MS;
    if (behind || Date.now() - S.at >= EVERY) load();
  }

  CPX.router.handle(
    "awards.state",
    async () => {
      await restore();
      // Не ждать сети: страницы (окно значка, настройки) ждут ответа вместе с остальными данными — на медленной сети
      // окно стояло бы пустым до 30 с (ревью 19.11). Ивентов ещё не знаем — загрузка, а итог придёт рассылкой.
      if (!S.at) load();
      return current();
    },
    { page: true }
  );

  CPX.boot.add(
    "awards",
    () => {
      restore().then(() => push());
      setInterval(CPX.guard("awards:tick", tick), 60000);
      // Свой статус (PLUS, значки, вход) — «есть ли значок» и свечение пересчитать.
      if (CPX.plus && CPX.plus.on) CPX.plus.on("changed", () => push());
      CPX.router.ev.on("tab:open", tick);
      CPX.router.ev.on("site:open", tick);
    },
    46
  );

  CPX.diag.add("awards", () => {
    const c = current();
    return { events: S.list.length, at: S.at, aw: S.aw, want: S.want, imgs: Object.keys(S.imgs).length, cur: c.ev ? { id: c.ev.id, badge: c.ev.badge.id, ends: c.ev.ends_at, got: c.me.got, glow: c.glow } : null };
  });

  return { poke, load, state: current };
})();

// ── src/bg/50_mirror.js ──
/* Фон: зеркало 7TV через наш сервер — ТОЛЬКО подписчикам PLUS (этап 5). Здесь — «мозг» маршрута.
 *
 * Перенос клиента Chatterino+ (src/providers/plus/ServiceMirror.cpp, NetworkTask.cpp) и решений
 * владельца (26.09.2026, память project_chatterino_plus_service_mirror):
 *  • зеркало не разрешено (нет подписки/пропуска, чужой хост) — всё идёт как раньше, НИЧЕГО не
 *    меняется: у не-подписчиков сеть расширения прежняя;
 *  • разрешено — сначала напрямую (сторож «ни ответа 10 с»); сорвалось по СВЯЗИ — тот же запрос
 *    сразу через зеркало. Сервис ответил ошибкой (404, 500…) — это его ответ, отдаём как есть;
 *  • STICKY_FAILS сбоев прямого пути к хосту за STICKY_WINDOW — хост «липкий»: сначала зеркало,
 *    потом напрямую (STICKY_MS, помнится в chrome.storage — проснувшийся фон не ждёт сбоев заново);
 *    сокету живых обновлений хватает ОДНОГО сбоя (каждая его попытка — ожидание соединения);
 *  • липкий хост тихо проверяем напрямую (PROBE_FIRST, дальше PROBE_EVERY); удалась — повтор через
 *    PROBE_CONFIRM; два успеха подряд — липкость долой. Любой удачный прямой запрос — тоже довод;
 *  • ОТКАЗ 7TV напрямую (403, 429, 5xx — Cloudflare режет или сервис сбоит) — не ответ (badStatus): у запросов,
 *    которые берёт зеркало, — в зеркало (52), и пробы такой ответ удачей не считают (задание mirrorwatch 23.10: у
 *    recrent «то есть смайлики, то нет» — 403 от 7TV снимал липкость как удача). Сбоем ПУТИ (к липкости) отказ
 *    засчитываем, только если зеркало на тот же запрос ответило нормально и не старой копией: лежит сам 7TV — у всех
 *    подписчиков отказ и напрямую, и через зеркало, и липкость (с анти-качелями — на сутки) после его возврата
 *    гоняла бы всех через наш сервер. 404 и 304 — ответы;
 *  • АНТИ-КАЧЕЛИ: хост стал липким второй раз за HOLD_WINDOW (сутки) — держим «сначала зеркало» HOLD_MS (сутки), и
 *    прямые удачи эту липкость не снимают, проб нет (hold; помнится в chrome.storage вместе с отметками липкости);
 *  • ПРИНУДИТЕЛЬНО (forced): в пропуске зеркала сервер прислал first:true (CPX.plus.mirror().first) — все хосты 7TV
 *    сначала через зеркало, картинки страницы тоже; прямой путь — запасной. Блок без first — обычный режим;
 *  • «какой путь жил последним — тот первый»: зеркало только что сорвалось по связи (или после его
 *    сбоя уже сработал прямой) — даже липкий хост сначала пробуем напрямую (mirrorDoubtful);
 *  • не работают ОБА пути — ждём сами, какой оживёт первым: проба прямого раз в 1→5 мин и сводка
 *    /mirror/status (достаёт ли наш сервер); ожил — догружаем сорвавшееся (revive);
 *  • сервер не принял пропуск — в зеркало не ходим AUTH_BACKOFF и просим новый пропуск (отказ по
 *    уже заменённому пропуску зеркало не выключает);
 *  • не-подписчику — подсказка «7TV станет доступен при оформлении подписки PLUS», только если 7TV
 *    не работает ДОЛГО (HINT_AFTER без единого успеха, не меньше HINT_MIN_FAILS сбоев), человек
 *    вошёл на twitch.tv, есть согласие и НАШ сервер до 7TV сейчас достаёт; не чаще раза в сутки.
 *    Не вошёл в Chatterino+ — другой текст («если подписка уже есть — войдите»): без входа мы не
 *    знаем, подписчик ли он. Вошёл, а статус ещё не пришёл — молчим. «Раз в сутки» отсчитывается от
 *    ПОКАЗА (вкладка или popup подтверждают), а не от решения: до показа подсказка ждёт (hintPending).
 *    Владелец 23.10 («появляется постоянно, а должна — только если 7TV в чате не работает и видно текст вместо
 *    смайликов»): считаем только HINT_HOSTS — список смайликов (7tv.io) и их картинки (cdn.7tv.app); сбои живых
 *    обновлений (events.7tv.io) смайлики текстом не делают. Крестик у подсказки (mirror.hintOff) — больше никогда;
 *  • ⚠️удачи картинок со страницы маршрут НЕ меняют: <img> не отличает загрузку по сети от кэша
 *    браузера (cdn.7tv.app отдаёт картинки с кэшем на год) — «зеркало ок» из кэша при мёртвом
 *    зеркале снимало бы сомнение и возвращало картинки в мёртвое зеркало. Липкость, сомнение и
 *    оживление ведут только пробы и запросы самого фона; удачи страницы — лишь довод «7TV у
 *    человека работает» для подсказки не-подписчику (notePageOk);
 *  • оживление переподключает сокет живых обновлений, только если оживал сам events.7tv.io (как
 *    клиент): иначе каждая удача API или картинок после сбоя рвала бы здоровую трубу.
 *
 * Охват — только 7TV: 7tv.io (REST, запрос пейнтов, пачка «кто это у 7TV»), cdn.7tv.app (картинки), events.7tv.io
 * (живые обновления). BTTV/FFZ — нет: сервер в Москве, их CDN оттуда режутся (владелец).
 * ⚠️Хосты и белый список — как RULES/WS_RULES/GQL_RE/_who_parse в installer/update-server/mirror.py:
 * заведомо отвергнутое сервером (описания косметики пачкой по номерам, одиночный userByConnection, присутствие 7TV)
 * идёт ТОЛЬКО напрямую — как у клиента (присутствие через наш адрес он не шлёт сознательно). Пачку людей
 * userByConnection (35_cosmetics, до 50) сервер принимает с п.164 (18.11) — ровно с нашим набором полей (WHO_RE).
 *
 * Пропуск зеркала (typ "mirror", 3 суток) — секрет: берём у CPX.plus.mirror() (только фон), в
 * страницу, события и журнал не уходит. Продление (кадр plus_mirror за сутки до конца) ведёт
 * CPX.plus; здесь — просьба нового после отказа сервера.
 * Адрес зеркала — дверь нашего сокета (CPX.ws.apiBase(): ws.chat.eblo.id или ws.rish098.xyz);
 * в dev-сборке — dev.mirrorBase (только 127.0.0.1/localhost: пропуск не должен уехать чужим).
 *
 * API (для фона): CPX.mirror.route(url, method, body) → {known, mirrorable, mirrorFirst, mirrorUrl,
 *   auth, host} · noteDirect(host, ok, fromSocket) · noteMirror(host, outcome, fromSocket, authUsed)
 *   (outcome: "ok"|"transport"|"auth"|"upstream"|"refused") · notePageOk(host) · socketRoute(directUrl)
 *   → {url, protocols, viaMirror, host} · noteSocket(host, viaMirror, ok) · allowed() · base() ·
 *   pageState() · badStatus(код) · hintPending() → {svc, kind, at} | null · hintShown() · testBlock(host) · stats ·
 *   error(where, text) · loaded · on(имя, fn):
 *   "access" (разрешено/пропуск/адрес сменились — правило DNR), "page" (состояние для вкладок),
 *   "socket" {what: "reconnect"|"mirrored"|"unhealthy"} (сокету 7TV), "revive" {hosts},
 *   "hint" {svc, kind: "sub"|"login", at}, "block" (dev).
 */

CPX.mirror = (() => {
  const log = CPX.log("mirror");
  const ev = new CPX.Emitter();
  const STORE_KEY = "cpx.mirror";

  // Хосты 7TV, которые знает зеркало, и чем тихо проверить прямой путь (как клиент).
  const HOSTS = {
    "7tv.io": { probe: "https://7tv.io/v3/emote-sets/global" },
    // Проба картинок — крупнее порога, на котором провайдеры замораживают Cloudflare (замер 23.10: ~16–24 КБ проходят,
    // дальше соединение стоит). Прежняя 13,6 КБ проходила, а настоящие смайлики (100–350 КБ) — нет: те же качели.
    "cdn.7tv.app": { probe: "https://cdn.7tv.app/emote/01F6MQ33FG000FFJ97ZB8MWV52/1x.webp" },
    "events.7tv.io": { probe: "wss://events.7tv.io/v3", socket: true },
  };
  const ID7 = "[0-9A-Za-z]{10,40}";
  const GET_OK = {
    "7tv.io": [
      new RegExp("^/v3/users/(?:twitch|kick)/[0-9A-Za-z_]{1,40}$"),
      new RegExp("^/v3/users/" + ID7 + "$"),
      new RegExp("^/v3/emote-sets/(?:global|" + ID7 + ")$"),
    ],
    "cdn.7tv.app": [/^\/(?:emote|badge|paint|user)\/[0-9A-Za-z._/-]{1,200}$/],
  };
  // Запрос пейнтов 7TV — только «все» или «один по номеру» (mirror.py GQL_RE).
  const GQL_RE = /^query\{cosmetics\(list:\[(?:"[A-Za-z0-9]{1,64}")?\]\)\{paints\{[A-Za-z_{} ]{1,400}\}\}\}$/;
  // Пачка «кто это у 7TV» (35_cosmetics lookBatch; mirror.py _who_parse, WHO_FIELDS_OK): {a0:… a1:…}, до 50, поля —
  // ровно строка расширения. ⚠️Сменили строку запроса в 35 — сменить и здесь, и сказать основному чату (сервер сверяет
  // поля буква в букву).
  const WHO_FIELDS = "style{paint_id badge_id} roles emote_sets(entitled:true){id flags}";
  const WHO_ITEM = /([a-z][0-9]{1,2}):userByConnection\(platform:(TWITCH|KICK),id:"([0-9]{1,20})"\)\{([a-z_ {}():]{1,200})\} ?/y;
  const WS_QUERY_RE = /^[A-Za-z0-9=&._%+-]{0,200}$/;
  const OUR_BASES = ["https://ws.chat.eblo.id", "https://ws.rish098.xyz"];

  const STICKY_FAILS = 2;
  const HINT_MIN_FAILS = 3;
  const HINT_HOSTS = new Set(["7tv.io", "cdn.7tv.app"]); // от их сбоев смайлики 7TV в чате — текстом
  const hintOff = () => CPX.settings.get("mirror.hintOff") === true;
  // Сроки. FAST — только стенд (как C7_MIRROR_FAST клиента): сценарии за минуты, а не за час.
  const NORMAL = {
    STICKY_WINDOW: 2 * 60000,
    STICKY_MS: 60 * 60000,
    PROBE_FIRST: 5 * 60000,
    PROBE_EVERY: 10 * 60000,
    PROBE_CONFIRM: 60000,
    PROBE_TIMEOUT: 8000,
    AUTH_BACKOFF: 5 * 60000,
    TOKEN_MARGIN: 60000,
    // Подсказка не-подписчику: задача этапа 5 — «3+ минуты сбоев» (клиент ждёт 15 мин).
    HINT_AFTER: 3 * 60000,
    HINT_GAP: 24 * 3600000,
    HINT_CHECK_GAP: 10 * 60000,
    MIRROR_DOUBT: 60000,
    DOWN_PROBE: 60000,
    DOWN_PROBE_MAX: 5 * 60000,
    REVIVE_GAP: 60000,
    TICK: 15000,
    HOLD_MS: 24 * 3600000,
    HOLD_WINDOW: 24 * 3600000,
  };
  const FAST = Object.assign({}, NORMAL, {
    STICKY_MS: 5 * 60000,
    PROBE_FIRST: 20000,
    PROBE_EVERY: 30000,
    PROBE_CONFIRM: 10000,
    HINT_AFTER: 30000,
    HINT_GAP: 60000,
    HINT_CHECK_GAP: 20000,
    MIRROR_DOUBT: 20000,
    DOWN_PROBE: 10000,
    DOWN_PROBE_MAX: 60000,
    REVIVE_GAP: 5000,
    TICK: 2000,
    HOLD_MS: 3 * 60000,
    HOLD_WINDOW: 10 * 60000,
  });
  let T = NORMAL;

  const hosts = new Map(); // хост → состояние (hs)
  let pass = null; // { t, exp } — СЕКРЕТ
  let plusActive = false;
  let forced = false; // сервер велел: всё 7TV сначала через зеркало (см. шапку)
  let authRejectedUntil = 0;
  let lastAllowed = false;
  let lastAccessKey = "";
  let lastPageKey = "";
  let hintAt = 0; // когда подсказку последний раз ПОКАЗАЛИ (раз в сутки — от показа)
  let hintSvc = "";
  let hintPending = null; // { svc, kind, at } — решили показать, ждём вкладку или popup
  let hintCheckAt = 0;
  let statusBusy = false;
  let lastRevive = 0;
  let tickT = 0;
  let dbg = null; // dev: подставной статус { plus, pass, login, loggedIn }
  let block = Object.create(null); // dev: хост → "refuse" | "hang"

  const stats = {
    direct: 0,
    directFail: 0,
    mirror: 0,
    mirrorFail: 0,
    auth: 0,
    refused: 0,
    upstream: 0,
    edgeRetry: 0,
    stale: 0,
    queueMax: 0,
    probes: 0,
    status: 0,
    pageDirectOk: 0,
    pageMirrorOk: 0,
    pageSuspect: 0,
    verify: 0,
    tube: 0,
    tubeFail: 0,
    revive: 0,
  };
  const errors = []; // последние сбои (без пропуска): { at, where, text }

  function error(where, text) {
    errors.push({ at: Date.now(), where, text: String(text || "").slice(0, 160) });
    if (errors.length > 20) errors.shift();
  }

  function hs(host) {
    let s = hosts.get(host);
    if (!s) {
      s = {
        directFails: [],
        stickyUntil: 0,
        hold: false, // анти-качели: липкость на сутки, прямые удачи её не снимают
        marks: [], // когда хост становился липким (за HOLD_WINDOW)
        okStreak: 0,
        nextProbe: 0,
        lastDirectOk: 0,
        failStreakStart: 0,
        failStreak: 0,
        lastMirrorOk: 0,
        lastMirrorFail: 0,
        downCheck: 0,
        downGap: 0,
        probing: false,
      };
      hosts.set(host, s);
    }
    return s;
  }

  function parse(url) {
    try {
      const u = new URL(String(url || ""));
      return { host: u.hostname.toLowerCase(), protocol: u.protocol, path: u.pathname, search: u.search };
    } catch (_) {
      return null;
    }
  }

  /* ── Пропуск и «разрешено ли» ────────────────────────────────────────────── */

  function allowedAt(now) {
    // Срок пропуска — время СЕРВЕРА: к часам компьютера — поправка часов серверов (06_clock).
    return plusActive && !!pass && pass.exp * 1000 > now + CPX.clock.offset() + T.TOKEN_MARGIN && now >= authRejectedUntil;
  }

  function devBase() {
    if (!CPX.dev) return "";
    const v = String(CPX.settings.get("dev.mirrorBase") || "")
      .trim()
      .replace(/\/+$/, "");
    return /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d{1,5})?$/.test(v) ? v : "";
  }

  /** Адрес зеркала: дверь, через которую открыт наш сокет (у кого закрыт основной адрес, у того
   * он закрыт и для зеркала). */
  function base() {
    const d = devBase();
    if (d) return d;
    let b = "";
    try {
      b = CPX.ws.apiBase();
    } catch (_) {
      /* сокета нет — основной адрес */
    }
    return OUR_BASES.includes(b) ? b : OUR_BASES[0];
  }

  function currentLogin() {
    if (dbg && dbg.login) return dbg.login;
    const me = CPX.auth && CPX.auth.me;
    return me ? me.login : "";
  }

  /** Перечитать подписку и пропуск у CPX.plus (снимок, ответы сервера, смена аккаунта). */
  function refresh() {
    const now = Date.now();
    const was = allowedAt(now);
    let active = false;
    let p = null;
    if (dbg) {
      active = !!dbg.plus;
      p = active && dbg.pass ? dbg.pass : null;
    } else if (CPX.plus) {
      active = !!CPX.plus.isActive();
      p = active ? CPX.plus.mirror() : null;
    }
    const newToken = !!(p && p.t && (!pass || p.t !== pass.t));
    pass = p && p.t ? { t: String(p.t), exp: Number(p.exp) || 0 } : null;
    plusActive = active;
    const f = !!(pass && p.first);
    if (f !== forced) {
      forced = f;
      log.info(forced ? "сервер: всё 7TV сначала через наш сервер" : "сервер: обычный маршрут 7TV");
      // Включили — висящее подключение живых обновлений сразу трубой; выключили — с трубы на прямой путь.
      ev.emit("socket", { what: forced ? "unhealthy" : "mirrored" });
      pageMaybeChanged();
    }
    if (newToken) {
      authRejectedUntil = 0; // свежий пропуск — пробуем снова
      log.info("получен пропуск зеркала до", new Date(pass.exp * 1000).toISOString());
    }
    onAllowedMaybeChanged(was);
  }

  function accessChanged() {
    // Правило DNR (пропуск в картинках) — при смене пропуска, разрешения или адреса зеркала.
    const key = (allowedAt(Date.now()) ? "1" : "0") + "|" + (pass ? pass.t.length + ":" + pass.t.slice(-12) : "") + "|" + base();
    if (key !== lastAccessKey) {
      lastAccessKey = key;
      ev.emit("access");
    }
    pageMaybeChanged();
  }

  function onAllowedMaybeChanged(wasAllowed) {
    const now = Date.now();
    const on = allowedAt(now);
    const failed = [];
    if (!wasAllowed && on) {
      // Что сорвалось, пока зеркала не было (оформил подписку посреди работы или пропуск только
      // что обновился после отказа), — то и догрузим.
      for (const [h, st] of hosts) if (st.failStreak > 0) failed.push(h);
    }
    if (on !== lastAllowed) {
      log.info("зеркало", on ? "разрешено" : "больше не разрешено");
      lastAllowed = on;
      if (!on) {
        // Подписка кончилась — трубы сервер закроет сам; липкость больше не нужна: после новой
        // подписки начинаем с чистого.
        for (const st of hosts.values()) {
          st.stickyUntil = 0;
          st.hold = false;
        }
      }
      save();
    }
    accessChanged();
    if (failed.length) revive(failed, true);
  }

  /* ── Решение маршрута ────────────────────────────────────────────────────── */

  /** Сомнение в зеркале: последний его исход — сбой, свежий, или после него уже сработал прямой. */
  function mirrorDoubtful(s, now) {
    return s.lastMirrorFail > s.lastMirrorOk && (now - s.lastMirrorFail < T.MIRROR_DOUBT || s.lastDirectOk > s.lastMirrorFail);
  }

  /** Сначала зеркало: сервер велел или хост липкий — если зеркало не под сомнением. */
  function firstMirror(s, now) {
    return (forced || (!!s && s.stickyUntil > now)) && !(s && mirrorDoubtful(s, now));
  }

  /** Отказ 7TV напрямую, который считаем сбоем пути (см. шапку). */
  const badStatus = (code) => code === 403 || code === 429 || code >= 500;

  function gqlOk(body) {
    if (typeof body !== "string" || body.length > 12 * 1024) return false;
    try {
      const d = JSON.parse(body);
      if (!d || typeof d !== "object" || Object.keys(d).length !== 1 || typeof d.query !== "string") return false;
      return (body.length <= 2048 && GQL_RE.test(d.query)) || whoOk(d.query);
    } catch (_) {
      return false;
    }
  }

  /** Пачка «кто это у 7TV» в виде, который примет сервер (разбор — как _who_parse: элемент за элементом до «}»). */
  function whoOk(q) {
    if (q.length < 3 || q[0] !== "{" || q[q.length - 1] !== "}") return false;
    const inner = q.slice(0, -1);
    const seen = new Set();
    let pos = 1;
    while (pos < inner.length) {
      WHO_ITEM.lastIndex = pos;
      const m = WHO_ITEM.exec(inner);
      if (!m || m[4] !== WHO_FIELDS || seen.has(m[1]) || seen.size >= 50) return false;
      seen.add(m[1]);
      pos = WHO_ITEM.lastIndex;
    }
    return seen.size > 0;
  }

  /** Пропустит ли сервер (белый список mirror.py). */
  function whitelisted(u, method, body) {
    const p = u.path;
    if (p.includes("..") || p.includes("//") || p.includes("/./") || p.endsWith("/.")) return false;
    if (method === "GET") return !u.search && (GET_OK[u.host] || []).some((re) => re.test(p));
    if (method === "POST") return u.host === "7tv.io" && p === "/v3/gql" && !u.search && gqlOk(body);
    return false;
  }

  function route(url, method, body) {
    const r = { known: false, mirrorable: false, mirrorFirst: false, mirrorUrl: "", auth: "", host: "" };
    const u = parse(url);
    if (!u || !HOSTS[u.host]) return r;
    r.known = true;
    r.host = u.host;
    if (u.protocol !== "https:" || HOSTS[u.host].socket || !whitelisted(u, String(method || "GET").toUpperCase(), body)) return r;
    const now = Date.now();
    if (!allowedAt(now)) return r;
    r.mirrorable = true;
    r.mirrorFirst = firstMirror(hosts.get(u.host), now);
    r.mirrorUrl = base() + "/mirror/h/" + u.host + u.path;
    r.auth = "Bearer " + pass.t;
    return r;
  }

  /** Сети нет вовсе (кабель/Wi-Fi) — сбой прямого пути не про фильтрацию: не считаем. */
  const offline = () => typeof navigator !== "undefined" && navigator.onLine === false;

  /* ── Итоги попыток ──────────────────────────────────────────────────────── */

  function noteDirect(host, ok, fromSocket) {
    if (!HOSTS[host]) return;
    const now = Date.now();
    const s = hs(host);
    const allowed = allowedAt(now);
    let stickyChanged = false;
    let becameSticky = false;
    let doRevive = false;
    if (ok) {
      stats.direct++;
      // Связь снова есть, а до этого подряд были сбои и зеркало тоже не выручало — у
      // вызывающих могли кончиться свои повторы: оживить.
      doRevive = allowed && s.failStreak >= 1 && s.lastMirrorFail > s.lastMirrorOk;
      s.lastDirectOk = now;
      s.failStreak = 0;
      s.failStreakStart = 0;
      s.directFails = [];
      s.okStreak += 1;
      // Два удачных прямых подряд (проба или живой запрос) — прямой путь жив, липкость долой (кроме анти-качелей).
      if (s.hold && s.stickyUntil > now) {
        // держим до срока
      } else if (s.stickyUntil !== 0 && s.okStreak >= 2) {
        s.hold = false;
        s.stickyUntil = 0;
        s.nextProbe = 0;
        stickyChanged = true;
      } else if (s.stickyUntil > now) {
        // Первая удачная проба — подтверждающая через минуту, а не через PROBE_EVERY.
        s.nextProbe = Math.min(s.nextProbe || Infinity, now + T.PROBE_CONFIRM);
      }
    } else {
      if (offline()) return;
      stats.directFail++;
      s.okStreak = 0;
      if (s.failStreak === 0) s.failStreakStart = now;
      s.failStreak += 1;
      s.directFails.push(now);
      s.directFails = s.directFails.filter((t) => now - t <= T.STICKY_WINDOW);
      const need = HOSTS[host].socket ? 1 : STICKY_FAILS;
      if (allowed && s.stickyUntil <= now && s.directFails.length >= need) {
        // Второй раз за сутки — анти-качели: сутки без проб, прямые удачи не снимают.
        s.marks = s.marks.filter((t) => now - t < T.HOLD_WINDOW);
        s.hold = s.marks.length >= 1;
        s.marks.push(now);
        s.stickyUntil = now + (s.hold ? T.HOLD_MS : T.STICKY_MS);
        s.nextProbe = s.hold ? 0 : now + T.PROBE_FIRST;
        stickyChanged = true;
        becameSticky = true;
      }
    }
    if (stickyChanged) {
      log.info(host, becameSticky ? "— прямой путь сбоит, дальше сначала через наш сервер" + (s.hold ? " (второй раз за сутки — на сутки)" : "") : "— прямой путь снова работает");
      save();
      // API 7TV стал липким, а живые обновления ещё не поздоровались — бросаем висящее
      // подключение: новое пойдёт трубой сразу, а не когда истечёт срок соединения.
      if (becameSticky && !HOSTS[host].socket) ev.emit("socket", { what: "unhealthy" });
      // Сокет, живший через зеркало, возвращаем на прямой путь (сообщил сам — он уже на прямом).
      // Он мог уйти в трубу и из-за «сломанного» соседа (API 7TV) — тогда возвращаем, когда
      // липких хостов не осталось вовсе.
      if (!becameSticky && !fromSocket) {
        let anySticky = false;
        for (const st of hosts.values()) if (st.stickyUntil > now) anySticky = true;
        if (HOSTS[host].socket || !anySticky) ev.emit("socket", { what: "mirrored" });
      }
      pageMaybeChanged();
    }
    if (doRevive) revive([host], !fromSocket);
  }

  /** quiet — не оживлять самому (оживит вызывающий, одним разом на несколько хостов). */
  function noteMirror(host, outcome, fromSocket, authUsed, quiet) {
    if (!HOSTS[host]) return;
    const now = Date.now();
    // Отказ пропуску, который уже заменён свежим (запрос ждал в очереди): свежий этим не опорочен.
    if (outcome === "auth" && authUsed && (!pass || authUsed !== "Bearer " + pass.t)) return;
    const s = hs(host);
    let renew = false;
    let doRevive = false;
    switch (outcome) {
      case "ok":
        stats.mirror++;
        doRevive = s.lastMirrorFail > s.lastMirrorOk && s.failStreak >= 1;
        s.lastMirrorOk = now;
        break;
      case "auth":
        stats.auth++;
        // Истёк или подписка кончилась: не ходим в зеркало, пока не придёт свежий (просим его).
        renew = authRejectedUntil <= now;
        authRejectedUntil = now + T.AUTH_BACKOFF;
        s.lastMirrorFail = now;
        break;
      case "transport":
      case "upstream":
        stats.mirrorFail++;
        if (outcome === "upstream") stats.upstream++;
        s.lastMirrorFail = now;
        break;
      default:
        stats.refused++;
        break;
    }
    if (renew) {
      log.info("сервер не принял пропуск зеркала — прошу новый");
      if (!dbg && CPX.plus) CPX.plus.requestMirror();
      onAllowedMaybeChanged(true);
    }
    if (outcome !== "refused") pageMaybeChanged();
    if (doRevive && !quiet) revive([host], !fromSocket);
  }

  /** Картинка 7TV загрузилась на странице. ⚠️Это может быть кэш браузера — маршрут не трогаем
   * (липкость, сомнение, оживление — только пробы и запросы фона). Годится лишь не-подписчику как
   * довод «7TV у человека работает»: сбрасывает счёт сбоев для подсказки. */
  function notePageOk(host) {
    if (!HOSTS[host] || allowedAt(Date.now())) return;
    const s = hosts.get(host);
    if (!s || !s.failStreak) return;
    s.failStreak = 0;
    s.failStreakStart = 0;
    s.directFails = [];
  }

  /** Путь для сокета живых обновлений 7TV. Браузерный WebSocket не умеет заголовок
   * Authorization — пропуск едет подпротоколом "c7p.<пропуск>" (сервер выбирает "c7mirror"). */
  function socketRoute(directUrl) {
    const r = { url: directUrl, protocols: undefined, viaMirror: false, host: "" };
    const u = parse(directUrl);
    if (!u) return r;
    r.host = u.host;
    const now = Date.now();
    let mirror = false;
    const q = u.search.replace(/^\?/, "");
    if (HOSTS[u.host] && HOSTS[u.host].socket && u.path === "/v3" && WS_QUERY_RE.test(q) && allowedAt(now)) {
      const s = hosts.get(u.host);
      mirror = (forced || (!!s && s.stickyUntil > now)) && !(s && s.lastMirrorFail > s.lastMirrorOk && s.lastDirectOk > s.lastMirrorFail);
      // Труба для этого сокета только что не открылась — соседом её не навязываем.
      const doubtful = !!s && mirrorDoubtful(s, now);
      // Сосед по сервису уже «сломан» (API 7TV липкий), а сокет напрямую ни разу не заработал —
      // сразу трубой: под той же фильтрацией шанс напрямую невелик, а каждая проба сокета —
      // полминуты без живых обновлений. Заработает напрямую — проба липкого хоста вернёт.
      if (!mirror && !doubtful && (!s || s.lastDirectOk === 0)) {
        for (const [h, st] of hosts) {
          if (h !== u.host && st.stickyUntil > now) {
            mirror = true;
            break;
          }
        }
      }
      if (mirror) {
        r.url = base().replace(/^http/, "ws") + "/mirror/ws/" + u.host + u.path + u.search;
        r.protocols = ["c7mirror", "c7p." + pass.t];
        r.viaMirror = true;
      }
    }
    // Стенд: прямой путь «сломан» (refuse — сразу ошибка, hang — соединение виснет).
    if (!mirror && block[u.host]) r.url = block[u.host] === "hang" ? "wss://10.255.255.1/" : "wss://blocked.invalid/"; // "403" — как отказ
    return r;
  }

  function noteSocket(host, viaMirror, ok) {
    if (!HOSTS[host]) return;
    if (viaMirror) {
      if (ok) stats.tube++;
      else stats.tubeFail++;
      noteMirror(host, ok ? "ok" : "transport", true);
      // Зеркало для сокета не сработало — следующая попытка напрямую: «какой путь первым
      // заработает, тот и берём».
      if (!ok) {
        hs(host).stickyUntil = 0;
        hs(host).hold = false;
      }
    } else {
      noteDirect(host, ok, true);
    }
  }

  /* ── Состояние для вкладок ───────────────────────────────────────────────── */

  /** Без секретов: разрешено ли, адрес зеркала, «картинки 7TV — сначала зеркалом». */
  function pageState() {
    const now = Date.now();
    const on = allowedAt(now);
    return { on, base: on ? base() : "", first: on && firstMirror(hosts.get("cdn.7tv.app"), now) };
  }

  function pageMaybeChanged() {
    const st = pageState();
    const key = JSON.stringify(st);
    if (key === lastPageKey) return;
    lastPageKey = key;
    ev.emit("page", st);
  }

  /* ── Оживление после возврата связи ─────────────────────────────────────── */

  function revive(list, reconnectSockets) {
    const now = Date.now();
    // Сокет — только если оживал он сам (как клиент): оживление API или картинок рвало бы
    // здоровую трубу, а на боевом сервере ~8% ответов 7TV — ошибки, т.е. до раза в минуту.
    // Просьбу шлём и внутри паузы оживлений: здоровое соединение 33 не тронет, а висящее в паузе
    // повтора без неё ждало бы до полутора минут (API 7TV обычно оживает первым и занимает паузу).
    if (reconnectSockets && list.includes("events.7tv.io")) ev.emit("socket", { what: "reconnect" });
    if (lastRevive && now - lastRevive < T.REVIVE_GAP) return;
    lastRevive = now;
    stats.revive++;
    log.info("догружаю то, что сорвалось (7TV)", list.join(","));
    CPX.safely("mirror:revive", () => {
      // Связь вернулась — паузы после сбоев 7TV (32_emotes) снимаются, сорвавшееся грузится сразу.
      if (CPX.emoteStore) CPX.emoteStore.revive();
    });
    ev.emit("revive", { hosts: list.slice() });
  }

  /* ── Пробы, ожидание, подсказка ──────────────────────────────────────────── */

  async function probeHttp(url) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), T.PROBE_TIMEOUT);
    try {
      // Ответ сервиса (и 404) — связь есть; 403, 429, 5xx — нет (badStatus). Тело читаем целиком: фильтрация,
      // которая пропускает заголовки и глушит данные, иначе давала бы «качели» прямой ↔ зеркало.
      const res = await fetch(url, { cache: "no-store", credentials: "omit", signal: ctl.signal });
      await res.arrayBuffer();
      return !badStatus(res.status);
    } catch (_) {
      return false;
    } finally {
      clearTimeout(t);
    }
  }

  function probeSocket(url) {
    // 🔴Ждём первого слова 7TV (hello), а не одного соединения: у фильтрации, что пускает
    // соединение и глушит данные, проба проходила бы, и сокет ходил бы по кругу (клиент 26.09).
    return new Promise((resolve) => {
      let ws = null;
      let done = false;
      const finish = (ok) => {
        if (done) return;
        done = true;
        clearTimeout(t);
        try {
          if (ws) ws.close();
        } catch (_) {
          /* уже */
        }
        resolve(ok);
      };
      const t = setTimeout(() => finish(false), T.PROBE_TIMEOUT);
      try {
        ws = new WebSocket(url);
      } catch (_) {
        return finish(false);
      }
      ws.onmessage = () => finish(true);
      ws.onerror = () => finish(false);
      ws.onclose = () => finish(false);
    });
  }

  async function probe(host) {
    const s = hs(host);
    if (s.probing || !HOSTS[host]) return;
    s.probing = true;
    try {
      let ok;
      if (block[host]) {
        await CPX.sleep(block[host] === "hang" ? T.PROBE_TIMEOUT : 300);
        ok = false;
      } else {
        ok = HOSTS[host].socket ? await probeSocket(HOSTS[host].probe) : await probeHttp(HOSTS[host].probe);
      }
      stats.probes++;
      log.debug("проба", host, ok ? "прямой путь жив" : "прямой путь не работает");
      // Итог сообщаем сами: пробы мимо маршрутизатора (иначе липкость держалась бы час).
      noteDirect(host, ok);
    } finally {
      s.probing = false;
    }
  }

  /** Сводка сервера: до каких сервисов он сейчас достаёт. → {7tv: bool, …} | null. */
  async function mirrorStatus(timeout) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeout || T.PROBE_TIMEOUT);
    try {
      stats.status++;
      const res = await fetch(base() + "/mirror/status", { cache: "no-store", credentials: "omit", signal: ctl.signal });
      const d = await res.json();
      return d && d.ok && typeof d.ok === "object" ? d.ok : null;
    } catch (e) {
      error("status", e && e.message);
      return null;
    } finally {
      clearTimeout(t);
    }
  }

  async function checkMirrorStatus() {
    if (statusBusy) return;
    statusBusy = true;
    try {
      const ok = await mirrorStatus();
      if (!ok || ok["7tv"] !== true) return;
      const back = [];
      for (const [h, st] of hosts) if (st.failStreak > 0 && st.lastMirrorFail > st.lastMirrorOk) back.push(h);
      for (const h of back) {
        log.info(h, "— наш сервер снова достаёт");
        noteMirror(h, "ok", false, "", true);
      }
      // Одним оживлением на все вернувшиеся хосты: по одному второй и третий попадали бы в паузу
      // оживлений (и сокет живых обновлений ждал бы своего повтора).
      if (back.length) revive(back, true);
    } finally {
      statusBusy = false;
    }
  }

  /** Какой текст подсказки: "sub" — знаем, что подписки нет; "login" — человек не вошёл в
   * Chatterino+ (статуса нет: может быть и подписчиком); "" — вошёл, а статус ещё не пришёл. */
  function hintKind() {
    if (dbg) return dbg.plus ? "" : dbg.loggedIn === false ? "login" : "sub";
    const p = CPX.plus ? CPX.plus.self : null;
    if (!p || !p.loggedIn) return "login";
    return p.known && !p.active ? "sub" : "";
  }

  /** Подсказка, которую решили показать и ещё не показали (null — нет или устарела: человек
   * стал подписчиком, 7TV снова работает, прошли сутки). */
  function pendingHint() {
    if (!hintPending) return null;
    const now = Date.now();
    let failing = false;
    for (const [h, st] of hosts) if (HINT_HOSTS.has(h) && st.failStreak > 0) failing = true;
    if (allowedAt(now) || plusActive || !failing || now - hintPending.at > T.HINT_GAP || !hintKind() || hintOff()) {
      hintPending = null;
      save();
      return null;
    }
    return hintPending;
  }

  /** Подсказку показали (тост во вкладке или отметка в popup) — следующая не раньше чем через сутки. */
  function hintShown() {
    if (!pendingHint()) return false;
    hintAt = Date.now();
    hintSvc = hintPending.svc;
    hintPending = null;
    save();
    log.info("подсказку про PLUS показали");
    return true;
  }

  async function maybeHint() {
    const now = Date.now();
    if (allowedAt(now) || plusActive || now - hintAt < T.HINT_GAP || now < hintCheckAt || hintOff()) {
      if (hintPending && hintOff()) pendingHint(); // нажали крестик — ждущую снять
      return;
    }
    if (hintPending) {
      pendingHint(); // ждёт показа — новую не заводим, устаревшую снимаем
      return;
    }
    let svc = "";
    for (const [h, st] of hosts) {
      if (!HINT_HOSTS.has(h)) continue;
      if (st.failStreak >= HINT_MIN_FAILS && st.failStreakStart && now - st.failStreakStart >= T.HINT_AFTER && st.lastDirectOk < st.failStreakStart) {
        svc = "7tv";
        break;
      }
    }
    if (!svc) return;
    // Спрашиваем сервер не чаще раза в 10 минут; без согласия и без входа на Twitch — молчим.
    hintCheckAt = now + T.HINT_CHECK_GAP;
    if (!CPX.settings.get("general.consent") || !currentLogin()) return;
    const kind = hintKind();
    if (!kind) return;
    // Обещать «станет доступен» можно, только если НАШ сервер до 7TV сейчас достаёт: он сам в
    // Москве за той же фильтрацией.
    const ok = await mirrorStatus(15000);
    if (!ok || ok[svc] !== true || plusActive || hintKind() !== kind) return;
    hintPending = { svc, kind, at: Date.now() };
    save();
    log.info("подсказка про PLUS —", svc, kind);
    ev.emit("hint", Object.assign({}, hintPending));
  }

  function tick() {
    refresh();
    const now = Date.now();
    const due = [];
    let askStatus = false;
    for (const [h, st] of hosts) {
      if (st.stickyUntil === 0) continue;
      if (st.stickyUntil <= now) {
        // Срок прошёл — снова сначала напрямую.
        st.stickyUntil = 0;
        st.hold = false;
        pageMaybeChanged();
        continue;
      }
      if (st.nextProbe && st.nextProbe <= now) {
        st.nextProbe = now + T.PROBE_EVERY;
        due.push(h);
      }
    }
    // Не работали ОБА пути — ждём сами, какой оживёт первым: иначе редкие запросы (наборы
    // смайликов — при заходе на канал) после долгого общего сбоя так и не догрузились бы.
    const allowed = allowedAt(now);
    for (const [h, st] of hosts) {
      const down = allowed && st.failStreak > 0 && st.lastMirrorFail > st.lastMirrorOk;
      if (!down) {
        st.downCheck = 0;
        continue;
      }
      if (!st.downCheck) {
        st.downGap = T.DOWN_PROBE;
        st.downCheck = now + st.downGap;
        continue;
      }
      if (st.downCheck <= now) {
        st.downGap = Math.min(st.downGap * 2, T.DOWN_PROBE_MAX);
        st.downCheck = now + st.downGap;
        if (!due.includes(h)) due.push(h);
        askStatus = true;
      }
    }
    for (const h of due) probe(h);
    if (askStatus) checkMirrorStatus();
    maybeHint().catch((e) => CPX.report("mirror:hint", e));
  }

  function startTick() {
    clearInterval(tickT);
    tickT = setInterval(CPX.guard("mirror:tick", tick), T.TICK);
  }

  /* ── Память между пробуждениями фона ─────────────────────────────────────── */

  const loaded = chrome.storage.local
    .get(STORE_KEY)
    .then((r) => {
      const o = (r && r[STORE_KEY]) || {};
      const now = Date.now();
      const sticky = o.sticky && typeof o.sticky === "object" ? o.sticky : {};
      const held = o.hold && typeof o.hold === "object" ? o.hold : {};
      const marks = o.marks && typeof o.marks === "object" ? o.marks : {};
      for (const h in marks) {
        if (HOSTS[h] && Array.isArray(marks[h])) hs(h).marks = marks[h].map(Number).filter((t) => t > now - NORMAL.HOLD_WINDOW && t <= now).slice(-4);
      }
      for (const h in sticky) {
        const until = Number(sticky[h]) || 0;
        const hold = held[h] === true;
        if (HOSTS[h] && until > now && until <= now + (hold ? NORMAL.HOLD_MS : NORMAL.STICKY_MS)) {
          const s = hs(h);
          s.stickyUntil = until;
          s.hold = hold;
          s.nextProbe = hold ? 0 : now + T.PROBE_FIRST;
        }
      }
      hintAt = Number(o.hintAt) || 0;
      hintSvc = typeof o.hintSvc === "string" ? o.hintSvc.slice(0, 16) : "";
      // Решённая, но не показанная подсказка (hintPending) не хранится: подсказка бывает только
      // с согласием, а с ним фон держит живым сокет нашего сервера (пульс 12 с). Уснул всё же —
      // сбои 7TV накопятся заново, и решение примется снова.
    })
    .catch(() => {});

  const save = CPX.debounce(() => {
    const now = Date.now();
    const sticky = {};
    const hold = {};
    const marks = {};
    for (const [h, st] of hosts) {
      if (st.stickyUntil > now) sticky[h] = st.stickyUntil;
      if (st.stickyUntil > now && st.hold) hold[h] = true;
      const m = st.marks.filter((t) => now - t < T.HOLD_WINDOW);
      if (m.length) marks[h] = m;
    }
    chrome.storage.local.set({ [STORE_KEY]: { sticky, hold, marks, hintAt, hintSvc } }).catch(() => {});
  }, 2000);

  /* ── Подключение ─────────────────────────────────────────────────────────── */

  CPX.boot.add(
    "mirror",
    async () => {
      await loaded;
      if (CPX.plus && CPX.plus.loaded) await CPX.plus.loaded.catch(() => {});
      refresh();
      pageMaybeChanged();
      startTick();
    },
    46
  );

  // Статус и пропуск меняются: ответ на hello, кадры plus_self, смена аккаунта на twitch.tv,
  // смена двери сокета (адрес зеркала). Кадры сокета CPX.plus разбирает раньше нас (подписан первым).
  if (CPX.plus) CPX.plus.on("changed", () => refresh());
  if (CPX.auth) CPX.auth.on("changed", () => refresh());
  CPX.ws.on("hello", () => setTimeout(refresh, 0));
  CPX.ws.on("plus_self", () => setTimeout(refresh, 0));
  CPX.ws.on("state", () => accessChanged());
  CPX.settings.on((applied) => {
    if ("dev.mirrorBase" in applied) accessChanged();
  });

  CPX.diag.add("mirror", () => {
    const now = Date.now();
    const ago = (t) => (t ? Math.round((now - t) / 1000) : null);
    const out = {
      allowed: allowedAt(now),
      plus: plusActive,
      forced,
      pass: pass ? { exp: pass.exp, leftMin: Math.round((pass.exp * 1000 - now - CPX.clock.offset()) / 60000) } : null,
      base: base(),
      authBackoffSec: Math.max(0, Math.round((authRejectedUntil - now) / 1000)),
      hosts: {},
      stats: Object.assign({}, stats),
      errors: errors.slice(-10),
      hint: { at: hintAt, svc: hintSvc, pending: hintPending ? Object.assign({}, hintPending) : null },
      page: pageState(),
      fast: T === FAST,
    };
    for (const [h, st] of hosts) {
      out.hosts[h] = {
        mode: st.stickyUntil > now || forced ? (mirrorDoubtful(st, now) ? "сначала зеркало, но зеркало под сомнением" : "сначала зеркало") : "напрямую",
        hold: st.hold && st.stickyUntil > now,
        stickyTimes24h: st.marks.filter((t) => now - t < T.HOLD_WINDOW).length,
        stickyLeftSec: st.stickyUntil > now ? Math.round((st.stickyUntil - now) / 1000) : 0,
        failStreak: st.failStreak,
        directOkAgo: ago(st.lastDirectOk),
        mirrorOkAgo: ago(st.lastMirrorOk),
        mirrorFailAgo: ago(st.lastMirrorFail),
        nextProbeSec: st.nextProbe && st.stickyUntil > now ? Math.round((st.nextProbe - now) / 1000) : null,
      };
    }
    if (CPX.dev) out.block = Object.assign({}, block);
    return out;
  });

  return {
    HOSTS,
    loaded,
    stats,
    error,
    on: (name, fn) => ev.on(name, fn),
    allowed: () => allowedAt(Date.now()),
    base,
    route,
    badStatus,
    noteDirect,
    noteMirror,
    notePageOk,
    socketRoute,
    noteSocket,
    pageState,
    hint: () => ({ at: hintAt, svc: hintSvc }),
    hintPending: () => {
      const h = pendingHint();
      return h ? Object.assign({}, h) : null;
    },
    hintShown,
    gap: () => T.HINT_GAP,
    testBlock: (host) => block[host] || "",
    /** Пропуск для правила DNR (только фон, только 54_mirror_page). */
    _passForRule: () => (allowedAt(Date.now()) && pass ? pass.t : ""),
    /** Стенд (dev): подставной статус { plus, pass: {t, exp}, login, loggedIn } | null — вместо CPX.plus/auth
     * (loggedIn:false — «не вошёл в Chatterino+»: другой текст подсказки). */
    _debugState: CPX.dev
      ? (s) => {
          dbg = s && typeof s === "object" ? { plus: !!s.plus, pass: s.pass || null, login: String(s.login || ""), loggedIn: s.loggedIn !== false } : null;
          refresh();
          return pageState();
        }
      : undefined,
    /** Стенд (dev): ускоренные сроки (как C7_MIRROR_FAST клиента). */
    _debugFast: CPX.dev
      ? (on) => {
          T = on ? FAST : NORMAL;
          startTick();
          return T === FAST;
        }
      : undefined,
    /** Стенд (dev): «сломать» прямой путь к хостам {хост: "refuse"|"hang"|"403"} ({} — починить; "403" — 7TV
     *  отвечает напрямую 403, как Cloudflare). */
    _debugBlock: CPX.dev
      ? (map) => {
          block = Object.create(null);
          for (const h in map || {}) if (HOSTS[h]) block[h] = map[h] === "hang" || map[h] === "403" ? map[h] : "refuse";
          ev.emit("block", Object.assign({}, block));
          return Object.assign({}, block);
        }
      : undefined,
    /** Стенд (dev): забыть всё (липкость, сбои, подсказку). */
    _debugReset: CPX.dev
      ? () => {
          hosts.clear();
          hintAt = 0;
          hintPending = null;
          hintCheckAt = 0;
          lastRevive = 0;
          save();
          pageMaybeChanged();
        }
      : undefined,
  };
})();

// Стенд (dev): «сломать» прямой путь сообщением со страницы расширения — в Firefox фон из рамки окна настроек поверх
// Twitch не виден (getBackgroundPage там нет), а проверять зеркало надо на тестовом профиле со входом.
if (CPX.dev) CPX.router.handle("dev.mirrorBlock", (p) => CPX.mirror._debugBlock((p && p.block) || {}), { page: true });
// Стенд (dev): забыть липкость и сбои путей (иначе прошлые прогоны на тестовом профиле решают «сначала зеркало» заранее).
if (CPX.dev) CPX.router.handle("dev.mirrorReset", () => (CPX.mirror._debugReset(), true), { page: true });

// ── src/bg/52_mirror_fetch.js ──
/* Фон: запросы к 7TV «напрямую → через зеркало» — транспорт для CPX.net (этап 5).
 *
 * Перенос NetworkTask клиента (src/common/network/NetworkTask.cpp):
 *  • путь запроса решает CPX.mirror.route(): не разрешено / не из белого списка сервера — одна
 *    прямая попытка, как было (только итог «связь есть/нет» идёт маршрутизатору — для подсказки
 *    не-подписчику и проб); разрешено — две попытки: [прямо, зеркало] или, у «липкого» хоста,
 *    [зеркало, прямо];
 *  • сторож тишины прямой попытки — DIRECT_STALL_MS без ответа (DPI часто глушит уже соединение,
 *    и срок запроса иначе тянулся бы до конца); тело — тоже под сторожем: «замёрзшее» после первых
 *    килобайт скачивание — сбой пути, а не долгий ответ;
 *  • зеркало — с пропуском в Authorization (ставим сами: правила DNR запросы фона не трогают,
 *    research/02 §5.2 п.13–14), без переадресаций (пропуск не должен уехать никуда, кроме нашего
 *    сервера). Ответ зеркала ВСЕГДА 200: настоящий код — X-Mirror-Status, причина нашего отказа —
 *    X-Mirror-Error (auth|host|path|limit|upstream|size|bad), старая копия — X-Mirror-Stale;
 *  • ⚠️прослойка хостера (webcore) перед ws.chat.eblo.id роняет пачки запросов ответами 500/502 —
 *    не больше MAX_IN_FLIGHT запросов к зеркалу одновременно (остальные ждут очереди), и один тихий
 *    повтор на 5xx БЕЗ X-Mirror-Status (зеркало сломанным не считаем);
 *  • маршрут перепроверяется В МОМЕНТ СТАРТА попытки: в очереди запрос мог простоять, пока сменились
 *    адрес сервера, пропуск или порядок путей;
 *  • ⚠️прямой ответ 403, 429, 5xx у запроса, который берёт зеркало, — не ответ (CPX.mirror.badStatus; задание
 *    mirrorwatch 23.10): идём в зеркало; не выручило — отдаём этот прямой ответ. Сбоем прямого пути (noteDirect) он
 *    становится, только если зеркало ответило нормально и не старой копией — иначе это сбой самого 7TV, не пути.
 *    404 и 304 — ответы. Не-подписчику — всё как было;
 *  • сервис ответил ошибкой через зеркало — это ЕГО ответ (404 — «нет», 500 — «позже»): отдаём как
 *    ответ сервиса; limit — как 429 (у вызывающих свои паузы); upstream (зеркало до 7TV не достало) — как 502 с его
 *    Retry-After (правило 3 «Поток запросов», 18.11: Retry-After сервера — нижняя граница паузы вызывающего).
 *
 * Вызывающему (CPX.net.fetchJSON) отдаём готовый Response с настоящим кодом сервиса и уже
 * прочитанным телом; сбой обоих путей — исключение (у вызывающих свои повторы).
 * ⚠️Сигнал отмены вызывающего не используем: срок каждой попытки считаем сами (иначе общий срок
 * 15 с обрывал бы попытку через зеркало, начатую после 10 с ожидания прямого пути).
 */

(() => {
  const M = CPX.mirror;
  const log = CPX.log("mirror-net");

  const DIRECT_STALL_MS = 10000;
  // Зеркалу — с запасом: впервые оно само качает у 7TV (список крупного канала — 2,3 МБ).
  const MIRROR_STALL_MS = 30000;
  const MIRROR_MIN_TIMEOUT_MS = 25000;
  const MAX_IN_FLIGHT = 4;
  const EDGE_RETRY_MS = 600;
  const MAX_BODY = 16 * 1024 * 1024;
  const NULL_BODY = new Set([101, 204, 205, 304]);

  /* ── Очередь к зеркалу (общая для всех запросов фона) ──────────────────── */

  let inFlight = 0;
  const waiting = [];
  function acquire() {
    if (inFlight < MAX_IN_FLIGHT) {
      inFlight++;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      waiting.push(resolve);
      if (waiting.length > M.stats.queueMax) M.stats.queueMax = waiting.length;
    });
  }
  function release() {
    // Место переходит прямо ждущему — новые запросы его не перехватят.
    const next = waiting.shift();
    if (next) next();
    else inFlight = Math.max(0, inFlight - 1);
  }

  /* ── Сеть со сторожами ──────────────────────────────────────────────────── */

  const fail = (text) => Object.assign(new Error(text), { cpxTransport: true });
  const DIRECT_CAP = 90000; // прямой путь: весь ответ не дольше (срок застоя — свой)

  /** Заголовки ответа — не дольше stallMs (и не позже deadline). */
  async function fetchHead(url, init, stallMs, deadline) {
    const ctl = new AbortController();
    const wait = Math.max(0, Math.min(stallMs, deadline - Date.now()));
    let why = "";
    const t = setTimeout(() => {
      why = wait < stallMs ? "срок вышел" : "тишина " + Math.round(stallMs / 1000) + " с";
      ctl.abort();
    }, wait);
    try {
      const res = await fetch(url, Object.assign({}, init, { signal: ctl.signal }));
      return { res, ctl };
    } catch (e) {
      throw fail(why || (e && e.message) || "сеть");
    } finally {
      clearTimeout(t);
    }
  }

  /** Тело целиком: между кусками — не дольше stallMs, всё — до deadline. */
  function readBody(res, stallMs, deadline, ctl) {
    if (!res.body || NULL_BODY.has(res.status)) return Promise.resolve(null);
    return new Promise((resolve, reject) => {
      const reader = res.body.getReader();
      const parts = [];
      let size = 0;
      let t = 0;
      let over = false;
      const stop = (text) => {
        if (over) return;
        over = true;
        clearTimeout(t);
        reader.cancel().catch(() => {});
        ctl.abort();
        reject(fail(text));
      };
      const arm = () => {
        clearTimeout(t);
        const left = deadline - Date.now();
        t = setTimeout(() => stop(left <= stallMs ? "срок вышел (тело)" : "тишина (тело)"), Math.max(0, Math.min(stallMs, left)));
      };
      const pump = () =>
        reader.read().then(
          ({ done, value }) => {
            if (over) return;
            if (done) {
              over = true;
              clearTimeout(t);
              const out = new Uint8Array(size);
              let at = 0;
              for (const p of parts) {
                out.set(p, at);
                at += p.length;
              }
              resolve(out);
              return;
            }
            parts.push(value);
            size += value.length;
            if (size > MAX_BODY) return stop("слишком большой ответ");
            arm();
            pump();
          },
          (e) => stop((e && e.message) || "обрыв")
        );
      arm();
      pump();
    });
  }

  /* ── Попытки ────────────────────────────────────────────────────────────── */

  async function direct(url, init, timeout, stall, host) {
    // Срок timeout — на застой (до заголовков и между кусками), весь ответ — до DIRECT_CAP: раньше
    // потолком был тот же timeout, и медленная, но живая загрузка (~100 кбит/с, набор 7TV крупного
    // канала ~250 КБ) обрывалась на 20-й секунде навсегда (ревью 01.10).
    // Есть зеркало (stall задан) — прежний срок попытки: медленный прямой путь должен быстро уводить
    // хост на зеркало (проверка 01.10). Запасного пути нет — до DIRECT_CAP.
    const deadline = Date.now() + (stall ? timeout : Math.max(timeout * 2, DIRECT_CAP));
    const b = M.testBlock(host);
    if (b === "403") {
      await CPX.sleep(50);
      return new Response(null, { status: 403, statusText: "Forbidden" });
    }
    if (b) {
      // Стенд: прямой путь «сломан» (как C7_NET_BLOCK клиента).
      await CPX.sleep(b === "hang" ? Math.min(stall || timeout, timeout) : 50);
      throw fail("стенд: прямой путь закрыт (" + b + ")");
    }
    const { res, ctl } = await fetchHead(url, init, stall || timeout, deadline);
    const body = await readBody(res, stall || timeout, deadline, ctl);
    return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
  }

  /** Одна попытка через зеркало. → { res } | { error, notAllowed?, limit? }. */
  async function viaMirror(url, init, timeout, host) {
    let edgeRetried = false;
    for (;;) {
      await acquire();
      let r;
      let res = null;
      let body = null;
      let err = "";
      try {
        r = M.route(url, init.method, init.body);
        if (!r.mirrorable) return { error: fail("зеркало сейчас не разрешено"), notAllowed: true };
        const headers = Object.assign({}, init.headers || {}, { Authorization: r.auth });
        const deadline = Date.now() + Math.max(timeout, MIRROR_MIN_TIMEOUT_MS);
        const h = await fetchHead(
          r.mirrorUrl,
          { method: init.method || "GET", headers, body: init.body, redirect: "manual", cache: "no-store", credentials: "omit" },
          MIRROR_STALL_MS,
          deadline
        );
        res = h.res;
        body = await readBody(res, MIRROR_STALL_MS, deadline, h.ctl);
      } catch (e) {
        err = (e && e.message) || "сеть";
      } finally {
        release();
      }
      const xs = res ? res.headers.get("X-Mirror-Status") : null;
      const xe = res ? res.headers.get("X-Mirror-Error") || "" : "";
      if (!xs) {
        // До зеркала не дошли / ответ не его. 5xx от прослойки (у ответов зеркала всегда есть
        // X-Mirror-Status): до сервера дошли, сорвалось по дороге — один тихий повтор.
        if (res && res.status >= 500 && !edgeRetried) {
          edgeRetried = true;
          M.stats.edgeRetry++;
          log.debug("прослойка", res.status, "— повтор", host);
          await CPX.sleep(EDGE_RETRY_MS + Math.random() * 400);
          continue;
        }
        const text = err || (res ? "ответ не от зеркала: " + (res.type === "opaqueredirect" ? "переадресация" : res.status) : "сеть");
        M.error("зеркало " + host, text);
        M.noteMirror(host, "transport", false, r && r.auth);
        return { error: fail(text) };
      }
      const outcome = xe === "auth" ? "auth" : xe === "upstream" ? "upstream" : xe ? "refused" : "ok";
      M.noteMirror(host, outcome, false, r.auth);
      if (outcome !== "ok") {
        M.error("зеркало " + host, "отказ: " + xe + " " + xs);
        const ra = res.headers.get("Retry-After");
        const raH = ra && /^\d{1,5}$/.test(ra) ? { "Retry-After": ra } : {};
        if (xe === "limit") return { error: fail("зеркало: предел"), limit: new Response(null, { status: 429, headers: raH }) };
        if (xe === "upstream") return { error: fail("зеркало не выручило: upstream"), upstream: new Response(null, { status: 502, headers: raH }) };
        return { error: fail("зеркало не выручило: " + xe) };
      }
      const stale = res.headers.get("X-Mirror-Stale") === "1";
      if (stale) M.stats.stale++;
      const code = parseInt(xs, 10);
      const status = code >= 200 && code <= 599 ? code : 502;
      const ctype = res.headers.get("Content-Type");
      return { res: new Response(NULL_BODY.has(status) ? null : body, { status, headers: ctype ? { "Content-Type": ctype } : {} }), stale };
    }
  }

  /** Прямой отказ 7TV, а зеркало сказало «до 7TV не достал, приходи через N с» — отдать отказ с этим сроком. */
  async function withRetryAfter(res, up) {
    const ra = up && up.headers.get("Retry-After");
    if (!ra || res.headers.get("Retry-After")) return res;
    const h = new Headers(res.headers);
    h.set("Retry-After", ra);
    return new Response(NULL_BODY.has(res.status) ? null : await res.arrayBuffer(), { status: res.status, statusText: res.statusText, headers: h });
  }

  /** Транспорт CPX.net: url — адрес сервиса, init — как у fetch, opts.timeout — срок попытки. */
  async function transport(url, init, opts) {
    await M.loaded;
    const req = Object.assign({}, init);
    delete req.signal;
    const method = String(req.method || "GET").toUpperCase();
    req.method = method;
    const timeout = Math.max(1000, (opts && opts.timeout) || 15000);
    const first = M.route(url, method, req.body);
    if (!first.known) return fetch(url, init);
    const host = first.host;
    const plan = first.mirrorable ? (first.mirrorFirst ? ["m", "d"] : ["d", "m"]) : ["d"];
    let last = null;
    let limited = null;
    let upstream = null; // зеркало до 7TV не достало — его ответ с Retry-After (если других ответов нет)
    let refusedRes = null; // прямой отказ 7TV — отдать, если зеркало не выручит
    for (let i = 0; i < plan.length; i++) {
      if (i > 0) log.debug(plan[i] === "m" ? "→ зеркало" : "→ напрямую", host, new URL(url).pathname.slice(0, 80));
      if (plan[i] === "d") {
        try {
          const res = await direct(url, req, timeout, first.mirrorable ? DIRECT_STALL_MS : 0, host);
          if (M.badStatus(res.status)) {
            M.error("напрямую " + host, "ответ " + res.status);
            if (first.mirrorable) {
              // Отказ 7TV напрямую — не ответ (см. шапку): дальше по плану; сбой пути — когда скажет зеркало.
              refusedRes = res;
              continue;
            }
            // Зеркала у запроса нет. Не-подписчику — сбой (для подсказки про PLUS: её покажут, только если наш сервер
            // до 7TV достаёт, — сбой самого 7TV её не вызовет). Подписчику (запрос мимо белого списка) — ни удача, ни
            // сбой: раньше такой отказ снимал липкость как удача — те же качели.
            if (!M.allowed()) M.noteDirect(host, false);
            return res;
          }
          // Ответ сервиса (и 404) — связь есть.
          M.noteDirect(host, true);
          return res;
        } catch (e) {
          last = e;
          M.noteDirect(host, false);
          M.error("напрямую " + host, e && e.message);
        }
      } else {
        const r = await viaMirror(url, req, timeout, host);
        // Напрямую был отказ, а зеркало ответило нормально и свежим — значит, режут путь (не лежит 7TV).
        if (refusedRes && r.res && !r.stale && !M.badStatus(r.res.status)) M.noteDirect(host, false);
        if (r.res) return r.res;
        last = r.error;
        if (r.limit) limited = r.limit;
        if (r.upstream) upstream = r.upstream;
      }
    }
    if (refusedRes) return withRetryAfter(refusedRes, upstream);
    if (limited) return limited;
    if (upstream) return upstream;
    throw last || fail("сеть");
  }

  CPX.net.setTransport(transport);

  CPX.diag.add("mirrorNet", () => ({ inFlight, waiting: waiting.length }));
})();

// ── src/bg/54_mirror_page.js ──
/* Фон: зеркало 7TV и вкладки Twitch — пропуск в картинках (DNR), состояние, отчёты, подсказка.
 *
 * Пропуск в картинках. Тег <img> и CSS-фон заголовков не шлют, а секрет в мир страницы отдавать
 * нельзя. Поэтому фон ставит СЕССИОННОЕ правило declarativeNetRequest: к запросам КАРТИНОК со
 * страниц twitch.tv (initiatorDomains) на /mirror/h/ наших адресов браузер сам добавляет
 * «Authorization: Bearer <пропуск>» (research/02 §1.8, §5.2 п.13 — проверено опытом). Пропуск
 * в правиле меняется вместе с пропуском; зеркало не разрешено — правила нет вовсе. Запросы самого
 * фона правила не трогают — там заголовок ставит 52_mirror_fetch.
 * Цена решения (оценка research/02): любой скрипт на twitch.tv сможет грузить КАРТИНКИ 7TV через
 * наше зеркало «от имени» подписчика — но только на twitch.tv и не видя пропуска.
 *
 * Методы:
 *   mirror.page [page]  → { on, base, first, tabs } — без секретов (см. CPX.mirror.pageState);
 *                       tabs — сколько вкладок с чатом Twitch: у каждой своя очередь картинок, а
 *                       к нашему серверу они идут одним соединением — вкладки делят предел 4
 *   mirror.note [page]  { ok: {d, m}, bad: [{k:"d"|"m", u: адрес cdn.7tv.app, n: сколько упало}] } — итоги картинок
 *                       7TV со страницы. ⚠️Удача <img> может быть из кэша браузера — маршрут по
 *                       ней не меняем, она лишь сбрасывает счёт сбоев для подсказки не-подписчику
 *                       (CPX.mirror.notePageOk). Неудачу <img> НЕ отличает «смайлика нет (404)» от
 *                       «связь режут» — такие случаи фон перепроверяет своим запросом (он видит
 *                       код и идёт мимо кэша) и только тогда засчитывает сбой.
 *   mirror.hintClaim [page] → { svc, text, url } | null — подсказка не-подписчику, если она ждёт
 *                       показа (вкладка спрашивает, когда её видно); одной вкладке за раз
 *   mirror.hintShown [page] — вкладка показала тост: следующая подсказка — через сутки
 *   mirror.hint [ext]   → { svc, kind, at, pending, fresh, text, subscribeUrl } — для отметки в popup
 *                       (pending — ждёт показа, ни одна вкладка её не показала)
 *   mirror.hintSeen [ext] — popup показал отметку: то же, что hintShown
 * События вкладкам: "mirror.page" (состояние), "mirror.revive" (связь вернулась — догрузить
 * упавшие картинки), "mirror.hint" { svc, text, url } — ОДНОЙ вкладке (активной).
 */

(() => {
  const M = CPX.mirror;
  const log = CPX.log("mirror-page");
  const DNR = chrome.declarativeNetRequest;
  const OUR_BASES = ["https://ws.chat.eblo.id", "https://ws.rish098.xyz"];
  const AUTH_IDS = [7501, 7502, 7503];
  const BLOCK_IDS = [7511, 7512, 7513];
  const CDN = "cdn.7tv.app";
  const CDN_PATH = /^\/(?:emote|badge|paint|user)\/[0-9A-Za-z._/-]{1,200}$/;
  // Перепроверка — не чаще раза в 3 с на вид: двух подтверждённых сбоев хватает для «липкости»,
  // и пачка упавших картинок переходит на зеркало за секунды (у клиента — два сбоя подряд).
  const VERIFY_GAP_MS = 3000;
  const VERIFY_STALL_MS = 10000;
  const NOTE_MIN_GAP_MS = 400;
  // Firefox относит картинки из srcset (<img srcset>, image-set()) к ОТДЕЛЬНОМУ типу "imageset" —
  // правило только для "image" их не касалось: смайлики, бейджи и меню смайликов 7TV через зеркало
  // не грузились (сервер без пропуска отказывал). Chrome этого типа не знает и отвергает всё правило.
  const IMG_TYPES = chrome.runtime.getURL("").startsWith("moz-extension:") ? ["image", "imageset"] : ["image"];

  /* ── Правила DNR ────────────────────────────────────────────────────────── */

  let dnrChain = Promise.resolve();
  function dnr(update) {
    if (!DNR || !DNR.updateSessionRules) return Promise.resolve();
    dnrChain = dnrChain.then(() => DNR.updateSessionRules(update)).catch((e) => {
      M.error("dnr", e && e.message);
      CPX.report("mirror:dnr", e);
    });
    return dnrChain;
  }

  // Страницы, картинкам которых правило ставит пропуск: twitch.tv и сайты, которые человек включил (bg/15_sites.js).
  const pages = () => ["twitch.tv"].concat(CPX.sites.on("kick") ? ["kick.com"] : []);

  function applyAuth() {
    const t = M._passForRule();
    const bases = OUR_BASES.slice();
    const cur = M.base();
    if (!bases.includes(cur)) bases.push(cur); // dev: локальная заглушка (только 127.0.0.1/localhost)
    const addRules = t
      ? bases.slice(0, AUTH_IDS.length).map((b, i) => ({
          id: AUTH_IDS[i],
          priority: 1,
          action: { type: "modifyHeaders", requestHeaders: [{ header: "Authorization", operation: "set", value: "Bearer " + t }] },
          condition: { urlFilter: "|" + b + "/mirror/h/", resourceTypes: IMG_TYPES, requestMethods: ["get"], initiatorDomains: pages() },
        }))
      : [];
    return dnr({ removeRuleIds: AUTH_IDS, addRules });
  }

  // Стенд (dev): «7TV заблокирован» для запросов страниц twitch.tv (картинки).
  function applyBlock(map) {
    if (!CPX.dev) return;
    const addRules = Object.keys(map || {})
      .slice(0, BLOCK_IDS.length)
      .map((h, i) => ({
        id: BLOCK_IDS[i],
        priority: 2,
        action: { type: "block" },
        condition: { requestDomains: [h], initiatorDomains: ["twitch.tv"], resourceTypes: IMG_TYPES.concat(["xmlhttprequest", "websocket"]) },
      }));
    dnr({ removeRuleIds: BLOCK_IDS, addRules });
  }

  M.on("access", applyAuth);
  CPX.sites.ev.on("change", () => applyAuth());
  M.on("block", applyBlock);

  /* ── Состояние и события вкладкам ───────────────────────────────────────── */

  /** Сколько вкладок (рамок) с открытым чатом: у каждой своя очередь картинок зеркала. */
  function chatTabs() {
    let n = 0;
    for (const t of CPX.router.tabs) if (t.channels && t.channels.size) n++;
    for (const t of CPX.router.siteTabs) if (t.channels && t.channels.size) n++;
    return Math.max(1, Math.min(16, n));
  }

  const pageInfo = () => Object.assign(M.pageState(), { tabs: chatTabs() });

  let lastTabs = 0;
  M.on("page", () => {
    lastTabs = chatTabs();
    CPX.router.broadcast("mirror.page", pageInfo());
  });
  // Вкладок с чатом стало больше/меньше — пересчитать их долю предела (только когда зеркало есть).
  const onTabs = () => {
    const n = chatTabs();
    if (n === lastTabs) return;
    lastTabs = n;
    if (M.allowed()) CPX.router.broadcast("mirror.page", pageInfo());
  };
  CPX.router.ev.on("channels", onTabs);
  CPX.router.ev.on("site:channels", onTabs);
  M.on("revive", () => CPX.router.broadcast("mirror.revive", {}));

  /* ── Подсказка не-подписчику ────────────────────────────────────────────── */

  const CLAIM_MS = 30000;
  let claim = null; // { tab, at } — какой вкладке отдана подсказка (ждём подтверждения показа)

  function hintPayload(h) {
    return {
      svc: h.svc,
      text: CPX.t(h.kind === "login" ? "mirror.hint." + h.svc + ".login" : "mirror.hint." + h.svc),
      url: CPX.plus ? CPX.plus.SUB_URL : "",
    };
  }

  /** Отдать подсказку вкладке, если она ждёт показа и не отдана другой (или та молчит 30 с). */
  function claimFor(tab) {
    const h = M.hintPending();
    if (!h || !tab) return null;
    const now = Date.now();
    const live = (t) => CPX.router.tabs.has(t) || CPX.router.siteTabs.has(t);
    if (claim && claim.tab !== tab && now - claim.at < CLAIM_MS && live(claim.tab)) return null;
    claim = { tab, at: now };
    return hintPayload(h);
  }

  /** Одна вкладка для подсказки: активная (если она наша), иначе последняя открытая. */
  async function hintTab() {
    let top = null;
    for (const t of CPX.router.tabs) if (t.frameId === 0) top = t;
    try {
      const [act] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (act) for (const t of CPX.router.tabs) if (t.frameId === 0 && t.tabId === act.id) return t;
    } catch (_) {
      /* без окна — последняя вкладка */
    }
    return top;
  }

  // Решили показать — отдаём одной вкладке. Её не видно или тостов нет — она не подтвердит, и
  // подсказка дождётся другой вкладки (спросит сама, когда её станет видно) или popup.
  M.on("hint", async () => {
    const tab = await hintTab();
    const p = tab && claimFor(tab);
    if (p) CPX.router.toTab(tab, "mirror.hint", p);
  });

  CPX.router.handle("mirror.page", () => pageInfo(), { page: true });

  CPX.router.handle("mirror.hintClaim", (p, ctx) => claimFor(ctx.tab), { page: true });

  // Вкладка показала тост. Худшее, что может сделать чужой скрипт страницы, — погасить нашу же
  // подсказку на сутки.
  CPX.router.handle(
    "mirror.hintShown",
    (p, ctx) => {
      if (!claim || claim.tab !== ctx.tab) return false;
      claim = null;
      return M.hintShown();
    },
    { page: true }
  );

  CPX.router.handle("mirror.hint", () => {
    // Крестик «больше не показывать» (mirror.hintOff, владелец 23.10) — и в popup тоже нет.
    if (CPX.settings.get("mirror.hintOff") === true) return { svc: "", kind: "", at: 0, pending: false, fresh: false, text: "", subscribeUrl: "" };
    const h = M.hint();
    const pend = M.hintPending();
    const svc = pend ? pend.svc : h.svc;
    return {
      svc,
      kind: pend ? pend.kind : "",
      at: pend ? pend.at : h.at,
      pending: !!pend,
      fresh: !!pend || (!!h.at && Date.now() - h.at < M.gap()),
      text: pend ? hintPayload(pend).text : svc ? CPX.t("mirror.hint." + svc) : "",
      subscribeUrl: CPX.plus ? CPX.plus.SUB_URL : "",
    };
  });

  CPX.router.handle("mirror.hintSeen", () => {
    claim = null;
    return M.hintShown();
  });

  /* ── Отчёты страниц о картинках 7TV ─────────────────────────────────────── */

  function cdnUrl(u) {
    try {
      const x = new URL(String(u || ""));
      if (x.protocol !== "https:" || x.hostname !== CDN || !CDN_PATH.test(x.pathname) || /\.\.|\/\/|\/\.\//.test(x.pathname)) return "";
      return "https://" + CDN + x.pathname;
    } catch (_) {
      return "";
    }
  }

  const verifying = { d: { busy: false, at: 0 }, m: { busy: false, at: 0 } };

  /** Прямо: ответил ли 7TV → true | false (нет связи) | "refused" (отказ 403/429/5xx — CPX.mirror.badStatus; сбой ли
   *  это пути, решает зеркало — см. verify). Тело — под сторожем тишины. */
  async function directAlive(url) {
    const b = M.testBlock(CDN);
    if (b) {
      await CPX.sleep(50);
      return false;
    }
    const ctl = new AbortController();
    let t = setTimeout(() => ctl.abort(), VERIFY_STALL_MS);
    try {
      const res = await fetch(url, { cache: "no-store", credentials: "omit", signal: ctl.signal });
      clearTimeout(t);
      t = setTimeout(() => ctl.abort(), VERIFY_STALL_MS);
      await res.arrayBuffer();
      return M.badStatus(res.status) ? "refused" : true;
    } catch (_) {
      return false;
    } finally {
      clearTimeout(t);
    }
  }

  /** Через зеркало: исход по X-Mirror-* (как у запросов фона). */
  async function mirrorOutcome(url) {
    for (let i = 0; i < 2; i++) {
      const r = M.route(url, "GET");
      if (!r.mirrorable) return null;
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 20000);
      let res = null;
      try {
        res = await fetch(r.mirrorUrl, { headers: { Authorization: r.auth }, redirect: "manual", cache: "no-store", credentials: "omit", signal: ctl.signal });
        await res.arrayBuffer();
      } catch (_) {
        res = null;
      } finally {
        clearTimeout(t);
      }
      const xs = res && res.headers.get("X-Mirror-Status");
      if (!xs && res && res.status >= 500 && i === 0) {
        M.stats.edgeRetry++;
        await CPX.sleep(600 + Math.random() * 400);
        continue;
      }
      if (!xs) return { outcome: "transport", auth: r.auth };
      const xe = res.headers.get("X-Mirror-Error") || "";
      return {
        outcome: xe === "auth" ? "auth" : xe === "upstream" ? "upstream" : xe ? "refused" : "ok",
        auth: r.auth,
        status: parseInt(xs, 10) || 0,
        stale: res.headers.get("X-Mirror-Stale") === "1",
      };
    }
    return null;
  }

  async function verify(kind, url, n) {
    const v = verifying[kind];
    const now = Date.now();
    if (!v || v.busy || now - v.at < VERIFY_GAP_MS) return;
    v.busy = true;
    v.at = now;
    M.stats.verify++;
    try {
      if (kind === "d") {
        let ok = await directAlive(url);
        if (ok === "refused") {
          // Отказ 7TV напрямую: сбой пути, только если зеркало ту же картинку отдаёт (иначе лежит сам 7TV, как в 52).
          // Зеркала нет (не подписчик) — сбой: для подсказки про PLUS (как в 52).
          const m = await mirrorOutcome(url);
          if (m ? m.outcome !== "ok" || m.stale || M.badStatus(m.status) : M.allowed()) return;
          ok = false;
        }
        if (!ok) M.error("картинка напрямую", url.slice(0, 80));
        M.noteDirect(CDN, ok);
        // Упала пачка (несколько картинок разом), и сбой подтверждён — это два сбоя подряд, как
        // у клиента: картинки переходят «сначала на зеркало», а не ждут следующей перепроверки.
        if (!ok && n > 1) M.noteDirect(CDN, false);
      } else {
        const r = await mirrorOutcome(url);
        if (r) {
          if (r.outcome !== "ok") M.error("картинка через зеркало", r.outcome);
          M.noteMirror(CDN, r.outcome, false, r.auth);
        }
      }
    } finally {
      v.busy = false;
    }
  }

  CPX.router.handle(
    "mirror.note",
    (p, ctx) => {
      // Мир страницы доверен наполовину: отчёт влияет только на маршрут картинок этого браузера;
      // частоту и размер держим сами.
      const tab = ctx.tab || {};
      const now = Date.now();
      if (tab.cpxMirrorNoteAt && now - tab.cpxMirrorNoteAt < NOTE_MIN_GAP_MS) return false;
      tab.cpxMirrorNoteAt = now;
      const ok = (p && p.ok) || {};
      const d = Math.min(1000, Math.max(0, Number(ok.d) || 0));
      const m = Math.min(1000, Math.max(0, Number(ok.m) || 0));
      M.stats.pageDirectOk += d;
      M.stats.pageMirrorOk += m;
      // ⚠️Удача может быть из кэша браузера (у <img> не отличить): маршрут по ней не меняем —
      // иначе картинка из кэша при мёртвом зеркале возвращала бы смайлики в мёртвое зеркало.
      if (d || m) M.notePageOk(CDN);
      const bad = Array.isArray(p && p.bad) ? p.bad.slice(0, 2) : [];
      for (const b of bad) {
        const kind = b && (b.k === "d" || b.k === "m") ? b.k : "";
        const url = kind && cdnUrl(b.u);
        if (!url) continue;
        const n = Math.min(100, Math.max(1, Number(b.n) || 1));
        M.stats.pageSuspect += n;
        verify(kind, url, n).catch((e) => CPX.report("mirror:verify", e));
      }
      return true;
    },
    { page: true }
  );

  // Страховка: правила сессии переживают засыпание фона, но не перезагрузку расширения.
  CPX.boot.add("mirror-page", () => applyAuth(), 47);

  CPX.diag.add("mirrorPage", () => ({ verifyAt: { d: verifying.d.at, m: verifying.m.at } }));

  if (CPX.dev) {
    // Стенд: какие правила DNR стоят (пропуск в выдаче заменён звёздочками).
    M._debugRules = async () => {
      const rules = DNR && DNR.getSessionRules ? await DNR.getSessionRules() : [];
      return rules.map((r) => {
        const x = JSON.parse(JSON.stringify(r));
        const hs = x.action && x.action.requestHeaders;
        if (hs) for (const h of hs) if (h.value) h.value = h.value.slice(0, 7) + "***";
        return x;
      });
    };
    log.debug("dev: M._debugRules() — правила DNR");
  }
})();

// ── src/bg/56_card_logs.js ──
/* Фон: история сообщений человека для ленты карточки — публичные архивы rustlog — и аватарка 7TV.
 *
 * Архивы (решение владельца 05.09: наш сервер не участвует, IP зрителя к архивам — можно;
 * research/05 §2.6, память project_chatterino_user_history_card.md):
 *   logs.twitchmetrics.xyz (за Cloudflare, архив мельче), logs.spanix.team, logs.zonian.dev
 *   (без CF, глубже). Путь <хост>/channel/<логин канала>/userid/<id>?from=…&to=…&limit=…[&reverse=true]
 *   &json. Ответ {messages:[{raw, timestamp, …}]}; «сырую» строку IRC разбирает страница (там
 *   строятся строки ленты). CORS у всех трёх открыт (Access-Control-Allow-Origin: *, проверено
 *   29.09.2026), поэтому запрос идёт через общий CPX.net.fetchJSON без host_permissions. Режим
 *   raw (текстом, в 2,5 раза легче) CPX.net не читает — берём json: страница в 100 строк ~80 КБ.
 *   Граница to понимается с точностью до миллисекунды (проверено на всех трёх) — to = «старше
 *   самого старого показанного» − 1 мс, без повтора последней строки.
 *
 * Правила, каждое — найденный баг клиента:
 *   • «непустой ответ ≠ правильный»: у зеркал разная глубина и свежесть. И хвост (самое свежее),
 *     и страница прошлого («СТРОГО старше X») ограничены только сверху — поэтому спрашиваем все
 *     живые зеркала сразу и берём ответ, чья самая свежая строка ближе всего к границе (равные —
 *     полнее); не ждать остальных можно только на свежем И полном ответе. Одни пустые ответы —
 *     начало истории;
 *   • 403 — человек закрыл логи (навсегда, у каждого архива свой запрет). Но 403 отдаёт и защита
 *     Cloudflare первого хоста — поэтому «закрыто» объявляем, только если остальные архивы не
 *     дали строк; один запрос к каждому, без повторов («уважаем и не долбим»);
 *   • упавший хост (5xx/429 — явный отказ сервера) отдыхает 5 мин; обрыв связи и тайм-аут — тоже,
 *     но только если соседи в том же круге ответили (не ответил никто — это наша сеть, и в простой
 *     не уходит никто, иначе локальный сбой клал бы все три архива);
 *   • сбой сети ≠ конец истории: отвечаем "unavailable", страница повторит с паузой 3→6→…→60 с.
 *
 * Метод для страницы: card.logs {mode:"tail"|"older", channel, userId, before?} →
 *   {status:"ok"|"exhausted"|"optout"|"unavailable", lines:[сырые строки по возрастанию времени],
 *    partial?: true — «exhausted» без архива, что был в простое (запоминать «всё» нельзя)}.
 *   Никаких секретов и «действий от имени человека» — только чтение публичных архивов.
 *
 * Аватарка 7TV (research/05 §2.4.3): card.stv {id} → {avatar: адрес | ""}. 7TV отдаёт AVIF —
 * просим .webp. Картинки 7TV у подписчика PLUS грузятся через зеркало (CPX.imgRoute на странице).
 */

(() => {
  const log = CPX.log("card-logs");
  const HOSTS = ["https://logs.twitchmetrics.xyz", "https://logs.spanix.team", "https://logs.zonian.dev"];
  const EPOCH = "2015-01-01T00:00:00Z";
  const PAGE = 100;
  const TIMEOUT = 25000; // холодный первый запрос «тяжёлого» человека бывает до 14 с
  const REST_MS = 5 * 60000;
  const LOGIN_RE = /^[a-z0-9_]{1,25}$/;
  const ID_RE = /^\d{1,20}$/;
  const MAX_RAW = 8192;
  const restUntil = new Map(); // хост → до какого времени не спрашивать
  const st = { tail: 0, older: 0, fail: 0, optout: 0 };

  const alive = () => HOSTS.filter((h) => !(restUntil.get(h) > Date.now()));
  const iso = (ms) => new Date(ms).toISOString();

  function userPath(host, channel, userId) {
    return host + "/channel/" + encodeURIComponent(channel) + "/userid/" + encodeURIComponent(userId);
  }

  /** Время строки: тег tmi-sent-ts, иначе поле timestamp ответа. 0 — непригодна. */
  function tsOf(m) {
    const raw = String(m.raw || "");
    const at = raw.indexOf("tmi-sent-ts=");
    if (at >= 0) {
      const n = parseInt(raw.slice(at + 12, at + 30), 10);
      if (n > 0) return n;
    }
    const t = Date.parse(m.timestamp || "");
    return Number.isFinite(t) ? t : 0;
  }

  /** Ответ архива → [{raw, t}] по возрастанию времени (чужие данные: только строки разумной длины). */
  function linesOf(data) {
    const list = data && Array.isArray(data.messages) ? data.messages : [];
    const out = [];
    for (const m of list) {
      if (!m || typeof m.raw !== "string" || !m.raw || m.raw.length > MAX_RAW) continue;
      const t = tsOf(m);
      if (t > 0) out.push({ raw: m.raw.replace(/[\r\n]+$/, ""), t });
    }
    out.sort((a, b) => a.t - b.t);
    return out;
  }

  /** Один запрос к одному хосту → {kind: "ok"|"empty"|"optout"|"fail", lines}. */
  async function ask(host, channel, userId, q) {
    const url = userPath(host, channel, userId) + "?" + q + "&json";
    const r = await CPX.net.fetchJSON(url, { timeout: TIMEOUT, retries: 0, full: true });
    if (r && r.ok) {
      const lines = linesOf(r.data);
      return { kind: lines.length ? "ok" : "empty", lines };
    }
    const s = (r && r.status) || 0;
    if (s === 403) return { kind: "optout", lines: [] };
    if (s === 404) return { kind: "empty", lines: [] }; // канал/человек этому архиву не известен
    if (s === 429 || s >= 500) park(host, Math.min(REST_MS, (r && r.retryAfter) || REST_MS), s);
    st.fail++;
    return { kind: "fail", lines: [], status: s };
  }
  function park(host, ms, why) {
    restUntil.set(host, Date.now() + ms);
    log.debug("архив в простое на", Math.round(ms / 1000), "с:", host, why);
  }

  /** Строки ответа строго старше before; самая свежая из них. */
  function usable(r, before) {
    const lines = r.lines.filter((l) => l.t < before);
    return { lines, newest: lines.length ? lines[lines.length - 1].t : 0 };
  }

  /** Страница «строки СТРОГО старше before» (хвост — before = сейчас): у ВСЕХ живых зеркал
   * сразу, берём ответ, чья самая свежая строка ближе всего к before (равные — полнее).
   * ⚠️Не «первый непустой»: запрос ограничен только сверху, и отставшее зеркало честно отдаст
   * строки недельной давности — неделя между ними молча выпала бы из ленты (грабля клиента
   * 05.09, «щёлкнул по июлю — показало январь»).
   * Ранняя остановка (не ждать остальных) — ТОЛЬКО на свежем И полном ответе (клиент 06.09,
   * fetchLatestStep): не меньше PAGE строк и самая свежая не дальше FRESH_MS от границы (у хвоста
   * граница — «сейчас», у прошлого — before; упустить можно лишь эти минуты). Мелкое зеркало,
   * знающее канал два дня (девять «свежих» строк), так не выиграет у полного соседа.
   * Иначе ждём всех (у каждого свой тайм-аут).
   * Зеркало не ответило вовсе (обрыв, тайм-аут, чужой код), а соседи в ЭТОМ ЖЕ круге ответили —
   * сеть в порядке, беда у него: в простой на 5 мин (иначе висящий хост держал бы каждую страницу
   * 25 с и вечно превращал честное «пусто» соседей в «недоступно»). Не ответил никто — это наша
   * сеть: никого в простой не шлём. */
  const FRESH_MS = 10 * 60000;
  async function page(channel, userId, before, boundary) {
    const hosts = alive();
    if (!hosts.length) return { status: "unavailable", lines: [] };
    const partial = hosts.length < HOSTS.length; // кто-то в простое и не спрошен
    const q = "from=" + EPOCH + "&to=" + iso(before - 1) + "&limit=" + PAGE + "&reverse=true";
    const res = await new Promise((resolve) => {
      const out = [];
      let left = hosts.length;
      let over = false;
      const finish = () => {
        if (over) return;
        over = true;
        resolve(out.slice());
      };
      for (const h of hosts) {
        ask(h, channel, userId, q)
          .catch(() => ({ kind: "fail", lines: [], status: 0 })) // круг не должен повиснуть
          .then((r) => {
            if (over) return;
            r.host = h;
            out.push(r);
            left--;
            if (r.kind === "ok") {
              const u = usable(r, before);
              if (u.lines.length >= PAGE && boundary - u.newest <= FRESH_MS) return finish();
            }
            if (!left) finish();
          });
      }
    });
    if (res.some((r) => r.kind !== "fail")) for (const r of res) if (r.kind === "fail" && !(restUntil.get(r.host) > Date.now())) park(r.host, REST_MS, r.status || "нет ответа");
    let best = null;
    for (const r of res) {
      if (r.kind !== "ok") continue;
      const u = usable(r, before);
      if (!u.lines.length) continue; // одни повторы границы — у этого архива дальше пусто
      if (!best || u.newest > best.newest || (u.newest === best.newest && u.lines.length > best.lines.length)) best = u;
    }
    if (best) return { status: "ok", lines: best.lines.map((l) => l.raw) };
    const kinds = res.map((r) => r.kind);
    // Кто-то не ответил — «пусто» остальных ещё не конец: страница повторит (а он уже в простое).
    if (kinds.includes("fail")) return { status: "unavailable", lines: [] };
    if (kinds.includes("optout")) {
      st.optout++;
      return { status: "optout", lines: [] };
    }
    // partial: конец объявлен без архива, что был в простое, — страница не запомнит «всё» навсегда.
    return { status: "exhausted", lines: [], partial };
  }
  // Границы — время архива (сервера): от серверного «сейчас», а не часов компьютера (отстающие на минуты
  // часы срезали бы самое свежее).
  const tail = (channel, userId) => (st.tail++, page(channel, userId, CPX.clock.now() + 60000, CPX.clock.now()));
  const older = (channel, userId, before) => (st.older++, page(channel, userId, before, before));

  CPX.router.handle(
    "card.logs",
    async (p) => {
      const channel = String((p && p.channel) || "").toLowerCase();
      const userId = String((p && p.userId) || "");
      if (!LOGIN_RE.test(channel) || !ID_RE.test(userId)) return { status: "exhausted", lines: [] };
      if (p.mode === "tail") return tail(channel, userId);
      const before = Math.floor(Number(p.before));
      if (!Number.isFinite(before) || before <= Date.parse(EPOCH)) return { status: "exhausted", lines: [] };
      return older(channel, userId, before);
    },
    { page: true }
  );

  /* ── аватарка 7TV ───────────────────────────────────────────────────────── */
  const stv = new CPX.LRU(500); // twitch id → {avatar, at}
  const STV_FRESH_MS = 10 * 60000;
  CPX.router.handle(
    "card.stv",
    async (p) => {
      const id = String((p && p.id) || "");
      if (!ID_RE.test(id)) return { avatar: "" };
      const c = stv.get(id);
      if (c && Date.now() - c.at < STV_FRESH_MS) return { avatar: c.avatar };
      const d = await CPX.net.fetchJSON("https://7tv.io/v3/users/twitch/" + id, { timeout: 15000, missingOk: true });
      if (!d) return { avatar: "" }; // сбой — не запоминаем, спросим при следующем открытии
      let url = String((d.user && d.user.avatar_url) || "");
      if (url.startsWith("//")) url = "https:" + url;
      url = url.replace(/\.avif(\?|$)/, ".webp$1");
      const avatar = CPX.safe.imgUrl(url);
      stv.set(id, { avatar, at: Date.now() });
      return { avatar };
    },
    { page: true }
  );

  CPX.diag.add("cardLogs", () => ({
    tail: st.tail,
    older: st.older,
    fail: st.fail,
    optout: st.optout,
    resting: HOSTS.filter((h) => restUntil.get(h) > Date.now()).map((h) => h.replace("https://", "")),
  }));
})();

// ── src/bg/58_chatters.js ──
/* Фон: число «в чате» (chatters) канала — запасной путь для страницы (src/main/73_chatters.js).
 *
 * ЗАЧЕМ ФОН. Поле channel.chatters у веб-клиента Twitch закрыто проверкой подлинности: через Apollo
 * страницы аноним и безголовый браузер получают «failed integrity check» (research/06 §B.4). Решение
 * владельца 01.10: тогда — прямой запрос отсюда, как у Enhancer: POST на gql.twitch.tv ТОЛЬКО с
 * заголовком Client-ID публичного мобильного приложения Twitch (не секрет: зашит в само приложение
 * и в Enhancer). Никаких токенов и кук человека: credentials "omit" — куки twitch.tv фону доступны
 * (host_permissions), но этому запросу они не нужны и уйти не должны.
 * Спрашиваем ТОЛЬКО количество. Тот же ID анонимно отдаёт и списки логинов (moderators/viewers) —
 * их не запрашиваем никогда (приватность).
 *
 * Кэш 45 с на логин: несколько вкладок одного канала — один запрос (одновременные сливаются в один).
 * Чаще раза в ~минуту спрашивать бессмысленно: у Twitch число само кэшировано и меняется раз в
 * несколько минут. Сеть — своим fetch, не CPX.net: в нём нельзя явно запретить куки (credentials),
 * а здесь это правило; CORS не мешает — на *.twitch.tv есть host_permissions (проверено: Chrome и
 * Firefox, ответ 200 с числом).
 *
 * Метод для страницы: chatters.count {login, fresh?} → {n: число | null, age: мс с запроса, err}
 *   n: null — Twitch числа не дал (нет канала, поле закрыли); err: true — сбой сети/ответа (страница
 *   держит прежнее число). fresh — щелчок человека «обновить»: кэш старше 10 с не берём.
 *   age — возраст кэша: страница отсчитывает следующий опрос от времени запроса, поэтому вкладки
 *   одного канала опрашивают «в такт» и не чаще раза в 50 с на всех.
 *   Безопасность (метод открыт миру страницы, где работают и чужие скрипты): только публичное число
 *   по логину канала (формат проверяем), без данных человека; общий потолок частоты — чужой скрипт
 *   не превратит фон в долбилку Twitch.
 */

(() => {
  const log = CPX.log("chatters");
  const GQL = "https://gql.twitch.tv/gql";
  // Публичный Client-ID мобильного приложения Twitch (у Enhancer — тот же, в base64).
  const CLIENT_ID = "kd1unb4b3q4t58fwlpcbzcbnm76a8fp";
  const QUERY = "query($name:String!){channel(name:$name){id chatters{count}}}";
  const TTL = 45000;
  const FRESH_GAP = 10000;
  const FAIL_TTL = 20000; // сбой тоже помним недолго — не повторять его каждую секунду
  const TIMEOUT = 10000;
  const RATE_MAX = 20; // запросов в минуту на всё расширение (обычно — один на видимый канал)
  const LOGIN_RE = /^[a-z0-9_]{1,25}$/;
  const cache = new CPX.LRU(50); // login → {n, err, at}
  const inflight = new Map(); // login → Promise({n, err})
  const recent = []; // время недавних запросов (потолок частоты)
  const st = { requests: 0, fail: 0, hits: 0, limited: 0, last: null };

  async function fetchCount(login) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT);
    try {
      const res = await fetch(GQL, {
        method: "POST",
        credentials: "omit",
        cache: "no-store",
        referrerPolicy: "no-referrer",
        headers: { "Client-ID": CLIENT_ID },
        body: JSON.stringify({ query: QUERY, variables: { name: login } }),
        signal: ctl.signal,
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const j = await res.json();
      const ch = j && j.data ? j.data.channel : undefined;
      if (ch === undefined) throw new Error("ответ без data.channel");
      const n = ch && ch.chatters ? Number(ch.chatters.count) : NaN;
      return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
    } finally {
      clearTimeout(timer);
    }
  }

  function limited(now) {
    while (recent.length && now - recent[0] > 60000) recent.shift();
    return recent.length >= RATE_MAX;
  }

  CPX.router.handle(
    "chatters.count",
    async (p) => {
      const login = String((p && p.login) || "").toLowerCase();
      if (!LOGIN_RE.test(login)) throw Object.assign(new Error("неверный логин канала"), { code: "bad", quiet: true });
      const now = Date.now();
      const c = cache.get(login);
      const maxAge = p && p.fresh ? FRESH_GAP : c && c.err ? FAIL_TTL : TTL;
      if (c && now - c.at < maxAge) {
        st.hits++;
        return { n: c.n, age: now - c.at, err: c.err };
      }
      let pr = inflight.get(login);
      if (!pr) {
        if (limited(now)) {
          st.limited++;
          return c ? { n: c.n, age: now - c.at, err: c.err } : { n: null, age: 0, err: true };
        }
        recent.push(now);
        st.requests++;
        pr = fetchCount(login)
          .then(
            (n) => ({ n, err: false }),
            (e) => {
              st.fail++;
              log.debug("число «в чате» не получено:", login, e && e.message);
              return { n: null, err: true };
            }
          )
          .then((r) => {
            cache.set(login, { n: r.n, err: r.err, at: Date.now() });
            st.last = { login, n: r.n, err: r.err, t: Date.now() };
            return r;
          })
          .finally(() => inflight.delete(login));
        inflight.set(login, pr);
      }
      const r = await pr;
      return { n: r.n, age: 0, err: r.err };
    },
    { page: true }
  );

  CPX.diag.add("chatters", () => Object.assign({ logins: cache.size }, st));
})();

// ── src/bg/59_points.js ──
/* Фон: замок автосбора бонуса баллов канала между вкладками (src/main/74_points_claim.js).
 *
 * Две вкладки одного канала видят один и тот же бонус; второй щелчок Twitch отклонит, но два
 * нажатия в одну секунду выглядят как автомат. Первая вкладка получает «да» на LOCK_MS по этому
 * каналу, остальные пропускают. Замок помнит вкладку-владельца (owner — случайная метка вкладки):
 * её собственные повторы (бонус не собрался с первого раза) проходят сразу — раньше замок не пускал
 * и её саму (07.10). Без секретов, только номер канала и метка.
 */

(() => {
  const LOCK_MS = 60000;
  const ID_RE = /^[0-9]{1,20}$/;
  const OWNER_RE = /^[0-9a-z]{1,40}$/i;
  const locks = new Map(); // id канала → { until, owner }

  CPX.router.handle(
    "points.claimLock",
    async (p) => {
      const id = String((p && p.channelId) || "");
      if (!ID_RE.test(id)) return false;
      const owner = OWNER_RE.test(String((p && p.owner) || "")) ? String(p.owner) : "";
      const now = Date.now();
      for (const [k, l] of locks) if (l.until <= now) locks.delete(k);
      const l = locks.get(id);
      if (l && l.until > now && !(owner && l.owner === owner)) return false;
      locks.set(id, { until: now + LOCK_MS, owner });
      return true;
    },
    { page: true }
  );
})();

// ── src/bg/60_sb_store.js ──
/* Фон: общие баны — счётчики, наблюдение каналов, досье, «не выделять здесь», «скрыть свой значок».
 *
 * Факты собирает НАШ СЕРВЕР сам (research/05 §3.1, research/03 §7.2); расширение только сообщает
 * «смотрю канал» и спрашивает числа. Всё требует подтверждённой личности: без входа сервер sbq/sbget
 * молча игнорирует — поэтому, пока сокет не подтверждён, запросы копятся и уходят после "open".
 *
 * Протокол (research/03 §1.4–1.5, клиент SharedBansStore.cpp / TypingIndicators.cpp):
 *   sbwatch {login, room, mbdedup:1}  — по каждому открытому каналу, ПОСЛЕ КАЖДОГО (пере)подключения
 *                                       (сервер забывает подписки) → sbignlist, досылка свежих mban;
 *   sbq {ids ≤200} → sbr {items:[{u,n[,h]}], clean:[ids]} — окно сбора 150 мс, дальше шаг 320 мс
 *                                       (серверное ведро 8 / 1 в 0,3 с); «горячие» впереди «холодных»;
 *                                       без ответа 8 с — снова в очередь; кадр не ушёл — повтор через 3 с;
 *   sbupd {u, n[, h]}                 — пуш живого бана/разбана тем, кто спрашивал;
 *   sbget {u} → sbdoc {u, items, note} | sberr {code:"doc_limit", u, wait}
 *                                     — ⚠️отказ НИКОГДА не выдаём за пустое досье: пустое значит
 *                                       «нигде не забанен — метка снята» (research/03 §1.5);
 *   sbign {room, u, on} → sbignupd всем (и нам) | sberr {code:"notmod", room} — мод-операция: нужен
 *                                       пропуск ≤30 мин (CPX.auth.freshTicket), сервер пропускает раз
 *                                       в секунду, лишнее МОЛЧА выбрасывает — у нас очередь с паузой 1,1 с;
 *   sbhide {on:true}                  — «скрыть свой значок» (PLUS) живёт на сервере 3 дня и
 *                                       продлевается этим кадром при каждом подключении;
 *   sbam {room, u, id, text, ts}      — сообщение, задержанное AutoMod (видит только модератор; 11.10, как клиент
 *                                       TypingIndicators::sendSharedBanAutoMod): запоминаем ДО отправки (AM_MAX, 30 мин) и
 *                                       досылаем после каждого (пере)подключения — повтор сервер отсекает по id; мод-кадр,
 *                                       пропуск не старше 30 мин (fresh);
 *   gsync {room, items:[{u, left:null}]} — разбан, увиденный модератором (12.10, как клиент sendGhostBanSync дельтой):
 *                                       сервер снимает бан в досье (сам разбанов не видит). НЕ досылаем после обрыва —
 *                                       запоздалое «снят» сняло бы новый бан (клиент так же); ждём только обновление
 *                                       пропуска, не дольше UB_TTL_MS.
 *
 * Кэш чисел — 30 мин, потолок 20 000 (вытесняется четверть самых старых). Переподключение кэш НЕ
 * стирает (значки мигали бы у всех), а «состаривает»: значения видны, ждавшие ответа — снова в
 * очередь, а до 1500 самых свежих — холодной очередью (сервер после обрыва забыл, кому слать sbupd) —
 * только если открыт хоть один канал: без него значков не видно, и переспрос без подписки выглядел бы
 * для сервера выкачкой базы (задание 19.10: соединение спросило о ~1500 людях без единого sbwatch —
 * это был он, после обрыва на главной; проверено вживую).
 * ПОРЯДОК sbwatch → sbq / sbget (19.10): сервер смотрит на соединение целиком — был ли на нём хоть один
 * sbwatch до вопросов (досье «вслепую» у него — строгий бюджет 5 в час). Пока подписок на этом соединении нет
 * (номер комнаты ещё не пришёл, вход только что подтверждён), очередь sbq и запросы досье ждут первую, но не
 * дольше HOLD_MS: на странице без канала (подписаться не на что) уходят всё равно — ничего из того, что
 * человек может посмотреть, не отключаем. Подписка ушла — придержанное уходит сразу следом.
 * Смена личности (другой аккаунт) — кэш, очередь и списки игнора стираются.
 *
 * Просмотренные досье (для приглушения значка) — chrome.storage.local["cpx.sb.seen"] = {id: {n, at}},
 * потолок 5000, пишется сразу (как клиент: пометка должна пережить закрытие браузера).
 *
 * Методы [page]:
 *   sb.q {ids, cold}     → {items:[[u,n,h,s]], on} — что уже известно (s — число банов на момент
 *                          просмотра досье или -1); неизвестных/протухших ставит в очередь;
 *   sb.doc {u}           → {items, note} | {error:"doc_limit", wait} | {error:"offline"|"nologin"|
 *                          "consent"|"timeout"|"bad"}; одновременные запросы одного человека — один кадр;
 *   sb.seen {u, n}       → пометить досье просмотренным;
 *   sb.ign.get {room}    → {known, ids}; sb.ign.set {room, u, on} → {ok, code?};
 *   sb.state             → {on, consent, loggedIn};  sb.openLogin — открыть настройки расширения (вход);
 *   sb.automod {room, u, id, text, ts} → true — задержанное AutoMod (main/88_sb_automod.js); только канал, открытый в
 *                          этой вкладке (чужой скрипт страницы не пишет в досье других каналов);
 *   sb.unban {room, u} → true — разбан, увиденный модератором (main/88_sb_unban.js); тоже только открытый во вкладке канал.
 * События вкладкам (broadcast): "sb.counts" {items:[[u,n,h,s]], push}, "sb.seen" {u, s},
 *   "sb.doc" {u, items, note}, "sb.ign" {room, ids}, "sb.ignupd" {room, u, on, by},
 *   "sb.err" {code, room?, u?, wait?}, "sb.reset" (сменился аккаунт — забыть числа).
 * Для соседа 62_sb_relay: CPX.sb.onFrame(op, fn), CPX.sb.fresh(), CPX.sb.identity(), CPX.sb.verified().
 * Стенд (только dev): CPX.sb._dev.inject(кадр) — подать кадр «как от сервера»; _dev.verify({uid, login})
 *   — считать сокет подтверждённым этим человеком (для подменённого CPX.ws.send); _dev.state().
 */

CPX.sb = (() => {
  const log = CPX.log("sb");

  const ID_RE = /^\d{1,20}$/;
  const LOGIN_RE = /^[a-z0-9_]{1,25}$/;
  const QUERY_DEBOUNCE_MS = 150;
  const QUERY_BATCH = 200;
  const STEP_MS = 320;
  const RETRY_MS = 3000;
  const ASKED_WAIT_MS = 8000;
  const SWEEP_MS = 4000;
  const TTL_MS = 30 * 60000;
  const CACHE_MAX = 20000;
  const QUEUE_MAX = 6000;
  const RESUB_MAX = 1500; // сервер держит 1500 id на соединение (SB_WATCH_IDS_MAX)
  const HOLD_MS = 5000; // сколько вопросы ждут первого sbwatch на соединении
  const DOC_TIMEOUT_MS = 25000; // отложенный ответ сервера (пауза ≤15 с) + дорога
  const IGN_GAP_MS = 1100;
  const SEEN_KEY = "cpx.sb.seen";
  const SEEN_MAX = 5000;

  const H = Object.create(null); // op → обработчик кадра (и для стенда)
  function onFrame(op, fn) {
    const g = CPX.guard("sb:" + op, fn);
    H[op] = g;
    CPX.ws.on(op, g);
  }

  /* ── личность и связь (со стендовой подменой) ─────────────────────────────── */
  let devId = null; // только dev: {uid, login} — «сокет подтверждён», пока CPX.ws.send подменён
  const verified = () => (devId ? true : !!CPX.ws.verified);
  const identity = () => (devId ? Object.assign({}, devId) : CPX.ws.identity);
  const fresh = () => (devId ? Promise.resolve(true) : CPX.auth.freshTicket());
  function whyOff() {
    if (!CPX.settings.get("general.consent")) return "consent";
    const a = CPX.auth.state();
    if (!a || !a.loggedIn) return "nologin";
    return "offline";
  }

  /* ── кэш чисел и очередь sbq ──────────────────────────────────────────────── */
  let owner = ""; // uid, для которого кэш
  const cache = new Map(); // u → {n, h, at} (порядок Map — давность ответа)
  const hot = new Set();
  const cold = new Set();
  const asked = new Map(); // u → когда спросили
  let flushTimer = 0;
  let flushAt = 0;
  let sweepTimer = 0;
  let holdSince = 0; // с каких пор очередь ждёт первого sbwatch на этом соединении
  let watchedOnce = false; // на этом соединении уже ушёл хоть один sbwatch (так считает и сервер)
  const stats = { sbq: 0, ids: 0, sbr: 0, upd: 0, docs: 0, docErr: 0, watch: 0, am: 0, unban: 0 };

  /** Сколько ещё ждать первого sbwatch на соединении (0 — не ждать). Подписок ещё не было — ждём первую (watchAll
   * сам отпустит придержанное), не дольше HOLD_MS; не дождались (страница без канала) — дальше на этом
   * соединении не ждём. */
  function holdLeft() {
    if (watchedOnce) return 0;
    const now = Date.now();
    if (!holdSince) holdSince = now;
    return Math.max(0, holdSince + HOLD_MS - now);
  }

  function schedule(ms) {
    const at = Date.now() + ms;
    if (flushTimer && flushAt <= at) return;
    clearTimeout(flushTimer);
    flushAt = at;
    flushTimer = setTimeout(CPX.guard("sb:flush", flush), ms);
  }

  function need(id, isCold) {
    const c = cache.get(id);
    if (c && Date.now() - c.at < TTL_MS) return;
    if (hot.has(id) || cold.has(id) || asked.has(id)) return;
    // Известный, но протухший — значок уже нарисован прежним числом: переспрашиваем холодной
    // очередью, не выталкивая новичков, у которых значка нет вовсе (как клиент).
    const q = c || isCold ? cold : hot;
    q.add(id);
    if (q.size > QUEUE_MAX) q.delete(q.values().next().value);
    schedule(QUERY_DEBOUNCE_MS);
  }

  function flush() {
    flushTimer = 0;
    if (!hot.size && !cold.size) return;
    if (!verified()) return; // уйдёт после "open"
    const left = holdLeft();
    if (left > 0) return schedule(left);
    const batch = [];
    for (const id of hot) {
      hot.delete(id);
      batch.push(id);
      if (batch.length >= QUERY_BATCH) break;
    }
    for (const id of cold) {
      if (batch.length >= QUERY_BATCH) break;
      cold.delete(id);
      batch.push(id);
    }
    if (!batch.length) return;
    if (!CPX.ws.send("sbq", { ids: batch })) {
      // Кадр не ушёл (сокет закрывается) — пачку не теряем.
      for (const id of batch) hot.add(id);
      return schedule(RETRY_MS);
    }
    stats.sbq++;
    stats.ids += batch.length;
    const now = Date.now();
    if (asked.size > 5000) asked.clear(); // страховка от разрастания
    for (const id of batch) asked.set(id, now);
    if (!sweepTimer) sweepTimer = setInterval(CPX.guard("sb:sweep", sweep), SWEEP_MS);
    // Хвост — СЕРВЕРНЫМ темпом (320 мс): чаще — его очередь пачек переполняется и дропает.
    if (hot.size || cold.size) schedule(STEP_MS);
  }

  function sweep() {
    const lim = Date.now() - ASKED_WAIT_MS;
    let back = false;
    for (const [id, at] of asked) {
      if (at < lim) {
        asked.delete(id);
        hot.add(id);
        back = true;
      }
    }
    if (back) schedule(QUERY_DEBOUNCE_MS);
    if (!asked.size) {
      clearInterval(sweepTimer);
      sweepTimer = 0;
    }
  }

  /* ── просмотренные досье ──────────────────────────────────────────────────── */
  let seen = new Map(); // u → {n, at}
  const seenLoaded = chrome.storage.local
    .get(SEEN_KEY)
    .then((r) => {
      const o = (r && r[SEEN_KEY]) || {};
      const arr = [];
      for (const k in o) if (ID_RE.test(k) && o[k]) arr.push([k, { n: CPX.safe.num(o[k].n, 0, 1e6, 0) | 0, at: CPX.safe.num(o[k].at, 0, 4e12, 0) }]);
      arr.sort((a, b) => a[1].at - b[1].at);
      const m = new Map(arr.slice(-SEEN_MAX));
      for (const [k, v] of seen) m.set(k, v); // пометки, сделанные до загрузки
      seen = m;
    })
    .catch(() => {});
  const saveSeen = CPX.debounce(() => {
    const o = {};
    for (const [k, v] of seen) o[k] = v;
    chrome.storage.local.set({ [SEEN_KEY]: o }).catch((e) => log.warn("просмотренные не сохранены:", e && e.message));
  }, 200);

  const seenOf = (u) => {
    const s = seen.get(u);
    return s ? s.n : -1;
  };
  const item = (u, c) => [u, c.n, c.h, seenOf(u)];

  /* ── ответы сервера ───────────────────────────────────────────────────────── */
  function put(u, n, h) {
    asked.delete(u);
    if (cache.size >= CACHE_MAX) {
      // Четверть самых давних (порядок Map — давность ответа), а не всё разом: иначе видимых
      // переспросили бы скопом и значки мигнули бы.
      let k = Math.floor(cache.size / 4);
      for (const key of cache.keys()) {
        if (k-- <= 0) break;
        cache.delete(key);
      }
    }
    const c = { n: CPX.safe.num(n, 0, 100000, 0) | 0, h: CPX.safe.num(h, 0, 100000, 0) | 0, at: Date.now() };
    cache.delete(u);
    cache.set(u, c);
    return c;
  }

  onFrame("sbr", (m) => {
    stats.sbr++;
    const out = [];
    for (const it of Array.isArray(m.items) ? m.items.slice(0, 1000) : []) {
      const u = it && String(it.u || "");
      if (!ID_RE.test(u)) continue;
      out.push(item(u, put(u, it.n, it.h)));
    }
    // «Чистые» — тоже ответ: иначе «ответа нет» не отличить от «банов нет».
    for (const raw of Array.isArray(m.clean) ? m.clean.slice(0, 1000) : []) {
      const u = String(raw || "");
      if (ID_RE.test(u)) out.push(item(u, put(u, 0, 0)));
    }
    if (out.length) CPX.router.broadcast("sb.counts", { items: out, push: false });
  });

  onFrame("sbupd", (m) => {
    const u = String(m.u || "");
    if (!ID_RE.test(u)) return;
    stats.upd++;
    CPX.router.broadcast("sb.counts", { items: [item(u, put(u, m.n, m.h))], push: true });
  });

  /* ── досье ────────────────────────────────────────────────────────────────── */
  const docWait = new Map(); // u → {promise, resolve, timer}

  const num = (v, lo, hi) => CPX.safe.num(v, lo, hi, 0);
  const str = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");
  function cleanDoc(m) {
    const items = [];
    for (const it of Array.isArray(m.items) ? m.items.slice(0, 300) : []) {
      if (!it || typeof it !== "object") continue;
      const room = String(it.room || "");
      const login = String(it.login || "").toLowerCase();
      const msgs = [];
      for (const x of Array.isArray(it.msgs) ? it.msgs.slice(0, 40) : []) {
        if (!x || typeof x !== "object") continue;
        const t = str(x.t, 600);
        if (!t) continue;
        msgs.push({ ts: num(x.ts, 0, 4e10), am: x.am ? 1 : 0, t });
      }
      items.push({
        room: ID_RE.test(room) ? room : "",
        login: LOGIN_RE.test(login) ? login : "",
        since: num(it.since, 0, 4e10),
        minor: !!it.minor,
        selfclaim_at: num(it.selfclaim_at, 0, 4e10),
        msgs,
      });
    }
    return { items, note: str(m.note, 600) };
  }

  function finishDoc(u, result) {
    const w = docWait.get(u);
    if (!w) return;
    docWait.delete(u);
    clearTimeout(w.timer);
    w.resolve(result);
  }

  /** Отправить придержанный (или новый) запрос досье; таймер ответа — от фактической отправки. */
  function sendDoc(u, w) {
    if (docWait.get(u) !== w || w.sent) return;
    clearTimeout(w.timer);
    if (!verified()) return finishDoc(u, { error: whyOff() });
    if (!CPX.ws.send("sbget", { u })) return finishDoc(u, { error: "offline" });
    w.sent = true;
    w.timer = setTimeout(() => finishDoc(u, { error: "timeout" }), DOC_TIMEOUT_MS);
  }

  function requestDoc(u) {
    u = String(u || "");
    if (!ID_RE.test(u)) return Promise.resolve({ error: "bad" });
    if (!verified()) return Promise.resolve({ error: whyOff() });
    const w0 = docWait.get(u);
    if (w0) return w0.promise; // уже летит или ждёт подписки — второй кадр не нужен (бюджет досье)
    const w = { sent: false, timer: 0 };
    w.promise = new Promise((r) => (w.resolve = r));
    docWait.set(u, w);
    const left = holdLeft();
    if (left > 0) w.timer = setTimeout(() => sendDoc(u, w), left); // подписка уйдёт раньше — watchAll отпустит
    else sendDoc(u, w);
    return w.promise;
  }

  onFrame("sbdoc", (m) => {
    const u = String(m.u || "");
    if (!ID_RE.test(u)) return;
    stats.docs++;
    const d = cleanDoc(m);
    finishDoc(u, d);
    CPX.router.broadcast("sb.doc", { u, items: d.items, note: d.note });
  });

  onFrame("sberr", (m) => {
    const code = str(m.code, 32);
    stats.docErr++;
    if (code === "doc_limit") {
      const u = String(m.u || "");
      const wait = Math.max(1, Math.min(86400 * 2, Math.round(num(m.wait, 0, 1e7)) || 1));
      if (ID_RE.test(u)) finishDoc(u, { error: "doc_limit", wait });
      return CPX.router.broadcast("sb.err", { code, u, wait });
    }
    const room = String(m.room || "");
    CPX.router.broadcast("sb.err", { code, room: ID_RE.test(room) ? room : "" });
  });

  /* ── наблюдение каналов и «не выделять здесь» ─────────────────────────────── */
  const watched = new Set(); // комнаты, заявленные на ЭТОМ соединении
  const ign = new Map(); // комната → Set(id)

  function watchAll() {
    if (!verified()) return;
    let added = false;
    for (const [room, login] of CPX.router.channels()) {
      if (watched.has(room) || !ID_RE.test(room) || !LOGIN_RE.test(login || "")) continue;
      if (CPX.ws.send("sbwatch", { login, room, mbdedup: 1 })) {
        watched.add(room);
        stats.watch++;
        added = true;
        watchedOnce = true;
      }
    }
    // Подписка ушла — придержанные вопросы и досье следом (тот же сокет и та же очередь кадров: sbwatch впереди).
    if (added) {
      for (const [u, w] of [...docWait]) if (!w.sent) sendDoc(u, w);
      if (hot.size || cold.size) {
        holdSince = 0;
        schedule(QUERY_DEBOUNCE_MS);
      }
    }
  }

  onFrame("sbignlist", (m) => {
    const room = String(m.room || "");
    if (!ID_RE.test(room)) return;
    const ids = (Array.isArray(m.ids) ? m.ids : []).map(String).filter((x) => ID_RE.test(x)).slice(0, 5000);
    ign.set(room, new Set(ids));
    CPX.router.toChannel(room, "sb.ign", { room, ids });
  });

  onFrame("sbignupd", (m) => {
    const room = String(m.room || "");
    const u = String(m.u || "");
    if (!ID_RE.test(room) || !ID_RE.test(u)) return;
    let s = ign.get(room);
    if (!s) ign.set(room, (s = new Set()));
    if (m.on) s.add(u);
    else s.delete(u);
    CPX.router.toChannel(room, "sb.ignupd", { room, u, on: !!m.on, by: str(m.by, 40) });
  });

  // Решения модератора — по одному кадру в 1,1 с: сервер лишнее молча выбрасывает.
  const ignQ = new Map(); // "room:u" → {room, u, on}
  let ignAt = 0;
  let ignTimer = 0;
  function pumpIgn() {
    ignTimer = 0;
    if (!ignQ.size) return;
    const left = ignAt + IGN_GAP_MS - Date.now();
    if (left > 0) {
      ignTimer = setTimeout(pumpIgn, left);
      return;
    }
    const [k, v] = ignQ.entries().next().value;
    ignQ.delete(k);
    if (CPX.ws.send("sbign", v)) ignAt = Date.now();
    if (ignQ.size) ignTimer = setTimeout(pumpIgn, IGN_GAP_MS);
  }

  /* ── «скрыть свой значок» (PLUS) ──────────────────────────────────────────── */
  let hideSent = false;
  function syncHide() {
    if (hideSent || !verified()) return;
    const p = CPX.plus && CPX.plus.self;
    // Платность проверяет сервер (у неоплатившего on:true он игнорирует) — мы только продлеваем.
    if (!(p && p.active && p.profile && p.profile.hide_sharedban_badge)) return;
    if (CPX.ws.send("sbhide", { on: true })) hideSent = true;
  }
  onFrame("sbhideok", () => {});

  /* ── жизненный цикл соединения ────────────────────────────────────────────── */
  function resetAll(uid) {
    cache.clear();
    hot.clear();
    cold.clear();
    asked.clear();
    ign.clear();
    for (const u of [...docWait.keys()]) finishDoc(u, { error: "offline" });
    // uid — чтобы вкладка не стирала числа, если фон просто проснулся заново под тем же человеком
    // (иначе значки мигали бы у всех после каждого перезапуска фона).
    CPX.router.broadcast("sb.reset", { uid });
  }

  function onOpen(d) {
    watched.clear();
    hideSent = false;
    holdSince = 0;
    watchedOnce = false;
    if (!d || !d.verified || !d.identity) return;
    const uid = String(d.identity.uid || "");
    let resub = false;
    if (uid !== owner) {
      if (owner) log.info("сменился аккаунт — счётчики общих банов забыты");
      owner = uid;
      resetAll(uid);
    } else {
      // Всё, что ждало ответа на старом сокете, — мёртвые запросы: ответ туда уже не придёт.
      for (const id of asked.keys()) hot.add(id);
      asked.clear();
      // Кэш «состаривается», значения видны (а нужные переспросит страница, когда покажет человека).
      const shift = TTL_MS + 60000;
      for (const c of cache.values()) c.at -= shift;
      resub = true;
    }
    watchAll(); // ПЕРВЫМИ на новом соединении — подписки
    if (resub && watchedOnce) {
      // Самых свежих переспрашиваем холодной очередью — заодно сервер снова знает, кому слать sbupd (пуш,
      // упавший в щель обрыва, догоняется). Только при открытом канале — см. шапку.
      const ids = [...cache.keys()];
      for (let i = ids.length - 1, k = 0; i >= 0 && k < RESUB_MAX; i--, k++) if (!hot.has(ids[i])) cold.add(ids[i]);
    }
    syncHide();
    if (hot.size || cold.size) schedule(QUERY_DEBOUNCE_MS);
  }

  /* ── задержанное AutoMod → сервер (sbam) ────────────────────────────────── */
  const AM_MAX = 64;
  const AM_TTL_MS = 30 * 60000;
  const AM_ID_RE = /^[0-9A-Za-z-]{8,64}$/;
  const amPending = []; // {room, u, id, text, ts, at, sent} — sent: ушло по ЭТОМУ сокету
  let amBusy = false;
  async function pumpAutoMod() {
    if (amBusy || !verified()) return;
    amBusy = true;
    try {
      while (amPending.length && Date.now() - amPending[0].at > AM_TTL_MS) amPending.shift();
      if (!amPending.some((x) => !x.sent) || !(await fresh())) return;
      for (const x of amPending) {
        if (x.sent) continue;
        if (!CPX.ws.send("sbam", { room: x.room, u: x.u, id: x.id, text: x.text, ts: x.ts })) break;
        x.sent = true;
        stats.am++;
      }
    } finally {
      amBusy = false;
    }
  }

  /* ── разбан, увиденный модератором → сервер (gsync дельтой «снят») ─────────── */
  const UB_TTL_MS = 60000;
  const ubPending = new Map(); // канал:человек → {room, u, at}
  let ubBusy = false;
  async function pumpUnban() {
    if (ubBusy || !verified()) return;
    ubBusy = true;
    try {
      for (const [k, x] of ubPending) if (Date.now() - x.at > UB_TTL_MS) ubPending.delete(k);
      if (!ubPending.size || !(await fresh())) return;
      for (const [k, x] of ubPending) {
        if (Date.now() - x.at > UB_TTL_MS) {
          ubPending.delete(k);
          continue;
        }
        if (!CPX.ws.send("gsync", { room: x.room, items: [{ u: x.u, left: null }] })) break;
        ubPending.delete(k);
        stats.unban++;
      }
    } finally {
      ubBusy = false;
    }
  }

  CPX.ws.on("open", CPX.guard("sb:open", onOpen));
  // Обновили пропуск (переподключение) — разбаны, ждавшие его не дольше минуты, уходят.
  CPX.ws.on("open", () => pumpUnban().catch((e) => CPX.report("sb:unban", e)));
  // Новый сокет — сервер прежних кадров не помнит: всё, что ещё не устарело, — заново.
  CPX.ws.on("open", () => {
    for (const x of amPending) x.sent = false;
    pumpAutoMod().catch((e) => CPX.report("sb:automod", e));
  });
  CPX.ws.on("close", () => {
    watched.clear();
    hideSent = false;
    holdSince = 0;
    watchedOnce = false;
    // Досье приходит по ТОМУ ЖЕ сокету — ждать больше нечего.
    for (const u of [...docWait.keys()]) finishDoc(u, { error: "offline" });
  });
  CPX.router.ev.on("channels", (open) => {
    // Канал закрыли во всех вкладках — забываем, что заявляли его: при возврате уйдёт новый
    // sbwatch, и сервер (mbdedup:1) дошлёт свежие эстафеты (10 мин) и список «не выделять»,
    // пропущенные, пока канал не был открыт. Подписка на сервере при этом не снимается —
    // лишних кадров туда нет, повторный sbwatch по той же комнате у него ничего не раздувает.
    if (open instanceof Map) for (const room of [...watched]) if (!open.has(room)) watched.delete(room);
    watchAll();
  });
  if (CPX.plus && typeof CPX.plus.on === "function") CPX.plus.on("changed", () => syncHide());

  /* ── методы для вкладок ───────────────────────────────────────────────────── */
  CPX.router.handle(
    "sb.q",
    (p) => {
      const ids = Array.isArray(p.ids) ? p.ids.slice(0, 600) : [];
      const out = [];
      for (const raw of ids) {
        const id = String(raw || "");
        if (!ID_RE.test(id)) continue;
        const c = cache.get(id);
        if (c) out.push(item(id, c));
        need(id, !!p.cold);
      }
      return { items: out, on: verified(), owner };
    },
    { page: true }
  );

  CPX.router.handle("sb.doc", (p) => requestDoc(p.u), { page: true });

  CPX.router.handle(
    "sb.seen",
    async (p) => {
      const u = String(p.u || "");
      if (!ID_RE.test(u)) return false;
      await seenLoaded;
      const c = cache.get(u);
      const n = Math.max(CPX.safe.num(p.n, 0, 100000, 0) | 0, c ? c.n : 0);
      seen.delete(u);
      seen.set(u, { n, at: Date.now() });
      while (seen.size > SEEN_MAX) seen.delete(seen.keys().next().value);
      saveSeen();
      CPX.router.broadcast("sb.seen", { u, s: n });
      return true;
    },
    { page: true }
  );

  CPX.router.handle(
    "sb.ign.get",
    (p) => {
      const room = String(p.room || "");
      const s = ign.get(room);
      return { known: !!s, ids: s ? [...s] : [] };
    },
    { page: true }
  );

  CPX.router.handle(
    "sb.ign.set",
    async (p) => {
      const room = String(p.room || "");
      const u = String(p.u || "");
      if (!ID_RE.test(room) || !ID_RE.test(u)) return { ok: false, code: "bad" };
      if (!verified()) return { ok: false, code: whyOff() };
      // Мод-операция: сервер примет только пропуск не старше 30 мин.
      if (!(await fresh())) return { ok: false, code: "stale" };
      ignQ.set(room + ":" + u, { room, u, on: !!p.on });
      if (!ignTimer) pumpIgn();
      return { ok: true };
    },
    { page: true }
  );

  CPX.router.handle(
    "sb.automod",
    (p, ctx) => {
      const room = String(p.room || "");
      const u = String(p.u || "");
      const id = String(p.id || "");
      const text = [...String(p.text || "")].slice(0, 500).join(""); // по целым знакам (половинка эмодзи ломает запись на сервере)
      if (!ID_RE.test(room) || !ID_RE.test(u) || !AM_ID_RE.test(id) || !text.trim()) return false;
      if (!ctx.tab || !ctx.tab.channels.has(room)) return false;
      if (!CPX.settings.get("general.consent")) return false;
      if (!amPending.some((x) => x.id === id)) {
        amPending.push({ room, u, id, text, ts: CPX.safe.num(p.ts, 0, 4102444800, 0) | 0, at: Date.now(), sent: false });
        if (amPending.length > AM_MAX) amPending.shift();
      }
      pumpAutoMod().catch((e) => CPX.report("sb:automod", e));
      return true;
    },
    { page: true }
  );

  CPX.router.handle(
    "sb.unban",
    (p, ctx) => {
      const room = String(p.room || "");
      const u = String(p.u || "");
      if (!ID_RE.test(room) || !ID_RE.test(u) || room === u) return false;
      if (!ctx.tab || !ctx.tab.channels.has(room)) return false;
      if (!CPX.settings.get("general.consent")) return false;
      ubPending.set(room + ":" + u, { room, u, at: Date.now() });
      pumpUnban().catch((e) => CPX.report("sb:unban", e));
      return true;
    },
    { page: true }
  );

  CPX.router.handle(
    "sb.state",
    () => {
      const a = CPX.auth.state();
      return { on: verified(), consent: !!CPX.settings.get("general.consent"), loggedIn: !!(a && a.loggedIn) };
    },
    { page: true }
  );

  // Безвредно для страницы: просто открыть настройки расширения (там вход). Не чаще раза в 3 с —
  // чужой скрипт на странице не должен плодить вкладки.
  let loginOpenedAt = 0;
  CPX.router.handle(
    "sb.openLogin",
    () => {
      if (Date.now() - loginOpenedAt < 3000) return false;
      loginOpenedAt = Date.now();
      chrome.runtime.openOptionsPage();
      return true;
    },
    { page: true }
  );

  CPX.diag.add("sharedbans", () => ({
    owner: owner ? "yes" : "",
    cache: cache.size,
    hot: hot.size,
    cold: cold.size,
    asked: asked.size,
    watched: watched.size,
    watchedOnce,
    holdSince: holdSince ? Date.now() - holdSince : 0,
    ign: ign.size,
    seen: seen.size,
    docsWaiting: docWait.size,
    automodPending: amPending.length,
    unbanPending: ubPending.size,
    stats: Object.assign({}, stats),
  }));

  return {
    onFrame,
    fresh,
    verified,
    identity,
    requestDoc,
    /** Число банов по id из кэша (или null). */
    count: (u) => {
      const c = cache.get(String(u));
      return c ? { n: c.n, h: c.h } : null;
    },
    _dev: CPX.dev
      ? {
          inject(m) {
            if (m && typeof m.op === "string" && H[m.op]) H[m.op](m);
            return !!(m && H[m.op]);
          },
          verify(id) {
            devId = id && ID_RE.test(String(id.uid || "")) ? { uid: String(id.uid), login: String(id.login || "") } : null;
            if (devId) onOpen({ verified: true, identity: devId });
            return !!devId;
          },
          flushNow: () => flush(),
          state: () => ({ hot: [...hot], cold: [...cold], asked: [...asked.keys()], watched: [...watched], ign: [...ign].map(([r, s]) => [r, [...s]]), docWait: [...docWait.keys()] }),
        }
      : undefined,
  };
})();

// ── src/bg/62_sb_relay.js ──
/* Фон: общие баны — эстафета массового бана, каналы «где я модератор», принятые эстафеты,
 * само-проверка «меня разбанили?».
 *
 * ЭСТАФЕТА (research/03 §1.6, клиент MultiBanRelay.cpp):
 *   ← mban {room, uid, login, disp, by, by_disp, by_id, id, reason, n} — сервер шлёт всем нашим
 *     соединениям, у кого комната в sbwatch (включая затеявшего); свежие кадры (10 мин, до 8 на
 *     комнату) досылает при каждом sbwatch с mbdedup:1 — поэтому дедуп по id@room делает вкладка.
 *     Здесь — очистка полей (ники без управляющих и двунаправленных символов, потолки длины) и
 *     событие "sb.mban" вкладкам, где открыт этот канал.
 *   → mban {rooms, uid, reason} — СРАЗУ после постановки банов в очередь (не по окончании раздачи:
 *     она длится до минуты). Мод-операция — пропуск ≤30 мин (freshTicket). Метод sb.mban.send [page].
 *     Повтора нет намеренно: эстафета — рассказ о случившемся, досылать остывший след незачем.
 *
 * КАНАЛЫ «ГДЕ Я МОДЕРАТОР» (research/05 §3.5 [ПРЕДЛОЖЕНИЕ]): поле r подписанного пропуска (до 200 id —
 * сервер собрал его по праву user:read:moderated_channels при входе) + каналы, где страница сама
 * видела права модератора (запоминаются по аккаунту: страховка клиента «открытые вкладки»).
 * ⚠️Свой канал сюда не входит — его добавляет вкладка (последним, решение владельца).
 * Имена каналов из пропуска вкладка узнаёт у Twitch (GraphQL страницы) и сообщает сюда — кэш имён.
 * r читается методом CPX.auth.modRooms(uid), если он есть; иначе — из хранилища входа по формату,
 * описанному в шапке 42_auth.js (chrome.storage.local["cpx.auth"][uid].ticket), и из пропуска берётся
 * ТОЛЬКО список id каналов: сам пропуск никуда не уходит.
 *
 * ПРИНЯТЫЕ ЭСТАФЕТЫ: «<аккаунт>: [id нарушителей]» (клиент multibanJoined, 400 на аккаунт) —
 * chrome.storage.local["cpx.sb.joined"]; «затеял массбан сам» — память фона (клиент: память сессии).
 *
 * САМО-ПРОВЕРКА (research/05 §3.9, SelfUnbanCheck.cpp): через 45–90 с после подтверждённого
 * подключения (и дальше по расписанию сервера next) → sbmine → sbmineok {items:[{room}], nonce,
 * delay, next} → ждём delay (сервер разносит людей 20–180 с) → просим ОДНУ вкладку этого же
 * человека спросить Twitch о себе (chatRoomBanStatus, Apollo страницы) → sbself {uid, nonce,
 * items:[{room, st}]}: 0 — бана нет, 1 — перманентный, 2 — только мут; «не выяснил» не отправляется.
 * Время следующего захода — chrome.storage.local["cpx.sb.self"] (фон засыпает).
 *
 * Методы [page]: sb.mban.send {rooms, uid, reason} → {ok, code?}; sb.mod.list {acc} →
 *   {channels:[{id, login, name, src}], ticket}; sb.mod.note {acc, id, login, name, mod, forbid};
 *   sb.mod.names {items:[{id, login, name}]}; sb.joined.get {acc} → {joined, initiated};
 *   sb.joined.mark {acc, u}; sb.self.report {uid, nonce, items | skip}.
 *   Методы с acc отвечают только про того, кто СЕЙЧАС вошёл на twitch.tv (ownAcc): иначе мир
 *   страницы перебрал бы чужие аккаунты этого браузера. Отказ Twitch FORBIDDEN (forbid:true)
 *   прячет канал из поля r на 12 ч (срок пропуска) или до тех пор, пока страница снова не увидит там права.
 * События: "sb.mban" (вкладкам канала), "sb.joined" {acc, u}, "sb.initiated" {acc, u},
 *   "sb.selfCheck" {uid, nonce, rooms} (одной вкладке).
 */

CPX.sbRelay = (() => {
  const log = CPX.log("sb-relay");
  const ID_RE = /^\d{1,20}$/;
  const LOGIN_RE = /^[a-z0-9_]{1,25}$/;
  // Управляющие, невидимые и двунаправленные символы: ими подделывают границы ников в строке.
  // (Из кодов, а не литералом: невидимые символы в исходнике — сами по себе грабли, а U+2028
  // посреди регулярного выражения ломает разбор всего файла.)
  const BAD_CH = (() => {
    const R = [[0x00, 0x1f], [0x7f, 0x9f], [0xad, 0xad], [0x61c, 0x61c], [0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x206f], [0xfeff, 0xfeff]];
    const u = (c) => String.fromCharCode(92) + "u" + c.toString(16).padStart(4, "0"); // «\uXXXX» для RegExp
    return new RegExp("[" + R.map(([a, b]) => (a === b ? u(a) : u(a) + "-" + u(b))).join("") + "]", "g");
  })();
  const nick = (v, max) => (typeof v === "string" ? v.replace(BAD_CH, "").trim().slice(0, max) : "");

  /* ── хранилище (общее для частей) ─────────────────────────────────────────── */
  const KEYS = { modch: "cpx.sb.modch", names: "cpx.sb.chnames", joined: "cpx.sb.joined", self: "cpx.sb.self", forbid: "cpx.sb.modforbid" };
  const store = { modch: {}, names: {}, joined: {}, self: {}, forbid: {} };
  const loaded = chrome.storage.local
    .get(Object.values(KEYS))
    .then((r) => {
      for (const k in KEYS) {
        const v = r && r[KEYS[k]];
        if (v && typeof v === "object") store[k] = v;
      }
    })
    .catch(() => {});
  const savers = {};
  function save(k) {
    if (!savers[k]) {
      savers[k] = CPX.debounce(() => {
        chrome.storage.local.set({ [KEYS[k]]: store[k] }).catch((e) => log.warn("не сохранено", k, e && e.message));
      }, 300);
    }
    savers[k]();
  }

  /* ── эстафета: приём ──────────────────────────────────────────────────────── */
  CPX.sb.onFrame("mban", (m) => {
    const f = {
      room: String(m.room || ""),
      uid: String(m.uid || ""),
      login: nick(m.login, 40).toLowerCase(),
      disp: nick(m.disp, 40),
      by: nick(m.by, 40).toLowerCase(),
      by_disp: nick(m.by_disp, 40),
      by_id: ID_RE.test(String(m.by_id || "")) ? String(m.by_id) : "",
      id: typeof m.id === "string" || typeof m.id === "number" ? String(m.id).replace(BAD_CH, "").slice(0, 64) : "",
      reason: nick(m.reason, 160),
      n: CPX.safe.num(m.n, 0, 1000, 0) | 0,
    };
    // Без затеявшего строка началась бы с пробела; ноль каналов — «забанил на 0 каналах».
    if (!ID_RE.test(f.room) || !ID_RE.test(f.uid) || !f.login || !f.by || f.n <= 0) return;
    if (!f.disp) f.disp = f.login;
    if (!f.by_disp) f.by_disp = f.by;
    CPX.router.toChannel(f.room, "sb.mban", f);
  });

  /* ── эстафета: отправка ───────────────────────────────────────────────────── */
  const initiated = new Map(); // аккаунт → Set(id нарушителя) — «затеял сам» (память фона)

  CPX.router.handle(
    "sb.mban.send",
    async (p) => {
      const uid = String(p.uid || "");
      const rooms = [...new Set((Array.isArray(p.rooms) ? p.rooms : []).map(String))].filter((x) => ID_RE.test(x)).slice(0, 64);
      if (!ID_RE.test(uid) || !rooms.length) return { ok: false, code: "bad" };
      const id = CPX.sb.identity();
      if (!CPX.sb.verified() || !id) return { ok: false, code: "offline" };
      if (!(await CPX.sb.fresh())) return { ok: false, code: "stale" };
      const reason = nick(p.reason, 160);
      if (!CPX.ws.send("mban", { rooms, uid, reason })) return { ok: false, code: "offline" };
      noteInitiated(id.uid, uid);
      return { ok: true };
    },
    { page: true }
  );

  function noteInitiated(acc, u) {
    let s = initiated.get(acc);
    if (!s) initiated.set(acc, (s = new Set()));
    s.add(u);
    if (s.size > 400) s.delete(s.values().next().value);
    CPX.router.broadcast("sb.initiated", { acc, u });
  }

  /* ── чей аккаунт спрашивают ───────────────────────────────────────────────── */
  // Методы ниже отдают и принимают данные ПО АККАУНТУ. Мир страницы мог бы перебрать чужие
  // аккаунты, сохранённые в браузере (списки их модерируемых каналов), — поэтому только тот, кто
  // СЕЙЧАС вошёл на twitch.tv (по докладам верхних рамок, 42_auth.js; после сна фона —
  // из хранилища). На стенде (dev) — ещё и «подтверждённый» подменный сокет.
  async function ownAcc(acc) {
    if (!ID_RE.test(acc)) return false;
    try {
      await CPX.auth.loaded;
    } catch (_) {
      /* нет — решит текущее значение */
    }
    const m = CPX.auth.me;
    // Только что сменился аккаунт (смену докладывает мир страницы) — подождать минуту: перебрать
    // сохранённые аккаунты быстро не выйдет (ревью безопасности 01.10).
    if (m && m.id === acc) return !(CPX.auth.meStableMs() < 60000);
    const id = CPX.dev ? CPX.sb.identity() : null;
    return !!(id && String(id.uid) === acc);
  }

  /* ── каналы «где я модератор» ─────────────────────────────────────────────── */
  // Отказ Twitch FORBIDDEN при бане: права отобрали, а поле r пропуска ещё помнит канал (оно
  // собрано при входе). Такой канал не предлагаем, пока пропуск не перевыпущен (он живёт 12 ч)
  // или пока страница снова не увидит там права модератора.
  const FORBID_TTL_MS = 12 * 3600000;
  function forbidden(acc) {
    const f = store.forbid[acc];
    if (!f) return new Set();
    const now = Date.now();
    return new Set(Object.keys(f).filter((id) => now - (f[id] || 0) < FORBID_TTL_MS));
  }
  function b64json(part) {
    const s = String(part || "").replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(s + "===".slice((s.length + 3) % 4));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  /** id каналов из поля r пропуска этого человека (или null — неизвестно). */
  async function ticketRooms(acc) {
    const clean = (r) => (Array.isArray(r) ? r.map(String).filter((x) => ID_RE.test(x)).slice(0, 200) : null);
    if (CPX.auth && typeof CPX.auth.modRooms === "function") {
      try {
        return clean(await CPX.auth.modRooms(acc));
      } catch (_) {
        return null;
      }
    }
    try {
      const all = ((await chrome.storage.local.get("cpx.auth")) || {})["cpx.auth"] || {};
      const rec = all[acc];
      if (!rec || rec.foreign || typeof rec.ticket !== "string") return null;
      const p = b64json(rec.ticket.split(".")[0]);
      return p && String(p.u) === acc ? clean(p.r) : null;
    } catch (_) {
      return null;
    }
  }

  CPX.router.handle(
    "sb.mod.list",
    async (p) => {
      const acc = String(p.acc || "");
      if (!(await ownAcc(acc))) return { channels: [], ticket: false };
      await loaded;
      const r = await ticketRooms(acc);
      const known = store.modch[acc] || {};
      const bad = forbidden(acc);
      const out = [];
      const add = (id, src) => {
        if (id === acc || out.some((c) => c.id === id)) return;
        if (src === "ticket" && bad.has(id)) return;
        const k = known[id] || store.names[id] || {};
        out.push({ id, login: k.login || "", name: k.name || k.login || "", src });
      };
      for (const id of r || []) add(id, "ticket");
      for (const id of Object.keys(known)) add(id, "page");
      return { channels: out, ticket: !!r };
    },
    { page: true }
  );

  CPX.router.handle(
    "sb.mod.note",
    async (p) => {
      const acc = String(p.acc || "");
      const id = String(p.id || "");
      if (!ID_RE.test(id) || id === acc || !(await ownAcc(acc))) return false;
      await loaded;
      const m = store.modch[acc] || (store.modch[acc] = {});
      const had = !!m[id];
      // Чёрный список FORBIDDEN (см. forbidden): ставит только отказ Twitch при бане, снимает —
      // увиденные страницей права модератора. Протухшие записи вычищаются при добавлении.
      const fb = store.forbid[acc];
      if (p.mod && fb && fb[id]) {
        delete fb[id];
        if (!Object.keys(fb).length) delete store.forbid[acc];
        save("forbid");
      } else if (!p.mod && p.forbid) {
        const f = fb || (store.forbid[acc] = {});
        const now = Date.now();
        f[id] = now;
        for (const k of Object.keys(f)) if (now - (f[k] || 0) >= FORBID_TTL_MS) delete f[k];
        save("forbid");
      }
      if (p.mod) {
        const login = String(p.login || "").toLowerCase();
        m[id] = { login: LOGIN_RE.test(login) ? login : "", name: nick(p.name, 40), at: Date.now() };
        const ids = Object.keys(m);
        if (ids.length > 300) {
          ids.sort((a, b) => (m[a].at || 0) - (m[b].at || 0));
          for (const x of ids.slice(0, ids.length - 300)) delete m[x];
        }
      } else if (had) delete m[id];
      else return true;
      save("modch");
      return true;
    },
    { page: true }
  );

  CPX.router.handle(
    "sb.mod.names",
    async (p) => {
      await loaded;
      let n = 0;
      for (const it of Array.isArray(p.items) ? p.items.slice(0, 200) : []) {
        const id = String((it && it.id) || "");
        const login = String((it && it.login) || "").toLowerCase();
        if (!ID_RE.test(id) || !LOGIN_RE.test(login)) continue;
        store.names[id] = { login, name: nick(it.name, 40) || login, at: Date.now() };
        n++;
      }
      const ids = Object.keys(store.names);
      if (ids.length > 1000) {
        ids.sort((a, b) => (store.names[a].at || 0) - (store.names[b].at || 0));
        for (const x of ids.slice(0, ids.length - 1000)) delete store.names[x];
      }
      if (n) save("names");
      return n;
    },
    { page: true }
  );

  /* ── принятые эстафеты ────────────────────────────────────────────────────── */
  CPX.router.handle(
    "sb.joined.get",
    async (p) => {
      const acc = String(p.acc || "");
      if (!(await ownAcc(acc))) return { joined: [], initiated: [] };
      await loaded;
      return { joined: (store.joined[acc] || []).slice(), initiated: [...(initiated.get(acc) || [])] };
    },
    { page: true }
  );

  CPX.router.handle(
    "sb.joined.mark",
    async (p) => {
      const acc = String(p.acc || "");
      const u = String(p.u || "");
      if (!ID_RE.test(u) || !(await ownAcc(acc))) return false;
      await loaded;
      const list = (store.joined[acc] || []).filter((x) => x !== u);
      list.push(u);
      // Потолок настоящий: список копится годами; режем самые старые.
      store.joined[acc] = list.slice(-400);
      save("joined");
      CPX.router.broadcast("sb.joined", { acc, u });
      return true;
    },
    { page: true }
  );

  /* ── само-проверка «меня разбанили?» ──────────────────────────────────────── */
  const ASK_MIN_MS = 45000;
  const ASK_MAX_MS = 90000;
  const ANSWER_WAIT_MS = 30 * 60000;
  const TAB_WAIT_MS = 30000;
  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a));
  let askTimer = 0;
  let checkTimer = 0;
  let pending = null; // {uid, nonce, rooms, tried:Set}
  let selfUid = "";

  function selfAllowed() {
    const id = CPX.sb.identity();
    return !!(CPX.settings.get("sharedbans.selfCheck") && CPX.sb.verified() && id && ID_RE.test(String(id.uid)));
  }
  function resetSelf() {
    clearTimeout(askTimer);
    clearTimeout(checkTimer);
    askTimer = checkTimer = 0;
    pending = null;
  }

  async function armSelf() {
    await loaded;
    if (!selfAllowed() || askTimer || pending) return;
    const uid = String(CPX.sb.identity().uid);
    const nextAt = CPX.safe.num(store.self[uid], 0, 4e12, 0);
    const wait = Math.max(0, nextAt - Date.now()) + rnd(ASK_MIN_MS, ASK_MAX_MS);
    askTimer = setTimeout(CPX.guard("sb:selfAsk", askSelf), Math.min(wait, 24 * 3600000));
  }

  function askSelf() {
    askTimer = 0;
    if (!selfAllowed()) return;
    const uid = String(CPX.sb.identity().uid);
    // Без полей: сервер берёт личность только из подписи пропуска — спросить про чужого нечем.
    if (!CPX.ws.send("sbmine", {})) return;
    store.self[uid] = Date.now() + ANSWER_WAIT_MS; // ответа нет — не долбим сервер каждым подключением
    save("self");
  }

  CPX.sb.onFrame("sbmineok", (m) => {
    const id = CPX.sb.identity();
    if (!id) return;
    const uid = String(id.uid);
    const next = CPX.safe.num(m.next, 0, 1e7, 0);
    if (next > 0) {
      const sec = Math.min(24 * 3600, Math.max(20, next));
      store.self[uid] = Date.now() + sec * 1000;
      save("self");
      clearTimeout(askTimer);
      askTimer = setTimeout(CPX.guard("sb:selfAsk", askSelf), sec * 1000 + rnd(0, ASK_MIN_MS));
    }
    const rooms = (Array.isArray(m.items) ? m.items : [])
      .map((x) => String((x && x.room) || ""))
      .filter((x) => ID_RE.test(x))
      .slice(0, 50);
    const nonce = typeof m.nonce === "string" ? m.nonce.slice(0, 200) : "";
    if (!rooms.length || !nonce) return; // проверять нечего — обычный случай
    pending = { uid, nonce, rooms, tried: new Set() };
    clearTimeout(checkTimer);
    const delay = Math.min(1800, Math.max(1, CPX.safe.num(m.delay, 0, 1e6, 1)));
    checkTimer = setTimeout(CPX.guard("sb:selfCheck", runCheck), delay * 1000);
  });

  function runCheck() {
    checkTimer = 0;
    const p = pending;
    const id = CPX.sb.identity();
    if (!p || !selfAllowed() || !id || String(id.uid) !== p.uid) {
      pending = null;
      return;
    }
    // Одна вкладка за раз (верхняя рамка, лучше с открытым чатом); не ответила — следующая.
    const tabs = [...CPX.router.tabs].filter((t) => t.frameId === 0 && !p.tried.has(t));
    const tab = tabs.find((t) => t.channels.size) || tabs[0];
    if (!tab || p.tried.size >= 3) {
      pending = null;
      return;
    }
    p.tried.add(tab);
    CPX.router.toTab(tab, "sb.selfCheck", { uid: p.uid, nonce: p.nonce, rooms: p.rooms });
    checkTimer = setTimeout(CPX.guard("sb:selfCheck", runCheck), TAB_WAIT_MS);
  }

  CPX.router.handle(
    "sb.self.report",
    (p) => {
      const pc = pending;
      const id = CPX.sb.identity();
      if (!pc || !id || String(p.nonce || "") !== pc.nonce || String(p.uid || "") !== pc.uid || String(id.uid) !== pc.uid) return false;
      clearTimeout(checkTimer);
      checkTimer = 0;
      if (p.skip) {
        // Вкладка другого человека или без Apollo — пробуем следующую.
        runCheck();
        return true;
      }
      const items = [];
      for (const it of Array.isArray(p.items) ? p.items : []) {
        const room = String((it && it.room) || "");
        const st = it && it.st;
        if (pc.rooms.includes(room) && (st === 0 || st === 1 || st === 2) && !items.some((x) => x.room === room)) items.push({ room, st });
      }
      pending = null;
      if (!items.length) return true;
      CPX.ws.send("sbself", { uid: pc.uid, nonce: pc.nonce, items });
      log.info("само-проверка: отправлено", items.length, "из", pc.rooms.length);
      return true;
    },
    { page: true }
  );

  CPX.ws.on("open", (d) => {
    const uid = d && d.verified && d.identity ? String(d.identity.uid || "") : "";
    if (uid !== selfUid) {
      resetSelf();
      selfUid = uid;
    }
    if (uid) armSelf();
  });
  CPX.settings.on((ch) => {
    if ("sharedbans.selfCheck" in ch) {
      if (ch["sharedbans.selfCheck"]) armSelf();
      else resetSelf();
    }
  });

  CPX.diag.add("sbRelay", () => ({
    selfArmed: !!askTimer,
    selfPending: !!pending,
    joinedAccs: Object.keys(store.joined).length,
    modAccs: Object.keys(store.modch).length,
    names: Object.keys(store.names).length,
  }));

  return {
    ticketRooms,
    _dev: CPX.dev ? { store, pending: () => pending, runCheck, askSelf, armSelf, resetSelf } : undefined,
  };
})();

// ── src/bg/64_raiders.js ──
/* Фон: рейдеры — кто приехал на канал с рейдом (владелец 30.10; страница — src/main/48_list_raiders.js). Протокол — сервер
 * typingws/sharedbans (исходники Z:\chatterino7-src\installer\update-server: handle_raidask, raid_push, _raid_send).
 *
 * Twitch состав рейда не отдаёт — его собирает наш сервер: кто писал в чате ИСТОЧНИКА за полчаса до рейда (до 600
 * логинов). Кадр {op:"raid", room, src, disp, srcid, viewers, at (с), more, u:[логины]}:
 *   • room — номер канала-ПРИЁМНИКА: сервер сам рассылает тем, кто сидит в его чате (sbwatch — 60_sb_store); more:true —
 *     добор из архива к уже присланному рейду (только новые логины);
 *   • room "" и tgt — ответ на наш raidask {src, tgt}: «канал, который я смотрел, ушёл рейдом на tgt — дай состав»
 *     (только спросившему; сервер отвечает лишь подтверждённому входу, не чаще раза в 5 с; src == tgt — молчит).
 * Храним по каналу-приёмнику последние RAIDS_MAX рейдов за KEEP_MS (по номеру; ответ на вопрос — по логину цели, пока
 * вкладка не назовёт номер) в chrome.storage.session: фон MV3 засыпает. Рассылку по каналу, не открытому ни в одной
 * вкладке, не храним. Слияние: тот же источник ближе MERGE_MS — один рейд (рассылка и ответ на вопрос несут разное
 * время); добор к неизвестному рейду — отбрасываем (как клиент).
 * Вкладкам: событие raid.add {id, login, raid}; методы raid.get {id, login} → рейды канала, raid.ask {src, tgt} → вопрос
 * серверу (пара — не чаще ASK_GAP_MS, как клиент).
 *
 * API для стенда: диагностика raiders.
 */

CPX.raiders = (() => {
  const log = CPX.log("raiders");
  const KEY = "cpx.raids";
  const RAIDS_MAX = 3;
  const KEEP_MS = 12 * 3600 * 1000;
  const U_MAX = 600;
  const ASK_GAP_MS = 3 * 60 * 1000;
  const MERGE_MS = 2 * 60 * 1000; // рассылка (время строки рейда) и ответ на вопрос (время ответа) — один рейд
  const LOGIN_RE = /^[a-z0-9_]{1,25}$/;
  const ID_RE = /^\d{1,20}$/;
  const st = { got: 0, more: 0, asks: 0, dropped: 0 };
  let store = null; // "id:<номер>" | "login:<логин>" → [{src, disp, srcid, at, u}]
  let loading = null;
  const asked = new Map(); // "src>tgt" → когда спросили

  const session = () => (typeof chrome !== "undefined" && chrome.storage && chrome.storage.session) || null;
  function load() {
    if (store) return Promise.resolve(store);
    if (!loading) {
      const s = session();
      loading = (s ? s.get(KEY).then((r) => (r && r[KEY]) || {}) : Promise.resolve({}))
        .catch(() => ({}))
        .then((v) => {
          store = v && typeof v === "object" ? v : {};
          return store;
        });
    }
    return loading;
  }
  function save() {
    const s = session();
    if (s && store) s.set({ [KEY]: store }).catch(() => {});
  }
  function prune() {
    const old = Date.now() - KEEP_MS;
    for (const k of Object.keys(store)) {
      store[k] = (store[k] || []).filter((r) => r && r.at > old).slice(-RAIDS_MAX);
      if (!store[k].length) delete store[k];
    }
  }

  /** Номер канала по логину — у открытых вкладок (tab.setChannels). */
  function idOf(login) {
    for (const t of CPX.router.tabs) for (const [id, l] of t.channels) if (l === login) return id;
    return "";
  }
  const openRoom = (id) => [...CPX.router.tabs].some((t) => t.channels.has(id));

  /** Рейд в хранилище: новый — в конец; тот же источник ближе MERGE_MS — слить логины (время — раннее); добор к
   *  неизвестному — null. */
  function put(key, r, more) {
    const list = store[key] || (store[key] = []);
    const same = list.find((x) => x.src === r.src && Math.abs(x.at - r.at) <= MERGE_MS);
    if (same) {
      const had = new Set(same.u);
      for (const u of r.u) if (!had.has(u) && same.u.length < U_MAX) same.u.push(u);
      if (r.srcid && !same.srcid) same.srcid = r.srcid;
      same.at = Math.min(same.at, r.at);
      return same;
    }
    if (more) return null;
    list.push(r);
    store[key] = list.slice(-RAIDS_MAX);
    return r;
  }

  async function onRaid(m) {
    const src = String(m.src || "").toLowerCase();
    const u = Array.isArray(m.u) ? [...new Set(m.u.map((x) => String(x || "").toLowerCase()).filter((x) => LOGIN_RE.test(x)))].slice(0, U_MAX) : [];
    const at = Number(m.at) * 1000;
    const room = String(m.room || "");
    const tgt = String(m.tgt || "").toLowerCase();
    if (!LOGIN_RE.test(src) || !u.length || !(at > 0) || (room && !ID_RE.test(room)) || (!room && !LOGIN_RE.test(tgt)) || src === tgt) {
      st.dropped++;
      return;
    }
    // Сервер не вычёркивает закрытые каналы из подписок сеанса — рейды каналов, не открытых ни в одной вкладке, не храним
    // (ревью 30.10; клиент тоже отбрасывает).
    if (room && !openRoom(room)) {
      st.dropped++;
      return;
    }
    const r = { src, disp: String(m.disp || src).slice(0, 40), srcid: ID_RE.test(String(m.srcid || "")) ? String(m.srcid) : "", at, u };
    await load();
    const id = room || idOf(tgt);
    const got = put(id ? "id:" + id : "login:" + tgt, r, !!m.more);
    if (!got) {
      st.dropped++;
      return;
    }
    if (m.more) st.more++;
    else st.got++;
    prune();
    save();
    log.debug("рейд:", src, "→", room || tgt, "логинов:", got.u.length, m.more ? "(добор)" : "");
    if (id) CPX.router.toChannel(id, "raid.add", { id, raid: got });
  }

  /** Рейды канала; записанные по логину (ответ на вопрос до открытия вкладки) — переносим под номер. */
  async function get(p) {
    const id = String((p && p.id) || "");
    const login = String((p && p.login) || "").toLowerCase();
    if (!ID_RE.test(id)) return [];
    await load();
    const byLogin = LOGIN_RE.test(login) && store["login:" + login];
    if (byLogin) {
      for (const r of byLogin) put("id:" + id, r, false);
      delete store["login:" + login];
      prune();
      save();
    }
    return (store["id:" + id] || []).filter((r) => r.src !== login);
  }

  function ask(p) {
    const src = String((p && p.src) || "").toLowerCase();
    const tgt = String((p && p.tgt) || "").toLowerCase();
    if (!LOGIN_RE.test(src) || !LOGIN_RE.test(tgt) || src === tgt) return false;
    const k = src + ">" + tgt;
    const now = Date.now();
    if (now - (asked.get(k) || 0) < ASK_GAP_MS) return false;
    if (!CPX.ws.isOpen() || !CPX.ws.verified) return false; // сервер отвечает только подтверждённому входу
    asked.set(k, now);
    if (asked.size > 50) asked.delete(asked.keys().next().value);
    st.asks++;
    return CPX.ws.send("raidask", { src, tgt });
  }

  CPX.ws.on("raid", (m) => onRaid(m).catch((e) => CPX.report("raiders:frame", e)));
  CPX.router.handle("raid.get", get, { page: true });
  CPX.router.handle("raid.ask", ask, { page: true });

  CPX.diag.add("raiders", () => Object.assign({ keys: store ? Object.keys(store).length : null }, st));
  const api = {};
  if (CPX.dev) api._dev = { onRaid }; // стенд: подать кадр «как от сервера»
  return api;
})();

// ── src/bg/66_typing.js ──
/* Фон: «Кто печатает» — модераторы и стример канала видят, кто из модераторов набирает сообщение (владелец 08.11,
 * задание основного чата Z:\_memstudy\handoff\основной-в-расширение-2026-11-08-печатает.md). Один в один как клиент
 * Chatterino+ (src/providers/typing/TypingIndicators.cpp) и ВМЕСТЕ с ним: комната на сервере одна на канал, кадры те же,
 * человек считается по логину.
 *
 * ПРОТОКОЛ (сокет 40_ws; сервер typingws: handle_sub / handle_unsub / handle_typing / handle_stop, TYPING_TTL_SEC 6 с).
 * Комната — twitch-id канала. К серверу: {op:"sub", room} — слушать (сервер сразу шлёт снимок roster; пускает только
 * подтверждённого модератора/владельца канала из пропуска, иначе authstale — его ведёт 42_auth: продление и
 * переподключение, после него — снова sub); {op:"unsub", room} — перестать (сервер заодно убирает нас из печатающих);
 * {op:"typing", room} — «у меня черновик» (только в подписанной комнате); {op:"stop", room} — «поле пустое». От сервера:
 * {op:"roster", room, typing:[{l, n}]} — ПОЛНЫЙ список в порядке начала печати; на продление сервер молчит. Текст
 * сообщения на сервер не уходит никогда.
 *
 * ВКЛАДКИ (страница — src/main/77_input_typing.js, метод typing.state {room, watch, draft, touch}): watch — функция этой
 * вкладке видна (вошёл в Twitch, модератор/стример открытого канала, настройка включена); room — только канал, открытый
 * в этой вкладке (tab.setChannels); draft — в поле есть текст (без пробелов по краям); touch — поле только что менялось.
 * Комната нужна, пока её смотрит хоть одна вкладка, настройка mod.typing включена и вход подтверждён (CPX.ws.verified):
 * sub — на переходе 0 → 1, unsub — 1 → 0 (счётчик ссылок клиента, setRoomWatched). Черновик комнаты — есть хоть в одной
 * её вкладке, время последней правки — самое свежее (закрытая вкладка = пустой черновик).
 * КОГДА СЛАТЬ (как клиент sendTyping / sendStop / onTypingKeepalive): черновик появился — typing сразу; дальше раз в 2 с,
 * пока он есть (2 с — треть от 6 с сервера: переживает потерю пары кадров без мигания); 30 с без правок — stop, черновик
 * забыт, хотя поле может быть непусто (новая правка вернёт); поле опустело — stop сразу. Отписка — черновик забыт (сервер
 * на unsub уберёт нас сам). Обрыв — черновики живут: после open (verified) sub по всем комнатам, затем typing по живым
 * черновикам; списки печатающих при закрытии сокета — сразу пустые (иначе «X печатает…» висело бы весь обрыв;
 * clearLiveRosters клиента). Сменился человек (логин в hello) или выключили функцию — черновики забыты.
 * Список печатающих раскрывает ники модераторов — уходит только вкладкам этого канала с watch; пропуск фон не покидает.
 *
 * API: диагностика typing; для стенда (dev) — CPX.typing._dev: mock(on) (сокет «подтверждён», кадры не уходят, а
 *   копятся), frames(), open(), close(), inject(кадр от сервера), tick().
 */

CPX.typing = (() => {
  const log = CPX.log("typing");
  const KEEPALIVE_MS = 2000; // клиент: TYPING_KEEPALIVE_MS
  const IDLE_MS = 30000; // клиент: DRAFT_IDLE_TIMEOUT
  const ROOM_RE = /^\d{1,20}$/;
  const KEY = "mod.typing";
  const tabsSt = new Map(); // вкладка → { room, watch, draft, at }
  const subs = new Set(); // комнаты, на которые подписаны на ЭТОМ соединении
  const live = new Map(); // комната → время последней правки: черновики, о которых знает сервер
  const rosters = new Map(); // комната → [{l, n}] — последний снимок сервера
  const st = { subs: 0, unsubs: 0, typing: 0, stops: 0, rosters: 0 };
  let timer = 0;
  let who = ""; // логин подтверждённого входа, при котором набирались черновики

  // Стенд (dev): сокет «подтверждён», кадры копятся вместо отправки.
  let mock = null;
  const verified = () => (mock ? true : !!CPX.ws.verified);
  const send = (op, room) => {
    st[op === "sub" ? "subs" : op === "unsub" ? "unsubs" : op === "stop" ? "stops" : "typing"]++;
    if (mock) {
      mock.push({ t: Date.now(), op, room });
      return true;
    }
    return CPX.ws.send(op, { room });
  };
  const on = () => CPX.settings.get(KEY) !== false;

  /** Нужные комнаты: комната → { draft, at } по всем вкладкам, где она открыта и смотрится. */
  function wanted() {
    const m = new Map();
    if (!on() || !verified()) return m;
    for (const [tab, s] of tabsSt) {
      if (!s.watch || !s.room || !tab.channels.has(s.room)) continue;
      const r = m.get(s.room) || { draft: false, at: 0 };
      if (s.draft) {
        r.draft = true;
        r.at = Math.max(r.at, s.at);
      }
      m.set(s.room, r);
    }
    return m;
  }

  function deliver(room, list) {
    for (const [tab, s] of tabsSt) if (s.watch && s.room === room) CPX.router.toTab(tab, "typing.roster", { room, typing: list });
  }

  /** Подписки и черновики — к нужному состоянию. */
  function sync() {
    const want = wanted();
    const now = Date.now();
    for (const room of [...subs]) {
      if (want.has(room)) continue;
      subs.delete(room);
      live.delete(room);
      send("unsub", room);
      if (rosters.delete(room)) deliver(room, []);
    }
    for (const room of want.keys()) if (!subs.has(room) && send("sub", room)) subs.add(room);
    for (const [room, w] of want) {
      const fresh = w.draft && now - w.at < IDLE_MS;
      if (fresh && !live.has(room)) {
        // Первая правка — сразу (быстрый старт); дальше держит такт.
        live.set(room, w.at);
        if (subs.has(room)) send("typing", room);
      } else if (fresh) live.set(room, w.at);
      else if (!w.draft && live.delete(room)) send("stop", room);
    }
    for (const room of [...live.keys()]) if (!want.has(room)) live.delete(room);
    arm();
  }

  /** Такт продления: раз в 2 с typing по живым черновикам; 30 с без правок — stop. */
  function tick() {
    const now = Date.now();
    for (const [room, at] of [...live]) {
      if (now - at >= IDLE_MS) {
        live.delete(room);
        if (subs.has(room)) send("stop", room);
      } else if (subs.has(room)) send("typing", room);
    }
    arm();
  }
  function arm() {
    if (live.size && !timer) timer = setInterval(CPX.guard("typing:tick", tick), KEEPALIVE_MS);
    else if (!live.size && timer) {
      clearInterval(timer);
      timer = 0;
    }
  }

  function onOpen(d) {
    subs.clear();
    const login = (d && d.verified && d.identity && String(d.identity.login || "")) || "";
    if (login !== who) {
      live.clear(); // другой человек (или выход) — чужие черновики не досылаем
      who = login;
    }
    sync();
    // Досыл: после обрыва сервер о нас забыл — живые черновики заново (иначе другие не видят, что печатаем, до нажатия).
    for (const room of live.keys()) if (subs.has(room)) send("typing", room);
  }
  function onClose() {
    subs.clear();
    for (const room of [...rosters.keys()]) deliver(room, []);
    rosters.clear();
  }
  function onRoster(m) {
    const room = String((m && m.room) || "");
    if (!ROOM_RE.test(room) || !subs.has(room)) return;
    const list = (Array.isArray(m.typing) ? m.typing : [])
      .slice(0, 100)
      .map((e) => ({ l: String((e && e.l) || "").slice(0, 64), n: String((e && e.n) || "").slice(0, 64) }));
    st.rosters++;
    rosters.set(room, list);
    deliver(room, list);
  }

  CPX.router.handle(
    "typing.state",
    (p, ctx) => {
      const tab = ctx.tab;
      if (!tab) return false;
      const room = String(p.room || "");
      const prev = tabsSt.get(tab);
      const s = { room: ROOM_RE.test(room) ? room : "", watch: !!p.watch, draft: !!p.draft, at: prev && prev.room === room ? prev.at : 0 };
      if (s.draft && p.touch) s.at = Date.now();
      else if (!s.draft) s.at = 0;
      tabsSt.set(tab, s);
      sync();
      // Вкладка только что начала смотреть комнату, на которую уже подписаны, — снимок сразу.
      if (s.watch && rosters.has(s.room) && !(prev && prev.watch && prev.room === s.room)) CPX.router.toTab(tab, "typing.roster", { room: s.room, typing: rosters.get(s.room) });
      return true;
    },
    { page: true }
  );

  CPX.router.ev.on("tab:close", (tab) => tabsSt.delete(tab) && sync());
  CPX.router.ev.on("tab:channels", () => sync());
  CPX.settings.on((applied) => applied && KEY in applied && sync());
  CPX.ws.on("open", CPX.guard("typing:open", onOpen));
  CPX.ws.on("close", CPX.guard("typing:close", onClose));
  CPX.ws.on("roster", CPX.guard("typing:roster", onRoster));

  CPX.diag.add("typing", () => ({ on: on(), verified: verified(), tabs: tabsSt.size, subs: [...subs], live: [...live.keys()], rosters: rosters.size, stats: st }));

  const api = {};
  if (CPX.dev)
    api._dev = {
      mock(v) {
        mock = v ? [] : null;
        return true;
      },
      frames: () => (mock ? mock.slice() : null),
      open: (login) => onOpen({ verified: true, identity: { login: login || "dev" } }),
      close: onClose,
      inject: (m) => onRoster(m),
      tick,
    };
  return api;
})();

// ── src/bg/67_giveaway.js ──
/* Фон: розыгрыши среди зрителей (задание основного чата 22.11, v2: Z:\_memstudy\handoff\основной-в-расширение-2026-11-22-
 * розыгрыши-v2.md; план — chatterino7-src/docs/plus/РОЗЫГРЫШИ-ПЛАН.md §7–11; клиент 5.7.0 — TypingIndicators.cpp, приём
 * кадров gw/gwme/gwok/gwwin). Ведущий ведёт розыгрыш на нашей странице chat.eblo.id/chat/give/?c=<канал>; сервер сам
 * читает чат и считает участников, зрители с Chatterino+ участвуют одной кнопкой (плашка — src/main/92_giveaway.js).
 *
 * ПОДПИСКА. Теневая комната канала (как теневой чат клиента): {op:"gsub", room} — на каждый канал, открытый во вкладке
 * Twitch (router.channels), пока вход на сервер подтверждён (сервер пускает в gsub только подтверждённых); канал закрыли
 * во всех вкладках — {op:"gunsub"}. Сразу после gsub и при каждом изменении сервер шлёт {op:"gw", room, g:{id, st, word?,
 * any?, btn?, warn?, closes?, cond, cv}}. Нет розыгрыша — сервер молчит: после переподписки (обрыв) ждём SILENT_MS, и
 * если «gw» не пришёл, прежний розыгрыш канала забываем (иначе висела бы плашка закончившегося). История теневого чата
 * (ghist/gmsg) приходит тоже — расширение теневой чат не показывает и эти кадры не разбирает.
 * «end» — только для розыгрыша с ТЕМ ЖЕ id (⚠️v2): опоздавший «конец» прошлого не стирает начатый новый.
 *
 * ОТ ВКЛАДОК (методы [page], только для канала, открытого в этой вкладке):
 *   give.state {room} → {g, me:{g, in, why}, win:{g, chan, k}, ok:{g, ok, why, cv}} — что известно сейчас;
 *   give.check {room, g, b:{sub, vip, mod}} → gwcheck («подхожу ли я»; сервер — не чаще раза в 1 с на соединение);
 *   give.join  {room, g, b} → gwjoin («Участвовать»; сервер — не чаще раза в 2 с на соединение).
 * Вкладкам канала — событие "give.frame" {room, kind: "gw"|"gwme"|"gwok"|"gwwin"|"gone", …}.
 *
 * VIP ПОБЕДИТЕЛЮ ОТ ГЛАВНОГО МОДЕРАТОРА (§3 задания). Открытый способ Twitch даёт VIP только стримеру — страница розыгрыша
 * делает это сама; главному модератору — расширение, от его имени на twitch.tv (те же мутации, что у Twitch, — CPX.input.vip
 * в мире страницы, 77_input_send; права проверяет Twitch). Скрипт страницы розыгрыша (src/give/10_give.js) шлёт сюда
 * {cpxGive:"vip", rid, on, channelId, channelLogin, userId, userLogin}; отвечаем {ok, error}. Делает вкладка Twitch
 * (событие "give.vip" {task, …} → метод give.vipDone {task, ok, error}), по одному, не чаще раза в VIP_GAP_MS. Вкладки
 * Twitch нет: выдача — отказ «открой twitch.tv», снятие (приходит и при закрытии страницы) — в очередь хранилища
 * (KEY_UNVIP, до 50, сутки) и доделывается, когда вкладка Twitch появится.
 *
 * API: диагностика giveaway; для стенда (dev) — CPX.giveaway._dev: inject(кадр сервера), frames() (что ушло), mock(on),
 *   open(), state(room).
 */

CPX.giveaway = (() => {
  const log = CPX.log("giveaway");
  const ROOM_RE = /^\d{1,20}$/;
  const GID_RE = /^[A-Za-z0-9_.:-]{1,40}$/;
  const LOGIN_RE = /^[a-z0-9_]{1,25}$/;
  const ST = new Set(["draft", "open", "closed", "winner", "end"]);
  const MAX_ROOMS = 20; // сервер пускает 250; у человека открыто 1–3 канала
  const SILENT_MS = 6000;
  const CHECK_GAP_MS = 1100; // сервер: gwcheck — не чаще раза в 1 с на соединение
  const JOIN_GAP_MS = 2100; // сервер: gwjoin — не чаще раза в 2 с
  const GIVE_ORIGINS = ["https://chat.eblo.id", "https://ws.chat.eblo.id", "https://ws.rish098.xyz"];
  const KEY_UNVIP = "cpx.give.unvip";
  const VIP_GAP_MS = 1100; // Twitch: 10 VIP за 10 с
  const VIP_WAIT_MS = 15000;
  const UNVIP_TTL = 24 * 3600 * 1000;

  const subs = new Set(); // комнаты, на которые подписаны на ЭТОМ соединении
  const rooms = new Map(); // комната → { g, me, win, ok }
  const silent = new Map(); // комната → таймер «после переподписки gw не пришёл»
  const st = { gsub: 0, gunsub: 0, gw: 0, gwme: 0, gwok: 0, gwwin: 0, checks: 0, joins: 0, vip: 0, unvip: 0, vipFail: 0, queued: 0 };
  let mock = null; // стенд: сокет «подтверждён», кадры копятся

  const verified = () => (mock ? true : !!CPX.ws.verified);
  function send(op, data) {
    if (mock) {
      mock.push(Object.assign({ t: Date.now(), op }, data));
      return true;
    }
    return CPX.ws.send(op, data);
  }

  /* ── разбор кадров ─────────────────────────────────────────────────────── */
  const str = (v, n) => String(v == null ? "" : v).slice(0, n);
  const pick = (v, list, def) => (list.includes(v) ? v : def);
  function cleanView(g) {
    if (!g || typeof g !== "object" || !GID_RE.test(String(g.id || "")) || !ST.has(g.st)) return null;
    const c = g.cond && typeof g.cond === "object" ? g.cond : {};
    const v = {
      id: String(g.id),
      st: g.st,
      word: typeof g.word === "string" ? g.word.replace(/[\p{Cc}\p{Cf}]/gu, "").trim().slice(0, 60) : "",
      any: g.any === true,
      btn: g.btn === true,
      warn: g.warn === true,
      closes: Number.isFinite(+g.closes) && +g.closes > 0 ? Math.floor(+g.closes) : 0,
      cond: {
        subs: pick(c.subs, ["all", "only", "no"], "all"),
        plus: c.plus === true,
        mods: pick(c.mods, ["allow", "deny"], "allow"),
        vips: pick(c.vips, ["allow", "deny"], "allow"),
      },
      cv: Number.isFinite(+g.cv) ? Math.floor(+g.cv) : 0,
    };
    return v;
  }
  const roomOf = (m) => {
    const r = String((m && m.room) || "");
    return ROOM_RE.test(r) ? r : "";
  };
  const gidOf = (m) => {
    const g = String((m && m.g) || "");
    return GID_RE.test(g) ? g : "";
  };
  function slot(room) {
    let s = rooms.get(room);
    if (!s) rooms.set(room, (s = { g: null, me: null, win: null, ok: null }));
    return s;
  }
  function deliver(room, frame) {
    const d = Object.assign({ room }, frame);
    for (const tab of CPX.router.tabs) if (tab.channels && tab.channels.has(room)) CPX.router.toTab(tab, "give.frame", d);
  }

  function onGw(m) {
    const room = roomOf(m);
    const v = room && cleanView(m.g);
    if (!v || (!subs.has(room) && !mock)) return;
    st.gw++;
    clearTimeout(silent.get(room));
    silent.delete(room);
    const s = slot(room);
    // «end» — только для того же розыгрыша: опоздавший конец прошлого не стирает начатый новый (⚠️v2).
    if (v.st === "end" && s.g && s.g.id !== v.id) return;
    s.g = v;
    deliver(room, { kind: "gw", g: v });
  }
  function onMe(m) {
    const room = roomOf(m);
    const gid = gidOf(m);
    if (!room || !gid) return;
    st.gwme++;
    const me = { g: gid, in: m.in === true, why: str(m.why, 160) };
    slot(room).me = me;
    deliver(room, Object.assign({ kind: "gwme" }, me));
  }
  function onOk(m) {
    const room = roomOf(m);
    const gid = gidOf(m);
    if (!room || !gid) return;
    st.gwok++;
    const ok = { g: gid, ok: m.ok === true, why: str(m.why, 160), cv: Number.isFinite(+m.cv) ? Math.floor(+m.cv) : 0 };
    slot(room).ok = ok;
    deliver(room, Object.assign({ kind: "gwok" }, ok));
  }
  function onWin(m) {
    const room = roomOf(m);
    const gid = gidOf(m);
    if (!room || !gid) return;
    st.gwwin++;
    const chan = str(m.chan, 25).toLowerCase();
    const win = { g: gid, chan: LOGIN_RE.test(chan) ? chan : "", k: Number.isFinite(+m.k) ? Math.floor(+m.k) : 1 };
    slot(room).win = win;
    log.info("розыгрыш " + gid + ": победа");
    deliver(room, Object.assign({ kind: "gwwin" }, win));
  }

  /* ── подписки ──────────────────────────────────────────────────────────── */
  function wanted() {
    if (!verified()) return new Set();
    return new Set([...CPX.router.channels().keys()].filter((r) => ROOM_RE.test(r)).slice(0, MAX_ROOMS));
  }
  function sync() {
    const want = wanted();
    for (const room of [...subs]) {
      if (want.has(room)) continue;
      subs.delete(room);
      st.gunsub++;
      send("gunsub", { room });
      clearTimeout(silent.get(room));
      silent.delete(room);
      rooms.delete(room);
    }
    for (const room of want) {
      if (subs.has(room) || !send("gsub", { room })) continue;
      subs.add(room);
      st.gsub++;
      // Нет розыгрыша — сервер молчит; знали прежний (до обрыва) — через SILENT_MS забыть.
      if (rooms.has(room) && rooms.get(room).g) {
        clearTimeout(silent.get(room));
        silent.set(
          room,
          setTimeout(() => {
            silent.delete(room);
            const s = rooms.get(room);
            if (!s || !s.g) return;
            rooms.delete(room);
            deliver(room, { kind: "gone" });
          }, SILENT_MS)
        );
      }
    }
    // Комнаты, которые больше не открыты нигде, — забыть.
    for (const room of [...rooms.keys()]) if (!want.has(room) && !subs.has(room)) rooms.delete(room);
  }
  function onOpen() {
    subs.clear();
    sync();
  }
  function onClose() {
    subs.clear();
  }

  /* ── «подхожу ли я» и «участвую»: пауза сервера на соединение ──────────── */
  const outq = []; // [{op, data, gap}]
  let lastCheck = 0;
  let lastJoin = 0;
  let pumpT = 0;
  function enqueue(op, data) {
    // Тот же вопрос про тот же розыгрыш уже ждёт — не копить.
    const key = op + ":" + data.room + ":" + data.g;
    const i = outq.findIndex((x) => x.key === key);
    if (i >= 0) outq[i].data = data;
    else outq.push({ op, data, key });
    if (outq.length > 20) outq.shift();
    pump();
  }
  function pump() {
    clearTimeout(pumpT);
    pumpT = 0;
    const now = Date.now();
    for (let i = 0; i < outq.length; i++) {
      const x = outq[i];
      const join = x.op === "gwjoin";
      const wait = join ? lastJoin + JOIN_GAP_MS - now : lastCheck + CHECK_GAP_MS - now;
      if (wait > 0) continue;
      outq.splice(i, 1);
      if (join) lastJoin = now;
      else lastCheck = now;
      st[join ? "joins" : "checks"]++;
      send(x.op, x.data);
      i--;
    }
    if (outq.length) {
      const next = Math.min(...outq.map((x) => (x.op === "gwjoin" ? lastJoin + JOIN_GAP_MS : lastCheck + CHECK_GAP_MS) - now));
      pumpT = setTimeout(CPX.guard("giveaway:pump", pump), Math.max(50, next));
    }
  }
  const claims = (b) => ({ sub: !!(b && b.sub), vip: !!(b && b.vip), mod: !!(b && b.mod) });
  function tabRoom(p, ctx) {
    const room = String((p && p.room) || "");
    return ROOM_RE.test(room) && ctx.tab && ctx.tab.channels && ctx.tab.channels.has(room) ? room : "";
  }

  CPX.router.handle(
    "give.state",
    (p, ctx) => {
      const room = tabRoom(p, ctx);
      if (!room) return null;
      const s = rooms.get(room);
      return s ? { g: s.g, me: s.me, win: s.win, ok: s.ok } : { g: null, me: null, win: null, ok: null };
    },
    { page: true }
  );
  CPX.router.handle(
    "give.check",
    (p, ctx) => {
      const room = tabRoom(p, ctx);
      const g = String((p && p.g) || "");
      if (!room || !GID_RE.test(g) || !subs.has(room)) return false;
      enqueue("gwcheck", { room, g, b: claims(p.b) });
      return true;
    },
    { page: true }
  );
  CPX.router.handle(
    "give.join",
    (p, ctx) => {
      const room = tabRoom(p, ctx);
      const g = String((p && p.g) || "");
      if (!room || !GID_RE.test(g) || !verified()) return false;
      enqueue("gwjoin", { room, g, b: claims(p.b) });
      return true;
    },
    { page: true }
  );

  CPX.router.ev.on("channels", () => sync());
  CPX.router.ev.on("tab:channels", () => sync());
  CPX.ws.on("open", CPX.guard("giveaway:open", onOpen));
  CPX.ws.on("close", CPX.guard("giveaway:close", onClose));
  CPX.ws.on("gw", CPX.guard("giveaway:gw", onGw));
  CPX.ws.on("gwme", CPX.guard("giveaway:gwme", onMe));
  CPX.ws.on("gwok", CPX.guard("giveaway:gwok", onOk));
  CPX.ws.on("gwwin", CPX.guard("giveaway:gwwin", onWin));

  /* ── VIP от главного модератора: мост со страницы розыгрыша ────────────── */
  const vipq = []; // [{task, on, channelId, channelLogin, userId, userLogin, done(r)}]
  const vipWait = new Map(); // task → {resolve, timer}
  let vipBusy = false;
  let vipLast = 0;
  let taskN = 0;

  function giveSender(sender) {
    if (!sender || sender.id !== chrome.runtime.id || !sender.tab || sender.frameId !== 0) return false;
    try {
      const u = new URL(String(sender.url || ""));
      return GIVE_ORIGINS.includes(u.origin) && u.pathname.startsWith("/chat/give/");
    } catch (_) {
      return false;
    }
  }
  function cleanVip(m) {
    const channelId = String(m.channelId || "");
    const userId = String(m.userId || "");
    if (!ROOM_RE.test(channelId) || !ROOM_RE.test(userId) || typeof m.on !== "boolean") return null;
    const cl = String(m.channelLogin || "").toLowerCase();
    const ul = String(m.userLogin || "").toLowerCase();
    return { on: m.on, channelId, userId, channelLogin: LOGIN_RE.test(cl) ? cl : "", userLogin: LOGIN_RE.test(ul) ? ul : "" };
  }
  /** Вкладка Twitch для действия: верхний кадр; сначала та, где открыт этот канал. */
  function twitchTab(channelId) {
    const top = [...CPX.router.tabs].filter((t) => t.frameId === 0 && t.port);
    return top.find((t) => t.channels && t.channels.has(channelId)) || top[0] || null;
  }
  function runVip(job) {
    const tab = twitchTab(job.channelId);
    if (!tab) return Promise.resolve(null);
    const task = "v" + ++taskN;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        vipWait.delete(task);
        resolve({ ok: false, error: "вкладка Twitch не ответила — попробуй ещё раз" });
      }, VIP_WAIT_MS);
      vipWait.set(task, { resolve, timer });
      CPX.router.toTab(tab, "give.vip", { task, on: job.on, channelId: job.channelId, userId: job.userId, userLogin: job.userLogin });
    });
  }
  async function vipPump() {
    if (vipBusy || !vipq.length) return;
    vipBusy = true;
    try {
      while (vipq.length) {
        const wait = vipLast + VIP_GAP_MS - Date.now();
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        const job = vipq.shift();
        vipLast = Date.now();
        let r = await runVip(job);
        if (!r) {
          // Вкладки Twitch нет: снятие — доделаем, когда она появится; выдачу — некому.
          if (!job.on) {
            await queueUnvip(job);
            r = { ok: false, error: "открой twitch.tv в этом браузере — VIP снимется, как только вкладка откроется" };
          } else r = { ok: false, error: "открой twitch.tv в этом браузере и войди — VIP выдаётся оттуда" };
        }
        st[job.on ? "vip" : "unvip"]++;
        if (!r.ok) st.vipFail++;
        log.info("VIP", job.on ? "выдать" : "снять", job.userLogin || job.userId, "на", job.channelLogin || job.channelId, "—", r.ok ? "готово" : r.error);
        CPX.safely("giveaway:vip:done", () => job.done(r));
      }
    } finally {
      vipBusy = false;
    }
  }
  function vip(job) {
    return new Promise((resolve) => {
      vipq.push(Object.assign({ done: resolve }, job));
      if (vipq.length > 50) vipq.shift().done({ ok: false, error: "слишком много запросов разом" });
      vipPump();
    });
  }

  CPX.router.handle(
    "give.vipDone",
    (p, ctx) => {
      const w = vipWait.get(String((p && p.task) || ""));
      if (!w || !ctx.tab) return false;
      vipWait.delete(String(p.task));
      clearTimeout(w.timer);
      w.resolve({ ok: p.ok === true, error: p.ok === true ? "" : str(p.error, 160) || "Twitch отказал" });
      return true;
    },
    { page: true }
  );

  // Очередь снятий (вкладки Twitch не было): доделать, когда появится.
  async function queueUnvip(job) {
    const got = await chrome.storage.local.get(KEY_UNVIP).catch(() => ({}));
    const now = Date.now();
    const list = (Array.isArray(got[KEY_UNVIP]) ? got[KEY_UNVIP] : []).filter((x) => x && now - x.at < UNVIP_TTL && !(x.channelId === job.channelId && x.userId === job.userId));
    list.push({ channelId: job.channelId, channelLogin: job.channelLogin, userId: job.userId, userLogin: job.userLogin, at: now });
    st.queued++;
    await chrome.storage.local.set({ [KEY_UNVIP]: list.slice(-50) }).catch(() => {});
  }
  let drainT = 0;
  async function drainUnvip() {
    const got = await chrome.storage.local.get(KEY_UNVIP).catch(() => ({}));
    const now = Date.now();
    const list = (Array.isArray(got[KEY_UNVIP]) ? got[KEY_UNVIP] : []).filter((x) => x && now - x.at < UNVIP_TTL);
    if (!list.length) {
      if (got[KEY_UNVIP]) chrome.storage.local.remove(KEY_UNVIP).catch(() => {});
      return;
    }
    if (!twitchTab("")) return;
    await chrome.storage.local.remove(KEY_UNVIP).catch(() => {});
    for (const x of list) {
      const job = cleanVip(Object.assign({ on: false }, x));
      if (job) vip(job).then((r) => !r.ok && /открой twitch/.test(r.error || "") && queueUnvip(job));
    }
  }
  CPX.router.ev.on("tab:open", () => {
    clearTimeout(drainT);
    drainT = setTimeout(CPX.guard("giveaway:unvip", drainUnvip), 8000); // мир страницы и Twitch должны успеть встать
  });

  chrome.runtime.onMessage.addListener((m, sender, reply) => {
    if (!m || typeof m !== "object" || m.cpxGive !== "vip") return false;
    const job = giveSender(sender) && cleanVip(m);
    if (!job) {
      reply({ ok: false, error: "запрос не принят" });
      return false;
    }
    vip(job).then((r) => {
      try {
        reply(r);
      } catch (_) {
        /* страница уже закрыта — снятие всё равно сделано */
      }
    });
    return true;
  });

  CPX.diag.add("giveaway", () => ({
    verified: verified(),
    subs: [...subs],
    rooms: [...rooms].map(([r, s]) => ({ room: r, g: s.g && s.g.id + ":" + s.g.st, me: s.me && s.me.in, win: !!s.win })),
    outq: outq.length,
    vipq: vipq.length,
    stats: st,
  }));

  const api = {};
  if (CPX.dev)
    api._dev = {
      mock(v) {
        mock = v ? [] : null;
        if (v) onOpen();
        return true;
      },
      frames: () => (mock ? mock.slice() : null),
      open: onOpen,
      inject(m) {
        const fn = { gw: onGw, gwme: onMe, gwok: onOk, gwwin: onWin }[m && m.op];
        if (fn) fn(m);
        return !!fn;
      },
      state: (room) => rooms.get(String(room)) || null,
      sync,
    };
  return api;
})();

// ── src/bg/70_native.js ──
/* Фон: связь с программой Chatterino+ на компьютере — канал, который смотрят на Twitch, открывается во вкладке
 * /watching клиента (как расширение «Chatterino Native Host» у обычного Chatterino). Владелец 11.10: «Эксперименты»,
 * по умолчанию ВЫКЛ (настройка native.watching); разрешение браузера nativeMessaging — необязательное
 * (optional_permissions), его спрашивает страница настроек при включении.
 *
 * ПРОТОКОЛ КЛИЕНТА (Z:\chatterino7-src: src/singletons/NativeMessaging.cpp, src/BrowserExtension.cpp). Хост — сам
 * chatterino.exe: браузер запускает его по манифесту HOST, который клиент прописывает при каждом запуске (в манифесте —
 * id этого расширения). Сообщения — JSON:
 *   {action:"select", type:"twitch", name:<логин>, winId:<строка — id окна браузера>, version:0} — канал в /watching
 *     (winId клиенту обязателен; нужен ему только для «прилипания» окна, которое мы не включаем);
 *   {action:"sync", twitchChannels:[логины]} — держать подключёнными каналы всех открытых вкладок Twitch.
 * Хост выходит сам, если 10 с не было сообщений, — пока связь нужна, раз в PING_MS шлём {action:"ping"} (у клиента —
 * неизвестное действие, только строка в журнале). Ответы хоста — только {type:"status", status:"exiting-host", reason}.
 *
 * КОГДА. Связь держим, пока включено, есть разрешение и открыта хоть одна вкладка Twitch (router.tabs); иначе
 * закрываем (хост выходит). Канал — из адреса АКТИВНОЙ вкладки окна в фокусе: twitch.tv/<логин>, окно чата
 * /popout/<логин>/chat, режим модератора /moderator/<логин>, вкладка плеера player.twitch.tv/?channel=<логин>;
 * служебные адреса (directory, videos, settings…) — нет.
 * Поводы: сменили вкладку, перешли по ссылке внутри Twitch, переключили окно. Не Twitch — /watching не трогаем.
 * Связь оборвалась (обновление программы, нет хоста) — заново на следующем поводе, не чаще раза в RETRY_MS.
 *
 * СОСТОЯНИЕ для страницы настроек: native.status → {state, name, at, error}; при смене — событие "native.status" страницам
 * расширения. state: off | noperm | idle (ещё не знаем, есть ли программа) | ready (программа отвечала, канала сейчас
 * нет — 12.10: раньше на главной Twitch висело «связь начнётся…», даже когда программы нет вовсе; страница настроек теперь
 * сама проверяет связь, native.test) | connected | nohost (программы нет или она старая) | forbidden (программа не знает
 * id этого расширения) | restart (разрешение есть, а у фона нет chrome.runtime.connectNative) | error.
 *
 * RESTART (12.10, задание чата клиента). Chromium собирает chrome.runtime фона при первом обращении и выкидывает из
 * него методы без доступа; выданное позже разрешение фон не видит до перезапуска (кеш объекта на весь контекст). Без
 * этого связь молча не включалась часами. Лечит только новый фон: native.restart — chrome.runtime.reload(), а новый
 * фон снова открывает настройки на «Экспериментах» (REOPEN_KEY). В сборках «Раннего доступа» (tools/build.py --early)
 * разрешение обязательное — там этого не бывает.
 */

(() => {
  const log = CPX.log("native");
  const HOST = "id.eblo.chatterino_plus";
  const PERM = { permissions: ["nativeMessaging"] };
  const PING_MS = 5000;
  const RETRY_MS = 15000;
  const SAME_MS = 1000; // тот же канал повторно — не чаще
  const SYNC_MAX = 900; // байт: очередь клиента — по 1024
  const CLOSE_GRACE_MS = 3000;
  const LOGIN_RE = /^[a-z0-9_]{1,25}$/;
  const REOPEN_KEY = "cpx.native.reopen"; // перезапуск по кнопке: открыть настройки снова (не дольше минуты)
  const nativeApi = () => typeof chrome.runtime.connectNative === "function";
  // Первая часть пути twitch.tv, которая не канал (сверено с адресами Twitch 11.10).
  const NOT_CHANNEL = new Set(
    "directory videos settings subscriptions inventory drops wallet friends messages search downloads jobs p turbo prime store bits products broadcast dashboard u user payments team collections clip clips login signup logout privacy terms activate following annual-recap event events legal security help moderator popout embed".split(
      " "
    )
  );

  const S = { port: null, perm: false, state: "off", error: "", name: "", at: 0, sentAt: 0, failAt: 0, ping: 0, synced: "", hostOk: false };
  // Без связи сейчас: программа уже отвечала — «готова», иначе — «не знаем».
  const waiting = () => (S.hostOk ? "ready" : "idle");

  const want = () => CPX.settings.get("native.watching") === true && S.perm;
  const twitchOpen = () => CPX.router.tabs.size > 0;

  function setState(state, error) {
    if (S.state === state && S.error === (error || "")) return;
    S.state = state;
    S.error = error || "";
    log.debug("связь с программой:", state, error || "");
    CPX.router.toExt("native.status", status());
  }
  const status = () => ({ state: S.state, name: S.name, at: S.at, error: S.error });

  /** Логин канала из адреса вкладки или "" (не страница канала). */
  function channelOf(url) {
    let u;
    try {
      u = new URL(String(url || ""));
    } catch (_) {
      return "";
    }
    if (!/(^|\.)twitch\.tv$/i.test(u.hostname) || /^(api|gql|id|passport|clips)\./i.test(u.hostname)) return "";
    // Отдельная вкладка плеера: player.twitch.tv/?channel=<логин>.
    if (/^player\./i.test(u.hostname)) {
      const ch = String(u.searchParams.get("channel") || "").toLowerCase();
      return LOGIN_RE.test(ch) ? ch : "";
    }
    const parts = u.pathname.split("/").filter(Boolean).map((s) => s.toLowerCase());
    let login = "";
    if (parts.length === 1) login = parts[0];
    else if (parts[0] === "popout" && parts[2] === "chat" && parts.length === 3) login = parts[1];
    else if (parts[0] === "moderator" && parts.length === 2) login = parts[1];
    if (!LOGIN_RE.test(login) || (parts.length === 1 && NOT_CHANNEL.has(login))) return "";
    return login;
  }

  /* ── порт ─────────────────────────────────────────────────────────────────── */

  function disconnect() {
    clearInterval(S.ping);
    S.ping = 0;
    if (!S.port) return;
    const p = S.port;
    S.port = null;
    try {
      p.disconnect();
    } catch (_) {
      /* уже закрыт */
    }
  }

  function connect() {
    if (S.port) return S.port;
    if (!want() || !nativeApi()) return null;
    if (S.failAt && Date.now() - S.failAt < RETRY_MS) return null;
    let p;
    try {
      p = chrome.runtime.connectNative(HOST);
    } catch (e) {
      S.failAt = Date.now();
      setState("error", String((e && e.message) || e));
      return null;
    }
    S.port = p;
    S.synced = "";
    const born = Date.now();
    p.onMessage.addListener((m) => {
      if (m && m.type === "status") log.debug("программа:", m.status, m.reason || "");
    });
    p.onDisconnect.addListener(() => {
      // Причина: Chrome — runtime.lastError, Firefox — port.error.
      const err = p.error || chrome.runtime.lastError;
      const msg = String((err && err.message) || "");
      if (S.port !== p) return; // закрыли сами
      S.port = null;
      clearInterval(S.ping);
      S.ping = 0;
      // Хост вышел сам (обновление программы) — обычное дело: подключимся заново.
      if (/exit/i.test(msg) && Date.now() - born > 3000) {
        setState(want() ? waiting() : "off");
        setTimeout(sync, 2000);
        return;
      }
      S.failAt = Date.now();
      S.hostOk = false;
      // Chrome: «Specified native messaging host not found» / «…is forbidden»; Firefox: «No such native application».
      if (/not found|no such native/i.test(msg)) setState("nohost", msg);
      else if (/forbidden|permission/i.test(msg)) setState("forbidden", msg);
      else setState("error", msg || "disconnected");
    });
    clearInterval(S.ping);
    S.ping = setInterval(() => {
      if (!want() || !twitchOpen()) return sync();
      post({ action: "ping" });
    }, PING_MS);
    // Ошибка «нет хоста» приходит отключением сразу; дошли до сюда без неё — хост запущен.
    setTimeout(() => {
      if (S.port !== p) return;
      S.hostOk = true;
      setState("connected");
    }, 600);
    return p;
  }

  function post(msg) {
    const p = connect();
    if (!p) return false;
    try {
      p.postMessage(msg);
      return true;
    } catch (e) {
      log.debug("не отправлено:", e && e.message);
      return false;
    }
  }

  /* ── что слать ────────────────────────────────────────────────────────────── */

  function select(tab, force) {
    if (!tab || !tab.active || !want()) return;
    const name = channelOf(tab.url);
    if (!name) return;
    const now = Date.now();
    if (!force && name === S.name && now - S.sentAt < SAME_MS) return;
    if (!post({ action: "select", type: "twitch", name, winId: String(tab.windowId), version: 0 })) return;
    S.name = name;
    S.at = now;
    S.sentAt = now;
    sendSync();
    CPX.router.toExt("native.status", status());
  }

  // Каналы всех открытых чатов Twitch — клиенту держать подключёнными (как sync у Chatterino Native Host).
  // Сообщение до клиента идёт его очередью по 1024 байта — длинный список укорачиваем.
  function sendSync() {
    if (!S.port) return;
    const list = [...new Set(CPX.router.channels().values())].filter((l) => LOGIN_RE.test(l)).sort();
    while (list.length && JSON.stringify({ action: "sync", twitchChannels: list }).length > SYNC_MAX) list.pop();
    const sig = list.join(",");
    if (sig === S.synced) return;
    try {
      S.port.postMessage({ action: "sync", twitchChannels: list });
      S.synced = sig;
    } catch (_) {
      /* порт закрылся — заново на следующем поводе */
    }
  }

  /** Привести связь к нужному: выключено или Twitch закрыт — закрыть; иначе канал активной вкладки окна в фокусе. */
  function sync() {
    if (!want()) {
      disconnect();
      return setState(S.perm ? "off" : CPX.settings.get("native.watching") === true ? "noperm" : "off");
    }
    if (!nativeApi()) {
      disconnect();
      return setState("restart");
    }
    const failed = S.state === "nohost" || S.state === "forbidden" || S.state === "error";
    if (!twitchOpen()) {
      disconnect();
      return setState(failed ? S.state : waiting(), failed ? S.error : "");
    }
    if (!S.port && !failed) setState(waiting());
    focusedTab().then((tab) => (tab ? select(tab) : sendSync()), () => {});
  }

  async function focusedTab() {
    const w = await chrome.windows.getLastFocused({ populate: false }).catch(() => null);
    if (!w || w.id == null) return null;
    const [tab] = await chrome.tabs.query({ active: true, windowId: w.id }).catch(() => []);
    return tab || null;
  }

  async function checkPerm() {
    try {
      S.perm = !!(await chrome.permissions.contains(PERM));
    } catch (_) {
      S.perm = false;
    }
  }

  /* ── поводы (слушатели — синхронно при загрузке фона, см. 99_start) ──────── */

  chrome.tabs.onActivated.addListener((info) => {
    if (!want()) return;
    chrome.tabs.get(info.tabId).then((tab) => select(tab), () => {});
  });
  chrome.tabs.onUpdated.addListener((_id, change, tab) => {
    if (change.url && tab && tab.active) select(tab);
  });
  chrome.windows.onFocusChanged.addListener((winId) => {
    if (!want() || winId === chrome.windows.WINDOW_ID_NONE) return;
    chrome.tabs.query({ active: true, windowId: winId }).then(([tab]) => tab && select(tab, true), () => {});
  });
  chrome.permissions.onAdded.addListener(() => checkPerm().then(sync));
  chrome.permissions.onRemoved.addListener(() => checkPerm().then(sync));

  CPX.router.handle("native.status", () => status());
  // Проверить связь сейчас (кнопка в настройках): подключиться, даже если Twitch не открыт, и ответить через 1,5 с.
  CPX.router.handle("native.test", async () => {
    await checkPerm();
    if (!want() || !nativeApi()) {
      sync();
      return status();
    }
    S.failAt = 0;
    if (!S.port) connect();
    await new Promise((r) => setTimeout(r, 1500));
    // Twitch не открыт — связь закрываем (останется «готова» или ошибка), ответ — уже после этого.
    if (!twitchOpen()) sync();
    return status();
  });
  // Перезапустить расширение (состояние restart): новый фон увидит выданное разрешение. Страница настроек закроется
  // вместе с расширением — новый фон откроет её снова (REOPEN_KEY). Вкладки Twitch покажут «обновите страницу».
  CPX.router.handle("native.restart", async () => {
    await chrome.storage.local.set({ [REOPEN_KEY]: Date.now() }).catch(() => {});
    setTimeout(() => chrome.runtime.reload(), 150);
    return true;
  });
  // Окно настроек поверх Twitch разрешение не спросит — открыть настройки вкладкой на «Экспериментах».
  CPX.router.handle("native.openSettings", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("pages/options.html#lab") });
    return true;
  });

  CPX.boot.add(
    "native",
    async () => {
      await checkPerm();
      const r = await chrome.storage.local.get(REOPEN_KEY).catch(() => null);
      if (r && r[REOPEN_KEY]) {
        chrome.storage.local.remove(REOPEN_KEY).catch(() => {});
        if (Date.now() - r[REOPEN_KEY] < 60000) chrome.tabs.create({ url: chrome.runtime.getURL("pages/options.html#lab") });
      }
      CPX.settings.on((applied) => {
        if (!("native.watching" in applied)) return;
        S.failAt = 0;
        checkPerm().then(sync);
      });
      CPX.router.ev.on("tab:open", () => want() && !S.port && sync());
      // Переход по адресу целиком закрывает страницу и тут же открывает новую — не рвать связь в этот миг.
      CPX.router.ev.on("tab:close", () => setTimeout(sync, CLOSE_GRACE_MS));
      CPX.router.ev.on("channels", () => sendSync());
      sync();
    },
    70
  );

  CPX.diag.add("native", () => ({ state: S.state, error: S.error, perm: S.perm, port: !!S.port, name: S.name, api: nativeApi() }));
  if (CPX.dev) CPX.native = { channelOf, status, _s: S };
})();

// ── src/bg/72_eblo.js ──
/* Фон: eblo.id — хостинг картинок, видео и файлов. Общий план с клиентом — Z:\_memstudy\eblo\PLAN.md (§3, §8), сверка с
 * живым API — ADMIN_DIFF.md там же (13.10). Владелец 13.10: карточки постов в чате, окно поста поверх Twitch, загрузка
 * перетаскиванием и Ctrl+V; вход — как у расширений eblo.id.
 *
 * ВХОД (§8.1): chrome.identity.launchWebAuthFlow + PKCE S256 + state → GET /extension/authorize → …/cb?code&state →
 *   POST /api/extension/token {code, code_verifier, redirect_uri} → {token, login, display_name, avatar_url}. Адрес
 *   возврата — identity.getRedirectURL("cb") (у админа зарегистрированы: id магазина Chrome, id сборки с ключом, Firefox
 *   chatterino-plus@eblo.id; dev без ключа войти не сможет — это нормально). Ключ — только storage.local (в Chrome у
 *   хранилища уровень TRUSTED_CONTEXTS — контент-скриптам не видно; в Firefox такого уровня нет: видят и наши
 *   контент-скрипты, но не страница Twitch и не чужие расширения), не в журнал, не странице Twitch. РАЗРЕШЕНИЯ НА САЙТ НЕТ
 *   (владелец 13.10 убрал необязательное https://eblo.id/*): сайт сам пускает расширения к своему API — CORS для адреса
 *   расширения с Authorization и X-Status-Tunnel (просьба к админу 13.10, ADMIN_CORS.md; ✅ включено 13.10, сайт отвечает
 *   настоящими кодами, X-Origin-Status открыт на чтение). Поэтому вход открывается сразу — и с «Подключить», и с
 *   перетаскивания файла. probeCors (один запрос, не дольше PROBE_MS) перед каждым входом: сайт перестал пускать или не
 *   отвечает — reason "site" («eblo.id сейчас не отвечает»), а не окно входа, после которого ключ не получить. Копию
 *   расширения, чей адрес возврата сайт не знает (не магазин, не сборка с ключом, не Firefox), сайт отвергает (400 «Расширение
 *   не подключено»): Chrome тогда сразу роняет окно входа — reason "unknown" с id копии, а не «окно закрыто» (ту же ошибку
 *   Chrome даёт и при сбое сайта — поэтому ещё раз probeCors: сайт не отвечает — "site"). Выход — DELETE /api/extension/token, ключ стираем после любого ответа. Кто
 *   подключён — /api/extension/me (не чаще ME_MS); 401 где угодно — ключ стёрт, «вход истёк» (expired).
 * ДАННЫЕ ПОСТОВ (§8.2): ТОЛЬКО пачкой — GET /api/public/posts?codes= (до 50): одиночный /api/public/post/<код> на 404
 *   теряет CORS у прокси сайта (в браузере — «сетевая ошибка»). Склейка BATCH_MS, дедуп «уже летит»; кэш: есть — 10 мин,
 *   нет (null) — 10 мин, ошибка (сеть — так выглядит и 429; 5xx — у сайта бывают 502/504 после паузы) — 2 мин; потолок
 *   2048. X-Status-Tunnel для /api/public/* НЕ шлём (в браузере включает CORS preflight). Публичный JSON — с CORS «*»:
 *   доступа к сайту для превью не нужно. Странице — только очищенные данные (строки, числа, адреса https://eblo.id/…).
 *   Адрес — в записи браузера (URL): пробелы, кириллица в имени файла — %-коды. Сайт отдаёт «pizda (1).opt.mp4» как есть
 *   — прежняя проверка «без пробелов» выбрасывала такое видео из альбома целиком (владелец 14.10, пост AZjrQ7a). В адресах
 *   загруженных файлов (/uploads/) «#», «?» и одиночный «%» — тоже часть имени: кодируем до разбора (иначе браузер счёл бы
 *   их якорем, запросом или испорченным кодом и попросил бы другой файл).
 * ЗАГРУЗКА (§8.4): файл живёт в ISOLATED-мире вкладки и уходит в невидимую страницу расширения pages/eblo_upload.html
 *   (XHR — ради хода отправки). Одноразовый номер на отправку фон выдаёт ТОЛЬКО ISOLATED-миру: runtime.sendMessage
 *   {cpxIso:"eblo.ticket"} (миру страницы, где и скрипты Twitch, chrome.runtime недоступен); страница отправки гасит
 *   номер (eblo.redeem, только фрейм той же вкладки) до отправки и сообщает созданный пост (eblo.uploaded). «Отменить»
 *   (eblo.cancel, мир страницы) — только свой свежий пост этой вкладки, не дольше UNDO_MS (пачка файлов — от последнего
 *   файла пачки). Вход «по ходу загрузки» (не подключено) зовёт тоже только ISOLATED-мир ({cpxIso:"eblo.connect"}) — окно
 *   входа сразу. {cpxIso:"eblo.prep"} → {on (настройка eblo.upload), connected, maxBytes, exts} — перед
 *   перетаскиванием/вставкой; выключена настройка — номера нет.
 * API (кроме /api/public/*): заголовок X-Status-Tunnel: 1, статус = X-Origin-Status || status, не-JSON тело не разбираем;
 *   credentials: "omit". Ссылки из ответов — только https://eblo.id/…; HTML из ответов никуда не вставляем.
 *
 * Методы роутера:
 *   eblo.status → {connected, expired, login, name, avatar, noDelete} страницам расширения; миру страницы Twitch —
 *   только {connected, expired, noDelete} (кто подключён — не его дело); событие "eblo.status" — так же раздельно;
 *   eblo.login / eblo.logout — страницы расширения; eblo.posts {codes} → {код: пост|null|"err"} (страница); eblo.limits →
 *   {maxBytes, exts} (страница); eblo.redeem {nonce} / eblo.uploaded {nonce, code, url} — страница отправки (ext);
 *   eblo.cancel {code} → {ok, reason} (страница).
 */

CPX.eblo = (() => {
  const log = CPX.log("eblo");
  const BASE = "https://eblo.id";
  const AUTH_KEY = "cpx.eblo.auth";
  const DEV_BASE_KEY = "cpx.eblo.devBase"; // только dev-сборка: макет сбоев (Z:\_memstudy\eblo\mock)
  const CODE_RE = /^[A-Za-z0-9]{7}$/;
  const RESERVED = new Set(["privacy", "consent", "profile"]); // страницы сайта той же длины (ответ админа 13.10)
  const TWITCH_URL = /^https:\/\/([a-z0-9-]+\.)*twitch\.tv\//i;
  const BATCH_MS = 300;
  const BATCH_MAX = 50;
  const OK_TTL = 10 * 60000;
  const ERR_TTL = 2 * 60000;
  const CACHE_MAX = 2048;
  const ME_MS = 10 * 60000;
  const LIMITS_MS = 6 * 3600000;
  const TICKET_MS = 2 * 60000;
  const UNDO_MS = 15000; // «Отменить» видно 10 с (§6.5) — запас на сеть
  // Защита сайта от шторма (проверка перед 2.0.0: спам случайными ссылками eblo.id в людном чате): ждут отправки не больше
  // QUEUE_MAX кодов, пачек — не больше BATCHES_PER_MIN в минуту, после неудачной пачки (429/5xx/сеть) — общая пауза,
  // растёт вдвое до PAUSE_MAX. Лишнее и всё на паузе — сразу «ошибка» без кэша: страница повторит сама, если строка видна.
  const QUEUE_MAX = 200;
  const BATCHES_PER_MIN = 20;
  const PAUSE_MIN = 30000;
  const PAUSE_MAX = 5 * 60000;
  const PROBE_MS = 8000;
  const TYPES = new Set(["image", "gif", "video", "audio", "file", "album"]);
  const DEF_LIMITS = {
    maxBytes: 209715200,
    exts: "jpg jpeg png gif bmp webp mp4 webm ogg mov avi mkv mp3 wav flac aac m4a opus pdf txt json zip rar 7z docx xlsx pptx odt ods odp csv md xml yaml yml log ini conf cfg gz tar".split(" "),
  };

  let base = BASE;
  let auth = null; // {token, login, name, avatar, noDelete}
  let cors = false; // сайт пускает расширения к своему API (последний probeCors; для диагностики)
  let expired = false;
  let meAt = 0;
  let loginBusy = null;

  /* ── запросы ─────────────────────────────────────────────────────────────── */
  /** {status, data} — data только из JSON; status 0 — сеть/таймаут. */
  async function api(path, o) {
    o = o || {};
    const headers = {};
    if (!o.public) headers["X-Status-Tunnel"] = "1";
    if (o.token) headers.Authorization = "Bearer " + o.token;
    if (o.json !== undefined) headers["Content-Type"] = "application/json";
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), o.timeout || 15000);
    try {
      const res = await fetch(base + path, {
        method: o.method || "GET",
        headers,
        body: o.json !== undefined ? JSON.stringify(o.json) : undefined,
        credentials: "omit",
        signal: ctl.signal,
      });
      const status = Number(res.headers.get("X-Origin-Status")) || res.status;
      let data = null;
      if (/json/i.test(res.headers.get("content-type") || "")) data = await res.json().catch(() => null);
      return { status, data };
    } catch (_) {
      return { status: 0, data: null };
    } finally {
      clearTimeout(t);
    }
  }

  /* ── очистка данных для страницы ─────────────────────────────────────────── */
  const url = (v) => {
    if (typeof v !== "string" || v.length > 1000) return "";
    if (v.startsWith(BASE + "/uploads/")) v = v.replace(/#/g, "%23").replace(/\?/g, "%3F").replace(/%(?![0-9A-Fa-f]{2})/g, "%25");
    let u;
    try {
      u = new URL(v);
    } catch (_) {
      return "";
    }
    if (u.protocol !== "https:" || u.host !== "eblo.id" || u.username || u.password) return "";
    const h = u.href.replace(/'/g, "%27"); // " < > и пробел URL кодирует сам, \ становится /
    return h.length < 2048 ? h : "";
  };
  // Аватар автора: eblo.id отдаёт и свой адрес, и картинку с сервера Twitch (static-cdn.jtvnw.net) — её тоже берём.
  const avatarUrl = (v) => {
    if (typeof v === "string" && /^https:\/\/static-cdn\.jtvnw\.net\/[^\s"'<>\\]*$/.test(v) && v.length < 800) return v;
    return url(v);
  };
  const str = (v, n) => (typeof v === "string" ? v.slice(0, n) : "");
  const uint = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : 0);
  function clean(code, p) {
    if (!p || typeof p !== "object") return null;
    const media = (Array.isArray(p.media) ? p.media : [])
      .slice(0, 50)
      .filter((m) => m && typeof m === "object")
      .map((m) => ({
        kind: TYPES.has(m.kind) && m.kind !== "album" ? m.kind : "file",
        url: url(m.url),
        mime: str(m.mime, 100),
        name: str(m.name, 200),
        size: uint(m.size),
        thumb: url(m.thumb),
      }));
    const a = p.author && typeof p.author === "object" ? p.author : null;
    const login = a && /^[A-Za-z0-9_]{1,25}$/.test(a.login || "") ? String(a.login).toLowerCase() : "";
    const st = p.stats && typeof p.stats === "object" ? p.stats : {};
    const score = Number(st.score);
    return {
      code,
      url: url(p.url) || BASE + "/" + code,
      type: TYPES.has(p.type) ? p.type : "file",
      title: str(p.title, 300),
      description: str(p.description, 5000),
      createdAt: uint(p.created_at),
      author: a && (login || a.display_name) ? { login, name: str(a.display_name, 60) || login, avatar: avatarUrl(a.avatar_url) } : null,
      blur: p.blur === true,
      stats: { views: uint(st.views), score: Number.isFinite(score) ? Math.trunc(score) : 0, comments: uint(st.comments) },
      thumb: url(p.thumb),
      media,
      mediaCount: uint(p.media_count) || media.length,
    };
  }

  /* ── данные постов: пачки и кэш ─────────────────────────────────────────── */
  const cache = new Map(); // код → {at, ttl, v: пост | null | "err"}
  const waiting = new Map(); // код → [resolve] — ещё не отправлено
  const flying = new Map(); // код → Promise — в запросе
  let batchT = 0;
  let pauseUntil = 0;
  let pauseMs = 0;
  const sentAt = []; // время отправки пачек за последнюю минуту
  const pstats = { asked: 0, hit: 0, batches: 0, errors: 0, dropped: 0 };

  function cached(code) {
    const c = cache.get(code);
    if (!c) return undefined;
    if (Date.now() - c.at > c.ttl) {
      cache.delete(code);
      return undefined;
    }
    return c.v;
  }
  function put(code, v) {
    cache.delete(code);
    cache.set(code, { at: Date.now(), ttl: v === "err" ? ERR_TTL : OK_TTL, v });
    while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  }
  function one(code) {
    const c = cached(code);
    if (c !== undefined) {
      pstats.hit++;
      return Promise.resolve(c);
    }
    if (flying.has(code)) return flying.get(code);
    if (Date.now() < pauseUntil || waiting.size >= QUEUE_MAX) {
      pstats.dropped++;
      return Promise.resolve("err");
    }
    const p = new Promise((resolve) => {
      if (!waiting.has(code)) waiting.set(code, []);
      waiting.get(code).push(resolve);
    });
    flying.set(code, p);
    if (!batchT) batchT = setTimeout(flush, BATCH_MS);
    return p;
  }
  async function flush() {
    batchT = 0;
    if (!waiting.size) return;
    const now = Date.now();
    while (sentAt.length && now - sentAt[0] > 60000) sentAt.shift();
    if (now < pauseUntil || sentAt.length >= BATCHES_PER_MIN) {
      // Пауза после сбоя или потолок пачек: ждущим — «ошибка» без кэша.
      for (const [code, fns] of waiting) {
        flying.delete(code);
        for (const fn of fns) fn("err");
      }
      pstats.dropped += waiting.size;
      waiting.clear();
      return;
    }
    sentAt.push(now);
    const codes = [...waiting.keys()].slice(0, BATCH_MAX);
    const res = new Map(codes.map((c) => [c, waiting.get(c)]));
    for (const c of codes) waiting.delete(c);
    if (waiting.size) batchT = setTimeout(flush, BATCH_MS);
    pstats.batches++;
    const r = await api("/api/public/posts?codes=" + codes.join(","), { public: true, timeout: 12000 });
    const posts = r.status === 200 && r.data && r.data.posts && typeof r.data.posts === "object" ? r.data.posts : null;
    if (!posts) {
      pstats.errors++;
      pauseMs = Math.min(PAUSE_MAX, pauseMs ? pauseMs * 2 : PAUSE_MIN);
      pauseUntil = Date.now() + pauseMs;
    } else pauseMs = 0;
    for (const [code, fns] of res) {
      let v = "err";
      if (posts) v = posts[code] === null ? null : posts[code] && typeof posts[code] === "object" ? clean(code, posts[code]) || "err" : "err";
      put(code, v);
      flying.delete(code);
      for (const fn of fns) fn(v);
    }
  }
  async function getPosts(codes) {
    const list = [...new Set((Array.isArray(codes) ? codes.slice(0, BATCH_MAX) : []).map(String))].filter((c) => CODE_RE.test(c) && !RESERVED.has(c));
    pstats.asked += list.length;
    const out = {};
    await Promise.all(list.map((c) => one(c).then((v) => (out[c] = v))));
    return out;
  }

  /* ── ограничения загрузки ────────────────────────────────────────────────── */
  let limits = { maxBytes: DEF_LIMITS.maxBytes, exts: DEF_LIMITS.exts, at: 0 };
  async function getLimits() {
    if (Date.now() - limits.at < LIMITS_MS) return limits;
    limits.at = Date.now() - LIMITS_MS + 10 * 60000; // сбой — повтор не раньше чем через 10 мин
    const r = await api("/api/public/upload-limits", { public: true });
    const d = r.status === 200 && r.data;
    if (d && Number(d.max_bytes) > 0 && Array.isArray(d.extensions)) {
      const exts = d.extensions.map((x) => String(x).toLowerCase()).filter((x) => /^[a-z0-9]{1,8}$/.test(x)).slice(0, 200);
      if (exts.length) limits = { maxBytes: Math.floor(Number(d.max_bytes)), exts, at: Date.now() };
    }
    return limits;
  }

  /* ── вход ────────────────────────────────────────────────────────────────── */
  const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const rnd = (n) => b64url(crypto.getRandomValues(new Uint8Array(n)));
  const validAuth = (a) => !!(a && typeof a.token === "string" && /^\S{10,400}$/.test(a.token));

  function status() {
    return { connected: !!auth, expired: !auth && expired, login: auth ? auth.login : "", name: auth ? auth.name : "", avatar: auth ? auth.avatar : "", noDelete: !!(auth && auth.noDelete) };
  }
  const pageStatus = () => ({ connected: !!auth, expired: !auth && expired, noDelete: !!(auth && auth.noDelete) });
  const emit = () => {
    CPX.router.toExt("eblo.status", status());
    CPX.router.toTabs("eblo.status", pageStatus());
  };
  // Готовность модуля (ключ прочитан): запросы, пришедшие в первые мгновения жизни фона, ждут её — иначе
  // «не подключено» у подключённого человека открыло бы ему окно входа.
  let readyFn;
  const ready = new Promise((r) => (readyFn = r));

  async function save() {
    if (auth) await chrome.storage.local.set({ [AUTH_KEY]: auth });
    else await chrome.storage.local.remove(AUTH_KEY);
  }
  function who(d) {
    const login = d && /^[A-Za-z0-9_]{1,25}$/.test(d.login || "") ? String(d.login).toLowerCase() : "";
    return { login, name: str(d && d.display_name, 60) || login, avatar: url(d && d.avatar_url) };
  }
  /** Ключ недействителен (401 где угодно) — стереть, «вход истёк». */
  async function dropAuth() {
    if (!auth) return;
    auth = null;
    expired = true;
    await save();
    emit();
  }
  /** Пускает ли eblo.id расширения к API: запрос с теми же заголовками, что у настоящих (тот же предварительный запрос
   *  CORS). Ответ дошёл (любой код — тут 401) — пускает; CORS нет, сайт лежит или молчит дольше PROBE_MS — нет. Макет
   *  (dev) — да. */
  async function probeCors() {
    if (base !== BASE) return true;
    const ctl = new AbortController();
    const tm = setTimeout(() => ctl.abort(), PROBE_MS);
    try {
      await fetch(BASE + "/api/extension/me", { headers: { "X-Status-Tunnel": "1", Authorization: "Bearer -" }, credentials: "omit", cache: "no-store", signal: ctl.signal });
      cors = true;
    } catch (_) {
      cors = false;
    }
    clearTimeout(tm);
    return cors;
  }

  function browserLabel() {
    const ua = navigator.userAgent || "";
    if (/Firefox\//.test(ua)) return "Firefox";
    if (/Edg\//.test(ua)) return "Edge";
    if (/YaBrowser\//.test(ua)) return "Yandex";
    if (/OPR\//.test(ua)) return "Opera";
    return "Chrome";
  }

  /** Окно входа eblo.id → ключ. {ok} / {ok:false, reason: "site"|"identity"|"unknown"|"closed"|"denied"|"state"|"token"|"busy"}. */
  async function login() {
    if (loginBusy) return loginBusy;
    loginBusy = (async () => {
      if (!(await probeCors())) return { ok: false, reason: "site" };
      if (!chrome.identity || typeof chrome.identity.launchWebAuthFlow !== "function") return { ok: false, reason: "identity" };
      const verifier = rnd(32);
      const challenge = b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
      const state = rnd(16);
      const redirect = chrome.identity.getRedirectURL("cb");
      const u = new URL(base + "/extension/authorize");
      u.searchParams.set("redirect_uri", redirect);
      u.searchParams.set("state", state);
      u.searchParams.set("code_challenge", challenge);
      u.searchParams.set("code_challenge_method", "S256");
      u.searchParams.set("name", "Chatterino+");
      u.searchParams.set("label", browserLabel());
      let back = "";
      try {
        back = await chrome.identity.launchWebAuthFlow({ url: u.href, interactive: true });
      } catch (e) {
        const m = String((e && e.message) || "");
        log.debug("окно входа не дало ответа:", m);
        // Chrome: страница входа не загрузилась — у eblo.id это 400 «Расширение не подключено» (адрес возврата этой копии
        // не зарегистрирован); та же ошибка — при сбое сайта: тогда «не отвечает». Закрытое человеком окно — «did not approve».
        if (/could not be loaded/i.test(m)) return (await probeCors()) ? { ok: false, reason: "unknown", id: chrome.runtime.id } : { ok: false, reason: "site" };
        return { ok: false, reason: "closed" };
      }
      let ru;
      try {
        ru = new URL(String(back || ""));
      } catch (_) {
        return { ok: false, reason: "state" };
      }
      if (ru.searchParams.get("state") !== state) return { ok: false, reason: "state" };
      if (ru.searchParams.get("error")) return { ok: false, reason: "denied" };
      const code = ru.searchParams.get("code");
      if (!code) return { ok: false, reason: "state" };
      const r = await api("/api/extension/token", { method: "POST", json: { code, code_verifier: verifier, redirect_uri: redirect } });
      const d = r.data;
      if (r.status !== 200 || !d || !validAuth({ token: d.token })) return { ok: false, reason: "token", status: r.status };
      auth = Object.assign({ token: d.token, noDelete: false }, who(d));
      expired = false;
      meAt = Date.now();
      await save();
      emit();
      if (!auth.login) refreshMe(true);
      return { ok: true };
    })();
    try {
      return await loginBusy;
    } finally {
      loginBusy = null;
    }
  }

  async function logout() {
    const a = auth;
    auth = null;
    expired = false;
    await save();
    emit();
    if (a) await api("/api/extension/token", { method: "DELETE", token: a.token, timeout: 8000 });
    return status();
  }

  /** Кто подключён — /api/extension/me (не чаще ME_MS, force — сейчас). */
  async function refreshMe(force) {
    if (!auth || (!force && Date.now() - meAt < ME_MS)) return;
    meAt = Date.now();
    const token = auth.token;
    const r = await api("/api/extension/me", { token });
    if (!auth || auth.token !== token) return;
    if (r.status === 401) return dropAuth();
    if (r.status === 200 && r.data) {
      const w = who(r.data);
      if (w.login && (w.login !== auth.login || w.name !== auth.name || w.avatar !== auth.avatar)) {
        Object.assign(auth, w);
        await save();
        emit();
      }
    }
  }

  /* ── загрузка: одноразовые номера, свежие посты, «Отменить» ───────────────── */
  const tickets = new Map(); // номер → {at, tabId}
  const redeemed = new Map(); // номер → {at, tabId} — погашенные (для eblo.uploaded)
  const recent = new Map(); // код поста → {at, tabId}
  function prune(map, ms) {
    const now = Date.now();
    for (const [k, v] of map) if (now - v.at > ms) map.delete(k);
  }

  /** Вход «по ходу загрузки» (зовёт ISOLATED-мир): подключено — дальше; нет — окно входа сразу. */
  async function connectForUpload() {
    if (auth) return { ok: true };
    return login();
  }

  /** Пачка файлов (номер пачки — от ISOLATED-мира, свой у вкладки): «Отменить» после последнего файла — для всей пачки,
   *  срок UNDO_MS — от последнего события ЭТОЙ пачки (прежние посты вкладки не продлеваются). */
  function touchRecent(tabId, batch) {
    prune(recent, UNDO_MS);
    const now = Date.now();
    for (const v of recent.values()) if (v.tabId === tabId && v.batch === batch) v.at = now;
  }

  // Только ISOLATED-мир вкладки Twitch (миру страницы chrome.runtime недоступен): номер на отправку и вход по ходу.
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || typeof msg.cpxIso !== "string" || sender.id !== chrome.runtime.id) return false;
    if (typeof sender.url !== "string" || !TWITCH_URL.test(sender.url) || !sender.tab) return false;
    if (!/^eblo\.(prep|ticket|connect|touch)$/.test(msg.cpxIso)) return false;
    ready.then(() => onIso(msg, sender, sendResponse)).catch(() => sendResponse(null));
    return true;
  });
  function onIso(msg, sender, sendResponse) {
    // Перед перетаскиванием/вставкой (iso/20_eblo_upload.js): включена ли загрузка, подключено ли, ограничения сайта.
    // Отвечаем сразу тем, что есть (до первого ответа сайта — запасной список): ISOLATED решает «брать ли файл» прямо в
    // обработчике события, а запрос лимитов к сайту бывает долгим (до 15 с) — всё это время браузер открывал бы файл сам.
    if (msg.cpxIso === "eblo.prep") {
      getLimits().catch(() => {});
      sendResponse({ on: CPX.settings.get("eblo.upload") !== false, connected: !!auth, maxBytes: limits.maxBytes, exts: limits.exts.slice() });
      return false;
    }
    if (msg.cpxIso === "eblo.ticket") {
      if (CPX.settings.get("eblo.upload") === false) {
        sendResponse({ ok: false, reason: "off" });
        return false;
      }
      if (!auth) {
        sendResponse({ ok: false, reason: "auth" });
        return false;
      }
      prune(tickets, TICKET_MS);
      if (tickets.size > 50) {
        sendResponse({ ok: false, reason: "busy" });
        return false;
      }
      const nonce = rnd(24);
      tickets.set(nonce, { at: Date.now(), tabId: sender.tab.id, batch: Number(msg.batch) || 0 });
      sendResponse({ ok: true, nonce });
      return false;
    }
    // Пачка кончилась (последний файл — с любым итогом): «Отменить» её постов — UNDO_MS с этого момента.
    if (msg.cpxIso === "eblo.touch") {
      touchRecent(sender.tab.id, Number(msg.batch) || 0);
      sendResponse(true);
      return false;
    }
    if (msg.cpxIso === "eblo.connect") {
      connectForUpload().then(sendResponse, () => sendResponse({ ok: false, reason: "error" }));
      return true;
    }
    sendResponse(null);
    return false;
  }

  /* ── методы ──────────────────────────────────────────────────────────────── */
  CPX.router.handle(
    "eblo.status",
    async (p, ctx) => {
      await ready;
      refreshMe(false);
      return ctx && ctx.from === "page" ? pageStatus() : status();
    },
    { page: true }
  );
  CPX.router.handle("eblo.login", () => login());
  CPX.router.handle("eblo.logout", () => logout());
  CPX.router.handle("eblo.posts", (p) => getPosts(p.codes), { page: true });
  CPX.router.handle(
    "eblo.limits",
    async () => {
      const l = await getLimits();
      return { maxBytes: l.maxBytes, exts: l.exts.slice() };
    },
    { page: true }
  );
  // Страница отправки (страница расширения во фрейме): погасить номер до отправки.
  CPX.router.handle("eblo.redeem", async (p, ctx) => {
    await ready;
    prune(tickets, TICKET_MS);
    const n = String(p.nonce || "");
    const t = tickets.get(n);
    tickets.delete(n);
    // Номер гасит только фрейм той же вкладки, которой он выдан.
    const tab = ctx && ctx.sender && ctx.sender.tab;
    if (!t || !auth || (tab && tab.id !== t.tabId)) throw Object.assign(new Error("номер не выдавался"), { code: "forbidden", quiet: true });
    prune(redeemed, 30 * 60000);
    redeemed.set(n, t);
    touchRecent(t.tabId, t.batch);
    return { ok: true };
  });
  // Страница отправки: пост создан — «Отменить» (eblo.cancel) можно в этой вкладке UNDO_MS.
  CPX.router.handle("eblo.uploaded", (p) => {
    const t = redeemed.get(String(p.nonce || ""));
    const code = String(p.code || "");
    if (!t || !CODE_RE.test(code)) return false;
    touchRecent(t.tabId, t.batch);
    recent.set(code, { at: Date.now(), tabId: t.tabId, batch: t.batch });
    return true;
  });
  // Страница отправки: ответ 401 — ключ стереть.
  CPX.router.handle("eblo.unauthorized", () => dropAuth());
  /** Удалить свой свежий пост. Из recent убираем только после ответа сайта «удалён» (сбой сети — можно повторить). */
  async function del(code) {
    if (!auth) return { ok: false, reason: "auth" };
    const res = await api("/api/delete/" + code, { method: "DELETE", token: auth.token });
    if (res.status === 200 || res.status === 404) {
      recent.delete(code);
      return { ok: true };
    }
    if (res.status === 401) {
      await dropAuth();
      return { ok: false, reason: "auth" };
    }
    if (res.status === 403 && res.data && res.data.error === "insufficient_scope") {
      if (auth) {
        auth.noDelete = true;
        await save();
        emit();
      }
      return { ok: false, reason: "scope" };
    }
    if (res.status === 409) return { ok: false, reason: "album" };
    if (res.status === 403) return { ok: false, reason: "forbidden" };
    return { ok: false, reason: "error" };
  }
  // {code} → {ok, reason}; {codes:[…]} (пачка) → {ok, results: {код: {ok, reason}}}. Срок проверяем ОДИН раз, в момент
  // нажатия, и удаляем разом (проверка перед 2.0.0: по одному — конец пачки на медленном сайте опаздывал).
  CPX.router.handle(
    "eblo.cancel",
    async (p, ctx) => {
      await ready;
      const many = Array.isArray(p.codes);
      const list = [...new Set((many ? p.codes.slice(0, 20) : [p.code]).map((c) => String(c || "")))];
      const now = Date.now();
      const results = {};
      await Promise.all(
        list.map(async (code) => {
          const r = recent.get(code);
          results[code] = !r || !ctx.tab || r.tabId !== ctx.tab.tabId || now - r.at > UNDO_MS ? { ok: false, reason: "late" } : await del(code);
        })
      );
      if (!many) return results[list[0]];
      return { ok: list.every((c) => results[c].ok), results };
    },
    { page: true }
  );

  CPX.boot.add(
    "eblo",
    async () => {
      if (CPX.dev) {
        const devBase = (v) => (typeof v === "string" && /^http:\/\/127\.0\.0\.1:\d{2,5}$/.test(v) ? v : BASE);
        const r = await chrome.storage.local.get(DEV_BASE_KEY).catch(() => ({}));
        base = devBase(r && r[DEV_BASE_KEY]);
        // Стенд: смену адреса подхватываем и без перезапуска фона (Firefox со стенда фон не перезапустить).
        chrome.storage.onChanged.addListener((ch, area) => area === "local" && ch[DEV_BASE_KEY] && (base = devBase(ch[DEV_BASE_KEY].newValue)));
      }
      const r = await chrome.storage.local.get(AUTH_KEY).catch(() => ({}));
      auth = r && validAuth(r[AUTH_KEY]) ? r[AUTH_KEY] : null;
      readyFn();
      emit();
    },
    72
  );
  // Модуль не поднялся (сбой хранилища) — не держать запросы вечно: через 10 с отвечаем как есть.
  setTimeout(() => readyFn(), 10000);

  CPX.diag.add("eblo", () => ({ base, connected: !!auth, expired, login: auth ? auth.login : "", cache: cache.size, tickets: tickets.size, recent: recent.size, cors, paused: Math.max(0, pauseUntil - Date.now()), posts: Object.assign({}, pstats) }));
  const api_ = { status, getPosts };
  // Стенд (dev): посты-образцы прямо в кэш — карточки и окно всех видов без сайта.
  if (CPX.dev) api_._dev = { put: (code, p) => put(code, p === null ? null : clean(code, p) || "err"), clean, setBase: (b) => (base = b || BASE) };
  return api_;
})();

// ── src/bg/99_start.js ──
/* Фон: запуск. Последний файл бандла bg.js.
 *
 * ⚠️Обработчики событий chrome.* регистрируются синхронно при загрузке воркера
 * (иначе проснувшийся по событию воркер его пропустит) — поэтому все модули фона
 * вешают слушателей сразу при склейке, а здесь только асинхронный запуск.
 */

chrome.runtime.onInstalled.addListener(
  CPX.guard("onInstalled", async (details) => {
    await CPX.settings.load();
    if (details.reason === "install" && !CPX.settings.get("general.consent")) {
      chrome.tabs.create({ url: chrome.runtime.getURL("pages/welcome.html") });
    }
  })
);

// Хранилище (там пропуск входа и ключ продления) — только доверенным контекстам: контент-скриптам
// оно не нужно (ISOLATED-мир его не трогает). Защита в глубину (ревью 01.10); нет поддержки — молча.
try {
  if (chrome.storage.local.setAccessLevel) chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" }).catch(() => {});
} catch (_) {
  /* браузер не умеет */
}

// Настройки не прочитались (сбой хранилища браузера) — пробуем ещё несколько раз, а не остаёмся незапущенными до
// перезапуска фона (владелец 02.11).
(function start(n) {
  CPX.settings.load().then(
    () => CPX.boot.run(),
    (e) => {
      CPX.log("start").warn("настройки не прочитались (попытка " + (n + 1) + "):", e && e.message);
      if (n < 5) setTimeout(() => start(n + 1), 2000 * (n + 1));
    }
  );
})(0);

if (CPX.dev) {
  // Только для стенда проверки: доступ к фону из CDP.
  self.__CPX__ = CPX;
}
})();

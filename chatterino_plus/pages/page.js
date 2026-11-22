/* Chatterino+ 2.4.0 — page. Собрано tools/build.py из src/; читаемый исходник, без минификации. */
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
CPX.world = "page";
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

// ── src/pages/10_ext.js ──
/* Страницы расширения (popup, настройки, согласие): связь с фоном и общий запуск.
 *
 *   CPX.ext.call(метод, параметры) → Promise
 *   CPX.ext.on(событие, fn)        — события фона (порт "cpx-ext")
 * Каждая страница объявляет себя <body data-page="popup|options|welcome"> и
 * регистрирует запуск: CPX.pages.add("options", fn).
 *
 * «Мозаика» (задание §10): CPX.pages.mz(узел) — классы вида → классы поверхностей (styles/_mosaic.css):
 * .btn — k1 raised / k21 acc (btn-accent) / ghost / bads (btn-danger); .card, .set-card — well k2; .chip —
 * raised k1; .plus-mark, .never — k1 со своей кромкой; .error — bad k1; .avatar — форма k1. Разметка HTML
 * размечается при запуске, создаваемая кодом — тем же помощником (20_pages.js: el). Там же лист согласия —
 * окно с выбоинами (CPX.mzj). Логотип страниц — значок расширения (icons/*.png, решение владельца 04.10).
 * Своя простая подсказка (на страницах нет CPX.ui.tip): [data-pg-tip="текст"] — плашка tip k1 с
 * хвостиком-лесенкой над элементом (или под ним, если сверху тесно), появление маской (CPX.mz).
 */

CPX.ext = (() => {
  const ev = new CPX.Emitter();
  let port = null;

  let everUp = false;
  function connect() {
    port = chrome.runtime.connect({ name: "cpx-ext" });
    port.onMessage.addListener((m) => m && m.t === "evt" && ev.emit(m.e, m.d));
    port.onDisconnect.addListener(() => {
      void chrome.runtime.lastError;
      port = null;
      setTimeout(connect, 500);
    });
    // Фон засыпал и проснулся заново — события могли потеряться: пусть страница перечитает.
    if (everUp) setTimeout(() => ev.emit("ext:reconnect"), 100);
    everUp = true;
  }
  connect();

  function call(m, p) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ cpxCall: 1, m, p: p == null ? null : p }, (res) => {
        const err = chrome.runtime.lastError;
        if (err) return reject(new Error(err.message));
        if (!res) return reject(new Error("нет ответа фона"));
        if (res.ok) resolve(res.r);
        else reject(Object.assign(new Error(res.e), { code: res.code }));
      });
    });
  }

  return { call, on: (e, fn) => ev.on(e, fn) };
})();

CPX.pages = (() => {
  const inits = new Map();
  const tone = (c) =>
    c.contains("btn-accent") ? "cpx-k21 cpx-t-acc" : c.contains("btn-ghost") ? "cpx-k1 cpx-t-ghost" : c.contains("btn-danger") ? "cpx-k1 cpx-t-bads" : "cpx-k1 cpx-t-raised";
  function mz(n) {
    const c = n && n.classList;
    if (!c || c.contains("cpx-mz")) return n;
    let add = "";
    if (c.contains("btn")) add = "cpx-mz cpx-mzb " + tone(c);
    else if ((c.contains("card") && !c.contains("card-flat") && !c.contains("sheet")) || c.contains("set-card")) add = "cpx-mz cpx-k2 cpx-t-well";
    else if (c.contains("chip")) add = "cpx-mz cpx-k1 cpx-t-raised";
    else if (c.contains("plus-mark") || c.contains("never")) add = "cpx-mz cpx-k1";
    else if (c.contains("error")) add = "cpx-mz cpx-k1 cpx-t-bad";
    else if (c.contains("avatar")) add = "cpx-k1";
    if (add) c.add(...add.split(" "));
    return n;
  }
  /** Окно с выбоинами (лист согласия, оболочка настроек): тон panel, форма CPX.mzj. */
  function shell(n, kind, body) {
    n.classList.add("cpx-mz", "cpx-t-panel");
    CPX.mzj.attach(n, { kind, bites: 0.07, body: body || null });
  }
  /* ── простая подсказка страниц ── */
  const TIP = { box: null, text: null, anchor: null, timer: 0, shown: false };
  function tipShow(a) {
    clearTimeout(TIP.timer);
    TIP.anchor = a;
    TIP.timer = setTimeout(() => {
      if (TIP.anchor !== a || !a.isConnected) return;
      if (!TIP.box) {
        TIP.text = CPX.el("span");
        TIP.box = CPX.el("div", { class: "pg-tip cpx-mz cpx-k1 cpx-t-tip", role: "tooltip" }, [
          TIP.text,
          CPX.el("i", { class: "cpx-mz-tail", "aria-hidden": "true" }),
        ]);
        document.body.appendChild(TIP.box);
      }
      const b = TIP.box;
      TIP.text.textContent = a.dataset.pgTip || "";
      b.hidden = false;
      const r = a.getBoundingClientRect();
      const w = b.offsetWidth;
      const h = b.offsetHeight;
      const vw = document.documentElement.clientWidth;
      const left = Math.round(Math.max(6, Math.min(vw - w - 6, r.left + r.width / 2 - w / 2)));
      const up = r.top - h - 10 >= 4;
      b.dataset.side = up ? "top" : "bottom";
      b.style.left = left + "px";
      b.style.top = Math.round(up ? r.top - h - 8 : r.bottom + 8) + "px";
      b.style.setProperty("--tail-x", Math.round(Math.max(6, Math.min(w - 18, r.left + r.width / 2 - left - 6))) + "px");
      if (!TIP.shown) CPX.mz.in(b);
      TIP.shown = true;
    }, TIP.shown ? 0 : 250);
  }
  function tipHide() {
    clearTimeout(TIP.timer);
    TIP.anchor = null;
    if (!TIP.box || !TIP.shown) return;
    TIP.shown = false;
    const b = TIP.box;
    CPX.mz.out(b, () => !TIP.shown && (b.hidden = true));
  }
  const tipOf = (t) => (t && t.closest ? t.closest("[data-pg-tip]") : null);
  document.addEventListener("mouseover", (e) => {
    const a = tipOf(e.target);
    if (a && a !== TIP.anchor) tipShow(a);
    else if (!a && TIP.anchor) tipHide();
  });
  document.addEventListener("focusin", (e) => {
    const a = tipOf(e.target);
    if (a && a.matches(":focus-visible")) tipShow(a);
  });
  document.addEventListener("focusout", () => TIP.anchor && tipHide());
  document.addEventListener("pointerdown", () => TIP.anchor && tipHide(), true);

  return {
    mz,
    shell,
    add(name, fn) {
      inits.set(name, fn);
    },
    async start() {
      const name = document.body.dataset.page;
      try {
        // Поверх своих умолчаний — как мир страницы Twitch (main/08_settings.js). Фон после обновления может
        // ещё работать прежней версией, без новых ключей: страница показывала пустое (сроки ползунка у тестера
        // 05.10), а чат — умолчания.
        const all = Object.assign(CPX.settingsDefaults(), await CPX.ext.call("settings.getAll"));
        CPX.i18n.setLang(all["general.lang"]);
        CPX.pages.settings = all;
      } catch (_) {
        CPX.pages.settings = CPX.settingsDefaults();
      }
      // «Отключить анимации появления» — и на страницах расширения (подсказки, окно настроек поверх Twitch).
      CPX.mz.setOff(!!CPX.pages.settings["general.noAppear"]);
      CPX.ext.on("settings.changed", (d) => d && d.changes && "general.noAppear" in d.changes && CPX.mz.setOff(!!d.changes["general.noAppear"]));
      document.documentElement.lang = CPX.i18n.lang;
      // Подписи в разметке: data-t="ключ" → textContent.
      for (const n of document.querySelectorAll("[data-t]")) n.textContent = CPX.t(n.dataset.t);
      // «Мозаика»: поверхности разметки.
      for (const n of document.querySelectorAll(".btn, .card, .set-card, .chip, .plus-mark, .never, .error, .avatar")) mz(n);
      const sheet = document.querySelector(".sheet");
      if (sheet) shell(sheet, "welcome");
      const fn = inits.get(name);
      if (fn) await CPX.safely("page:" + name, fn);
    },
  };
})();

// ── src/pages/20_pages.js ──
/* Страницы расширения: popup (значок), настройки, согласие (при установке).
 *
 * Общие блоки (сервер, вход, PLUS) рисуются одинаково в popup и в настройках и обновляются
 * вживую по событиям фона: "auth.changed", "plus.changed", "ws.changed", "settings.changed".
 * Секретов здесь нет и быть не может: фон отдаёт страницам только публичное состояние.
 * Текст — только через textContent (CPX.el); ссылки на наш сайт — только https на наш домен
 * (фон их уже проверил, здесь — второй раз).
 */

CPX.i18n.add({
  ru: {
    "pages.version": "Версия {v}",
    "pages.less": "Меньше",
    "pages.more": "Больше",
    "pages.openSettings": "Настройки",
    "pages.settingsTitle": "Настройки Chatterino+",

    "pages.sites.title": "Kick",
    "pages.sites.text": "Смайлики 7TV, пейнты, значки и PLUS — и в чате kick.com. Браузер спросит доступ к сайту kick.com.",
    "pages.site.on": "Включить на {site}",
    "pages.site.off": "Выключить",
    "pages.site.onState": "Включено",
    "pages.site.dev": "Включено в сборке для проверки",
    "pages.site.onHint": "Работает. Открытые вкладки подхватят сами; если нет — обновите страницу.",
    "pages.site.kick.hint": "Смайлики 7TV, пейнты, значки и PLUS в чате kick.com, смайлики 7TV в поле ввода, подсветка плеера. Браузер спросит доступ к kick.com.",
    "pages.server.title": "Сервер Chatterino+",
    "pages.server.off": "Связь выключена",
    "pages.server.noTabs": "Включится, когда откроете Twitch",
    "pages.server.connecting": "Подключаемся…",
    "pages.server.open": "На связи",
    "pages.server.openVerified": "На связи · вход подтверждён",
    "pages.server.openPublic": "На связи · без входа",
    "pages.server.viaCf": "через запасной адрес",
    "pages.server.wait": "Нет связи — пробуем снова",
    "pages.server.waitIn": "Нет связи — повтор через {s} с",

    "pages.consent.offTitle": "Связь с сервером выключена",
    "pages.consent.offText":
      "Смайлики 7TV, BetterTTV, FrankerFaceZ и чужие пейнты уже работают. Для входа, подписки PLUS и общих банов включите связь с сервером Chatterino+.",
    "pages.consent.read": "Прочитать и включить",
    "pages.consent.toggle": "Связь с сервером Chatterino+",
    "pages.consent.toggleHint": "Нужна для входа, PLUS и общих банов. Выключено — о вас ничего не отправляется.",
    "pages.consent.what": "Что отправляется",

    "pages.account.title": "Вход в Chatterino+",
    "pages.account.noTwitch": "Войдите в аккаунт на twitch.tv (в любой вкладке) — затем здесь появится кнопка входа.",
    "pages.account.twitchAs": "На twitch.tv вы — {login}",
    "pages.account.login": "Войти через Twitch",
    "pages.account.loginHint": "Откроется страница Twitch: подтвердите вход как {login}. Пароль и токен Twitch к нам не попадают.",
    "pages.account.pending": "Ждём подтверждения на странице Twitch…",
    "pages.account.pendingHint": "Подтвердите вход как {login} во вкладке, которая открылась. Вкладка закроется сама.",
    "pages.account.cancel": "Отмена",
    "pages.account.signedAs": "Вы вошли как",
    "pages.account.logout": "Выйти",
    "pages.account.logoutSure": "Выйти из Chatterino+?",
    "pages.account.logoutYes": "Да, выйти",
    "pages.account.relogin": "Войти заново",
    "pages.account.others": "Вход есть у: {list}. На twitch.tv сейчас другой аккаунт — для него войдите отдельно.",
    "pages.account.err.consent": "Сначала включите связь с сервером Chatterino+.",
    "pages.account.err.no-twitch": "Сначала войдите в аккаунт на twitch.tv.",
    "pages.account.err.server-off": "Вход временно не работает на сервере — попробуйте позже.",
    "pages.account.err.network": "Сервер Chatterino+ не отвечает — проверьте интернет и попробуйте ещё раз.",
    "pages.account.err.bad-reply": "Сервер прислал странный ответ — попробуйте позже.",
    "pages.account.err.denied": "На странице Twitch подтвердили другой аккаунт ({got}). Подтверждать нужно тот, под которым вы на twitch.tv.",
    "pages.account.err.expired": "Время на подтверждение вышло — попробуйте ещё раз.",
    "pages.account.err.cancelled": "Вход отменён.",
    "pages.account.err.cancelled.account": "Вход отменён: на twitch.tv сменился аккаунт.",
    "pages.account.err.cancelled.tab": "Вход отменён: вкладку входа закрыли.",
    "pages.account.err.cancelled.consent": "Вход отменён: связь с сервером выключена.",
    "pages.account.err.relogin": "Вход устарел — войдите снова.",
    "pages.account.err.unknown": "Не получилось. Попробуйте ещё раз.",

    "pages.plus.title": "Подписка PLUS",
    "pages.plus.needLogin": "Войдите, чтобы увидеть статус подписки.",
    "pages.plus.waitTwitch": "Статус появится, когда откроете Twitch.",
    "pages.plus.waitServer": "Статус появится после подключения к серверу.",
    "pages.plus.waitVerify": "Статус появится, когда сервер подтвердит вход.",
    "pages.plus.unavailable": "Статус подписки сейчас недоступен — загляните позже.",
    "pages.plus.active": "Активна",
    "pages.plus.until": "до {date}",
    "pages.plus.months": "{n} {w} с нами",
    "pages.plus.due": "Нужна оплата",
    "pages.plus.cancelled": "Продление отменено",
    "pages.plus.none": "Не оформлена",
    "pages.plus.noneText": "Пейнт и бейдж, которые видят все, эффекты +spin, «в сети» в карточке и резервная загрузка смайликов 7TV через сервер Chatterino+.",
    "pages.plus.subscribe": "Оформить",
    "pages.ev.tag": "Ивент",
    "pages.ev.until": "до {date}",
    "pages.ev.badge": "Бейдж «{title}»",
    "pages.ev.plus": "PLUS активен",
    "pages.ev.plusNeed": "Нужен PLUS",
    "pages.ev.plusNeedText": "Значок ивента получают подписчики PLUS.",
    "pages.ev.plusLogin": "Войди и оформи PLUS",
    "pages.ev.plusGet": "Оформить PLUS",
    "pages.ev.kick": "Kick привязан",
    "pages.ev.kickNeed": "Привяжи Kick",
    "pages.ev.kickNeedText": "Значок за сообщение на Kick получает привязанный к подписке Kick-аккаунт — привязка в кабинете.",
    "pages.ev.kickLink": "Привязать",
    "pages.ev.chat": "Напиши в чат",
    "pages.ev.chatCat": "Одно сообщение в чате любого стрима в категории «{cat}»",
    "pages.ev.chatChan": "Одно сообщение в чате канала {ch}",
    "pages.ev.chatChans": "Одно сообщение в чате одного из каналов: {list}",
    "pages.ev.chatChanCat": "Одно сообщение в чате канала {ch}, когда стрим в категории «{cat}»",
    "pages.ev.onKick": " на Kick",
    "pages.ev.live": ", пока идёт эфир",
    "pages.ev.openCat": "Открыть категорию",
    "pages.ev.openChan": "Открыть канал",
    "pages.ev.got": "Значок получен",
    "pages.ev.gotText": "Он уже в твоей коллекции — надеть его можно в кабинете.",
    "pages.ev.steps": "{done} из {all}",
    "pages.plus.renew": "Продлить",
    "pages.plus.cabinet": "Кабинет",
    "pages.plus.offline": "по данным последнего подключения",
    "pages.plus.showBadge": "Показывать мой бейдж PLUS",
    "pages.plus.showOnline": "Показывать, что я в сети",
    "pages.plus.hideSb": "Скрыть мой значок общих банов",

    "pages.welcomeTitle": "Chatterino+ установлен",
    "pages.welcomeText": "Для входа, PLUS и общих банов нужна связь с сервером Chatterino+. Туда уходит:",
    "pages.consentItems":
      "Ваш ник и Twitch ID — только после входа в Chatterino+|Какие каналы Twitch открыты — для общих банов|Ники и Twitch ID авторов сообщений в чате — для пейнтов и бейджей|Ваши действия нашими кнопками модерации — их видят другие модераторы|Сообщения, задержанные AutoMod, — только если вы модератор канала, для досье общих банов|Есть аккаунт 7TV — 7TV узнаёт, в каком вы чате, чтобы показать ваш пейнт (отключается в настройках)",
    "pages.consentNever": "Никогда не уходят: пароль и токен Twitch, переписка и история просмотров.",
    "pages.consentAgree": "Согласен, включить",
    "pages.mirrorHint.cta": "Оформить PLUS",
    "pages.consentLater": "Не сейчас",
    "pages.consentRevoke": "Отозвать согласие",
    "pages.consentGiven": "Согласие дано — связь с сервером включена.",
    "pages.consentDone": "Связь включена. Войти в Chatterino+ можно значком расширения в браузере.",
    "pages.consentLogin": "Открываем вход через Twitch…",
    "pages.consentTwitch": "Войдите в аккаунт на открывшейся странице Twitch — вход в Chatterino+ начнётся сам.",
    "pages.consentWait": "Подтвердите вход на странице Twitch.",
    "pages.consentSigned": "Готово — вы вошли как {name}.",
    "pages.consentOff": "Без согласия работают смайлики 7TV, BTTV, FFZ и чужие пейнты — о вас ничего не уходит. Включить можно позже в настройках.",
    "pages.consentRevoked": "Согласие отозвано — о вас ничего не отправляется.",
    "pages.consentError": "Не удалось сохранить: расширение не ответило. Попробуйте ещё раз.",
    "pages.errWhy": "Причина: {why}",
    "pages.consentDenied": "Firefox не разрешил отправку данных — связь с сервером не включена.",

    "pages.group.general": "Общие",
    "pages.group.account": "Аккаунт",
  },
  en: {
    "pages.version": "Version {v}",
    "pages.less": "Less",
    "pages.more": "More",
    "pages.openSettings": "Settings",
    "pages.settingsTitle": "Chatterino+ settings",

    "pages.sites.title": "Kick",
    "pages.sites.text": "7TV emotes, paints, badges and PLUS — in kick.com chat too. Your browser will ask for access to kick.com.",
    "pages.site.on": "Turn on for {site}",
    "pages.site.off": "Turn off",
    "pages.site.onState": "On",
    "pages.site.dev": "On in the test build",
    "pages.site.onHint": "Working. Open tabs pick it up by themselves; if not, reload the page.",
    "pages.site.kick.hint": "7TV emotes, paints, badges and PLUS in kick.com chat, 7TV emotes in the chat box, ambient light. Your browser will ask for access to kick.com.",
    "pages.server.title": "Chatterino+ server",
    "pages.server.off": "Connection is off",
    "pages.server.noTabs": "Connects when you open Twitch",
    "pages.server.connecting": "Connecting…",
    "pages.server.open": "Connected",
    "pages.server.openVerified": "Connected · signed in",
    "pages.server.openPublic": "Connected · not signed in",
    "pages.server.viaCf": "via the backup address",
    "pages.server.wait": "No connection — retrying",
    "pages.server.waitIn": "No connection — retrying in {s} s",

    "pages.consent.offTitle": "Server connection is off",
    "pages.consent.offText":
      "7TV, BetterTTV and FrankerFaceZ emotes and other people's paints already work. To sign in, use PLUS and shared bans, turn on the Chatterino+ server connection.",
    "pages.consent.read": "Read and turn on",
    "pages.consent.toggle": "Chatterino+ server connection",
    "pages.consent.toggleHint": "Needed for sign-in, PLUS and shared bans. Off — nothing about you is sent.",
    "pages.consent.what": "What is sent",

    "pages.account.title": "Chatterino+ sign-in",
    "pages.account.noTwitch": "Sign in to twitch.tv (in any tab) — then the sign-in button will appear here.",
    "pages.account.twitchAs": "On twitch.tv you are {login}",
    "pages.account.login": "Sign in with Twitch",
    "pages.account.loginHint": "A Twitch page will open: confirm the sign-in as {login}. Your Twitch password and token never reach us.",
    "pages.account.pending": "Waiting for confirmation on the Twitch page…",
    "pages.account.pendingHint": "Confirm the sign-in as {login} in the tab that opened. It will close by itself.",
    "pages.account.cancel": "Cancel",
    "pages.account.signedAs": "Signed in as",
    "pages.account.logout": "Sign out",
    "pages.account.logoutSure": "Sign out of Chatterino+?",
    "pages.account.logoutYes": "Yes, sign out",
    "pages.account.relogin": "Sign in again",
    "pages.account.others": "Signed in: {list}. Another account is on twitch.tv now — sign in for it separately.",
    "pages.account.err.consent": "Turn on the Chatterino+ server connection first.",
    "pages.account.err.no-twitch": "Sign in to twitch.tv first.",
    "pages.account.err.server-off": "Sign-in is temporarily unavailable on the server — try again later.",
    "pages.account.err.network": "The Chatterino+ server is not responding — check your connection and try again.",
    "pages.account.err.bad-reply": "The server sent an odd reply — try again later.",
    "pages.account.err.denied": "Another account ({got}) was confirmed on the Twitch page. Confirm the one you use on twitch.tv.",
    "pages.account.err.expired": "The confirmation time ran out — please try again.",
    "pages.account.err.cancelled": "Sign-in cancelled.",
    "pages.account.err.cancelled.account": "Sign-in cancelled: the twitch.tv account changed.",
    "pages.account.err.cancelled.tab": "Sign-in cancelled: the sign-in tab was closed.",
    "pages.account.err.cancelled.consent": "Sign-in cancelled: the server connection was turned off.",
    "pages.account.err.relogin": "Your sign-in expired — please sign in again.",
    "pages.account.err.unknown": "Something went wrong. Please try again.",

    "pages.plus.title": "PLUS subscription",
    "pages.plus.needLogin": "Sign in to see your subscription status.",
    "pages.plus.waitTwitch": "The status will appear once you open Twitch.",
    "pages.plus.waitServer": "The status will appear once the server is connected.",
    "pages.plus.waitVerify": "The status will appear once the server confirms your sign-in.",
    "pages.plus.unavailable": "Subscription status is unavailable right now — check back later.",
    "pages.plus.active": "Active",
    "pages.plus.until": "until {date}",
    "pages.plus.months": "{n} {w} with us",
    "pages.plus.due": "Payment needed",
    "pages.plus.cancelled": "Renewal cancelled",
    "pages.plus.none": "Not subscribed",
    "pages.plus.noneText": "A paint and badge everyone sees, +spin effects, “online” in the user card and backup loading of 7TV emotes through the Chatterino+ server.",
    "pages.plus.subscribe": "Subscribe",
    "pages.ev.tag": "Event",
    "pages.ev.until": "until {date}",
    "pages.ev.badge": "“{title}” badge",
    "pages.ev.plus": "PLUS active",
    "pages.ev.plusNeed": "PLUS required",
    "pages.ev.plusNeedText": "Event badges go to PLUS subscribers.",
    "pages.ev.plusLogin": "Sign in and get PLUS",
    "pages.ev.plusGet": "Get PLUS",
    "pages.ev.kick": "Kick linked",
    "pages.ev.kickNeed": "Link Kick",
    "pages.ev.kickNeedText": "A message on Kick counts for the Kick account linked to your subscription — link it on your account page.",
    "pages.ev.kickLink": "Link",
    "pages.ev.chat": "Write in chat",
    "pages.ev.chatCat": "One message in the chat of any stream in the “{cat}” category",
    "pages.ev.chatChan": "One message in the chat of {ch}",
    "pages.ev.chatChans": "One message in the chat of one of: {list}",
    "pages.ev.chatChanCat": "One message in the chat of {ch} while the stream is in “{cat}”",
    "pages.ev.onKick": " on Kick",
    "pages.ev.live": " while live",
    "pages.ev.openCat": "Open category",
    "pages.ev.openChan": "Open channel",
    "pages.ev.got": "Badge received",
    "pages.ev.gotText": "It is already in your collection — wear it on your account page.",
    "pages.ev.steps": "{done} of {all}",
    "pages.plus.renew": "Renew",
    "pages.plus.cabinet": "Account page",
    "pages.plus.offline": "as of the last connection",
    "pages.plus.showBadge": "Show my PLUS badge",
    "pages.plus.showOnline": "Show that I'm online",
    "pages.plus.hideSb": "Hide my shared-ban badge",

    "pages.welcomeTitle": "Chatterino+ is installed",
    "pages.welcomeText": "Sign-in, PLUS and shared bans need a connection to the Chatterino+ server. It receives:",
    "pages.consentItems":
      "Your login and Twitch ID — only after you sign in to Chatterino+|Which Twitch channels you have open — for shared bans|Names and Twitch IDs of message authors in the chat — for paints and badges|Your actions with our moderation buttons — other moderators see them|Messages held by AutoMod — only if you moderate the channel, for the shared-ban history|Have a 7TV account — 7TV learns which chat you're in to show your paint (can be turned off in settings)",
    "pages.consentNever": "Never sent: your Twitch password and token, private messages and watch history.",
    "pages.consentAgree": "I agree, turn on",
    "pages.mirrorHint.cta": "Get PLUS",
    "pages.consentLater": "Not now",
    "pages.consentRevoke": "Withdraw consent",
    "pages.consentGiven": "Consent given — the server connection is on.",
    "pages.consentDone": "The connection is on. You can sign in to Chatterino+ with the extension icon in your browser.",
    "pages.consentLogin": "Opening sign-in with Twitch…",
    "pages.consentTwitch": "Sign in on the Twitch page that opened — Chatterino+ sign-in will start by itself.",
    "pages.consentWait": "Confirm the sign-in on the Twitch page.",
    "pages.consentSigned": "Done — you're signed in as {name}.",
    "pages.consentOff": "Without consent, 7TV, BTTV and FFZ emotes and other people's paints work — nothing about you is sent. You can turn it on later in settings.",
    "pages.consentRevoked": "Consent withdrawn — nothing about you is sent.",
    "pages.consentError": "Couldn't save: the extension didn't respond. Please try again.",
    "pages.errWhy": "Reason: {why}",
    "pages.consentDenied": "Firefox didn't allow sending data — the server connection stays off.",

    "pages.group.general": "General",
    "pages.group.account": "Account",
  },
});

(() => {
  /* ── Общее состояние и живые обновления ─────────────────────────────────── */

  const PG = {
    auth: null,
    plus: null,
    ws: null,
    awards: null, // ивент (bg/46_awards): полоса на первой странице настроек
    renderers: new Set(),
    render() {
      for (const fn of this.renderers) CPX.safely("page:render", fn);
    },
    async refresh() {
      const [a, p, w, aw] = await Promise.all(["auth.state", "plus.state", "ws.state", "awards.state"].map((m) => CPX.ext.call(m).catch(() => null)));
      if (a) PG.auth = a;
      if (p) PG.plus = p;
      if (w) PG.ws = w;
      if (aw) PG.awards = aw;
      PG.render();
    },
    started: false,
    start() {
      if (this.started) return this.refresh();
      this.started = true;
      CPX.ext.on("auth.changed", (a) => {
        PG.auth = a;
        PG.render();
      });
      CPX.ext.on("plus.changed", (p) => {
        PG.plus = p;
        PG.render();
      });
      CPX.ext.on("ws.changed", (w) => {
        PG.ws = w;
        PG.render();
      });
      CPX.ext.on("settings.changed", (d) => {
        Object.assign(CPX.pages.settings, (d && d.changes) || {});
        if (d && d.changes && "general.consent" in d.changes) PG.refresh();
        else PG.render();
      });
      CPX.ext.on("awards.state", (aw) => {
        PG.awards = aw;
        PG.render();
      });
      CPX.ext.on("ext:reconnect", () => PG.refresh());
      return this.refresh();
    },
  };

  // «Мозаика»: созданные узлы сразу получают классы поверхностей по своему виду (10_ext.js: CPX.pages.mz).
  const el = (...a) => CPX.pages.mz(CPX.el(...a));
  /** Дети parent → ровно nodes по порядку; уже стоящие на месте не трогаем (полоса связи живёт, её
   * анимация и пульс не перезапускаются — перерисовка по каждому событию фона, задание §5.3). */
  function setKids(parent, nodes) {
    nodes = nodes.filter(Boolean);
    const keep = new Set(nodes);
    for (const c of [...parent.childNodes]) if (!keep.has(c)) c.remove();
    let ref = parent.firstChild;
    for (const n of nodes) {
      if (n === ref) ref = ref.nextSibling;
      else parent.insertBefore(n, ref);
    }
  }
  const consentOn = () => !!(CPX.pages.settings && CPX.pages.settings["general.consent"]);
  /** Причина сбоя связи с фоном — как её сказал браузер, мелко под ошибкой (владелец 02.11): по снимку человека видно,
   *  что сломалось — фон не запущен, хранилище переполнено, диск. */
  const whyOf = (e) => String((e && e.message) || e || "").trim().slice(0, 200);
  const whyEl = (why) => (why ? el("span", { class: "err-why", text: CPX.t("pages.errWhy", { why }) }) : null);

  /* Согласие ↔ разрешение Firefox на сбор данных (Firefox 140+, блокер AMO — ревью 01.10).
   * Необязательные виды данных манифеста (CPX.DATA_COLLECTION) включаются только запросом
   * permissions.request в обработчике действия человека, ДО любого ожидания — поэтому поддержку
   * узнаём заранее. Chrome и старый Firefox (нет data_collection в getAll) — только своё согласие. */
  const DC = { supported: false };
  try {
    Promise.resolve(chrome.permissions.getAll()).then(
      (p) => (DC.supported = !!(p && Array.isArray(p.data_collection))),
      () => {}
    );
  } catch (_) {
    /* нет permissions API — без разрешения браузера */
  }
  /** Звать синхронно из обработчика щелчка. → Promise<bool>: разрешено ли. */
  function askDataCollection() {
    if (!DC.supported) return Promise.resolve(true);
    try {
      return Promise.resolve(chrome.permissions.request({ data_collection: CPX.DATA_COLLECTION })).then(
        (ok) => !!ok,
        () => false
      );
    } catch (_) {
      return Promise.resolve(false);
    }
  }
  /** Включение настройки, которой нужно необязательное разрешение браузера (permission в описании, сейчас — только
   *  nativeMessaging для native.watching): спросить СИНХРОННО в обработчике щелчка (иначе Firefox не покажет запрос);
   *  отказ — тумблер обратно. Окно поверх Twitch разрешение не спросит — открываем настройки вкладкой. */
  function askPermission(perm, input, ok) {
    // Сборка «Раннего доступа» (tools/build.py --early): разрешение уже обязательное — спрашивать нечего (Chrome на
    // запрос обязательного отвечает ошибкой).
    if ((chrome.runtime.getManifest().permissions || []).includes(perm)) return ok();
    if (document.body.classList.contains("embed")) {
      input.checked = false;
      CPX.ext.call("native.openSettings").catch(() => {});
      return;
    }
    let p;
    try {
      p = chrome.permissions.request({ permissions: [perm] });
    } catch (_) {
      p = Promise.resolve(false);
    }
    Promise.resolve(p).then(
      (granted) => (granted ? ok() : (input.checked = false)),
      () => (input.checked = false)
    );
  }

  /* ── Сайты — Kick (решение владельца 15.11; YouTube был 18.11, убран 19.11): включено = выдано НЕОБЯЗАТЕЛЬНОЕ право
   * на сайт; скрипты ставит фон (bg/15_sites.js) по событию браузера. Спросить право — синхронно в обработчике щелчка (иначе Firefox не
   * покажет запрос). Окно настроек поверх Twitch (embed) разрешение не спросит — открываем настройки вкладкой. */
  const SITE_UI = {
    kick: { title: "Kick", origins: ["https://kick.com/*"] },
  };
  const SITES = { on: { kick: null }, redraw: null }; // redraw — перерисовка открытого раздела настроек
  const siteKnown = () => Object.values(SITES.on).every((v) => v !== null);
  const siteRequired = (s) => (chrome.runtime.getManifest().host_permissions || []).includes(SITE_UI[s].origins[0]); // dev-сборка
  function sitesRefresh() {
    CPX.ext
      .call("sites.state")
      .then((st) => {
        let changed = false;
        for (const s of Object.keys(SITE_UI)) {
          const on = !!(st && st[s] && st[s].on);
          if (on !== SITES.on[s]) {
            SITES.on[s] = on;
            changed = true;
          }
        }
        if (!changed) return;
        PG.render();
        if (SITES.redraw) CPX.safely("sites:redraw", SITES.redraw);
      })
      .catch(() => {});
  }
  if (chrome.permissions && chrome.permissions.onAdded) {
    chrome.permissions.onAdded.addListener(sitesRefresh);
    chrome.permissions.onRemoved.addListener(sitesRefresh);
  }
  function siteToggle(site, want) {
    if (document.body.classList.contains("embed")) {
      chrome.runtime.openOptionsPage();
      return;
    }
    let p;
    try {
      const o = { origins: SITE_UI[site].origins };
      p = want ? chrome.permissions.request(o) : chrome.permissions.remove(o);
    } catch (_) {
      p = Promise.resolve(false);
    }
    Promise.resolve(p).then(sitesRefresh, sitesRefresh);
  }
  /** Кнопки сайта: выключено — «Включить на …»; включено — отметка и «Выключить» (в dev-сборке право обязательное). */
  function siteButtons(site, wide) {
    const on = SITES.on[site];
    if (on === null) return [];
    if (!on) {
      const b = el("button", { type: "button", class: "btn btn-accent" + (wide ? " btn-wide" : ""), text: CPX.t("pages.site.on", { site: SITE_UI[site].title }) });
      b.addEventListener("click", () => siteToggle(site, true));
      return [b];
    }
    const chip = el("span", { class: "chip chip-ok", text: CPX.t(siteRequired(site) ? "pages.site.dev" : "pages.site.onState") });
    if (siteRequired(site)) return [chip];
    const off = el("button", { type: "button", class: "btn btn-ghost", text: CPX.t("pages.site.off") });
    off.addEventListener("click", () => siteToggle(site, false));
    return [chip, off];
  }
  /** Карточки сайтов для окна значка: невключённые — одной заметной карточкой с кнопками; включённые — строками. */
  function siteCards() {
    if (!siteKnown()) return { off: null, on: null };
    const all = Object.keys(SITE_UI);
    const offs = all.filter((s) => !SITES.on[s]);
    const ons = all.filter((s) => SITES.on[s]);
    const off = offs.length
      ? el("section", { class: "card card-kick" }, [
          el("h2", { text: offs.length === all.length ? CPX.t("pages.sites.title") : SITE_UI[offs[0]].title }),
          el("p", { class: "muted small", text: offs.length === all.length ? CPX.t("pages.sites.text") : CPX.t("pages.site." + offs[0] + ".hint") }),
          ...offs.flatMap((s) => siteButtons(s, true)),
        ])
      : null;
    const on = ons.length ? el("section", { class: "card card-flat" }, ons.map((s) => el("div", { class: "row-line" }, [el("h2", { text: SITE_UI[s].title }), ...siteButtons(s, false)]))) : null;
    return { off, on };
  }

  function safeOurUrl(u) {
    try {
      const x = new URL(String(u || ""));
      const h = x.hostname;
      if (x.protocol === "https:" && (h === "eblo.id" || h.endsWith(".eblo.id") || h === "rish098.xyz" || h.endsWith(".rish098.xyz"))) return x.href;
    } catch (_) {
      /* не адрес */
    }
    return "";
  }

  function linkBtn(text, href, cls) {
    const url = safeOurUrl(href);
    if (!url) return null;
    return el("a", { class: "btn " + (cls || ""), href: url, target: "_blank", rel: "noopener noreferrer", text });
  }

  function fmtDate(sec) {
    try {
      return new Date(sec * 1000).toLocaleDateString(CPX.i18n.lang === "ru" ? "ru-RU" : "en-GB", { day: "numeric", month: "long", year: "numeric" });
    } catch (_) {
      return "";
    }
  }

  function monthsText(n) {
    const w = CPX.i18n.lang === "ru" ? CPX.i18n.plural(n, ["месяц", "месяца", "месяцев"]) : n === 1 ? "month" : "months";
    return CPX.t("pages.plus.months", { n, w });
  }

  async function act(btn, fn) {
    btn.disabled = true;
    try {
      await fn();
    } catch (_) {
      /* ошибка придёт в состоянии (auth.changed) */
    } finally {
      btn.disabled = false;
    }
  }

  /* ── Блок «Сервер» ──────────────────────────────────────────────────────── */

  /* Полоса связи (задание §5.3): 12 клеток перед текстом; состояние — data-sig (styles/pages-10-base.css).
   * Узел ОДИН на страницу: перерисовка меняет атрибут и текст, анимация не перезапускается. Пульс «на связи» —
   * одна пробежка по клеткам раз в 12 с (как сердцебиение сервера, bg/40_ws.js) — местным таймером, только
   * пока страница открыта и связь есть. Состояние для чтения с экрана — текстом (role=status), полоса скрыта. */
  const SL = { el: null, bar: null, text: null, pulse: 0 };
  const PULSE_MS = 12000;
  function serverLine() {
    const w = PG.ws;
    let sig = "off";
    let text = CPX.t("pages.server.off");
    if (!consentOn()) {
      sig = "off";
    } else if (!w || w.status === "off") {
      sig = "off";
      text = CPX.t(w && w.tabs === 0 ? "pages.server.noTabs" : "pages.server.off");
    } else if (w.status === "connecting" || w.status === "hello") {
      sig = "wait";
      text = CPX.t("pages.server.connecting");
    } else if (w.status === "open") {
      sig = w.door === "cf" ? "cf" : w.verified || (PG.auth && PG.auth.loggedIn) ? "ok" : "pub";
      text = CPX.t(w.verified ? "pages.server.openVerified" : PG.auth && PG.auth.loggedIn ? "pages.server.open" : "pages.server.openPublic");
      if (w.door === "cf") text += " · " + CPX.t("pages.server.viaCf");
    } else if (w.status === "wait") {
      // Без числа секунд: фон шлёт состояние только при смене статуса — число «застывало» (ревью 01.10).
      sig = "bad";
      text = CPX.t("pages.server.wait");
    }
    if (!SL.el) {
      SL.bar = el("span", { class: "sig", "aria-hidden": "true" }, Array.from({ length: 12 }, () => el("i")));
      SL.text = el("span");
      SL.el = el("div", { class: "status", role: "status" }, [SL.bar, SL.text]);
    }
    if (SL.bar.dataset.sig !== sig) SL.bar.dataset.sig = sig;
    if (SL.text.textContent !== text) SL.text.textContent = text;
    const live = sig === "ok" || sig === "pub" || sig === "cf";
    if (live && !SL.pulse) {
      SL.pulse = setInterval(() => {
        if (!SL.bar.isConnected) return;
        SL.bar.classList.remove("pg-pulse");
        void SL.bar.offsetWidth;
        SL.bar.classList.add("pg-pulse");
        setTimeout(() => SL.bar.classList.remove("pg-pulse"), 12 * 70 + 300);
      }, PULSE_MS);
    } else if (!live && SL.pulse) {
      clearInterval(SL.pulse);
      SL.pulse = 0;
      SL.bar.classList.remove("pg-pulse");
    }
    return SL.el;
  }

  /* ── Блок «Вход» ────────────────────────────────────────────────────────── */

  function errorText(err) {
    if (!err || !err.code) return "";
    const k = "pages.account.err." + err.code + (err.code === "cancelled" && err.why ? "." + err.why : "");
    let s = CPX.t(k, { got: err.got || "?" });
    if (s === k) s = CPX.t("pages.account.err." + err.code, { got: err.got || "?" });
    if (s.startsWith("pages.")) s = CPX.t("pages.account.err.unknown");
    return s;
  }

  let logoutAsk = false; // окно поверх Twitch: «Выйти» ждёт подтверждения
  function accountBlock() {
    const a = PG.auth;
    const box = el("div", { class: "block" });
    if (!a) return box;
    const tw = a.twitch;
    if (a.pending) {
      const cancel = el("button", { class: "btn btn-ghost", text: CPX.t("pages.account.cancel") });
      cancel.addEventListener("click", () => act(cancel, () => CPX.ext.call("auth.cancel")));
      box.append(
        el("div", { class: "row-line" }, [el("span", { class: "cpx-scan3", "aria-hidden": "true" }, Array.from({ length: 9 }, () => el("i"))), el("b", { text: CPX.t("pages.account.pending") })]),
        el("p", { class: "hint", text: CPX.t("pages.account.pendingHint", { login: a.pending.login }) }),
        el("div", { class: "actions" }, [cancel])
      );
    } else if (a.loggedIn) {
      const out = el("button", { class: "btn btn-ghost", text: CPX.t("pages.account.logout") });
      // Во фрейме поверх Twitch — с подтверждением второй кнопкой в другом месте (от подложенного
      // под щелчок фрейма, ревью безопасности 01.10); popup и вкладка — как раньше.
      const embed = document.body.classList.contains("embed");
      out.addEventListener("click", () => {
        if (!embed) return act(out, () => CPX.ext.call("auth.logout"));
        logoutAsk = true;
        PG.render();
      });
      box.append(
        el("div", { class: "who" }, [
          el("div", { class: "avatar", "aria-hidden": "true", text: (a.name || a.login || "?").slice(0, 1).toUpperCase() }),
          el("div", { class: "who-text" }, [
            el("span", { class: "muted", text: CPX.t("pages.account.signedAs") }),
            el("b", { text: a.name || a.login }),
            a.name && a.name.toLowerCase() !== a.login ? el("span", { class: "muted", text: "@" + a.login }) : null,
          ]),
          logoutAsk && embed ? null : out,
        ])
      );
      if (logoutAsk && embed) {
        const yes = el("button", { class: "btn btn-danger", text: CPX.t("pages.account.logoutYes") });
        const no = el("button", { class: "btn btn-ghost", text: CPX.t("pages.account.cancel") });
        yes.addEventListener("click", () => {
          logoutAsk = false;
          act(yes, () => CPX.ext.call("auth.logout"));
        });
        no.addEventListener("click", () => {
          logoutAsk = false;
          PG.render();
        });
        box.append(el("div", { class: "actions" }, [el("span", { class: "srow__ask", text: CPX.t("pages.account.logoutSure") }), no, yes]));
      }
      // Сервер отверг ключ продления (401), пропуск ещё годен до конца срока: без кнопки человек
      // видел бы «вход устарел — войдите снова» и только «Выйти».
      if (tw && (a.relogin || (a.error && a.error.code === "relogin"))) {
        const again = el("button", { class: "btn btn-accent btn-wide", text: CPX.t("pages.account.relogin") });
        again.disabled = !consentOn();
        again.addEventListener("click", () => act(again, () => CPX.ext.call("auth.login")));
        box.append(el("div", { class: "actions" }, [again]));
      }
    } else if (!tw) {
      box.append(el("p", { class: "muted", text: CPX.t("pages.account.noTwitch") }));
    } else {
      const btn = el("button", { class: "btn btn-accent btn-wide", text: CPX.t("pages.account.login") });
      btn.disabled = !consentOn();
      btn.addEventListener("click", () => act(btn, () => CPX.ext.call("auth.login")));
      box.append(
        el("p", { class: "muted small", text: CPX.t("pages.account.twitchAs", { login: tw.name || tw.login }) }),
        btn,
        el("p", { class: "hint", text: CPX.t("pages.account.loginHint", { login: tw.login }) })
      );
    }
    if (!a.loggedIn && a.others && a.others.length) box.append(el("p", { class: "hint", text: CPX.t("pages.account.others", { list: a.others.join(", ") }) }));
    // Отказ в продлении мог случиться давно (ошибка уже сброшена) — причину кнопки «Войти заново»
    // показываем по самому состоянию.
    const err = errorText(a.error) || (a.loggedIn && a.relogin ? CPX.t("pages.account.err.relogin") : "");
    if (err && !a.pending) box.append(el("p", { class: "error", role: "alert", text: err }));
    return box;
  }

  /* ── Блок «PLUS» ────────────────────────────────────────────────────────── */

  function wordmark() {
    return el("span", { class: "plus-mark", text: "PLUS" });
  }

  function plusWaitText() {
    const w = PG.ws;
    if (!w || w.status === "off") return CPX.t("pages.plus.waitTwitch"); // согласие есть — значит, нет вкладок Twitch
    if (w.status !== "open") return CPX.t("pages.plus.waitServer");
    // На связи, но без подтверждённого входа (пропуск продлевается или отвергнут) — статуса не будет,
    // пока сервер не примет вход; подтверждён, а статуса нет — сервер его не прислал.
    return CPX.t(w.verified ? "pages.plus.unavailable" : "pages.plus.waitVerify");
  }

  function plusBlock(withToggles) {
    const p = PG.plus;
    const a = PG.auth;
    const box = el("div", { class: "block" });
    const head = el("div", { class: "row-line" }, [wordmark()]);
    box.append(head);
    if (!a || !a.loggedIn || !p || !p.known) {
      if (a && a.loggedIn) {
        // Вошли, а статуса ещё нет: его присылает только сервер — пишем, когда он появится.
        head.append(el("span", { class: "muted small", text: plusWaitText() }));
        return box;
      }
      head.append(el("span", { class: "muted", text: CPX.t("pages.plus.needLogin") }));
      return box;
    }
    if (p.active) {
      head.append(el("span", { class: "chip chip-ok", text: CPX.t(p.due ? "pages.plus.due" : "pages.plus.active") }));
      const bits = [];
      if (p.until) bits.push(CPX.t("pages.plus.until", { date: fmtDate(p.until) }));
      if (p.months) bits.push(monthsText(p.months));
      if (p.cancelled) bits.push(CPX.t("pages.plus.cancelled"));
      if (!p.live) bits.push(CPX.t("pages.plus.offline"));
      if (bits.length) box.append(el("p", { class: "muted small", text: bits.join(" · ") }));
      box.append(
        el("div", { class: "actions" }, [
          p.due ? linkBtn(CPX.t("pages.plus.renew"), p.site, "btn-accent") : null,
          linkBtn(CPX.t("pages.plus.cabinet"), p.site, "btn-ghost"),
        ])
      );
      if (withToggles && p.live && p.profile) box.append(plusToggles(p.profile));
    } else {
      head.append(el("span", { class: "chip", text: CPX.t("pages.plus.none") }));
      box.append(
        el("p", { class: "muted small", text: CPX.t("pages.plus.noneText") }),
        el("div", { class: "actions" }, [linkBtn(CPX.t("pages.plus.subscribe"), p.subscribeUrl || p.site, "btn-accent")])
      );
    }
    return box;
  }

  function plusToggles(profile) {
    const list = el("div", { class: "toggles" });
    const items = [
      ["show_badge", "pages.plus.showBadge"],
      ["show_online", "pages.plus.showOnline"],
      ["hide_sharedban_badge", "pages.plus.hideSb"],
    ];
    for (const [k, label] of items) {
      const input = el("input", { type: "checkbox", class: "switch" });
      input.checked = !!profile[k];
      input.addEventListener("change", () => {
        CPX.ext.call("plus.setProfile", { [k]: input.checked }).catch(() => {
          input.checked = !input.checked;
        });
      });
      list.append(el("label", { class: "row" }, [el("span", { class: "label", text: CPX.t(label) }), input]));
    }
    return list;
  }

  /* ── Popup ──────────────────────────────────────────────────────────────── */

  CPX.pages.add("popup", async () => {
    document.getElementById("ver").textContent = "v" + CPX.version;
    document.getElementById("open-settings").addEventListener("click", () => chrome.runtime.openOptionsPage());
    const main = document.getElementById("main");
    // Подсказка зеркала не-подписчику (7TV давно не открывается, а наш сервер до него достаёт):
    // фон решает, когда её показать (раз в сутки), popup показывает отметку и сообщает, что показал.
    let hint = null;
    try {
      const h = await CPX.ext.call("mirror.hint");
      if (h && (h.pending || h.fresh) && h.text) hint = h;
    } catch (_) {
      /* модуль зеркала недоступен — без подсказки */
    }
    if (hint) CPX.ext.call("mirror.hintSeen").catch(() => {});
    function hintCard() {
      // Крестик — «больше не показывать» (владелец 23.10; та же отметка, что у тоста на Twitch).
      const x = el("button", { type: "button", class: "card-hint__x", "aria-label": CPX.t("mirror.hint.never"), "data-pg-tip": CPX.t("mirror.hint.never") }, [CPX.glyph("close", 12)]);
      x.addEventListener("click", () => {
        hint = null;
        CPX.ext.call("settings.set", { changes: { "mirror.hintOff": true } }).catch(() => {});
        PG.render();
      });
      const kids = [x, el("p", { class: "small", text: hint.text })];
      if (hint.subscribeUrl) {
        const go = el("button", { class: "btn btn-accent btn-wide", text: CPX.t("pages.mirrorHint.cta") });
        go.addEventListener("click", () => chrome.tabs.create({ url: hint.subscribeUrl }));
        kids.push(go);
      }
      return el("section", { class: "card card-hint" }, kids);
    }
    let srvCard = null; // постоянная: в ней полоса связи (перерисовка её не пересоздаёт)
    sitesRefresh();
    PG.renderers.add(() => {
      const parts = [];
      if (hint) parts.push(hintCard());
      // Kick: окно значка открыли со вкладки сайта (метка на значке) — невключённый первым.
      const sc = siteCards();
      if (sc.off) parts.push(sc.off);
      if (!consentOn()) {
        const read = el("button", { class: "btn btn-accent btn-wide", text: CPX.t("pages.consent.read") });
        read.addEventListener("click", () => chrome.tabs.create({ url: chrome.runtime.getURL("pages/welcome.html") }));
        parts.push(
          el("section", { class: "card" }, [
            el("h2", { text: CPX.t("pages.consent.offTitle") }),
            el("p", { class: "muted small", text: CPX.t("pages.consent.offText") }),
            read,
          ])
        );
      } else {
        if (!srvCard) srvCard = el("section", { class: "card card-flat" }, [el("h2", { text: CPX.t("pages.server.title") }), serverLine()]);
        else serverLine();
        parts.push(el("section", { class: "card" }, [el("h2", { text: CPX.t("pages.account.title") }), accountBlock()]), el("section", { class: "card" }, [plusBlock(false)]), srvCard);
      }
      if (sc.on) parts.push(sc.on);
      setKids(main, parts);
    });
    await PG.start();
  });

  /* ── Согласие ───────────────────────────────────────────────────────────── */

  CPX.pages.add("welcome", () => {
    const list = document.getElementById("consent-items");
    for (const s of CPX.t("pages.consentItems").split("|"))
      list.appendChild(el("li", { class: "cpx-mz cpx-k1 cpx-t-well" }, [el("i", { class: "sends__mk", "aria-hidden": "true" }), el("span", { text: s })]));
    document.getElementById("never").replaceChildren(CPX.glyph("check", 14), el("span", { text: CPX.t("pages.consentNever") }));
    const status = document.getElementById("status");
    const agree = document.getElementById("agree");
    const later = document.getElementById("later");
    const revoke = document.getElementById("revoke");
    let note = "";
    let failed = false;
    let why = ""; // причина последнего сбоя связи с фоном

    function paint() {
      const on = consentOn();
      agree.hidden = on;
      later.hidden = on;
      revoke.hidden = !on;
      status.replaceChildren(note || (on ? CPX.t("pages.consentGiven") : ""), ...(failed && why ? [whyEl(why)] : []));
      status.className = "status-text" + (failed ? " bad" : on ? " ok" : "");
    }
    PG.renderers.add(paint);

    /* После «Согласен» — сразу вход в Chatterino+ (владелец 04.10: поставил → согласился → страница входа Twitch,
     * без поиска кнопок). Кто на twitch.tv, фон узнаёт только из вкладки Twitch, а сразу после установки её у
     * расширения нет (уже открытые вкладки скриптов не получили): открываем twitch.tv в фоне — аккаунт пришёл,
     * вход начинается сам; на Twitch не вошли — через FLOW_SHOW_MS показываем эту вкладку и просим войти, после
     * входа на Twitch всё продолжится само (пока страница согласия открыта). */
    const FLOW_SHOW_MS = 8000;
    const flow = { want: false, started: false, tab: 0, timer: 0 };
    function say(text, bad) {
      note = text;
      failed = !!bad;
      why = "";
      paint();
    }
    function closeSelf() {
      try {
        chrome.tabs.getCurrent((t) => {
          if (t && t.id != null) chrome.tabs.remove(t.id);
          else window.close();
        });
      } catch (_) {
        window.close();
      }
    }
    function nextStep() {
      if (!flow.want || !consentOn()) return;
      const a = PG.auth;
      if (!a) return;
      if (a.loggedIn) {
        flow.want = false;
        clearTimeout(flow.timer);
        say(CPX.t("pages.consentSigned", { name: a.name || a.login }));
        // Вход начат отсюда и прошёл — окно больше не нужно (владелец 05.10): закрываем свою вкладку, браузер
        // вернёт к прошлой. Открытую потом из настроек («Что отправляется») не закрываем — там flow не начат.
        return closeSelf();
      }
      if (a.pending) return say(CPX.t("pages.consentWait"));
      if (flow.started) {
        // Вход начали, но он не случился (отмена, срок вышел, сервер) — причина, дальше — обычные кнопки.
        if (a.error) {
          flow.want = false;
          say(errorText(a.error) || CPX.t("pages.consentDone"), true);
        }
        return;
      }
      if (a.twitch) {
        flow.started = true;
        clearTimeout(flow.timer);
        say(CPX.t("pages.consentLogin"));
        CPX.ext.call("auth.login").catch(() => {
          flow.want = false;
          say(errorText(PG.auth && PG.auth.error) || CPX.t("pages.consentDone"), !!(PG.auth && PG.auth.error));
        });
        return;
      }
      if (flow.tab) return;
      flow.tab = -1;
      say(CPX.t("pages.consentLogin"));
      Promise.resolve(chrome.tabs.create({ url: "https://www.twitch.tv/", active: false }))
        .then((t) => (flow.tab = (t && t.id) || -1))
        .catch(() => {});
      flow.timer = setTimeout(() => {
        if (!flow.want || flow.started || (PG.auth && PG.auth.twitch)) return;
        say(CPX.t("pages.consentTwitch"));
        if (flow.tab > 0) Promise.resolve(chrome.tabs.update(flow.tab, { active: true })).catch(() => {});
      }, FLOW_SHOW_MS);
    }
    PG.renderers.add(nextStep);

    // Записать согласие; фон недоступен — сказать об этом в строке состояния, а не молчать.
    async function setConsent(btn, value, okNote) {
      btn.disabled = true;
      try {
        await CPX.ext.call("settings.set", { changes: { "general.consent": value } });
        CPX.pages.settings["general.consent"] = value;
        note = okNote;
        failed = false;
      } catch (e) {
        note = CPX.t("pages.consentError");
        failed = true;
        why = whyOf(e);
      } finally {
        btn.disabled = false;
        paint();
      }
    }

    agree.addEventListener("click", () => {
      // Запрос разрешения Firefox — первым делом, в самом обработчике щелчка.
      askDataCollection().then((ok) => {
        if (ok)
          return setConsent(agree, true, CPX.t("pages.consentDone")).then(() => {
            if (!consentOn()) return;
            flow.want = true;
            PG.refresh();
          });
        note = CPX.t("pages.consentDenied");
        failed = true;
        why = "";
        paint();
      });
    });
    later.addEventListener("click", () => {
      note = CPX.t("pages.consentOff");
      failed = false;
      paint();
    });
    revoke.addEventListener("click", () => {
      // Через фон: он снимает и разрешение Firefox, и наше согласие.
      revoke.disabled = true;
      CPX.ext
        .call("consent.revoke")
        .then(
          () => {
            CPX.pages.settings["general.consent"] = false;
            note = CPX.t("pages.consentRevoked");
            failed = false;
          },
          (e) => {
            note = CPX.t("pages.consentError");
            failed = true;
            why = whyOf(e);
          }
        )
        .then(() => {
          revoke.disabled = false;
          paint();
        });
    });
    paint();
    PG.start();
  });

  /* ── Настройки: разделы слева, содержимое справа ────────────────────────────
   * Одна страница на два места (волна 6, заказ владельца 01.10): вкладка браузера (options_ui) и окно
   * поверх Twitch (src/main/94_settings_panel.js грузит её во фрейм с ?embed=1 — без своей шапки, Esc
   * просит окно закрыться). Разделы (CATS) собирают настройки областей в понятные группы; настройка
   * области, не названная в разделе, сама встаёт в его последнюю группу — новая галочка не потеряется.
   * Текста — минимум: у раздела одна строка, у настройки подсказка только там, где подписи мало.
   * Раздел — в хэше (#chat; старое #group-mod тоже понимаем); смена раздела — replaceState: во фрейме
   * лишняя запись истории перехватила бы кнопку «Назад» Twitch. */

  CPX.i18n.add({
    ru: {
      "set.search": "Поиск настроек",
      "set.nothing": "Ничего не нашлось",
      "set.cat.account": "Аккаунт",
      "set.cat.chat": "Чат",
      "set.cat.mentions": "Упоминания",
      "set.cat.lab": "Эксперименты",
      "set.cat.emotes": "Смайлики",
      "set.cat.input": "Поле ввода",
      "set.cat.mod": "Модерация",
      "set.cat.sharedbans": "Общие баны",
      "set.cat.player": "Плеер",
      "set.cat.ambient": "Ambilight",
      "set.cat.channel": "Канал",
      "set.cat.ui": "Интерфейс",
      "set.cat.eblo": "Eblo.id",
      "set.cat.general": "Основное",
      "set.desc.account": "Вход, подписка PLUS и связь с сервером Chatterino+",
      "set.desc.chat": "Свой список сообщений: плавнее и со смайликами 7TV, BTTV и FFZ",
      "set.desc.mentions": "Подсветка и звук, когда вас упоминают в чате, и свои слова",
      "set.desc.lab": "Новое и ещё обкатывается — может меняться",
      "set.desc.emotes": "Смайлики, пейнты и бейджи сторонних сервисов",
      "set.desc.input": "Меню смайликов, GIF и подсказки при наборе",
      "set.desc.mod": "Ползунок или кнопки у сообщений, опросы и прогнозы",
      "set.desc.sharedbans": "Кого банили на других каналах. Работает после входа в Chatterino+",
      "set.desc.player": "Задержка эфира и управление плеером",
      "set.desc.ambient": "Свет цветами эфира вокруг плеера Twitch и Kick",
      "set.desc.channel": "Страница канала",
      "set.desc.ui": "Убрать лишнее со страницы Twitch. Всё выключено, пока не включите",
      "set.desc.eblo": "Хостинг картинок, видео и файлов: карточки постов в чате и загрузка прямо из чата",
      "set.desc.general": "Язык, вид, сброс и сведения о расширении",
      "set.sec.mentions": "Подсветка",
      "set.sec.sizes": "Размеры",
      "set.sec.msgActions": "Ник и кнопки сообщений",
      "set.sec.mentionSound": "Звук",
      "set.sec.mentionMute": "Каналы без звука",
      "set.sec.mentionIgnore": "Не уведомлять",
      "set.sec.words": "Свои слова",
      "set.sec.card": "Карточка пользователя",
      "set.sec.sources": "Смайлики",
      "set.sec.names": "Ники",
      "set.sec.badges": "Бейджи",
      "set.sec.modButtons": "Модерация в чате",
      "set.openBlock": "Открыть раздел",
      "set.sec.polls": "Опросы и прогнозы",
      "set.sec.modLines": "Строки модерации в чате",
      "set.sec.modTyping": "Кто печатает",
      "set.sec.spam": "Антиспам",
      "set.sec.events": "События",
      "set.sec.spamText": "Антиспам: повторы текста",
      "set.sec.spamEmotes": "Антиспам: смайлики",
      "set.sec.spamIgnore": "Антиспам: кого не считать",
      "set.sec.sbBadge": "Значок",
      "set.sec.massban": "Массовый бан",
      "set.sec.catchup": "Догон эфира",
      "set.sec.playerMore": "Плеер",
      "set.sec.comp": "Компрессор звука",
      "set.sec.autoplay": "Запуск видео",
      "set.sec.vod": "Записи",
      "set.sec.playerLook": "Вид плеера",
      "set.sec.page": "Страница канала",
      "set.sec.sidenav": "Левая панель",
      "set.sec.native": "Программа Chatterino+",
      "set.sec.chatLink": "Связь с чатом",
      "set.sec.layout": "Раскладка страницы",
      "set.sec.topnav": "Верхняя панель",
      "set.sec.inPlayer": "В плеере",
      "set.sec.clips": "Клипы",
      "set.sec.twPages": "Страницы Twitch",
      "set.sec.underPlayer": "Под плеером",
      "set.sec.chatUi": "Чат",
      "set.sec.server": "Связь с сервером",
      "set.sec.signin": "Вход",
      "set.sec.plus": "Подписка",
      "set.sec.lang": "Язык",
      "set.sec.look": "Вид",
      "set.sec.reset": "Сброс",
      "set.sec.about": "О расширении",
      "set.colors": "Цвет значка",
      "set.colors.hint": "1 бан · 2–4 бана · от 5 банов",
      "set.reset": "Вернуть настройки по умолчанию",
      "set.reset.hint": "Галочки, выборы и сроки мута во всех разделах. Свои кнопки модерации, избранное и вход не трогаются",
      "set.reset.btn": "Сбросить",
      "set.reset.sure": "Точно сбросить?",
      "set.reset.yes": "Да, сбросить",
      "set.reset.no": "Отмена",
      "set.reset.done": "Готово — настройки по умолчанию",
      "set.version": "Версия {v}",
      "set.site": "Сайт Chatterino+",
      "set.what": "Что отправляется на сервер",
    },
    en: {
      "set.search": "Search settings",
      "set.nothing": "Nothing found",
      "set.cat.account": "Account",
      "set.cat.chat": "Chat",
      "set.cat.mentions": "Mentions",
      "set.cat.lab": "Experiments",
      "set.cat.emotes": "Emotes",
      "set.cat.input": "Chat input",
      "set.cat.mod": "Moderation",
      "set.cat.sharedbans": "Shared bans",
      "set.cat.player": "Player",
      "set.cat.ambient": "Ambilight",
      "set.cat.channel": "Channel",
      "set.cat.ui": "Interface",
      "set.cat.eblo": "Eblo.id",
      "set.cat.general": "General",
      "set.desc.account": "Sign-in, PLUS subscription and the Chatterino+ server connection",
      "set.desc.chat": "Our own message list: smoother, with 7TV, BTTV and FFZ emotes",
      "set.desc.mentions": "Highlight and sound when you're mentioned in chat, and your own words",
      "set.desc.lab": "New and still being tested — may change",
      "set.desc.emotes": "Emotes, paints and badges from other services",
      "set.desc.input": "Emote menu, GIFs and suggestions while typing",
      "set.desc.mod": "Slider or message buttons, polls and predictions",
      "set.desc.sharedbans": "Who was banned in other channels. Works after you sign in to Chatterino+",
      "set.desc.player": "Stream delay and player controls",
      "set.desc.ambient": "Light in the stream’s colours around the Twitch and Kick player",
      "set.desc.channel": "Channel page",
      "set.desc.ui": "Remove clutter from the Twitch page. All off until you turn it on",
      "set.desc.eblo": "Image, video and file hosting: post cards in chat and uploads right from chat",
      "set.desc.general": "Language, appearance, reset and about",
      "set.sec.mentions": "Highlights",
      "set.sec.sizes": "Sizes",
      "set.sec.msgActions": "Names and message buttons",
      "set.sec.mentionSound": "Sound",
      "set.sec.mentionMute": "Channels without sound",
      "set.sec.mentionIgnore": "Don't notify",
      "set.sec.words": "Custom words",
      "set.sec.card": "User card",
      "set.sec.sources": "Emotes",
      "set.sec.names": "Names",
      "set.sec.badges": "Badges",
      "set.sec.modButtons": "Moderation in chat",
      "set.openBlock": "Open section",
      "set.sec.polls": "Polls and predictions",
      "set.sec.modLines": "Moderation lines in chat",
      "set.sec.modTyping": "Who is typing",
      "set.sec.spam": "Anti-spam",
      "set.sec.events": "Events",
      "set.sec.spamText": "Anti-spam: repeated text",
      "set.sec.spamEmotes": "Anti-spam: emotes",
      "set.sec.spamIgnore": "Anti-spam: who is not counted",
      "set.sec.sbBadge": "Badge",
      "set.sec.massban": "Mass ban",
      "set.sec.catchup": "Catch up to live",
      "set.sec.playerMore": "Player",
      "set.sec.comp": "Audio compressor",
      "set.sec.autoplay": "Video start",
      "set.sec.vod": "Videos",
      "set.sec.playerLook": "Player look",
      "set.sec.page": "Channel page",
      "set.sec.sidenav": "Side bar",
      "set.sec.native": "Chatterino+ app",
      "set.sec.chatLink": "Chat connection",
      "set.sec.layout": "Page layout",
      "set.sec.topnav": "Top bar",
      "set.sec.inPlayer": "On the player",
      "set.sec.clips": "Clips",
      "set.sec.twPages": "Twitch pages",
      "set.sec.underPlayer": "Below the player",
      "set.sec.chatUi": "Chat",
      "set.sec.server": "Server connection",
      "set.sec.signin": "Sign-in",
      "set.sec.plus": "Subscription",
      "set.sec.lang": "Language",
      "set.sec.look": "Appearance",
      "set.sec.reset": "Reset",
      "set.sec.about": "About",
      "set.colors": "Badge colour",
      "set.colors.hint": "1 ban · 2–4 bans · 5+ bans",
      "set.reset": "Restore default settings",
      "set.reset.hint": "Switches, choices and timeouts in all sections. Your moderation buttons, favourites and sign-in stay",
      "set.reset.btn": "Reset",
      "set.reset.sure": "Reset everything?",
      "set.reset.yes": "Yes, reset",
      "set.reset.no": "Cancel",
      "set.reset.done": "Done — default settings restored",
      "set.version": "Version {v}",
      "set.site": "Chatterino+ website",
      "set.what": "What is sent to the server",
    },
  });

  // Разделы. sections: {title, keys} — порядок строк; {block} — особый блок области (CPX.pages.groupBlock);
  // {colors, label, hint} — несколько цветов одной строкой. Не названные настройки областей groups —
  // в последнюю группу раздела.
  const CATS = [
    { id: "account", icon: "user", view: "account" },
    {
      id: "chat",
      icon: "chat",
      groups: ["chat", "card"],
      sections: [
        { keys: ["chat.ownList", "chat.width", "chat.left", "chat.smooth", "chat.smoothAuto", "chat.stripes", "chat.speed", "chat.maxLines", "chat.channelDelay", "chat.deletedDim", "chat.hideBlocked", "chat.loginOnly", "chat.vodNoTime"] },
        // Владелец 23.10: шрифт и отступы строк (49_list_start.js).
        { title: "set.sec.sizes", keys: ["chat.fontSize", "chat.lineGap", "chat.emoteGap"] },
        { title: "set.sec.msgActions", keys: ["chat.nameRightClick", "chat.replyButton", "chat.copyButton"] },
        { title: "set.sec.mentions", keys: ["chat.firstMsg", "chat.firstMsgColor"] },
        { title: "set.sec.events", keys: ["chat.eventsCenter", "chat.bannerRaid", "chat.raiders", "chat.bannerGifts", "chat.bannerShoutout"] },
        { title: "set.sec.card", keys: ["card.enabled", "card.banReason"] },
      ],
    },
    {
      // Владелец 14.10: всё про упоминания — свой раздел после «Чата»: подсветка (перенесена из «Чата»), звук и свои
      // слова (особые блоки — pages/33_mentions.js).
      id: "mentions",
      icon: "at",
      groups: ["mentions"], // своих настроек у области нет — ключи из «Чата»; без groups раздел не ищется
      sections: [
        { keys: ["chat.mentionHighlight", "chat.mentionColor"] },
        { title: "set.sec.mentionSound", block: "mentionSound", keys: ["chat.mentionSound", "chat.mentionVolume"] },
        { title: "set.sec.words", block: "mentionWords", keys: [] },
        // Владелец 23.10: где звук не нужен и от кого не уведомлять (pages/33_mentions.js).
        { title: "set.sec.mentionMute", block: "mentionMute", keys: [] },
        { title: "set.sec.mentionIgnore", block: "mentionIgnore", keys: [] },
      ],
    },
    {
      // Владелец 04.10: то, что ещё обкатывается, — отдельным разделом сразу после «Чата».
      id: "lab",
      icon: "lab",
      groups: ["sidenav"],
      sections: [
        { keys: ["points.autoClaim"] },
        { title: "set.sec.sidenav", keys: ["sidenav.preview", "sidenav.previewSize"] },
        { title: "set.sec.native", keys: ["native.watching"], block: "native" },
        // Владелец 30.10: сторож связи с чатом Twitch (src/main/34_chat_link.js).
        { title: "set.sec.chatLink", keys: ["chat.autoReconnect"] },
      ],
    },
    {
      id: "emotes",
      icon: "smile",
      groups: ["emotes"],
      sections: [
        { keys: ["emotes.stv", "emotes.bttv", "emotes.ffz", "emotes.effects"] },
        { title: "set.sec.names", keys: ["emotes.paints", "emotes.stvPresence"] },
        {
          title: "set.sec.badges",
          keys: ["emotes.badges.stv", "emotes.badges.bttv", "emotes.badges.ffz", "emotes.badges.chatterino", "emotes.badges.homies", "emotes.badges.ffzap"],
        },
      ],
    },
    { id: "input", icon: "keyboard", groups: ["input"], sections: [{ keys: ["input.menu", "input.menuKeep", "input.gifs", "input.emotes", "input.tab", "input.history", "input.ctrlKeep", "input.allowRepeat"] }] },
    {
      id: "mod",
      icon: "sword",
      groups: ["mod", "spam", "polls"],
      sections: [
        { title: "set.sec.modButtons", block: "mod", keys: ["mod.lastTimeout"] },
        { title: "set.sec.modLines", keys: ["mod.lineDelete", "mod.lineTimeout", "mod.lineBan"] },
        { title: "set.sec.modTyping", keys: ["mod.typing"] },
        { title: "set.sec.spam", keys: ["spam.enabled", "spam.modOnly", "spam.showCount", "spam.countColorSelf", "spam.countColorMulti", "spam.highlight", "spam.selfColor", "spam.multiColor"] },
        { title: "set.sec.spamText", keys: ["spam.minLength", "spam.repeatMin", "spam.windowSec", "spam.memory", "spam.ignoreTrailing", "spam.fuzzy", "spam.fuzzyThreshold", "spam.fuzzyWindow"] },
        { title: "set.sec.spamEmotes", keys: ["spam.symbolMin", "spam.burstMin", "spam.burstWindowSec"] },
        { title: "set.sec.spamIgnore", keys: ["spam.ignoreMods", "spam.ignoreBroadcaster", "spam.ignoreVips", "spam.ignoreUsers"] },
        { title: "set.sec.polls", keys: ["polls.button"] },
      ],
    },
    {
      id: "sharedbans",
      icon: "warn",
      groups: ["sharedbans"],
      sections: [
        { title: "set.sec.sbBadge", keys: ["sharedbans.show", "sharedbans.place", "sharedbans.dimSeen"], colors: ["sharedbans.color1", "sharedbans.color2", "sharedbans.color3"] },
        { title: "set.sec.massban", keys: ["sharedbans.mbConfirm", "sharedbans.mbAskReason", "sharedbans.mbJoin"] },
        { keys: ["sharedbans.selfCheck"] },
      ],
    },
    {
      id: "player",
      icon: "play",
      groups: ["player"],
      sections: [{ title: "set.sec.catchup", keys: ["player.catchup", "player.catchupTarget", "player.catchupMaxRate", "player.catchupNotice", "player.catchupSyncFix"] }, { title: "set.sec.playerMore", keys: ["player.resetButton", "player.shotButton", "player.pipButton", "player.autoReset", "player.extHide"] }, { title: "set.sec.comp", keys: ["player.compressor", "player.compStrength", "player.compAll"] }, { title: "set.sec.autoplay", keys: ["player.skipMature", "player.pauseHome", "player.pauseOffline"] }, { title: "set.sec.vod", keys: ["player.vodClock", "player.vodClockDate"] }, { title: "set.sec.playerLook", keys: ["player.noShade"] }],
    },
    // Владелец 14.10: подсветка вокруг плеера — свой раздел «Ambilight» сразу после «Плеера».
    { id: "ambient", icon: "ambi", groups: ["ambient"], sections: [{ keys: ["player.ambient", "player.ambientLevel", "player.ambientResponse", "player.ambientChat", "player.ambientDim", "player.ambientButton"] }] },
    {
      id: "channel",
      icon: "tv",
      groups: ["channel"],
      sections: [{ title: "set.sec.page", keys: ["channel.uptimeStart", "channel.quickLinksOn"] }],
    },
    // Владелец 13.10: eblo.id — свой раздел с логотипом сайта (знак — значок раздела, надпись — в шапке). Строка
    // аккаунта — особый блок (pages/32_eblo.js).
    { id: "eblo", icon: "eblo", groups: ["eblo"], sections: [{ block: "eblo", keys: ["eblo.previews", "eblo.blur", "eblo.reveal", "eblo.upload"] }] },
    {
      // Владелец 03.10: скрыть лишнее на странице Twitch; всё выключено по умолчанию (src/main/93_interface.js).
      id: "ui",
      icon: "layout",
      groups: ["ui"],
      sections: [
        // Владелец 30.10: чат под плеером в узком окне (src/main/93_chat_below.js).
        { title: "set.sec.layout", keys: ["ui.chatBelow"] },
        { title: "set.sec.topnav", keys: ["ui.hidePrime", "ui.hideGetBits", "ui.hideTurbo"] },
        { title: "set.sec.sidenav", keys: ["ui.sideNoForYou", "ui.sideHideSortLabel", "ui.sideShowAll", "ui.sideHideOffline", "ui.sidePin", "ui.sideNoRecs", "ui.sideNoSimilar", "ui.sideNoStories", "ui.sideNoStreak"] },
        { title: "set.sec.inPlayer", keys: ["ui.hideDisclosure"] },
        // Владелец 23.10: итоги трансляций (страницы каналов и категорий, уведомления).
        { title: "set.sec.twPages", keys: ["ui.hideRecaps"] },
        // Владелец 22.10: число «в чате» и задержка у таймера — сюда (они в строке под плеером), из «Канала» и «Плеера».
        { title: "set.sec.underPlayer", keys: ["channel.chatters", "player.latency", "ui.hideFollow", "ui.hideNotify", "ui.hideBitsOffer", "ui.hideGift", "ui.hideSubUpgrade"] },
        { title: "set.sec.chatUi", keys: ["ui.hideCheer", "ui.hideBitsBalance", "ui.hideLeaderboard"] },
        { title: "set.sec.clips", keys: ["ui.clipView"] },
      ],
    },
    { id: "general", icon: "sliders", view: "general" },
  ];

  // Строка зависит от другой настройки: выключена главная — строка бледнеет и не меняется.
  const DEPS = {
    "chat.smooth": "chat.ownList",
    "chat.smoothAuto": "chat.ownList", // порции быстрого чата — и при плавности 0 (12.10)
    "chat.stripes": "chat.ownList", // полоски — только у своего списка
    "chat.fontSize": "chat.ownList",
    "chat.lineGap": "chat.ownList",
    "chat.emoteGap": "chat.ownList",
    "player.compStrength": "player.compressor",
    "player.compAll": "player.compressor",
    "player.vodClockDate": "player.vodClock",
    "chat.maxLines": "chat.ownList",
    "chat.channelDelay": "chat.ownList",
    "chat.deletedDim": "chat.ownList",
    "chat.hideBlocked": "chat.ownList",
    "chat.nameRightClick": "chat.ownList",
    "chat.replyButton": "chat.ownList",
    "chat.copyButton": "chat.ownList",
    "chat.loginOnly": "chat.ownList", // имя рисует только свой список
    "chat.mentionHighlight": "chat.ownList", // подсвечивает только свой список
    "chat.mentionColor": (v) => v["chat.ownList"] !== false && v["chat.mentionHighlight"] !== false,
    "chat.mentionSound": "chat.ownList", // звенит только свой список
    "chat.firstMsg": "chat.ownList", // подсвечивает только свой список
    "chat.firstMsgColor": (v) => v["chat.ownList"] !== false && v["chat.firstMsg"] !== false,
    // События и баннеры — только в своём списке.
    "chat.eventsCenter": "chat.ownList",
    "chat.bannerRaid": "chat.ownList",
    "chat.raiders": "chat.ownList",
    "chat.bannerGifts": "chat.ownList",
    "chat.bannerShoutout": "chat.ownList",
    // «Антиспам» помечает строки только своего списка; все его пункты — при включённой функции.
    "spam.enabled": "chat.ownList",
    ...Object.fromEntries(
      ["modOnly", "showCount", "highlight", "selfColor", "multiColor", "countColorSelf", "countColorMulti", "minLength", "repeatMin", "windowSec", "memory", "ignoreTrailing", "fuzzy", "fuzzyWindow", "symbolMin", "burstMin", "burstWindowSec", "ignoreMods", "ignoreBroadcaster", "ignoreVips", "ignoreUsers"].map((k) => [
        "spam." + k,
        (v) => v["chat.ownList"] !== false && v["spam.enabled"] !== false,
      ])
    ),
    "spam.selfColor": (v) => v["chat.ownList"] !== false && v["spam.enabled"] !== false && v["spam.highlight"] === true,
    "spam.multiColor": (v) => v["chat.ownList"] !== false && v["spam.enabled"] !== false && v["spam.highlight"] === true,
    "spam.countColorSelf": (v) => v["chat.ownList"] !== false && v["spam.enabled"] !== false && v["spam.showCount"] !== false,
    "spam.countColorMulti": (v) => v["chat.ownList"] !== false && v["spam.enabled"] !== false && v["spam.showCount"] !== false,
    "spam.fuzzyThreshold": (v) => v["chat.ownList"] !== false && v["spam.enabled"] !== false && v["spam.fuzzy"] !== false,
    "spam.fuzzyWindow": (v) => v["chat.ownList"] !== false && v["spam.enabled"] !== false && v["spam.fuzzy"] !== false,
    "card.banReason": "card.enabled",
    "input.gifs": "input.menu",
    "input.menuKeep": "input.menu",
    "player.catchupTarget": "player.catchup",
    "player.catchupMaxRate": "player.catchup",
    "player.catchupNotice": "player.catchup",
    "player.catchupSyncFix": "player.catchup",
    "player.ambientLevel": "player.ambient",
    "player.ambientResponse": "player.ambient",
    "player.ambientDim": "player.ambient",
    "player.ambientChat": "player.ambient",
    "sidenav.previewSize": (v) => v["sidenav.preview"] !== "off",
    "sharedbans.place": (v) => v["sharedbans.show"] !== "off",
    "sharedbans.dimSeen": (v) => v["sharedbans.show"] !== "off",
    "eblo.blur": "eblo.previews",
    "eblo.reveal": (v) => v["eblo.previews"] !== false && v["eblo.blur"] !== false,
  };
  // Строка нужна только при условии — иначе скрыта целиком (срок Shift+щелчка — только у способа «Кнопки»).
  const SHOW = {
    "mod.lastTimeout": (v) => !v["mod.classic"] && v["mod.mode"] === "buttons",
  };

  // Значки разделов — клеточные (CPX.glyphs, «Мозаика» §4.8): 7×7 по 2 px в коробке 18 px.
  const ICONS = { lab: "flask", user: "user", chat: "message", at: "at", smile: "smile", keyboard: "kbd", sword: "sword", warn: "warning", play: "playBox", ambi: "ambi", tv: "tv", sliders: "sliders", layout: "layout", search: "search" };
  // eblo.id — знак сайта картинкой (его логотип, не клеточный).
  const icon = (name, size) =>
    name === "eblo" ? el("img", { class: "set-cat__logo", src: "../img/eblo/eblo-sign.svg", alt: "", width: size || 18, height: size || 18 }) : CPX.glyph(ICONS[name] || "dots", size || 18);

  /* Особые блоки разделов — списки и свои виды, которых форма по описаниям не рисует (settingInput
   * их пропускает). Файл области регистрирует: CPX.pages.groupBlock("mod", () => ({ head, tail })):
   * head встаёт в начало группы раздела, tail — после её строк. */
  const groupBlocks = new Map();
  CPX.pages.groupBlock = (group, fn) => groupBlocks.set(group, fn);
  /* Вид чата Twitch, из которого открыто окно настроек (присылает 94_settings_panel.js): CPX.pages.look —
   * последний (сырой, проверяет получатель), onLook(fn) — подписка. */
  const lookFns = new Set();
  CPX.pages.look = null;
  CPX.pages.onLook = (fn) => {
    lookFns.add(fn);
    return () => lookFns.delete(fn);
  };

  // Поле не трогаем, пока человек в нём печатает: иначе чужая правка затёрла бы набранное.
  const typing = (n) => document.activeElement === n;

  /** Поле «Мозаики»: обёртка-поверхность field k1 (у <select>/<input> псевдоэлементов нет). */
  const fld = (kids, cls) => el("span", { class: "fld cpx-mz cpx-k1 cpx-t-field" + (cls ? " " + cls : "") }, kids);

  function settingInput(d, values, lang) {
    const set = (v) => {
      values[d.key] = v;
      applyDeps();
      return CPX.ext.call("settings.set", { changes: { [d.key]: v } });
    };
    let input;
    let focusEl = null;
    // sync(v) — показать значение, пришедшее из другого места (Twitch, другая вкладка настроек).
    let sync = (v) => !typing(input) && (input.value = v);
    if (d.type === "bool") {
      input = el("input", { type: "checkbox", class: "switch" });
      input.checked = !!values[d.key];
      input.addEventListener("change", () => {
        if (d.permission && input.checked) return askPermission(d.permission, input, () => set(true));
        set(input.checked);
      });
      sync = (v) => (input.checked = !!v);
    } else if (d.type === "select") {
      // Закрытый вид — свой (поле k1 и шеврон клетками), раскрывающийся список — системный.
      const s = el(
        "select",
        null,
        d.options.map((o) => el("option", { value: o.v, text: o[lang] || o.en || String(o.v) }))
      );
      s.value = values[d.key];
      s.addEventListener("change", async () => {
        await set(s.value);
        if (d.key === "general.lang") location.reload();
      });
      input = fld([s, el("span", { class: "fld__chev", "aria-hidden": "true" }, [CPX.glyph("chev", 10, { cell: 2 })])], "fld--sel");
      focusEl = s;
      // Выбран вариант «выключено» (off в описании) — строка серая, как у выключенного тумблера (CSS по data-off).
      const offV = new Set(d.options.filter((o) => o.off).map((o) => String(o.v)));
      const markOff = () => input.toggleAttribute("data-off", offV.has(String(s.value)));
      s.addEventListener("change", markOff);
      markOff();
      sync = (v) => {
        if (!typing(s)) s.value = v;
        markOff();
      };
    } else if (d.type === "range") {
      // «1,1×» по-русски, «1.1×» по-английски; знак «×» — вплотную, прочие единицы — через пробел.
      const show = (v) => (lang === "ru" ? String(v).replace(".", ",") : String(v)) + (d.unit ? (d.unit === "×" ? "×" : " " + d.unit) : "");
      const out = el("output", { class: "range-val", text: show(values[d.key]) });
      const r = el("input", { type: "range", min: d.min, max: d.max, step: d.step || 1 });
      r.value = values[d.key];
      const box = el("span", { class: "range" }, [r, out]);
      // warnAbove (скорость догона, владелец 21.10): выше порога ползунок красный, под ним — красная надпись d.warn.
      // Меняется сразу при перетаскивании, а не после отпускания.
      const warn = d.warnAbove != null ? el("span", { class: "range-warn", text: txt(d.warn, lang), hidden: true }) : null;
      const mark = (v) => {
        if (!warn) return;
        const on = Number(v) > d.warnAbove + 1e-9;
        input.classList.toggle("range--warn", on);
        warn.hidden = !on;
      };
      r.addEventListener("input", () => {
        out.textContent = show(r.value);
        mark(r.value);
      });
      r.addEventListener("change", () => set(Number(r.value)));
      input = warn ? el("span", { class: "range-col" }, [box, warn]) : box;
      focusEl = r;
      mark(values[d.key]);
      sync = (v) => {
        if (typing(r)) return;
        r.value = v;
        out.textContent = show(v);
        mark(v);
      };
    } else if (d.type === "int") {
      // step "any": шаг считаем сами (bump), как settingsCoerce — кратно шагу от нуля. У браузера шаг идёт от
      // нижнего предела, и где предел ему не кратен (5 при шаге 10, 1 при шаге 100) «−» с 460 давал 455, а
      // сохранение округляло обратно в 460 — кнопка «не работала» (отзыв 05.11; у spam.memory так стоял «+»).
      const f = el("input", { type: "number", min: d.min, max: d.max, step: "any" });
      f.value = values[d.key];
      // Сразу привести к пределам и показать то, что сохранится (фон обрезал молча — в поле оставалось
      // «3000» при сохранённых 1000; пустое поле — умолчание).
      f.addEventListener("change", () => {
        const v = CPX.settingsCoerce(d.key, f.value === "" ? d.def : Number(f.value));
        f.value = v;
        set(v);
      });
      const bump = (dir) => {
        if (f.disabled) return;
        const cur = CPX.settingsCoerce(d.key, f.value === "" ? values[d.key] : Number(f.value));
        f.value = CPX.settingsCoerce(d.key, cur + dir * (d.step || 1));
        f.dispatchEvent(new Event("change", { bubbles: true }));
      };
      // Стрелки клавиатуры — тот же шаг, что у кнопок.
      f.addEventListener("keydown", (e) => {
        if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
        e.preventDefault();
        bump(e.key === "ArrowUp" ? 1 : -1);
      });
      // Системные стрелки скрыты — свои «−/+» (тот же шаг и то же сохранение, что по change).
      const step = (dir, label, g) => {
        const b = el("button", { type: "button", class: "fld__step cpx-mz cpx-mzb cpx-k1 cpx-t-raised", tabindex: "-1", "aria-label": CPX.t(label) }, [CPX.glyph(g, 14)]);
        b.addEventListener("click", (e) => {
          e.preventDefault();
          bump(dir);
        });
        return b;
      };
      input = fld([step(-1, "pages.less", "minus"), f, step(1, "pages.more", "plus")], "fld--num");
      focusEl = f;
      sync = (v) => !typing(f) && (f.value = v);
    } else if (d.type === "color") {
      input = el("input", { type: "color", class: "cpx-k1" });
      input.value = CPX.safe.hex(values[d.key]).slice(0, 7) || "#000000";
      // Поле браузера — только #rrggbb: прозрачность нынешнего цвета (#rrggbbaa) сохраняем, меняется только сам цвет.
      input.addEventListener("change", () => set(input.value + CPX.safe.hex(values[d.key]).slice(7)));
      sync = (v) => (input.value = CPX.safe.hex(v).slice(0, 7) || "#000000");
    } else if (d.type === "text") {
      // rows — многострочное поле во всю ширину строки (логины-исключения «Антиспама»).
      const f = d.rows ? el("textarea", { rows: d.rows, maxlength: d.max || 500, spellcheck: "false" }) : el("input", { type: "text", maxlength: d.max || 500 });
      f.value = values[d.key];
      f.addEventListener("change", () => set(f.value));
      input = fld([f], d.rows ? "fld--area" : "");
      focusEl = f;
      sync = (v) => !typing(f) && (f.value = v);
    } else {
      return null; // списки и особые виды — блоками своих областей (CPX.pages.groupBlock) или в окнах модулей
    }
    input.cpxSync = sync;
    input.cpxFocus = focusEl || input;
    return input;
  }

  const txt = (o, lang) => (o && (o[lang] || o.en)) || "";
  // Настройка показывается: не скрытая и не «только для Firefox» в другом браузере (рассинхрон звука — ошибка
  // Firefox до 157; в Chrome она ничего не делает — владелец 04.10: «чтобы никого не путать») и не «Картинка в картинке»
  // там, где браузер не умеет окно по вызову страницы (pipApi, 05.11; у такого Firefox своя плашка на видео).
  const GECKO = /\bFirefox\/\d/.test(navigator.userAgent);
  const shown = (d) => !!d && !d.hidden && !(d.firefoxOnly && !GECKO) && !(d.pipApi && document.pictureInPictureEnabled !== true);
  const norm = (s) => String(s || "").toLowerCase().replace(/ё/g, "е");

  // Отрисованные строки текущего вида: ключ → {row, input} (живое обновление и зависимости).
  let live = new Map();
  let values = {};

  function applyDeps() {
    for (const [key, r] of live) {
      if (SHOW[key] && r.row) r.row.hidden = !SHOW[key](values);
      const dep = DEPS[key];
      if (!dep) continue;
      const on = typeof dep === "function" ? dep(values) : !!values[dep];
      r.row.classList.toggle("is-off", !on);
      r.input.cpxFocus.disabled = !on;
    }
  }

  function settingRow(d) {
    const lang = CPX.i18n.lang;
    const input = settingInput(d, values, lang);
    if (!input) return null;
    const label = txt(d.label, lang) || d.key;
    const hint = txt(d.hint, lang);
    const id = "s-" + CPX.safe.ident(d.key.replace(/\./g, "-"));
    input.cpxFocus.id = id;
    const row = el("label", { class: "srow", for: id }, [
      el("span", { class: "srow__text" }, [el("span", { class: "srow__label", text: label }), hint ? el("span", { class: "srow__hint", text: hint }) : null]),
      input,
    ]);
    live.set(d.key, { row, input });
    return row;
  }

  function colorsRow(keys, lang) {
    const inputs = [];
    for (const k of keys) {
      const d = CPX.settingsDefs.get(k);
      if (!d) continue;
      const input = settingInput(d, values, lang);
      if (!input) continue;
      input.setAttribute("aria-label", txt(d.label, lang));
      input.title = txt(d.label, lang);
      live.set(k, { row: null, input });
      inputs.push(input);
    }
    if (!inputs.length) return null;
    return el("div", { class: "srow srow--static" }, [
      el("span", { class: "srow__text" }, [el("span", { class: "srow__label", text: CPX.t("set.colors") }), el("span", { class: "srow__hint", text: CPX.t("set.colors.hint") })]),
      el("span", { class: "srow__colors" }, inputs),
    ]);
  }

  /** Видимые настройки раздела по группам: порядок из sections, остальное — в последнюю группу. Названная в
   * ЛЮБОМ разделе остатком не идёт (иначе перенесённая — «Эксперименты» — задвоилась бы в разделе своей группы). */
  let namedAll = null;
  function catSections(cat) {
    if (!namedAll) {
      namedAll = new Set();
      for (const c of CATS) for (const s of c.sections || []) for (const k of [...(s.keys || []), ...(s.colors || [])]) namedAll.add(k);
    }
    const rest = [...CPX.settingsDefs.values()].filter((d) => (cat.groups || []).includes(d.group) && shown(d) && !namedAll.has(d.key) && d.type !== "list").map((d) => d.key);
    const out = (cat.sections || []).map((s) => Object.assign({}, s, { keys: (s.keys || []).slice() }));
    if (rest.length && out.length) out[out.length - 1].keys.push(...rest);
    return out;
  }

  /** Группа строк в карточке; title — ключ перевода (или готовый текст при raw). */
  function sectionEl(title, kids, raw) {
    const card = el("div", { class: "set-card" }, kids.filter(Boolean));
    if (!card.childNodes.length) return null;
    return el("section", { class: "set-sec" }, [title ? el("h2", { text: raw ? title : CPX.t(title) }) : null, card]);
  }

  function renderSettingsCat(cat) {
    const lang = CPX.i18n.lang;
    const parts = [];
    for (const s of catSections(cat)) {
      const kids = [];
      let block = null;
      if (s.block && groupBlocks.has(s.block)) block = CPX.safely("page:block:" + s.block, groupBlocks.get(s.block)) || null;
      if (block && block.head) kids.push(el("div", { class: "set-block" }, [block.head]));
      for (const k of s.keys) {
        const d = CPX.settingsDefs.get(k);
        if (shown(d)) kids.push(settingRow(d));
      }
      if (s.colors) kids.push(colorsRow(s.colors, lang));
      if (block && block.tail) kids.push(el("div", { class: "set-block" }, [block.tail]));
      const sec = sectionEl(s.title, kids);
      if (sec) parts.push(sec);
    }
    return parts;
  }

  /* ── Ивент: полоса на первой странице настроек (владелец 19.11 → 2.3.2) ─────────────────────────────────
   * Пока идёт ивент (bg/46_awards: публичные сведения сервера + «есть ли значок» у этого человека) — сверху «Аккаунта»
   * заметная полоса: значок, название, шаги (PLUS, для Kick — привязка Kick, «напиши в чат» с условием и кнопкой
   * «Открыть категорию/канал»), срок. Значок уже есть — «Значок получен». Сюда же ведёт щелчок по значку ивента в
   * верхней панели Twitch/Kick (94_settings_panel). Вид — «Полоса» (владелец 19.11 выбрал из трёх; срок — просто
   * «до 30 ноября»): одна строка — значок со свечением, название и условие, шаги метками, главная кнопка справа. */
  let evNode = null;
  let evKey = "";
  /** Ссылка площадки (Twitch/Kick) — новой вкладкой. */
  function outBtn(text, href, cls) {
    let url = "";
    try {
      const u = new URL(String(href));
      if (u.protocol === "https:" && /(^|\.)(twitch\.tv|kick\.com)$/.test(u.hostname)) url = u.href;
    } catch (_) {
      /* не адрес */
    }
    return url ? el("a", { class: "btn " + (cls || ""), href: url, target: "_blank", rel: "noopener noreferrer", text }) : null;
  }
  /** Шаги ивента для человека: [{done, title, text, btn}]. */
  function evSteps(e, me) {
    const p = PG.plus || {};
    const steps = [];
    const sub = p.subscribeUrl || p.site;
    if (me.plus) steps.push({ done: true, title: CPX.t("pages.ev.plus") });
    else
      steps.push({
        done: false,
        title: CPX.t(me.logged ? "pages.ev.plusNeed" : "pages.ev.plusLogin"),
        text: CPX.t("pages.ev.plusNeedText"),
        btn: linkBtn(CPX.t("pages.ev.plusGet"), sub, "btn-accent"),
      });
    if (e.platform === "kick") {
      if (me.kick) steps.push({ done: true, title: CPX.t("pages.ev.kick") });
      else steps.push({ done: false, title: CPX.t("pages.ev.kickNeed"), text: CPX.t("pages.ev.kickNeedText"), btn: linkBtn(CPX.t("pages.ev.kickLink"), p.site || sub, "btn-ghost") });
    }
    const t = (e.targets || [])[0];
    let text = e.hint;
    if (!text) {
      const chans = e.channels || [];
      const cat = (e.categories || [])[0];
      if (chans.length > 1) text = CPX.t("pages.ev.chatChans", { list: chans.map((c) => c.name).join(", ") });
      else if (chans.length && cat) text = CPX.t("pages.ev.chatChanCat", { ch: chans[0].name, cat });
      else if (chans.length) text = CPX.t("pages.ev.chatChan", { ch: chans[0].name });
      else text = CPX.t("pages.ev.chatCat", { cat: cat || "" });
      if (e.platform === "kick") text += CPX.t("pages.ev.onKick");
      if (e.need_live && chans.length) text += CPX.t("pages.ev.live");
    }
    steps.push({
      done: false,
      title: CPX.t("pages.ev.chat"),
      text,
      btn: t ? outBtn(CPX.t(t.kind === "channel" ? "pages.ev.openChan" : "pages.ev.openCat"), t.url, me.plus ? "btn-accent" : "btn-ghost") : null,
    });
    return steps;
  }
  /** Значок ивента: сначала копии фона строкой data: (крупная, 72 px) — страница за картинкой на сервер не ходит (20.11:
   *  хостер отвечал 403 — в полосе была битая картинка с подписью); нет их — адрес сервера. Не загрузилось ничего — без
   *  значка, но и без битой картинки. */
  const EV_DATA_RE = /^data:image\/(png|webp|gif);base64,[A-Za-z0-9+/=]+$/;
  function evArt(e, size) {
    const im = (PG.awards && PG.awards.img) || {};
    const list = [im.big, im.d2]
      .filter((u) => typeof u === "string" && EV_DATA_RE.test(u))
      .concat([CPX.safe.imgUrl(e.badge.big || "")])
      .filter(Boolean);
    const box = el("div", { class: "ev-art", style: "--ev-s:" + size + "px" });
    if (!list.length) return box;
    const glow = el("img", { class: "ev-art__glow", src: list[0], alt: "", "aria-hidden": "true" });
    const main = el("img", { class: "ev-art__img", src: list[0], alt: "" });
    let i = 0;
    main.addEventListener("error", () => {
      if (++i < list.length) glow.src = main.src = list[i];
      else (glow.remove(), main.remove());
    });
    box.append(glow, main);
    return box;
  }
  const evTag = () => el("span", { class: "ev-tag" }, [el("i", { class: "ev-tag__sq", "aria-hidden": "true" }), CPX.t("pages.ev.tag")]);
  // Дата конца — без года (как в кабинете: «до 30 ноября»).
  const evUntil = (e) => (e.ends_at ? el("span", { class: "ev-until muted small", text: CPX.t("pages.ev.until", { date: fmtDate(e.ends_at).replace(/\s*\d{4}\s*(г\.)?$/, "") }) }) : null);
  function evBanner(e, me) {
    const steps = evSteps(e, me);
    const next = steps.find((s) => !s.done);
    const done = steps.filter((s) => s.done).length;
    const dots = steps.map((s, i) => el("span", { class: "ev-dot" + (s.done ? " ev-dot--done" : s === next ? " ev-dot--now" : "") }, [el("i", { "aria-hidden": "true", text: s.done ? "" : String(i + 1) }), s.title]));
    return el("section", { class: "card ev" + (me.got ? " ev--got" : "") }, [
      evArt(e, 58),
      el("div", { class: "ev__body" }, [
        el("div", { class: "ev__head" }, [evTag(), evUntil(e)]),
        el("div", { class: "ev__title", text: e.title || CPX.t("pages.ev.badge", { title: e.badge.title }) }),
        el("div", { class: "ev__line muted small", text: me.got ? CPX.t("pages.ev.gotText") : next ? next.text || next.title : "" }),
        me.got ? null : el("div", { class: "ev__dots" }, dots.concat([el("span", { class: "muted small", text: CPX.t("pages.ev.steps", { done, all: steps.length }) })])),
      ]),
      el("div", { class: "ev__act" }, [me.got ? el("span", { class: "chip chip-ok", text: CPX.t("pages.ev.got") }) : next && next.btn ? next.btn : null]),
    ]);
  }

  // Стенд (dev): показать полосу в другом положении человека (вошёл, PLUS, значок есть) — снимки вариантов владельцу.
  if (CPX.dev) {
    CPX.pages.evDemo = (me) => {
      if (!PG.awards || !PG.awards.ev) return false;
      PG.awards = Object.assign({}, PG.awards, { me: Object.assign({}, PG.awards.me, me) });
      PG.render();
      return true;
    };
  }

  let evEndT = 0;
  function eventBanner() {
    const a = PG.awards;
    let e = a && a.ev;
    // Срок вышел, а рассылки фона ещё нет (фон спит, Twitch не открыт) — полосу не показывать; и перерисовать в сам
    // момент конца (ревью 19.11: «до 30 ноября» с кнопкой висело, пока окно не переоткроют).
    const left = e && e.ends_at ? e.ends_at * 1000 - Date.now() : Infinity;
    if (left <= 0) e = null;
    clearTimeout(evEndT);
    if (e && left < 2 ** 31 - 1) evEndT = setTimeout(() => PG.render(), left + 500);
    if (!e) {
      evNode = null;
      evKey = "";
      return null;
    }
    const me = a.me || {};
    const img = a.img || {};
    const key = JSON.stringify([e, me, PG.plus && PG.plus.active, CPX.i18n.lang, String(img.big || "").length, String(img.d2 || "").length]);
    if (evNode && key === evKey) return evNode;
    evKey = key;
    evNode = evBanner(e, me);
    return evNode;
  }

  /* ── Вид «Аккаунт»: то же, что popup (связь, вход, PLUS) ─────────────────── */

  let consentFailed = ""; // "" | "error" (фон не ответил) | "denied" (Firefox не разрешил)
  let consentWhy = ""; // причина «error» — как её сказал браузер
  // Секция «Связь с сервером» — постоянная (в ней полоса связи): перерисовка обновляет её на месте.
  let srvSec = null;
  function renderAccount() {
    const parts = [eventBanner(), serverSection()];
    if (consentOn()) {
      parts.push(sectionEl("set.sec.signin", [el("div", { class: "set-pad" }, [accountBlock()])]), sectionEl("set.sec.plus", [el("div", { class: "set-pad" }, [plusBlock(true)])]));
    }
    return parts;
  }
  function serverSection() {
    if (srvSec) {
      srvSec.consent.checked = consentOn();
      srvSec.paint();
      return srvSec.sec;
    }
    const consent = el("input", { type: "checkbox", class: "switch", id: "consent" });
    consent.checked = consentOn();
    consent.addEventListener("change", async () => {
      const on = consent.checked;
      // Во фрейме поверх Twitch согласие одним щелчком не включаем — страница согласия вкладкой (там
      // кнопка «Согласен»): чужой скрипт на twitch.tv мог бы подложить невидимый фрейм под щелчок
      // (ревью безопасности 01.10), а Firefox из фрейма может не показать запрос разрешения.
      if (on && document.body.classList.contains("embed")) {
        consent.checked = false;
        // Фон: во фрейме Firefox у страницы нет chrome.tabs (проверка 01.10).
        CPX.ext.call("consent.openWelcome").catch(() => {});
        return;
      }
      // Выключение — через фон: он снимает и разрешение Firefox (во фрейме нет chrome.permissions).
      if (!on) {
        consent.disabled = true;
        try {
          await CPX.ext.call("consent.revoke");
          CPX.pages.settings["general.consent"] = false;
          consentFailed = "";
        } catch (e) {
          consentFailed = "error";
          consentWhy = whyOf(e);
        } finally {
          consent.disabled = false;
          PG.refresh();
        }
        return;
      }
      const allowed = askDataCollection();
      consent.disabled = true;
      try {
        if (!(await allowed)) {
          consent.checked = false;
          consentFailed = "denied";
          return;
        }
        await CPX.ext.call("settings.set", { changes: { "general.consent": on } });
        CPX.pages.settings["general.consent"] = on;
        consentFailed = "";
      } catch (e) {
        consentFailed = "error"; // перерисовка вернёт переключатель в прежнее положение
        consentWhy = whyOf(e);
      } finally {
        consent.disabled = false;
        PG.refresh();
      }
    });
    const what = el("a", { href: chrome.runtime.getURL("pages/welcome.html"), target: "_blank", rel: "noopener", text: CPX.t("pages.consent.what") });
    const row = el("label", { class: "srow", for: "consent" }, [
      el("span", { class: "srow__text" }, [
        el("span", { class: "srow__label", text: CPX.t("pages.consent.toggle") }),
        el("span", { class: "srow__hint" }, [CPX.t("pages.consent.toggleHint") + " ", what]),
      ]),
      consent,
    ]);
    const errSlot = el("div");
    const lineRow = el("div", { class: "srow srow--static" });
    const sec = sectionEl("set.sec.server", [row, errSlot, lineRow]);
    const paint = () => {
      const failText = CPX.t(consentFailed === "denied" ? "pages.consentDenied" : "pages.consentError");
      setKids(errSlot, [consentFailed ? el("p", { class: "error", role: "alert" }, [failText, consentFailed === "error" ? whyEl(consentWhy) : null]) : null]);
      errSlot.hidden = !consentFailed;
      lineRow.hidden = !consentOn();
      if (consentOn()) setKids(lineRow, [serverLine()]);
    };
    srvSec = { sec, consent, paint };
    paint();
    return sec;
  }

  /* ── Вид «Основное»: язык, сброс, сведения ───────────────────────────────── */

  let resetAsk = false;
  let resetNote = "";
  function renderGeneral(redraw) {
    const lang = CPX.i18n.lang;
    const langDef = CPX.settingsDefs.get("general.lang");
    const appearDef = CPX.settingsDefs.get("general.noAppear");
    const parts = [sectionEl("set.sec.lang", [langDef ? settingRow(langDef) : null]), sectionEl("set.sec.look", [appearDef ? settingRow(appearDef) : null])];
    SITES.redraw = redraw;
    if (!siteKnown()) sitesRefresh();
    parts.push(
      sectionEl(
        CPX.t("pages.sites.title"),
        Object.keys(SITE_UI).map((s) =>
          el("div", { class: "srow srow--static" }, [
            el("span", { class: "srow__text" }, [
              el("span", { class: "srow__label", text: SITE_UI[s].title }),
              el("span", { class: "srow__hint", text: CPX.t(SITES.on[s] ? "pages.site.onHint" : "pages.site." + s + ".hint") }),
            ]),
            el("span", { class: "srow__btns" }, siteButtons(s, false)),
          ])
        ),
        true
      )
    );
    // Сброс: галочки и выборы (не списки, не скрытые, не согласие) и помеченное reset — способ модерации,
    // ползунок, сроки мута (ревью 05.10: обещали «во всех разделах», а это оставалось). Свои кнопки модерации,
    // избранное и вход остаются. Подтверждение — строкой (alert/confirm во фрейме на чужой странице
    // браузер не покажет).
    const resetKeys = [...CPX.settingsDefs.values()].filter((d) => (d.reset || (!d.hidden && d.type !== "list")) && !d.extOnly && d.key !== "general.lang").map((d) => d.key);
    const btns = [];
    if (!resetAsk) {
      const b = el("button", { class: "btn", type: "button", text: CPX.t("set.reset.btn") });
      b.addEventListener("click", () => {
        resetAsk = true;
        resetNote = "";
        redraw();
      });
      btns.push(b);
    } else {
      const yes = el("button", { class: "btn btn-danger", type: "button", text: CPX.t("set.reset.yes") });
      const no = el("button", { class: "btn btn-ghost", type: "button", text: CPX.t("set.reset.no") });
      yes.addEventListener("click", async () => {
        yes.disabled = true;
        try {
          // Свои кнопки модерации есть — способ («Кнопки»/«Классика») не трогаем: на «Ползунке» их не видно,
          // а подсказка обещает, что свои кнопки остаются (ревью 05.10).
          const own = JSON.stringify(CPX.pages.settings["mod.actions"]) !== JSON.stringify(CPX.settingsDefs.get("mod.actions").def);
          const keys = own ? resetKeys.filter((k) => k !== "mod.mode" && k !== "mod.classic") : resetKeys;
          await CPX.ext.call("settings.reset", { keys });
          const all = await CPX.ext.call("settings.getAll");
          Object.assign(CPX.pages.settings, all);
          resetNote = CPX.t("set.reset.done");
        } catch (e) {
          resetNote = CPX.t("pages.consentError") + " " + CPX.t("pages.errWhy", { why: whyOf(e) });
        }
        resetAsk = false;
        redraw();
      });
      no.addEventListener("click", () => {
        resetAsk = false;
        redraw();
      });
      btns.push(el("span", { class: "srow__ask", text: CPX.t("set.reset.sure") }), yes, no);
    }
    // Перенос настроек файлом (pages/34_backup.js, владелец 16.10).
    if (typeof CPX.pages.backupBlock === "function") parts.push(sectionEl(CPX.t("bk.sec"), [CPX.pages.backupBlock()], true));
    parts.push(
      sectionEl("set.sec.reset", [
        el("div", { class: "srow srow--static" }, [
          el("span", { class: "srow__text" }, [el("span", { class: "srow__label", text: CPX.t("set.reset") }), el("span", { class: "srow__hint", text: resetNote || CPX.t("set.reset.hint") })]),
          el("span", { class: "srow__btns" }, btns),
        ]),
      ])
    );
    const site = linkBtn(CPX.t("set.site"), "https://chat.eblo.id/chatterino", "btn-ghost");
    const what = el("a", { class: "btn btn-ghost", href: chrome.runtime.getURL("pages/welcome.html"), target: "_blank", rel: "noopener", text: CPX.t("set.what") });
    parts.push(
      sectionEl("set.sec.about", [
        el("div", { class: "srow srow--static" }, [
          el("span", { class: "srow__text" }, [el("span", { class: "srow__label", text: "Chatterino+" }), el("span", { class: "srow__hint", text: CPX.t("set.version", { v: CPX.version }) })]),
          el("span", { class: "srow__btns" }, [site, what].filter(Boolean)),
        ]),
      ])
    );
    void lang;
    return parts;
  }

  /* ── Поиск ───────────────────────────────────────────────────────────────── */

  // Особые блоки (своя разметка вместо строк формы) — по словам: в поиске ссылка «Открыть», иначе ползунок
  // и сроки мута поиском было не найти (ревью 05.10).
  const BLOCK_WORDS = {
    mod: ["ползун", "мут", "тайм", "срок", "бан", "модер", "кнопк", "удал", "slider", "timeout", "ban", "moder", "button", "delete"],
    mentionSound: ["звук", "звон", "стекл", "файл", "sound", "chime", "file"],
    mentionWords: ["слов", "фраз", "упомин", "ник", "word", "phrase", "mention", "nick"],
  };
  /** open(id раздела) — перейти в раздел (сбросив поиск). */
  function searchResults(q, open) {
    const lang = CPX.i18n.lang;
    const nq = norm(q);
    const parts = [];
    for (const cat of CATS) {
      if (!cat.groups) continue;
      const catTitle = CPX.t("set.cat." + cat.id);
      for (const s of catSections(cat)) {
        // Подпись группы — «Раздел · Группа»: короткие подписи («7TV») без неё были бы двусмысленны.
        const where = catTitle + (s.title ? " · " + CPX.t(s.title) : "");
        const rows = [];
        const words = (s.block && BLOCK_WORDS[s.block]) || [];
        if (open && nq.length >= 3 && words.some((w) => nq.includes(w) || w.includes(nq))) {
          const b = el("button", { class: "btn", type: "button", text: CPX.t("set.openBlock") });
          b.addEventListener("click", () => open(cat.id));
          rows.push(b);
        }
        for (const k of s.keys) {
          const d = CPX.settingsDefs.get(k);
          if (!shown(d) || (SHOW[k] && !SHOW[k](values))) continue; // скрытая у этого способа — не в выдачу
          if (!norm(txt(d.label, lang) + " " + txt(d.hint, lang) + " " + where).includes(nq)) continue;
          rows.push(settingRow(d));
        }
        if (rows.some(Boolean)) parts.push(sectionEl(where, rows, true));
      }
    }
    if (!parts.length) parts.push(el("div", { class: "set-empty" }, [CPX.glyph("search", 28), el("span", { text: CPX.t("set.nothing") })]));
    return parts;
  }

  /* ── Каркас ──────────────────────────────────────────────────────────────── */

  CPX.pages.add("options", async () => {
    // Во фрейме — по самому окну: адрес фрейма (и ?embed) выбирает тот, кто его вставил, — чужой
    // скрипт вставил бы без ?embed и получил согласие и выход одним щелчком (проверка 01.10).
    let framed = true;
    try {
      framed = window.top !== window;
    } catch (_) {
      /* чужое верхнее окно — тоже фрейм */
    }
    const embed = framed || new URLSearchParams(location.search).has("embed");
    document.body.classList.toggle("embed", embed);
    // Вкладка — своя оболочка с выбоинами; во фрейме оболочку даёт окно ядра на Twitch.
    if (!embed) CPX.pages.shell(document.querySelector(".set-shell"), "settings", document.querySelector(".set-shell__in"));
    values = CPX.pages.settings;
    const ver = document.getElementById("ver");
    if (ver) ver.textContent = CPX.t("pages.version", { v: CPX.version });

    const fromHash = () => {
      let h = "";
      try {
        h = decodeURIComponent((location.hash || "").slice(1)).replace(/^group-/, "");
      } catch (_) {
        return null; // испорченный адрес — раздел по умолчанию
      }
      return CATS.some((c) => c.id === h) ? h : null;
    };
    let current = fromHash() || "account";
    let query = "";

    const nav = document.getElementById("set-cats");
    const main = document.getElementById("settings");
    const q = document.getElementById("set-q");
    q.placeholder = CPX.t("set.search");
    q.setAttribute("aria-label", CPX.t("set.search"));
    document.getElementById("set-q-icon").replaceChildren(icon("search", 14));
    const navVer = document.getElementById("set-ver");
    if (navVer) navVer.textContent = "v" + CPX.version;

    const btns = new Map();
    for (const cat of CATS) {
      const b = el("button", { class: "set-cat cpx-mz cpx-k1", type: "button", role: "tab", "aria-selected": "false" }, [icon(cat.icon), el("span", { text: CPX.t("set.cat." + cat.id) })]);
      // Подпись раздела видна рядом — всплывающая не нужна; в узком окне (только значки, pages-20-settings.css)
      // она нужна — ставит syncNavTips (владелец 05.10: подсказки, повторяющие видимое, убрать).
      b.addEventListener("click", () => {
        query = "";
        q.value = "";
        show(cat.id);
        main.focus({ preventScroll: true });
      });
      btns.set(cat.id, b);
      nav.appendChild(b);
    }
    const narrowMq = window.matchMedia ? matchMedia("(max-width: 640px)") : null;
    function syncNavTips() {
      const narrow = !!(narrowMq && narrowMq.matches);
      for (const cat of CATS) {
        const b = btns.get(cat.id);
        if (narrow) b.dataset.pgTip = CPX.t("set.cat." + cat.id);
        else delete b.dataset.pgTip;
      }
    }
    syncNavTips();
    if (narrowMq && narrowMq.addEventListener) narrowMq.addEventListener("change", syncNavTips);

    function draw() {
      live = new Map();
      const cat = CATS.find((c) => c.id === current) || CATS[0];
      for (const [id, b] of btns) b.setAttribute("aria-selected", String(!query && id === cat.id));
      const parts = [];
      if (query) {
        const open = (id) => {
          query = "";
          q.value = "";
          show(id);
        };
        parts.push(el("header", { class: "set-head" }, [el("h1", { text: CPX.t("set.search") })]), ...searchResults(query, open));
      } else {
        // eblo.id — в шапке логотип-надпись сайта вместо слова.
        const h1 = cat.id === "eblo" ? el("h1", { class: "set-head__logo" }, [el("img", { src: "../img/eblo/eblo-logo.svg", alt: CPX.t("set.cat.eblo"), height: 32 })]) : el("h1", { text: CPX.t("set.cat." + cat.id) });
        parts.push(el("header", { class: "set-head" }, [h1, el("p", { text: CPX.t("set.desc." + cat.id) })]));
        if (cat.view === "account") parts.push(...renderAccount());
        else if (cat.view === "general") parts.push(...renderGeneral(draw));
        else parts.push(...renderSettingsCat(cat));
      }
      setKids(main, parts);
      applyDeps();
    }

    function show(id) {
      current = id;
      try {
        history.replaceState(null, "", location.pathname + location.search + "#" + id);
      } catch (_) {
        /* без адреса — не страшно */
      }
      main.scrollTop = 0;
      draw();
      // Окну поверх Twitch — какой раздел открыт (после перезагрузки фрейма вернётся он же).
      if (embed) {
        try {
          window.parent.postMessage({ cpxPanel: "section", id }, "*");
        } catch (_) {
          /* окна-родителя нет */
        }
      }
    }

    q.addEventListener("input", () => {
      query = q.value.trim();
      draw();
    });
    window.addEventListener("hashchange", () => {
      const h = fromHash();
      if (h && h !== current) show(h);
    });
    // Окно поверх Twitch: открыть раздел по его просьбе (только от родителя); вид его чата (ширина строки,
    // шрифт, тема — для живого примера ползунка, 30_mod_editor.js); сообщить, что загрузились.
    if (embed) {
      window.addEventListener("message", (e) => {
        const d = e.data;
        if (e.source !== window.parent || !d || typeof d !== "object") return;
        if (d.cpxPanel === "look" && d.look && typeof d.look === "object") {
          CPX.pages.look = d.look;
          for (const fn of lookFns) CPX.safely("page:look", () => fn(d.look));
          return;
        }
        if (d.cpxPanel !== "show" || typeof d.id !== "string") return;
        if (CATS.some((c) => c.id === d.id) && d.id !== current) {
          query = "";
          q.value = "";
          show(d.id);
        }
      });
      try {
        window.parent.postMessage({ cpxPanel: "hello" }, "*");
      } catch (_) {
        /* окна-родителя нет */
      }
    }
    // Окно поверх Twitch: Esc закрывает его (сначала — очищает поиск).
    if (embed) {
      document.addEventListener("keydown", (e) => {
        if (e.key !== "Escape" || e.defaultPrevented) return;
        if (q.value) {
          q.value = "";
          query = "";
          draw();
          return;
        }
        // Недописанное поле (число, срок мута) сохраняется по уходу из поля — уйти до закрытия окна:
        // браузер сразу пошлёт change, запись уйдёт в фон раньше, чем окно уберёт фрейм.
        const a = document.activeElement;
        if (a && a !== document.body && typeof a.blur === "function") a.blur();
        try {
          window.parent.postMessage({ cpxPanel: "close" }, "*");
        } catch (_) {
          /* окна-родителя нет */
        }
      });
    }

    // Настройку поменяли на Twitch (срок мута из ленты, галочка) или в другой вкладке — показать сразу.
    CPX.ext.on("settings.changed", (d) => {
      const ch = (d && d.changes) || {};
      Object.assign(values, ch);
      for (const k in ch) {
        const r = live.get(k);
        if (r) CPX.safely("page:sync", () => r.input.cpxSync(ch[k]));
      }
      applyDeps();
    });
    // Вход, PLUS, связь — перерисовать вид «Аккаунт», если он открыт.
    PG.renderers.add(() => {
      if (!query && current === "account") draw();
    });

    show(current);
    await PG.start();
  });
})();

if (CPX.dev) window.__CPX__ = CPX; // только для стенда проверки

document.addEventListener("DOMContentLoaded", () => CPX.pages.start());

// ── src/pages/30_mod_editor.js ──
/* Страница настроек, раздел «Модерация»: способ модерации и его настройки.
 *
 * СПОСОБ (mod.mode, владелец 04.10) — три плитки вверху: «Ползунок» (по умолчанию), «Кнопки», «Классика».
 * Выбор пишет mod.mode и снимает прежнюю галочку mod.classic. Ниже — только нужное выбранному способу:
 *   • Ползунок (src/common/39_mod_slider.js): ЖИВОЙ ПРИМЕР — колонка чата с несколькими сообщениями,
 *     тот же движок и те же стили, что в чате; ширина строки, шрифт, тема и цвета — как в чате, из
 *     которого открыто окно (94_settings_panel.js → CPX.pages.onLook; запоминается в localStorage этой
 *     страницы для вкладки настроек вне Twitch). Действия в примере никуда не уходят: строка тускнеет с
 *     пометкой, как в чате, ручка зеленеет; «Сбросить пример». Дальше — сроки мута (mod.slider: плашки,
 *     «Добавить» числом и единицей, «По умолчанию» с «Вернуть»), удаление в начале, бан в конце, ход.
 *   • Кнопки — свои кнопки (mod.actions) и сроки ленты мута (mod.timeouts); строка «Срок мута по
 *     Shift+щелчку» — обычная строка формы (20_pages.js показывает её только у этого способа).
 *   • Классика — свои кнопки.
 *   Сроки mod.timeouts — ещё и кнопки мута в карточке, поэтому блок есть при любом способе (в «Ползунке» и
 *   «Классике» — под именем «Сроки мута в карточке»).
 * До 01.10 кнопки настраивались в окне на Twitch (правый щелчок по мечу); решение владельца 01.10 —
 * модератор настраивает их один раз, в быстром доступе на Twitch они не нужны.
 *
 * Правила — как были в окне (research/04 §1.9, клиент ModerationPage.cpp):
 *   • свои кнопки: команда + значок (авто по виду команды или наш значок), порядок, удалить,
 *     «Добавить» (как клиент — /timeout {user.name} 300), «По умолчанию»;
 *   • 8 сроков ленты мута: число 1–99 + единица с/м/ч/д/н; дни ≤ 14, недели ≤ 2 (предел Twitch);
 *     строк ровно 8, как в клиенте.
 * ⚠️Урок клиента §1.12: пишем в настройки СРАЗУ по действию (Enter/уход из поля/кнопка) — без
 * отложенных таймеров; при уходе со страницы дописываем недописанное. Пустой список — законное
 * «очистил сам», никакого посева. Неверный срок не сохраняется (поле красное, прежний остаётся).
 * «По умолчанию» заменяет набор сразу, но рядом появляется «Вернуть» (случайное нажатие не стирает
 * настроенные кнопки). Сохранение правки поля не перестраивает список (Tab из поля команды не теряет
 * фокус): меняются только значок и метка своей строки.
 * Значения поменяли в другом месте (вторая вкладка настроек, стенд) — список перерисовывается, если
 * в нём нет недописанной правки и наша запись не в пути (иначе отголосок своей же записи сбивал бы
 * фокус посреди работы).
 *
 * ⚠️КОПИИ ИЗ МИРА TWITCH (у страницы свой мир: CPX.mod и CPX.ui здесь нет): правила validPair /
 * parseAction / normIcon — из src/main/80_mod_core.js, рисунки значков — из ICONS в
 * src/main/95_ui.js. Меняешь там — поменяй и здесь.
 */

(() => {
  CPX.i18n.add({
    ru: {
      "pages.mod.mode": "Способ модерации",
      "pages.mod.m.slider": "Ползунок",
      "pages.mod.m.sliderHint": "Тяните ручку у сообщения: чем дальше, тем строже",
      "pages.mod.m.buttons": "Кнопки",
      "pages.mod.m.buttonsHint": "Бан и мут со сроками у ника, плюс свои кнопки",
      "pages.mod.m.classic": "Классика",
      "pages.mod.m.classicHint": "Только свои кнопки — как в клиенте Chatterino",
      "pages.mod.noteSlider": "<b>Ползунок</b> — у каждого сообщения слева: тяните вправо — удалить, мут, бан; влево — разбан. Передумали — верните назад, нажмите Esc или уведите мышь вверх или вниз. <b>Меч</b> под полем ввода: щелчок — режим модератора Twitch, правый щелчок — включить или выключить ползунки.",
      "pages.mod.noteClassic": "<b>Классика</b> — ваши кнопки у каждого сообщения, как в клиенте Chatterino. <b>Меч</b> под полем ввода: щелчок — режим модератора Twitch, правый щелчок — кнопки у сообщений.",
      "pages.mod.try": "Попробуйте",
      "pages.mod.tryReset": "Сбросить пример",
      "pages.mod.tryHint": "Ширина, шрифт и тема — как в вашем чате. Здесь ничего никуда не отправляется.",
      "pages.mod.tryHintDef": "Ширина и шрифт — как в чате Twitch по умолчанию; откройте настройки из чата, и пример повторит ваш. Здесь ничего никуда не отправляется.",
      "pages.mod.pv.t1": "стример, а когда следующий стрим?",
      "pages.mod.pv.t2": "заходи на мой канал, там раздача!!!",
      "pages.mod.pv.t3": "чат, кто смотрит с телефона? у меня всё лагает",
      "pages.mod.pv.t4": "раздача скинов, ссылка в профиле",
      "pages.mod.pv.delBy": "(Удалено модератором {mod})",
      "pages.mod.pv.toBy": "(Мут {n} с от {mod})",
      "pages.mod.pv.banBy": "(Бан от {mod})",
      "pages.mod.pv.del": "(удалено)",
      "pages.mod.pv.to": "(мут {d})",
      "pages.mod.pv.ban": "(бан)",
      "pages.mod.stops": "Сроки мута",
      "pages.mod.stopsHint": "Ползунок останавливается на каждом сроке по порядку — от короткого к длинному. До 15 сроков, от 1 секунды до 14 дней.",
      "pages.mod.stopsList": "Сроки ползунка",
      "pages.mod.stopRm": "Убрать срок {d}",
      "pages.mod.stopN": "Новый срок",
      "pages.mod.stopUnit": "Единица нового срока",
      "pages.mod.stopDup": "Срок {d} уже есть",
      "pages.mod.stopMax": "Не больше 15 сроков — уберите лишний",
      "pages.mod.stopBad": "Срок — от 1 секунды до 14 дней",
      "pages.mod.stopsEmpty": "Сроков нет — на ползунке останутся удаление и бан.",
      "pages.mod.resetStops": "Сроки возвращены к стандартным",
      "pages.mod.slDel": "Удаление сообщения в начале",
      "pages.mod.slDelHint": "Первая ступень — удалить только это сообщение",
      "pages.mod.slBan": "Бан в конце",
      "pages.mod.slBanHint": "Последняя ступень — за «стенкой» после самого долгого мута",
      "pages.mod.slStep": "Ход ползунка",
      "pages.mod.slStepHint": "Ширина одной ступени; в узком чате ступени сжимаются сами",
      "pages.mod.slStep.s": "Короткий",
      "pages.mod.slStep.m": "Обычный",
      "pages.mod.slStep.l": "Длинный",
      "pages.mod.note": "<b>Меч</b> под полем ввода: щелчок — режим модератора Twitch, правый щелчок — кнопки у сообщений. <b>Мут</b>: щелчок — лента сроков, Shift+щелчок — прошлый срок ({last}), правый щелчок — 10 минут.",
      "pages.mod.buttons": "Свои кнопки",
      "pages.mod.buttonsHint": "Подстановки: {subs}. Команды /ban /timeout /unban /delete выполняет Chatterino+, остальные уходят в чат Twitch.",
      "pages.mod.live": "живая кнопка",
      "pages.mod.liveTip": "В новой системе вместо неё — живые «бан/разбан» и «мут»",
      "pages.mod.add": "Добавить",
      "pages.mod.reset": "По умолчанию",
      "pages.mod.empty": "Своих кнопок нет — у сообщений останутся только «бан» и «мут».",
      "pages.mod.icon": "Значок",
      "pages.mod.iconOf": "Значок кнопки {n}",
      "pages.mod.iconAuto": "Авто — по команде",
      "pages.mod.cmd": "Команда кнопки {n}",
      "pages.mod.up": "Выше",
      "pages.mod.down": "Ниже",
      "pages.mod.remove": "Убрать кнопку",
      "pages.mod.ph": "/timeout {user.name} 300",
      "pages.mod.durs": "Лента мута",
      "pages.mod.dursCard": "Сроки мута в карточке",
      "pages.mod.dursCardHint": "Кнопки мута в карточке пользователя, слева направо. Дни — до 14, недели — до 2 (предел Twitch).",
      "pages.mod.dursHint": "8 сроков слева направо. Дни — до 14, недели — до 2 (предел Twitch).",
      "pages.mod.dur": "Срок {n}",
      "pages.mod.unit": "Единица срока {n}",
      "pages.mod.bad": "Срок {n}: число 1–99, дни — до 14, недели — до 2",
      "pages.mod.saveErr": "Не сохранилось — расширение перезагружается? Попробуйте ещё раз",
      "pages.mod.resetActs": "Кнопки возвращены к стандартным",
      "pages.mod.resetDurs": "Сроки ленты возвращены к стандартным",
      "pages.mod.undo": "Вернуть",
      "pages.mod.u.s": "с",
      "pages.mod.u.m": "м",
      "pages.mod.u.h": "ч",
      "pages.mod.u.d": "д",
      "pages.mod.u.w": "н",
      "pages.mod.ut.s": "секунды",
      "pages.mod.ut.m": "минуты",
      "pages.mod.ut.h": "часы",
      "pages.mod.ut.d": "дни (до 14)",
      "pages.mod.ut.w": "недели (до 2)",
      "pages.mod.w.s": ({ n }) => n + " " + CPX.i18n.plural(n, ["секунду", "секунды", "секунд"]),
      "pages.mod.w.m": ({ n }) => n + " " + CPX.i18n.plural(n, ["минуту", "минуты", "минут"]),
      "pages.mod.w.h": ({ n }) => n + " " + CPX.i18n.plural(n, ["час", "часа", "часов"]),
      "pages.mod.w.d": ({ n }) => n + " " + CPX.i18n.plural(n, ["день", "дня", "дней"]),
      "pages.mod.w.w": ({ n }) => n + " " + CPX.i18n.plural(n, ["неделю", "недели", "недель"]),
      "pages.mod.ic.trash": "Корзина",
      "pages.mod.ic.eye": "Глаз",
      "pages.mod.ic.warning": "Предупреждение",
      "pages.mod.ic.shield": "Щит",
      "pages.mod.ic.pin": "Закреп",
      "pages.mod.ic.message": "Сообщение",
      "pages.mod.ic.user": "Человек",
      "pages.mod.ic.clock": "Часы",
      "pages.mod.ic.ban": "Кирпич",
      "pages.mod.ic.check": "Галочка",
      "pages.mod.ic.info": "Инфо",
      "pages.mod.ic.link": "Ссылка",
      "pages.mod.ic.copy": "Копия",
      "pages.mod.ic.smile": "Смайлик",
      "pages.mod.ic.refresh": "Обновить",
      "pages.mod.ic.history": "История",
    },
    en: {
      "pages.mod.mode": "Moderation style",
      "pages.mod.m.slider": "Slider",
      "pages.mod.m.sliderHint": "Drag the handle on a message: the farther, the harsher",
      "pages.mod.m.buttons": "Buttons",
      "pages.mod.m.buttonsHint": "Ban and timeout with durations by the name, plus your buttons",
      "pages.mod.m.classic": "Classic",
      "pages.mod.m.classicHint": "Only your own buttons — like in the Chatterino client",
      "pages.mod.noteSlider": "<b>Slider</b> — on the left of every message: drag right — delete, timeout, ban; left — unban. Changed your mind — drag back, press Esc or move the mouse up or down. <b>Sword</b> under the chat input: click — Twitch mod view, right-click — turn the sliders on or off.",
      "pages.mod.noteClassic": "<b>Classic</b> — your buttons on every message, like in the Chatterino client. <b>Sword</b> under the chat input: click — Twitch mod view, right-click — message buttons.",
      "pages.mod.try": "Try it",
      "pages.mod.tryReset": "Reset example",
      "pages.mod.tryHint": "Width, font and theme match your chat. Nothing is sent anywhere from here.",
      "pages.mod.tryHintDef": "Width and font match the default Twitch chat; open settings from the chat and the example will match yours. Nothing is sent anywhere from here.",
      "pages.mod.pv.t1": "streamer, when is the next stream?",
      "pages.mod.pv.t2": "come to my channel, giveaway inside!!!",
      "pages.mod.pv.t3": "chat, who is watching on mobile? everything lags for me",
      "pages.mod.pv.t4": "free skins, link in my profile",
      "pages.mod.pv.delBy": "(Deleted by {mod})",
      "pages.mod.pv.toBy": "({n}s Timeout by {mod})",
      "pages.mod.pv.banBy": "(Banned by {mod})",
      "pages.mod.pv.del": "(Deleted)",
      "pages.mod.pv.to": "(Timeout {d})",
      "pages.mod.pv.ban": "(Banned)",
      "pages.mod.stops": "Timeout durations",
      "pages.mod.stopsHint": "The slider stops at every duration in order — from the shortest to the longest. Up to 15, from 1 second to 14 days.",
      "pages.mod.stopsList": "Slider durations",
      "pages.mod.stopRm": "Remove duration {d}",
      "pages.mod.stopN": "New duration",
      "pages.mod.stopUnit": "Unit of the new duration",
      "pages.mod.stopDup": "{d} is already there",
      "pages.mod.stopMax": "No more than 15 durations — remove one",
      "pages.mod.stopBad": "Duration — from 1 second to 14 days",
      "pages.mod.stopsEmpty": "No durations — the slider keeps only delete and ban.",
      "pages.mod.resetStops": "Durations reset to defaults",
      "pages.mod.slDel": "Delete message first",
      "pages.mod.slDelHint": "The first step deletes just this message",
      "pages.mod.slBan": "Ban at the end",
      "pages.mod.slBanHint": "The last step — behind a “wall” after the longest timeout",
      "pages.mod.slStep": "Slider travel",
      "pages.mod.slStepHint": "Width of one step; in a narrow chat steps shrink by themselves",
      "pages.mod.slStep.s": "Short",
      "pages.mod.slStep.m": "Normal",
      "pages.mod.slStep.l": "Long",
      "pages.mod.note": "<b>Sword</b> under the chat input: click — Twitch mod view, right-click — message buttons. <b>Timeout</b>: click — duration strip, Shift+click — last duration ({last}), right-click — 10 minutes.",
      "pages.mod.buttons": "Custom buttons",
      "pages.mod.buttonsHint": "Placeholders: {subs}. /ban /timeout /unban /delete run in Chatterino+, other commands go to Twitch chat.",
      "pages.mod.live": "live button",
      "pages.mod.liveTip": "In the new system the live “ban/unban” and “timeout” replace it",
      "pages.mod.add": "Add",
      "pages.mod.reset": "Defaults",
      "pages.mod.empty": "No custom buttons — messages keep only “ban” and “timeout”.",
      "pages.mod.icon": "Icon",
      "pages.mod.iconOf": "Icon of button {n}",
      "pages.mod.iconAuto": "Auto — by command",
      "pages.mod.cmd": "Command of button {n}",
      "pages.mod.up": "Move up",
      "pages.mod.down": "Move down",
      "pages.mod.remove": "Remove button",
      "pages.mod.ph": "/timeout {user.name} 300",
      "pages.mod.durs": "Timeout strip",
      "pages.mod.dursCard": "Timeouts in the user card",
      "pages.mod.dursCardHint": "Timeout buttons in the user card, left to right. Days — up to 14, weeks — up to 2 (Twitch limit).",
      "pages.mod.dursHint": "8 durations, left to right. Days — up to 14, weeks — up to 2 (Twitch limit).",
      "pages.mod.dur": "Duration {n}",
      "pages.mod.unit": "Unit of duration {n}",
      "pages.mod.bad": "Duration {n}: number 1–99, days up to 14, weeks up to 2",
      "pages.mod.saveErr": "Not saved — is the extension reloading? Try again",
      "pages.mod.resetActs": "Buttons reset to defaults",
      "pages.mod.resetDurs": "Timeout durations reset to defaults",
      "pages.mod.undo": "Undo",
      "pages.mod.u.s": "s",
      "pages.mod.u.m": "m",
      "pages.mod.u.h": "h",
      "pages.mod.u.d": "d",
      "pages.mod.u.w": "w",
      "pages.mod.ut.s": "seconds",
      "pages.mod.ut.m": "minutes",
      "pages.mod.ut.h": "hours",
      "pages.mod.ut.d": "days (up to 14)",
      "pages.mod.ut.w": "weeks (up to 2)",
      "pages.mod.w.s": ({ n }) => n + (n === 1 ? " second" : " seconds"),
      "pages.mod.w.m": ({ n }) => n + (n === 1 ? " minute" : " minutes"),
      "pages.mod.w.h": ({ n }) => n + (n === 1 ? " hour" : " hours"),
      "pages.mod.w.d": ({ n }) => n + (n === 1 ? " day" : " days"),
      "pages.mod.w.w": ({ n }) => n + (n === 1 ? " week" : " weeks"),
      "pages.mod.ic.trash": "Trash",
      "pages.mod.ic.eye": "Eye",
      "pages.mod.ic.warning": "Warning",
      "pages.mod.ic.shield": "Shield",
      "pages.mod.ic.pin": "Pin",
      "pages.mod.ic.message": "Message",
      "pages.mod.ic.user": "Person",
      "pages.mod.ic.clock": "Clock",
      "pages.mod.ic.ban": "No entry",
      "pages.mod.ic.check": "Check",
      "pages.mod.ic.info": "Info",
      "pages.mod.ic.link": "Link",
      "pages.mod.ic.copy": "Copy",
      "pages.mod.ic.smile": "Smile",
      "pages.mod.ic.refresh": "Refresh",
      "pages.mod.ic.history": "History",
    },
  });

  const t = CPX.t;
  // «Мозаика»: созданные узлы сразу получают классы поверхностей по своему виду (10_ext.js: CPX.pages.mz).
  const el = (...a) => CPX.pages.mz(CPX.el(...a));
  const PICK = ["trash", "eye", "warning", "shield", "pin", "message", "user", "clock", "ban", "check", "info", "link", "copy", "smile", "refresh", "history"];
  const SUBS = ["{user.name}", "{user.id}", "{msg.id}", "{msg.text}", "{channel.name}", "{channel.id}", "{my.name}"];
  const UNITS = ["s", "m", "h", "d", "w"];
  const PICK_COLS = 8;

  /* ── значки: копия ICONS из src/main/95_ui.js (20×20, линия 1.6) ──────────────────────── */
  const SVG_NS = "http://www.w3.org/2000/svg";
  const RING = "M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0z";
  const ICONS = {
    close: "M5.5 5.5l9 9M14.5 5.5l-9 9",
    check: "M4.5 10.5l3.6 3.6L15.5 6.5",
    plus: "M10 4.5v11M4.5 10h11",
    chevronDown: "M5.5 8l4.5 4.5L14.5 8",
    chevronUp: "M5.5 12l4.5-4.5 4.5 4.5",
    clock: [RING, "M10 6.2V10l2.8 1.8"],
    ban: [RING, "M5.05 5.05l9.9 9.9"],
    checkCircle: [RING, "M6.8 10.2l2.2 2.2 4.3-4.6"],
    trash: ["M3.8 5.6h12.4", "M8 5.6V3.8h4v1.8", "M5.4 5.6l.9 10.6h7.4l.9-10.6", "M8.3 8.6v4.8M10 8.6v4.8M11.7 8.6v4.8"],
    pin: ["M6.5 3.2h7", "M8 3.2v4.4L5.3 11.2h9.4L12 7.6V3.2", "M10 11.2v5.6"],
    sword: ["M16.5 3.5l-.7 3.3-6.9 6.9-2.6-2.6 6.9-6.9z", "M4.6 10.6l4.8 4.8", "M6.4 13.6l-2.9 2.9"],
    warning: ["M10 3.3l7.4 13H2.6z", "M10 8.2v3.6", "M10 14.1v.1"],
    info: [RING, "M10 9.2v4.6", "M10 6.4v.1"],
    copy: ["M7.2 7.2h8.3v9.3H7.2z", "M12.8 7.2V3.5H4.5v9.3h2.7"],
    smile: [RING, "M7 11.6c.8 1.3 1.8 1.9 3 1.9s2.2-.6 3-1.9", "M7.6 7.9v.3M12.4 7.9v.3"],
    user: ["M13 6.8a3 3 0 1 1-6 0 3 3 0 0 1 6 0z", "M4.2 16.5c.7-2.8 3-4.3 5.8-4.3s5.1 1.5 5.8 4.3"],
    history: ["M3.6 10a6.4 6.4 0 1 0 1.9-4.5", "M3.4 3.8v3h3", "M10 6.6V10l2.4 1.5"],
    refresh: ["M16 10a6 6 0 1 1-1.8-4.3", "M16.2 3.6v3.5h-3.5"],
    eye: ["M2.5 10s2.8-5 7.5-5 7.5 5 7.5 5-2.8 5-7.5 5-7.5-5-7.5-5z", "M12.3 10a2.3 2.3 0 1 1-4.6 0 2.3 2.3 0 0 1 4.6 0z"],
    link: ["M8.6 11.4l2.8-2.8", "M9.3 6.3l1.2-1.2a3 3 0 0 1 4.3 4.3l-1.2 1.2", "M10.7 13.7l-1.2 1.2a3 3 0 0 1-4.3-4.3l1.2-1.2"],
    message: ["M4.2 4.2h11.6a1 1 0 0 1 1 1v7.6a1 1 0 0 1-1 1H9.2l-4 3v-3h-1a1 1 0 0 1-1-1V5.2a1 1 0 0 1 1-1z"],
    sliders: ["M3.8 6h6.2M14.8 6h1.4M3.8 14h1.4M9.8 14h6.4", "M14.6 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM9.6 14a2 2 0 1 1-4 0 2 2 0 0 1 4 0z"],
    calendar: ["M4 5.5h12v10.7H4z", "M4 8.8h12", "M7.2 3.6v3.4M12.8 3.6v3.4"],
    shield: ["M10 3.2l6 2.3v4.2c0 3.6-2.6 6-6 7.1-3.4-1.1-6-3.5-6-7.1V5.5z"],
  };
  function icon(name, size) {
    const s = document.createElementNS(SVG_NS, "svg");
    s.setAttribute("width", size || 16);
    s.setAttribute("height", size || 16);
    s.setAttribute("viewBox", "0 0 20 20");
    s.setAttribute("aria-hidden", "true");
    s.setAttribute("focusable", "false");
    s.setAttribute("class", "ico");
    const def = ICONS[name] || ICONS.close;
    for (const d of Array.isArray(def) ? def : [def]) {
      const p = document.createElementNS(SVG_NS, "path");
      p.setAttribute("d", d);
      s.appendChild(p);
    }
    return s;
  }

  /* ── правила: копия из src/main/80_mod_core.js ────────────────────────────────────────── */
  const UNIT_SEC = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 };
  /** Пара [единица, число] клиента или null: число 1–99, дни ≤ 14, недели ≤ 2. */
  function validPair(p) {
    if (!Array.isArray(p) || p.length < 2) return null;
    const u = String(p[0]).toLowerCase();
    const n = Number(p[1]);
    if (!UNIT_SEC[u] || !Number.isInteger(n) || n < 1 || n > 99) return null;
    if ((u === "d" && n > 14) || (u === "w" && n > 2)) return null;
    return [u, n];
  }
  // Значки своих кнопок: наши имена и пути клиента qrc:/buttons/….
  const ICON_NAMES = ["trash", "eye", "warning", "shield", "pin", "message", "user", "clock", "ban", "check", "checkCircle", "info", "link", "copy", "smile", "refresh", "history", "sword", "sliders", "calendar"];
  const QRC = { visible: "eye", trashcan: "trash", ban: "ban", unban: "ban", mod: "shield", vip: "user", pin: "pin" };
  /** Как клиент (ModerationAction.cpp): тип команды и две строки подписи для кнопки без значка. */
  function parseAction(pattern) {
    const tm = /^[./]timeout.* (\d+)([mhdw]?)/.exec(pattern);
    if (tm) {
      const sec = Number(tm[1]) * (UNIT_SEC[tm[2]] || 1);
      let l1;
      let l2;
      if (sec < 60) (l1 = String(sec)), (l2 = "s");
      else if (sec < 3600) (l1 = String(Math.floor(sec / 60))), (l2 = "m");
      else if (sec < 86400) (l1 = String(Math.floor(sec / 3600))), (l2 = "h");
      else if (sec < 604800) (l1 = String(Math.floor(sec / 86400))), (l2 = "d");
      else (l1 = sec > 2 * 604800 ? ">2" : String(Math.floor(sec / 604800))), (l2 = "w");
      return { type: "timeout", line1: l1, line2: l2 };
    }
    if (pattern.startsWith("/ban ")) return { type: "ban", line1: "", line2: "" };
    if (pattern.startsWith("/delete ")) return { type: "delete", line1: "", line2: "" };
    const x = pattern.replace(/[!/.]/g, "");
    return { type: "custom", line1: x.slice(0, 2), line2: x.slice(2, 4) };
  }
  function normIcon(ic) {
    ic = String(ic || "").trim();
    if (!ic) return "";
    const q = /^qrc:\/*buttons\/([a-z]+)\.(?:png|svg)$/i.exec(ic);
    if (q) return QRC[q[1].toLowerCase()] || "";
    if (ICON_NAMES.includes(ic)) return ic;
    return CPX.safe.imgUrl(ic) || "";
  }
  function normAction(a) {
    if (!a || typeof a !== "object") return null;
    const pattern = String(a.pattern == null ? "" : a.pattern)
      .replace(/[\r\n]+/g, " ")
      .trim()
      .slice(0, 500);
    if (!pattern) return null;
    return Object.assign({ pattern, icon: normIcon(a.icon) }, parseAction(pattern));
  }
  // Копия правила 80_mod_core.js liveReplaced: в «Кнопках» живые бан/мут заменяют только стандартные команды.
  const LIVE_RE = /^[./](?:ban\s+\{user\.name\}|timeout\s+\{user\.name\}\s+600s?)$/i;
  const liveReplaced = (n) => !!n && (n.type === "ban" || n.type === "timeout") && LIVE_RE.test(n.pattern);
  function durationWords(sec) {
    sec = Math.round(Number(sec) || 0);
    for (const u of ["w", "d", "h", "m"]) if (sec >= UNIT_SEC[u] && sec % UNIT_SEC[u] === 0) return t("pages.mod.w." + u, { n: sec / UNIT_SEC[u] });
    return t("pages.mod.w.s", { n: sec });
  }

  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const def = (key) => CPX.settingsDefs.get(key).def;
  /** Разметка из доверенной строки перевода: только <b>…</b>, всё прочее — текстом. */
  function rich(text, cls) {
    const box = el("p", { class: cls });
    for (const part of String(text).split(/(<b>[^<]*<\/b>)/)) {
      const m = /^<b>([^<]*)<\/b>$/.exec(part);
      box.appendChild(m ? el("b", { text: m[1] }) : document.createTextNode(part));
    }
    return box;
  }

  /* ── вид чата для живого примера ползунка ──────────────────────────────────────────────── */
  // Присылает окно поверх Twitch (94_settings_panel.js chatLook → 20_pages.js CPX.pages.onLook); копия —
  // в localStorage страниц расширения, чтобы и вкладка настроек вне Twitch рисовала пример как ваш чат.
  // Данные приходят из окна Twitch — всё проверяем (числа в пределах, цвета — только вида #… / rgb() / hsl()).
  const LOOK_KEY = "cpx-chat-look";
  const COLOR_RE = /^(#[0-9a-f]{3,8}|(?:rgb|hsl)a?\([0-9.,%\s/]+\))$/i;
  function lookOf(raw) {
    const L = raw && typeof raw === "object" ? raw : {};
    const num = (v, a, z, d) => {
      const n = Number(v);
      return Number.isFinite(n) && n >= a && n <= z ? n : d;
    };
    const light = L.light === true;
    const c = L.c && typeof L.c === "object" ? L.c : {};
    const col = (v, d) => (typeof v === "string" && COLOR_RE.test(v.trim()) ? v.trim() : d);
    return {
      known: L.known === true,
      w: Math.round(num(L.w, 200, 1600, 340)),
      fs: num(L.fs, 9, 32, 13),
      lh: num(L.lh, 12, 48, 20),
      light,
      ts: L.ts === true,
      me: typeof L.me === "string" ? L.me.slice(0, 25) : "",
      c: {
        bg: col(c.bg, light ? "#ffffff" : "#18181b"),
        text: col(c.text, light ? "#0e0e10" : "#efeff1"),
        alt: col(c.alt, light ? "#323239" : "#dedee3"),
        alt2: col(c.alt2, light ? "#53535f" : "#adadb8"),
        hover: col(c.hover, light ? "rgba(0, 0, 0, 0.05)" : "rgba(255, 255, 255, 0.06)"),
      },
    };
  }
  function storedLook() {
    if (CPX.pages.look) return CPX.pages.look;
    try {
      return JSON.parse(localStorage.getItem(LOOK_KEY) || "null");
    } catch (_) {
      return null;
    }
  }
  let lookSink = null; // пример последней отрисовки раздела
  CPX.pages.onLook((raw) => {
    if (raw && raw.known) {
      try {
        localStorage.setItem(LOOK_KEY, JSON.stringify(lookOf(raw)));
      } catch (_) {
        /* без памяти — пример вне Twitch будет обычного вида */
      }
    }
    if (lookSink) lookSink(raw);
  });

  CPX.pages.groupBlock("mod", () => {
    const S = CPX.pages.settings || {};
    const MODES = ["slider", "buttons", "classic"];
    const modeOf = (all) => (all["mod.classic"] ? "classic" : MODES.includes(all["mod.mode"]) ? all["mod.mode"] : "slider");
    let mode = modeOf(S);
    let classic = mode === "classic";
    let lastTimeout = CPX.safe.num(S["mod.lastTimeout"], 1, 1209600, 600) | 0;

    // Рабочие копии: в acts могут быть пустые строки (человек стёр команду) — в настройки они не
    // попадают, а строка не пропадает у него из-под курсора.
    let acts = [];
    let durs = [];
    let dirty = false;
    const inflight = { acts: 0, durs: 0, sl: 0, mode: 0 };
    const loadActs = (raw) => {
      acts = (Array.isArray(raw) ? raw : []).map(normAction).filter(Boolean).map((a) => ({ pattern: a.pattern, icon: a.icon }));
    };
    const loadDurs = (raw) => {
      const d = def("mod.timeouts");
      durs = [];
      for (let i = 0; i < 8; i++) durs.push(validPair(Array.isArray(raw) ? raw[i] : null) || d[i].slice());
    };
    loadActs(S["mod.actions"]);
    loadDurs(S["mod.timeouts"]);
    const cleanActs = () => acts.filter((a) => a.pattern.trim()).map((a) => ({ pattern: a.pattern.trim(), icon: a.icon || "" }));

    const status = () => el("p", { class: "error", role: "alert", hidden: true });
    const say = (box, text) => {
      box.textContent = text || "";
      box.hidden = !text;
    };
    const actErr = status(); // ошибки своих кнопок — под их списком
    const durErr = status(); // ошибки сроков — под сеткой сроков

    function send(kind, changes, errBox) {
      inflight[kind]++;
      return CPX.ext
        .call("settings.set", { changes })
        .catch(() => say(errBox, t("pages.mod.saveErr")))
        .finally(() => inflight[kind]--);
    }
    function commitActs() {
      dirty = false;
      say(actErr, "");
      actUndo.hide();
      return send("acts", { "mod.actions": cleanActs() }, actErr);
    }
    function commitDurs() {
      durUndo.hide();
      return send("durs", { "mod.timeouts": durs.map((p) => [p[0], p[1]]) }, durErr);
    }
    // Недописанная команда (печатал и закрыл вкладку, не уходя из поля) — дописать.
    window.addEventListener("pagehide", () => dirty && commitActs());

    /** «Вернуть» рядом с «По умолчанию»: сразу после сброса и до следующей правки (15 с). */
    function undoBar() {
      const text = el("span");
      const btn = el("button", { type: "button", class: "linkbtn", text: t("pages.mod.undo") });
      const bar = el("span", { class: "mod-undo", role: "status", hidden: true }, [text, btn]);
      let timer = 0;
      let restore = null;
      btn.addEventListener("click", () => {
        const fn = restore;
        bar.hide();
        if (fn) fn();
      });
      bar.show = (msg, fn) => {
        text.textContent = msg + " · ";
        restore = fn;
        bar.hidden = false;
        clearTimeout(timer);
        timer = setTimeout(() => bar.hide(), 15000);
      };
      bar.hide = () => {
        clearTimeout(timer);
        restore = null;
        // Фокус был на «Вернуть» — не теряем его вместе с исчезающей кнопкой.
        const had = document.activeElement === btn;
        bar.hidden = true;
        if (had && bar.parentNode) {
          const first = bar.parentNode.querySelector("button");
          if (first) first.focus();
        }
      };
      return bar;
    }
    const actUndo = undoBar();
    const durUndo = undoBar();

    /* ── значок кнопки (превью = выбор значка) ───────────────────────────────── */
    // Как кнопка у сообщения (81_mod_buttons.js): https — картинка, имя — наш значок, без значка —
    // корзина/кирпич по команде, иначе две строки текста клиента («10» над «m»).
    function iconNode(a) {
      const n = normAction(a) || { type: "custom", line1: "", line2: "", icon: "" };
      if (n.icon && /^https:/.test(n.icon)) return el("img", { src: n.icon, alt: "" });
      if (n.icon) return icon(n.icon, 16);
      if (n.type === "delete") return icon("trash", 16);
      if (n.type === "ban") return icon("ban", 16);
      return el("span", { class: "mod-txt" }, [el("span", { text: n.line1 }), el("span", { text: n.line2 })]);
    }

    let picker = null; // открытый выбор значка: { box, close }
    function openPicker(a, wrap, prev, sync) {
      if (picker) {
        const again = picker.prev === prev; // второй щелчок по тому же значку — просто закрыть
        picker.close(false);
        if (again) return;
      }
      const cap = el("div", { class: "mod-icons__cap", "aria-hidden": "true" });
      const items = [];
      const opt = (id, label, kids, cls) => {
        const b = el("button", { type: "button", class: cls + " cpx-mz cpx-k1", role: "menuitemradio", "aria-checked": String((a.icon || "") === id), "aria-label": label, "data-pg-tip": label }, kids);
        b.addEventListener("click", () => {
          a.icon = id;
          commitActs();
          sync();
          close(true);
        });
        const show = () => (cap.textContent = label);
        b.addEventListener("mouseenter", show);
        b.addEventListener("focus", show);
        items.push(b);
        return b;
      };
      const auto = opt("", t("pages.mod.iconAuto"), [el("span", { text: t("pages.mod.iconAuto") }), icon("check", 14)], "mod-icons__auto");
      const grid = el("div", { class: "mod-icons__grid", role: "group" }, PICK.map((n) => opt(n, t("pages.mod.ic." + n), [icon(n, 18)], "mod-icons__it")));
      // Всплывашка tip k2.
      const box = el("div", { class: "mod-icons cpx-mz cpx-k2 cpx-t-tip", role: "menu", "aria-label": t("pages.mod.icon") }, [auto, grid, cap]);
      const cur = items.find((b) => b.getAttribute("aria-checked") === "true");
      cap.textContent = cur ? cur.getAttribute("aria-label") : "";
      box.addEventListener("mouseleave", () => (cap.textContent = cur ? cur.getAttribute("aria-label") : ""));
      // Стрелки: влево/вправо — по одному, вверх/вниз — рядом сетки; «Авто» — над первым рядом.
      box.addEventListener("keydown", (e) => {
        const i = items.indexOf(document.activeElement);
        let j = -1;
        if (e.key === "Escape") j = -2;
        else if (e.key === "ArrowRight") j = Math.min(items.length - 1, i + 1);
        else if (e.key === "ArrowLeft") j = Math.max(0, i - 1);
        else if (e.key === "ArrowDown") j = i <= 0 ? 1 : Math.min(items.length - 1, i + PICK_COLS);
        else if (e.key === "ArrowUp") j = i <= PICK_COLS ? 0 : i - PICK_COLS;
        else if (e.key === "Home") j = 0;
        else if (e.key === "End") j = items.length - 1;
        else return;
        e.preventDefault();
        e.stopPropagation();
        if (j === -2) close(true);
        else items[j].focus();
      });
      const outside = (e) => !wrap.contains(e.target) && close(false);
      const leave = (e) => e.relatedTarget && !wrap.contains(e.relatedTarget) && close(false);
      function close(refocus) {
        if (picker !== me) return;
        picker = null;
        document.removeEventListener("pointerdown", outside, true);
        wrap.removeEventListener("focusout", leave);
        box.remove();
        prev.setAttribute("aria-expanded", "false");
        if (refocus) prev.focus();
      }
      const me = { prev, close };
      picker = me;
      wrap.appendChild(box);
      prev.setAttribute("aria-expanded", "true");
      document.addEventListener("pointerdown", outside, true);
      wrap.addEventListener("focusout", leave);
      (cur || auto).focus();
    }

    /* ── свои кнопки ─────────────────────────────────────────────────────────── */
    const list = el("div", { class: "mod-list", role: "list" });
    let rows = [];
    function actionRow(a, i) {
      const prev = el("button", { type: "button", class: "mod-prev cpx-mz cpx-mzb cpx-k1 cpx-t-field", title: t("pages.mod.icon"), "aria-label": t("pages.mod.iconOf", { n: i + 1 }), "aria-haspopup": "menu", "aria-expanded": "false" });
      const wrap = el("div", { class: "mod-pick" }, [prev]);
      const tag = el("span", { class: "mod-tag cpx-mz cpx-k1 cpx-t-raised", text: t("pages.mod.live"), title: t("pages.mod.liveTip") });
      const field = el("input", { type: "text", class: "mod-cmd", maxlength: 500, spellcheck: "false", autocomplete: "off", placeholder: t("pages.mod.ph"), "aria-label": t("pages.mod.cmd", { n: i + 1 }) });
      field.value = a.pattern;
      const row = el("div", { class: "mod-act", role: "listitem" });
      // Тип команды мог смениться (значок «авто», метка «живая») — меняется только эта строка,
      // список не перестраивается: Tab из поля не теряет фокус.
      const sync = () => {
        const n = normAction(a);
        const live = !classic && liveReplaced(n);
        prev.replaceChildren(iconNode(a));
        tag.hidden = !live;
        row.classList.toggle("mod-act--off", live);
      };
      field.addEventListener("input", () => {
        a.pattern = field.value;
        dirty = true;
      });
      field.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        commitActs();
        sync();
      });
      field.addEventListener("change", () => {
        if (!dirty) return;
        commitActs();
        sync();
      });
      prev.addEventListener("click", () => openPicker(a, wrap, prev, sync));
      const iconBtn = (name, label, cls, disabled, onClick) => {
        // Стрелки и крестик — без всплывающей подсказки (значки понятны, владелец 05.10); название — для диктора.
        const b = el("button", { type: "button", class: "ibtn cpx-mz cpx-mzb cpx-k1" + (cls ? " " + cls : ""), "aria-label": label }, [icon(name, 16)]);
        b.disabled = !!disabled;
        b.addEventListener("click", onClick);
        return b;
      };
      const mv = (d, which) => () => {
        const j = i + d;
        if (j < 0 || j >= acts.length) return;
        [acts[i], acts[j]] = [acts[j], acts[i]];
        commitActs();
        renderList();
        // Фокус — на ту же стрелку переехавшей строки (или на соседнюю, если та стала неактивной).
        const r = rows[j];
        const b = r && (r[which].disabled ? r[which === "up" ? "down" : "up"] : r[which]);
        if (b && !b.disabled) b.focus();
      };
      const up = iconBtn("chevronUp", t("pages.mod.up"), "", i === 0, mv(-1, "up"));
      const down = iconBtn("chevronDown", t("pages.mod.down"), "", i === acts.length - 1, mv(1, "down"));
      const del = iconBtn("close", t("pages.mod.remove"), "ibtn-danger", false, () => {
        acts.splice(i, 1);
        commitActs();
        renderList();
        const r = rows[Math.min(i, rows.length - 1)];
        const f = r ? r.del : addBtn;
        if (f) f.focus();
      });
      // Поле — на обёртке-поверхности field k1 (у <input> псевдоэлементов нет).
      row.append(wrap, el("span", { class: "fld mod-cmdw cpx-mz cpx-k1 cpx-t-field" }, [field]), tag, el("span", { class: "mod-act__ctl" }, [up, down, del]));
      sync();
      return { el: row, sync, up, down, del, field };
    }
    function renderList() {
      if (picker) picker.close(false);
      rows = acts.map((a, i) => actionRow(a, i));
      list.replaceChildren(...rows.map((r) => r.el));
      if (!rows.length) list.appendChild(el("p", { class: "mod-empty", text: t("pages.mod.empty") }));
    }

    const addBtn = el("button", { type: "button", class: "btn" }, [icon("plus", 16), t("pages.mod.add")]);
    addBtn.addEventListener("click", () => {
      acts.push({ pattern: "/timeout {user.name} 300", icon: "" });
      commitActs();
      renderList();
      const r = rows[rows.length - 1];
      if (r) r.field.focus();
    });
    const resetActs = el("button", { type: "button", class: "btn btn-ghost", text: t("pages.mod.reset") });
    resetActs.addEventListener("click", () => {
      const before = cleanActs();
      const d = def("mod.actions").map((a) => ({ pattern: a.pattern, icon: a.icon }));
      if (same(before, d)) return;
      acts = d;
      commitActs();
      renderList();
      actUndo.show(t("pages.mod.resetActs"), () => {
        acts = before.map((a) => Object.assign({}, a));
        commitActs();
        renderList();
      });
    });
    const subsHint = el("p", { class: "hint" });
    // Подстановки — отдельными метками: строка перевода без vars сохраняет «{subs}» как есть.
    const [hA, hB] = t("pages.mod.buttonsHint").split("{subs}");
    subsHint.append(hA || "");
    SUBS.forEach((s, k) => subsHint.append(k ? " " : "", el("code", { text: s })));
    subsHint.append(hB || "");
    renderList();
    const actsBox = el("div", { class: "sub mod-sec", id: "mod-actions" }, [
      el("h3", { text: t("pages.mod.buttons") }),
      list,
      actErr,
      el("div", { class: "actions" }, [addBtn, resetActs, actUndo]),
      subsHint,
    ]);

    /* ── сроки ленты мута ────────────────────────────────────────────────────── */
    const grid = el("div", { class: "mod-durs" });
    const bad = new Set(); // номера неверных полей: сообщение — про первое из них
    const showBad = () => say(durErr, bad.size ? t("pages.mod.bad", { n: Math.min(...bad) + 1 }) : "");
    function durCell(i) {
      const p = durs[i];
      const num = el("input", { class: "mod-dur__n", type: "number", min: "1", max: "99", step: "1", inputmode: "numeric", "aria-label": t("pages.mod.dur", { n: i + 1 }) });
      num.value = String(p[1]);
      const numw = el("span", { class: "fld mod-dur__w cpx-mz cpx-k1 cpx-t-field" }, [num]);
      let unit = p[0];
      const check = () => {
        const wrong = !validPair([unit, Number(num.value)]);
        numw.classList.toggle("bad", wrong);
        num.setAttribute("aria-invalid", String(wrong));
        if (wrong) bad.add(i);
        else bad.delete(i);
        return wrong;
      };
      const save = () => {
        const wrong = check();
        showBad();
        if (wrong) return;
        const next = [unit, Number(num.value)];
        if (durs[i][0] === next[0] && durs[i][1] === next[1]) return;
        durs[i] = next;
        commitDurs();
      };
      num.addEventListener("change", save);
      num.addEventListener("keydown", (e) => e.key === "Enter" && save());
      num.addEventListener("input", check);
      // Единица — переключатель из 5 (как радиокнопки: стрелки двигают выбор, Tab — одна остановка).
      const seg = el("div", { class: "seg", role: "radiogroup", "aria-label": t("pages.mod.unit", { n: i + 1 }) });
      const btns = UNITS.map((u) => {
        const b = el("button", { type: "button", role: "radio", class: "cpx-mz cpx-k1", title: t("pages.mod.ut." + u), "aria-label": t("pages.mod.ut." + u), text: t("pages.mod.u." + u) });
        b.addEventListener("click", () => pickUnit(u));
        return b;
      });
      const paintSeg = () =>
        btns.forEach((b, k) => {
          const on = UNITS[k] === unit;
          b.setAttribute("aria-checked", String(on));
          b.tabIndex = on ? 0 : -1;
        });
      function pickUnit(u, focus) {
        unit = u;
        paintSeg();
        if (focus) btns[UNITS.indexOf(u)].focus();
        save();
      }
      seg.addEventListener("keydown", (e) => {
        const k = UNITS.indexOf(unit);
        let j = -1;
        if (e.key === "ArrowRight" || e.key === "ArrowDown") j = (k + 1) % UNITS.length;
        else if (e.key === "ArrowLeft" || e.key === "ArrowUp") j = (k + UNITS.length - 1) % UNITS.length;
        else return;
        e.preventDefault();
        pickUnit(UNITS[j], true);
      });
      seg.append(...btns);
      paintSeg();
      return el("div", { class: "mod-dur" }, [el("span", { class: "mod-dur__cap", "aria-hidden": "true", text: String(i + 1) }), numw, seg]);
    }
    function renderDurs() {
      bad.clear();
      showBad();
      grid.replaceChildren(...durs.map((_, i) => durCell(i)));
    }
    const resetDurs = el("button", { type: "button", class: "btn btn-ghost", text: t("pages.mod.reset") });
    resetDurs.addEventListener("click", () => {
      const before = durs.map((p) => p.slice());
      const d = def("mod.timeouts").map((p) => p.slice());
      if (same(before, d)) return renderDurs(); // вернуть неверно набранное поле к сохранённому
      durs = d;
      commitDurs();
      renderDurs();
      durUndo.show(t("pages.mod.resetDurs"), () => {
        durs = before.map((p) => p.slice());
        commitDurs();
        renderDurs();
      });
    });
    renderDurs();
    // Те же сроки — у кнопок мута в карточке (86_card_view ladderPairs) при ЛЮБОМ способе: в «Ползунке» и
    // «Классике» блок называется по карточке (ревью 05.10: прежде его было не найти, а в карточке — иные сроки).
    const dursTitle = el("h3", { text: t("pages.mod.durs") });
    const dursHint = el("p", { class: "hint", text: t("pages.mod.dursHint") });
    const dursBox = el("div", { class: "sub mod-sec", id: "mod-timeouts" }, [dursTitle, grid, durErr, el("div", { class: "actions" }, [resetDurs, durUndo]), dursHint]);

    /* ── ползунок: сроки, удаление и бан, ход ────────────────────────────────── */
    const MS = CPX.modSlider;
    const STEPS = ["s", "m", "l"];
    const slFrom = (all) => ({
      stops: MS.stops(all["mod.slider"]),
      del: all["mod.sliderDel"] !== false,
      ban: all["mod.sliderBan"] !== false,
      step: STEPS.includes(all["mod.sliderStep"]) ? all["mod.sliderStep"] : "m",
    });
    let sl = slFrom(S);
    const stopErr = status();
    const stopUndo = undoBar();
    function commitSl(changes) {
      if ("mod.slider" in changes) stopUndo.hide();
      return send("sl", changes, stopErr);
    }

    const stopList = el("div", { class: "mod-stops", role: "group", "aria-label": t("pages.mod.stopsList") });
    let stopBtns = [];
    // Плашка срока = кнопка «убрать» (как у тегов): щелчок — срок уходит, фокус — на соседнюю.
    function renderStops(focusAt) {
      stopBtns = sl.stops.map((secs, i) => {
        const label = t("pages.mod.stopRm", { d: MS.short(secs) });
        const b = el("button", { type: "button", class: "mod-stop cpx-mz cpx-k1 cpx-t-raised", "aria-label": label }, [el("span", { text: MS.short(secs) }), icon("close", 12)]);
        b.addEventListener("click", () => {
          sl.stops = sl.stops.filter((x) => x !== secs);
          say(stopErr, "");
          commitSl({ "mod.slider": sl.stops.slice() });
          renderStops(i);
        });
        return b;
      });
      stopList.replaceChildren(...stopBtns);
      if (!stopBtns.length) stopList.appendChild(el("p", { class: "mod-empty", text: t("pages.mod.stopsEmpty") }));
      if (focusAt != null) (stopBtns[Math.min(focusAt, stopBtns.length - 1)] || addN).focus();
    }

    // Новый срок: число + единица (с, мин, ч, д) → «Добавить» или Enter.
    const AU = ["s", "m", "h", "d"];
    const AUK = { s: 1, m: 60, h: 3600, d: 86400 };
    const addN = el("input", { class: "mod-dur__n", type: "number", min: "1", max: "999", step: "1", inputmode: "numeric", placeholder: "15", "aria-label": t("pages.mod.stopN") });
    const addNw = el("span", { class: "fld mod-dur__w cpx-mz cpx-k1 cpx-t-field" }, [addN]);
    let addU = "m";
    const addUBtns = AU.map((u) => {
      const b = el("button", { type: "button", role: "radio", class: "cpx-mz cpx-k1", text: CPX.t("msl.u." + u) });
      b.addEventListener("click", () => pickAddU(u));
      return b;
    });
    const addSeg = el("div", { class: "seg seg--wide", role: "radiogroup", "aria-label": t("pages.mod.stopUnit") }, addUBtns);
    function pickAddU(u, focus) {
      addU = u;
      addUBtns.forEach((b, k) => {
        const on = AU[k] === u;
        b.setAttribute("aria-checked", String(on));
        b.tabIndex = on ? 0 : -1;
      });
      if (focus) addUBtns[AU.indexOf(u)].focus();
    }
    addSeg.addEventListener("keydown", (e) => {
      const k = AU.indexOf(addU);
      let j = -1;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") j = (k + 1) % AU.length;
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") j = (k + AU.length - 1) % AU.length;
      else return;
      e.preventDefault();
      pickAddU(AU[j], true);
    });
    pickAddU("m");
    const addStopBtn = el("button", { type: "button", class: "btn" }, [icon("plus", 16), t("pages.mod.add")]);
    function addStop() {
      const n = Number(addN.value);
      const secs = n * AUK[addU];
      if (!addN.value || !Number.isInteger(n) || n < 1 || secs > MS.MAX) {
        addNw.classList.add("bad");
        addN.focus();
        return say(stopErr, t("pages.mod.stopBad"));
      }
      if (sl.stops.includes(secs)) return say(stopErr, t("pages.mod.stopDup", { d: MS.short(secs) }));
      if (sl.stops.length >= MS.MAX_STOPS) return say(stopErr, t("pages.mod.stopMax"));
      say(stopErr, "");
      sl.stops = MS.stops(sl.stops.concat(secs));
      commitSl({ "mod.slider": sl.stops.slice() });
      addN.value = "";
      renderStops();
      const nb = stopBtns[sl.stops.indexOf(secs)];
      if (nb) {
        nb.classList.add("mod-stop--new");
        setTimeout(() => nb.classList.remove("mod-stop--new"), 1200);
      }
      addN.focus();
    }
    addStopBtn.addEventListener("click", addStop);
    addN.addEventListener("keydown", (e) => e.key === "Enter" && addStop());
    addN.addEventListener("input", () => {
      addNw.classList.remove("bad");
      say(stopErr, "");
    });
    const resetStops = el("button", { type: "button", class: "btn btn-ghost", text: t("pages.mod.reset") });
    resetStops.addEventListener("click", () => {
      const before = sl.stops.slice();
      const d = MS.DEF.slice();
      if (same(before, d)) return;
      sl.stops = d;
      say(stopErr, "");
      commitSl({ "mod.slider": d.slice() });
      renderStops();
      stopUndo.show(t("pages.mod.resetStops"), () => {
        sl.stops = before.slice();
        commitSl({ "mod.slider": before.slice() });
        renderStops();
      });
    });
    renderStops();
    const stopsBox = el("div", { class: "sub mod-sec", id: "mod-stops" }, [
      el("h3", { text: t("pages.mod.stops") }),
      stopList,
      el("div", { class: "mod-stop-add" }, [addNw, addSeg, addStopBtn]),
      stopErr,
      el("div", { class: "actions" }, [resetStops, stopUndo]),
      el("p", { class: "hint", text: t("pages.mod.stopsHint") }),
    ]);

    // Удаление в начале и бан в конце — тумблеры строками формы; ход — три сегмента.
    function switchRow(key, prop, label) {
      const id = "s-" + key.replace(/\./g, "-");
      const input = el("input", { type: "checkbox", class: "switch", id });
      input.checked = sl[prop];
      input.addEventListener("change", () => {
        sl[prop] = input.checked;
        commitSl({ [key]: input.checked });
      });
      const row = el("label", { class: "srow", for: id }, [
        el("span", { class: "srow__text" }, [el("span", { class: "srow__label", text: t(label) }), el("span", { class: "srow__hint", text: t(label + "Hint") })]),
        input,
      ]);
      return { row, sync: () => (input.checked = sl[prop]) };
    }
    const delRow = switchRow("mod.sliderDel", "del", "pages.mod.slDel");
    const banRow = switchRow("mod.sliderBan", "ban", "pages.mod.slBan");
    const stepBtns = STEPS.map((k) => {
      const b = el("button", { type: "button", role: "radio", class: "cpx-mz cpx-k1", text: t("pages.mod.slStep." + k) });
      b.addEventListener("click", () => pickStep(k));
      return b;
    });
    const stepSeg = el("div", { class: "seg seg--wide", role: "radiogroup", "aria-label": t("pages.mod.slStep") }, stepBtns);
    const paintStep = () =>
      stepBtns.forEach((b, i) => {
        const on = STEPS[i] === sl.step;
        b.setAttribute("aria-checked", String(on));
        b.tabIndex = on ? 0 : -1;
      });
    function pickStep(k, focus) {
      if (focus) stepBtns[STEPS.indexOf(k)].focus();
      if (k === sl.step) return;
      sl.step = k;
      paintStep();
      commitSl({ "mod.sliderStep": k });
    }
    stepSeg.addEventListener("keydown", (e) => {
      const i = STEPS.indexOf(sl.step);
      let j = -1;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") j = Math.min(STEPS.length - 1, i + 1);
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") j = Math.max(0, i - 1);
      else return;
      e.preventDefault();
      pickStep(STEPS[j], true);
    });
    paintStep();
    const stepRow = el("div", { class: "srow srow--static" }, [
      el("span", { class: "srow__text" }, [el("span", { class: "srow__label", text: t("pages.mod.slStep") }), el("span", { class: "srow__hint", text: t("pages.mod.slStepHint") })]),
      stepSeg,
    ]);

    /* ── живой пример ползунка (см. шапку) ───────────────────────────────────── */
    let look = lookOf(storedLook());
    const pvList = CPX.el("div", { class: "mod-pv__list" });
    const pv = CPX.el("div", { class: "mod-pv" }, [pvList]);
    const tryHint = el("p", { class: "hint" });
    const tryReset = el("button", { type: "button", class: "linkbtn", text: t("pages.mod.tryReset"), hidden: true });
    tryReset.addEventListener("click", () => pvBuild());
    const tryBox = el("div", { class: "sub mod-sec mod-try", id: "mod-try" }, [el("div", { class: "mod-try__head" }, [el("h3", { text: t("pages.mod.try") }), tryReset]), pv, tryHint]);
    const dimDeleted = S["chat.deletedDim"] !== false;
    const SAMPLES = [
      ["mila_v", "#FF69B4", "t1"],
      ["spam_bot_3000", "#9ACD32", "t2"],
      ["kotik_228", "#1E90FF", "t3"],
      ["spam_bot_3000", "#9ACD32", "t4"],
    ];
    let pvCtxs = [];
    /** Строка — как src/main/41_list_line.js (buildMessage): .cpx-msg > .cpx-msg__in > .cpx-msg__main. */
    function pvLine(user, color, text, ts) {
      const mod = CPX.el("span", { class: "cpx-mod cpx-mod--sl" });
      const body = CPX.el("span", { class: "cpx-body", text });
      const name = CPX.el("span", { class: "cpx-name", style: { color } }, [CPX.el("span", { class: "cpx-name__dn", text: user.login })]);
      const main = CPX.el("span", { class: "cpx-msg__main" }, [
        CPX.el("span", { class: "cpx-ts", text: ts }),
        mod,
        CPX.el("span", { class: "cpx-user" }, [CPX.el("span", { class: "cpx-badges" }), name]),
        CPX.el("span", { class: "cpx-colon", text: ": ", "aria-hidden": "true" }),
        body,
      ]);
      const line = CPX.el("div", { class: "cpx-msg" }, [CPX.el("div", { class: "cpx-msg__in" }, [main])]);
      const ctx = { user, text, deleted: null, el: { line, mod, body } };
      line._pv = ctx;
      return ctx;
    }
    function pvBuild() {
      for (const c of pvCtxs) clearTimeout(c.user.timer);
      const users = new Map();
      const now = Date.now();
      pvCtxs = SAMPLES.map(([login, color, key], i) => {
        if (!users.has(login)) users.set(login, { login, banned: false, timer: 0 });
        const ts = new Date(now - (SAMPLES.length - i) * 47000).toLocaleTimeString(CPX.i18n.lang, { hour: "2-digit", minute: "2-digit" });
        return pvLine(users.get(login), color, t("pages.mod.pv." + key), ts);
      });
      pvList.replaceChildren(...pvCtxs.map((c) => c.el.line));
      pvCtxs.forEach(pvHandle);
      tryReset.hidden = true;
    }
    const pvHandle = (c) => c.el.mod.replaceChildren(MS.handle({ banned: c.user.banned }));
    const pvPaintUser = (u) => pvCtxs.forEach((c) => c.user === u && pvHandle(c));
    /** Наказанная строка — как в чате (41_list_line.js deletedBody + 81_mod_buttons.js): тусклая, с пометкой. */
    function pvMark(c, info) {
      c.deleted = info;
      const me = look.me;
      const tag =
        info.action === "ban"
          ? me
            ? t("pages.mod.pv.banBy", { mod: me })
            : t("pages.mod.pv.ban")
          : info.action === "timeout"
          ? me
            ? t("pages.mod.pv.toBy", { n: info.secs, mod: me })
            : t("pages.mod.pv.to", { d: MS.short(info.secs) })
          : me
          ? t("pages.mod.pv.delBy", { mod: me })
          : t("pages.mod.pv.del");
      const body = c.el.body;
      body.textContent = "";
      if (dimDeleted) {
        c.el.line.classList.add("cpx-del");
        body.append(c.text, CPX.el("span", { class: "cpx-del-tag", text: tag }));
      } else body.append(CPX.el("span", { class: "cpx-del-detailed", text: c.text }), CPX.el("span", { class: "cpx-del-by", text: tag }));
      c.el.line.classList.add("cpx-mod-dim");
    }
    MS.attach(pvList, {
      ctx: (line) => line._pv || null,
      plan: (c) => MS.plan({ stops: sl.stops, del: sl.del && !c.deleted, ban: sl.ban, unban: c.user.banned }),
      step: () => MS.STEP[sl.step] || MS.STEP.m,
      apply(c, step) {
        const u = c.user;
        tryReset.hidden = false;
        if (step.kind === "del") return pvMark(c, { action: "delete" });
        clearTimeout(u.timer);
        if (step.kind === "unban") u.banned = false;
        else {
          u.banned = true;
          const info = step.kind === "ban" ? { action: "ban" } : { action: "timeout", secs: step.secs };
          for (const x of pvCtxs) if (x.user === u) pvMark(x, info);
          // Короткий мут истекает и здесь — ручка снова серая, как в чате.
          if (step.kind === "to" && step.secs <= 60) {
            u.timer = setTimeout(() => {
              u.banned = false;
              pvPaintUser(u);
            }, step.secs * 1000);
          }
        }
        pvPaintUser(u);
      },
    });
    function applyLook() {
      pv.classList.toggle("tw-root--theme-light", look.light);
      pv.classList.toggle("tw-root--theme-dark", !look.light);
      pvList.classList.toggle("cpx-ts-on", look.ts);
      const st = pv.style;
      st.width = look.w + "px";
      st.fontSize = look.fs + "px";
      st.lineHeight = look.lh + "px";
      st.setProperty("--color-background-base", look.c.bg);
      st.setProperty("--color-text-base", look.c.text);
      st.setProperty("--color-text-alt", look.c.alt);
      st.setProperty("--color-text-alt-2", look.c.alt2);
      st.setProperty("--color-background-interactable-alpha-hover", look.c.hover);
      tryHint.textContent = t(look.known ? "pages.mod.tryHint" : "pages.mod.tryHintDef");
    }
    applyLook();
    pvBuild();
    // Окно поверх Twitch прислало вид чата (может прийти и после отрисовки раздела).
    lookSink = (raw) => {
      look = lookOf(raw);
      applyLook();
    };

    /* ── способ модерации: плитки и пояснение ─────────────────────────────────── */
    const modeRaw = { "mod.mode": S["mod.mode"], "mod.classic": !!S["mod.classic"] };
    const modeErr = status();
    const tileEls = MODES.map((m) => {
      const b = el("button", { type: "button", role: "radio", class: "mod-mode cpx-mz cpx-k1" }, [
        el("span", { class: "mod-mode__t", text: t("pages.mod.m." + m) }),
        el("span", { class: "mod-mode__h", text: t("pages.mod.m." + m + "Hint") }),
      ]);
      b.addEventListener("click", () => pickMode(m));
      return b;
    });
    const tiles = el("div", { class: "mod-modes", role: "radiogroup", "aria-label": t("pages.mod.mode") }, tileEls);
    tiles.addEventListener("keydown", (e) => {
      const k = MODES.indexOf(mode);
      let j = -1;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") j = (k + 1) % MODES.length;
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") j = (k + MODES.length - 1) % MODES.length;
      else return;
      e.preventDefault();
      pickMode(MODES[j]);
      tileEls[j].focus();
    });
    const paintTiles = () =>
      tileEls.forEach((b, k) => {
        const on = MODES[k] === mode;
        b.setAttribute("aria-checked", String(on));
        b.tabIndex = on ? 0 : -1;
      });
    function pickMode(m) {
      if (m === mode) return;
      modeRaw["mod.mode"] = m;
      modeRaw["mod.classic"] = false;
      setMode(m);
      say(modeErr, "");
      send("mode", { "mod.mode": m, "mod.classic": false, "mod.modeChosen": true }, modeErr);
    }
    function setMode(m) {
      mode = m;
      classic = m === "classic";
      paintTiles();
      paintNote();
      paintTail();
      rows.forEach((r) => r.sync()); // метки «живая кнопка» — только у «Кнопок»
    }
    const noteBox = el("div", { class: "mod-notew" });
    function paintNote() {
      const key = mode === "slider" ? "pages.mod.noteSlider" : mode === "classic" ? "pages.mod.noteClassic" : "pages.mod.note";
      noteBox.replaceChildren(rich(t(key, { last: durationWords(lastTimeout) }), "mod-note cpx-mz cpx-k1 cpx-t-well"));
    }
    const tail = el("div", { class: "mod-ed" });
    const sliderBox = el("div", { class: "mod-slider" }, [tryBox, stopsBox, el("div", { class: "mod-slopts" }, [delRow.row, banRow.row, stepRow])]);
    function paintTail() {
      const card = mode !== "buttons";
      dursTitle.textContent = t(card ? "pages.mod.dursCard" : "pages.mod.durs");
      dursHint.textContent = t(card ? "pages.mod.dursCardHint" : "pages.mod.dursHint");
      tail.replaceChildren(...(mode === "slider" ? [sliderBox, dursBox] : [actsBox, dursBox]));
    }
    paintTiles();
    paintNote();
    paintTail();

    /* ── правки из других мест ───────────────────────────────────────────────── */
    function external(ch) {
      if ("mod.mode" in ch || "mod.classic" in ch) {
        if ("mod.mode" in ch) modeRaw["mod.mode"] = ch["mod.mode"];
        if ("mod.classic" in ch) modeRaw["mod.classic"] = !!ch["mod.classic"];
        const m = modeOf(modeRaw);
        if (m !== mode) setMode(m); // метки «живая» — на месте, фокус остаётся где был
      }
      if (!inflight.sl) {
        const was = sl;
        sl = slFrom(Object.assign({ "mod.slider": was.stops, "mod.sliderDel": was.del, "mod.sliderBan": was.ban, "mod.sliderStep": was.step }, ch));
        if (!same(was.stops, sl.stops)) {
          stopUndo.hide();
          renderStops();
        }
        if (was.del !== sl.del) delRow.sync();
        if (was.ban !== sl.ban) banRow.sync();
        if (was.step !== sl.step) paintStep();
      }
      if ("mod.lastTimeout" in ch) {
        lastTimeout = CPX.safe.num(ch["mod.lastTimeout"], 1, 1209600, 600) | 0;
        paintNote();
      }
      if ("mod.actions" in ch && !inflight.acts && !dirty && !same(ch["mod.actions"], cleanActs())) {
        loadActs(ch["mod.actions"]);
        actUndo.hide();
        renderList();
      }
      if ("mod.timeouts" in ch && !inflight.durs) {
        const was = durs;
        loadDurs(ch["mod.timeouts"]);
        if (!same(was, durs)) {
          durUndo.hide();
          renderDurs();
        }
      }
    }
    CPX.ext.on("settings.changed", (d) => d && d.changes && CPX.safely("page:mod:sync", () => external(d.changes)));
    // Фон засыпал: события, пришедшие за это время, могли потеряться — перечитать.
    CPX.ext.on("ext:reconnect", () =>
      CPX.ext
        .call("settings.getAll")
        .then((all) => CPX.safely("page:mod:sync", () => external(all)))
        .catch(() => {})
    );

    return { head: el("div", { class: "mod-head" }, [tiles, modeErr, noteBox]), tail };
  });
})();

// ── src/pages/31_native.js ──
/* Страница настроек, «Эксперименты» → «Программа Chatterino+»: состояние связи с программой (src/bg/70_native.js) под
 * настройкой native.watching — есть связь (и последний канал) / программа на связи, ждём канал / программы нет или она
 * старая / программа не знает это расширение / нет разрешения браузера. Кнопка «Проверить связь» — подключиться сейчас,
 * даже без открытого Twitch. Ещё не знаем, есть ли программа (idle), — проверяем сами при открытии и при включении
 * (12.10: на главной Twitch висело «связь начнётся…», хотя программы не было). Разрешение есть, а фон его не видит
 * (restart — выдано после запуска фона, 70_native) — кнопка «Перезапустить расширение» вместо «Проверить связь».
 * Выключено — строки нет. Элемент один на страницу: раздел перерисовывается, а подписки — нет.
 */

(() => {
  const el = (...a) => CPX.pages.mz(CPX.el(...a));
  const t = CPX.t;

  CPX.i18n.add({
    ru: {
      "native.idle": "Проверяем связь с программой…",
      "native.ready": "Программа Chatterino+ на связи. Канал уйдёт во вкладку /watching, как только вы откроете его на Twitch.",
      "native.connected": "Связь с программой есть.",
      "native.last": "Последний канал: {name}.",
      "native.nohost":
        "Программа Chatterino+ не найдена. Нужна версия 5.4.5 или новее; после установки запустите её хотя бы раз — она сама пропишет связь в браузере.",
      "native.forbidden": "Программа Chatterino+ не узнала это расширение — обновите программу.",
      "native.noperm": "Браузер не дал разрешение на связь с программой. Выключите настройку, включите снова и нажмите «Разрешить».",
      "native.error": "Связь не удалась: {e}",
      "native.test": "Проверить связь",
      "native.restart": "Разрешение выдано, но браузер подключит его только после перезапуска расширения. Настройки откроются снова сами, а открытые вкладки Twitch потом обновите.",
      "native.restartBtn": "Перезапустить расширение",
    },
    en: {
      "native.idle": "Checking the link to the app…",
      "native.ready": "The Chatterino+ app is reachable. The channel goes to its /watching tab as soon as you open it on Twitch.",
      "native.connected": "Connected to the app.",
      "native.last": "Last channel: {name}.",
      "native.nohost": "The Chatterino+ app was not found. It needs version 5.4.5 or newer; after installing, run it once — it registers the link in the browser itself.",
      "native.forbidden": "The Chatterino+ app doesn’t know this extension — update the app.",
      "native.noperm": "The browser didn’t allow talking to the app. Turn the setting off and on again and click “Allow”.",
      "native.error": "Couldn’t connect: {e}",
      "native.test": "Check the link",
      "native.restart": "The permission is granted, but the browser only applies it after the extension restarts. Settings will reopen by themselves; then reload open Twitch tabs.",
      "native.restartBtn": "Restart the extension",
    },
  });

  let box = null;
  CPX.pages.groupBlock("native", () => {
    if (box) {
      box.paint();
      return { tail: box };
    }
    let st = { state: "off" };
    const text = el("span", { class: "nat__text" });
    const test = el("button", { type: "button", class: "btn btn-ghost nat__test", text: t("native.test") });
    const restart = el("button", { type: "button", class: "btn btn-accent nat__test", text: t("native.restartBtn") });
    restart.addEventListener("click", () => {
      restart.disabled = true;
      CPX.ext.call("native.restart").catch(() => (restart.disabled = false));
    });
    box = el("div", { class: "nat" }, [text, test, restart]);
    const on = () => !!(CPX.pages.settings && CPX.pages.settings["native.watching"]);
    box.paint = () => {
      box.hidden = !on();
      const s = st.state;
      let msg = "";
      if (s === "connected") msg = t("native.connected") + (st.name ? " " + t("native.last", { name: st.name }) : "");
      else if (s === "nohost" || s === "forbidden" || s === "noperm" || s === "idle" || s === "ready" || s === "restart") msg = t("native." + s);
      else if (s === "error") msg = t("native.error", { e: st.error || "?" });
      text.textContent = msg;
      test.hidden = s === "restart";
      restart.hidden = s !== "restart";
      box.dataset.state = s;
    };
    let probed = false; // сама проверка — один раз на открытие страницы (и заново после включения)
    async function runTest() {
      test.disabled = true;
      try {
        st = (await CPX.ext.call("native.test")) || st;
      } catch (_) {
        /* фон не ответил — состояние прежнее */
      } finally {
        test.disabled = false;
        box.paint();
      }
    }
    const load = () =>
      CPX.ext.call("native.status").then(
        (r) => {
          st = r || st;
          box.paint();
          if (on() && st.state === "idle" && !probed) {
            probed = true;
            runTest();
          }
        },
        () => {}
      );
    test.addEventListener("click", runTest);
    CPX.ext.on("native.status", (r) => {
      if (!r) return;
      st = r;
      box.paint();
    });
    CPX.ext.on("settings.changed", (d) => {
      if (!(d && d.changes && "native.watching" in d.changes)) return;
      probed = false;
      setTimeout(load, 300);
    });
    CPX.ext.on("ext:reconnect", load);
    load();
    box.paint();
    return { tail: box };
  });
})();

// ── src/pages/32_eblo.js ──
/* Страница настроек, раздел «Eblo.id» (20_pages.js CATS): строка аккаунта над настройками — «Аккаунт eblo.id: не
 * подключён» · «Подключить» / «Подключено: <ник>» · «Отключить» (тексты — PLAN.md §10, одинаково с клиентом).
 * Подключить — сразу вход (фон, src/bg/72_eblo.js, eblo.login: окно входа eblo.id, PKCE), и во вкладке, и в окне поверх
 * Twitch: разрешения на сайт нет (владелец 13.10), eblo.id сам пускает расширения к своему API. Сайт перестал пускать —
 * «eblo.id сейчас не отвечает». Копию, которую eblo.id не знает, — объясняем (с её id). «Отключить» — с
 * подтверждением (окно настроек открыто для страниц Twitch: прозрачный фрейм под курсором не отключит одним щелчком;
 * проверка перед 2.0.0). Итог попытки — подсказкой строки. Элемент один на страницу: раздел перерисовывается, а
 * подписки — нет.
 */

(() => {
  const el = (...a) => CPX.pages.mz(CPX.el(...a));
  const t = CPX.t;

  CPX.i18n.add({
    ru: {
      "eblo.acc.off": "Аккаунт eblo.id: не подключён",
      "eblo.acc.on": "Подключено: {name}",
      "eblo.acc.connect": "Подключить",
      "eblo.acc.disconnect": "Отключить",
      "eblo.acc.hint": "Нужен для загрузки файлов из чата. Карточки ссылок работают и без него",
      "eblo.acc.onHint": "Расширение может только загружать файлы и удалять свои загрузки",
      "eblo.acc.expired": "Вход в eblo.id истёк — подключи заново",
      "eblo.acc.busy": "Открыто окно входа eblo.id…",
      "eblo.acc.closed": "Окно входа закрыто — eblo.id не подключён",
      "eblo.acc.denied": "Вход отменён на eblo.id",
      "eblo.acc.site": "eblo.id сейчас не отвечает — попробуй позже",
      "eblo.acc.identity": "Этот браузер не умеет открывать окно входа eblo.id",
      "eblo.acc.fail": "Не удалось подключить eblo.id — попробуй ещё раз",
      "eblo.acc.done": "eblo.id отключён",
      "eblo.acc.unknown": "eblo.id не знает эту копию расширения (id {id}). Вход работает в Chatterino+ из магазина и из раннего доступа",
      "eblo.acc.offSure": "Отключить eblo.id?",
      "eblo.acc.offYes": "Да, отключить",
      "eblo.acc.offNo": "Отмена",
    },
    en: {
      "eblo.acc.off": "eblo.id account: not connected",
      "eblo.acc.on": "Connected: {name}",
      "eblo.acc.connect": "Connect",
      "eblo.acc.disconnect": "Disconnect",
      "eblo.acc.hint": "Needed to upload files from chat. Link cards work without it",
      "eblo.acc.onHint": "The extension can only upload files and delete its own uploads",
      "eblo.acc.expired": "Your eblo.id sign-in expired — connect again",
      "eblo.acc.busy": "The eblo.id sign-in window is open…",
      "eblo.acc.closed": "The sign-in window was closed — eblo.id is not connected",
      "eblo.acc.denied": "Sign-in was declined on eblo.id",
      "eblo.acc.site": "eblo.id isn’t responding right now — try later",
      "eblo.acc.identity": "This browser can’t open the eblo.id sign-in window",
      "eblo.acc.fail": "Couldn’t connect eblo.id — try again",
      "eblo.acc.done": "eblo.id disconnected",
      "eblo.acc.unknown": "eblo.id doesn’t know this copy of the extension (id {id}). Sign-in works in Chatterino+ from the store or early access",
      "eblo.acc.offSure": "Disconnect eblo.id?",
      "eblo.acc.offYes": "Yes, disconnect",
      "eblo.acc.offNo": "Cancel",
    },
  });

  let box = null;
  CPX.pages.groupBlock("eblo", () => {
    if (box) {
      box.paint();
      return { head: box };
    }
    let st = { connected: false, expired: false, login: "", name: "" };
    let note = ""; // ключ перевода — итог последней попытки
    let noteVars = null; // подстановки для note
    let busy = false;

    const label = el("span", { class: "srow__label" });
    const hint = el("span", { class: "srow__hint" });
    const connect = el("button", { type: "button", class: "btn btn-accent", text: t("eblo.acc.connect") });
    const disconnect = el("button", { type: "button", class: "btn btn-ghost", text: t("eblo.acc.disconnect") });
    const sure = el("span", { class: "srow__ask", text: t("eblo.acc.offSure") });
    const yes = el("button", { type: "button", class: "btn btn-danger", text: t("eblo.acc.offYes") });
    const no = el("button", { type: "button", class: "btn btn-ghost", text: t("eblo.acc.offNo") });
    let ask = false; // «Отключить» ждёт подтверждения
    box = el("div", { class: "eblo-acc" }, [el("span", { class: "srow__text" }, [label, hint]), el("span", { class: "srow__btns" }, [connect, disconnect, sure, yes, no])]);

    box.paint = () => {
      const on = !!st.connected;
      label.textContent = on ? t("eblo.acc.on", { name: st.name || st.login || "?" }) : t("eblo.acc.off");
      hint.textContent = busy ? t("eblo.acc.busy") : note ? t(note, noteVars || undefined) : on ? t("eblo.acc.onHint") : st.expired ? t("eblo.acc.expired") : t("eblo.acc.hint");
      box.dataset.state = on ? "on" : note && note !== "eblo.acc.done" ? "error" : st.expired ? "expired" : "off";
      if (!on) ask = false;
      connect.hidden = on || ask;
      disconnect.hidden = !on || ask;
      sure.hidden = yes.hidden = no.hidden = !ask;
      connect.disabled = busy;
    };

    const REASONS = { closed: "eblo.acc.closed", denied: "eblo.acc.denied", site: "eblo.acc.site", identity: "eblo.acc.identity", unknown: "eblo.acc.unknown" };
    async function login() {
      busy = true;
      note = "";
      box.paint();
      try {
        const r = await CPX.ext.call("eblo.login");
        noteVars = r && r.reason === "unknown" ? { id: String(r.id || "?") } : null;
        note = r && r.ok ? "" : (r && REASONS[r.reason]) || (r && r.reason === "busy" ? "" : "eblo.acc.fail");
      } catch (_) {
        note = "eblo.acc.fail";
      }
      busy = false;
      box.paint();
    }

    connect.addEventListener("click", () => {
      if (!busy) login();
    });
    disconnect.addEventListener("click", () => {
      ask = true;
      box.paint();
    });
    no.addEventListener("click", () => {
      ask = false;
      box.paint();
    });
    yes.addEventListener("click", async () => {
      yes.disabled = true;
      try {
        st = (await CPX.ext.call("eblo.logout")) || st;
        note = "eblo.acc.done";
      } catch (_) {
        /* фон не ответил — состояние прежнее */
      }
      yes.disabled = false;
      ask = false;
      box.paint();
    });

    const load = () =>
      CPX.ext.call("eblo.status").then(
        (r) => {
          if (r) st = r;
          box.paint();
        },
        () => {}
      );
    CPX.ext.on("eblo.status", (r) => {
      if (!r) return;
      if (r.connected && !st.connected && note !== "eblo.acc.done") note = "";
      st = r;
      box.paint();
    });
    CPX.ext.on("ext:reconnect", load);
    load();
    box.paint();
    return { head: box };
  });
})();

// ── src/pages/33_mentions.js ──
/* Страница настроек, раздел «Упоминания» (20_pages.js CATS; владелец 14.10) — особые блоки:
 *  • «Звук» (под строкой chat.mentionSound): какой звук — стёклышко или свой файл; «Прослушать», «Свой звук…»,
 *    «Вернуть стёклышко». Свой файл проверяем здесь же (до 512 КБ, читается как звук, до 5 с) и отдаём фону
 *    (src/bg/24_sound.js, sound.set); после выбора — сразу проигрываем. Звук общий: и для ника, и для своих слов.
 *  • «Свои слова» (chat.highlightWords: [{w, s}]): слово или фраза — как упоминание меня (подсветка, 46_list_mentions),
 *    у каждого свой тумблер звука. Добавить — поле + кнопка (или Enter), правка — прямо в поле (пустое — убрать),
 *    крестик — убрать. Повторы (без учёта регистра) не добавляем. Новое слово — со звуком, если включён звук на ник.
 *  • «Каналы без звука» (chat.mentionMuteChannels: логины; владелец 23.10): звук упоминаний там не играет, подсветка есть.
 *    Логин или ссылка на канал — поле + «Добавить»; крестик — убрать.
 *  • «Не уведомлять» (chat.mentionIgnoreUsers: [{id, login}]; владелец 23.10): таблица людей, от кого ни звука, ни
 *    подсветки; добавляют обычно «⋮» в карточке (86_card_view), здесь — ещё и по нику; «Уведомлять снова» — убрать.
 * Элементы — по одному на страницу: раздел перерисовывается, а подписки — нет.
 */

(() => {
  const el = (...a) => CPX.pages.mz(CPX.el(...a));
  const t = CPX.t;
  const fld = (kids) => el("span", { class: "fld cpx-mz cpx-k1 cpx-t-field" }, kids);
  const S = () => CPX.pages.settings || {};

  CPX.i18n.add({
    ru: {
      "ms.glass": "Звук: стёклышко",
      "ms.custom": "Звук: {name}",
      "ms.hint": "Общий для ника и своих слов. Свой — файл MP3, OGG или WAV до 5 секунд",
      "ms.play": "Прослушать",
      "ms.pick": "Свой звук…",
      "ms.reset": "Вернуть стёклышко",
      "ms.big": "Файл больше 512 КБ — выберите поменьше",
      "ms.long": "Звук длиннее 5 секунд — выберите покороче",
      "ms.bad": "Не получилось прочитать звук — нужен файл MP3, OGG или WAV",
      "ms.fail": "Не удалось сохранить звук — попробуйте ещё раз",
      "mw.hint": "Сообщение с любым из этих слов подсвечивается, как упоминание вас, — например, с другими вариантами вашего ника. Слово ищется целиком, большие и маленькие буквы не важны",
      "mw.ph": "Слово или фраза",
      "mw.add": "Добавить",
      "mw.sound": "Звук",
      "mw.soundTip": "Звенеть, когда в чате это слово",
      "mw.del": "Убрать слово",
      "mw.dup": "Такое слово уже есть",
      "mw.max": "Больше 100 слов добавить нельзя",
      "mw.empty": "Слов пока нет",
      "mc.hint": "Здесь звук упоминаний не играет — подсветка остаётся",
      "mc.ph": "Канал: ник или ссылка",
      "mc.del": "Убрать канал",
      "mc.empty": "Каналов пока нет",
      "mc.bad": "Это не похоже на канал Twitch",
      "mc.dup": "Этот канал уже в списке",
      "mc.max": "Больше 200 каналов добавить нельзя",
      "mi.hint": "Упоминания от этих людей — без звука и подсветки (и по нику, и по своим словам). Добавить — «⋮» в карточке человека → «Не уведомлять», или здесь по нику",
      "mi.ph": "Ник",
      "mi.back": "Уведомлять снова",
      "mi.empty": "Никого",
      "mi.bad": "Это не похоже на ник Twitch",
      "mi.dup": "Этот человек уже в списке",
      "mi.max": "Больше 500 человек добавить нельзя",
    },
    en: {
      "ms.glass": "Sound: glass chime",
      "ms.custom": "Sound: {name}",
      "ms.hint": "Shared by your name and your words. Your own — an MP3, OGG or WAV file up to 5 seconds",
      "ms.play": "Play",
      "ms.pick": "Your sound…",
      "ms.reset": "Back to the chime",
      "ms.big": "The file is over 512 KB — pick a smaller one",
      "ms.long": "The sound is longer than 5 seconds — pick a shorter one",
      "ms.bad": "Couldn’t read the sound — use an MP3, OGG or WAV file",
      "ms.fail": "Couldn’t save the sound — try again",
      "mw.hint": "A message with any of these words is highlighted like a mention of you — e.g. other spellings of your name. Whole words only, case doesn’t matter",
      "mw.ph": "Word or phrase",
      "mw.add": "Add",
      "mw.sound": "Sound",
      "mw.soundTip": "Chime when this word shows up in chat",
      "mw.del": "Remove the word",
      "mw.dup": "This word is already there",
      "mw.max": "You can’t add more than 100 words",
      "mw.empty": "No words yet",
      "mc.hint": "No mention sound in these channels — the highlight stays",
      "mc.ph": "Channel: name or link",
      "mc.del": "Remove the channel",
      "mc.empty": "No channels yet",
      "mc.bad": "This doesn't look like a Twitch channel",
      "mc.dup": "This channel is already on the list",
      "mc.max": "You can't add more than 200 channels",
      "mi.hint": "Mentions from these people come without sound or highlight (both your name and custom words). Add — «⋮» in their user card → «Don't notify», or here by name",
      "mi.ph": "Name",
      "mi.back": "Notify again",
      "mi.empty": "Nobody",
      "mi.bad": "This doesn't look like a Twitch name",
      "mi.dup": "This person is already on the list",
      "mi.max": "You can't add more than 500 people",
    },
  });

  /* ── Звук ─────────────────────────────────────────────────────────────────── */
  const MAX_BYTES = 512 * 1024;
  const MAX_SEC = 5;
  let sbox = null;
  CPX.pages.groupBlock("mentionSound", () => {
    if (sbox) {
      sbox.paint();
      return { tail: sbox };
    }
    let note = ""; // ключ перевода — итог последней попытки
    let busy = false;
    let cache = { key: "", buf: null }; // свой звук, уже прочитанный
    const label = el("span", { class: "srow__label" });
    const hint = el("span", { class: "srow__hint" });
    const play = el("button", { type: "button", class: "btn btn-ghost" }, [CPX.glyph("ppPlay", 14), el("span", { text: t("ms.play") })]);
    const pick = el("button", { type: "button", class: "btn btn-ghost", text: t("ms.pick") });
    const reset = el("button", { type: "button", class: "btn btn-ghost", text: t("ms.reset") });
    const file = el("input", { type: "file", accept: "audio/*" });
    file.hidden = true;
    sbox = el("div", { class: "msnd" }, [el("span", { class: "srow__text" }, [label, hint]), el("span", { class: "srow__btns" }, [play, pick, reset]), file]);

    const key = () => String(S()["chat.mentionSoundFile"] || "");
    sbox.paint = () => {
      const k = key();
      label.textContent = k ? t("ms.custom", { name: k.slice(k.indexOf("/") + 1) }) : t("ms.glass");
      hint.textContent = note ? t(note) : t("ms.hint");
      sbox.dataset.state = note ? "error" : "ok";
      reset.hidden = !k;
      pick.disabled = reset.disabled = busy;
    };
    const done = (n) => {
      note = n || "";
      busy = false;
      sbox.paint();
    };

    async function current() {
      const k = key();
      if (!k) return null;
      if (cache.key === k) return cache.buf;
      let buf = null;
      try {
        const r = await CPX.ext.call("sound.get");
        if (r && r.b64) buf = await CPX.sound.decode(CPX.sound.fromB64(r.b64));
      } catch (_) {
        /* не прочитался — стёклышко */
      }
      cache = { key: k, buf };
      return buf;
    }

    // Громкость — как в чате (46_list_mentions volume): доля ползунка в квадрате; 0 — тишина.
    const vol = () => {
      const v = Number(S()["chat.mentionVolume"]);
      const f = Number.isFinite(v) ? Math.max(0, Math.min(100, v)) / 100 : 1;
      return f * f;
    };
    play.addEventListener("click", async () => {
      CPX.sound.unlock(); // щелчок человека — звук можно открыть
      const buf = await current();
      if (buf) CPX.sound.play(buf, vol());
      else CPX.sound.glass(vol());
    });
    pick.addEventListener("click", () => {
      CPX.sound.unlock();
      file.click();
    });
    file.addEventListener("change", async () => {
      const f = file.files && file.files[0];
      file.value = "";
      if (!f) return;
      if (f.size > MAX_BYTES) return done("ms.big");
      busy = true;
      note = "";
      sbox.paint();
      let ab;
      let buf;
      try {
        ab = await f.arrayBuffer();
        buf = await CPX.sound.decode(ab);
      } catch (_) {
        return done("ms.bad");
      }
      if (!buf || !(buf.duration > 0)) return done("ms.bad");
      if (buf.duration > MAX_SEC + 0.05) return done("ms.long");
      let r = null;
      try {
        r = await CPX.ext.call("sound.set", { name: f.name, mime: f.type, b64: CPX.sound.toB64(ab) });
      } catch (_) {
        /* фон не ответил */
      }
      if (!r || !r.ok) return done(r && r.reason === "big" ? "ms.big" : "ms.fail");
      S()["chat.mentionSoundFile"] = r.key;
      cache = { key: r.key, buf };
      done("");
      CPX.sound.play(buf, vol());
    });
    reset.addEventListener("click", async () => {
      busy = true;
      sbox.paint();
      try {
        await CPX.ext.call("sound.clear");
        S()["chat.mentionSoundFile"] = "";
      } catch (_) {
        /* фон не ответил — как было */
      }
      done("");
    });

    // Правка из другой вкладки настроек (или общий сброс). Значение — из самого события: общий обработчик страницы мог
    // ещё не переписать его в CPX.pages.settings.
    CPX.ext.on("settings.changed", (d) => {
      if (!d || !d.changes || !("chat.mentionSoundFile" in d.changes)) return;
      S()["chat.mentionSoundFile"] = d.changes["chat.mentionSoundFile"];
      sbox.paint();
    });
    sbox.paint();
    return { tail: sbox };
  });

  /* ── Свои слова ──────────────────────────────────────────────────────────── */
  const MAX_WORDS = 100;
  const MAX_LEN = 100;
  const clean = (s) => String(s || "").replace(/\s+/g, " ").trim().slice(0, MAX_LEN);
  /** Список из настроек — только правильные пункты, без повторов. */
  function readWords() {
    const out = [];
    const seen = new Set();
    for (const x of Array.isArray(S()["chat.highlightWords"]) ? S()["chat.highlightWords"] : []) {
      const w = clean(x && x.w);
      if (!w || seen.has(w.toLowerCase())) continue;
      seen.add(w.toLowerCase());
      out.push({ w, s: !!(x && x.s) });
    }
    return out;
  }

  let wbox = null;
  CPX.pages.groupBlock("mentionWords", () => {
    if (wbox) {
      wbox.paint();
      return { head: wbox };
    }
    let words = readWords();
    let note = "";
    const addIn = el("input", { type: "text", maxlength: MAX_LEN, placeholder: t("mw.ph"), spellcheck: "false", "aria-label": t("mw.ph") });
    const addBtn = el("button", { type: "button", class: "btn btn-accent", text: t("mw.add") });
    const noteEl = el("span", { class: "srow__hint mw__note" });
    const list = el("div", { class: "mw__list" });
    wbox = el("div", { class: "mw" }, [el("span", { class: "srow__hint", text: t("mw.hint") }), el("div", { class: "mw__add" }, [fld([addIn]), addBtn]), noteEl, list]);

    function save() {
      S()["chat.highlightWords"] = words.map((x) => ({ w: x.w, s: x.s }));
      CPX.ext.call("settings.set", { changes: { "chat.highlightWords": S()["chat.highlightWords"] } }).catch(() => {});
    }
    const dup = (w, skip) => words.some((x) => x !== skip && x.w.toLowerCase() === w.toLowerCase());

    function row(item) {
      const input = el("input", { type: "text", maxlength: MAX_LEN, spellcheck: "false", "aria-label": t("mw.ph") });
      input.value = item.w;
      input.addEventListener("change", () => {
        const w = clean(input.value);
        note = "";
        if (!w) words = words.filter((x) => x !== item);
        else if (dup(w, item)) note = "mw.dup";
        else item.w = w;
        save();
        paint(true);
      });
      const snd = el("input", { type: "checkbox", class: "switch", "aria-label": t("mw.soundTip") });
      snd.checked = item.s;
      snd.addEventListener("change", () => {
        item.s = snd.checked;
        save();
      });
      const del = el("button", { type: "button", class: "btn btn-ghost mw__del", "aria-label": t("mw.del"), "data-pg-tip": t("mw.del") }, [CPX.glyph("close", 14)]);
      del.addEventListener("click", () => {
        words = words.filter((x) => x !== item);
        note = "";
        save();
        paint(true);
      });
      return el("div", { class: "mw__row" }, [fld([input]), el("label", { class: "mw__snd", "data-pg-tip": t("mw.soundTip") }, [snd, el("span", { text: t("mw.sound") })]), del]);
    }

    /** force — перерисовать и при фокусе в списке (своя правка); иначе (правка извне) — не мешать набору. */
    function paint(force) {
      noteEl.textContent = note ? t(note) : "";
      noteEl.hidden = !note;
      if (!force && list.contains(document.activeElement)) return;
      list.replaceChildren(...(words.length ? words.map(row) : [el("span", { class: "srow__hint mw__empty", text: t("mw.empty") })]));
    }
    wbox.paint = () => paint(false);

    function add() {
      const w = clean(addIn.value);
      note = "";
      if (!w) return paint(false);
      if (dup(w)) note = "mw.dup";
      else if (words.length >= MAX_WORDS) note = "mw.max";
      else {
        words.push({ w, s: S()["chat.mentionSound"] === true });
        addIn.value = "";
        save();
      }
      paint(true);
      addIn.focus();
    }
    addBtn.addEventListener("click", add);
    addIn.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        add();
      }
    });

    CPX.ext.on("settings.changed", (d) => {
      if (!d || !d.changes || !("chat.highlightWords" in d.changes)) return;
      S()["chat.highlightWords"] = d.changes["chat.highlightWords"];
      words = readWords();
      paint(false);
    });
    paint(true);
    return { head: wbox };
  });

  /* ── Каналы без звука и «Не уведомлять» (владелец 23.10) ──────────────────────── */
  const LOGIN_RE = /^[a-z0-9_]{1,25}$/;
  /** «Ник», «@ник», «twitch.tv/ник», полная ссылка → логин | "". */
  function loginOf(v) {
    let s = String(v || "").trim().replace(/^@/, "");
    const m = /(?:^|\/\/)(?:www\.|m\.)?twitch\.tv\/(?:popout\/)?([A-Za-z0-9_]{1,25})/i.exec(s);
    if (m) s = m[1];
    s = s.toLowerCase();
    return LOGIN_RE.test(s) ? s : "";
  }
  /** Общий вид списка: подсказка, поле + «Добавить», заметка, строки. o: {key, ph, hint, empty, max, read, write, row, bad, dup, maxNote} */
  function listBlock(o) {
    let box = null;
    return () => {
      if (box) {
        box.paint();
        return { head: box };
      }
      let items = o.read();
      let note = "";
      const addIn = el("input", { type: "text", maxlength: 120, placeholder: t(o.ph), spellcheck: "false", "aria-label": t(o.ph) });
      const addBtn = el("button", { type: "button", class: "btn btn-accent", text: t("mw.add") });
      const noteEl = el("span", { class: "srow__hint mw__note" });
      const list = el("div", { class: "mw__list" });
      box = el("div", { class: "mw" }, [el("span", { class: "srow__hint", text: t(o.hint) }), el("div", { class: "mw__add" }, [fld([addIn]), addBtn]), noteEl, list]);
      const save = () => {
        S()[o.key] = o.write(items);
        CPX.ext.call("settings.set", { changes: { [o.key]: S()[o.key] } }).catch(() => {});
      };
      const remove = (it) => {
        items = items.filter((x) => x !== it);
        note = "";
        save();
        paint(true);
      };
      function paint(force) {
        noteEl.textContent = note ? t(note) : "";
        noteEl.hidden = !note;
        if (!force && list.contains(document.activeElement)) return;
        list.replaceChildren(...(items.length ? items.map((it) => o.row(it, () => remove(it))) : [el("span", { class: "srow__hint mw__empty", text: t(o.empty) })]));
      }
      box.paint = () => paint(false);
      function add() {
        const login = loginOf(addIn.value);
        note = "";
        if (!addIn.value.trim()) return paint(false);
        if (!login) note = o.bad;
        else if (items.some((x) => o.login(x) === login)) note = o.dup;
        else if (items.length >= o.max) note = o.maxNote;
        else {
          items.push(o.make(login));
          addIn.value = "";
          save();
        }
        paint(true);
        addIn.focus();
      }
      addBtn.addEventListener("click", add);
      addIn.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          add();
        }
      });
      CPX.ext.on("settings.changed", (d) => {
        if (!d || !d.changes || !(o.key in d.changes)) return;
        S()[o.key] = d.changes[o.key];
        items = o.read();
        paint(false);
      });
      paint(true);
      return { head: box };
    };
  }

  CPX.pages.groupBlock(
    "mentionMute",
    listBlock({
      key: "chat.mentionMuteChannels",
      ph: "mc.ph",
      hint: "mc.hint",
      empty: "mc.empty",
      bad: "mc.bad",
      dup: "mc.dup",
      maxNote: "mc.max",
      max: 200,
      login: (x) => x,
      make: (login) => login,
      read: () => [...new Set((Array.isArray(S()["chat.mentionMuteChannels"]) ? S()["chat.mentionMuteChannels"] : []).map(loginOf).filter(Boolean))],
      write: (items) => items.slice(),
      row: (login, del) => {
        const x = el("button", { type: "button", class: "btn btn-ghost mw__del", "aria-label": t("mc.del"), "data-pg-tip": t("mc.del") }, [CPX.glyph("close", 14)]);
        x.addEventListener("click", del);
        return el("div", { class: "mw__row mw__row--login" }, [el("span", { class: "mw__login", text: login }), x]);
      },
    })
  );

  CPX.pages.groupBlock(
    "mentionIgnore",
    listBlock({
      key: "chat.mentionIgnoreUsers",
      ph: "mi.ph",
      hint: "mi.hint",
      empty: "mi.empty",
      bad: "mi.bad",
      dup: "mi.dup",
      maxNote: "mi.max",
      max: 500,
      login: (x) => x.login,
      make: (login) => ({ id: "", login }),
      read: () => {
        const out = [];
        const seen = new Set();
        for (const x of Array.isArray(S()["chat.mentionIgnoreUsers"]) ? S()["chat.mentionIgnoreUsers"] : []) {
          const login = loginOf(x && x.login);
          const id = /^\d{1,20}$/.test(String((x && x.id) || "")) ? String(x.id) : "";
          if ((!login && !id) || seen.has(login || id)) continue;
          seen.add(login || id);
          out.push({ id, login });
        }
        return out;
      },
      write: (items) => items.map((x) => ({ id: x.id, login: x.login })),
      row: (x, del) => {
        const back = el("button", { type: "button", class: "btn btn-ghost", text: t("mi.back") });
        back.addEventListener("click", del);
        return el("div", { class: "mw__row mw__row--login" }, [el("span", { class: "mw__login", text: x.login || "#" + x.id }), back]);
      },
    })
  );
})();

// ── src/pages/34_backup.js ──
/* Страница настроек, «Основное» → «Перенос настроек» (владелец 16.10): экспорт всех настроек расширения в файл и импорт
 * из файла — перенести в другой браузер или на другое устройство.
 *
 * ФАЙЛ — JSON {app: "Chatterino+", type: "settings", version, exported, settings: {ключ: значение}}: снимок ВСЕХ настроек
 * (не только изменённых — импорт делает настройки ровно как в файле). Не попадают (NO_EXPORT): согласие на связь с
 * сервером (решает каждый браузер сам), метка своего звука упоминаний (сам файл звука живёт в браузере — выбрать заново),
 * служебная настройка разработки, история опросов (тексты человека) и «недавние» смайлики и эмодзи (история, а не
 * настройки). Вход в Chatterino+, Twitch и eblo.id в настройках не хранится вовсе — в файл не попадает.
 * ИМПОРТ: файл не больше 1 МБ; неизвестные ключи, ключи из NO_EXPORT и значения не того вида (строгая проверка типа — до
 * общего приведения CPX.settingsCoerce, которое молча превращает что угодно в «да/нет») пропускаются. Настройки, которым
 * нужно разрешение браузера (связь с программой Chatterino+), из файла не включаются — их включают вручную. Перед
 * применением — подтверждение строкой («Найдено N настроек…»; alert/confirm во фрейме на Twitch браузер не покажет).
 * Сменился язык — страница перезагружается; итог импорта переживает перезагрузку (sessionStorage) и пишется уже на новом языке.
 */

(() => {
  const el = (...a) => CPX.pages.mz(CPX.el(...a));
  const t = CPX.t;
  const MAX_BYTES = 1024 * 1024;
  const NO_EXPORT = new Set(["general.consent", "chat.mentionSoundFile", "dev.mirrorBase", "polls.history", "input.menuRecent", "input.emojiRecent"]);

  // «1 настройка», «3 настройки», «7 настроек»
  const ruN = (n) => n + " " + (n % 10 === 1 && n % 100 !== 11 ? "настройка" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? "настройки" : "настроек");
  const enN = (n) => n + (n === 1 ? " setting" : " settings");
  const NOTE_KEY = "cpx-bk-done"; // итог импорта на время перезагрузки страницы
  CPX.i18n.add({
    ru: {
      "bk.sec": "Перенос настроек",
      "bk.label": "Экспорт и импорт",
      "bk.hint": "Файл со всеми настройками расширения — перенести в другой браузер или на другое устройство. Вход, согласие и личные данные в файл не попадают; свой звук упоминаний выберите заново",
      "bk.export": "Экспорт",
      "bk.import": "Импорт…",
      "bk.saved": ({ n }) => "Сохранено в файл: " + ruN(n),
      "bk.ask": ({ n }) => "Найдено в файле: " + ruN(n) + ". Заменить текущие?",
      "bk.yes": "Да, применить",
      "bk.no": "Отмена",
      "bk.done": ({ n }) => "Готово: изменено — " + ruN(n),
      "bk.same": "Готово: настройки уже такие же, как в файле",
      "bk.skipped": "пропущено {n}",
      "bk.perm": "связь с программой Chatterino+ включите вручную",
      "bk.big": "Файл больше 1 МБ — это не файл настроек Chatterino+",
      "bk.bad": "Это не файл настроек Chatterino+",
      "bk.empty": "В файле нет настроек, которые можно применить",
      "bk.fail": "Не получилось — попробуйте ещё раз",
    },
    en: {
      "bk.sec": "Move settings",
      "bk.label": "Export and import",
      "bk.hint": "A file with all extension settings — move them to another browser or device. Sign-ins, consent and personal data aren't included; pick your mention sound again",
      "bk.export": "Export",
      "bk.import": "Import…",
      "bk.saved": ({ n }) => "Saved to a file: " + enN(n),
      "bk.ask": ({ n }) => "Found in the file: " + enN(n) + ". Replace the current ones?",
      "bk.yes": "Yes, apply",
      "bk.no": "Cancel",
      "bk.done": ({ n }) => "Done: " + enN(n) + " changed",
      "bk.same": "Done: settings already match the file",
      "bk.skipped": "{n} skipped",
      "bk.perm": "turn on the Chatterino+ app link manually",
      "bk.big": "The file is over 1 MB — not a Chatterino+ settings file",
      "bk.bad": "Not a Chatterino+ settings file",
      "bk.empty": "The file has no settings that can be applied",
      "bk.fail": "Didn't work — try again",
    },
  });

  /** Значение того же вида, что у описания настройки (до общего приведения). */
  function sameKind(d, v) {
    switch (d.type) {
      case "bool":
        return typeof v === "boolean";
      case "int":
      case "range":
        return typeof v === "number" && Number.isFinite(v);
      case "select":
        return d.options.some((o) => o.v === v);
      case "color":
        return typeof v === "string" && !!CPX.safe.hex(v);
      case "text":
        return typeof v === "string";
      case "list":
        return Array.isArray(v);
      default:
        return false;
    }
  }

  /** Итог импорта: {m — изменено, skipped, perm}. */
  const doneText = (r) => {
    const tail = [r.skipped ? t("bk.skipped", { n: r.skipped }) : "", r.perm ? t("bk.perm") : ""].filter(Boolean).join(", ");
    return (r.m ? t("bk.done", { n: r.m }) : t("bk.same")) + (tail ? " (" + tail + ")" : "");
  };

  let box = null;
  CPX.pages.backupBlock = () => {
    if (box) {
      box.paint();
      return box;
    }
    let note = "";
    let noteBad = false;
    try {
      const r = JSON.parse(sessionStorage.getItem(NOTE_KEY) || "null");
      sessionStorage.removeItem(NOTE_KEY);
      if (r && typeof r === "object") note = doneText(r);
    } catch (_) {
      /* хранилище недоступно — без итога */
    }
    let pending = null; // {changes, n, skipped, perm} — ждёт подтверждения
    const label = el("span", { class: "srow__label", text: t("bk.label") });
    const hint = el("span", { class: "srow__hint" });
    const exp = el("button", { type: "button", class: "btn", text: t("bk.export") });
    const imp = el("button", { type: "button", class: "btn btn-ghost", text: t("bk.import") });
    const ask = el("span", { class: "srow__ask" });
    const yes = el("button", { type: "button", class: "btn btn-accent", text: t("bk.yes") });
    const no = el("button", { type: "button", class: "btn btn-ghost", text: t("bk.no") });
    const file = el("input", { type: "file", accept: "application/json,.json" });
    file.hidden = true;
    box = el("div", { class: "srow srow--static bk" }, [el("span", { class: "srow__text" }, [label, hint]), el("span", { class: "srow__btns" }, [exp, imp, ask, yes, no]), file]);

    box.paint = () => {
      hint.textContent = note || t("bk.hint");
      box.dataset.state = noteBad ? "error" : "ok";
      const asking = !!pending;
      exp.hidden = imp.hidden = asking;
      ask.hidden = yes.hidden = no.hidden = !asking;
      if (asking) ask.textContent = t("bk.ask", { n: pending.n });
    };
    const say = (text, bad) => {
      note = text;
      noteBad = !!bad;
      box.paint();
    };

    exp.addEventListener("click", async () => {
      exp.disabled = true;
      try {
        const all = Object.assign(CPX.settingsDefaults(), await CPX.ext.call("settings.getAll"));
        const settings = {};
        for (const k of Object.keys(all).sort()) if (CPX.settingsDefs.has(k) && !NO_EXPORT.has(k)) settings[k] = all[k];
        const data = { app: "Chatterino+", type: "settings", version: CPX.version, exported: new Date().toISOString(), settings };
        const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
        const a = document.createElement("a");
        a.href = url;
        const d = new Date();
        const p2 = (x) => String(x).padStart(2, "0");
        a.download = "chatterino-plus-settings-" + d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate()) + ".json"; // местная дата
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        say(t("bk.saved", { n: Object.keys(settings).length }));
      } catch (_) {
        say(t("bk.fail"), true);
      }
      exp.disabled = false;
    });

    imp.addEventListener("click", () => file.click());
    file.addEventListener("change", async () => {
      const f = file.files && file.files[0];
      file.value = "";
      if (!f) return;
      if (f.size > MAX_BYTES) return say(t("bk.big"), true);
      let data = null;
      try {
        data = JSON.parse(await f.text());
      } catch (_) {
        /* не JSON */
      }
      const src = data && data.app === "Chatterino+" && data.settings && typeof data.settings === "object" && !Array.isArray(data.settings) ? data.settings : null;
      if (!src) return say(t("bk.bad"), true);
      const changes = {};
      let skipped = 0;
      let perm = false;
      for (const k of Object.keys(src)) {
        const d = CPX.settingsDefs.get(k);
        const v = src[k];
        if (!d || NO_EXPORT.has(k) || !sameKind(d, v)) {
          skipped++;
          continue;
        }
        if (d.permission && v) {
          skipped++;
          perm = true;
          continue;
        }
        const c = CPX.settingsCoerce(k, v);
        if (c === undefined) {
          skipped++;
          continue;
        }
        changes[k] = c;
      }
      const n = Object.keys(changes).length;
      if (!n) return say(t("bk.empty"), true);
      note = "";
      noteBad = false;
      pending = { changes, n, skipped, perm };
      box.paint();
    });

    no.addEventListener("click", () => {
      pending = null;
      box.paint();
    });
    yes.addEventListener("click", async () => {
      const p = pending;
      if (!p) return;
      yes.disabled = true;
      const lang0 = CPX.pages.settings && CPX.pages.settings["general.lang"];
      try {
        const applied = (await CPX.ext.call("settings.set", { changes: p.changes })) || {};
        Object.assign(CPX.pages.settings, await CPX.ext.call("settings.getAll"));
        const r = { m: Object.keys(applied).length, skipped: p.skipped, perm: p.perm };
        pending = null;
        say(doneText(r));
        if (CPX.pages.settings["general.lang"] !== lang0) {
          // Перезагрузка стёрла бы итог (ревью 16.10) — пусть страница на новом языке покажет его снова.
          try {
            sessionStorage.setItem(NOTE_KEY, JSON.stringify(r));
          } catch (_) {
            /* без итога */
          }
          location.reload();
        }
      } catch (_) {
        pending = null;
        say(t("bk.fail"), true);
      }
      yes.disabled = false;
    });

    box.paint();
    return box;
  };
})();
})();

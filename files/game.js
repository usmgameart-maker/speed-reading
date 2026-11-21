// ============================================================
//  Движок игры «Помоги Деду Морозу собрать подарки».
//  Тексты писем и подарки — в letters.js, механики — в mechanics.js.
// ============================================================
(function () {
  "use strict";

  var GAME = window.GAME || {}, GIFTS = window.GIFTS || {}, LETTERS = window.LETTERS || [];
  var SAVE_KEY = "pomogi-dedu-morozu-podarki";
  var FAST_SECONDS = 20;

  var AWARDS = [
    { id: "first",    icon: "🎁", name: "Первый подарок",       desc: "Собран первый подарок" },
    { id: "fast",     icon: "⚡", name: "Молния",               desc: "Письмо прочитано быстрее " + FAST_SECONDS + " секунд" },
    { id: "streak5",  icon: "👁", name: "Зоркий глаз",          desc: "5 подарков подряд без ошибок" },
    { id: "half",     icon: "🛷", name: "Полмешка",             desc: "Собрано 8 подарков" },
    { id: "anagrams", icon: "🧩", name: "Знаток путаницы",      desc: "Все 4 письма с перепутанными буквами — без ошибок" },
    { id: "mirror",   icon: "🪞", name: "Мастер зеркал",        desc: "Прочитаны перевёрнутое и зеркальное письма" },
    { id: "clean",    icon: "⭐", name: "Без единой ошибки",    desc: "Все подарки найдены с первой попытки" },
    { id: "all",      icon: "🎅", name: "Помощник Деда Мороза", desc: "Собраны все подарки" }
  ];

  var state = { index: 0, results: [], awards: {}, streak: 0, errors: 0, sound: true, phase: "mail", t0: 0, readMs: 0, timer: null };

  // ---------- помощники ----------
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function img(key) { return "files/img/" + GIFTS[key].img; }
  function fmt(ms) { var s = Math.round(ms / 1000); return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2); }
  // Имя в родительном падеже: «письмо от Сони», «от Бориса»
  function genitive(n) {
    var last = n.slice(-1), pre = n.slice(-2, -1);
    if (last === "я") return n.slice(0, -1) + "и";
    if (last === "ь") return n.slice(0, -1) + "я";
    if (last === "а") return n.slice(0, -1) + ("гкхжчшщ".indexOf(pre) >= 0 ? "и" : "ы");
    if ("аеёиоуыэюя".indexOf(last) >= 0) return n;
    return n + "а";
  }
  function from(l) { return l.from || genitive(l.name); }

  // Порядок подарков на полках — перемешан, но одинаковый при каждом запуске
  var SHELF = (function () {
    var keys = Object.keys(GIFTS), s = 7;
    function r() { s = (s * 16807) % 2147483647; return s / 2147483647; }
    for (var i = keys.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = keys[i]; keys[i] = keys[j]; keys[j] = t; }
    return keys;
  })();

  // ---------- звуки ----------
  var ctx = null;
  function tone(seq) {
    if (!state.sound) return;
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      var t = ctx.currentTime;
      seq.forEach(function (s) {
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.type = s.type || "sine"; o.frequency.setValueAtTime(s.f, t + s.at);
        g.gain.setValueAtTime(0.0001, t + s.at);
        g.gain.exponentialRampToValueAtTime(s.v || 0.14, t + s.at + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + s.at + s.d);
        o.connect(g); g.connect(ctx.destination); o.start(t + s.at); o.stop(t + s.at + s.d + 0.03);
      });
    } catch (e) {}
  }
  function jingle() { tone([{ f: 1319, at: 0, d: .18 }, { f: 1568, at: .12, d: .18 }, { f: 2093, at: .24, d: .35 }, { f: 2637, at: .24, d: .35, v: .05 }]); }
  function oops() { tone([{ f: 330, at: 0, d: .14, type: "triangle" }, { f: 240, at: .14, d: .22, type: "triangle" }]); }
  function paper() { tone([{ f: 900, at: 0, d: .06, type: "triangle", v: .06 }, { f: 700, at: .07, d: .08, type: "triangle", v: .06 }]); }
  function fanfare() { tone([{ f: 784, at: 0, d: .15 }, { f: 988, at: .15, d: .15 }, { f: 1175, at: .3, d: .15 }, { f: 1568, at: .45, d: .4 }]); }

  // ---------- снег ----------
  function makeSnow() {
    var box = $("snow");
    for (var i = 0; i < 45; i++) {
      var f = el("span", "flake"), s = 2 + Math.random() * 6;
      f.style.width = f.style.height = s + "px";
      f.style.left = Math.random() * 100 + "vw";
      f.style.opacity = (0.4 + Math.random() * 0.6).toFixed(2);
      f.style.animationDuration = (8 + Math.random() * 12) + "s";
      f.style.animationDelay = (-Math.random() * 20) + "s";
      f.style.setProperty("--drift", (Math.random() * 80 - 40) + "px");
      box.appendChild(f);
    }
  }

  // ---------- сохранение ----------
  function signature() { return LETTERS.map(function (l) { return l.name + ":" + l.gift + ":" + l.mechanic; }).join("|"); }
  function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify({ sig: signature(), index: state.index, results: state.results, awards: state.awards, streak: state.streak })); } catch (e) {} }
  function load() {
    try { var d = JSON.parse(localStorage.getItem(SAVE_KEY) || "null"); return d && d.sig === signature() && d.results && d.results.length ? d : null; }
    catch (e) { return null; }
  }
  function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} }

  // ---------- экраны ----------
  function show(id) {
    var s = document.querySelectorAll(".screen");
    for (var i = 0; i < s.length; i++) s[i].classList.remove("active");
    $(id).classList.add("active"); window.scrollTo(0, 0);
  }

  function drawTop() {
    var p = $("progress"); p.innerHTML = "";
    LETTERS.forEach(function (l, i) {
      var d = el("div", "dot");
      if (state.results[i]) { d.classList.add("done"); d.innerHTML = '<img src="' + img(l.gift) + '" alt="">'; d.title = l.name; }
      else { d.textContent = i + 1; if (i === state.index) d.classList.add("current"); }
      p.appendChild(d);
    });
    $("sack-count").textContent = state.results.filter(Boolean).length;
    $("sack-total").textContent = LETTERS.length;
    $("awards-count").textContent = Object.keys(state.awards).length + "/" + AWARDS.length;
  }

  // ---------- 1. пришло письмо ----------
  function showMail() {
    var l = LETTERS[state.index];
    state.phase = "mail";
    stopTimer(); $("timer").textContent = "0:00";
    $("stage-mail").classList.remove("hidden");
    $("stage-letter").classList.add("hidden");
    var env = $("envelope"); env.style.animation = "none"; void env.offsetWidth; env.style.animation = "";
    $("env-from").textContent = "От: " + l.name;
    $("mail-num").textContent = "Письмо " + (state.index + 1) + " из " + LETTERS.length;
    $("mail-title").textContent = "Пришло письмо от " + from(l) + "!";
    $("mail-hint").textContent = window.TRANSFORM(l.text, l.mechanic).label;
    drawTop();
    paper();
  }

  // ---------- 2. чтение ----------
  function openLetter() {
    var l = LETTERS[state.index], tr = window.TRANSFORM(l.text, l.mechanic);
    state.phase = "read"; state.errorsNow = 0;
    $("stage-mail").classList.add("hidden");
    var st = $("stage-letter"); st.classList.remove("hidden"); st.classList.add("reading");
    $("letter-from").textContent = "✉ Письмо от " + from(l);
    $("letter-mech").textContent = tr.label;
    var t = $("letter-text"); t.className = "letter-text " + tr.cls; t.innerHTML = tr.html;
    $("letter-foot").classList.remove("hidden");
    $("ded-reading").classList.remove("hidden");
    $("storeroom").classList.add("hidden");
    $("result").classList.add("hidden");
    paper();
    startTimer();
  }

  function startTimer() {
    stopTimer(); state.t0 = Date.now();
    $("timer").textContent = "0:00";
    state.timer = setInterval(function () { $("timer").textContent = fmt(Date.now() - state.t0); }, 250);
  }
  function stopTimer() { if (state.timer) { clearInterval(state.timer); state.timer = null; } }

  // ---------- 3. кладовая ----------
  function doneReading() {
    if (state.phase !== "read") return;
    state.readMs = Date.now() - state.t0; stopTimer();
    $("timer").textContent = fmt(state.readMs);
    state.phase = "choose";
    var l = LETTERS[state.index];
    $("stage-letter").classList.remove("reading");
    $("letter-foot").classList.add("hidden");
    $("ded-reading").classList.add("hidden");
    $("store-q").textContent = "Что попросил" + (isGirl(l.name) ? "а " : " ") + l.name + "?";
    drawShelves();
    $("storeroom").classList.remove("hidden");
  }
  function isGirl(n) { return /[ая]$/.test(n) && ["Никита", "Илья", "Миша", "Саша"].indexOf(n) < 0; }

  function given() {
    var g = {};
    state.results.forEach(function (r, i) { if (r) g[LETTERS[i].gift] = true; });
    return g;
  }

  function drawShelves() {
    var box = $("shelves"); box.innerHTML = "";
    var g = given();
    SHELF.forEach(function (k) {
      var b = el("button", "item", '<img src="' + img(k) + '" alt=""><span class="iname">' + esc(GIFTS[k].name) + "</span>");
      b._key = k;
      if (g[k]) { b.classList.add("given"); b.disabled = true; b.title = "Уже упакован"; }
      b.addEventListener("click", function () { choose(b); });
      box.appendChild(b);
    });
  }

  function choose(btn) {
    if (state.phase !== "choose" || btn.disabled) return;
    var l = LETTERS[state.index];
    if (btn._key === l.gift) {
      state.phase = "done";
      btn.classList.add("right");
      var all = $("shelves").children;
      for (var i = 0; i < all.length; i++) all[i].disabled = true;
      state.results[state.index] = { ms: state.readMs, errors: state.errorsNow };
      state.streak = state.errorsNow === 0 ? state.streak + 1 : 0;
      jingle();
      // письмо расколдовывается
      var t = $("letter-text");
      t.className = "letter-text plain reveal";
      t.innerHTML = '<div class="decoded-label">Расшифровка письма</div>' + esc(l.text);
      $("letter-mech").textContent = "Письмо расколдовано!";
      var last = state.index === LETTERS.length - 1;
      showResult(true, "Верно! " + l.name + " получит " + (GIFTS[l.gift].acc || GIFTS[l.gift].name.toLowerCase()) + ".",
        "Время чтения: " + fmt(state.readMs) + (state.errorsNow ? " · ошибок: " + state.errorsNow : " · с первой попытки!"),
        img(l.gift), last ? "Посмотреть итоги →" : "Следующее письмо →");
      fly(btn.querySelector("img"));
      state.index++;
      save();
      setTimeout(function () { checkAwards(l); drawTop(); save(); }, 950);
    } else {
      state.errorsNow++;
      btn.classList.remove("wrong"); void btn.offsetWidth; btn.classList.add("wrong");
      oops();
      showResult(false, "Не то! Перечитай письмо ещё раз", "В письме описано, как выглядит подарок и что с ним делают.", null, null);
    }
  }

  function showResult(ok, title, sub, pic, btnText) {
    var r = $("result");
    r.className = "result " + (ok ? "good" : "bad");
    r.innerHTML = (pic ? '<img src="' + pic + '" alt="">' : "") + '<div class="r-text"><div class="r-title">' + esc(title) + '</div><div class="r-sub">' + esc(sub) + "</div></div>";
    if (btnText) {
      var b = el("button", "btn btn-green", esc(btnText));
      b.id = "btn-next";
      b.addEventListener("click", next);
      r.appendChild(b);
    }
  }

  function fly(from) {
    var f = $("flyer"), a = from.getBoundingClientRect(), target = $("sack-count").parentNode.getBoundingClientRect();
    f.src = from.src; f.classList.remove("hidden");
    f.style.transition = "none"; f.style.opacity = "1";
    f.style.left = a.left + "px"; f.style.top = a.top + "px"; f.style.width = a.width + "px"; f.style.height = a.height + "px";
    f.style.transform = "none";
    void f.offsetWidth;
    f.style.transition = "";
    var dx = target.left + target.width / 2 - (a.left + a.width / 2), dy = target.top + target.height / 2 - (a.top + a.height / 2);
    f.style.transform = "translate(" + dx + "px," + dy + "px) scale(.2)";
    f.style.opacity = ".3";
    setTimeout(function () { f.classList.add("hidden"); var p = $("sack-count").parentNode; p.classList.remove("bump"); void p.offsetWidth; p.classList.add("bump"); }, 900);
  }

  function next() {
    if (state.index >= LETTERS.length) finish();
    else showMail();
  }

  // ---------- награды ----------
  function grant(id) {
    if (state.awards[id]) return;
    state.awards[id] = true;
    var a = AWARDS.filter(function (x) { return x.id === id; })[0];
    var t = el("div", "toast", '<span class="t-icon">' + a.icon + '</span><div><div class="t-small">Новая награда</div><div class="t-name">' + esc(a.name) + '</div><div class="t-desc">' + esc(a.desc) + "</div></div>");
    $("toasts").appendChild(t);
    fanfare();
    setTimeout(function () { t.classList.add("out"); setTimeout(function () { t.remove(); }, 450); }, 3600);
  }
  function checkAwards() {
    var res = state.results, n = res.filter(Boolean).length;
    if (n >= 1) grant("first");
    if (res.some(function (r) { return r && r.ms < FAST_SECONDS * 1000; })) grant("fast");
    if (state.streak >= 5) grant("streak5");
    if (n >= 8) grant("half");
    var ana = ["anagramEdges", "anagramFirst", "anagramLast", "anagramAll"], okAna = LETTERS.every(function (l, i) { return ana.indexOf(l.mechanic) < 0 || (res[i] && res[i].errors === 0); });
    if (okAna && LETTERS.some(function (l) { return ana.indexOf(l.mechanic) >= 0; })) grant("anagrams");
    var flips = ["upsideDown", "mirror"], okFl = LETTERS.every(function (l, i) { return flips.indexOf(l.mechanic) < 0 || res[i]; });
    if (okFl && LETTERS.some(function (l) { return flips.indexOf(l.mechanic) >= 0; })) grant("mirror");
    if (n === LETTERS.length) {
      if (res.every(function (r) { return r && r.errors === 0; })) grant("clean");
      grant("all");
    }
  }
  function drawAwards(box) {
    box.innerHTML = "";
    AWARDS.forEach(function (a) {
      box.appendChild(el("div", "award" + (state.awards[a.id] ? "" : " locked"), '<span class="a-icon">' + a.icon + '</span><div><div class="a-name">' + esc(a.name) + '</div><div class="a-desc">' + esc(a.desc) + "</div></div>"));
    });
  }

  // ---------- финал ----------
  function finish() {
    var res = state.results, total = 0, errs = 0, best = 0;
    res.forEach(function (r, i) { total += r.ms; errs += r.errors; if (r.ms < res[best].ms) best = i; });
    $("stats").innerHTML =
      '<div class="stat"><b>' + res.length + " / " + LETTERS.length + "</b><span>подарков собрано</span></div>" +
      '<div class="stat"><b>' + fmt(total) + "</b><span>общее время чтения</span></div>" +
      '<div class="stat"><b>' + fmt(res[best].ms) + "</b><span>быстрее всего — письмо " + esc(from(LETTERS[best])) + "</span></div>" +
      '<div class="stat"><b>' + errs + "</b><span>" + (errs === 0 ? "ошибок — идеально!" : "ошибок при выборе") + "</span></div>";
    drawAwards($("finish-awards"));
    var k = $("kids"); k.innerHTML = "";
    LETTERS.forEach(function (l, i) {
      k.appendChild(el("div", "kid" + (i === best ? " fast" : ""), '<img src="' + img(l.gift) + '" alt="">' + esc(l.name) + '<div class="k-time">' + fmt(res[i].ms) + "</div>"));
    });
    $("dip-time").textContent = "Время чтения: " + fmt(total);
    $("dip-awards").textContent = "Наград: " + Object.keys(state.awards).length + " из " + AWARDS.length;
    stopTimer();
    show("screen-finish");
    fanfare();
  }

  // ---------- старт ----------
  function start() {
    clearSave();
    state.index = 0; state.results = []; state.awards = {}; state.streak = 0;
    show("screen-game"); showMail();
  }
  function resume() {
    var d = load();
    if (!d) { start(); return; }
    state.index = d.index; state.results = d.results; state.awards = d.awards || {}; state.streak = d.streak || 0;
    if (state.index >= LETTERS.length) { finish(); return; }
    show("screen-game"); showMail();
  }
  function setupCover() {
    var d = load(), c = $("btn-continue"), s = $("btn-start");
    if (!d) { c.classList.add("hidden"); s.textContent = "Начать"; s.className = "btn btn-primary"; return; }
    var n = d.results.filter(Boolean).length;
    c.textContent = n >= LETTERS.length ? "Посмотреть итоги" : "Продолжить (" + n + " / " + LETTERS.length + ")";
    c.classList.remove("hidden");
    s.textContent = "Начать заново"; s.className = "btn btn-secondary";
  }

  document.addEventListener("DOMContentLoaded", function () {
    makeSnow();
    // заранее загружаем картинки, чтобы полки появлялись сразу
    Object.keys(GIFTS).forEach(function (k) { var im = new Image(); im.src = img(k); });
    $("start-title").textContent = GAME.title || "Помоги Деду Морозу собрать подарки";
    $("start-badge").textContent = [GAME.subtitle, GAME.classes].filter(Boolean).join(" · ");
    $("start-count").textContent = LETTERS.length;
    document.title = GAME.title || document.title;
    setupCover();

    $("btn-start").addEventListener("click", function () {
      if (load() && !window.confirm("Начать заново? Собранные подарки и награды пропадут.")) return;
      start();
    });
    $("btn-continue").addEventListener("click", resume);
    $("btn-open").addEventListener("click", openLetter);
    $("btn-read").addEventListener("click", doneReading);
    $("btn-restart").addEventListener("click", start);
    $("btn-awards").addEventListener("click", function () { drawAwards($("awards-list")); $("awards-modal").classList.remove("hidden"); });
    $("btn-awards-close").addEventListener("click", function () { $("awards-modal").classList.add("hidden"); });
    $("btn-diploma").addEventListener("click", function () { $("diploma-modal").classList.remove("hidden"); });
    $("btn-diploma-close").addEventListener("click", function () { $("diploma-modal").classList.add("hidden"); });
    $("btn-print").addEventListener("click", function () { $("dip-name").blur(); window.print(); });
    $("btn-sound").addEventListener("click", function () { state.sound = !state.sound; this.textContent = state.sound ? "🔊" : "🔇"; });

    // Enter — главная кнопка на экране
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" || e.target.tagName === "INPUT" || e.target.tagName === "BUTTON") return;
      if (!$("screen-game").classList.contains("active")) return;
      if (state.phase === "mail") openLetter();
      else if (state.phase === "read") doneReading();
      else if (state.phase === "done" && $("btn-next")) next();
    });
  });
})();

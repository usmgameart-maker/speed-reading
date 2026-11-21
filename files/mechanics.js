// ============================================================
//  Механики скорочтения: превращают обычный текст в «хитрый».
//  Этот файл трогать не нужно.
// ============================================================
(function () {
  "use strict";

  var VOWELS = "аеёиоуыэюяАЕЁИОУЫЭЮЯ";
  var PREPOSITIONS = ["в", "во", "на", "с", "со", "к", "ко", "по", "о", "об", "обо", "от", "до", "из", "у", "за", "над", "под", "про", "для", "без", "через", "при", "перед", "между", "около", "из-за"];
  var EXTRA = "ажкшмрнпфцхтльвбсзд";
  var NOISE = "0123456789%#";
  var WORD = /[А-Яа-яЁёA-Za-z]+/g;

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  // Псевдослучайность с «зерном»: одно и то же письмо всегда искажается одинаково
  function rng(seed) {
    var s = 0;
    for (var i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) >>> 0;
    s = s || 1;
    return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }
  function shuffled(arr, rnd) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  // Перемешать так, чтобы получилось не то же самое слово (если это возможно)
  function mix(letters, rnd) {
    if (letters.length < 2) return letters.slice();
    var same = letters.join("");
    for (var t = 0; t < 12; t++) { var m = shuffled(letters, rnd); if (m.join("") !== same) return m; }
    return letters.slice().reverse();
  }

  // Применить функцию к каждому слову, сохранив пробелы и знаки препинания
  function eachWord(text, fn) {
    var out = "", last = 0, m, i = 0;
    WORD.lastIndex = 0;
    while ((m = WORD.exec(text)) !== null) {
      out += esc(text.slice(last, m.index));
      out += fn(m[0], i++);
      last = m.index + m[0].length;
    }
    return out + esc(text.slice(last));
  }

  var M = {};

  M.noPrepositions = function (t) {
    return eachWord(t, function (w) { return PREPOSITIONS.indexOf(w.toLowerCase()) >= 0 ? '<span class="gap">' + new Array(w.length + 1).join("_") + "</span>" : esc(w); });
  };
  M.noSpaces = function (t) { return esc(t.replace(/ +/g, "")); };
  // Лишние буквы: в коротких словах (3–4 буквы) — 1, в средних (5–7) — 2, в длинных (8+) — 3
  M.extraLetters = function (t, rnd) {
    return eachWord(t, function (w) {
      var n = w.length < 3 ? 0 : w.length <= 4 ? 1 : w.length <= 7 ? 2 : 3;
      if (!n) return esc(w);
      var slots = [];
      for (var k = 1; k < w.length; k++) slots.push(k);
      var pos = shuffled(slots, rnd).slice(0, n).sort(function (x, y) { return x - y; });
      var out = "", last = 0;
      pos.forEach(function (p) {
        out += esc(w.slice(last, p)) + '<span class="extra">' + EXTRA.charAt(Math.floor(rnd() * EXTRA.length)) + "</span>";
        last = p;
      });
      return out + esc(w.slice(last));
    });
  };

  M.noVowels = function (t) {
    return eachWord(t, function (w) { return esc(w.split("").map(function (c) { return VOWELS.indexOf(c) >= 0 ? "_" : c; }).join("")); });
  };
  M.noEndings = function (t) {
    return eachWord(t, function (w) { return w.length < 3 ? esc(w) : esc(w.slice(0, Math.max(1, w.length - 2))) + '<span class="gap">__</span>'; });
  };
  M.noise = function (t, rnd) {
    return eachWord(t, function (w) {
      return w.split("").map(function (c, i) { return esc(c) + (i < w.length - 1 ? '<span class="noise">' + NOISE.charAt(Math.floor(rnd() * NOISE.length)) + "</span>" : ""); }).join("");
    });
  };
  M.hideBottom = function (t) { return esc(t); };
  M.hideTop = function (t) { return esc(t); };
  M.anagramEdges = function (t, rnd) {
    return eachWord(t, function (w) { return w.length < 4 ? esc(w) : esc(w[0] + mix(w.slice(1, -1).split(""), rnd).join("") + w[w.length - 1]); });
  };
  M.anagramFirst = function (t, rnd) {
    return eachWord(t, function (w) { return w.length < 3 ? esc(w) : esc(w[0] + mix(w.slice(1).split(""), rnd).join("")); });
  };
  M.anagramLast = function (t, rnd) {
    return eachWord(t, function (w) { return w.length < 3 ? esc(w) : esc(mix(w.slice(0, -1).split(""), rnd).join("") + w[w.length - 1]); });
  };
  M.reverseWords = function (t) { return eachWord(t, function (w) { return esc(w.split("").reverse().join("")); }); };
  M.anagramAll = function (t, rnd) { return eachWord(t, function (w) { return esc(mix(w.split(""), rnd).join("")); }); };
  M.upsideDown = function (t) { return esc(t); };
  M.mirror = function (t) { return esc(t); };

  var LABELS = {
    noPrepositions: "В письме пропали предлоги.",
    noSpaces: "Все слова слиплись вместе.",
    extraLetters: "В слова пробрались лишние буквы (они серые).",
    noVowels: "Из письма исчезли гласные буквы.",
    noEndings: "У слов потерялись последние буквы.",
    noise: "Между буквами рассыпались цифры и символы.",
    hideBottom: "Нижняя половина строчек закрыта.",
    hideTop: "Верхняя половина строчек закрыта.",
    anagramEdges: "Буквы перепутались, но первая и последняя — на месте.",
    anagramFirst: "Буквы перепутались, но первая — на месте.",
    anagramLast: "Буквы перепутались, но последняя — на месте.",
    reverseWords: "Каждое слово написано задом наперёд.",
    anagramAll: "Все буквы в словах перепутаны.",
    upsideDown: "Письмо перевернулось вверх ногами.",
    mirror: "Письмо отразилось, как в воде."
  };

  // Вернёт { html, cls } — html текста и класс для особого вида (маски, переворот)
  window.TRANSFORM = function (text, mechanic) {
    var f = M[mechanic] || function (t) { return esc(t); };
    var cls = { hideBottom: "mask-bottom", hideTop: "mask-top", upsideDown: "flip-180", mirror: "flip-y", noise: "is-noise", noSpaces: "is-solid" }[mechanic] || "";
    return { html: f(text, rng(mechanic + text)), cls: cls, label: LABELS[mechanic] || "" };
  };
  window.MECHANIC_LABELS = LABELS;
})();

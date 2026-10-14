'use strict';

/* =========================================================
   Babka Greta – maskot Lift Tara v klientskej zóne.
   Na Prehľade, pri pláne a v Progrese povie krátku hlášku
   (každý deň inú, počas dňa sa nemení).
   ========================================================= */
const GRETA_IMG = '../icons/greta/avatar.jpg';
const GRETA_HOME = [
  'Ráno som odcvičila skôr, než vstali sliepky. Ty máš na to celý deň.',
  'Nevynechávaj. Vymeň. Kto hľadá, nájde spôsob.',
  'Voda, spánok, kroky. Toto som vedela aj bez appky.',
  'Rekordy sa nerobia na gauči.',
  'Aj ja som raz začínala. V roku 1962.',
  'Zjedz niečo poriadne, vyzeráš ako rezanec.',
  'Dnes aspoň prechádzka. Ja chodím do obchodu pešo, 3 kilometre.'
];
const GRETA_PLAN = [
  'Kolená von, hrudník hore. Ja drepujem hlbšie aj s vrecom zemiakov.',
  'Ak to bolí ostro, prestaň. Ak to len páli, makaj ďalej.',
  'Pomaly dole, silno hore. Tak sa miesi aj cesto.',
  'Dýchaj. Kto nedýcha, ten necvičí, ten sa trápi.',
  'Radšej o jedno opakovanie menej, ale poriadne.'
];
const GRETA_PROGRESS = [
  'Nie zlé. Na mladíka.',
  'Čísla nepustia. Ani ja.',
  'Každý kilogram navyše na činke je jedna výhovorka menej.',
  'Vidíš? Vravela som, že to pôjde.'
];
const gretaPick = (list) => {
  const d = new Date();
  const day = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 864e5);
  return list[day % list.length];
};
const gretaHtml = (id, text, label = 'Greta') => `<div class="greta" id="${id}">
  <img src="${GRETA_IMG}" alt="Babka Greta" width="52" height="52" loading="lazy">
  <div class="greta-bubble"><b>${esc(tr(label))}</b>${esc(tr(text))}</div>
</div>`;

const renderWithoutGreta = render;
render = function (...args) {
  const r = renderWithoutGreta.apply(this, args);
  if (client()) {
    const main = document.getElementById('main');
    const rt = route();
    if (rt === '' && !document.getElementById('greta-home')) {
      const hero = main?.querySelector('.hero');
      hero?.insertAdjacentHTML('afterend', gretaHtml('greta-home', gretaPick(GRETA_HOME)));
    }
    if (rt === 'plan' && !document.getElementById('greta-plan')) {
      const head = main?.querySelector('.page-head, h1')?.closest('header, .page-head') || main?.querySelector('h1');
      (head || main?.firstElementChild)?.insertAdjacentHTML('afterend', gretaHtml('greta-plan', gretaPick(GRETA_PLAN), 'Gretin tip'));
    }
    if (rt === 'progress' && !document.getElementById('greta-progress')) {
      const head = main?.querySelector('.page-head, h1')?.closest('header, .page-head') || main?.querySelector('h1');
      (head || main?.firstElementChild)?.insertAdjacentHTML('afterend', gretaHtml('greta-progress', gretaPick(GRETA_PROGRESS)));
    }
  } else if (document.getElementById('login-form') && !document.getElementById('greta-login')) {
    document.getElementById('login-form').insertAdjacentHTML('beforebegin', gretaHtml('greta-login', 'Zadaj kód od trénera. Ja zatiaľ upečiem koláč.'));
  }
  return r;
};
render();

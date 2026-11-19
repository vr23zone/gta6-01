// The HUD is plain DOM over the canvas: cash, health and armor bars, wanted stars, the
// objective banner, contextual prompts, dialogue, toasts and the big WASTED/BUSTED banner.
// This module owns every element; main only ever calls these setters.

export function createHud() {
  const el = (id) => document.getElementById(id);
  const hud = el('hud');
  const cash = el('cash');
  const healthFill = el('health-fill');
  const armorFill = el('armor-fill');
  const respect = el('respect');
  const stars = el('stars');
  const clock = el('clock');
  const objective = el('objective');
  const objectiveTitle = el('objective-title');
  const objectiveText = el('objective-text');
  const weapon = el('weapon');
  const speedo = el('speedo');
  const prompt = el('prompt');
  const toast = el('toast');
  const dialogue = el('dialogue');
  const dialogueName = el('dialogue-name');
  const dialogueText = el('dialogue-text');
  const banner = el('banner');
  const bannerText = el('banner-text');
  const bannerSub = el('banner-sub');
  const vignette = el('vignette');

  // The bust meter lives under the stars; it only exists while the police are close.
  const bustWrap = document.createElement('div');
  bustWrap.style.cssText = 'margin-top:4px;height:7px;background:rgba(0,0,0,0.55);border:1px solid rgba(255,255,255,0.4);border-radius:3px;overflow:hidden;display:none;';
  const bustFill = document.createElement('div');
  bustFill.style.cssText = 'height:100%;width:0%;background:#4cc9f0;';
  bustWrap.appendChild(bustFill);
  el('hud-right').appendChild(bustWrap);

  let toastTime = 0;

  return {
    show() { hud.classList.remove('hidden'); },
    hide() { hud.classList.add('hidden'); },
    setCash(amount) { cash.textContent = `$${Math.round(amount).toLocaleString('en-US')}`; },
    setHealth(health, armor) {
      healthFill.style.width = `${Math.max(0, health)}%`;
      armorFill.style.width = `${Math.max(0, armor)}%`;
    },
    setRespect(text) { respect.textContent = text; },
    setStars(wanted) {
      let html = '';
      for (let i = 0; i < 5; i += 1) html += `<span class="${i < wanted ? '' : 'off'}">★</span>`;
      stars.innerHTML = html;
    },
    setBust(progress) {
      bustWrap.style.display = progress > 0.02 ? 'block' : 'none';
      bustFill.style.width = `${Math.round(progress * 100)}%`;
    },
    setClock(text) { clock.textContent = text; },
    setObjective(title, text, dist) {
      if (!text) { objective.classList.add('hidden'); return; }
      objective.classList.remove('hidden');
      objectiveTitle.textContent = title || '';
      objectiveText.innerHTML = dist != null
        ? `${text} · <span class="dist">${Math.round(dist)}m</span>`
        : text;
    },
    setWeapon(armed, ammo, reloading) {
      if (!armed) { weapon.classList.add('hidden'); return; }
      weapon.classList.remove('hidden');
      weapon.innerHTML = reloading
        ? 'PISTOL<span class="ammo">RELOADING…</span>'
        : `PISTOL<span class="ammo">${ammo} / ∞</span>`;
    },
    setSpeed(kmh) {
      if (kmh == null) { speedo.classList.add('hidden'); return; }
      speedo.classList.remove('hidden');
      speedo.innerHTML = `${Math.round(kmh)} <small>KM/H</small>`;
    },
    setPrompt(html) {
      if (!html) { prompt.classList.add('hidden'); return; }
      prompt.classList.remove('hidden');
      prompt.innerHTML = html;
    },
    toast(title, sub = '') {
      toast.classList.remove('hidden');
      toast.innerHTML = `${title}<span class="sub">${sub}</span>`;
      toastTime = 3.4;
    },
    showDialogue(name, text) {
      dialogue.classList.remove('hidden');
      dialogueName.textContent = name;
      dialogueText.textContent = text;
    },
    hideDialogue() { dialogue.classList.add('hidden'); },
    banner(text, sub, kind = '') {
      banner.classList.remove('hidden');
      banner.className = kind;
      bannerText.textContent = text;
      bannerSub.textContent = sub || '';
    },
    hideBanner() { banner.classList.add('hidden'); },
    setVignette(opacity) { vignette.style.opacity = String(opacity); },
    /** Toasts fade on their own clock. */
    update(dt) {
      if (toastTime > 0) {
        toastTime -= dt;
        if (toastTime <= 0) toast.classList.add('hidden');
      }
    },
  };
}

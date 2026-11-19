// hud.js — everything the player reads: the DOM layer over the canvas. Cash and the
// debt still owed, wanted stars that fill as the heat rises, health and armour
// bars, a speedometer in the car, the current objective under the minimap, a bust
// meter when an officer has hands on you, mission banners across the top, and the
// dialogue box where Sol Marín does most of the talking. The class only writes
// text and widths — all styling lives in style.css.

export class Hud {
  constructor() {
    const el = (id) => document.getElementById(id);
    this.cashEl = el('hud-cash');
    this.debtEl = el('hud-debt');
    this.starsEl = el('hud-stars');
    this.healthEl = el('hud-health-fill');
    this.armorEl = el('hud-armor-fill');
    this.armorWrap = el('hud-armor-wrap');
    this.speedWrap = el('hud-speed');
    this.speedEl = el('hud-speed-num');
    this.objectiveEl = el('hud-objective');
    this.bannerEl = el('banner');
    this.bannerTitle = el('banner-title');
    this.bannerSub = el('banner-sub');
    this.dialogueEl = el('dialogue');
    this.dialogueWho = el('dialogue-who');
    this.dialogueText = el('dialogue-text');
    this.bustWrap = el('bust-wrap');
    this.bustFill = el('bust-fill');
    this.flashEl = el('hit-flash');
    this.toastEl = el('toast');
    this.bannerTimer = 0;
    this.toastTimer = 0;
    this.flashTimer = 0;
    this.dialogueQueue = [];
    this.dialogueTimer = 0;
    this.onDialogueEnd = null;
  }

  setCash(cash, debtLeft) {
    this.cashEl.textContent = `$${cash.toLocaleString('en-US')}`;
    this.debtEl.textContent = debtLeft > 0 ? `DEBT $${debtLeft.toLocaleString('en-US')}` : 'DEBT CLEAR';
    this.debtEl.classList.toggle('clear', debtLeft <= 0);
  }

  setStars(stars) {
    let out = '';
    for (let i = 0; i < 5; i++) out += i < stars ? '★' : '☆';
    this.starsEl.textContent = out;
    this.starsEl.classList.toggle('hot', stars >= 3);
  }

  setVitals(health, armor) {
    this.healthEl.style.width = `${Math.max(0, health)}%`;
    this.healthEl.style.background = health < 30 ? '#d7263d' : '#59b06a';
    this.armorWrap.style.display = armor > 0 ? 'block' : 'none';
    this.armorEl.style.width = `${Math.max(0, armor)}%`;
  }

  setSpeed(kmh) {
    if (kmh === null) {
      this.speedWrap.style.display = 'none';
      return;
    }
    this.speedWrap.style.display = 'block';
    this.speedEl.textContent = String(Math.round(kmh));
  }

  setObjective(text) {
    if (this.objectiveEl.textContent !== text) this.objectiveEl.textContent = text;
  }

  banner(title, sub = '', seconds = 3.4) {
    this.bannerTitle.textContent = title;
    this.bannerSub.textContent = sub;
    this.bannerEl.classList.add('show');
    this.bannerTimer = seconds;
  }

  toast(text, seconds = 2.2) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    this.toastTimer = seconds;
  }

  hitFlash() {
    this.flashTimer = 0.28;
    this.flashEl.style.opacity = '0.33';
  }

  setBust(progress) {
    if (progress <= 0.01) {
      this.bustWrap.style.display = 'none';
      return;
    }
    this.bustWrap.style.display = 'block';
    this.bustFill.style.width = `${Math.round(progress * 100)}%`;
  }

  // Dialogue: a queue of {who, text}; E or a click steps through, and the box
  // steps itself after a few seconds so staged screenshots can show it hands-free.
  say(lines, onEnd) {
    this.dialogueQueue = lines.slice();
    this.onDialogueEnd = onEnd || null;
    this.showLine();
  }

  showLine() {
    const line = this.dialogueQueue[0];
    if (!line) {
      this.dialogueEl.classList.remove('show');
      const cb = this.onDialogueEnd;
      this.onDialogueEnd = null;
      if (cb) cb();
      return;
    }
    this.dialogueWho.textContent = line.who;
    this.dialogueText.textContent = line.text;
    this.dialogueEl.classList.add('show');
    this.dialogueTimer = 4.6;
  }

  advanceDialogue() {
    if (!this.dialogueQueue.length) return false;
    this.dialogueQueue.shift();
    this.showLine();
    return true;
  }

  get dialogueActive() {
    return this.dialogueQueue.length > 0;
  }

  update(dt) {
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.bannerEl.classList.remove('show');
    }
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastEl.classList.remove('show');
    }
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) this.flashEl.style.opacity = '0';
    }
    if (this.dialogueQueue.length) {
      this.dialogueTimer -= dt;
      if (this.dialogueTimer <= 0) this.advanceDialogue();
    }
  }
}

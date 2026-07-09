(function () {
  const state = {
    mode: null,
    players: [],
    round: 1,
    currentPlayerIndex: 0,
    usedTruths: { kizlar: [], karma: [] },
    usedDares: { kizlar: [], karma: [] },
    usedVotes: { kizlar: [], karma: [] },
    turnsSinceVote: 0,
    currentCard: null,
    stats: {},
    cardsDrawn: 0,
    timerTotal: 0,
  };

  const screens = {
    home: document.getElementById('screen-home'),
    players: document.getElementById('screen-players'),
    game: document.getElementById('screen-game'),
    summary: document.getElementById('screen-summary'),
  };

  const els = {
    modeBadge: document.getElementById('mode-badge'),
    playerInput: document.getElementById('player-name-input'),
    playerList: document.getElementById('player-list'),
    playerHint: document.getElementById('player-hint'),
    btnStart: document.getElementById('btn-start-game'),
    roundCounter: document.getElementById('round-counter'),
    currentPlayer: document.getElementById('current-player'),
    choicePanel: document.getElementById('choice-panel'),
    cardPanel: document.getElementById('card-panel'),
    cardType: document.getElementById('card-type'),
    cardOwner: document.getElementById('card-owner'),
    cardTarget: document.getElementById('card-target'),
    cardText: document.getElementById('card-text'),
    btnDone: document.getElementById('btn-done'),
    btnShot: document.getElementById('btn-shot'),
    btnTimer: document.getElementById('btn-timer'),
    btnJoker: document.getElementById('btn-joker'),
    votePanel: document.getElementById('vote-panel'),
    voteText: document.getElementById('vote-text'),
    secretWarning: document.getElementById('secret-warning'),
    secretPlayerName: document.getElementById('secret-player-name'),
    secretNote: document.getElementById('secret-note'),
    shotChips: document.getElementById('shot-chips'),
    summaryBadge: document.getElementById('summary-badge'),
    summaryMeta: document.getElementById('summary-meta'),
    awards: document.getElementById('awards'),
    scoreList: document.getElementById('score-list'),
  };

  const MODE_LABELS = {
    kizlar: { name: 'Kızlar Gecesi', class: 'mode-badge--kizlar' },
    karma: { name: 'Full Ekip', class: 'mode-badge--karma' },
  };

  function showScreen(name) {
    Object.values(screens).forEach((s) => s.classList.remove('active'));
    screens[name].classList.add('active');
  }

  function contentFor(mode) {
    return mode === 'kizlar' ? KIZLAR_CONTENT : KARMA_CONTENT;
  }

  function getContent() {
    return contentFor(state.mode);
  }

  function currentPlayerName() {
    return state.players[state.currentPlayerIndex];
  }

  // ---------- Ses / titreşim / konfeti ----------

  let audioCtx = null;

  function playSound(kind) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      audioCtx = audioCtx || new AC();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const t = audioCtx.currentTime;

      const tone = (freq, start, dur, type, vol, endFreq) => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = type;
        o.frequency.setValueAtTime(freq, t + start);
        if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + start + dur);
        g.gain.setValueAtTime(0.0001, t + start);
        g.gain.exponentialRampToValueAtTime(vol, t + start + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, t + start + dur);
        o.connect(g).connect(audioCtx.destination);
        o.start(t + start);
        o.stop(t + start + dur + 0.05);
      };

      if (kind === 'flip') tone(500, 0, 0.08, 'triangle', 0.05, 220);
      if (kind === 'pop') {
        tone(160, 0, 0.18, 'sine', 0.15, 55);
        tone(950, 0, 0.05, 'triangle', 0.05);
      }
      if (kind === 'beep') {
        tone(880, 0, 0.12, 'square', 0.05);
        tone(880, 0.2, 0.12, 'square', 0.05);
      }
      if (kind === 'fanfare') {
        tone(440, 0, 0.09, 'triangle', 0.06);
        tone(554, 0.09, 0.09, 'triangle', 0.06);
        tone(659, 0.18, 0.16, 'triangle', 0.07);
      }
      if (kind === 'shh') {
        const len = Math.floor(audioCtx.sampleRate * 0.5);
        const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
        const src = audioCtx.createBufferSource();
        src.buffer = buf;
        const f = audioCtx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 4000;
        f.Q.value = 0.6;
        const g = audioCtx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.09, t + 0.06);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
        src.connect(f).connect(g).connect(audioCtx.destination);
        src.start(t);
      }
    } catch (e) {
      // Ses çalınamazsa oyun etkilenmesin.
    }
  }

  function vibrate(pattern) {
    if (navigator.vibrate) navigator.vibrate(pattern);
  }

  // Ses motorunu ilk dokunuşta sessizce kur: shot anında kurulursa
  // telefonlarda dokunma anını donduruyor.
  document.addEventListener('pointerdown', () => playSound('init'), { once: true });

  function showToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2400);
  }

  // ---------- Kart havuzu ve kalıcılık ----------

  // Kullanılan kart indekslerini telefonda sakla: oyun kapansa bile tüm
  // sorular bitmeden aynı soru tekrar gelmesin. Soru listesi güncellenirse
  // (uzunluk değişirse) eski indeksler geçersiz olacağından o liste sıfırlanır.
  const STORAGE_KEY = 'shot-truth-dare-used-v1';

  function saveUsedCards() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          lengths: {
            kizlar: {
              truths: KIZLAR_CONTENT.truths.length,
              dares: KIZLAR_CONTENT.dares.length,
              votes: KIZLAR_CONTENT.votes.length,
            },
            karma: {
              truths: KARMA_CONTENT.truths.length,
              dares: KARMA_CONTENT.dares.length,
              votes: KARMA_CONTENT.votes.length,
            },
          },
          used: {
            kizlar: {
              truths: state.usedTruths.kizlar,
              dares: state.usedDares.kizlar,
              votes: state.usedVotes.kizlar,
            },
            karma: {
              truths: state.usedTruths.karma,
              dares: state.usedDares.karma,
              votes: state.usedVotes.karma,
            },
          },
        })
      );
    } catch (e) {
      // localStorage kullanılamıyorsa (gizli sekme vb.) oyun kayıtsız devam eder.
    }
  }

  function loadUsedCards() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!saved || !saved.lengths || !saved.used) return;
      ['kizlar', 'karma'].forEach((mode) => {
        const content = contentFor(mode);
        if (saved.lengths[mode].truths === content.truths.length) {
          state.usedTruths[mode] = saved.used[mode].truths;
        }
        if (saved.lengths[mode].dares === content.dares.length) {
          state.usedDares[mode] = saved.used[mode].dares;
        }
        if (saved.lengths[mode].votes === content.votes.length && saved.used[mode].votes) {
          state.usedVotes[mode] = saved.used[mode].votes;
        }
      });
    } catch (e) {
      // Bozuk kayıt — temiz başla.
    }
  }

  // Kart öğeleri düz metin veya { text, secret, target, double } olabilir — tek biçime çevir.
  // target: true → uygulama, sırası gelen dışından rastgele bir hedef oyuncu seçer.
  // double: true → 'ya bu ya 2 shot' kartı; shot butonu 2 shot sayar.
  function normalizeCard(item) {
    return typeof item === 'string'
      ? { text: item, secret: false, target: false, double: false }
      : {
          text: item.text,
          secret: Boolean(item.secret),
          target: Boolean(item.target),
          double: Boolean(item.double),
        };
  }

  function pickTargetPlayer() {
    const others = state.players.filter((_, i) => i !== state.currentPlayerIndex);
    return others[Math.floor(Math.random() * others.length)];
  }

  function pickRandom(arr, usedKey) {
    const used = state[usedKey][state.mode];
    let availableIndexes = arr.map((_, i) => i).filter((i) => !used.includes(i));

    if (availableIndexes.length === 0) {
      state[usedKey][state.mode] = [];
      availableIndexes = arr.map((_, i) => i);
    }

    const index = availableIndexes[Math.floor(Math.random() * availableIndexes.length)];
    state[usedKey][state.mode].push(index);
    saveUsedCards();
    return normalizeCard(arr[index]);
  }

  // ---------- Oyuncu kurulumu ----------

  function shufflePlayers() {
    for (let i = state.players.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [state.players[i], state.players[j]] = [state.players[j], state.players[i]];
    }
  }

  function renderPlayers() {
    els.playerList.innerHTML = '';
    state.players.forEach((name, index) => {
      const li = document.createElement('li');
      li.className = 'player-item';
      li.innerHTML = `
        <span class="player-item__name">${escapeHtml(name)}</span>
        <button class="player-item__remove" data-index="${index}" aria-label="Kaldır">×</button>
      `;
      els.playerList.appendChild(li);
    });

    const ready = state.players.length >= 2;
    els.btnStart.disabled = !ready;
    els.playerHint.textContent = ready
      ? `${state.players.length} oyuncu hazır`
      : 'En az 2 oyuncu gerekli';
    els.playerHint.classList.toggle('ready', ready);
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function addPlayer() {
    const name = els.playerInput.value.trim();
    if (!name) return;
    if (state.players.length >= 12) {
      els.playerHint.textContent = 'En fazla 12 oyuncu olabilir';
      els.playerHint.classList.remove('ready');
      return;
    }
    if (state.players.some((p) => p.toLowerCase() === name.toLowerCase())) {
      els.playerHint.textContent = 'Bu isim zaten ekli';
      els.playerHint.classList.remove('ready');
      return;
    }

    state.players.push(name);
    els.playerInput.value = '';
    renderPlayers();
    els.playerInput.focus();
  }

  function removePlayer(index) {
    state.players.splice(index, 1);
    renderPlayers();
  }

  // ---------- Süre sayacı ----------

  let timerInterval = null;

  function formatDuration(secs) {
    return secs >= 60 ? `${secs / 60} dk` : `${secs} sn`;
  }

  function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  // Kart metninde "30 saniye" / "1 dakika" geçiyorsa sayaç çipini göster.
  // Gizli görevlerde ve 2 dakikadan uzun sürelerde (telefon elde durmaz) gösterme.
  function setupTimer(card) {
    stopTimer();
    els.btnTimer.classList.add('hidden');
    els.btnTimer.classList.remove('timer-chip--running', 'timer-chip--done');
    if (card.secret) return;
    const match = card.text.match(/(\d+)\s*(saniye|dakika)/i);
    if (!match) return;
    const secs = parseInt(match[1], 10) * (match[2].toLowerCase() === 'dakika' ? 60 : 1);
    if (secs > 120) return;
    state.timerTotal = secs;
    els.btnTimer.textContent = `⏱ ${formatDuration(secs)} — başlat`;
    els.btnTimer.style.setProperty('--progress', '0%');
    els.btnTimer.classList.remove('hidden');
  }

  function toggleTimer() {
    if (timerInterval) {
      stopTimer();
      setupTimer(state.currentCard);
      return;
    }
    let left = state.timerTotal;
    els.btnTimer.classList.remove('timer-chip--done');
    els.btnTimer.classList.add('timer-chip--running');
    const tick = () => {
      els.btnTimer.textContent = `⏱ ${left} sn`;
      els.btnTimer.style.setProperty('--progress', `${(100 * (state.timerTotal - left)) / state.timerTotal}%`);
      if (left <= 0) {
        stopTimer();
        els.btnTimer.textContent = '🔔 Süre doldu!';
        els.btnTimer.classList.remove('timer-chip--running');
        els.btnTimer.classList.add('timer-chip--done');
        playSound('beep');
        vibrate([100, 50, 100]);
      }
      left--;
    };
    tick();
    timerInterval = setInterval(tick, 1000);
  }

  // ---------- Oyun akışı ----------

  function resetGameView() {
    state.currentCard = null;
    stopTimer();
    els.choicePanel.classList.remove('hidden');
    els.cardPanel.classList.add('hidden');
    els.votePanel.classList.add('hidden');
    els.secretWarning.classList.add('hidden');
    els.secretNote.classList.add('hidden');
    els.cardTarget.classList.add('hidden');
    els.cardOwner.classList.add('hidden');
    els.btnTimer.classList.add('hidden');
    els.cardPanel.classList.remove('card-panel--truth', 'card-panel--dare', 'card-panel--secret');
  }

  function renderChips() {
    els.shotChips.innerHTML = '';
    state.players.forEach((name, i) => {
      const chip = document.createElement('span');
      chip.className = 'shot-chip' + (i === state.currentPlayerIndex ? ' shot-chip--active' : '');
      const st = state.stats[name] || { shots: 0 };
      chip.textContent = `${name} 🥃${st.shots}`;
      els.shotChips.appendChild(chip);
    });
  }

  // Oylama araya sürpriz olarak girer: en az 3 oyuncu varken, son oylamadan
  // en az 3 tur geçtiyse ~%25 ihtimalle. Sırası gelen kartı okur, herkes oylar,
  // sonra aynı oyuncu normal turuna devam eder.
  function shouldShowVote() {
    if (state.players.length < 3) return false;
    if (getContent().votes.length === 0) return false;
    if (state.turnsSinceVote < 3) return false;
    return Math.random() < 0.25;
  }

  function showVote() {
    const card = pickRandom(getContent().votes, 'usedVotes');
    state.turnsSinceVote = 0;
    state.cardsDrawn++;
    els.choicePanel.classList.add('hidden');
    els.votePanel.classList.remove('hidden');
    els.voteText.textContent = card.text;
    playSound('fanfare');
    vibrate(40);
  }

  function updateTurnDisplay() {
    els.currentPlayer.textContent = currentPlayerName();
    els.roundCounter.textContent = `Tur ${state.round}`;
    resetGameView();
    renderChips();

    const turnCard = document.getElementById('turn-card');
    if (turnCard) {
      turnCard.style.animation = 'none';
      turnCard.offsetHeight;
      turnCard.style.animation = 'pop 0.4s ease';
    }
  }

  function showCard(type) {
    const content = getContent();
    const card =
      type === 'truth'
        ? pickRandom(content.truths, 'usedTruths')
        : pickRandom(content.dares, 'usedDares');

    state.currentCard = { ...card, type, ownerName: currentPlayerName() };
    state.cardsDrawn++;
    if (card.target) state.currentCard.targetName = pickTargetPlayer();
    els.choicePanel.classList.add('hidden');
    els.cardPanel.classList.add('hidden');

    if (card.secret) {
      // Gizli görev: önce herkese uyarı göster, metni sadece oyuncu açsın.
      els.secretPlayerName.textContent = currentPlayerName();
      els.secretWarning.classList.remove('hidden');
      playSound('shh');
      vibrate(80);
      return;
    }

    revealCard();
  }

  function revealCard() {
    const card = state.currentCard;
    els.secretWarning.classList.add('hidden');
    els.cardPanel.classList.remove('hidden');
    els.cardPanel.classList.add(card.type === 'truth' ? 'card-panel--truth' : 'card-panel--dare');
    els.cardType.textContent = card.type === 'truth' ? 'DOĞRULUK' : 'CESARET';
    els.cardText.textContent = card.text;
    els.btnDone.textContent = card.type === 'truth' ? 'Cevapladım ✓' : 'Yaptım ✓';
    els.btnShot.textContent = card.double ? '2 Shot at 🥃🥃' : 'Shot at 🥃';
    playSound('flip');

    if (card.targetName) {
      els.cardTarget.textContent = `🎯 Seçilen kişi: ${card.targetName}`;
      els.cardTarget.classList.remove('hidden');
    }

    if (card.secret) {
      els.cardPanel.classList.add('card-panel--secret');
      els.cardType.textContent = 'GİZLİ GÖREV';
      els.secretNote.classList.remove('hidden');
    }

    const st = state.stats[currentPlayerName()];
    els.btnJoker.classList.toggle('hidden', !st || st.jokerUsed);
    setupTimer(card);
  }

  function nextPlayer() {
    state.currentPlayerIndex++;
    state.turnsSinceVote++;

    if (state.currentPlayerIndex >= state.players.length) {
      state.currentPlayerIndex = 0;
      state.round++;
      const lastPlayer = state.players[state.players.length - 1];
      shufflePlayers();
      // Turun son oyuncusu yeni turun ilki olmasın — aynı kişi üst üste oynamasın.
      if (state.players.length > 1 && state.players[0] === lastPlayer) {
        const j = 1 + Math.floor(Math.random() * (state.players.length - 1));
        [state.players[0], state.players[j]] = [state.players[j], state.players[0]];
      }
    }

    updateTurnDisplay();
    if (shouldShowVote()) showVote();
  }

  function startGame() {
    if (state.players.length < 2) return;
    shufflePlayers();
    state.currentPlayerIndex = 0;
    state.round = 1;
    state.turnsSinceVote = 0;
    state.cardsDrawn = 0;
    state.stats = {};
    state.players.forEach((name) => {
      state.stats[name] = { shots: 0, truths: 0, dares: 0, jokerUsed: false };
    });
    updateTurnDisplay();
    showScreen('game');
  }

  function selectMode(mode) {
    state.mode = mode;
    state.players = [];

    const label = MODE_LABELS[mode];
    els.modeBadge.textContent = label.name;
    els.modeBadge.className = `mode-badge ${label.class}`;

    renderPlayers();
    showScreen('players');
    els.playerInput.focus();
  }

  // ---------- Gece özeti ----------

  function showSummary() {
    const players = state.players;
    const statOf = (name) => state.stats[name] || { shots: 0, truths: 0, dares: 0, jokerUsed: false };

    const label = MODE_LABELS[state.mode];
    els.summaryBadge.textContent = label.name;
    els.summaryBadge.className = `mode-badge ${label.class}`;
    els.summaryMeta.textContent = `${state.round} tur · ${state.cardsDrawn} kart açıldı · ${players.length} oyuncu`;

    const maxBy = (key) => {
      const max = Math.max(...players.map((n) => statOf(n)[key]));
      return { value: max, names: players.filter((n) => statOf(n)[key] === max) };
    };
    const minBy = (key) => {
      const min = Math.min(...players.map((n) => statOf(n)[key]));
      return { value: min, names: players.filter((n) => statOf(n)[key] === min) };
    };
    const joinNames = (names) => (names.length > 3 ? `${names.length} kişi berabere` : names.join(' & '));

    const shotsMax = maxBy('shots');
    const shotsMin = minBy('shots');
    const daresMax = maxBy('dares');
    const truthsMax = maxBy('truths');
    const jokers = players.filter((n) => statOf(n).jokerUsed);

    const awards = [];
    const crownTitle = state.mode === 'kizlar' ? 'Gecenin Shot Kraliçesi' : 'Gecenin Shot Şampiyonu';
    if (shotsMax.value > 0) {
      awards.push({ emoji: '🏆', title: crownTitle, name: `${joinNames(shotsMax.names)} · ${shotsMax.value} shot` });
      if (shotsMin.names.length < players.length) {
        awards.push({ emoji: '😇', title: 'En Temiz Oyuncu', name: `${joinNames(shotsMin.names)} · ${shotsMin.value} shot` });
      }
    } else {
      awards.push({ emoji: '😇', title: 'Tertemiz Gece', name: 'Kimse shot atmadı — helal olsun!' });
    }
    if (daresMax.value > 0) {
      awards.push({ emoji: '🔥', title: 'En Cesur', name: `${joinNames(daresMax.names)} · ${daresMax.value} cesaret` });
    }
    if (truthsMax.value > 0) {
      awards.push({ emoji: '💬', title: 'Gecenin Filozofu', name: `${joinNames(truthsMax.names)} · ${truthsMax.value} doğruluk` });
    }
    if (jokers.length > 0) {
      awards.push({ emoji: '🃏', title: 'Joker Kullananlar', name: joinNames(jokers) });
    }

    els.awards.innerHTML = '';
    awards.forEach((a) => {
      const row = document.createElement('div');
      row.className = 'award';
      const emoji = document.createElement('span');
      emoji.className = 'award__emoji';
      emoji.textContent = a.emoji;
      const info = document.createElement('div');
      const title = document.createElement('p');
      title.className = 'award__title';
      title.textContent = a.title;
      const name = document.createElement('p');
      name.className = 'award__name';
      name.textContent = a.name;
      info.appendChild(title);
      info.appendChild(name);
      row.appendChild(emoji);
      row.appendChild(info);
      els.awards.appendChild(row);
    });

    els.scoreList.innerHTML = '';
    [...players]
      .sort((a, b) => statOf(b).shots - statOf(a).shots)
      .forEach((name) => {
        const st = statOf(name);
        const li = document.createElement('li');
        const left = document.createElement('span');
        left.textContent = name;
        const right = document.createElement('span');
        right.textContent = `🥃 ${st.shots} · 🔥 ${st.dares} · 💬 ${st.truths}`;
        li.appendChild(left);
        li.appendChild(right);
        els.scoreList.appendChild(li);
      });

    showScreen('summary');
    playSound('fanfare');
  }

  // ---------- Olaylar ----------

  loadUsedCards();

  document.querySelectorAll('.mode-card').forEach((btn) => {
    btn.addEventListener('click', () => selectMode(btn.dataset.mode));
  });

  document.getElementById('btn-add-player').addEventListener('click', addPlayer);
  els.playerInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addPlayer();
  });

  els.playerList.addEventListener('click', (e) => {
    const btn = e.target.closest('.player-item__remove');
    if (btn) removePlayer(Number(btn.dataset.index));
  });

  document.getElementById('btn-back-players').addEventListener('click', () => {
    showScreen('home');
  });

  document.getElementById('btn-back-game').addEventListener('click', () => {
    if (confirm('Oyundan çıkmak istiyor musun?')) {
      showScreen('players');
    }
  });

  document.getElementById('btn-end-night').addEventListener('click', () => {
    if (confirm('Geceyi bitirip özeti görelim mi? 🌙')) {
      showSummary();
    }
  });

  els.btnStart.addEventListener('click', startGame);

  document.getElementById('btn-truth').addEventListener('click', () => showCard('truth'));
  document.getElementById('btn-dare').addEventListener('click', () => showCard('dare'));

  document.getElementById('btn-reveal-secret').addEventListener('click', revealCard);

  // Cevapladım/Yaptım veya Shot → doğrudan sıradaki oyuncuya geç.
  // Ekran anında sıfırlandığı için gizli görev metni de kimseye görünmez.
  // İstatistik, kartı fiilen yapan kişiye işlenir — joker ile devredildiyse
  // yeni sahibine, yoksa sırası gelen oyuncuya.
  function cardOwnerStats() {
    const owner = (state.currentCard && state.currentCard.ownerName) || currentPlayerName();
    return state.stats[owner];
  }

  els.btnDone.addEventListener('click', () => {
    const st = cardOwnerStats();
    if (st && state.currentCard) {
      if (state.currentCard.type === 'truth') st.truths++;
      else st.dares++;
    }
    nextPlayer();
  });

  // Shot da 'Yaptım' gibi anında sıradaki oyuncuya geçer — bekleme ve
  // konfeti yok; telefonlarda takılmaya yol açıyordu.
  // 'Ya bu ya 2 shot' kartlarında sayaca 2 shot işlenir.
  els.btnShot.addEventListener('click', () => {
    const st = cardOwnerStats();
    if (st) st.shots += state.currentCard && state.currentCard.double ? 2 : 1;
    playSound('pop');
    vibrate([30, 40, 30]);
    nextPlayer();
  });

  // Joker: oyuncu başına oyunda 1 kez — kartını rastgele birine devreder,
  // bedeli bir shot (otomatik sayaca işlenir).
  els.btnJoker.addEventListener('click', () => {
    const st = state.stats[currentPlayerName()];
    if (!st || st.jokerUsed || !state.currentCard) return;
    st.jokerUsed = true;
    st.shots++;

    const others = state.players.filter((n) => n !== currentPlayerName());
    const newOwner = others[Math.floor(Math.random() * others.length)];
    state.currentCard.ownerName = newOwner;

    // Kartın hedefi yeni sahibinin kendisiyse hedefi yeniden seç.
    if (state.currentCard.targetName === newOwner) {
      const rest = state.players.filter((n) => n !== newOwner);
      state.currentCard.targetName = rest[Math.floor(Math.random() * rest.length)];
      els.cardTarget.textContent = `🎯 Seçilen kişi: ${state.currentCard.targetName}`;
    }

    els.cardOwner.textContent = `🃏 Kartın yeni sahibi: ${newOwner}`;
    els.cardOwner.classList.remove('hidden');
    els.btnJoker.classList.add('hidden');
    els.btnDone.textContent = state.currentCard.type === 'truth' ? 'Cevapladı ✓' : 'Yaptı ✓';
    showToast(`🃏 Yeni sahibi: ${newOwner} — sen bir shot at!`);
    playSound('pop');
    vibrate([30, 40, 30]);
    renderChips();
  });

  els.btnTimer.addEventListener('click', toggleTimer);

  // Oylama bitti → aynı oyuncu normal turuna devam eder.
  document.getElementById('btn-vote-done').addEventListener('click', () => {
    els.votePanel.classList.add('hidden');
    els.choicePanel.classList.remove('hidden');
  });

  document.getElementById('btn-new-game').addEventListener('click', startGame);

  document.getElementById('btn-summary-home').addEventListener('click', () => {
    showScreen('home');
  });
})();

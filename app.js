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
  };

  const screens = {
    home: document.getElementById('screen-home'),
    players: document.getElementById('screen-players'),
    game: document.getElementById('screen-game'),
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
    cardTarget: document.getElementById('card-target'),
    cardText: document.getElementById('card-text'),
    btnDone: document.getElementById('btn-done'),
    votePanel: document.getElementById('vote-panel'),
    voteText: document.getElementById('vote-text'),
    secretWarning: document.getElementById('secret-warning'),
    secretPlayerName: document.getElementById('secret-player-name'),
    secretNote: document.getElementById('secret-note'),
  };

  const MODE_LABELS = {
    kizlar: { name: 'Kızlar Gecesi', class: 'mode-badge--kizlar' },
    karma: { name: 'Karma Ortam', class: 'mode-badge--karma' },
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

  // Kart öğeleri düz metin veya { text, secret, target } olabilir — tek biçime çevir.
  // target: true → uygulama, sırası gelen dışından rastgele bir hedef oyuncu seçer.
  function normalizeCard(item) {
    return typeof item === 'string'
      ? { text: item, secret: false, target: false }
      : { text: item.text, secret: Boolean(item.secret), target: Boolean(item.target) };
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

  function resetGameView() {
    state.currentCard = null;
    els.choicePanel.classList.remove('hidden');
    els.cardPanel.classList.add('hidden');
    els.votePanel.classList.add('hidden');
    els.secretWarning.classList.add('hidden');
    els.secretNote.classList.add('hidden');
    els.cardTarget.classList.add('hidden');
    els.cardPanel.classList.remove('card-panel--truth', 'card-panel--dare', 'card-panel--secret');
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
    els.choicePanel.classList.add('hidden');
    els.votePanel.classList.remove('hidden');
    els.voteText.textContent = card.text;
  }

  function updateTurnDisplay() {
    const player = state.players[state.currentPlayerIndex];
    els.currentPlayer.textContent = player;
    els.roundCounter.textContent = `Tur ${state.round}`;
    resetGameView();

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

    state.currentCard = { ...card, type };
    if (card.target) state.currentCard.targetName = pickTargetPlayer();
    els.choicePanel.classList.add('hidden');

    if (card.secret) {
      // Gizli görev: önce herkese uyarı göster, metni sadece oyuncu açsın.
      els.secretPlayerName.textContent = state.players[state.currentPlayerIndex];
      els.secretWarning.classList.remove('hidden');
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

    if (card.targetName) {
      els.cardTarget.textContent = `🎯 Seçilen kişi: ${card.targetName}`;
      els.cardTarget.classList.remove('hidden');
    }

    if (card.secret) {
      els.cardPanel.classList.add('card-panel--secret');
      els.cardType.textContent = 'GİZLİ GÖREV';
      els.secretNote.classList.remove('hidden');
    }
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

  els.btnStart.addEventListener('click', startGame);

  document.getElementById('btn-truth').addEventListener('click', () => showCard('truth'));
  document.getElementById('btn-dare').addEventListener('click', () => showCard('dare'));

  document.getElementById('btn-reveal-secret').addEventListener('click', revealCard);

  // Cevapladım/Yaptım veya Shot → doğrudan sıradaki oyuncuya geç.
  // Ekran anında sıfırlandığı için gizli görev metni de kimseye görünmez.
  els.btnDone.addEventListener('click', nextPlayer);
  document.getElementById('btn-shot').addEventListener('click', nextPlayer);

  // Oylama bitti → aynı oyuncu normal turuna devam eder.
  document.getElementById('btn-vote-done').addEventListener('click', () => {
    els.votePanel.classList.add('hidden');
    els.choicePanel.classList.remove('hidden');
  });
})();

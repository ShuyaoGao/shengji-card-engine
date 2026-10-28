/* 升级（打百分）引擎，移植自 games/shengji.py：4 人 1 副牌 54 张，每人 12 张，底牌 6 张归庄家扣回；
 * 0&2 vs 1&3。主牌 = 大王 > 小王 > 正级牌 > 副级牌 > 主花色 A→2；跟牌必须跟门；一墩四张，赢家继续领出。
 * 抓分 5/10/K，共 100 分；闲家赢末墩底牌分 ×2。升级：闲 0 分庄 +3 / <40 庄 +2 / <80 庄 +1；≥80 闲家上台。
 * 含整场 ShengJiMatch。依赖：CG（core.js）、PyRandom。
 */
(function (root) {
  'use strict';
  var CG = root.CG, SJ = CG.SMALL_JOKER, BJ = CG.BIG_JOKER, Move = CG.Move, SUITS = CG.SUITS;
  var POINTS = {5: 5, 10: 10, 13: 10};
  function pts(c) { return POINTS[c.r] || 0; }
  function cardIndex(c) {
    if (c.r === SJ) return 52;
    if (c.r === BJ) return 53;
    return SUITS.indexOf(c.s) * 13 + (c.r - 2);
  }

  function ShengJi(rng, level, banker) {
    this.rng = rng || new root.PyRandom();
    this.level = level === undefined ? 2 : level;
    this.banker = banker === undefined ? 0 : banker;
  }
  ShengJi.prototype.N = 4;
  ShengJi.prototype.NAME = 'shengji';
  ShengJi.prototype.TITLE = '升级（打百分）';
  ShengJi.prototype.HAS_PASS = false;

  ShengJi.prototype.deal = function () {
    var self = this, cards = CG.deck(1, 2);
    this.rng.shuffle(cards);
    var order = [];
    for (var i = 0; i < 48; i++) order.push([(this.banker + i) % 4, cards[i]]);
    this.trumpSuit = null;
    this.declarer = null;
    for (i = 0; i < order.length; i++) {
      var c = order[i][1];
      if (c.r === this.level && c.s) { this.trumpSuit = c.s; this.declarer = order[i][0]; break; }
    }
    var bottom = cards.slice(48);
    if (this.trumpSuit === null) this.trumpSuit = bottom[0].s ? bottom[0].s : null;
    this.hands = [[], [], [], []];
    order.forEach(function (o) { self.hands[o[0]].push(o[1]); });
    var h = this.hands[this.banker].concat(bottom);
    h = h.map(function (x, k) { return [x, k]; }).sort(function (a, b) {
      return CG.cmpTuple([self.isTrump(a[0]), POINTS[a[0].r] !== undefined, self.order(a[0])],
        [self.isTrump(b[0]), POINTS[b[0].r] !== undefined, self.order(b[0])]) || a[1] - b[1];
    }).map(function (x) { return x[0]; });
    this.bottomBuried = h.slice(0, 6);
    this.hands[this.banker] = h.slice(6);
    for (var s = 0; s < 4; s++) this.hands[s] = this.sortHand(this.hands[s]);
  };
  ShengJi.prototype.sortHand = function (hand) {
    var self = this;
    return hand.map(function (x, k) { return [x, k]; }).sort(function (a, b) {
      var ca = self.suitClass(a[0]), cb = self.suitClass(b[0]);
      return (ca < cb ? -1 : ca > cb ? 1 : 0) || (self.order(a[0]) - self.order(b[0])) || a[1] - b[1];
    }).map(function (x) { return x[0]; });
  };
  ShengJi.prototype.isTrump = function (c) {
    return c.r >= SJ || c.r === this.level || (!!this.trumpSuit && c.s === this.trumpSuit);
  };
  /** 牌的“门”：主牌 'T'，其余按花色。 */
  ShengJi.prototype.suitClass = function (c) { return this.isTrump(c) ? 'T' : c.s; };
  ShengJi.prototype.order = function (c) {
    if (c.r === BJ) return 200;
    if (c.r === SJ) return 199;
    if (c.r === this.level) return (this.trumpSuit && c.s === this.trumpSuit) ? 198 : 197;
    return this.isTrump(c) ? 100 + c.r : c.r;
  };
  ShengJi.prototype.reset = function () {
    this.deal();
    this.turn = this.banker;
    this.trick = [];
    this.lastAction = [CG.Move('pass'), CG.Move('pass'), CG.Move('pass'), CG.Move('pass')];
    this.played = [[], [], [], []];
    this.tricksWon = [[], [], [], []];
    this.defenderPoints = 0;
    this.history = [];
    this.done = false;
    this.returns_ = [0, 0, 0, 0];
    this.lastTrickWinner = null;
    this.lastTrick = null;
    this.toBeat = null;
    return this;
  };
  ShengJi.prototype.bankerSide = function (seat) { return seat % 2 === this.banker % 2; };
  ShengJi.prototype.position = function (seat) { return this.bankerSide(seat) ? 'banker_side' : 'defender'; };
  ShengJi.prototype.positionsList = function () { return ['banker_side', 'defender']; };
  ShengJi.prototype.teams = function () { var self = this; return [0, 1, 2, 3].map(function (s) { return self.bankerSide(s) ? 0 : 1; }); };
  ShengJi.prototype.legalMoves = function () {
    var self = this, hand = this.hands[this.turn], pool = hand;
    if (this.trick.length) {
      var led = this.suitClass(this.trick[0][1]), same = hand.filter(function (c) { return self.suitClass(c) === led; });
      pool = same.length ? same : hand;
    }
    return pool.map(function (c) { return Move('card', self.order(c), 1, [c.r], [c]); });
  };
  ShengJi.prototype._bestOf = function (trick) {
    var bs = trick[0][0], bc = trick[0][1];
    for (var i = 1; i < trick.length; i++) {
      var s2 = trick[i][0], c2 = trick[i][1];
      if (this.suitClass(c2) === this.suitClass(bc)) { if (this.order(c2) > this.order(bc)) { bs = s2; bc = c2; } }
      else if (this.suitClass(c2) === 'T') { bs = s2; bc = c2; }
    }
    return [bs, bc];
  };
  ShengJi.prototype.step = function (move) {
    if (this.done) throw new Error('对局已结束');
    var seat = this.turn, c = move.cards[0];
    CG.removeCard(this.hands[seat], c);
    this.played[seat].push(c);
    this.trick.push([seat, c]);
    this.lastAction[seat] = move;
    this.history.push([seat, move]);
    if (this.trick.length < 4) { this.turn = (seat + 1) % 4; return this; }
    var best = this._bestOf(this.trick), bestSeat = best[0];
    var p = 0;
    this.trick.forEach(function (x) { p += pts(x[1]); });
    this.tricksWon[bestSeat].push(this.trick.map(function (x) { return x[1]; }));
    if (!this.bankerSide(bestSeat)) this.defenderPoints += p;
    this.lastTrickWinner = bestSeat;
    this.lastTrick = this.trick;
    this.lastTrickPoints = p;
    this.trick = [];
    this.turn = bestSeat;
    if (!this.hands[seat].length) {
      if (!this.bankerSide(bestSeat)) {
        var b = 0;
        this.bottomBuried.forEach(function (x) { b += pts(x); });
        this.defenderPoints += 2 * b;
        this.bottomBonus = 2 * b;
      }
      this._settle();
    }
    return this;
  };
  ShengJi.prototype._settle = function () {
    this.done = true;
    var P = this.defenderPoints;
    if (P >= 80) { this.levelChange = Math.floor((P - 80) / 40); this.bankerWin = false; this.nextBanker = (this.banker + 1) % 4; }
    else { this.levelChange = P === 0 ? 3 : P < 40 ? 2 : 1; this.bankerWin = true; this.nextBanker = (this.banker + 2) % 4; }
    for (var s = 0; s < 4; s++) this.returns_[s] = this.bankerSide(s) === this.bankerWin ? 1 : -1;
  };
  ShengJi.prototype.returns = function () { return this.returns_; };
  ShengJi.prototype.counts = function () { return this.hands.map(function (h) { return h.length; }); };

  /** 贪心（greedy_move），并说明命中了哪条规则。 */
  ShengJi.prototype.greedyExplain = function (seat) {
    var self = this, legal = this.legalMoves(), oc = function (m) { return [self.order(m.cards[0])]; };
    if (!this.trick.length) {
      var nonTrump = legal.filter(function (m) { return !self.isTrump(m.cards[0]); });
      var pool = nonTrump.length ? nonTrump : legal;
      return {move: CG.minBy(pool, oc), rule: 'lead', pool: pool, legal: legal, keyOf: oc, keyName: '比牌的大小（小的优先）',
        keyText: function (m) { return '牌序 ' + self.order(m.cards[0]) + (self.isTrump(m.cards[0]) ? '（主）' : '（副）'); },
        text: '领出：' + (nonTrump.length ? '先出副牌（非主牌）里最小的一张，留着主牌控场。' : '手里只剩主牌：出最小的一张主牌。')};
    }
    var led = this.suitClass(this.trick[0][1]);
    var best = CG.maxBy(this.trick.map(function (x) { return x[1]; }), function (c) {
      var cls = self.suitClass(c);
      return [cls === 'T', (cls === 'T' || cls === led) ? self.order(c) : -1];
    });
    var winners = legal.filter(function (m) {
      var c = m.cards[0], cls = self.suitClass(c), bcls = self.suitClass(best);
      return (cls === bcls && self.order(c) > self.order(best)) || (cls === 'T' && bcls !== 'T');
    });
    var trickPts = 0;
    this.trick.forEach(function (x) { trickPts += pts(x[1]); });
    var mateWinning = this._bestOf(this.trick)[0] % 2 === seat % 2;
    if (winners.length && (trickPts > 0 || this.trick.length === 3) && !mateWinning)
      return {move: CG.minBy(winners, oc), rule: 'win', pool: winners, legal: legal, keyOf: oc, keyName: '能赢的牌里比大小（小的优先）',
        keyText: function (m) { return '牌序 ' + self.order(m.cards[0]) + (self.isTrump(m.cards[0]) ? '（主）' : '（副）'); },
        text: '这一墩' + (trickPts > 0 ? '有 ' + trickPts + ' 分' : '自己是最后一家') + '，对方正领先：用能赢的牌里最小的一张拿下。'};
    var nonPoint = legal.filter(function (m) { return POINTS[m.cards[0].r] === undefined; });
    var pool2 = nonPoint.length ? nonPoint : legal;
    return {move: CG.minBy(pool2, oc), rule: 'dump', pool: pool2, legal: legal, keyOf: oc, keyName: '比牌的大小（小的优先）',
      keyText: function (m) { return '牌序 ' + self.order(m.cards[0]) + (self.isTrump(m.cards[0]) ? '（主）' : '（副）') + (POINTS[m.cards[0].r] !== undefined ? ' · 带 ' + POINTS[m.cards[0].r] + ' 分' : ''); },
      text: mateWinning ? '队友正领先这一墩：垫一张最小的' + (nonPoint.length ? '不带分的牌' : '牌') + '。' :
        (winners.length ? '这一墩没分、也不是最后一家：不值得用大牌，垫最小的牌。' : '压不过：垫一张最小的' + (nonPoint.length ? '不带分的牌（别把分送给对方）' : '牌') + '。')};
  };
  ShengJi.prototype.greedyMove = function (seat) { return this.greedyExplain(seat).move; };

  // ------------------------------------------------ 整场
  function ShengJiMatch(rng) {
    this.rng = rng || new root.PyRandom();
    this.levels = [2, 2];
    this.banker = 0;
    this.over = false;
    this.champion = null;
  }
  ShengJiMatch.prototype.newDeal = function () { return new ShengJi(this.rng, this.levels[this.banker % 2], this.banker); };
  ShengJiMatch.prototype.applyResult = function (game) {
    var team = game.bankerWin ? this.banker % 2 : 1 - this.banker % 2;
    if (game.bankerWin && this.levels[team] === 14 && game.levelChange >= 1) { this.over = true; this.champion = team; return; }
    this.levels[team] = Math.min(14, this.levels[team] + game.levelChange);
    this.banker = game.nextBanker;
  };
  var LV = {11: 'J', 12: 'Q', 13: 'K', 14: 'A'};
  function lvName(v) { return LV[v] || String(v); }
  ShengJiMatch.prototype.status = function () {
    return '蓝队（0、2 号位）打 ' + lvName(this.levels[0]) + ' / 红队（1、3 号位）打 ' + lvName(this.levels[1]) + '，庄家 ' + this.banker + ' 号位';
  };

  ShengJi.Match = ShengJiMatch;
  ShengJi.POINTS = POINTS;
  ShengJi.cardIndex = cardIndex;
  ShengJi.lvName = lvName;
  CG.GAMES.shengji = ShengJi;
  root.ShengJi = ShengJi;
})(typeof window !== 'undefined' ? window : globalThis);

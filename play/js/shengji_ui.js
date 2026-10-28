/* 升级（打百分）的界面配置（GAME_UI）。依赖：CG、ShengJi、UIC。 */
(function (root) {
  'use strict';
  var CG = root.CG, G = root.ShengJi, U = root.UIC;
  var KIND_ZH = {card: '出牌', pass: '过'};
  var TEAM = [{text: '蓝队', color: '#4aa3ff'}, {text: '红队', color: '#ff6b6b'}];
  var seatPos = U.seatPos(4), lv = G.lvName, POINTS = G.POINTS;
  var CLASS_ORDER = {T: 0, '♠': 1, '♥': 2, '♣': 3, '♦': 4};
  function curGame() { return root.CGApp && root.CGApp.A.game; }
  function sorter(g) {
    return function (cs) {
      if (!g) return cs.slice();
      return cs.slice().sort(function (a, b) {
        return (CLASS_ORDER[g.suitClass(a)] - CLASS_ORDER[g.suitClass(b)]) || (g.order(b) - g.order(a)) || (CG.SUITS.indexOf(a.s) - CG.SUITS.indexOf(b.s));
      });
    };
  }
  function cardTxt(c) { return CG.cardStr(c); }
  function moveText(m) { return m.isPass ? '过' : cardTxt(m.cards[0]) + (POINTS[m.cards[0].r] ? '（' + POINTS[m.cards[0].r] + ' 分）' : ''); }
  function mini(c) {
    if (c.r >= 16) return '<span class="card sm joker' + (c.r === 17 ? ' big' : '') + '">' + CG.RANK_NAMES[c.r] + '</span>';
    var red = (c.s === '♥' || c.s === '♦') ? ' red' : '';
    return '<span class="card sm' + red + '"><span class="rk">' + CG.RANK_NAMES[c.r] + '</span><span class="st">' + c.s + '</span></span>';
  }
  function trumpName(g) { return g.trumpSuit ? g.trumpSuit + '（' + {'♠': '黑桃', '♥': '红桃', '♣': '梅花', '♦': '方块'}[g.trumpSuit] + '）' : '无主'; }

  root.GAME_UI = {
    key: 'shengji', title: '升级（打百分）', sub: '一副牌 · 对家一伙 · 主牌、跟门、抓分升级',
    repo: 'shengji-card-engine', demoSeed: 20261013, hasBrain: false,
    touchHelp: '顶部切换「观战 / 我来玩 / 规则练习」。我来玩时上方是牌桌，下方是你的手牌：轮到你时只有<b>亮着的牌</b>能出（必须跟门），<b>点一张就直接出</b>；拿不准就先点 <b>提示</b>。',
    kindZh: KIND_ZH, moveText: moveText, seatPos: seatPos, seatXY: U.seatXY,
    finishName: function () { return ''; },
    sortForDisplay: function (cs) { return sorter(curGame())(cs); },
    alarmAt: 0, fullDeck: function () { return CG.deck(1, 2); }, counterRanks: [17, 16, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2],
    counterExtra: function (g, human, all) { if (human === g.banker) all.subtract(CG.rankCounter(g.bottomBuried)); },
    kindNames: {random: '随机', greedy: '贪心'},
    presets: {
      novice: {name: '新手', desc: '随机：在能出的牌（必须跟门）里随便挑一张。', kinds: function (n) { return new Array(n).fill('random'); }},
      normal: {name: '普通', desc: '贪心规则：领出最小的副牌；这一墩有分（或自己最后出）且对方领先时，用最小的能赢的牌拿下；否则垫最小的不带分的牌。', kinds: function (n) { return new Array(n).fill('greedy'); }},
      uneven: {name: '不对称', desc: '蓝队（0、2 号位）随机 vs 红队（1、3 号位）贪心——看规则比乱出强多少。我来玩时你的队友是随机、对手是贪心。', kinds: function () { return ['random', 'greedy', 'random', 'greedy']; }}
    },
    defaultPreset: {watch: 'normal', play: 'normal'},
    roleOf: function (g, s) {
      var t = TEAM[s % 2];
      return {text: t.text + (s === g.banker ? ' · 庄家' : g.bankerSide(s) ? ' · 庄家方' : ' · 闲家'), color: t.color};
    },
    roleShort: function (g, s) { return s === g.banker ? '庄家' : g.bankerSide(s) ? '庄家方' : '闲家'; },
    lastShown: function (g, seat) {
      var inTrick = g.trick.filter(function (x) { return x[0] === seat; })[0];
      if (inTrick) return mini(inTrick[1]);
      if (!g.trick.length && g.lastTrick) {
        var lt = g.lastTrick.filter(function (x) { return x[0] === seat; })[0];
        if (lt) return '<span class="muted small" style="margin-right:6px;white-space:nowrap">上一墩</span>' + mini(lt[1]) + (g.lastTrickWinner === seat ? '<span class="typetag">赢</span>' : '');
      }
      return '';
    },
    startLog: function (g, M) {
      return ['庄家 ' + seatPos(g.banker) + '，主牌 ' + trumpName(g) + '，打 ' + lv(g.level) + (g.declarer !== null ? '（' + seatPos(g.declarer) + ' 亮主）' : '（无人亮主，翻底定主）'), M.status()];
    },
    startExplain: function (g, M) {
      return '一副牌，每人 12 张；<b>' + seatPos(g.banker) + '</b> 坐庄，底牌 6 张已扣下。主牌：<b>' + trumpName(g) + '</b>，级牌 <b>' + lv(g.level) +
        '</b>。主牌顺序：大王 > 小王 > 正级牌 > 副级牌 > 主花色 A→2。闲家要抓够 80 分才能上台。';
    },
    centerInfo: function (g, M) {
      var t = '主牌 <b>' + trumpName(g) + '</b> · 打 <b>' + lv(g.level) + '</b> · 庄家 ' + g.banker + ' 号<br>闲家已得 <b>' + g.defenderPoints + '</b> 分（80 分上台）<br>';
      if (g.done) return t + '本局结束：' + (g.bankerWin ? '庄家方守住' : '闲家上台');
      if (g.trick.length) t += '这一墩：<div class="trick">' + g.trick.map(function (x) { return '<span class="tc">' + x[0] + '号</span>' + mini(x[1]); }).join('') + '</div>';
      else if (g.lastTrick) t += '上一墩 ' + g.lastTrickWinner + ' 号赢（' + g.lastTrickPoints + ' 分）';
      else t += '庄家先领出';
      return t;
    },
    afterStep: function (g, seat, m, log, ctx) {
      if (!g.trick.length && g.lastTrick && g.lastTrick[g.lastTrick.length - 1][0] === seat) {
        log.push({t: '   ► ' + seatPos(g.lastTrickWinner) + ' 赢得这一墩（' + g.lastTrickPoints + ' 分），闲家累计 ' + g.defenderPoints + ' 分', sys: true});
        if (ctx.human !== null && g.lastTrickWinner % 2 === ctx.human % 2 && g.lastTrickPoints > 0) ctx.task('points');
      }
    },
    humanHint: function (g, legal) {
      if (!g.trick.length) return '你领出：点一张牌直接出。T 提示。';
      var led = g.suitClass(g.trick[0][1]);
      return '要跟 <b>' + (led === 'T' ? '主牌' : led) + '</b>：' + (legal.length < g.hands[g.turn].length ? '只有亮着的 ' + legal.length + ' 张能出。' : '你没有这一门，任意出（可以用主牌毙牌，或垫一张小牌）。');
    },
    whyIllegal: function () { return '必须跟门：有这一门就得出这一门'; },
    onHumanMove: function (g, m, task) {
      var c = m.cards[0];
      if (g.isTrump(c)) task('trump');
      if (g.trick.length && g.suitClass(g.trick[0][1]) !== 'T' && g.isTrump(c)) task('ruff');
    },
    galleryCheck: function (cards) { return cards.length === 1; },
    resultText: function (g) {
      return '闲家得 ' + g.defenderPoints + ' 分' + (g.bottomBonus ? '（含扣底 ' + g.bottomBonus + ' 分）' : '') + '：' +
        (g.bankerWin ? '庄家方守住，升 ' + g.levelChange + ' 级' : '闲家上台' + (g.levelChange ? '，升 ' + g.levelChange + ' 级' : '')) + '；下一局 ' + g.nextBanker + ' 号坐庄';
    },
    rulesHTML: '一副牌 54 张，每人 12 张，底牌 6 张归庄家扣回；0&2 对 1&3，从 2 打到 A。亮主自动：发牌时第一张级牌定主花色。<br>' +
      '主牌 = 大王 > 小王 > <b>正级牌</b> > 副级牌 > 主花色 A→2；其余花色 A→2。<b>跟牌必须跟门</b>（主牌算一门），没有才能垫或毙。<br>' +
      '抓分：5 = 5 分，10、K = 10 分，共 100 分；闲家赢最后一墩，<b>底牌分 ×2</b>。闲家 0 分庄家升 3 级、<40 升 2、<80 升 1；≥80 闲家上台。<br>' +
      '单副牌没有对子 / 拖拉机，领出只出单张。',
    greedySteps: [
      {id: 'lead', text: '① 自己领出这一墩 → 出最小的副牌（没有副牌才出最小的主牌），把主牌留着控场'},
      {id: 'win', text: '② 跟牌，这一墩有分或自己是最后一家，而且对方正领先 → 在能赢的牌里出最小的一张拿下'},
      {id: 'dump', text: '③ 其余情况（队友领先 / 没分又不是最后一家 / 压不过）→ 垫最小的、不带分的牌'}
    ],
    rulesNote: '升级的贪心规则（ShengJi.greedy_move）：领出时出最小的副牌（没有副牌才出最小的主牌）；跟牌时，若这一墩有分或自己是最后一家、且对方正领先，就用能赢的牌里最小的一张拿下；否则垫最小的不带分的牌。',
    tasks: [
      {id: 'types', text: '在「牌型图鉴」（主牌顺序）里点开 3 个例子'},
      {id: 'trump', text: '出一张主牌'},
      {id: 'ruff', text: '没有对方领出的那一门时，用主牌毙牌'},
      {id: 'points', text: '你这一方赢下一墩带分的牌'},
      {id: 'hint', text: '用一次 💡 提示，看贪心规则会怎么出'},
      {id: 'win_practice', text: '赢一局（对手：新手）'}
    ],
    gallery: [
      ['大王', [[17, '']], '最大的主牌。'],
      ['小王', [[16, '']], '第二大的主牌。'],
      ['正级牌', [[2, '♥']], '主花色的级牌（例：打 2、红桃是主时的红桃 2），比副级牌大。'],
      ['副级牌', [[2, '♠']], '其余花色的级牌，同样是主牌；几张副级牌一样大，先出的大。'],
      ['主花色 A', [[14, '♥']], '主花色的普通牌（A 最大）也是主牌，排在级牌下面。'],
      ['分牌 K', [[13, '♣']], '5 = 5 分，10、K = 10 分，全场共 100 分。']
    ],
    helpCards: [
      ['① 这是什么', '<p>一副牌的<b>升级（打百分）</b>：四个人，对家一伙。亮主、主牌顺序、跟门、抓分、扣底翻倍、升级和轮庄都在浏览器里运行，与 Python 版引擎逐步一致。</p><p>AI 是规则（贪心 / 随机），没有训练过的神经网络。</p>'],
      ['② 怎么看右边', '<p><b>规则依据</b>：这一步贪心规则命中了哪一条（领出 / 拿分 / 垫牌）、能出的牌有哪些、挑了哪一张。</p><p>下面是<b>记牌器</b>（每个点数还剩几张没出）。牌桌中间显示这一墩每家出的牌和闲家累计分数。</p>'],
      ['③ 怎么玩', '<p>顶部切换「观战 / 我来玩 / 规则练习」。我来玩：你坐 0 号位（蓝队）。轮到你时，<b>亮着的牌</b>才能出（必须跟门），点一张就直接出；<kbd>T</kbd> 提示。</p><p><kbd>P</kbd> 暂停 / 继续，<kbd>N</kbd> 单步，<kbd>H</kbd> 打开本说明。</p>']
    ]
  };
})(typeof window !== 'undefined' ? window : globalThis);

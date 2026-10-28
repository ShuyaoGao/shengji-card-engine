# -*- coding: utf-8 -*-
"""升级（4 人 1 副牌"打百分"，从 2 打到 A）—— 吃墩抓分类。

实现的标准核心规则：
  - 54 张，每人 12 张，底牌 6 张归庄家（扣回 6 张）；0&2 vs 1&3
  - 亮主（自动模拟）：按发牌顺序第一张"级牌"定主花色，亮主者首局坐庄；
    无人亮主则翻底牌第一张定主（王 → 无主）
  - 主牌 = 大王 > 小王 > 正级牌(主花色级牌) > 副级牌(其余花色级牌，同大，先出为大)
    > 主花色 A→2；副牌各花色 A→2（级牌不在自然序列中）
  - 跟牌必须跟"门"（主牌算一门）；无该门可任意出（垫牌或毙牌）
  - 一墩四张：有主牌则最大主牌赢，否则首攻花色最大者赢；赢家继续领出
  - 抓分：5=5 分、10=10 分、K=10 分，全场 100 分；闲家赢最后一墩，底牌分 ×2 归闲家
  - 升级：闲家得分 P：P=0 庄家方升 3；P<40 升 2；P<80 升 1（庄家方连庄轮转）；
    P≥80 闲家上台，升 (P-80)//40 级
  - 单副牌无对子/拖拉机，领出仅单张（甩牌从略，见 README）

接口与甩牌类对齐：reset/turn/legal_moves/step/done/returns/counts/last_action。
"""

import random

from core.cards import deck, onehot, SUITS, SMALL_JOKER, BIG_JOKER
from core.shed import Move

POINTS = {5: 5, 10: 10, 13: 10}


def card_index(c):
    r, s = c
    if r == SMALL_JOKER:
        return 52
    if r == BIG_JOKER:
        return 53
    return SUITS.index(s) * 13 + (r - 2)


class ShengJi:
    N = 4
    NAME = "shengji"
    TITLE = "升级(打百分)"
    TEAM_DESC = "0&2(庄家方) vs 1&3"
    HAS_PASS = False

    def __init__(self, rng=None, level=2, banker=0):
        self.rng = rng or random.Random()
        self.level = level
        self.banker = banker

    # ------------------------------------------------ 发牌/定主/扣底
    def deal(self):
        cards = deck(1, two_as=2)
        self.rng.shuffle(cards)
        order = []                                   # 模拟逐张发牌定主
        for i in range(48):
            order.append(((self.banker + i) % 4, cards[i]))
        self.trump_suit = None
        declarer = None
        for seat, (r, s) in order:
            if r == self.level and s:
                self.trump_suit = s
                declarer = seat
                break
        bottom = cards[48:]
        if self.trump_suit is None:
            r0, s0 = bottom[0]
            self.trump_suit = s0 if s0 else None     # 王 → 无主
        self.hands = [[] for _ in range(4)]
        for seat, c in order:
            self.hands[seat].append(c)
        # 庄家拿底扣底（启发式：优先扣非主非分的小牌）
        h = self.hands[self.banker] + bottom
        h.sort(key=lambda c: (self.is_trump(c), c[0] in POINTS, self.order(c)))
        self.bottom_buried = h[:6]
        self.hands[self.banker] = h[6:]
        for s in range(4):
            self.hands[s].sort(key=lambda c: (self.suit_class(c), self.order(c)))

    def is_trump(self, c):
        r, s = c
        return r >= SMALL_JOKER or r == self.level or (self.trump_suit and s == self.trump_suit)

    def suit_class(self, c):
        """牌的"门"：主牌门 'T'，其余按自然花色。"""
        return "T" if self.is_trump(c) else c[1]

    def order(self, c):
        """同门内比较值（越大越强）。"""
        r, s = c
        if r == BIG_JOKER:
            return 200
        if r == SMALL_JOKER:
            return 199
        if r == self.level:
            return 198 if (self.trump_suit and s == self.trump_suit) else 197
        v = 14 if r == 14 else r          # A 最大
        return 100 + v if self.is_trump(c) else v

    # ------------------------------------------------ 流程
    def reset(self):
        self.deal()
        self.turn = self.banker
        self.trick = []                   # [(seat, card)]
        self.last_action = [Move("pass")] * 4
        self.played = [[] for _ in range(4)]
        self.tricks_won = [[] for _ in range(4)]
        self.defender_points = 0
        self.history = []
        self.done = False
        self.returns_ = [0.0] * 4
        self.last_trick_winner = None
        return self

    def banker_side(self, seat):
        return seat % 2 == self.banker % 2

    def position(self, seat):
        return "banker_side" if self.banker_side(seat) else "defender"

    def teams(self):
        return [0 if self.banker_side(s) else 1 for s in range(4)]

    def positions_list(self):
        return ["banker_side", "defender"]

    @property
    def to_beat(self):
        return None                       # 兼容统一界面：吃墩类没有"压牌"概念

    def legal_moves(self):
        seat = self.turn
        hand = self.hands[seat]
        if not self.trick:
            pool = hand
        else:
            led = self.suit_class(self.trick[0][1])
            same = [c for c in hand if self.suit_class(c) == led]
            pool = same if same else hand
        return [Move("card", self.order(c), 1, (c[0],), (c,)) for c in pool]

    def step(self, move):
        assert not self.done
        seat = self.turn
        card = move.cards[0]
        self.hands[seat].remove(card)
        self.played[seat].append(card)
        self.trick.append((seat, card))
        self.last_action[seat] = move
        self.history.append((seat, move))

        if len(self.trick) < 4:
            self.turn = (seat + 1) % 4
            return self
        # 评墩
        led = self.suit_class(self.trick[0][1])
        best_seat, best_card = self.trick[0]
        for s2, c2 in self.trick[1:]:
            cls2 = self.suit_class(c2)
            bcls = self.suit_class(best_card)
            if cls2 == bcls:
                if self.order(c2) > self.order(best_card):
                    best_seat, best_card = s2, c2
            elif cls2 == "T":
                best_seat, best_card = s2, c2
        pts = sum(POINTS.get(c[0], 0) for _, c in self.trick)
        self.tricks_won[best_seat].append([c for _, c in self.trick])
        if not self.banker_side(best_seat):
            self.defender_points += pts
        self.last_trick_winner = best_seat
        self.trick = []
        self.turn = best_seat
        if not self.hands[seat]:          # 牌出尽 → 终局
            if not self.banker_side(best_seat):
                self.defender_points += 2 * sum(POINTS.get(c[0], 0)
                                                for c in self.bottom_buried)
            self._settle()
        return self

    def _settle(self):
        self.done = True
        P = self.defender_points
        if P >= 80:
            self.level_change = (P - 80) // 40
            self.banker_win = False
            self.next_banker = (self.banker + 1) % 4
        else:
            self.level_change = 3 if P == 0 else 2 if P < 40 else 1
            self.banker_win = True
            self.next_banker = (self.banker + 2) % 4
        for s in range(4):
            self.returns_[s] = 1.0 if self.banker_side(s) == self.banker_win else -1.0

    def returns(self):
        return self.returns_

    def counts(self):
        return [len(h) for h in self.hands]

    # ------------------------------------------------ 启发式与编码
    def greedy_move(self, seat):
        legal = self.legal_moves()
        if not self.trick:
            non_trump = [m for m in legal if not self.is_trump(m.cards[0])]
            pool = non_trump or legal
            return min(pool, key=lambda m: self.order(m.cards[0]))
        led = self.suit_class(self.trick[0][1])
        best = max((c for _, c in self.trick),
                   key=lambda c: (self.suit_class(c) == "T", self.order(c) if
                                  self.suit_class(c) in ("T", led) else -1))
        winners = []
        for m in legal:
            c = m.cards[0]
            cls, bcls = self.suit_class(c), self.suit_class(best)
            win = (cls == bcls and self.order(c) > self.order(best)) or \
                  (cls == "T" and bcls != "T")
            if win:
                winners.append(m)
        trick_pts = sum(POINTS.get(c[0], 0) for _, c in self.trick)
        mate_winning = self._best_seat() % 2 == seat % 2
        if winners and (trick_pts > 0 or len(self.trick) == 3) and not mate_winning:
            return min(winners, key=lambda m: self.order(m.cards[0]))
        non_point = [m for m in legal if m.cards[0][0] not in POINTS]
        pool = non_point or legal
        return min(pool, key=lambda m: self.order(m.cards[0]))

    def _best_seat(self):
        bs, bc = self.trick[0]
        for s2, c2 in self.trick[1:]:
            if self.suit_class(c2) == self.suit_class(bc):
                if self.order(c2) > self.order(bc):
                    bs, bc = s2, c2
            elif self.suit_class(c2) == "T":
                bs, bc = s2, c2
        return bs

    def encode_state(self, seat):
        feats = [0.0] * 54
        for c in self.hands[seat]:
            feats[card_index(c)] = 1.0
        for d in range(1, 4):
            block = [0.0] * 54
            for i, (s2, c2) in enumerate(self.trick):
                if s2 == (seat + d) % 4:
                    block[card_index(c2)] = 1.0
            feats += block
        suit_i = SUITS.index(self.trump_suit) if self.trump_suit else 4
        feats += onehot(suit_i, 5)
        feats += onehot(self.level - 2, 13)
        feats += onehot(min(self.defender_points // 5, 40), 41)
        feats += onehot(len(self.played[seat]), 13)
        feats += [1.0 if self.banker_side(seat) else 0.0,
                  1.0 if seat == self.banker else 0.0]
        return feats

    @staticmethod
    def encode_action(move):
        v = [0.0] * 54
        if move.cards:
            v[card_index(move.cards[0])] = 1.0
        return v


class ShengJiMatch:
    """整场升级：双方级别、坐庄轮转、打过 A 获胜。"""

    def __init__(self, rng=None):
        self.rng = rng or random.Random()
        self.levels = [2, 2]              # 队 0(偶) / 队 1(奇)
        self.banker = 0
        self.over = False
        self.champion = None

    def new_deal(self):
        lvl = self.levels[self.banker % 2]
        return ShengJi(self.rng, level=lvl, banker=self.banker)

    def apply_result(self, game):
        team = self.banker % 2 if game.banker_win else 1 - self.banker % 2
        if game.banker_win and self.levels[team] == 14 and game.level_change >= 1:
            self.over = True
            self.champion = team
            return
        self.levels[team] = min(14, self.levels[team] + game.level_change)
        self.banker = game.next_banker

    def status(self):
        n = {2: "2", 11: "J", 12: "Q", 13: "K", 14: "A"}
        f = lambda v: n.get(v, str(v))
        return (f"偶数队打 {f(self.levels[0])} / 奇数队打 {f(self.levels[1])}，"
                f"庄家 {self.banker} 号位")

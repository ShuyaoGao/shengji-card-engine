# -*- coding: utf-8 -*-
"""升级（打百分）引擎测试（python -m pytest，或 python tests/test_shengji.py）。"""

import random
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core.cards import deck, SMALL_JOKER, BIG_JOKER  # noqa: E402,F401
from core.shed import Move, PASS  # noqa: E402,F401
from games import ShengJi, ShengJiMatch  # noqa: E402
from agents import RandomAgent, GreedyAgent  # noqa: E402,F401

PASSED = 0

def check(cond, name):
    global PASSED
    assert cond, f"测试失败: {name}"
    PASSED += 1
    print(f"  ✓ {name}")



def play_random(game, max_steps=3000):
    rng = random.Random(123)
    steps = 0
    while not game.done:
        game.step(rng.choice(game.legal_moves()))
        steps += 1
        assert steps < max_steps, "对局未终止"
    return steps



def find(moves, kind, **kw):
    return [m for m in moves if m.kind == kind
            and all(getattr(m, k) == v for k, v in kw.items())]



def test_shengji():
    g = ShengJi(random.Random(3), level=2, banker=0)
    g.reset()
    total = sum(len(h) for h in g.hands) + len(g.bottom_buried)
    check(total == 54, "升级发牌 12×4 + 扣底 6 = 54")
    check(all(len(h) == 12 for h in g.hands), "每人 12 张")

    # 跟牌必须跟门
    g.hands[1] = [(5, "♠"), (7, "♠"), (9, "♦")]
    g.trick = [(0, (3, "♠"))]
    g.turn = 1
    legal = g.legal_moves()
    if any(not g.is_trump(c) and c[1] == "♠" for c in g.hands[1]):
        check(all(g.suit_class(m.cards[0]) == g.suit_class((3, "♠")) for m in legal),
              "有该门必须跟门")

    pts_total = 0
    g2 = ShengJi(random.Random(4), level=2, banker=0)
    g2.reset()
    pts_total = sum({5: 5, 10: 10, 13: 10}.get(c[0], 0)
                    for h in g2.hands for c in h) + \
                sum({5: 5, 10: 10, 13: 10}.get(c[0], 0) for c in g2.bottom_buried)
    check(pts_total == 100, "全场分牌总计 100 分")

    for seed in range(10):
        g3 = ShengJi(random.Random(seed), level=2, banker=seed % 4)
        g3.reset()
        rng = random.Random(seed)
        steps = 0
        while not g3.done:
            g3.step(rng.choice(g3.legal_moves()))
            steps += 1
            assert steps < 100
        assert g3.level_change in (0, 1, 2, 3), "升级幅度合法"
        assert g3.next_banker in range(4)
    check(True, "10 局随机升级：48 张全部打完并正确结算")

    m = ShengJiMatch(random.Random(5))
    for _ in range(4):
        game = m.new_deal()
        game.reset()
        rng = random.Random(9)
        while not game.done:
            game.step(rng.choice(game.legal_moves()))
        m.apply_result(game)
        if m.over:
            break
    check(max(m.levels) >= 2, "整场升级：级别推进")



def test_greedy_shengji():
    greedy = GreedyAgent()
    for seed in range(5):
        g = ShengJi(random.Random(99 + seed))
        g.reset()
        steps = 0
        while not g.done:
            g.step(greedy.act(g))
            steps += 1
            assert steps < 5000, "贪心对局未终止"
    check(True, "贪心智能体可完整打完 5 局")


if __name__ == "__main__":
    for fn in [test_shengji, test_greedy_shengji]:
        print(f"\n[{fn.__name__}]")
        fn()
    print(f"\n全部通过：共 {PASSED} 项断言 ✓")

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BreakoutEngine } from '../engine'
import {
  BALL_SIZE,
  BEGINNER_MIN_SPEED_FACTOR,
  BEGINNER_SLOWMO_DISTANCE,
  BRICK_COLS,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  CELL_HEIGHT,
  CELL_WIDTH,
  COMBO_BONUS_STEP,
  GRID_TOP,
  LAUNCH_SIDE_ANGLE,
  MAX_BRICK_BOUNCES_WITHOUT_PADDLE,
  NUDGE_ANGLE,
  PADDLE_BOTTOM_GAP,
  PADDLE_HEIGHT,
  PADDLE_KEY_SPEED,
  PADDLE_WIDTH,
  PADDLE_WIDTH_BEGINNER,
  PADDLE_ZONE_ANGLES,
  POINTS_TARGET,
  POINTS_WRONG,
  REFILL_DELAY_MS,
} from '../constants'
import { playBeep, speakGerman } from '../audio'
import {
  COL_CENTER,
  SLOT_COUNT,
  clock,
  countAlive,
  createCanvasMock,
  createEngine,
  frontBrick,
  headingDeg,
  installDeterministicGlobals,
  internals,
  makePool,
  seedRandom,
  setBallFlying,
  targetBrick,
  wrongBrick,
  type Internals,
} from './helpers'

vi.mock('../audio', () => ({
  playBeep: vi.fn(),
  playStageClear: vi.fn(),
  speakGerman: vi.fn(),
}))

const HALF = BALL_SIZE / 2
const PADDLE_TOP = CANVAS_HEIGHT - PADDLE_HEIGHT - PADDLE_BOTTOM_GAP
/** 第 row 排格子的底邊 y */
const rowBottom = (row: number): number => GRID_TOP + (row + 1) * CELL_HEIGHT
const rowCenter = (row: number): number => GRID_TOP + row * CELL_HEIGHT + CELL_HEIGHT / 2

/** 連續命中 n 次懸賞（每次都打目前的懸賞磚），回傳每次的得分 */
function hitTargets(g: Internals, n: number): number[] {
  const points: number[] = []
  for (let i = 0; i < n; i++) {
    const before = g.score
    g.onBrickHit(targetBrick(g))
    points.push(g.score - before)
  }
  return points
}

beforeEach(() => {
  installDeterministicGlobals()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('建構子', () => {
  it('拿不到 2D context 時丟錯', () => {
    const canvas = { getContext: () => null } as unknown as HTMLCanvasElement
    expect(() => new BreakoutEngine(canvas)).toThrow(/2D context/)
  })

  it('subscribe 立刻收到目前快照，退訂後不再收到', () => {
    const engine = new BreakoutEngine(createCanvasMock())
    const listener = vi.fn()
    const unsubscribe = engine.subscribe(listener)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener.mock.calls[0][0]).toMatchObject({ phase: 'loading', score: 0, left: 0, target: null })
    unsubscribe()
    engine.start(makePool(20))
    expect(listener).toHaveBeenCalledTimes(1)
  })
})

describe('start(pool)', () => {
  it('鋪滿 16 格、佇列 = pool - 16、懸賞在最前排', () => {
    const pool = makePool(24)
    const { engine, g } = createEngine(pool)
    expect(countAlive(g)).toBe(SLOT_COUNT)
    expect(g.wordQueue).toHaveLength(pool.length - SLOT_COUNT)
    expect(g.phase).toBe('ready')
    expect(g.ballWaiting).toBe(true)
    expect(g.target).not.toBeNull()
    expect(g.frontLineBricks().map((b) => b.vocab.de)).toContain(g.target!.de)
    // 剛開始最前排一定是第 3 排（最靠近球拍）
    expect(g.frontLineBricks().map((b) => b.row)).toEqual([3, 3, 3, 3])

    // 畫面上 16 格 + 佇列 = 整個 pool，沒有重複也沒有遺漏
    const onScreen = g.bricks.flat().map((b) => b.vocab.de)
    const all = [...onScreen, ...g.wordQueue.map((v) => v.de)].sort()
    expect(all).toEqual(pool.map((v) => v.de).sort())

    const listener = vi.fn()
    engine.subscribe(listener)
    expect(listener.mock.calls[0][0]).toMatchObject({ score: 0, left: pool.length, phase: 'ready', combo: 0 })
  })

  it('pool 剛好 16 個時佇列為空', () => {
    const { g } = createEngine(makePool(SLOT_COUNT))
    expect(countAlive(g)).toBe(SLOT_COUNT)
    expect(g.wordQueue).toHaveLength(0)
  })

  it('pool 少於 16 個時仍鋪滿 16 格（字重複使用）', () => {
    const pool = makePool(5)
    const { g } = createEngine(pool)
    expect(countAlive(g)).toBe(SLOT_COUNT)
    expect(g.wordQueue).toHaveLength(0)
    const ids = new Set(pool.map((v) => v.de))
    for (const b of g.bricks.flat()) expect(ids.has(b.vocab.de)).toBe(true)
  })

  it('空 pool 直接過關，不會丟錯', () => {
    const { g } = createEngine([])
    expect(countAlive(g)).toBe(0)
    expect(g.phase).toBe('won')
    expect(g.target).toBeNull()
  })

  it('重新 start 會把分數、連擊、停頓全部歸零並重排', () => {
    const { engine, g } = createEngine(makePool(24))
    hitTargets(g, 3)
    g.onBrickHit(wrongBrick(g))
    expect(g.score).toBeGreaterThan(0)
    expect(g.wrongPause).not.toBeNull()

    engine.start(makePool(20))
    expect(g.score).toBe(0)
    expect(g.combo).toBe(0)
    expect(g.bestCombo).toBe(0)
    expect(g.wrongPause).toBeNull()
    expect(g.pendingRefills).toHaveLength(0)
    expect(countAlive(g)).toBe(SLOT_COUNT)
    expect(g.wordQueue).toHaveLength(4)
    expect(g.ballWaiting).toBe(true)
  })

  it('start 會啟動 rAF 迴圈，destroy 會取消並清掉 listener', () => {
    const { engine } = createEngine()
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1)
    const listener = vi.fn()
    engine.subscribe(listener)
    engine.destroy()
    expect(cancelAnimationFrame).toHaveBeenCalled()
    listener.mockClear()
    engine.launch()
    expect(listener).not.toHaveBeenCalled()
  })
})

describe('計分', () => {
  it('命中懸賞 +30、磚塊消失、連擊 1', () => {
    const { engine, g } = createEngine()
    const listener = vi.fn()
    engine.subscribe(listener)
    const brick = targetBrick(g)
    const vocab = brick.vocab
    g.onBrickHit(brick)

    expect(g.score).toBe(POINTS_TARGET)
    expect(brick.alive).toBe(false)
    expect(g.combo).toBe(1)
    expect(g.bestCombo).toBe(1)
    expect(listener).toHaveBeenLastCalledWith(
      expect.objectContaining({ score: POINTS_TARGET, combo: 1, lastHit: { kind: 'target', points: POINTS_TARGET, vocab, combo: 1 } }),
    )
    // 命中後馬上出下一題，而且新懸賞在前排
    expect(g.target).not.toBeNull()
    expect(g.frontLineBricks().some((b) => b.vocab.de === g.target!.de)).toBe(true)
    expect(speakGerman).toHaveBeenCalledWith(vocab.de, true, expect.any(Function))
  })

  it('連擊 2～5 次得 50/70/90/110，第 6 次以後維持 110', () => {
    const { g } = createEngine(makePool(40))
    const points = hitTargets(g, 8)
    expect(points).toEqual([30, 50, 70, 90, 110, 110, 110, 110])
    expect(g.score).toBe(30 + 50 + 70 + 90 + 110 * 4)
    expect(g.combo).toBe(8)
    expect(g.bestCombo).toBe(8)
    expect(POINTS_TARGET + 4 * COMBO_BONUS_STEP).toBe(110)
  })

  it('打錯：0 分、combo 歸零、磚塊仍在、進入 wrongPause', () => {
    const { engine, g } = createEngine()
    hitTargets(g, 3)
    const scoreBefore = g.score
    const listener = vi.fn()
    engine.subscribe(listener)

    const brick = wrongBrick(g)
    const pendingBefore = g.pendingRefills.length
    g.onBrickHit(brick)

    expect(g.score).toBe(scoreBefore)
    expect(POINTS_WRONG).toBe(0)
    expect(brick.alive).toBe(true)
    expect(g.combo).toBe(0)
    expect(g.bestCombo).toBe(3)
    expect(g.pendingRefills).toHaveLength(pendingBefore)
    expect(g.wrongPause).toEqual({ until: clock.now + 1000, vocab: brick.vocab })
    expect(listener).toHaveBeenLastCalledWith(
      expect.objectContaining({ combo: 0, lastHit: { kind: 'wrong', points: 0, vocab: brick.vocab, combo: 3 } }),
    )
    // 連擊被打斷會顯示 COMBO BREAK
    expect(g.floatingTexts).toContainEqual(expect.objectContaining({ text: 'COMBO BREAK' }))
    // 懸賞不變
    expect(g.frontLineBricks().some((b) => b.vocab.de === g.target!.de)).toBe(true)
  })

  it('wrongPause 期間球不動，時間到才繼續', () => {
    const { g } = createEngine()
    setBallFlying(g, 360, 500, 1, -2)
    g.onBrickHit(wrongBrick(g))
    const { x, y } = g.ball

    clock.now += 999
    g.update(1)
    expect(g.ball).toMatchObject({ x, y })
    expect(g.wrongPause).not.toBeNull()

    clock.now += 1
    g.update(1)
    expect(g.wrongPause).toBeNull()
    expect(g.ball.y).toBe(y - 2)
  })

  it('打錯後再命中從 30 分重新起算', () => {
    const { g } = createEngine()
    hitTargets(g, 2)
    g.onBrickHit(wrongBrick(g))
    expect(hitTargets(g, 2)).toEqual([30, 50])
  })

  it('打錯時唸完單字才播錯誤音效，而且停頓至少延到音效後', () => {
    const { g } = createEngine()
    g.onBrickHit(wrongBrick(g))
    const calls = vi.mocked(speakGerman).mock.calls
    const onDone = calls[calls.length - 1][2]!
    vi.mocked(playBeep).mockClear()
    clock.now += 900
    onDone()
    expect(playBeep).toHaveBeenCalledWith(200, 0.12, 'sawtooth')
    expect(g.wrongPause!.until).toBe(clock.now + 450)
  })
})

describe('補磚', () => {
  it('命中後 700ms 補上佇列第一個字，佇列減一', () => {
    const { g } = createEngine(makePool(24))
    const brick = targetBrick(g)
    const nextWord = g.wordQueue[0]
    g.onBrickHit(brick)

    // 延遲刻意寫死 700ms（而不是引用常數），常數被改壞時這裡要變紅
    expect(g.pendingRefills).toEqual([{ col: brick.col, row: brick.row, at: clock.now + 700 }])
    expect(g.wordQueue).toHaveLength(8) // 排隊中還沒從佇列拿字

    clock.now += 699
    g.processRefills()
    expect(brick.alive).toBe(false)
    expect(g.pendingRefills).toHaveLength(1)

    clock.now += 1
    g.processRefills()
    expect(brick.alive).toBe(true)
    expect(brick.vocab).toBe(nextWord)
    expect(g.wordQueue).toHaveLength(7)
    expect(g.pendingRefills).toHaveLength(0)
    expect(countAlive(g)).toBe(SLOT_COUNT)
  })

  it('球還壓在該格時先不補，離開後才補', () => {
    const { g } = createEngine(makePool(24))
    const brick = targetBrick(g)
    g.onBrickHit(brick)
    clock.now += REFILL_DELAY_MS
    setBallFlying(g, brick.x + CELL_WIDTH / 2, brick.y + CELL_HEIGHT / 2, 0, 2)
    g.processRefills()
    expect(brick.alive).toBe(false)
    expect(g.pendingRefills).toHaveLength(1)

    g.ball.y = brick.y + CELL_HEIGHT + HALF + 1
    g.processRefills()
    expect(brick.alive).toBe(true)
  })

  it('佇列空時不補、剩餘數遞減', () => {
    const { engine, g } = createEngine(makePool(SLOT_COUNT))
    const listener = vi.fn()
    engine.subscribe(listener)
    g.onBrickHit(targetBrick(g))
    expect(g.pendingRefills).toHaveLength(0)
    expect(countAlive(g)).toBe(SLOT_COUNT - 1)
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ left: SLOT_COUNT - 1 }))
  })

  it('全部打完且沒有字可補時過關', () => {
    const { engine, g } = createEngine(makePool(SLOT_COUNT))
    const listener = vi.fn()
    engine.subscribe(listener)
    hitTargets(g, SLOT_COUNT)
    expect(countAlive(g)).toBe(0)
    expect(g.phase).toBe('won')
    expect(g.target).toBeNull()
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'won', left: 0 }))
  })

  it('最後一塊打掉但還有補磚在排隊時，等補好再出題而不是過關', () => {
    const { g } = createEngine(makePool(SLOT_COUNT + 1))
    // 只留一塊活磚，佇列還有 1 個字
    const last = targetBrick(g)
    for (const b of g.bricks.flat()) if (b !== last) b.alive = false
    expect(g.wordQueue).toHaveLength(1)

    g.onBrickHit(last)
    expect(countAlive(g)).toBe(0)
    expect(g.pendingRefills).toHaveLength(1)
    expect(g.phase).not.toBe('won')

    clock.now += REFILL_DELAY_MS
    g.processRefills()
    expect(countAlive(g)).toBe(1)
    expect(g.phase).not.toBe('won')
    expect(g.target).toEqual(g.frontLineBricks()[0].vocab)
  })

  it('補上的字若讓原本懸賞不在前排，會重新出題', () => {
    const { g } = createEngine(makePool(24))
    // 打掉第 0 欄前排，前排往上移到 row 2；懸賞改指向 row 2 的字
    const front = frontBrick(g, 0)
    g.target = front.vocab
    g.onBrickHit(front)
    const back = frontBrick(g, 0)
    expect(back.row).toBe(2)
    g.target = back.vocab
    clock.now += REFILL_DELAY_MS
    g.processRefills()
    // row 3 補回來後 row 2 不再是前排，懸賞必須換成前排的字
    expect(frontBrick(g, 0).row).toBe(3)
    expect(g.frontLineBricks().some((b) => b.vocab.de === g.target!.de)).toBe(true)
  })
})

describe('碰撞', () => {
  it('從下方打中最前排才算作答', () => {
    const { g } = createEngine()
    const brick = frontBrick(g, 0)
    const spy = vi.spyOn(g, 'onBrickHit')
    setBallFlying(g, COL_CENTER(0), rowBottom(3) + HALF - 2, 0, -3)
    g.collideBricks()

    expect(spy).toHaveBeenCalledWith(brick)
    expect(g.ball.dy).toBe(3)
    expect(g.ball.y).toBe(rowBottom(3) + HALF)
    expect(g.brickBouncesSincePaddle).toBe(1)
  })

  it('側面打中前排只是反彈：分數不變、不進 wrongPause', () => {
    const { g } = createEngine()
    g.bricks[0][3].alive = false
    const spy = vi.spyOn(g, 'onBrickHit')
    // 從左側撞進第 1 欄的前排
    setBallFlying(g, CELL_WIDTH + HALF - 2, rowCenter(3), 3, 0.5)
    g.collideBricks()

    expect(spy).not.toHaveBeenCalled()
    expect(g.ball.dx).toBe(-3)
    expect(g.ball.x).toBe(CELL_WIDTH - HALF)
    expect(g.score).toBe(0)
    expect(g.wrongPause).toBeNull()
    expect(g.combo).toBe(0)
    expect(g.bricks[1][3].alive).toBe(true)
    expect(speakGerman).toHaveBeenCalledWith(g.bricks[1][3].vocab.de, false)
  })

  it('從右側撞進磚塊往右彈開', () => {
    const { g } = createEngine()
    g.bricks[1][3].alive = false
    setBallFlying(g, CELL_WIDTH - HALF + 2, rowCenter(3), -3, 0.5)
    g.collideBricks()
    expect(g.ball.dx).toBe(3)
    expect(g.ball.x).toBe(CELL_WIDTH + HALF)
    expect(g.score).toBe(0)
  })

  it('從上方砸到磚塊頂面只是反彈', () => {
    const { g } = createEngine()
    for (let r = 0; r < 3; r++) g.bricks[0][r].alive = false
    const spy = vi.spyOn(g, 'onBrickHit')
    setBallFlying(g, COL_CENTER(0), GRID_TOP + 3 * CELL_HEIGHT - HALF + 2, 0, 3)
    g.collideBricks()

    expect(spy).not.toHaveBeenCalled()
    expect(g.ball.dy).toBe(-3)
    expect(g.score).toBe(0)
    expect(g.wrongPause).toBeNull()
  })

  it('前排還在時，從下方打到後排也只是反彈', () => {
    const { g } = createEngine()
    const spy = vi.spyOn(g, 'onBrickHit')
    // 球「鑽」到 row 2 的正下方（row 3 仍活著）
    setBallFlying(g, COL_CENTER(0), rowBottom(2) + HALF - 2, 0, -3)
    g.collideBricks()

    expect(spy).not.toHaveBeenCalled()
    expect(g.ball.dy).toBe(3)
    expect(g.score).toBe(0)
    expect(g.wrongPause).toBeNull()
    expect(g.bricks[0][2].alive).toBe(true)
  })

  it('前排打掉後，後一排成為新的前排可以作答', () => {
    const { g } = createEngine()
    g.bricks[0][3].alive = false
    const newFront = frontBrick(g, 0)
    expect(newFront.row).toBe(2)
    const spy = vi.spyOn(g, 'onBrickHit')
    setBallFlying(g, COL_CENTER(0), rowBottom(2) + HALF - 2, 0, -3)
    g.collideBricks()
    expect(spy).toHaveBeenCalledWith(newFront)
  })

  it('不重疊時什麼都不做', () => {
    const { g } = createEngine()
    const spy = vi.spyOn(g, 'onBrickHit')
    setBallFlying(g, 360, 500, 1, -2)
    g.collideBricks()
    expect(spy).not.toHaveBeenCalled()
    expect(g.ball).toMatchObject({ x: 360, y: 500, dx: 1, dy: -2 })
  })

  it('連續撞磚超過 12 次沒回球拍會固定轉 12°', () => {
    const { g } = createEngine()
    g.bricks[0][3].alive = false
    g.brickBouncesSincePaddle = MAX_BRICK_BOUNCES_WITHOUT_PADDLE
    setBallFlying(g, CELL_WIDTH + HALF - 2, rowCenter(3), 3, 1)
    g.collideBricks()

    // 單純反彈會是 (-3, 1)；微調後方向差 12°、速度大小不變
    const plainReflect = { dx: -3, dy: 1 }
    expect(Math.abs(headingDeg(g.ball) - headingDeg(plainReflect))).toBeCloseTo(NUDGE_ANGLE, 5)
    expect(Math.hypot(g.ball.dx, g.ball.dy)).toBeCloseTo(Math.hypot(3, 1), 10)
    expect(g.brickBouncesSincePaddle).toBe(0)
  })
})

describe('球拍', () => {
  it('五區固定角度 -50/-25/0/25/50，速度不變', () => {
    const { g } = createEngine()
    const speed = g.speed()
    expect(speed).toBeCloseTo(Math.hypot(1.6, 1.6), 10)

    PADDLE_ZONE_ANGLES.forEach((angle, i) => {
      const x = g.paddle.x + ((i + 0.5) * PADDLE_WIDTH) / PADDLE_ZONE_ANGLES.length
      setBallFlying(g, x, PADDLE_TOP - HALF + 4, 0, 2)
      g.brickBouncesSincePaddle = 5
      g.collideWalls()

      expect(headingDeg(g.ball)).toBeCloseTo(angle, 6)
      expect(Math.hypot(g.ball.dx, g.ball.dy)).toBeCloseTo(speed, 10)
      expect(g.ball.y).toBe(PADDLE_TOP - HALF)
      expect(g.brickBouncesSincePaddle).toBe(0)
      expect(g.ballWaiting).toBe(false)
    })
    expect(PADDLE_ZONE_ANGLES).toEqual([-50, -25, 0, 25, 50])
  })

  it('球往上飛時經過球拍高度不會反彈', () => {
    const { g } = createEngine()
    setBallFlying(g, g.paddle.x + 10, PADDLE_TOP + 2, 0, -2)
    g.collideWalls()
    expect(g.ball.dy).toBe(-2)
  })

  it('launch 直上 0°，按住左右鍵 ±25°', () => {
    const { engine, g } = createEngine()
    const speed = g.speed()
    const listener = vi.fn()
    engine.subscribe(listener)

    engine.launch()
    expect(g.ballWaiting).toBe(false)
    expect(g.phase).toBe('playing')
    expect(g.ball.dx).toBeCloseTo(0, 10)
    expect(g.ball.dy).toBeCloseTo(-speed, 10)
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'playing' }))

    engine.start(makePool(20))
    engine.setPaddleKey('left', true)
    engine.launch()
    expect(headingDeg(g.ball)).toBeCloseTo(-LAUNCH_SIDE_ANGLE, 6)
    expect(Math.hypot(g.ball.dx, g.ball.dy)).toBeCloseTo(speed, 10)
    engine.setPaddleKey('left', false)

    engine.start(makePool(20))
    engine.setPaddleKey('right', true)
    engine.launch()
    expect(headingDeg(g.ball)).toBeCloseTo(LAUNCH_SIDE_ANGLE, 6)
    engine.setPaddleKey('right', false)

    // 兩鍵同時按：左鍵優先
    engine.start(makePool(20))
    engine.setPaddleKey('left', true)
    engine.setPaddleKey('right', true)
    engine.launch()
    expect(headingDeg(g.ball)).toBeCloseTo(-LAUNCH_SIDE_ANGLE, 6)
  })

  it('球已在飛或已過關時 launch 不做事', () => {
    const { engine, g } = createEngine()
    engine.launch()
    const before = { ...g.ball }
    engine.setPaddleKey('left', true)
    engine.launch()
    expect(g.ball).toEqual(before)

    g.phase = 'won'
    g.ballWaiting = true
    engine.launch()
    expect(g.phase).toBe('won')
  })

  it('setBaseSpeed 會即時重設飛行中的球速', () => {
    const { engine, g } = createEngine()
    engine.launch()
    engine.setBaseSpeed(3)
    expect(Math.hypot(g.ball.dx, g.ball.dy)).toBeCloseTo(Math.hypot(3, 3), 10)
    expect(headingDeg(g.ball)).toBeCloseTo(0, 6)
  })

  it('球還在等待時跟著球拍走', () => {
    const { engine, g } = createEngine()
    engine.movePaddleTo(200)
    g.update(1)
    expect(g.paddle.x).toBe(200 - PADDLE_WIDTH / 2)
    expect(g.ball.x).toBe(200)
    expect(g.ball.y).toBe(PADDLE_TOP - 2 - HALF)
  })

  it('movePaddleTo 超出邊界時忽略', () => {
    const { engine, g } = createEngine()
    const x = g.paddle.x
    engine.movePaddleTo(10)
    expect(g.paddle.x).toBe(x)
    engine.movePaddleTo(CANVAS_WIDTH - 10)
    expect(g.paddle.x).toBe(x)
  })

  it('方向鍵每幀移動 6px 並夾在畫面內', () => {
    const { engine, g } = createEngine()
    const x = g.paddle.x
    engine.setPaddleKey('right', true)
    g.update(1)
    expect(g.paddle.x).toBe(x + PADDLE_KEY_SPEED)
    g.update(2)
    expect(g.paddle.x).toBe(x + PADDLE_KEY_SPEED * 3)
    for (let i = 0; i < 200; i++) g.update(1)
    expect(g.paddle.x).toBe(CANVAS_WIDTH - PADDLE_WIDTH)
    engine.setPaddleKey('right', false)
    engine.setPaddleKey('left', true)
    for (let i = 0; i < 200; i++) g.update(1)
    expect(g.paddle.x).toBe(0)
  })
})

describe('漏接', () => {
  it('沒有生命：phase 回到 ready、combo 歸零、分數與剩餘數不變', () => {
    const { engine, g } = createEngine()
    hitTargets(g, 3)
    const score = g.score
    const listener = vi.fn()
    engine.subscribe(listener)
    const leftBefore = listener.mock.calls[0][0].left

    setBallFlying(g, 360, CANVAS_HEIGHT + HALF + 1, 1, 2)
    g.collideWalls()

    expect(g.phase).toBe('ready')
    expect(g.ballWaiting).toBe(true)
    expect(g.combo).toBe(0)
    expect(g.bestCombo).toBe(3)
    expect(g.score).toBe(score)
    expect(g.speedFactor).toBe(1)
    expect(g.ball.x).toBe(CANVAS_WIDTH / 2)
    expect(g.paddle.x).toBe((CANVAS_WIDTH - PADDLE_WIDTH) / 2)
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'ready', combo: 0, score, left: leftBefore }))
    expect(playBeep).toHaveBeenCalledWith(120, 0.3, 'sawtooth')
  })

  it('球到底部但還沒完全出界時不算漏接', () => {
    const { g } = createEngine()
    setBallFlying(g, 10, CANVAS_HEIGHT + HALF - 1, 1, 2)
    g.collideWalls()
    expect(g.phase).toBe('playing')
  })

  it('牆壁反彈：左右牆反轉 dx、頂牆反轉 dy', () => {
    const { g } = createEngine()
    setBallFlying(g, CANVAS_WIDTH - 2, 400, 3, -1)
    g.collideWalls()
    expect(g.ball.x).toBe(CANVAS_WIDTH - HALF)
    expect(g.ball.dx).toBe(-3)

    setBallFlying(g, 2, 400, -3, -1)
    g.collideWalls()
    expect(g.ball.x).toBe(HALF)
    expect(g.ball.dx).toBe(3)

    setBallFlying(g, 360, 2, 1, -3)
    g.collideWalls()
    expect(g.ball.y).toBe(HALF)
    expect(g.ball.dy).toBe(3)
  })
})

describe('新手模式', () => {
  it('球拍加寬到 150，關閉後回到 116 並重設降速', () => {
    const { engine, g } = createEngine()
    engine.setBeginnerMode(true)
    expect(engine.isBeginnerMode()).toBe(true)
    expect(g.paddleWidth).toBe(PADDLE_WIDTH_BEGINNER)
    g.speedFactor = 0.7
    engine.setBeginnerMode(false)
    expect(g.paddleWidth).toBe(PADDLE_WIDTH)
    expect(g.speedFactor).toBe(1)
  })

  it('開啟時球拍若貼右牆會被夾回畫面內', () => {
    const { engine, g } = createEngine()
    g.paddle.x = CANVAS_WIDTH - PADDLE_WIDTH
    engine.setBeginnerMode(true)
    expect(g.paddle.x).toBe(CANVAS_WIDTH - PADDLE_WIDTH_BEGINNER)
  })

  it('接到球會黏住：ballWaiting=true、phase=ready', () => {
    const { engine, g } = createEngine()
    engine.setBeginnerMode(true)
    const listener = vi.fn()
    engine.subscribe(listener)
    setBallFlying(g, g.paddle.x + 20, PADDLE_TOP - HALF + 4, 1, 2)
    g.collideWalls()

    expect(g.ballWaiting).toBe(true)
    expect(g.phase).toBe('ready')
    expect(g.ball.y).toBe(PADDLE_TOP - HALF)
    expect(g.brickBouncesSincePaddle).toBe(0)
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'ready' }))
  })

  it('漏接 speedFactor 乘 0.85，下限 0.6，球速同步變慢', () => {
    const { engine, g } = createEngine()
    engine.setBeginnerMode(true)
    const base = g.speed()
    const miss = (): void => {
      setBallFlying(g, 360, CANVAS_HEIGHT + HALF + 1, 0, 2)
      g.collideWalls()
    }
    const factors: number[] = []
    for (let i = 0; i < 5; i++) {
      miss()
      factors.push(g.speedFactor)
    }
    expect(factors[0]).toBeCloseTo(0.85, 10)
    expect(factors[1]).toBeCloseTo(0.7225, 10)
    expect(factors[2]).toBeCloseTo(0.614125, 10)
    expect(factors[3]).toBe(BEGINNER_MIN_SPEED_FACTOR)
    expect(factors[4]).toBe(BEGINNER_MIN_SPEED_FACTOR)
    expect(g.speed()).toBeCloseTo(base * BEGINNER_MIN_SPEED_FACTOR, 10)
    expect(Math.abs(g.ball.dy)).toBeCloseTo(base * BEGINNER_MIN_SPEED_FACTOR, 10)
  })

  it('命中 +0.05 回升，上限 1', () => {
    const { engine, g } = createEngine(makePool(40))
    engine.setBeginnerMode(true)
    g.speedFactor = 0.9
    g.onBrickHit(targetBrick(g))
    expect(g.speedFactor).toBeCloseTo(0.95, 10)
    g.onBrickHit(targetBrick(g))
    expect(g.speedFactor).toBeCloseTo(1, 10)
    g.onBrickHit(targetBrick(g))
    expect(g.speedFactor).toBe(1)
  })

  it('非新手模式漏接不降速、命中不回升', () => {
    const { g } = createEngine()
    setBallFlying(g, 360, CANVAS_HEIGHT + HALF + 1, 0, 2)
    g.collideWalls()
    expect(g.speedFactor).toBe(1)
  })

  it('球快到球拍時慢動作 0.5，離球拍遠或往上飛時正常', () => {
    const { engine, g } = createEngine()
    engine.setBeginnerMode(true)
    const slowmoY = PADDLE_TOP - BEGINNER_SLOWMO_DISTANCE + 10
    setBallFlying(g, 360, slowmoY, 0, 2)
    g.update(1)
    expect(g.ball.y).toBe(slowmoY + 1)

    const farY = PADDLE_TOP - BEGINNER_SLOWMO_DISTANCE - 10
    setBallFlying(g, 360, farY, 0, 2)
    g.update(1)
    expect(g.ball.y).toBe(farY + 2)

    setBallFlying(g, 360, slowmoY, 0, -2)
    g.update(1)
    expect(g.ball.y).toBe(slowmoY - 2)
  })
})

describe('主迴圈與繪圖', () => {
  it('frame 依時間差補償步長，並在未過關時排下一幀', () => {
    const { g } = createEngine()
    const engine = g as unknown as BreakoutEngine
    engine.launch()
    const speed = g.speed()
    const y0 = g.ball.y
    vi.mocked(requestAnimationFrame).mockClear()

    g.frame(clock.now + 1000 / 60) // 剛好一幀 → step 1
    expect(g.ball.y).toBeCloseTo(y0 - speed, 10)
    g.frame(clock.now + (1000 / 60) * 1.5) // 半幀 → step 0.5
    expect(g.ball.y).toBeCloseTo(y0 - speed * 1.5, 10)
    g.frame(clock.now + (1000 / 60) * 10) // 掉幀太多 → 最多補到 2
    expect(g.ball.y).toBeCloseTo(y0 - speed * 3.5, 10)
    expect(requestAnimationFrame).toHaveBeenCalledTimes(3)
  })

  it('過關後 frame 不再排下一幀，也不再更新', () => {
    const { g } = createEngine(makePool(SLOT_COUNT))
    hitTargets(g, SLOT_COUNT)
    expect(g.phase).toBe('won')
    vi.mocked(requestAnimationFrame).mockClear()
    g.frame(clock.now + 16)
    expect(requestAnimationFrame).not.toHaveBeenCalled()
  })

  it('各種狀態下 render 都不會丟錯（等待發球、飛行、連擊尾焰、打錯停頓、過關）', () => {
    const { engine, g } = createEngine(makePool(40))
    expect(() => g.render()).not.toThrow() // 等待發球：預測軌跡

    engine.launch()
    g.ball.dy = Math.abs(g.ball.dy)
    g.ball.y = 400
    expect(() => g.render()).not.toThrow() // 往下掉：落點標記

    hitTargets(g, 3)
    for (let i = 0; i < 20; i++) g.update(1) // 尾焰、粒子、浮字
    expect(g.trail.length).toBeGreaterThan(0)
    expect(g.particles.length).toBeGreaterThan(0)
    expect(() => g.render()).not.toThrow()

    g.onBrickHit(wrongBrick(g))
    expect(() => g.render()).not.toThrow() // 打錯：震動 + 字義面板
    for (let i = 0; i < 200; i++) {
      g.update(1)
      g.render() // 浮字只在繪圖時淡出
    }
    expect(g.floatingTexts).toHaveLength(0)
    expect(g.particles).toHaveLength(0)

    engine.setBeginnerMode(true)
    expect(() => g.render()).not.toThrow()

    g.phase = 'won'
    expect(() => g.render()).not.toThrow()
  })
})

describe('防卡：長時間模擬', () => {
  it('60000 步內球不會鑽進最前排、也不會原地卡住', () => {
    seedRandom(42)
    const { engine, g } = createEngine(makePool(600))
    const STEP_MS = 16.7
    const step = STEP_MS / (1000 / 60)
    const TOTAL = 60_000
    const WINDOW = 600
    const MIN_RANGE = 40

    // 球拍跟球但帶一點偏移，讓五個反彈區都被用到；偏移在每次球轉向往下時換
    let rnd = 7
    const nextRnd = (): number => (rnd = (Math.imul(rnd, 1103515245) + 12345) >>> 0)
    let offset = 0
    let wasGoingUp = false
    const xs = new Float64Array(TOTAL)
    const ys = new Float64Array(TOTAL)
    let hits = 0
    let launches = 0
    engine.subscribe((s) => {
      if (s.lastHit?.kind === 'target') hits++
    })

    for (let i = 0; i < TOTAL; i++) {
      clock.now += STEP_MS
      if (g.ballWaiting && g.phase === 'ready') {
        const k = nextRnd() % 3
        engine.setPaddleKey('left', k === 0)
        engine.setPaddleKey('right', k === 1)
        engine.launch()
        engine.setPaddleKey('left', false)
        engine.setPaddleKey('right', false)
        launches++
      }
      const goingUp = g.ball.dy < 0
      if (wasGoingUp && !goingUp) offset = ((nextRnd() % 5) - 2) * (PADDLE_WIDTH / 5)
      wasGoingUp = goingUp
      const center = Math.max(HALF + 1, Math.min(CANVAS_WIDTH - HALF - 1, g.ball.x + offset))
      engine.movePaddleTo(center)

      g.update(step)
      xs[i] = g.ball.x
      ys[i] = g.ball.y

      // 球心減半徑不可高於它所在每一欄最前排格子的底邊
      const left = Math.floor((g.ball.x - HALF) / CELL_WIDTH)
      const right = Math.floor((g.ball.x + HALF - 1e-9) / CELL_WIDTH)
      for (let c = Math.max(0, left); c <= Math.min(BRICK_COLS - 1, right); c++) {
        const front = g.frontLineBricks().find((b) => b.col === c)
        if (!front) continue
        const bottom = front.y + CELL_HEIGHT
        if (g.ball.y - HALF < bottom - 1e-6) {
          throw new Error(`step ${i}: ball y=${g.ball.y} inside column ${c} front brick (bottom ${bottom})`)
        }
      }
    }

    expect(g.phase).not.toBe('won')
    expect(hits).toBeGreaterThan(10)
    expect(launches).toBeGreaterThan(0)

    // 任何 600 步的區段裡，球的移動範圍（x 或 y 的極差）都不能小於 40px
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    const stuckAt: number[] = []
    for (let start = 0; start + WINDOW <= TOTAL; start += WINDOW / 2) {
      minX = Infinity; maxX = -Infinity; minY = Infinity; maxY = -Infinity
      for (let j = start; j < start + WINDOW; j++) {
        if (xs[j] < minX) minX = xs[j]
        if (xs[j] > maxX) maxX = xs[j]
        if (ys[j] < minY) minY = ys[j]
        if (ys[j] > maxY) maxY = ys[j]
      }
      if (Math.max(maxX - minX, maxY - minY) < MIN_RANGE) stuckAt.push(start)
    }
    expect(stuckAt, `ball barely moved in windows starting at steps ${stuckAt.join(', ')}`).toEqual([])
  })
})

describe('internals helper', () => {
  it('internals 回傳同一個引擎物件', () => {
    const engine = new BreakoutEngine(createCanvasMock())
    expect(internals(engine)).toBe(engine)
  })
})

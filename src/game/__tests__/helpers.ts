import { vi } from 'vitest'
import type { Gender, Vocab } from '../../types'
import { BreakoutEngine } from '../engine'
import { BRICK_COLS, BRICK_ROWS, CELL_WIDTH } from '../constants'

// ---------- Canvas mock ----------

const CTX_METHODS = [
  'fillRect', 'strokeRect', 'clearRect', 'fillText', 'strokeText',
  'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'fill', 'stroke',
  'save', 'restore', 'setLineDash', 'translate',
] as const

/** 最小 2D context：所有繪圖方法都是 no-op，屬性可任意讀寫 */
export function createContextMock(): CanvasRenderingContext2D {
  const ctx: Record<string, unknown> = {}
  for (const m of CTX_METHODS) ctx[m] = vi.fn()
  ctx.measureText = vi.fn(() => ({ width: 10 }))
  return ctx as unknown as CanvasRenderingContext2D
}

export function createCanvasMock(ctx = createContextMock()): HTMLCanvasElement {
  return { getContext: vi.fn(() => ctx), width: 720, height: 740 } as unknown as HTMLCanvasElement
}

// ---------- 可控時鐘 / 亂數 ----------

export const clock = { now: 0 }

/** 把 performance.now 換成可手動推進的時鐘，rAF 換成 no-op（測試自己呼叫 update/frame） */
export function installDeterministicGlobals(): void {
  clock.now = 10_000
  vi.spyOn(performance, 'now').mockImplementation(() => clock.now)
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  seedRandom(1)
}

let randState = 1
/** 可重現的 LCG，取代 Math.random（洗牌、選題、粒子） */
export function seedRandom(seed: number): void {
  randState = seed >>> 0 || 1
  vi.spyOn(Math, 'random').mockImplementation(() => {
    randState = (Math.imul(randState, 1664525) + 1013904223) >>> 0
    return randState / 0x1_0000_0000
  })
}

// ---------- 字庫 ----------

const GENDERS: Gender[] = ['m', 'f', 'n', 'pl', 'other']

export function makePool(size: number): Vocab[] {
  return Array.from({ length: size }, (_, i) => ({
    de: `Wort${i}`,
    zh: `字${i}`,
    gender: GENDERS[i % GENDERS.length],
    category: 'test',
  }))
}

// ---------- 引擎內部存取 ----------

export interface Brick {
  col: number
  row: number
  x: number
  y: number
  alive: boolean
  vocab: Vocab
}

/** 引擎的 private 成員在執行期可直接存取；這裡給它們型別，避免測試裡到處 any */
export interface Internals {
  bricks: Brick[][]
  wordQueue: Vocab[]
  pendingRefills: { col: number; row: number; at: number }[]
  wrongPause: { until: number; vocab: Vocab } | null
  score: number
  combo: number
  bestCombo: number
  phase: string
  ballWaiting: boolean
  target: Vocab | null
  paddleWidth: number
  beginner: boolean
  speedFactor: number
  brickBouncesSincePaddle: number
  floatingTexts: unknown[]
  particles: unknown[]
  trail: unknown[]
  ball: { x: number; y: number; dx: number; dy: number }
  paddle: { x: number; leftPressed: boolean; rightPressed: boolean }
  speed(): number
  frontLineBricks(): Brick[]
  onBrickHit(b: Brick): void
  processRefills(): void
  collideBricks(): void
  collideWalls(): void
  update(step: number): void
  render(): void
  frame(now: number): void
}

export function internals(engine: BreakoutEngine): Internals {
  return engine as unknown as Internals
}

export function createEngine(pool: Vocab[] = makePool(24)): { engine: BreakoutEngine; g: Internals } {
  const engine = new BreakoutEngine(createCanvasMock())
  engine.start(pool)
  return { engine, g: internals(engine) }
}

/** 某一欄最前排（最靠近球拍）的活磚塊 */
export function frontBrick(g: Internals, col: number): Brick {
  const b = g.frontLineBricks().find((x) => x.col === col)
  if (!b) throw new Error(`column ${col} has no alive brick`)
  return b
}

/** 目前懸賞對應的前排磚塊 */
export function targetBrick(g: Internals): Brick {
  const b = g.frontLineBricks().find((x) => x.vocab.de === g.target?.de)
  if (!b) throw new Error('target is not on the front line')
  return b
}

/** 任一不是懸賞的前排磚塊 */
export function wrongBrick(g: Internals): Brick {
  const b = g.frontLineBricks().find((x) => x.vocab.de !== g.target?.de)
  if (!b) throw new Error('no non-target brick on the front line')
  return b
}

export function countAlive(g: Internals): number {
  let n = 0
  for (const col of g.bricks) for (const b of col) if (b.alive) n++
  return n
}

export const SLOT_COUNT = BRICK_ROWS * BRICK_COLS
export const COL_CENTER = (col: number): number => col * CELL_WIDTH + CELL_WIDTH / 2

/** 讓球進入飛行狀態（跳過 launch 的角度邏輯，直接給速度） */
export function setBallFlying(g: Internals, x: number, y: number, dx: number, dy: number): void {
  g.ballWaiting = false
  g.phase = 'playing'
  g.ball.x = x
  g.ball.y = y
  g.ball.dx = dx
  g.ball.dy = dy
}

/** 速度向量的方向角（度）：0 = 直上、負 = 往左、正 = 往右 */
export function headingDeg(v: { dx: number; dy: number }): number {
  return (Math.atan2(v.dx, -v.dy) * 180) / Math.PI
}

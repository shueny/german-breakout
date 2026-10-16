import type { GamePhase, GameSnapshot, HitInfo, Vocab } from '../types'
import {
  BALL_SIZE,
  BRICK_COLS,
  BRICK_HEIGHT,
  BRICK_INSET,
  BRICK_ROWS,
  BRICK_WIDTH,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  CELL_HEIGHT,
  CELL_WIDTH,
  COMBO_BONUS_STEP,
  COMBO_MAX_LEVEL,
  GENDER_COLORS,
  GRID_TOP,
  MAX_BRICK_BOUNCES_WITHOUT_PADDLE,
  LAUNCH_SIDE_ANGLE,
  NUDGE_ANGLE,
  PADDLE_WIDTH_BEGINNER,
  PADDLE_ZONE_ANGLES,
  BEGINNER_SLOWMO_DISTANCE,
  BEGINNER_SLOWMO_FACTOR,
  BEGINNER_MISS_SPEED_FACTOR,
  BEGINNER_MIN_SPEED_FACTOR,
  BEGINNER_HIT_SPEED_RECOVER,
  PADDLE_BOTTOM_GAP,
  PADDLE_HEIGHT,
  PADDLE_KEY_SPEED,
  PADDLE_WIDTH,
  POINTS_TARGET,
  POINTS_WRONG,
  REFILL_DELAY_MS,
  WRONG_PAUSE_MS,
} from './constants'
import { playBeep, playStageClear, speakGerman } from './audio'
import { displayDe } from './text'

interface Brick {
  col: number
  row: number
  x: number
  y: number
  alive: boolean
  vocab: Vocab
}

interface PendingRefill {
  col: number
  row: number
  at: number
}

interface FloatingText {
  x: number
  y: number
  text: string
  color: string
  alpha: number
  size?: number
  rise?: number
  /** 畫面中央的鼓勵語，同時只保留最新一則 */
  praise?: boolean
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  color: string
  size: number
}

/** 依連擊數決定的視覺強度（0 = 無連擊） */
function comboLevel(combo: number): number {
  return Math.min(Math.max(combo, 0), COMBO_MAX_LEVEL)
}

const COMBO_PALETTE = ['#00ffff', '#33ff00', '#ffff00', '#ff9900', '#ff4466', '#ff00ff']

/** 答對時的德文鼓勵語，依連擊數遞增 */
const PRAISE = ['Richtig!', 'Gut!', 'Super!', 'Toll!', 'Prima!', 'Fantastisch!', 'Wunderbar!', 'Unglaublich!']
function praiseFor(combo: number): string {
  return PRAISE[Math.min(combo, PRAISE.length) - 1]
}

export type SnapshotListener = (snapshot: GameSnapshot) => void

function shuffle<T>(array: readonly T[]): T[] {
  const arr = [...array]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/**
 * 純邏輯的打磚塊引擎：不碰 DOM，只讀寫自己的狀態並畫到傳入的 canvas context。
 * 外部透過 snapshot listener 得知分數、懸賞等變化。
 */
export class BreakoutEngine {
  private readonly ctx: CanvasRenderingContext2D
  private readonly listeners = new Set<SnapshotListener>()

  private bricks: Brick[][] = []
  private wordQueue: Vocab[] = []
  private pendingRefills: PendingRefill[] = []
  private floatingTexts: FloatingText[] = []
  private particles: Particle[] = []
  private trail: { x: number; y: number }[] = []
  private shakeFrames = 0
  private shakeMagnitude = 0
  private flashAlpha = 0
  private combo = 0
  private bestCombo = 0
  private wrongPause: { until: number; vocab: Vocab } | null = null

  private score = 0
  private phase: GamePhase = 'loading'
  private ballWaiting = true
  private target: Vocab | null = null
  private lastHit: HitInfo | null = null

  private baseSpeed = 1.6
  private paddleWidth = PADDLE_WIDTH
  private beginner = false
  /** 新手模式下漏接會降速、命中慢慢恢復 */
  private speedFactor = 1
  private readonly ball = { x: 0, y: 0, dx: 0, dy: 0 }
  private readonly paddle = { x: 0, leftPressed: false, rightPressed: false }

  private animationId = 0
  private lastFrameAt = 0
  private brickBouncesSincePaddle = 0

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D context unavailable')
    this.ctx = ctx
  }

  // ---------- 對外 API ----------

  subscribe(listener: SnapshotListener): () => void {
    this.listeners.add(listener)
    listener(this.snapshot())
    return () => this.listeners.delete(listener)
  }

  setBaseSpeed(value: number): void {
    this.baseSpeed = value
    this.rescaleVelocity()
  }

  /** 新手模式：接球黏住、球拍加寬、靠近球拍慢動作、漏接自動降速 */
  setBeginnerMode(on: boolean): void {
    this.beginner = on
    this.paddleWidth = on ? PADDLE_WIDTH_BEGINNER : PADDLE_WIDTH
    this.paddle.x = Math.max(0, Math.min(CANVAS_WIDTH - this.paddleWidth, this.paddle.x))
    if (!on) this.speedFactor = 1
    this.rescaleVelocity()
  }

  isBeginnerMode(): boolean {
    return this.beginner
  }

  /** 目前有效的球速（總速度） */
  private speed(): number {
    return Math.hypot(this.baseSpeed, this.baseSpeed) * this.speedFactor
  }

  private rescaleVelocity(): void {
    const mag = Math.hypot(this.ball.dx, this.ball.dy)
    if (mag > 0) {
      const target = this.speed()
      this.ball.dx = (this.ball.dx / mag) * target
      this.ball.dy = (this.ball.dy / mag) * target
    }
  }

  /** 發球方向：按住左右鍵斜 25°，否則直上 */
  private launchDirection(): { dx: number; dy: number } {
    const deg = this.paddle.leftPressed ? -LAUNCH_SIDE_ANGLE : this.paddle.rightPressed ? LAUNCH_SIDE_ANGLE : 0
    const rad = (deg * Math.PI) / 180
    return { dx: Math.sin(rad), dy: -Math.cos(rad) }
  }

  start(pool: Vocab[]): void {
    this.stopLoop()
    this.score = 0
    this.phase = 'ready'
    this.lastHit = null
    this.floatingTexts = []
    this.particles = []
    this.trail = []
    this.shakeFrames = 0
    this.flashAlpha = 0
    this.combo = 0
    this.bestCombo = 0
    this.wrongPause = null
    this.pendingRefills = []
    this.resetBallAndPaddle()

    const shuffled = shuffle(pool)
    const slotCount = BRICK_ROWS * BRICK_COLS
    const onScreen = shuffled.slice(0, slotCount)
    this.wordQueue = shuffled.slice(slotCount)

    this.bricks = []
    let idx = 0
    for (let c = 0; c < BRICK_COLS; c++) {
      this.bricks[c] = []
      for (let r = 0; r < BRICK_ROWS; r++) {
        this.bricks[c][r] = {
          col: c,
          row: r,
          x: c * CELL_WIDTH,
          y: GRID_TOP + r * CELL_HEIGHT,
          alive: onScreen.length > 0,
          vocab: onScreen.length > 0 ? onScreen[idx % onScreen.length] : { de: '', zh: '', gender: 'other', category: '' },
        }
        idx++
      }
    }

    this.pickNewTarget()
    this.emit()
    this.lastFrameAt = performance.now()
    this.animationId = requestAnimationFrame(this.frame)
  }

  destroy(): void {
    this.stopLoop()
    this.listeners.clear()
  }

  launch(): void {
    if (this.ballWaiting && this.phase === 'ready') {
      const dir = this.launchDirection()
      const speed = this.speed()
      this.ball.dx = dir.dx * speed
      this.ball.dy = dir.dy * speed
      this.ballWaiting = false
      this.phase = 'playing'
      this.brickBouncesSincePaddle = 0
      playBeep(440, 0.08)
      this.emit()
    }
  }

  setPaddleKey(direction: 'left' | 'right', pressed: boolean): void {
    if (direction === 'left') this.paddle.leftPressed = pressed
    else this.paddle.rightPressed = pressed
  }

  movePaddleTo(centerX: number): void {
    const half = this.paddleWidth / 2
    if (centerX > half && centerX < CANVAS_WIDTH - half) {
      this.paddle.x = centerX - half
    }
  }

  // ---------- 狀態 ----------

  private snapshot(): GameSnapshot {
    return {
      score: this.score,
      left: this.countAliveBricks() + this.pendingRefills.length + this.wordQueue.length,
      target: this.target,
      phase: this.phase,
      lastHit: this.lastHit,
      combo: this.combo,
      bestCombo: this.bestCombo,
    }
  }

  private emit(): void {
    const snap = this.snapshot()
    this.listeners.forEach((l) => l(snap))
  }

  private stopLoop(): void {
    cancelAnimationFrame(this.animationId)
  }

  private countAliveBricks(): number {
    let n = 0
    for (const col of this.bricks) for (const b of col) if (b.alive) n++
    return n
  }

  /** 每一欄最下方（最靠近球拍）的磚塊 = 可得分的「選項」 */
  private frontLineBricks(): Brick[] {
    const front: Brick[] = []
    for (let c = 0; c < BRICK_COLS; c++) {
      for (let r = BRICK_ROWS - 1; r >= 0; r--) {
        const b = this.bricks[c]?.[r]
        if (b?.alive) {
          front.push(b)
          break
        }
      }
    }
    return front
  }

  private isTargetReachable(): boolean {
    return !!this.target && this.frontLineBricks().some((b) => b.vocab.de === this.target!.de)
  }

  private pickNewTarget(): void {
    const front = this.frontLineBricks()
    if (front.length === 0) {
      if (this.pendingRefills.length > 0) return // 磚塊補充中，等補好再出題
      this.target = null
      this.phase = 'won'
      playStageClear()
      return
    }
    this.target = front[Math.floor(Math.random() * front.length)].vocab
  }

  private resetBallAndPaddle(): void {
    this.ballWaiting = true
    this.brickBouncesSincePaddle = 0
    this.paddle.x = (CANVAS_WIDTH - this.paddleWidth) / 2
    this.ball.x = this.paddle.x + this.paddleWidth / 2
    this.ball.y = this.paddleTop() - 2 - BALL_SIZE / 2
    this.ball.dx = 0
    this.ball.dy = -this.speed()
  }

  private paddleTop(): number {
    return CANVAS_HEIGHT - PADDLE_HEIGHT - PADDLE_BOTTOM_GAP
  }

  // ---------- 補磚 ----------

  private scheduleRefill(col: number, row: number): void {
    if (this.wordQueue.length === 0) return
    this.pendingRefills.push({ col, row, at: performance.now() + REFILL_DELAY_MS })
  }

  private processRefills(): void {
    if (this.pendingRefills.length === 0) return
    const now = performance.now()
    let refilled = false
    for (let i = this.pendingRefills.length - 1; i >= 0; i--) {
      const p = this.pendingRefills[i]
      if (now < p.at) continue
      const slot = this.bricks[p.col][p.row]
      // 球還壓在這格就先不補，避免一出現就被連打
      if (!this.ballWaiting && this.ballOverlaps(slot)) continue
      const next = this.wordQueue.shift()
      this.pendingRefills.splice(i, 1)
      if (!next) continue
      slot.vocab = next
      slot.alive = true
      refilled = true
    }
    if (refilled) {
      playBeep(660, 0.05, 'triangle')
      if (!this.isTargetReachable()) this.pickNewTarget()
      this.emit()
    }
  }

  // ---------- 碰撞 ----------

  private ballOverlaps(b: Brick): boolean {
    const half = BALL_SIZE / 2
    return (
      this.ball.x + half > b.x &&
      this.ball.x - half < b.x + CELL_WIDTH &&
      this.ball.y + half > b.y &&
      this.ball.y - half < b.y + CELL_HEIGHT
    )
  }

  private collideBricks(): void {
    const half = BALL_SIZE / 2
    for (let c = 0; c < BRICK_COLS; c++) {
      for (let r = 0; r < BRICK_ROWS; r++) {
        const b = this.bricks[c][r]
        if (!b.alive || !this.ballOverlaps(b)) continue

        const overlapLeft = this.ball.x + half - b.x
        const overlapRight = b.x + CELL_WIDTH - (this.ball.x - half)
        const overlapTop = this.ball.y + half - b.y
        const overlapBottom = b.y + CELL_HEIGHT - (this.ball.y - half)

        // 依最淺的重疊方向反彈，並把球推到格子外面，避免下一幀仍重疊而反覆反轉卡住
        let hitFromBelow = false
        if (Math.min(overlapLeft, overlapRight) < Math.min(overlapTop, overlapBottom)) {
          if (overlapLeft < overlapRight) {
            this.ball.x = b.x - half
            this.ball.dx = -Math.abs(this.ball.dx)
          } else {
            this.ball.x = b.x + CELL_WIDTH + half
            this.ball.dx = Math.abs(this.ball.dx)
          }
        } else if (overlapTop < overlapBottom) {
          this.ball.y = b.y - half
          this.ball.dy = -Math.abs(this.ball.dy)
        } else {
          this.ball.y = b.y + CELL_HEIGHT + half
          this.ball.dy = Math.abs(this.ball.dy)
          hitFromBelow = true
        }

        // 只有「從下方打中最前排磚塊」才算作答；側面、頂面或後排只是單純反彈
        if (hitFromBelow && this.frontLineBricks().includes(b)) {
          this.onBrickHit(b)
        } else {
          // 單純反彈也唸出單字，但不打斷正在播的發音
          speakGerman(b.vocab.de, false)
          playBeep(300, 0.04)
        }
        this.brickBouncesSincePaddle++
        if (this.brickBouncesSincePaddle > MAX_BRICK_BOUNCES_WITHOUT_PADDLE) {
          this.nudgeDirection()
          this.brickBouncesSincePaddle = 0
        }
        return
      }
    }
  }

  private onBrickHit(b: Brick): void {
    const isOption = this.frontLineBricks().includes(b)
    const isTarget = isOption && !!this.target && b.vocab.de === this.target.de

    const cx = b.x + CELL_WIDTH / 2
    const cy = b.y + CELL_HEIGHT / 2

    if (!isTarget) {
      // 打錯：磚塊只反彈不消失，也不給分，但顯示字義幫助記憶；連擊中斷
      const broken = this.combo
      this.lastHit = { kind: 'wrong', points: POINTS_WRONG, vocab: b.vocab, combo: broken }
      this.combo = 0
      this.trail = []
      // 停頓：整個畫面震動，並在正中央顯示打錯的字與字義；先唸完單字再播錯誤音效
      const pause = { until: performance.now() + WRONG_PAUSE_MS, vocab: b.vocab }
      this.wrongPause = pause
      speakGerman(b.vocab.de, true, () => {
        playBeep(200, 0.12, 'sawtooth')
        setTimeout(() => playBeep(150, 0.25, 'sawtooth'), 120)
        // 唸得比較久時把停頓延到音效播完
        if (this.wrongPause === pause) pause.until = Math.max(pause.until, performance.now() + 450)
      })
      this.shake(6, 60)
      if (broken >= 2) {
        this.floatingTexts.push({ x: cx, y: cy - 22, text: 'COMBO BREAK', color: '#ff4466', alpha: 1, size: 20 })
      }
      this.emit()
      return
    }

    b.alive = false
    this.scheduleRefill(b.col, b.row)

    this.combo++
    this.bestCombo = Math.max(this.bestCombo, this.combo)
    if (this.beginner) this.speedFactor = Math.min(1, this.speedFactor + BEGINNER_HIT_SPEED_RECOVER)
    const level = comboLevel(this.combo)
    const points = POINTS_TARGET + (level - 1) * COMBO_BONUS_STEP
    const hit: HitInfo = { kind: 'target', points, vocab: b.vocab, combo: this.combo }
    this.score += hit.points
    this.lastHit = hit

    // 先唸單字，唸完再播命中音效；連擊越高音越高、特效越強
    const comboAtHit = this.combo
    speakGerman(b.vocab.de, true, () => {
      playBeep(784 * (1 + 0.07 * Math.min(comboAtHit, 8)), 0.14)
      if (comboAtHit >= 2) setTimeout(() => playBeep(1046 * (1 + 0.05 * Math.min(comboAtHit, 8)), 0.1), 70)
    })

    const color = COMBO_PALETTE[level]
    this.floatingTexts.push({ x: cx, y: cy, text: `${b.vocab.zh} +${hit.points}`, color: '#ffff00', alpha: 1, size: 18 })
    if (this.combo >= 2) {
      this.floatingTexts.push({
        x: cx,
        y: cy - 30,
        text: `COMBO x${this.combo}!`,
        color,
        alpha: 1,
        size: 22 + level * 6,
        rise: 1.4,
      })
    }
    // 畫面中央的德文鼓勵語：連擊越高字越大，同時只顯示最新一則
    this.floatingTexts = this.floatingTexts.filter((t) => !t.praise)
    this.floatingTexts.push({
      x: CANVAS_WIDTH / 2,
      y: CANVAS_HEIGHT * 0.55,
      text: praiseFor(this.combo),
      color,
      alpha: 1,
      size: 40 + level * 8,
      rise: 0.6,
      praise: true,
    })
    this.burst(cx, cy, 24 + level * 16, color)
    this.shake(2 + level * 3, 12 + level * 4)
    this.flashAlpha = Math.min(0.2 + level * 0.1, 0.6)

    this.pickNewTarget()
    this.emit()
  }

  // ---------- 特效 ----------

  private burst(x: number, y: number, count: number, color: string): void {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2
      const speed = 1.5 + Math.random() * 3.5
      const life = 25 + Math.random() * 25
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        color: Math.random() < 0.3 ? '#ffffff' : color,
        size: 2 + Math.random() * 3,
      })
    }
    if (this.particles.length > 800) this.particles.splice(0, this.particles.length - 800)
  }

  private shake(magnitude: number, frames: number): void {
    this.shakeMagnitude = Math.max(this.shakeMagnitude, magnitude)
    this.shakeFrames = Math.max(this.shakeFrames, frames)
  }

  private updateEffects(step: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]
      p.x += p.vx * step
      p.y += p.vy * step
      p.vy += 0.08 * step
      p.vx *= 0.98
      p.life -= step
      if (p.life <= 0) this.particles.splice(i, 1)
    }
    if (this.shakeFrames > 0) {
      this.shakeFrames -= step
      if (this.shakeFrames <= 0) this.shakeMagnitude = 0
    }
    if (this.flashAlpha > 0) this.flashAlpha = Math.max(0, this.flashAlpha - 0.02 * step)

    // 球的尾焰：連擊越高越長
    if (!this.ballWaiting && this.combo >= 2) {
      this.trail.push({ x: this.ball.x, y: this.ball.y })
      const maxLen = 8 + comboLevel(this.combo) * 8
      if (this.trail.length > maxLen) this.trail.splice(0, this.trail.length - maxLen)
    } else if (this.trail.length > 0) {
      this.trail.shift()
    }
  }

  private collideWalls(): void {
    const half = BALL_SIZE / 2
    if (this.ball.x + half > CANVAS_WIDTH) {
      this.ball.x = CANVAS_WIDTH - half
      this.ball.dx = -Math.abs(this.ball.dx)
      playBeep(300, 0.04)
    } else if (this.ball.x - half < 0) {
      this.ball.x = half
      this.ball.dx = Math.abs(this.ball.dx)
      playBeep(300, 0.04)
    }

    if (this.ball.y - half < 0) {
      this.ball.y = half
      this.ball.dy = Math.abs(this.ball.dy)
      playBeep(300, 0.04)
      return
    }

    const paddleTop = this.paddleTop()
    if (this.ball.y + half < paddleTop) return

    const onPaddle =
      this.ball.dy > 0 &&
      this.ball.x + half >= this.paddle.x &&
      this.ball.x - half <= this.paddle.x + this.paddleWidth &&
      this.ball.y - half <= CANVAS_HEIGHT - PADDLE_BOTTOM_GAP

    if (onPaddle) {
      this.ball.y = paddleTop - half
      this.brickBouncesSincePaddle = 0
      if (this.beginner) {
        // 新手模式：接住球，移到想要的位置再按空白鍵發射
        this.ballWaiting = true
        this.phase = 'ready'
        playBeep(520, 0.06)
        this.emit()
        return
      }
      // 球拍分 5 區，每區固定角度，打到哪一區就往哪個方向，結果可預測
      const zoneIndex = Math.max(
        0,
        Math.min(PADDLE_ZONE_ANGLES.length - 1, Math.floor(((this.ball.x - this.paddle.x) / this.paddleWidth) * PADDLE_ZONE_ANGLES.length)),
      )
      const rad = (PADDLE_ZONE_ANGLES[zoneIndex] * Math.PI) / 180
      const speed = this.speed()
      this.ball.dx = Math.sin(rad) * speed
      this.ball.dy = -Math.cos(rad) * speed
      playBeep(440, 0.06)
    } else if (this.ball.y - half > CANVAS_HEIGHT) {
      this.onBallLost()
    }
  }

  /** 球拍上的分區邊界（畫在球拍上當瞄準參考） */
  private paddleZoneEdges(): number[] {
    const edges: number[] = []
    for (let i = 1; i < PADDLE_ZONE_ANGLES.length; i++) {
      edges.push(this.paddle.x + (this.paddleWidth * i) / PADDLE_ZONE_ANGLES.length)
    }
    return edges
  }

  /** 速度的水平、垂直分量都不能太小，否則球會在縫隙裡幾乎原地來回 */
  /** 連續撞磚太久沒回到球拍：隨機轉 15°～30°，把球從卡住的路徑帶出來 */
  /** 連續撞磚太久沒回到球拍：固定轉一個小角度（不用亂數，結果可預期） */
  private nudgeDirection(): void {
    const speed = Math.hypot(this.ball.dx, this.ball.dy)
    if (speed === 0) return
    const current = Math.atan2(this.ball.dy, this.ball.dx)
    const delta = (NUDGE_ANGLE * Math.PI) / 180
    this.ball.dx = Math.cos(current + delta) * speed
    this.ball.dy = Math.sin(current + delta) * speed
  }

  /** 漏接：沒有生命與 Game Over，只是連擊歸零、球回到球拍重新發球 */
  private onBallLost(): void {
    this.combo = 0
    this.trail = []
    if (this.beginner) this.speedFactor = Math.max(BEGINNER_MIN_SPEED_FACTOR, this.speedFactor * BEGINNER_MISS_SPEED_FACTOR)
    playBeep(120, 0.3, 'sawtooth')
    this.phase = 'ready'
    this.resetBallAndPaddle()
    this.emit()
  }

  // ---------- 主迴圈 ----------

  private readonly frame = (now: number): void => {
    // 以 60fps 為基準做時間補償，避免螢幕更新率不同造成球速差異
    const step = Math.min((now - this.lastFrameAt) / (1000 / 60), 2) || 1
    this.lastFrameAt = now

    this.update(step)
    this.render()

    if (this.phase !== 'won') {
      this.animationId = requestAnimationFrame(this.frame)
    }
  }

  private update(step: number): void {
    if (this.phase === 'won') return

    this.updateEffects(step)

    if (this.wrongPause) {
      if (performance.now() < this.wrongPause.until) return
      this.wrongPause = null
    }

    if (this.paddle.rightPressed && this.paddle.x < CANVAS_WIDTH - this.paddleWidth) {
      this.paddle.x = Math.min(CANVAS_WIDTH - this.paddleWidth, this.paddle.x + PADDLE_KEY_SPEED * step)
    } else if (this.paddle.leftPressed && this.paddle.x > 0) {
      this.paddle.x = Math.max(0, this.paddle.x - PADDLE_KEY_SPEED * step)
    }

    if (this.ballWaiting) {
      this.ball.x = this.paddle.x + this.paddleWidth / 2
      this.ball.y = this.paddleTop() - 2 - BALL_SIZE / 2
      return
    }

    // 新手模式：球往下掉、快到球拍時放慢，留反應時間
    let ballStep = step
    if (this.beginner && this.ball.dy > 0) {
      const distance = this.paddleTop() - this.ball.y
      if (distance > 0 && distance < BEGINNER_SLOWMO_DISTANCE) ballStep *= BEGINNER_SLOWMO_FACTOR
    }
    this.ball.x += this.ball.dx * ballStep
    this.ball.y += this.ball.dy * ballStep

    this.processRefills()
    this.collideBricks()
    this.collideWalls()
  }

  // ---------- 繪圖 ----------

  private render(): void {
    const ctx = this.ctx
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

    ctx.save()
    if (this.shakeFrames > 0 && this.shakeMagnitude > 0) {
      ctx.translate(
        (Math.random() - 0.5) * 2 * this.shakeMagnitude,
        (Math.random() - 0.5) * 2 * this.shakeMagnitude,
      )
    }
    this.drawGrid()
    this.drawBricks()
    this.drawTrail()
    this.drawParticles()
    this.drawFloatingTexts()
    this.drawAimAids()
    this.drawBall()
    this.drawPaddle()
    this.drawTargetLabel()
    ctx.restore()

    if (this.flashAlpha > 0) {
      ctx.fillStyle = `rgba(255, 255, 255, ${this.flashAlpha})`
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
    }

    // 打錯的字義面板畫在震動區塊之外：背景在抖，文字固定不動才看得清楚
    if (this.wrongPause) this.drawWrongOverlay(this.wrongPause.vocab)

    if (this.phase === 'won') {
      this.drawOverlay('STAGE CLEAR!', '請點擊上方 RESET 挑戰下一輪單字')
    } else if (this.ballWaiting) {
      ctx.font = "bold 20px 'VT323', monospace"
      ctx.fillStyle = '#00ffff'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'alphabetic'
      ctx.fillText('PRESS [SPACE] OR [CLICK] TO LAUNCH BALL', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 120)
    }
  }

  private drawGrid(): void {
    const ctx = this.ctx
    ctx.strokeStyle = 'rgba(51, 255, 0, 0.05)'
    ctx.lineWidth = 1
    for (let x = 0; x < CANVAS_WIDTH; x += 24) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, CANVAS_HEIGHT)
      ctx.stroke()
    }
    for (let y = 0; y < CANVAS_HEIGHT; y += 24) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(CANVAS_WIDTH, y)
      ctx.stroke()
    }
  }

  private drawBricks(): void {
    const ctx = this.ctx
    const front = this.frontLineBricks()
    for (const col of this.bricks) {
      for (const b of col) {
        if (!b.alive) continue
        const isOption = front.includes(b)
        const x = b.x + BRICK_INSET
        const y = b.y + BRICK_INSET

        ctx.save()
        ctx.globalAlpha = isOption ? 1 : 0.4
        ctx.fillStyle = GENDER_COLORS[b.vocab.gender] ?? GENDER_COLORS.other
        ctx.fillRect(x, y, BRICK_WIDTH, BRICK_HEIGHT)

        ctx.fillStyle = 'rgba(255, 255, 255, 0.45)'
        ctx.fillRect(x, y, BRICK_WIDTH, 4)
        ctx.fillRect(x, y, 4, BRICK_HEIGHT)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'
        ctx.fillRect(x, y + BRICK_HEIGHT - 4, BRICK_WIDTH, 4)
        ctx.fillRect(x + BRICK_WIDTH - 4, y, 4, BRICK_HEIGHT)

        const label = displayDe(b.vocab.de)
        const fontSize = label.length > 16 ? 13 : 16
        ctx.font = `bold ${fontSize}px 'Courier New', monospace`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillStyle = '#000000'
        ctx.fillText(label, x + BRICK_WIDTH / 2 + 1, y + BRICK_HEIGHT / 2 + 1)
        ctx.fillStyle = '#ffffff'
        ctx.fillText(label, x + BRICK_WIDTH / 2, y + BRICK_HEIGHT / 2)
        ctx.restore()

        if (isOption) {
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 2
          ctx.strokeRect(x + 1, y + 1, BRICK_WIDTH - 2, BRICK_HEIGHT - 2)
        }
      }
    }
  }

  private drawFloatingTexts(): void {
    const ctx = this.ctx
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i]
      ctx.save()
      ctx.globalAlpha = Math.max(0, ft.alpha)
      const size = ft.size ?? 16
      ctx.font = `bold ${size}px 'Microsoft JhengHei', sans-serif`
      ctx.fillStyle = ft.color
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      if (size > 16) {
        ctx.shadowColor = ft.color
        ctx.shadowBlur = 12
        ctx.strokeStyle = '#000'
        ctx.lineWidth = 3
        ctx.strokeText(ft.text, ft.x, ft.y)
      }
      ctx.fillText(ft.text, ft.x, ft.y)
      ctx.restore()
      ft.y -= ft.rise ?? 0.8
      ft.alpha -= size > 16 ? 0.015 : 0.02
      if (ft.alpha <= 0) this.floatingTexts.splice(i, 1)
    }
  }

  private drawBall(): void {
    const ctx = this.ctx
    const level = comboLevel(this.combo)
    ctx.fillStyle = '#ffffff'
    ctx.shadowColor = COMBO_PALETTE[level]
    ctx.shadowBlur = 8 + level * 5
    ctx.beginPath()
    ctx.arc(this.ball.x, this.ball.y, BALL_SIZE / 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0
    // 左上一點高光，讓球更有立體感
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
    ctx.beginPath()
    ctx.arc(this.ball.x - BALL_SIZE * 0.18, this.ball.y - BALL_SIZE * 0.18, BALL_SIZE * 0.14, 0, Math.PI * 2)
    ctx.fill()
  }

  private drawTrail(): void {
    if (this.trail.length === 0) return
    const ctx = this.ctx
    const color = COMBO_PALETTE[comboLevel(this.combo)]
    const n = this.trail.length
    ctx.save()
    for (let i = 0; i < n; i++) {
      const t = (i + 1) / n
      const size = BALL_SIZE * (0.3 + 0.6 * t)
      ctx.globalAlpha = 0.5 * t
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(this.trail[i].x, this.trail[i].y, size / 2, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }

  private drawParticles(): void {
    if (this.particles.length === 0) return
    const ctx = this.ctx
    ctx.save()
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife)
      ctx.fillStyle = p.color
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size)
    }
    ctx.restore()
  }

  private drawPaddle(): void {
    const ctx = this.ctx
    const py = this.paddleTop()
    ctx.fillStyle = '#00ffff'
    ctx.fillRect(this.paddle.x, py, this.paddleWidth, PADDLE_HEIGHT)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(this.paddle.x, py, this.paddleWidth, 3)
    ctx.fillStyle = '#007799'
    ctx.fillRect(this.paddle.x, py + PADDLE_HEIGHT - 3, this.paddleWidth, 3)
    // 分區刻度：讓玩家知道打到哪一區會往哪個方向
    if (!this.beginner) {
      ctx.fillStyle = 'rgba(0, 40, 60, 0.9)'
      for (const x of this.paddleZoneEdges()) ctx.fillRect(Math.round(x) - 1, py + 3, 2, PADDLE_HEIGHT - 6)
    }
  }

  /** 懸賞單字畫在球拍正上方、跟著球拍走：玩家視線只需在球拍與最前排之間 */
  private drawTargetLabel(): void {
    if (!this.target || this.phase === 'won') return
    const ctx = this.ctx
    const cx = this.paddle.x + this.paddleWidth / 2
    const y = this.paddleTop() - BALL_SIZE - 22
    const text = this.target.zh
    ctx.save()
    ctx.font = "bold 22px 'Microsoft JhengHei', 'PingFang TC', sans-serif"
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const w = ctx.measureText(text).width + 28
    const x = Math.max(4, Math.min(CANVAS_WIDTH - w - 4, cx - w / 2))
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)'
    ctx.fillRect(x, y - 16, w, 32)
    ctx.strokeStyle = '#ffff00'
    ctx.lineWidth = 2
    ctx.strokeRect(x, y - 16, w, 32)
    ctx.shadowColor = '#ffff00'
    ctx.shadowBlur = 10
    ctx.fillStyle = '#ffff00'
    ctx.fillText(text, x + w / 2, y + 1)
    ctx.restore()
  }

  // ---------- 瞄準輔助 ----------

  /** 從某點沿方向往前推，碰側牆反彈，直到碰到磚塊格、頂端或回到球拍高度 */
  private predictPath(x: number, y: number, dx: number, dy: number, maxSteps = 400): { points: { x: number; y: number }[]; hit: Brick | null } {
    const half = BALL_SIZE / 2
    const points: { x: number; y: number }[] = [{ x, y }]
    let hit: Brick | null = null
    const mag = Math.hypot(dx, dy)
    if (mag === 0) return { points, hit }
    let vx = (dx / mag) * 6
    let vy = (dy / mag) * 6
    const paddleTop = this.paddleTop()
    for (let i = 0; i < maxSteps; i++) {
      x += vx
      y += vy
      if (x - half < 0) { x = half; vx = Math.abs(vx) }
      if (x + half > CANVAS_WIDTH) { x = CANVAS_WIDTH - half; vx = -Math.abs(vx) }
      if (y - half < 0 || (vy > 0 && y + half >= paddleTop)) { points.push({ x, y }); break }
      for (const col of this.bricks) {
        for (const b of col) {
          if (b.alive && x + half > b.x && x - half < b.x + CELL_WIDTH && y + half > b.y && y - half < b.y + CELL_HEIGHT) hit = b
        }
      }
      points.push({ x, y })
      if (hit) break
    }
    return { points, hit }
  }

  private drawAimAids(): void {
    const ctx = this.ctx
    if (this.phase === 'won') return

    if (this.ballWaiting) {
      // 發球前：畫出預測軌跡，並把會打到的磚塊框起來
      const dir = this.launchDirection()
      const { points, hit } = this.predictPath(this.ball.x, this.ball.y, dir.dx, dir.dy)
      ctx.save()
      ctx.setLineDash([6, 8])
      ctx.strokeStyle = 'rgba(0, 255, 255, 0.45)'
      ctx.lineWidth = 2
      ctx.beginPath()
      points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
      ctx.stroke()
      ctx.setLineDash([])
      if (hit) {
        const isTarget = !!this.target && hit.vocab.de === this.target.de && this.frontLineBricks().includes(hit)
        ctx.strokeStyle = isTarget ? '#ffff00' : 'rgba(0, 255, 255, 0.8)'
        ctx.lineWidth = 3
        ctx.shadowColor = ctx.strokeStyle
        ctx.shadowBlur = 10
        ctx.strokeRect(hit.x + BRICK_INSET - 2, hit.y + BRICK_INSET - 2, BRICK_WIDTH + 4, BRICK_HEIGHT + 4)
      }
      ctx.restore()
      return
    }

    if (this.ball.dy > 0) {
      // 球往下掉：在球拍高度畫出落點標記
      const { points } = this.predictPath(this.ball.x, this.ball.y, this.ball.dx, this.ball.dy)
      const last = points[points.length - 1]
      const py = this.paddleTop()
      if (last.y + BALL_SIZE / 2 >= py - 1) {
        ctx.save()
        ctx.fillStyle = 'rgba(255, 255, 0, 0.9)'
        ctx.beginPath()
        ctx.moveTo(last.x, py - 6)
        ctx.lineTo(last.x - 7, py - 18)
        ctx.lineTo(last.x + 7, py - 18)
        ctx.closePath()
        ctx.fill()
        ctx.strokeStyle = 'rgba(255, 255, 0, 0.25)'
        ctx.setLineDash([4, 6])
        ctx.beginPath()
        ctx.moveTo(last.x, this.ball.y)
        ctx.lineTo(last.x, py - 20)
        ctx.stroke()
        ctx.restore()
      }
    }
  }

  private drawWrongOverlay(vocab: Vocab): void {
    const ctx = this.ctx
    const w = 520
    const h = 150
    const x = (CANVAS_WIDTH - w) / 2
    const y = (CANVAS_HEIGHT - h) / 2
    ctx.save()
    ctx.fillStyle = 'rgba(40, 0, 10, 0.88)'
    ctx.fillRect(x, y, w, h)
    ctx.strokeStyle = '#ff4466'
    ctx.lineWidth = 4
    ctx.strokeRect(x, y, w, h)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.shadowColor = '#ff4466'
    ctx.shadowBlur = 16
    ctx.fillStyle = '#ff4466'
    ctx.font = "bold 40px 'Courier New', monospace"
    ctx.fillText(`✗ ${displayDe(vocab.de)}`, CANVAS_WIDTH / 2, y + 50)
    ctx.shadowBlur = 0
    ctx.fillStyle = '#ffffff'
    ctx.font = "bold 30px 'Microsoft JhengHei', sans-serif"
    ctx.fillText(`= ${vocab.zh}`, CANVAS_WIDTH / 2, y + 105)
    ctx.restore()
  }

  private drawOverlay(text: string, subtext: string): void {
    const ctx = this.ctx
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)'
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.font = "bold 44px 'VT323', monospace"
    ctx.fillStyle = '#ffcc00'
    ctx.fillText(text, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 15)
    ctx.font = "20px 'VT323', monospace"
    ctx.fillStyle = '#33ff00'
    ctx.fillText(subtext, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 25)
  }
}

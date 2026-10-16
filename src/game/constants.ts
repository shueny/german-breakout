import type { Gender } from '../types'

export const CANVAS_WIDTH = 720
export const CANVAS_HEIGHT = 740

export const BRICK_ROWS = 4
export const BRICK_COLS = 4
// 磚塊格子無縫鋪滿整個寬度，碰撞用整格；視覺上磚塊內縮 BRICK_INSET 留邊
export const CELL_WIDTH = CANVAS_WIDTH / BRICK_COLS
export const CELL_HEIGHT = 52
export const GRID_TOP = 32
export const BRICK_INSET = 6
export const BRICK_WIDTH = CELL_WIDTH - BRICK_INSET * 2
export const BRICK_HEIGHT = CELL_HEIGHT - BRICK_INSET * 2

export const BALL_SIZE = 16
export const PADDLE_WIDTH = 116
export const PADDLE_WIDTH_BEGINNER = 150
/** 球拍分 5 區，各區固定反彈角度（度），由左到右 */
export const PADDLE_ZONE_ANGLES = [-50, -25, 0, 25, 50]
/** 發球時按住左右鍵的發球角度（度），沒按就直上 */
export const LAUNCH_SIDE_ANGLE = 25
/** 連續撞磚太久沒回到球拍時的固定微調角度（度） */
export const NUDGE_ANGLE = 12
export const PADDLE_HEIGHT = 14
export const PADDLE_BOTTOM_GAP = 10
export const PADDLE_KEY_SPEED = 6

export const POINTS_TARGET = 30
export const POINTS_WRONG = 0

// 連續答對（COMBO）：每多一連擊加 COMBO_BONUS_STEP 分，加成最多疊到 COMBO_MAX_LEVEL 級
export const COMBO_BONUS_STEP = 20
export const COMBO_MAX_LEVEL = 5

export const REFILL_DELAY_MS = 700
// 打錯時停頓的毫秒數：畫面震動並在中央顯示字義
export const WRONG_PAUSE_MS = 1000

// 防卡球：連續撞磚上限
export const MAX_BRICK_BOUNCES_WITHOUT_PADDLE = 12

// 新手模式：接球黏住、球拍加寬、靠近球拍時慢動作、漏接自動降速
export const BEGINNER_SLOWMO_DISTANCE = 80
export const BEGINNER_SLOWMO_FACTOR = 0.5
export const BEGINNER_MISS_SPEED_FACTOR = 0.85
export const BEGINNER_MIN_SPEED_FACTOR = 0.6
export const BEGINNER_HIT_SPEED_RECOVER = 0.05

export const GENDER_COLORS: Record<Gender, string> = {
  m: '#3399ff',
  f: '#ff4466',
  n: '#33dd66',
  pl: '#cc66ff',
  other: '#ff9900',
}

export interface SpeedLevel {
  slider: number
  value: number
  label: string
}

export const SPEED_LEVELS: SpeedLevel[] = [
  { slider: 1, value: 1.0, label: 'Lv.1 (極慢)' },
  { slider: 1.5, value: 1.3, label: 'Lv.1.5' },
  { slider: 2, value: 1.6, label: 'Lv.2 (慢速)' },
  { slider: 2.5, value: 2.0, label: 'Lv.2.5' },
  { slider: 3, value: 2.4, label: 'Lv.3 (適中)' },
  { slider: 3.5, value: 2.9, label: 'Lv.3.5' },
  { slider: 4, value: 3.4, label: 'Lv.4 (偏快)' },
  { slider: 4.5, value: 3.9, label: 'Lv.4.5' },
  { slider: 5, value: 4.5, label: 'Lv.5 (超快)' },
]

export const DEFAULT_SPEED_SLIDER = 2

export function speedLevelFor(slider: number): SpeedLevel {
  return SPEED_LEVELS.find((s) => s.slider === slider) ?? SPEED_LEVELS[2]
}

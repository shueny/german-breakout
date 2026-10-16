export type Gender = 'm' | 'f' | 'n' | 'pl' | 'other'

export interface Vocab {
  de: string
  zh: string
  gender: Gender
  category: string
}

export type HitKind = 'target' | 'wrong'

export interface HitInfo {
  kind: HitKind
  points: number
  vocab: Vocab
  /** 這次命中後的連擊數；打錯時為中斷前的連擊數 */
  combo: number
}

export type GamePhase = 'loading' | 'ready' | 'playing' | 'won'

export interface GameSnapshot {
  score: number
  left: number
  target: Vocab | null
  phase: GamePhase
  lastHit: HitInfo | null
  combo: number
  bestCombo: number
}

import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import type { Ref } from 'vue'
import { BreakoutEngine } from '../game/engine'
import { DEFAULT_SPEED_SLIDER, speedLevelFor } from '../game/constants'
import { isSfxEnabled, onSpeechStatus, setSfxEnabled, unlockAudio, type SpeechStatus } from '../game/audio'
import type { GameSnapshot, Vocab } from '../types'

const ALL_CATEGORIES = 'all'

function isFormControl(el: Element | null): el is HTMLElement {
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'SELECT' || tag === 'BUTTON' || tag === 'TEXTAREA'
}

/**
 * 把引擎接到 Vue：載入字庫、建立/重置遊戲、同步 HUD 狀態、處理鍵盤與滑鼠。
 */
export function useGame(canvasRef: Ref<HTMLCanvasElement | null>) {
  const vocab = ref<Vocab[]>([])
  const loadError = ref<string | null>(null)
  const category = ref(ALL_CATEGORIES)
  const speedSlider = ref(DEFAULT_SPEED_SLIDER)
  const sfxOn = ref(isSfxEnabled())
  const beginnerOn = ref(false)
  const speechStatus = ref<SpeechStatus>('unknown')
  let unsubscribeSpeech: (() => void) | null = null
  const snapshot = ref<GameSnapshot>({
    score: 0,
    left: 0,
    target: null,
    phase: 'loading',
    lastHit: null,
    combo: 0,
    bestCombo: 0,
  })

  const engine = shallowRef<BreakoutEngine | null>(null)
  let unsubscribe: (() => void) | null = null

  const categories = computed(() => {
    const counts = new Map<string, number>()
    for (const v of vocab.value) counts.set(v.category, (counts.get(v.category) ?? 0) + 1)
    return [...counts.entries()].map(([name, count]) => ({ name, count }))
  })

  const speedLevel = computed(() => speedLevelFor(speedSlider.value))

  function currentPool(): Vocab[] {
    return category.value === ALL_CATEGORIES
      ? vocab.value
      : vocab.value.filter((v) => v.category === category.value)
  }

  function resetGame(): void {
    if (!engine.value || vocab.value.length === 0) return
    engine.value.start(currentPool())
  }

  async function loadVocab(): Promise<void> {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}vocab.json`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      vocab.value = (await res.json()) as Vocab[]
      resetGame()
    } catch (err) {
      console.error('無法讀取 vocab.json:', err)
      loadError.value = '找不到 vocab.json'
    }
  }

  // ---------- 輸入 ----------

  function onKeyDown(e: KeyboardEvent): void {
    const isArrow = e.key === 'ArrowLeft' || e.key === 'ArrowRight'
    const isSpace = e.code === 'Space'
    if (!isArrow && !isSpace) return

    // 焦點若還留在滑桿、下拉選單或按鈕上，方向鍵會改到它們的值（球速、主題），
    // 空白鍵會再按一次按鈕；一律先移走焦點，再當成遊戲操作。
    if (isFormControl(document.activeElement)) document.activeElement.blur()
    e.preventDefault()
    unlockAudio()

    if (e.key === 'ArrowLeft') engine.value?.setPaddleKey('left', true)
    else if (e.key === 'ArrowRight') engine.value?.setPaddleKey('right', true)
    else if (isSpace && !e.repeat) engine.value?.launch()
  }

  function onKeyUp(e: KeyboardEvent): void {
    if (e.key === 'ArrowLeft') engine.value?.setPaddleKey('left', false)
    else if (e.key === 'ArrowRight') engine.value?.setPaddleKey('right', false)
  }

  function onMouseMove(e: MouseEvent): void {
    const canvas = canvasRef.value
    if (!canvas || !engine.value) return
    const rect = canvas.getBoundingClientRect()
    const scale = canvas.width / rect.width
    engine.value.movePaddleTo((e.clientX - rect.left) * scale)
  }

  function onCanvasClick(): void {
    unlockAudio()
    engine.value?.launch()
  }

  function toggleSfx(): void {
    sfxOn.value = !sfxOn.value
    setSfxEnabled(sfxOn.value)
  }

  function toggleBeginner(): void {
    beginnerOn.value = !beginnerOn.value
    engine.value?.setBeginnerMode(beginnerOn.value)
  }

  // ---------- 生命週期 ----------

  onMounted(() => {
    const canvas = canvasRef.value
    if (!canvas) return
    const game = new BreakoutEngine(canvas)
    engine.value = game
    if (import.meta.env.DEV) {
      // 開發模式下方便在 console 檢查引擎狀態
      ;(window as unknown as { __game?: BreakoutEngine }).__game = game
    }
    unsubscribe = game.subscribe((snap) => {
      snapshot.value = snap
    })
    game.setBaseSpeed(speedLevel.value.value)

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('mousemove', onMouseMove)
    unsubscribeSpeech = onSpeechStatus((s) => {
      speechStatus.value = s
    })
    void loadVocab()
  })

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('mousemove', onMouseMove)
    unsubscribe?.()
    unsubscribeSpeech?.()
    engine.value?.destroy()
    engine.value = null
  })

  watch(speedLevel, (level) => engine.value?.setBaseSpeed(level.value))
  watch(category, resetGame)

  return {
    snapshot,
    loadError,
    category,
    categories,
    vocabCount: computed(() => vocab.value.length),
    speedSlider,
    speedLevel,
    sfxOn,
    beginnerOn,
    speechStatus,
    resetGame,
    toggleSfx,
    toggleBeginner,
    onCanvasClick,
  }
}

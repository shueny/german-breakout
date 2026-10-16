import { speakableDe } from './text'

let audioCtx: AudioContext | null = null
let sfxEnabled = true

function getCtx(): AudioContext | null {
  if (audioCtx) return audioCtx
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  audioCtx = new Ctor()
  return audioCtx
}

export function setSfxEnabled(enabled: boolean): void {
  sfxEnabled = enabled
}

export function isSfxEnabled(): boolean {
  return sfxEnabled
}

export function playBeep(freq: number, duration: number, type: OscillatorType = 'square'): void {
  if (!sfxEnabled) return
  try {
    const ctx = getCtx()
    if (!ctx) return
    if (ctx.state === 'suspended') void ctx.resume()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, ctx.currentTime)
    gain.gain.setValueAtTime(0.06, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + duration)
  } catch {
    /* audio is best-effort */
  }
}

export function playStageClear(): void {
  playBeep(523, 0.1)
  setTimeout(() => playBeep(659, 0.1), 100)
  setTimeout(() => playBeep(784, 0.25), 200)
}

// ---------- 德語發音 ----------

const SPEAK_REPEAT_GAP_MS = 1500
const SPEAK_START_TIMEOUT_MS = 600
let germanVoice: SpeechSynthesisVoice | null = null
let lastSpokenText = ''
let lastSpokenAt = 0
let speakTimer: number | undefined
let watchdogTimer: number | undefined

function pickGermanVoice(): void {
  if (!('speechSynthesis' in window)) return
  const voices = window.speechSynthesis.getVoices()
  germanVoice =
    voices.find((v) => v.lang === 'de-DE' && v.localService) ??
    voices.find((v) => v.lang.toLowerCase().startsWith('de')) ??
    null
}

if ('speechSynthesis' in window) {
  pickGermanVoice()
  window.speechSynthesis.addEventListener('voiceschanged', pickGermanVoice)
}

function makeUtterance(text: string): SpeechSynthesisUtterance {
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'de-DE'
  utterance.rate = 0.9
  if (germanVoice) utterance.voice = germanVoice
  return utterance
}

const SPEAK_DONE_FALLBACK_MS = 1500

/** 語音引擎是否真的會出聲：unknown → 第一次 start 事件就是 ok；重試後仍沒開始就是 broken */
export type SpeechStatus = 'unknown' | 'ok' | 'broken'
let speechStatus: SpeechStatus = 'unknown'
const statusListeners = new Set<(s: SpeechStatus) => void>()

function setSpeechStatus(s: SpeechStatus): void {
  if (speechStatus === s) return
  speechStatus = s
  statusListeners.forEach((l) => l(s))
}

export function getSpeechStatus(): SpeechStatus {
  return speechStatus
}

export function onSpeechStatus(listener: (s: SpeechStatus) => void): () => void {
  statusListeners.add(listener)
  listener(speechStatus)
  return () => statusListeners.delete(listener)
}

/** 真正送出發音，並監看有沒有開始播；卡住就重置引擎重試一次。onDone 在唸完（或失敗／逾時）時呼叫一次 */
function dispatch(text: string, retry: boolean, onDone?: () => void): void {
  const synth = window.speechSynthesis
  const utterance = makeUtterance(text)
  let started = false
  let finished = false
  const finish = (): void => {
    if (finished) return
    finished = true
    window.clearTimeout(doneTimer)
    onDone?.()
  }
  const doneTimer = window.setTimeout(finish, SPEAK_DONE_FALLBACK_MS)

  utterance.addEventListener('start', () => {
    started = true
    setSpeechStatus('ok')
    window.clearTimeout(watchdogTimer)
  })
  utterance.addEventListener('end', finish)
  utterance.addEventListener('error', (e) => {
    // 被下一句取消時不算唸完，由下一句接手；其他錯誤直接收尾
    if (e.error !== 'canceled' && e.error !== 'interrupted') finish()
  })
  synth.speak(utterance)

  window.clearTimeout(watchdogTimer)
  watchdogTimer = window.setTimeout(() => {
    if (started) return
    if (!retry) {
      // 重試過仍沒開始播：這個瀏覽器的語音引擎不會出聲，別再讓音效等它
      setSpeechStatus('broken')
      finish()
      return
    }
    // Chrome 偶爾會讓語音引擎卡在 speaking 卻不播：取消、resume 後再送一次
    window.clearTimeout(doneTimer)
    finished = true
    synth.cancel()
    synth.resume()
    speakTimer = window.setTimeout(() => dispatch(text, false, onDone), 80)
  }, SPEAK_START_TIMEOUT_MS)
}

/**
 * 唸出德文單字。
 * - priority=false（單純反彈）：語音正在播就略過，不打斷
 * - priority=true（答對 / 打錯）：打斷目前的，稍後再送出，避免 cancel 後立刻 speak 被 Chrome 丟掉
 * 同一個字短時間內不重複唸。
 */
export function speakGerman(text: string, priority = true, onDone?: () => void): void {
  if (!('speechSynthesis' in window)) {
    onDone?.()
    return
  }
  const synth = window.speechSynthesis
  const cleanText = speakableDe(text)
  if (!cleanText) {
    onDone?.()
    return
  }

  const now = performance.now()
  if (cleanText === lastSpokenText && now - lastSpokenAt < SPEAK_REPEAT_GAP_MS) {
    onDone?.()
    return
  }

  const busy = synth.speaking || synth.pending
  if (busy && !priority) {
    onDone?.()
    return
  }

  lastSpokenText = cleanText
  lastSpokenAt = now
  window.clearTimeout(speakTimer)
  window.clearTimeout(watchdogTimer)

  // 已知語音不會出聲：音效不等了，但仍嘗試發音，萬一引擎恢復就會自動變回 ok
  let done = onDone
  if (speechStatus === 'broken') {
    onDone?.()
    done = undefined
  }

  if (busy) {
    synth.cancel()
    synth.resume()
    speakTimer = window.setTimeout(() => dispatch(cleanText, true, done), 80)
  } else {
    synth.resume()
    dispatch(cleanText, true, done)
  }
}

/** 在第一次使用者互動時呼叫：啟動 AudioContext、讓語音引擎離開 paused 狀態 */
export function unlockAudio(): void {
  const ctx = getCtx()
  if (ctx && ctx.state === 'suspended') void ctx.resume()
  if ('speechSynthesis' in window) {
    pickGermanVoice()
    window.speechSynthesis.resume()
  }
}

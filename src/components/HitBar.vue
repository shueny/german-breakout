<script setup lang="ts">
import { computed } from 'vue'
import type { HitInfo } from '../types'
import { displayDe } from '../game/text'
import { COMBO_MAX_LEVEL } from '../game/constants'

const props = defineProps<{ lastHit: HitInfo | null; score: number; combo: number; loadError?: string | null }>()

const pad = (n: number) => String(n).padStart(3, '0')
const comboLevel = computed(() => Math.min(props.combo, COMBO_MAX_LEVEL))
</script>

<template>
  <div class="hit-bar">
    <span class="message">
      <template v-if="loadError"><b class="red">ERROR: {{ loadError }}</b></template>
      <template v-else-if="!lastHit"></template>
      <template v-else-if="lastHit.kind === 'target'">
        🎯 <b class="gold">+{{ lastHit.points }}</b>
        <b v-if="lastHit.combo >= 2" class="combo-tag">🔥x{{ lastHit.combo }}</b>
        <b>{{ displayDe(lastHit.vocab.de) }}</b> ＝ {{ lastHit.vocab.zh }}
      </template>
      <template v-else>
        ✗ <b class="red">打錯</b>
        <b v-if="lastHit.combo >= 2" class="red">(x{{ lastHit.combo }} 中斷)</b>
        <b>{{ displayDe(lastHit.vocab.de) }}</b> ＝ <span class="cyan">{{ lastHit.vocab.zh }}</span>
      </template>
    </span>
    <span class="score">SCORE:<b>{{ pad(score) }}</b></span>
    <span class="combo" :class="[`lv${comboLevel}`, { active: combo >= 2 }]" :key="combo">
      COMBO<b>x{{ combo }}</b>
    </span>
  </div>
</template>

<style scoped>
.hit-bar {
  width: 720px;
  height: 36px;
  background: #0d0d14;
  border: 1px solid #333;
  margin-bottom: 10px;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  column-gap: 16px;
  color: #33ff00;
  letter-spacing: 1px;
  white-space: nowrap;
  padding: 0 12px;
}
.score {
  font-size: 24px;
  line-height: 26px;
  color: #00ffff;
  text-shadow: 0 0 8px rgba(0, 255, 255, 0.7);
}
.message {
  font-size: 15px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 5px;
  min-width: 0;
  overflow: hidden;
}
.gold { color: #ffff00; }
.cyan { color: #00ffff; }
.red { color: #ff6666; }
.combo-tag { color: #ff9900; }

.combo {
  justify-self: start;
  font-size: 18px;
  color: #555;
  text-shadow: none;
  transition: color 0.2s;
  transform-origin: left center;
}
.combo.active { animation: combo-pop 0.35s ease-out; }
.combo.lv1 { color: #33ff00; text-shadow: 0 0 6px #33ff00; }
.combo.lv2 { color: #ffff00; text-shadow: 0 0 8px #ffff00; }
.combo.lv3 { color: #ff9900; text-shadow: 0 0 10px #ff9900; }
.combo.lv4 { color: #ff4466; text-shadow: 0 0 12px #ff4466; }
.combo.lv5 {
  color: #ff00ff;
  text-shadow: 0 0 14px #ff00ff, 0 0 24px #ff00ff;
  animation: combo-pop 0.35s ease-out, combo-pulse 0.6s ease-in-out infinite alternate;
}
@keyframes combo-pop { 0% { transform: scale(1.6); } 100% { transform: scale(1); } }
@keyframes combo-pulse { from { filter: brightness(1); } to { filter: brightness(1.6); } }
</style>

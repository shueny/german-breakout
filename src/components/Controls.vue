<script setup lang="ts">
import { ref } from 'vue'
import { GENDER_COLORS, type SpeedLevel } from '../game/constants'

defineProps<{
  speedSlider: number
  speedLevel: SpeedLevel
  sfxOn: boolean
  beginnerOn: boolean
  category: string
  categories: { name: string; count: number }[]
  vocabCount: number
}>()

const emit = defineEmits<{
  'update:speedSlider': [value: number]
  'update:category': [value: string]
  toggleSfx: []
  toggleBeginner: []
  reset: []
}>()

const legend = [
  { color: GENDER_COLORS.m, label: 'der', desc: '陽性名詞' },
  { color: GENDER_COLORS.f, label: 'die', desc: '陰性名詞' },
  { color: GENDER_COLORS.n, label: 'das', desc: '中性名詞' },
  { color: GENDER_COLORS.pl, label: 'die', desc: '複數名詞' },
  { color: GENDER_COLORS.other, label: '其他', desc: '動詞、形容詞、副詞…' },
]

const legendOpen = ref(false)

function blur(e: Event): void {
  ;(e.currentTarget as HTMLElement).blur()
}

function onSpeedInput(e: Event): void {
  emit('update:speedSlider', Number((e.target as HTMLInputElement).value))
}

function onCategoryChange(e: Event): void {
  const select = e.target as HTMLSelectElement
  emit('update:category', select.value)
  select.blur()
}
</script>

<template>
  <div class="controls">
    <div class="group">
      <label for="speed-slider">球速</label>
      <input
        id="speed-slider"
        type="range"
        min="1"
        max="5"
        step="0.5"
        :value="speedSlider"
        @input="onSpeedInput"
        @change="blur"
      />
      <span class="speed-label">{{ speedLevel.label }}</span>
      <button type="button" class="small" @click="blur($event); emit('toggleSfx')">{{ sfxOn ? '🔊' : '🔇' }}</button>
      <button
        type="button"
        class="small beginner-btn"
        :class="{ on: beginnerOn }"
        title="接球後再發射、球拍加寬、靠近球拍慢動作、漏接自動降速"
        @click="blur($event); emit('toggleBeginner')"
      >
        {{ beginnerOn ? '🐣 新手：開' : '🐣 新手' }}
      </button>
    </div>

    <div class="group">
      <select :value="category" @change="onCategoryChange">
        <option value="all">全部主題 ({{ vocabCount }})</option>
        <option v-for="c in categories" :key="c.name" :value="c.name">{{ c.name }} ({{ c.count }})</option>
      </select>
      <button type="button" class="small" @click="blur($event); emit('reset')">RESET</button>

      <div class="legend-wrap">
        <button
          type="button"
          class="small legend-btn"
          :class="{ on: legendOpen }"
          title="磚塊顏色說明"
          @click="blur($event); legendOpen = !legendOpen"
        >
          🎨 顏色
        </button>
        <div v-if="legendOpen" class="legend-pop">
          <div class="legend-title">磚塊顏色＝詞性</div>
          <div v-for="item in legend" :key="item.label + item.desc" class="legend-row">
            <span class="chip" :style="{ background: item.color }">{{ item.label }}</span>
            <span>{{ item.desc }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.controls {
  width: 720px;
  margin-top: 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  white-space: nowrap;
  font-size: 14px;
  color: #aaa;
  background: #000;
  padding: 8px 12px;
  border: 2px solid #333;
}

.group {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #ff66aa;
  font-weight: bold;
}

.speed-label {
  min-width: 68px;
}

/* 控制列所有按鈕與下拉選單同高、內容垂直置中，不受 emoji 或中文字型行高影響 */
.controls button,
.controls select {
  box-sizing: border-box;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  padding: 0 8px;
  font-size: 12px;
  white-space: nowrap;
  vertical-align: middle;
}

.beginner-btn {
  min-width: 86px;
}

select {
  max-width: 150px;
  padding: 0 22px 0 8px;
  text-overflow: ellipsis;
  -webkit-appearance: none;
  appearance: none;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6'><path d='M0 0h10L5 6z' fill='%2333ff00'/></svg>");
  background-repeat: no-repeat;
  background-position: right 7px center;
}

select:hover {
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6'><path d='M0 0h10L5 6z' fill='%23000'/></svg>");
}

.beginner-btn.on,
.legend-btn.on {
  background: #ffcc00;
  color: #000;
  border-color: #ffcc00;
  box-shadow: 0 0 10px rgba(255, 204, 0, 0.7);
}

input[type='range'] {
  -webkit-appearance: none;
  appearance: none;
  width: 90px;
  height: 8px;
  background: #222;
  border: 1px solid #ff66aa;
  outline: none;
  cursor: pointer;
}

input[type='range']::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 18px;
  background: #ff66aa;
  cursor: pointer;
  border: 2px solid #fff;
}

.legend-wrap {
  position: relative;
}

.legend-pop {
  position: absolute;
  right: 0;
  bottom: calc(100% + 8px);
  background: #0d0d14;
  border: 2px solid #33ff00;
  box-shadow: 0 0 14px rgba(51, 255, 0, 0.35);
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: #ddd;
  font-weight: normal;
  z-index: 20;
}

.legend-title {
  color: #33ff00;
  font-weight: bold;
  margin-bottom: 2px;
}

.legend-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.chip {
  display: inline-block;
  min-width: 36px;
  text-align: center;
  padding: 2px 6px;
  font-size: 12px;
  color: #000;
  font-weight: bold;
  border-top: 2px solid rgba(255, 255, 255, 0.7);
  border-left: 2px solid rgba(255, 255, 255, 0.7);
  border-right: 2px solid rgba(0, 0, 0, 0.6);
  border-bottom: 2px solid rgba(0, 0, 0, 0.6);
}
</style>

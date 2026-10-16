<script setup lang="ts">
import { computed, ref } from 'vue'
import HitBar from './components/HitBar.vue'
import GameCanvas from './components/GameCanvas.vue'
import Controls from './components/Controls.vue'
import { useGame } from './composables/useGame'

const canvasComp = ref<InstanceType<typeof GameCanvas> | null>(null)
const canvasRef = computed(() => canvasComp.value?.canvasRef ?? null)

const game = useGame(canvasRef)
</script>

<template>
  <div class="arcade-cabinet">
    <h1>★ RETRO DEUTSCH A1 BREAKOUT ★</h1>

    <HitBar
      :last-hit="game.snapshot.value.lastHit"
      :score="game.snapshot.value.score"
      :combo="game.snapshot.value.combo"
      :load-error="game.loadError.value"
    />

    <GameCanvas ref="canvasComp" @click="game.onCanvasClick" />

    <Controls
      v-model:speed-slider="game.speedSlider.value"
      v-model:category="game.category.value"
      :speed-level="game.speedLevel.value"
      :sfx-on="game.sfxOn.value"
      :beginner-on="game.beginnerOn.value"
      :categories="game.categories.value"
      :vocab-count="game.vocabCount.value"
      @toggle-sfx="game.toggleSfx"
      @toggle-beginner="game.toggleBeginner"
      @reset="game.resetGame"
    />

    <div v-if="game.speechStatus.value === 'broken'" class="speech-warning">
      🔇 這個瀏覽器的語音引擎沒有出聲，聽不到德語發音。請用 Chrome 或 Safari 開啟
      <code>http://localhost:5173</code>，音效會照常播放。
    </div>
  </div>
</template>

<style scoped>
.arcade-cabinet {
  background: #14141d;
  border: 4px solid #33ff00;
  box-shadow: 0 0 20px rgba(51, 255, 0, 0.25), inset 0 0 25px rgba(0, 0, 0, 0.9);
  padding: 18px;
  border-radius: 10px;
  position: relative;
}

.speech-warning {
  width: 720px;
  margin-top: 10px;
  padding: 8px 12px;
  border: 2px dashed #ff9900;
  color: #ffcc66;
  background: #1a1200;
  font-size: 14px;
  line-height: 1.5;
}

.speech-warning code {
  color: #fff;
}

h1 {
  margin: 0 0 10px 0;
  font-size: 32px;
  text-align: center;
  color: #ffcc00;
  text-shadow: 3px 3px 0 #cc0055, 0 0 10px rgba(255, 204, 0, 0.6);
  letter-spacing: 3px;
}
</style>

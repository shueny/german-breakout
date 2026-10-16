<script setup lang="ts">
import { ref } from 'vue'
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../game/constants'

const emit = defineEmits<{ click: [] }>()
const canvasRef = ref<HTMLCanvasElement | null>(null)

defineExpose({ canvasRef })
</script>

<template>
  <canvas ref="canvasRef" :width="CANVAS_WIDTH" :height="CANVAS_HEIGHT" @click="emit('click')" />
</template>

<style scoped>
canvas {
  background-color: #050508;
  border: 3px solid #444;
  display: block;
  cursor: crosshair;
}
</style>

/** 磚塊與提示列顯示用：多形式的字（例如「ihr / ihm / ihn」）改用「 · 」分隔，不出現斜線 */
export function displayDe(de: string): string {
  return de.replace(/\s*\/\s*/g, ' · ')
}

/** 發音用：去掉括號註記，斜線改成逗號停頓 */
export function speakableDe(de: string): string {
  return de
    .replace(/\s*\(.*?\)\s*/g, ' ')
    .replace(/\s*\/\s*/g, ', ')
    .trim()
}

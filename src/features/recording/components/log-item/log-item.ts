export function createLogChunk(text: string): HTMLParagraphElement {
  const p = document.createElement("p");
  p.className = "log-chunk";
  p.textContent = text;
  return p;
}

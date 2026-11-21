import type { Attachment } from 'svelte/attachments';

export function pixels(
  art: HTMLCanvasElement,
  scale: number,
  vars: Record<string, string> = {}
): Attachment<HTMLElement> {
  return (box) => {
    art.style.display = 'block';
    art.style.imageRendering = 'pixelated';
    art.style.width = `${art.width * scale}px`;
    art.style.height = `${art.height * scale}px`;
    for (const [name, value] of Object.entries(vars)) art.style.setProperty(name, value);
    box.replaceChildren(art);
  };
}

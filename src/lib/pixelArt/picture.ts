import type { Attachment } from 'svelte/attachments';

export interface Art {
  url: string;
  w: number;
  h: number;
}

export const toArt = (c: HTMLCanvasElement): Art => ({
  url: c.toDataURL(),
  w: c.width,
  h: c.height
});

export function artImage(art: Art, cls = ''): HTMLImageElement {
  const img = new Image(art.w, art.h);
  img.src = art.url;
  img.alt = '';
  img.draggable = false;
  img.className = cls;
  img.style.display = 'block';
  img.style.imageRendering = 'pixelated';
  return img;
}

export function picture(art: Art): Attachment<HTMLElement> {
  return (box) => {
    box.replaceChildren(artImage(art));
  };
}

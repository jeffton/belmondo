type UIElements = {
  game: HTMLCanvasElement;
  map: HTMLCanvasElement;
  quality: HTMLInputElement;
  folder: HTMLInputElement;
  files: HTMLInputElement;
  volume: HTMLInputElement;
  "effects-volume": HTMLInputElement;
  concept: HTMLImageElement;
  "pause-panel": HTMLDialogElement;
  "help-dialog": HTMLDialogElement;
  "music-dialog": HTMLDialogElement;
  "art-dialog": HTMLDialogElement;
  start: HTMLButtonElement;
  again: HTMLButtonElement;
  restart: HTMLButtonElement;
  weapon: HTMLButtonElement;
  "touch-fire": HTMLButtonElement;
  tracks: HTMLElement & { children: HTMLCollectionOf<HTMLButtonElement> };
  crafts: HTMLElement & { children: HTMLCollectionOf<HTMLButtonElement> };
};
// The IDs and element kinds are fixed by index.html.
export function $<K extends keyof UIElements>(id: K): UIElements[K];
export function $(id: string): HTMLElement;
export function $(id: string) {
  return document.getElementById(id)!;
}

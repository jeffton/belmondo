import { $ } from "./app-elements.ts";
import type { AudioEngine } from "./audio.ts";
import { MusicPlayer } from "./music.ts";
import { soundtrack } from "./soundtrack.ts";

type MusicDialogHooks = {
  cancelStart: () => void;
  pauseRace: () => void;
  openMusicDialog: () => void;
};

export function createSoundtrack(sound: AudioEngine, isInMenu: () => boolean) {
  function renderMusicStatus(playback: string, track: string, count: string) {
    $("music-playback").textContent = playback;
    $("music-track").textContent = track;
    $("music-count").textContent = count;
  }
  const music = new MusicPlayer((state) => {
    renderMusicStatus(
      state.error ? "FILE ERROR" : state.playing ? "PLAYING" : "PAUSED",
      state.error || state.name || "NO LOCAL TRACKS LOADED",
      state.error || !state.count
        ? ""
        : `${state.count} ${state.count === 1 ? "TRACK" : "TRACKS"}`,
    );
  });
  music.volume = 0.65;
  music.setMenu(true);
  music.loadTracks(soundtrack, { shuffle: true });
  let musicEnabled = true;
  let musicInterrupted = false;
  function startMenuMusic(event?: Event) {
    if (
      (event ? !event.isTrusted : !navigator.userActivation.isActive) ||
      !isInMenu() ||
      !musicEnabled ||
      !music.audio.paused ||
      document.hidden ||
      !document.hasFocus()
    )
      return;
    if (
      event?.type === "keydown" &&
      ![
        "Enter",
        " ",
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "Backspace",
        "Escape",
        "Tab",
      ].includes((event as KeyboardEvent).key)
    )
      return;
    if (
      event?.type === "click" &&
      !(event.target as Element).closest("button, input, label")
    )
      return;
    music.play();
  }
  function updateFocus(inactive: boolean) {
    if (inactive) {
      if (!music.audio.paused) {
        musicInterrupted = true;
        music.pause();
      }
    } else if (musicInterrupted) {
      musicInterrupted = false;
      if (musicEnabled) music.play();
    }
  }

  function mountMenuGestures() {
    $("menu").addEventListener("click", startMenuMusic, { capture: true });
    // MenuNavigation owns a virtual cursor; keyboard focus usually remains on body.
    // Capture before navigation can change the menu stage or start a race.
    window.addEventListener("keydown", startMenuMusic, { capture: true });
    // Safari grants its audio gesture while exposing a controller to the page.
    // Resume/play must run inside this native event, not a later animation frame.
    window.addEventListener("gamepadconnected", startMenuMusic);
  }

  function mountMusicDialog({
    cancelStart,
    pauseRace,
    openMusicDialog,
  }: MusicDialogHooks) {
    async function loadFiles(files: FileList | File[]) {
      await music.loadFiles(files);
      if (files.length) {
        musicEnabled = true;
        musicInterrupted = false;
        await music.play();
      }
    }
    for (const [button, input] of [
      ["music-folder", "folder"],
      ["music-files", "files"],
    ] as const) {
      const picker = $(input);
      $(button).onclick = () => picker.click();
      // Only the visible command bubbles to the menu's feedback handler.
      picker.onclick = (event) => event.stopPropagation();
      picker.onchange = () => loadFiles(picker.files!);
    }
    $("music-play").onclick = () => {
      musicEnabled = music.audio.paused;
      musicInterrupted = false;
      if (musicEnabled) music.play();
      else music.pause();
    };
    $("music-next").onclick = () => {
      musicEnabled = true;
      musicInterrupted = false;
      music.next();
    };
    $("music-default").onclick = () => {
      music.loadTracks(soundtrack, { shuffle: true });
      musicEnabled = true;
      musicInterrupted = false;
      music.play();
    };
    for (const [id, applyVolume] of [
      ["volume", (value) => (music.volume = value)],
      ["effects-volume", (value) => sound.setVolume(value)],
    ] satisfies ["volume" | "effects-volume", (value: number) => void][]) {
      const slider = $(id);
      const saved = localStorage.getItem(`nv-${id}`);
      if (saved !== null) slider.value = saved;
      function updateVolume() {
        const value = Number(slider.value);
        applyVolume(value);
        $(`${id}-level`).textContent = `${Math.round(value * 100)}%`;
        slider.style.setProperty("--sound-level", `${value * 100}%`);
      }
      updateVolume();
      slider.oninput = () => {
        updateVolume();
        localStorage.setItem(`nv-${id}`, slider.value);
      };
    }
    let dragDepth = 0;
    window.addEventListener("dragenter", (e) => {
      if (e.dataTransfer!.types.includes("Files")) {
        e.preventDefault();
        dragDepth++;
        $("drop-zone").hidden = false;
      }
    });
    window.addEventListener("dragover", (e) => {
      if (e.dataTransfer!.types.includes("Files")) e.preventDefault();
    });
    window.addEventListener("dragleave", (e) => {
      e.preventDefault();
      dragDepth--;
      if (dragDepth <= 0) $("drop-zone").hidden = true;
    });
    async function readEntry(entry: FileSystemEntry): Promise<File[]> {
      if (entry.isFile)
        return new Promise<File[]>((resolve, reject) =>
          (entry as FileSystemFileEntry).file(
            (file) => resolve([file]),
            reject,
          ),
        );
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      let files: File[] = [];
      while (true) {
        const entries = await new Promise<FileSystemEntry[]>(
          (resolve, reject) => reader.readEntries(resolve, reject),
        );
        if (!entries.length) break;
        for (const child of entries) files.push(...(await readEntry(child)));
      }
      return files;
    }
    window.addEventListener("drop", async (e) => {
      e.preventDefault();
      dragDepth = 0;
      $("drop-zone").hidden = true;
      cancelStart();
      pauseRace();
      try {
        const entries = [...e.dataTransfer!.items]
          .map((i) => i.webkitGetAsEntry?.())
          .filter((entry): entry is FileSystemEntry => Boolean(entry));
        const files = entries.length
          ? (await Promise.all(entries.map(readEntry))).flat()
          : [...e.dataTransfer!.files];
        await loadFiles(files);
      } catch (error) {
        renderMusicStatus("FILE ERROR", (error as Error).message, "");
      } finally {
        pauseRace();
        openMusicDialog();
      }
    });
  }

  return {
    music,
    get enabled() {
      return musicEnabled;
    },
    startMenuMusic,
    updateFocus,
    mountMenuGestures,
    mountMusicDialog,
  };
}

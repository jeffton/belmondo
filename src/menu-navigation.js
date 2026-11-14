const SELECTORS = [
  "button:not(:disabled)",
  'a[href]:not([aria-disabled="true"])',
  "label:has(input:not(:disabled))",
  "select:not(:disabled)",
  'input:not([type="hidden"]):not(:disabled)',
];

function isVisible(element) {
  return !element.closest("[hidden]") && element.getClientRects().length > 0;
}

function itemForInput(element) {
  return element.matches("input")
    ? element.closest("label") || element
    : element;
}

export class MenuNavigation {
  constructor({ document, root, onEscape, onInput, onActivate }) {
    this.document = document;
    this.root = root;
    this.onEscape = onEscape;
    this.onInput = onInput;
    this.onActivate = onActivate;
    this.cursor = null;
    this.repeatAt = 0;
    this.padDirection = "";
    this.activeRoot = null;
    this.padA = false;
    this.padB = false;
    this.padStart = false;
    document.addEventListener("pointerdown", (event) => {
      const item = this.items().find((element) =>
        element.contains(event.target),
      );
      if (!item) return;
      this.cursor = item;
      this.sync();
    });
  }

  items() {
    const root = this.root();
    if (!root) return [];
    return [
      ...new Set(
        SELECTORS.flatMap((selector) => [
          ...root.querySelectorAll(selector),
        ]).map(itemForInput),
      ),
    ].filter(
      (element) =>
        isVisible(element) &&
        !element.matches(":disabled") &&
        !(root.id === "menu" && element.closest(".setup-navigation")),
    );
  }

  sync() {
    const items = this.items();
    if (!items.includes(this.cursor)) {
      this.cursor =
        items.find(
          (element) =>
            element.classList.contains("active") ||
            element.getAttribute("aria-pressed") === "true" ||
            element.querySelector("input:checked"),
        ) ||
        items[0] ||
        null;
    }
    for (const element of this.document.querySelectorAll(".menu-cursor"))
      element.classList.remove("menu-cursor");
    this.cursor?.classList.add("menu-cursor");
  }

  move(direction, now = performance.now(), repeated = false) {
    this.sync();
    if (!this.cursor) return;
    if (repeated && now < this.repeatAt) return;
    this.repeatAt = now + (repeated ? 130 : 280);

    const input = this.cursor.matches("label")
      ? this.cursor.querySelector("input")
      : this.cursor.matches("input")
        ? this.cursor
        : null;
    if (
      input?.type === "checkbox" &&
      (direction === "left" || direction === "right")
    ) {
      if (input.checked !== (direction === "right")) {
        input.click();
        return;
      }
    }
    if (
      input?.type === "range" &&
      (direction === "left" || direction === "right")
    ) {
      const step = Number.parseFloat(input.step) || 0.01;
      const min = Number(input.min);
      const max = Number(input.max);
      const next = Math.max(
        min,
        Math.min(
          max,
          Number(input.value) + (direction === "right" ? step : -step),
        ),
      );
      input.value = String(Number(next.toFixed(4)));
      input.dispatchEvent(
        new this.document.defaultView.Event("input", { bubbles: true }),
      );
      return;
    }
    const bounds = this.cursor.getBoundingClientRect();
    const cx = bounds.left + bounds.width / 2;
    const cy = bounds.top + bounds.height / 2;
    const horizontal = direction === "left" || direction === "right";
    const candidates = this.items()
      .filter((element) => element !== this.cursor)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const dx = rect.left + rect.width / 2 - cx;
        const dy = rect.top + rect.height / 2 - cy;
        const main =
          direction === "left"
            ? -dx
            : direction === "right"
              ? dx
              : direction === "up"
                ? -dy
                : dy;
        const cross = horizontal ? Math.abs(dy) : Math.abs(dx);
        const overlap = horizontal
          ? Math.min(bounds.bottom, rect.bottom) -
            Math.max(bounds.top, rect.top)
          : Math.min(bounds.right, rect.right) -
            Math.max(bounds.left, rect.left);
        return { element, main, cross, overlap, score: main + cross * 1.5 };
      })
      .filter(
        ({ main, cross, overlap }) =>
          main > 1 && (overlap > 1 || main >= cross),
      );
    // Prefer the same visual row/column. At an edge, stay put rather than
    // wrapping across the screen in the opposite direction.
    const aligned = candidates.filter(({ overlap }) => overlap > 1);
    const next = (aligned.length ? aligned : candidates).sort(
      (a, b) => a.score - b.score,
    )[0]?.element;
    if (next) {
      const nextInput = next.matches("label")
        ? next.querySelector("input")
        : next;
      if (
        next.matches("#tracks .choice, #crafts .choice") ||
        nextInput?.type === "radio"
      )
        nextInput.click();
      this.cursor = next;
    }
    this.sync();
  }

  activate() {
    this.sync();
    if (!this.cursor) return;
    if (this.onActivate?.(this.cursor)) {
      this.sync();
      return;
    }
    const target = this.cursor.matches("label")
      ? this.cursor.querySelector("input") || this.cursor
      : this.cursor;
    if (target.type === "range") return;
    target.click();
    this.sync();
  }

  keydown(event) {
    const root = this.root();
    if (!root) return false;
    const directions = {
      ArrowLeft: "left",
      ArrowRight: "right",
      ArrowUp: "up",
      ArrowDown: "down",
    };
    if (directions[event.key]) {
      event.preventDefault();
      this.onInput("keyboard");
      this.move(directions[event.key], performance.now(), event.repeat);
      return true;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!event.repeat) {
        this.onInput("keyboard");
        this.activate();
      }
      return true;
    }
    if (event.key === "Escape" || event.key === "Backspace") {
      event.preventDefault();
      if (!event.repeat) {
        this.onInput("keyboard");
        this.onEscape();
      }
      return true;
    }
    return false;
  }

  gamepad(pad, now = performance.now()) {
    this.lastAction = null;
    const root = this.root();
    if (!root || !pad) {
      this.padDirection = "";
      this.activeRoot = null;
      this.padA = this.padB = this.padStart = false;
      return false;
    }
    const x = Math.abs(pad.axes?.[0] || 0) > 0.45 ? pad.axes[0] : 0;
    const y = Math.abs(pad.axes?.[1] || 0) > 0.45 ? pad.axes[1] : 0;
    const direction =
      pad.buttons?.[14]?.pressed || x < 0
        ? "left"
        : pad.buttons?.[15]?.pressed || x > 0
          ? "right"
          : pad.buttons?.[12]?.pressed || y < 0
            ? "up"
            : pad.buttons?.[13]?.pressed || y > 0
              ? "down"
              : "";
    if (root !== this.activeRoot) {
      this.activeRoot = root;
      this.padDirection = direction;
      this.padA = Boolean(pad.buttons?.[0]?.pressed);
      this.padB = Boolean(pad.buttons?.[1]?.pressed);
      this.padStart = Boolean(pad.buttons?.[9]?.pressed);
      this.sync();
      return false;
    }
    if (direction) {
      this.onInput("gamepad");
      this.move(direction, now, direction === this.padDirection);
    }
    this.padDirection = direction;

    const a = Boolean(pad.buttons?.[0]?.pressed);
    const activated = a && !this.padA;
    const b = Boolean(pad.buttons?.[1]?.pressed);
    const start = Boolean(pad.buttons?.[9]?.pressed);
    if (a && !this.padA) {
      this.onInput("gamepad");
      this.lastAction = "activate";
      this.activate();
    }
    if (b && !this.padB) {
      this.onInput("gamepad");
      this.lastAction = "back";
      this.onEscape();
    }
    if (start && !this.padStart) {
      this.onInput("gamepad");
      this.lastAction = "back";
      this.onEscape();
    }
    this.padA = a;
    this.padB = b;
    this.padStart = start;
    return activated;
  }
}

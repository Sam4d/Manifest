// Apply appearance before styles load to avoid a light flash on a dark desktop.
(() => {
  const preference = window.matchMedia("(prefers-color-scheme: dark)");
  let mode;
  try {
    mode = localStorage.getItem("pagetrace.appearance");
  } catch {}
  if (!["light", "dark", "system"].includes(mode)) mode = "system";
  function apply() {
    const theme =
      mode === "system" ? (preference.matches ? "dark" : "light") : mode;
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.themeMode = mode;
    document.documentElement.style.colorScheme = theme;
    document
      .querySelectorAll("[data-appearance]")
      .forEach((button) =>
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.appearance === mode),
        ),
      );
    window.dispatchEvent(
      new CustomEvent("pagetrace-theme", { detail: { mode, theme } }),
    );
  }
  function set(value) {
    if (!["light", "dark", "system"].includes(value)) return;
    mode = value;
    try {
      localStorage.setItem("pagetrace.appearance", mode);
    } catch {}
    apply();
  }
  preference.addEventListener("change", () => {
    if (mode === "system") apply();
  });
  window.pageTraceAppearance = Object.freeze({ set, get: () => mode });
  apply();
  document.addEventListener("DOMContentLoaded", () => {
    apply();
    document
      .querySelectorAll("[data-appearance]")
      .forEach((button) =>
        button.addEventListener("click", () => set(button.dataset.appearance)),
      );
  });
})();

(() => {
  const links = document.querySelectorAll("a");
  links.forEach((link) => {
    const href = link.getAttribute("href") || "";
    if (href.startsWith("http")) {
      link.setAttribute("target", "_blank");
      link.setAttribute("rel", "noopener noreferrer");
    }
  });
})();

(() => {
  const meta = document.getElementById("theme-color-meta");
  const toggle = document.getElementById("theme-toggle");
  if (!toggle) return;

  toggle.addEventListener("click", () => {
    const next =
      document.documentElement.getAttribute("data-theme") === "dark"
        ? "light"
        : "dark";
    document.documentElement.setAttribute("data-theme", next);
    if (meta) meta.setAttribute("content", next === "dark" ? "#0a0a0a" : "#ffffff");
    try {
      localStorage.setItem("theme", next);
    } catch (e) {
      /* private mode / storage unavailable */
    }
  });
})();

module.exports = {
  content: ["./src/render/templates/**/*.njk", "./src/styles/**/*.css"],
  theme: {
    extend: {
      colors: {
        ink: "var(--ink)",
        "ink-muted": "var(--ink-muted)",
        "ink-subtle": "var(--ink-subtle)",
        surface: "var(--surface)",
        "surface-alt": "var(--surface-alt)",
        border: "var(--border)",
        accent: "var(--accent)",
        "accent-warm": "var(--accent-warm)",
      },
      borderRadius: {
        DEFAULT: "var(--radius)",
        sm: "var(--radius-sm)",
      },
    },
  },
  plugins: [],
};

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        text: "var(--text)",
        muted: "var(--muted)",
        line: "var(--line)",
        accent: "var(--accent)",
        "on-accent": "var(--on-accent)",
      },
      borderRadius: {
        card: "var(--radius)",
      },
      fontFamily: {
        sans: ["Archivo", "sans-serif"],
      },
      fontSize: {
        title: ["28px", { lineHeight: "1.15", letterSpacing: "-0.01em" }],
        body: ["15px", { lineHeight: "1.45" }],
        meta: ["12px", { lineHeight: "1.35", letterSpacing: "0.04em" }],
      },
      boxShadow: {
        art: "0 24px 60px rgba(0,0,0,.22)",
      },
      transitionDuration: {
        theme: "var(--dur)",
      },
      transitionTimingFunction: {
        theme: "var(--ease)",
      },
    },
  },
  plugins: [],
}

import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        el: {
          bg: "#0c0a09",
          surface: "#1c1917",
          surface2: "#262220",
          border: "#2d2926",
          primary: "#f5f5f5",
          secondary: "#d1cfc9",
          muted: "#a09f9b",
          btn: "#f0efed",
          "btn-hover": "#ffffff",
          mint: "#a7e5d3",
          lavender: "#c8b8e0",
          sky: "#a8c8e8",
          peach: "#f4c5a8",
          rose: "#e8b8c4",
          success: "#16a34a",
          error: "#dc2626",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      borderRadius: {
        pill: "9999px",
      },
    },
  },
  plugins: [],
} satisfies Config;

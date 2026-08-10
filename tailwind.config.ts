import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Neutral slate-based surface palette. Theming controls are explicitly
        // out of scope, so these are fixed rather than CSS-variable driven.
        surface: {
          base: "#0b0f14",
          raised: "#131a23",
          hover: "#1a232e",
          border: "#243040",
        },
        status: {
          up: "#34d399",
          down: "#f87171",
          degraded: "#fbbf24",
          unknown: "#64748b",
        },
      },
    },
  },
  plugins: [],
};

export default config;

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
        // Reserved status palette — never reused for anything decorative.
        // Validated against both portal surfaces (#0b0f14 page, #131a23 tile):
        // all four clear 3:1 contrast, and CVD/normal-vision separation pass.
        // Every use is paired with a text label, so colour never carries the
        // meaning alone.
        status: {
          up: "#0ca30c", // good
          degraded: "#fab219", // warning
          down: "#d03b3b", // critical
          // Informational, not a fault — planned maintenance windows.
          maintenance: "#3987e5",
          unknown: "#898781", // muted — "no data", deliberately achromatic
        },
      },
    },
  },
  plugins: [],
};

export default config;

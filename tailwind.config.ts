import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        postum: {
          primary: "#0F172A",
          "primary-hover": "#1E293B",
          accent: "#0D9488",
          "accent-hover": "#0F766E",
          secondary: "#78716C",
          bg: "#FAFAF9",
          surface: "#F5F5F4",
          "surface-raised": "#EFEDEB",
          "text-primary": "#1C1917",
          "text-secondary": "#57534E",
          "text-tertiary": "#A8A29E",
          "border-subtle": "#E7E5E4",
          "border-medium": "#D6D3D1",
          "border-strong": "#78716C",
          "status-active": "#059669",
          "status-warning": "#D97706",
          "status-critical": "#DC2626",
          "status-neutral": "#6B7280",
        },
      },
      fontFamily: {
        serif: ["'Libre Baskerville'", "Georgia", "serif"],
        sans: ["'Inter'", "-apple-system", "sans-serif"],
        mono: ["'Source Code Pro'", "Consolas", "monospace"],
      },
      borderRadius: {
        sm: "4px",
        md: "6px",
        lg: "8px",
      },
      boxShadow: {
        subtle: "0 1px 3px 0 rgba(0, 0, 0, 0.05)",
        floating: "0 10px 25px -5px rgba(0, 0, 0, 0.08)",
        "accent-glow": "0 4px 12px rgba(13, 148, 136, 0.2)",
      },
    },
  },
  plugins: [],
};

export default config;

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
        brand: {
          50: "#eff6ff",
          100: "#dbeafe",
          200: "#bfdbfe",
          300: "#93c5fd",
          400: "#60a5fa",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
          800: "#1e40af",
          900: "#1e3a8a",
        },
        accent: {
          50: "#fffbea",
          100: "#fff4c2",
          200: "#ffeb94",
          300: "#ffe266",
          400: "#ffdc4a",
          500: "#ffd93d",
          600: "#e6bf1a",
          700: "#b8960f",
          800: "#8a700b",
          900: "#5c4a07",
        },
      },
      fontFamily: {
        sans: ['"IBM Plex Sans Thai"', "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;

import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: { 950: "#0a0e17", 900: "#0f1629", 800: "#1a2338" },
        mint: { 400: "#5eead4", 500: "#2dd4bf", 600: "#14b8a6" },
      },
    },
  },
  plugins: [],
};

export default config;

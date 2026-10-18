/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        wa: {
          bg: "#0b141a",
          panel: "#202c33",
          incoming: "#202c33",
          outgoing: "#005c4b",
          accent: "#00a884",
          border: "#2a3942",
          muted: "#8696a0"
        }
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
        serif: ["Georgia", "Cambria", "Times New Roman", "Times", "serif"]
      }
    }
  },
  plugins: []
};
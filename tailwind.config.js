/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        midnight: "#0b1d3a",
        horizon: "#123666",
        glacier: "#4ab6ff",
        aurora: "#8b5cf6",
        ember: "#ff4d6d",
        sunrise: "#ffd27f",
        frost: "rgba(255,255,255,0.14)",
        "frost-strong": "rgba(255,255,255,0.24)",
      },
      fontFamily: {
        sans: ['"Inter"', "system-ui", "sans-serif"],
        heading: ['"Saira Condensed"', "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "0 20px 45px -20px rgba(36, 180, 255, 0.45)",
        "inner-frost": "inset 0 1px 0 rgba(255,255,255,0.22)",
      },
      borderRadius: {
        glass: "24px",
      },
      backdropBlur: {
        xl: "24px",
        "2xl": "36px",
      },
    },
  },
  plugins: [],
}

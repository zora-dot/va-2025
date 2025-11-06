/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        midnight: "#0b1f36", // deep navy
        horizon: "#1f5aa8", // brand blue
        sky: "#6fbfff", // bright sky blue
        glacier: "#a6c9ff", // pale blue
        mist: "#f0f5ff", // soft background
        slate: "#4c607a", // muted text
        cloud: "#dde8ff", // neutral panel
        ember: "#305bad", // alerts (cool blue)
        frost: "rgba(255,255,255,0.16)",
        "frost-strong": "rgba(255,255,255,0.28)",
      },
      fontFamily: {
        sans: ['"Calibri"', '"Segoe UI"', "system-ui", "sans-serif"],
        heading: ['"Calibri"', '"Segoe UI"', "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "0 20px 45px -20px rgba(36, 180, 255, 0.45)",
        "inner-frost": "inset 0 1px 0 rgba(255,255,255,0.22)",
      },
      borderRadius: {
        glass: "24px",
        pill: "999px",
        xl: "18px",
      },
      backdropBlur: {
        xl: "24px",
        "2xl": "36px",
      },
      spacing: {
        15: "3.75rem",
      },
      transitionTimingFunction: {
        "out-soft": "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
  plugins: [],
}

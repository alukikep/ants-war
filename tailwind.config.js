/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // 生物科技感配色
        'bio-dark': '#0a0f1a',
        'bio-primary': '#00ff88',
        'bio-secondary': '#00ccff',
        'bio-accent': '#ff6b35',
        'player-blue': '#3b82f6',
        'enemy-red': '#ef4444',
      },
      fontFamily: {
        'game': ['Orbitron', 'sans-serif'],
      },
      boxShadow: {
        'neon-blue': '0 0 20px rgba(59, 130, 246, 0.5)',
        'neon-red': '0 0 20px rgba(239, 68, 68, 0.5)',
        'neon-green': '0 0 20px rgba(0, 255, 136, 0.5)',
      }
    },
  },
  plugins: [],
}

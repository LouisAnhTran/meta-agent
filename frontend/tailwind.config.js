/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        dark: {
          bg: '#0f172a',
          surface: '#1e293b',
          border: '#334155',
          text: '#e2e8f0',
          muted: '#94a3b8',
          accent: '#6366f1',
          'accent-hover': '#4f46e5',
        },
      },
    },
  },
  plugins: [],
}

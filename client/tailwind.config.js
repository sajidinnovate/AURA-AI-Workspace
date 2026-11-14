/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'brand-indigo': {
          50: '#EEF2FF',
          100: '#E0E7FF',
          500: '#6366F1',
          600: '#4F46E5',
          700: '#4338CA',
          900: '#312E81',
        },
        'brand-dark': {
          bg: '#090D16',
          card: '#111827',
          border: 'rgba(255, 255, 255, 0.08)',
        },
        'brand-light': {
          bg: '#F8FAFC',
          card: '#FFFFFF',
          border: '#E2E8F0',
        }
      },
      boxShadow: {
        'card-light': '0 10px 30px -5px rgba(0, 0, 0, 0.05), 0 0 0 1px rgba(0, 0, 0, 0.03)',
        'card-dark': '0 20px 50px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
        'indigo-glow': '0 0 25px -3px rgba(99, 102, 241, 0.35)',
      }
    },
  },
  plugins: [],
}

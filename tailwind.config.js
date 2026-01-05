/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Background Layers
        'bg-base': '#141414',
        'bg-surface': '#1a1a1a',
        'bg-elevated': '#242424',
        'bg-hover': '#2e2e2e',
        'bg-active': '#383838',

        // Text Colors
        'text-primary': '#e5e5e5',
        'text-secondary': '#a0a0a0',
        'text-tertiary': '#6b6b6b',
        'text-disabled': '#4a4a4a',

        // Accent Colors
        accent: {
          DEFAULT: '#3b82f6',
          hover: '#2563eb',
          subtle: 'rgba(59, 130, 246, 0.1)',
        },

        // Status Colors
        success: '#22c55e',
        warning: '#eab308',
        error: '#ef4444',

        // Borders
        border: {
          DEFAULT: '#2e2e2e',
          strong: '#404040',
        },
      },
      fontFamily: {
        sans: ['Geist Sans', 'Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['Geist Mono', 'JetBrains Mono', 'monospace'],
      },
      fontSize: {
        'xs': '10px',
        'sm': '11px',
        'base': '12px',
        'lg': '14px',
        'xl': '16px',
        '2xl': '20px',
        '3xl': '24px',
      },
      spacing: {
        '0.5': '2px',
        '1': '4px',
        '1.5': '6px',
        '2': '8px',
        '2.5': '10px',
        '3': '12px',
        '4': '16px',
        '5': '20px',
        '6': '24px',
        '8': '32px',
        '10': '40px',
        '12': '48px',
      },
      borderRadius: {
        'sm': '4px',
        'md': '6px',
        'lg': '8px',
      },
      animation: {
        'panel-morph': 'panel-morph 0.3s ease-out',
        'fade-in': 'fade-in 0.2s ease',
        'slide-up': 'slide-up 0.2s ease',
        'spin-slow': 'spin 2s linear infinite',
      },
      keyframes: {
        'panel-morph': {
          '0%': { opacity: '0', transform: 'translateX(8px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(4px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}

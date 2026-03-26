import type {Config} from 'tailwindcss';

export default {
  content: ['./app/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // === Athletic Brutalism Design System ===
        // Primary
        primary: '#ffffff',
        'on-primary': '#1a1c1c',
        'primary-container': '#d4d4d4',
        'on-primary-container': '#000000',

        // Secondary
        secondary: '#c8c6c5',
        'on-secondary': '#1b1c1c',
        'secondary-container': '#474746',
        'on-secondary-container': '#e5e2e1',

        // Tertiary
        tertiary: '#e2e2e2',
        'on-tertiary': '#1b1b1b',
        'tertiary-container': '#919191',
        'on-tertiary-container': '#000000',

        // Error
        error: '#ffb4ab',
        'on-error': '#690005',
        'error-container': '#93000a',
        'on-error-container': '#ffdad6',

        // Surface hierarchy (Tonal Layering)
        surface: '#131313',
        'surface-dim': '#131313',
        'surface-bright': '#393939',
        'surface-container-lowest': '#0e0e0e',
        'surface-container-low': '#1b1b1b',
        'surface-container': '#1f1f1f',
        'surface-container-high': '#2a2a2a',
        'surface-container-highest': '#353535',
        'surface-variant': '#353535',
        'surface-tint': '#c6c6c7',

        // On-surface
        'on-surface': '#e2e2e2',
        'on-surface-variant': '#c6c6c6',
        'on-background': '#e2e2e2',
        background: '#131313',

        // Outlines
        outline: '#919191',
        'outline-variant': '#474747',

        // Inverse
        'inverse-surface': '#e2e2e2',
        'inverse-on-surface': '#303030',
        'inverse-primary': '#5d5f5f',

        // Fixed variants
        'primary-fixed': '#5d5f5f',
        'primary-fixed-dim': '#454747',
        'secondary-fixed': '#c8c6c5',
        'secondary-fixed-dim': '#adabaa',
        'tertiary-fixed': '#5e5e5e',
        'tertiary-fixed-dim': '#474747',
      },
      fontFamily: {
        headline: ['Teko', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
        label: ['Inter', 'sans-serif'],
      },
      borderRadius: {
        none: '0px',
        DEFAULT: '0px',
        sm: '0px',
        md: '0px',
        lg: '0px',
        xl: '0px',
        '2xl': '0px',
        '3xl': '0px',
        full: '0px',
      },
      keyframes: {
        marquee: {
          '0%': {transform: 'translateX(0)'},
          '100%': {transform: 'translateX(-50%)'},
        },
      },
      animation: {
        marquee: 'marquee 20s linear infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;

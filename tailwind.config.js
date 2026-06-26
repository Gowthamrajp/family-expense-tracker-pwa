/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Surfaces (deep monochromatic)
        background: '#121314',
        surface: '#121314',
        'surface-dim': '#121314',
        'surface-bright': '#39393a',
        'surface-container-lowest': '#0d0e0f',
        'surface-container-low': '#1b1c1d',
        'surface-container': '#1f2021',
        'surface-container-high': '#292a2b',
        'surface-container-highest': '#343536',
        'surface-variant': '#343536',
        // Text
        'on-surface': '#e4e2e3',
        'on-surface-variant': '#b9caca',
        'on-background': '#e4e2e3',
        'inverse-surface': '#e4e2e3',
        'inverse-on-surface': '#303031',
        // Outlines
        outline: '#849495',
        'outline-variant': '#3a494a',
        // Primary (neon cyan)
        primary: '#e9feff',
        'on-primary': '#003739',
        'primary-container': '#00f5ff',
        'on-primary-container': '#006c71',
        'inverse-primary': '#00696e',
        'primary-fixed': '#63f7ff',
        'primary-fixed-dim': '#00dce5',
        'on-primary-fixed': '#002021',
        'on-primary-fixed-variant': '#004f53',
        'surface-tint': '#00dce5',
        // Secondary
        secondary: '#c6c6c9',
        'on-secondary': '#2f3133',
        'secondary-container': '#454749',
        'on-secondary-container': '#b4b5b7',
        'secondary-fixed': '#e2e2e5',
        'secondary-fixed-dim': '#c6c6c9',
        'on-secondary-fixed': '#1a1c1e',
        'on-secondary-fixed-variant': '#454749',
        // Tertiary (amber)
        tertiary: '#fff9f0',
        'on-tertiary': '#3a3000',
        'tertiary-container': '#ffdb3f',
        'on-tertiary-container': '#736000',
        'tertiary-fixed': '#ffe16c',
        'tertiary-fixed-dim': '#e7c427',
        'on-tertiary-fixed': '#221b00',
        'on-tertiary-fixed-variant': '#544600',
        // Error
        error: '#ffb4ab',
        'on-error': '#690005',
        'error-container': '#93000a',
        'on-error-container': '#ffdad6',
      },
      borderRadius: {
        DEFAULT: '0.5rem',
        sm: '0.25rem',
        md: '0.75rem',
        lg: '0.75rem',
        xl: '1.5rem',
        '2xl': '1.5rem',
        full: '9999px',
      },
      spacing: {
        base: '8px',
        // Fluid tokens: compact on phones, full size on larger screens. These
        // are used ungated (e.g. `p-card_padding`, `gap-grid_gap`) across every
        // screen, so making them clamp-based gives all pages responsive
        // spacing without per-component overrides.
        grid_gap: 'clamp(16px, 3vw, 24px)',
        container_padding: 'clamp(20px, 4vw, 40px)',
        card_padding: 'clamp(16px, 4vw, 32px)',
        section_margin: '64px',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'display-xl': ['72px', { lineHeight: '80px', letterSpacing: '-0.04em', fontWeight: '800' }],
        // Fluid headline sizes: smaller on phones, full size from tablet up.
        // Used ungated across screen titles/section headers, so clamping here
        // keeps every page's headings proportionate on small viewports.
        'headline-lg': ['clamp(26px, 6vw, 40px)', { lineHeight: '1.15', letterSpacing: '-0.02em', fontWeight: '700' }],
        'headline-md': ['clamp(20px, 4.5vw, 24px)', { lineHeight: '1.25', letterSpacing: '-0.01em', fontWeight: '600' }],
        'body-lg': ['18px', { lineHeight: '28px', fontWeight: '400' }],
        'body-md': ['16px', { lineHeight: '24px', fontWeight: '400' }],
        'label-caps': ['12px', { lineHeight: '16px', letterSpacing: '0.08em', fontWeight: '600' }],
        'mono-data': ['14px', { lineHeight: '20px', letterSpacing: '0.02em', fontWeight: '500' }],
      },
    },
  },
  plugins: [],
};

import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#ff4f00',
          hover: '#e64700',
        },
        'on-primary': '#fffefb',
        ink: {
          DEFAULT: '#201515',
          soft: '#2f2a26',
          mid: '#36342e',
        },
        body: {
          DEFAULT: '#605d52',
          mid: '#939084',
        },
        mute: '#c5c0b1',
        canvas: {
          DEFAULT: '#fffefb',
          soft: '#f8f4f0',
        },
      },
      borderRadius: {
        sm: '6px',
        md: '12px',
        pill: '9999px',
      },
      spacing: {
        xxs: '2px',
        xs: '4px',
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '24px',
        '2xl': '32px',
        '3xl': '48px',
        '4xl': '64px',
      },
      fontFamily: {
        display: ['"Degular Display"', 'Inter', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'display-xl':   ['56px', { lineHeight: '56px', fontWeight: '500' }],
        'display-lg':   ['48px', { lineHeight: '48px', fontWeight: '500' }],
        'display-md':   ['32px', { lineHeight: '36px', fontWeight: '500', letterSpacing: '0.5px' }],
        'display-sub-lg': ['48px', { lineHeight: '49.92px', fontWeight: '500' }],
        'display-sub-md': ['32px', { lineHeight: '40px', fontWeight: '400' }],
        'display-sub-sm': ['24px', { lineHeight: '30px', fontWeight: '600', letterSpacing: '-0.6px' }],
        'display-xs':   ['20px', { lineHeight: '25px', fontWeight: '700', letterSpacing: '-0.5px' }],
        'body-lg':      ['20px', { lineHeight: '30px', letterSpacing: '-0.2px' }],
        'body-md':      ['18px', { lineHeight: '27px' }],
        'body-sm':      ['16px', { lineHeight: '24px' }],
        caption:        ['14px', { lineHeight: '21px' }],
        eyebrow:        ['14px', { lineHeight: '14px', fontWeight: '500', letterSpacing: '1px' }],
        'button-md':    ['18px', { lineHeight: '27px', fontWeight: '600' }],
        'button-sm':    ['14.4px', { lineHeight: '14.4px', fontWeight: '700', letterSpacing: '0.144px' }],
      },
      boxShadow: {
        toast: '0 4px 12px rgba(32, 21, 21, 0.10)',
        modal: '0 8px 24px rgba(32, 21, 21, 0.12)',
      },
      maxWidth: {
        container: '1280px',
      },
    },
  },
  plugins: [],
} satisfies Config;

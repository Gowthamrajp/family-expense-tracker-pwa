---
name: Neo-Minimalist Family Ledger
colors:
  surface: '#121314'
  surface-dim: '#121314'
  surface-bright: '#39393a'
  surface-container-lowest: '#0d0e0f'
  surface-container-low: '#1b1c1d'
  surface-container: '#1f2021'
  surface-container-high: '#292a2b'
  surface-container-highest: '#343536'
  on-surface: '#e4e2e3'
  on-surface-variant: '#b9caca'
  inverse-surface: '#e4e2e3'
  inverse-on-surface: '#303031'
  outline: '#849495'
  outline-variant: '#3a494a'
  surface-tint: '#00dce5'
  primary: '#e9feff'
  on-primary: '#003739'
  primary-container: '#00f5ff'
  on-primary-container: '#006c71'
  inverse-primary: '#00696e'
  secondary: '#c6c6c9'
  on-secondary: '#2f3133'
  secondary-container: '#454749'
  on-secondary-container: '#b4b5b7'
  tertiary: '#fff9f0'
  on-tertiary: '#3a3000'
  tertiary-container: '#ffdb3f'
  on-tertiary-container: '#736000'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#63f7ff'
  primary-fixed-dim: '#00dce5'
  on-primary-fixed: '#002021'
  on-primary-fixed-variant: '#004f53'
  secondary-fixed: '#e2e2e5'
  secondary-fixed-dim: '#c6c6c9'
  on-secondary-fixed: '#1a1c1e'
  on-secondary-fixed-variant: '#454749'
  tertiary-fixed: '#ffe16c'
  tertiary-fixed-dim: '#e7c427'
  on-tertiary-fixed: '#221b00'
  on-tertiary-fixed-variant: '#544600'
  background: '#121314'
  on-background: '#e4e2e3'
  surface-variant: '#343536'
typography:
  display-xl:
    fontFamily: Inter
    fontSize: 72px
    fontWeight: '800'
    lineHeight: 80px
    letterSpacing: -0.04em
  headline-lg:
    fontFamily: Inter
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-caps:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.08em
  mono-data:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: 0.02em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  grid_gap: 24px
  container_padding: 40px
  card_padding: 32px
  section_margin: 64px
---

## Brand & Style
The design system is a sophisticated fusion of **Neo-Minimalism** and **Glassmorphism**, specifically engineered for a high-end family finance experience. It prioritizes a "Calm Tech" aesthetic—reducing the cognitive load of complex financial data through extreme clarity, generous negative space, and a futuristic, premium atmosphere.

The style leverages a **Bento Grid** layout to compartmentalize information into digestible, high-density modules. By combining deep, monochromatic foundations with semi-transparent surfaces and a singular neon highlight, the UI feels like a high-performance dashboard that is both professional and emotionally grounding.

## Colors
The palette is rooted in a **Deep Monochromatic** spectrum to establish a sense of permanence and security. 
- **Base:** The background uses a near-black (#050505) to allow glass layers to pop.
- **Accent:** A single, vibrant **Neon Cyan (#00F5FF)** is reserved strictly for primary actions, active states, and critical data highlights. 
- **Functional Gradients:** Data visualizations utilize a "Data Art" approach, transitioning from the neon cyan into deep indigo or transparent fades to represent flow and growth.

## Typography
The system utilizes **Inter** for its systematic, utilitarian precision. The typographic hierarchy is characterized by extreme contrast. 
- **Hero Numbers:** Financial totals use `display-xl` with heavy weights and tight letter-spacing to feel impactful and "architectural."
- **Labels:** Small caps with increased tracking are used for secondary metadata and axis labels to maintain a technical, clean-room aesthetic.
- **Weight Strategy:** Bold weights (700-800) are used for "State of Being" (balances), while Medium weights (500) are used for "Actionable Data" (transactions).

## Layout & Spacing
The layout follows a **Fixed Bento Grid** model for the desktop experience. 
- **The Grid:** A 12-column system with 24px gutters. Content is organized into "tiles" that span 3, 4, 6, or 12 columns.
- **Rhythm:** An 8px linear scale governs all padding and margins. 
- **Composition:** High information density is achieved by grouping related metrics into glass tiles, separated by wide 64px section margins to provide visual "breathing room" between major family categories (e.g., Housing vs. Leisure).

## Elevation & Depth
Depth is created through **Glassmorphism** rather than traditional shadows.
- **Surface:** Glass cards utilize a `backdrop-filter: blur(20px)` and a subtle `0.03` opacity white fill.
- **Borders:** Every card features a hair-line 1px border (`0.08` white) to define its silhouette against the dark background.
- **Active State:** Elements that are "elevated" or active gain a secondary inner glow or a subtle outer bloom using the primary neon cyan, creating a "lithophonic" light-from-within effect.

## Shapes
The shape language is defined by large, organic radii that soften the technical nature of the data. 
- **Containers:** All primary Bento tiles use a `24px` (rounded-xl) radius.
- **Interactive Elements:** Buttons and form inputs use a `12px` (rounded-lg) radius to create a distinct visual nested hierarchy within the larger cards. 
- **Data Points:** Circular progress rings and dots are used for goal tracking to contrast the rectangular grid.

## Components
- **Glass Tiles:** The core container. Features a 24px corner radius, thin borders, and backdrop blurring. Used to house all charts and lists.
- **Primary Action Button:** High-contrast Neon Cyan (#00F5FF) background with black text. No border, slight outer glow on hover.
- **Ghost Input:** Transparent background with a 1px subtle white border. On focus, the border transitions to Neon Cyan with a soft inner glow.
- **Data Art Charts:** Area charts use a vertical gradient from Neon Cyan (40% opacity) at the peak to transparent at the baseline. Line strokes are 2px thick.
- **Circular Progress:** Thick stroke rings (8px) for family goals. The "track" is a dark grey, and the "progress" is the vibrant primary cyan.
- **Member Avatars:** High-resolution photography in circular masks with a 2px neon cyan ring to indicate "Active Contributor."
/**
 * Self-contained mock ad creatives for the demo player.
 *
 * The ads are deliberately asset-free: each one is rendered live by
 * {@link "../components/AdPlayer".AdPlayer} from these fields (animated gradient
 * background, floating product glyph, brand/product/tagline/price), so the demo
 * needs no external video files and works fully offline.
 */

/** A single mock advertisement, fully described by data. */
export interface AdCreative {
  id: string;
  brand: string; // e.g. "AURA"
  product: string; // e.g. "Noise-Cancelling Headphones"
  tagline: string; // short punchy line
  description: string; // 1 sentence
  cta: string; // call to action button text, e.g. "Shop now"
  price: string; // e.g. "$249"
  durationSec: number; // 15-30
  glyph: string; // a single emoji representing the product
  category: string; // e.g. "Audio"
  channel: string; // advertiser/channel name, e.g. "AURA Audio"
  // Theming (used as inline style values / arbitrary Tailwind):
  gradientFrom: string; // hex, e.g. "#7c3aed"
  gradientVia: string; // hex
  gradientTo: string; // hex
  accent: string; // hex used for CTA / highlights
}

/** Four distinct, believable mock ads spanning different product categories. */
export const AD_CREATIVES: AdCreative[] = [
  {
    id: "aura-headphones",
    brand: "AURA",
    product: "Noise-Cancelling Headphones",
    tagline: "Hear only what matters.",
    description:
      "Adaptive active noise cancellation and 40-hour battery in a feather-light over-ear design.",
    cta: "Shop now",
    price: "$249",
    durationSec: 20,
    glyph: "🎧",
    category: "Audio",
    channel: "AURA Audio",
    // Deep violet → magenta → indigo: rich, premium, after-dark.
    gradientFrom: "#7c3aed",
    gradientVia: "#c026d3",
    gradientTo: "#4338ca",
    accent: "#f0abfc",
  },
  {
    id: "brewbot-coffee",
    brand: "BrewBot",
    product: "Smart Espresso Maker",
    tagline: "Barista-grade. Push-button simple.",
    description:
      "Dial in pressure, temperature and grind from your phone and wake up to café-quality espresso.",
    cta: "Pre-order",
    price: "$399",
    durationSec: 24,
    glyph: "☕",
    category: "Home & Kitchen",
    channel: "BrewBot Home",
    // Warm espresso amber → copper → roasted brown.
    gradientFrom: "#f59e0b",
    gradientVia: "#d97706",
    gradientTo: "#7c2d12",
    accent: "#fde68a",
  },
  {
    id: "wander-travel",
    brand: "Wander",
    product: "Trip Planning App",
    tagline: "Your next adventure, auto-planned.",
    description:
      "AI itineraries, real-time flight deals and offline maps for over 1,200 destinations worldwide.",
    cta: "Get the app",
    price: "Free",
    durationSec: 18,
    glyph: "✈️",
    category: "Travel",
    channel: "Wander Travel",
    // Tropical sky teal → azure → ocean blue.
    gradientFrom: "#06b6d4",
    gradientVia: "#0ea5e9",
    gradientTo: "#1d4ed8",
    accent: "#a5f3fc",
  },
  {
    id: "stride-shoes",
    brand: "Stride",
    product: "Carbon-Plate Running Shoes",
    tagline: "Find your faster.",
    description:
      "A responsive carbon plate and energy-return foam built to shave seconds off every kilometre.",
    cta: "Buy now",
    price: "$179",
    durationSec: 22,
    glyph: "👟",
    category: "Sports & Fitness",
    channel: "Stride Running",
    // Electric lime → emerald → deep forest: energetic and athletic.
    gradientFrom: "#84cc16",
    gradientVia: "#10b981",
    gradientTo: "#065f46",
    accent: "#d9f99d",
  },
];

/**
 * Marble stage — the classical experiment. OPT-IN ONLY: reachable at
 * `?scene=marble`, never the default. The landscape finale in Footer.jsx stays
 * the shipped scene until this has been looked at and chosen.
 *
 * Same sandwich as the landscape, different contents:
 *
 *   far   colonnade, procedural SVG geometry   z-1   rate  40px  ← placeholder
 *   leak  a single violet hairline             z-1   rate  12px
 *   type  VANTA, carved marble                 z-2   rate -20px
 *   mid   marble bust, CC0 (The Met, PD)       z-5   rate -80px  ← the only real asset
 *   near  drapery — STILL the reference's brush plate, mirrored, standing in
 *         until a draped figure exists         z-10  rate -140px ← placeholder
 *   grain procedural noise tile                z-20
 *
 * Rates follow the landscape's model (|far| + |near| / half-span ≈ 31%): far
 * slowest, near fastest. Every layer keeps a double-ended mask so the travel
 * never exposes a plate edge — the lesson from the landscape build.
 *
 * What is real here: /plates/bust-marble.webp (Met 200668, public domain,
 * matted and relit from a flat museum photo — see assets/raw/*.json for
 * provenance), /plates/marble-vein.webp and /plates/grain.webp (generated here,
 * no licence). What is placeholder: the colonnade geometry and the drapery.
 */

/** Far plane. Flat monument silhouette in fog — lighter than the sky, low
 *  contrast, so it reads as distance rather than as an object. A 1px light edge
 *  along the upper faces is the whole trick: it implies one raking light. */
function Colonnade() {
  const cols = []
  for (let i = 0; i < 9; i += 1) {
    const x = 40 + i * 150
    cols.push(
      <g key={i}>
        <rect x={x - 12} y={352} width={78} height={11} />
        <rect x={x} y={122} width={54} height={230} />
        <rect x={x - 10} y={110} width={74} height={12} />
      </g>,
    )
  }
  return (
    <svg
      viewBox="0 0 1400 400"
      preserveAspectRatio="none"
      className="h-full w-full"
      aria-hidden="true"
      focusable="false"
    >
      <g fill="#232327">
        <polygon points="0,98 700,26 1400,98" />
        <rect x="0" y="98" width="1400" height="26" />
        {cols}
        <rect x="0" y="363" width="1400" height="13" />
        <rect x="0" y="376" width="1400" height="24" />
      </g>
      <g fill="#5a5a63" opacity="0.55">
        <polygon points="0,98 700,26 1400,98 1400,95 700,23 0,95" />
        <rect x="0" y="98" width="1400" height="2" />
      </g>
    </svg>
  )
}

const MASK_FAR = 'linear-gradient(to bottom, transparent 0%, #000 26%, #000 70%, transparent 100%)'
const MASK_MID = 'linear-gradient(to bottom, transparent 0%, #000 18%, #000 74%, transparent 100%)'
const MASK_NEAR = 'linear-gradient(to bottom, transparent 0%, #000 22%, #000 88%, transparent 100%)'

export default function FooterSceneMarble() {
  return (
    <div className="relative mt-10 h-[46vh] min-h-[320px] select-none md:mt-12 md:h-[56vh]">
      {/* Haze at the horizon. Neutral, ≤20% alpha — the one thing that makes the
          far plane sit back instead of reading as a pasted shape. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-[14%] h-[52%]"
        style={{
          background: 'radial-gradient(58% 100% at 50% 100%, rgb(255 255 255 / 0.11), transparent 72%)',
        }}
      />

      {/* Far plane — colonnade, procedural geometry (placeholder). */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-[15%] z-[1] h-[44%] opacity-[0.6] will-change-transform"
        style={{
          maskImage: MASK_FAR,
          WebkitMaskImage: MASK_FAR,
          transform: 'translate3d(0, calc(var(--plate-p, 0) * 40px), 0)',
        }}
      >
        <Colonnade />
      </div>

      {/* The leak — one violet hairline at the stylobate. The page is otherwise
          achromatic; this is the only colour, and it means "what still shows". */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-[15%] z-[1] h-px will-change-transform"
        style={{
          background: 'linear-gradient(to right, transparent, var(--color-accent-strong), transparent)',
          opacity: 0.5,
          transform: 'translate3d(0, calc(var(--plate-p, 0) * 12px), 0)',
        }}
      />

      {/* The wordmark — carved, not gradient-filled. A marble plate is clipped to
          the letters, and a vertical shadow gradient replaces the landscape's
          fade: the foot of the type goes into shadow rather than into alpha. */}
      <div
        className="absolute inset-x-0 bottom-[clamp(48px,calc(8vw-24px),190px)] z-[2] flex flex-col items-center px-4 will-change-transform"
        style={{ transform: 'translate3d(0, calc(var(--plate-p, 0) * -20px), 0)' }}
      >
        <span
          className="bg-clip-text text-center font-display text-[clamp(5.5rem,22vw,19rem)] uppercase leading-[0.92] tracking-[0.04em] text-transparent"
          style={{
            backgroundImage:
              'linear-gradient(to bottom, rgba(255,255,255,0.28) 0%, rgba(0,0,0,0.26) 48%, rgba(0,0,0,0.9) 100%), url(/plates/marble-vein.webp)',
            backgroundSize: 'auto, 100% auto',
            backgroundPosition: '0 0, 50% 32%',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
          }}
        >
          Vanta
        </span>

        {/* The receipt, as an inscription. The one *conceptual* addition here —
            drop this block if it reads as decoration rather than as the pitch. */}
        <span className="mt-[1.4vw] flex items-center gap-4">
          <span aria-hidden="true" className="h-px w-9 bg-hairline-strong" />
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-subtle/70">
            what remains public
          </span>
          <span aria-hidden="true" className="h-px w-9 bg-hairline-strong" />
        </span>
      </div>

      {/* Mid plane — the one real asset. Public domain, matted and relit from a
          flat museum photograph. It occludes the wordmark's V, which is the
          sandwich doing its job. */}
      <img
        src="/plates/bust-marble.webp"
        alt=""
        aria-hidden="true"
        decoding="async"
        draggable="false"
        className="pointer-events-none absolute bottom-[7%] left-[2%] z-[5] h-[clamp(170px,38vw,400px)] w-auto select-none will-change-transform"
        style={{
          maskImage: MASK_MID,
          WebkitMaskImage: MASK_MID,
          transform: 'translate3d(0, calc(var(--plate-p, 0) * -80px), 0)',
        }}
      />

      {/* Near plane — PLACEHOLDER. The reference's brush plate, mirrored and
          desaturated, standing in for drapery folds until a draped figure is
          sourced. Replace this the moment a real plate exists. */}
      <img
        src="/plates/bushes-fg.webp"
        alt=""
        aria-hidden="true"
        decoding="async"
        draggable="false"
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[clamp(130px,22vw,440px)] w-full select-none object-cover object-bottom brightness-[0.35] saturate-0 will-change-transform"
        style={{
          maskImage: MASK_NEAR,
          WebkitMaskImage: MASK_NEAR,
          transform: 'translate3d(0, calc(var(--plate-p, 0) * -140px), 0) scaleX(-1)',
        }}
      />

      {/* Grain. Film-noise over the whole stack so the geometry and the cutout
          share one surface — without it the procedural layers read as vector. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-20 opacity-[0.055]"
        style={{ backgroundImage: 'url(/plates/grain.webp)', backgroundRepeat: 'repeat' }}
      />
    </div>
  )
}

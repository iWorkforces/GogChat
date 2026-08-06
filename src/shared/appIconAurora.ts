/**
 * App-icon aurora — pure CSS + HTML strings for About / Update dialogs.
 * Colors track the Google Chat brand blue (#4285F4) with a soft green accent.
 * No DOM or Electron APIs; safe for main (data: HTML) templates.
 *
 * Base motion: slow multi-blob drift + dual rings.
 * About/Update (`.app-icon-aurora--about`) adds entrance bloom, sheen, and a
 * drifting flare — rare surface, delight budget. Motion stays on transform/opacity only.
 */

/** Brand palette from `resources/icons/normal/scalable.svg`. */
export const APP_ICON_AURORA_COLORS = {
  blue: '#4285F4',
  blueSoft: '#669DF6',
  blueMist: '#8AB4F8',
  green: '#34A853',
  cyan: '#5AC8FA',
} as const;

export type AppIconAuroraOptions = {
  /** Icon pixel size (width & height). Default 96. */
  size?: number;
  /** Extra class on the outer wrap (e.g. layout modifiers). */
  className?: string;
  /** Accessible label; when omitted the wrap is aria-hidden. */
  alt?: string;
};

/**
 * CSS for `.app-icon-aurora` (multi-blob soft glow + slow drift).
 * Embed in a `<style>` tag (About data: document) or a renderer stylesheet.
 */
export const APP_ICON_AURORA_CSS: string = /* css */ `
.app-icon-aurora {
  --icon-size: 96px;
  --aurora-blue: ${APP_ICON_AURORA_COLORS.blue};
  --aurora-blue-soft: ${APP_ICON_AURORA_COLORS.blueSoft};
  --aurora-blue-mist: ${APP_ICON_AURORA_COLORS.blueMist};
  --aurora-green: ${APP_ICON_AURORA_COLORS.green};
  --aurora-cyan: ${APP_ICON_AURORA_COLORS.cyan};
  /* Skill tokens: strong ease-out for UI entrances */
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
  /* Soft sine ease-in-out for continuous ambient morph (easings.co easeInOutSine).
     Strong UI ease-in-out dwells at endpoints and reads as static on long loops. */
  --ease-aurora: cubic-bezier(0.37, 0, 0.63, 1);
  position: relative;
  display: grid;
  place-items: center;
  width: var(--icon-size);
  height: var(--icon-size);
  flex-shrink: 0;
  overflow: visible;
  pointer-events: none;
  user-select: none;
  -webkit-user-select: none;
}

.app-icon-aurora__stage {
  position: relative;
  display: grid;
  place-items: center;
  width: var(--icon-size);
  height: var(--icon-size);
  overflow: visible;
}

.app-icon-aurora__blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(calc(var(--icon-size) * 0.28));
  opacity: 0.72;
  mix-blend-mode: screen;
  will-change: transform, opacity;
  transform: translate3d(0, 0, 0) scale(1);
  animation-timing-function: var(--ease-aurora);
  animation-iteration-count: infinite;
  animation-direction: alternate;
  animation-fill-mode: both;
}

.app-icon-aurora__blob--core {
  width: calc(var(--icon-size) * 1.35);
  height: calc(var(--icon-size) * 1.35);
  background: radial-gradient(
    circle at 50% 45%,
    color-mix(in srgb, var(--aurora-blue-mist) 85%, white) 0%,
    color-mix(in srgb, var(--aurora-blue) 70%, transparent) 42%,
    color-mix(in srgb, var(--aurora-blue) 18%, transparent) 68%,
    transparent 78%
  );
  filter: blur(calc(var(--icon-size) * 0.18));
  opacity: 0.9;
  animation-name: app-icon-aurora-breathe;
  /* Calmer base for frequent surfaces (Settings); About overrides */
  animation-duration: 5.5s;
}

.app-icon-aurora__blob--a {
  width: calc(var(--icon-size) * 1.55);
  height: calc(var(--icon-size) * 1.2);
  background: radial-gradient(
    ellipse at 40% 50%,
    color-mix(in srgb, var(--aurora-blue) 90%, transparent) 0%,
    color-mix(in srgb, var(--aurora-cyan) 45%, transparent) 45%,
    transparent 72%
  );
  top: 50%;
  left: 50%;
  margin-top: calc(var(--icon-size) * -0.6);
  margin-left: calc(var(--icon-size) * -0.78);
  animation-name: app-icon-aurora-drift-a;
  animation-duration: 7.2s;
}

.app-icon-aurora__blob--b {
  width: calc(var(--icon-size) * 1.25);
  height: calc(var(--icon-size) * 1.45);
  background: radial-gradient(
    ellipse at 55% 40%,
    color-mix(in srgb, var(--aurora-blue-soft) 80%, transparent) 0%,
    color-mix(in srgb, var(--aurora-green) 28%, transparent) 50%,
    transparent 74%
  );
  top: 50%;
  left: 50%;
  margin-top: calc(var(--icon-size) * -0.72);
  margin-left: calc(var(--icon-size) * -0.55);
  opacity: 0.55;
  animation-name: app-icon-aurora-drift-b;
  animation-duration: 8.6s;
  animation-delay: -1.2s;
}

.app-icon-aurora__blob--c {
  width: calc(var(--icon-size) * 1.1);
  height: calc(var(--icon-size) * 1.1);
  background: radial-gradient(
    circle at 50% 50%,
    color-mix(in srgb, var(--aurora-cyan) 70%, white) 0%,
    color-mix(in srgb, var(--aurora-blue) 35%, transparent) 48%,
    transparent 70%
  );
  top: 50%;
  left: 50%;
  margin-top: calc(var(--icon-size) * -0.55);
  margin-left: calc(var(--icon-size) * -0.55);
  opacity: 0.45;
  filter: blur(calc(var(--icon-size) * 0.22));
  animation-name: app-icon-aurora-drift-c;
  animation-duration: 6.4s;
  animation-delay: -2.4s;
}

.app-icon-aurora__ring {
  position: absolute;
  width: calc(var(--icon-size) * 1.22);
  height: calc(var(--icon-size) * 1.22);
  border-radius: 50%;
  background: conic-gradient(
    from 180deg,
    transparent 0deg,
    color-mix(in srgb, var(--aurora-blue) 35%, transparent) 70deg,
    color-mix(in srgb, var(--aurora-cyan) 40%, transparent) 140deg,
    color-mix(in srgb, var(--aurora-green) 22%, transparent) 210deg,
    color-mix(in srgb, var(--aurora-blue-soft) 38%, transparent) 290deg,
    transparent 360deg
  );
  filter: blur(calc(var(--icon-size) * 0.12));
  opacity: 0.55;
  mix-blend-mode: screen;
  animation: app-icon-aurora-spin 14s linear infinite;
  will-change: transform;
}

/* Counter ring / sheen / flare: present in DOM but inert on base (Settings). */
.app-icon-aurora__ring--counter {
  width: calc(var(--icon-size) * 1.42);
  height: calc(var(--icon-size) * 1.42);
  background: conic-gradient(
    from 40deg,
    transparent 0deg,
    color-mix(in srgb, var(--aurora-cyan) 28%, transparent) 50deg,
    transparent 110deg,
    color-mix(in srgb, var(--aurora-blue) 32%, transparent) 180deg,
    transparent 240deg,
    color-mix(in srgb, var(--aurora-green) 18%, transparent) 300deg,
    transparent 360deg
  );
  filter: blur(calc(var(--icon-size) * 0.16));
  opacity: 0;
  animation-name: app-icon-aurora-spin;
  animation-duration: 22s;
  animation-direction: reverse;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
  animation-play-state: paused;
}

/* Sheen + flare: invisible in base; About enables full intensity */
.app-icon-aurora__sheen {
  position: absolute;
  width: calc(var(--icon-size) * 1.7);
  height: calc(var(--icon-size) * 1.7);
  border-radius: 50%;
  background: conic-gradient(
    from 0deg,
    transparent 0deg,
    transparent 40deg,
    color-mix(in srgb, white 40%, var(--aurora-cyan) 20%) 75deg,
    color-mix(in srgb, var(--aurora-blue-mist) 35%, transparent) 100deg,
    transparent 130deg,
    transparent 360deg
  );
  filter: blur(calc(var(--icon-size) * 0.06));
  opacity: 0;
  mix-blend-mode: screen;
  will-change: transform, opacity;
  pointer-events: none;
}

.app-icon-aurora__flare {
  position: absolute;
  width: calc(var(--icon-size) * 0.55);
  height: calc(var(--icon-size) * 0.55);
  top: 50%;
  left: 50%;
  margin-top: calc(var(--icon-size) * -0.275);
  margin-left: calc(var(--icon-size) * -0.275);
  border-radius: 50%;
  background: radial-gradient(
    circle at 50% 50%,
    color-mix(in srgb, white 85%, var(--aurora-cyan)) 0%,
    color-mix(in srgb, var(--aurora-blue-mist) 55%, transparent) 38%,
    transparent 70%
  );
  filter: blur(calc(var(--icon-size) * 0.08));
  opacity: 0;
  mix-blend-mode: screen;
  will-change: transform, opacity;
  pointer-events: none;
}

.app-icon-aurora__icon {
  position: relative;
  z-index: 1;
  display: block;
  width: var(--icon-size);
  height: var(--icon-size);
  border-radius: 22%;
  box-shadow:
    0 10px 32px rgba(0, 0, 0, 0.45),
    0 2px 8px rgba(0, 0, 0, 0.35),
    0 0 0 0.5px color-mix(in srgb, var(--aurora-blue) 22%, transparent);
  pointer-events: none;
}

/* ---- About: rare surface — clearly readable ambient delight ---- */
.app-icon-aurora--about .app-icon-aurora__stage {
  animation: app-icon-aurora-bloom-in 0.5s var(--ease-out) both;
}

.app-icon-aurora--about .app-icon-aurora__blob--core {
  animation-name: app-icon-aurora-breathe-fancy;
  animation-duration: 2.8s;
  opacity: 1;
  filter: blur(calc(var(--icon-size) * 0.14));
}

.app-icon-aurora--about .app-icon-aurora__blob--a {
  animation-name: app-icon-aurora-drift-a-fancy;
  animation-duration: 3.6s;
  opacity: 0.9;
  filter: blur(calc(var(--icon-size) * 0.2));
}

.app-icon-aurora--about .app-icon-aurora__blob--b {
  animation-name: app-icon-aurora-drift-b-fancy;
  animation-duration: 4.2s;
  opacity: 0.75;
  filter: blur(calc(var(--icon-size) * 0.22));
}

.app-icon-aurora--about .app-icon-aurora__blob--c {
  animation-name: app-icon-aurora-drift-c-fancy;
  animation-duration: 3.2s;
  opacity: 0.7;
  filter: blur(calc(var(--icon-size) * 0.16));
}

.app-icon-aurora--about .app-icon-aurora__ring {
  opacity: 0.85;
  filter: blur(calc(var(--icon-size) * 0.08));
  animation-duration: 6s;
  width: calc(var(--icon-size) * 1.35);
  height: calc(var(--icon-size) * 1.35);
  background: conic-gradient(
    from 180deg,
    transparent 0deg,
    color-mix(in srgb, var(--aurora-blue) 55%, transparent) 55deg,
    color-mix(in srgb, var(--aurora-cyan) 65%, transparent) 120deg,
    color-mix(in srgb, var(--aurora-green) 40%, transparent) 190deg,
    color-mix(in srgb, var(--aurora-blue-soft) 58%, transparent) 270deg,
    transparent 360deg
  );
}

.app-icon-aurora--about .app-icon-aurora__ring--counter {
  opacity: 0.6;
  filter: blur(calc(var(--icon-size) * 0.1));
  animation-duration: 9s;
  animation-play-state: running;
  width: calc(var(--icon-size) * 1.55);
  height: calc(var(--icon-size) * 1.55);
}

.app-icon-aurora--about .app-icon-aurora__sheen {
  opacity: 0.75;
  animation:
    app-icon-aurora-spin 5.5s linear infinite,
    app-icon-aurora-sheen-pulse 2.4s var(--ease-aurora) infinite alternate;
}

.app-icon-aurora--about .app-icon-aurora__flare {
  opacity: 0.8;
  animation:
    app-icon-aurora-flare-path 4s var(--ease-aurora) infinite alternate,
    app-icon-aurora-flare-pulse 1.8s var(--ease-aurora) infinite alternate;
}

/* Base ambient paths — modest travel for long-lived Settings mark */
@keyframes app-icon-aurora-breathe {
  0% { transform: scale(0.94); opacity: 0.75; }
  100% { transform: scale(1.06); opacity: 1; }
}

@keyframes app-icon-aurora-drift-a {
  0% { transform: translate3d(-6%, 4%, 0) rotate(-8deg) scale(0.95); }
  100% { transform: translate3d(8%, -6%, 0) rotate(10deg) scale(1.08); }
}

@keyframes app-icon-aurora-drift-b {
  0% { transform: translate3d(7%, -5%, 0) rotate(6deg) scale(1.05); }
  100% { transform: translate3d(-9%, 7%, 0) rotate(-12deg) scale(0.92); }
}

@keyframes app-icon-aurora-drift-c {
  0% { transform: translate3d(-4%, -7%, 0) scale(0.9); opacity: 0.32; }
  100% { transform: translate3d(5%, 5%, 0) scale(1.12); opacity: 0.6; }
}

/* About: larger travel, stronger scale/opacity — readable in ~2s of watching */
@keyframes app-icon-aurora-breathe-fancy {
  0% { transform: scale(0.82); opacity: 0.65; }
  100% { transform: scale(1.22); opacity: 1; }
}

@keyframes app-icon-aurora-drift-a-fancy {
  0% { transform: translate3d(-28%, 18%, 0) rotate(-18deg) scale(0.85); opacity: 0.55; }
  50% { transform: translate3d(8%, -24%, 0) rotate(6deg) scale(1.15); opacity: 0.95; }
  100% { transform: translate3d(26%, 10%, 0) rotate(20deg) scale(1.05); opacity: 0.7; }
}

@keyframes app-icon-aurora-drift-b-fancy {
  0% { transform: translate3d(24%, -22%, 0) rotate(16deg) scale(1.12); opacity: 0.5; }
  50% { transform: translate3d(-10%, 6%, 0) rotate(-4deg) scale(0.92); opacity: 0.85; }
  100% { transform: translate3d(-28%, 20%, 0) rotate(-18deg) scale(0.88); opacity: 0.55; }
}

@keyframes app-icon-aurora-drift-c-fancy {
  0% { transform: translate3d(-20%, -26%, 0) scale(0.75); opacity: 0.35; }
  50% { transform: translate3d(18%, -4%, 0) scale(1.2); opacity: 0.85; }
  100% { transform: translate3d(10%, 24%, 0) scale(1.05); opacity: 0.45; }
}

@keyframes app-icon-aurora-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes app-icon-aurora-bloom-in {
  from {
    opacity: 0;
    transform: scale(0.9);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes app-icon-aurora-sheen-pulse {
  from { opacity: 0.35; }
  to { opacity: 0.9; }
}

@keyframes app-icon-aurora-flare-path {
  0% { transform: translate3d(-55%, -40%, 0) scale(0.75); }
  35% { transform: translate3d(30%, -60%, 0) scale(1.25); }
  70% { transform: translate3d(55%, 25%, 0) scale(0.9); }
  100% { transform: translate3d(-20%, 50%, 0) scale(1.15); }
}

@keyframes app-icon-aurora-flare-pulse {
  from { opacity: 0.35; }
  to { opacity: 0.95; }
}

@media (prefers-reduced-motion: reduce) {
  .app-icon-aurora__blob,
  .app-icon-aurora__ring,
  .app-icon-aurora__sheen,
  .app-icon-aurora__flare,
  .app-icon-aurora--about .app-icon-aurora__blob,
  .app-icon-aurora--about .app-icon-aurora__ring,
  .app-icon-aurora--about .app-icon-aurora__sheen,
  .app-icon-aurora--about .app-icon-aurora__flare,
  .app-icon-aurora--about .app-icon-aurora__stage {
    animation: none !important;
    will-change: auto;
  }
  .app-icon-aurora__blob--core,
  .app-icon-aurora--about .app-icon-aurora__blob--core {
    opacity: 0.85;
    transform: none;
  }
  .app-icon-aurora__blob--a,
  .app-icon-aurora__blob--b,
  .app-icon-aurora__blob--c,
  .app-icon-aurora--about .app-icon-aurora__blob--a,
  .app-icon-aurora--about .app-icon-aurora__blob--b,
  .app-icon-aurora--about .app-icon-aurora__blob--c {
    opacity: 0.4;
    transform: none;
  }
  .app-icon-aurora__ring,
  .app-icon-aurora--about .app-icon-aurora__ring {
    opacity: 0.35;
    transform: none;
  }
  .app-icon-aurora__ring--counter,
  .app-icon-aurora--about .app-icon-aurora__ring--counter {
    opacity: 0.22;
    transform: none;
    animation-play-state: paused;
  }
  .app-icon-aurora__sheen,
  .app-icon-aurora__flare,
  .app-icon-aurora--about .app-icon-aurora__sheen,
  .app-icon-aurora--about .app-icon-aurora__flare {
    opacity: 0;
  }
  .app-icon-aurora--about .app-icon-aurora__stage {
    opacity: 1;
    transform: none;
  }
  .app-icon-aurora--about .app-icon-aurora__blob--core {
    opacity: 0.9;
  }
}

/* Match or beat .app-icon-aurora--about specificity so fancy tiers calm down. */
@media (prefers-reduced-transparency: reduce) {
  .app-icon-aurora__blob,
  .app-icon-aurora__ring,
  .app-icon-aurora__sheen,
  .app-icon-aurora__flare,
  .app-icon-aurora--about .app-icon-aurora__blob,
  .app-icon-aurora--about .app-icon-aurora__ring,
  .app-icon-aurora--about .app-icon-aurora__sheen,
  .app-icon-aurora--about .app-icon-aurora__flare {
    opacity: 0.28;
    filter: blur(calc(var(--icon-size) * 0.14));
    mix-blend-mode: normal;
  }
  .app-icon-aurora__blob--core,
  .app-icon-aurora--about .app-icon-aurora__blob--core {
    opacity: 0.4;
  }
  .app-icon-aurora__sheen,
  .app-icon-aurora__flare,
  .app-icon-aurora--about .app-icon-aurora__sheen,
  .app-icon-aurora--about .app-icon-aurora__flare {
    opacity: 0;
  }
}

@media (prefers-contrast: more) {
  .app-icon-aurora__blob,
  .app-icon-aurora__ring,
  .app-icon-aurora__sheen,
  .app-icon-aurora__flare,
  .app-icon-aurora--about .app-icon-aurora__blob,
  .app-icon-aurora--about .app-icon-aurora__ring,
  .app-icon-aurora--about .app-icon-aurora__sheen,
  .app-icon-aurora--about .app-icon-aurora__flare {
    opacity: 0.2;
  }
  .app-icon-aurora__sheen,
  .app-icon-aurora__flare,
  .app-icon-aurora--about .app-icon-aurora__sheen,
  .app-icon-aurora--about .app-icon-aurora__flare {
    opacity: 0;
  }
  .app-icon-aurora__icon {
    box-shadow:
      0 4px 12px rgba(0, 0, 0, 0.55),
      0 0 0 1px color-mix(in srgb, var(--aurora-blue) 45%, white);
  }
}
`.trim();

/**
 * Escape a value for use inside a double-quoted HTML attribute.
 * Minimal: only the characters that can break out of `attr="..."`.
 */
function escapeAttr(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
}

/**
 * Build the aurora stage + icon markup.
 * @param iconSrc Trusted image URL or data: URI for the app icon.
 */
export function appIconWithAuroraHtml(iconSrc: string, options: AppIconAuroraOptions = {}): string {
  const size = options.size ?? 96;
  const sizePx = `${size}px`;
  const extraClass = options.className ? ` ${options.className}` : '';
  const hasAlt = options.alt !== undefined && options.alt.length > 0;
  const aria = hasAlt ? '' : ' aria-hidden="true"';
  const altAttr = hasAlt ? escapeAttr(options.alt!) : '';
  const src = escapeAttr(iconSrc);

  return `<div class="app-icon-aurora${extraClass}" style="--icon-size: ${sizePx}"${aria}>
  <div class="app-icon-aurora__stage">
    <span class="app-icon-aurora__blob app-icon-aurora__blob--core"></span>
    <span class="app-icon-aurora__blob app-icon-aurora__blob--a"></span>
    <span class="app-icon-aurora__blob app-icon-aurora__blob--b"></span>
    <span class="app-icon-aurora__blob app-icon-aurora__blob--c"></span>
    <span class="app-icon-aurora__ring"></span>
    <span class="app-icon-aurora__ring app-icon-aurora__ring--counter"></span>
    <span class="app-icon-aurora__sheen"></span>
    <span class="app-icon-aurora__flare"></span>
    <img class="app-icon-aurora__icon" src="${src}" width="${size}" height="${size}" alt="${altAttr}" draggable="false" />
  </div>
</div>`;
}

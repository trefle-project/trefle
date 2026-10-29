"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";

import type { CarouselSettings } from "@trefle/shared";

import { fill } from "../lib/fill-text";
import type { CarouselCopy } from "../lib/visitor-copy";

import styles from "./carousel.module.css";

/**
 * 016-carousel-block — the published « Carrousel » block
 * (specs/016-carousel-block/contracts/markup.md, research R4–R8).
 *
 * The server renders a native horizontal scroller (scroll-snap) holding every
 * slide: swipe, trackpad and keyboard scrolling are the browser's own, and a
 * visitor without JavaScript can still reach every slide (FR-011). Once
 * mounted, the component adds the arrows, the dots, the screen-reader
 * announcement and `inert` on the slides out of view. It never decides what
 * is visible: CSS does (`--per-view`, capped on small screens); the
 * component measures the scroller to know where it is.
 *
 * Autoplay (opt-in, research R8, WCAG 2.2.2): a pause/play button first in
 * the bar; held while the pointer is over the carousel or focus is inside it
 * (except on that button); stopped once the visitor uses a control or scrolls
 * the slides themselves; never under reduced motion or on a hidden page; never
 * announced.
 */
export type CarouselSlide = { id?: string; className?: string; style?: CSSProperties; children?: ReactNode };

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
const subscribeReducedMotion = (onChange: () => void) => {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const useReducedMotion = () =>
  useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );

const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const usePageVisible = () =>
  useSyncExternalStore(
    subscribeVisibility,
    () => document.visibilityState === "visible",
    () => true,
  );

const classes = (...names: (string | undefined | false)[]) => names.filter(Boolean).join(" ") || undefined;

export function Carousel({
  settings,
  copy,
  lang,
  id,
  className,
  style,
  slides,
}: {
  settings: CarouselSettings;
  /** 023-admin-i18n (US6) — the controls' words in the page's language (`visitorCopy().copy.carousel`). */
  copy: CarouselCopy;
  /** Set when those words are not in the page's language (FR-017). */
  lang?: string;
  id?: string;
  className?: string;
  style?: CSSProperties;
  slides: CarouselSlide[];
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  // First visible slide, and how many fit side by side (from CSS).
  const [view, setView] = useState({ position: 0, visible: 1 });
  const [announcement, setAnnouncement] = useState("");
  const reducedMotion = useReducedMotion();
  const pageVisible = usePageVisible();
  const pauseRef = useRef<HTMLButtonElement>(null);
  // The visitor paused, or took over (control used, slides scrolled).
  const [stopped, setStopped] = useState(false);
  // Pointer over the carousel, or focus inside it.
  const [held, setHeld] = useState(false);

  const count = slides.length;
  const positions = Math.max(1, count - view.visible + 1);
  const autoplay = ready && settings.autoplay !== null && positions > 1 && !reducedMotion;
  const rotating = autoplay && !stopped && !held && pageVisible;

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const measure = () => {
      const slideWidth = (track.firstElementChild as HTMLElement | null)?.offsetWidth || track.clientWidth || 1;
      const visible = Math.max(1, Math.min(count, Math.round(track.clientWidth / slideWidth)));
      const position = Math.min(Math.max(0, Math.round(track.scrollLeft / slideWidth)), count - visible);
      setView((v) => (v.position === position && v.visible === visible ? v : { position, visible }));
    };
    measure();
    setReady(true);
    // A pointer already resting on the carousel at load never "enters" it.
    setHeld(Boolean(sectionRef.current?.matches(":hover")));

    // `scrollend` where supported; otherwise settle on a debounced `scroll`.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const debounced = () => {
      clearTimeout(timer);
      timer = setTimeout(measure, 100);
    };
    const scrollEvent = "onscrollend" in window ? "scrollend" : "scroll";
    const onScroll = scrollEvent === "scrollend" ? measure : debounced;
    track.addEventListener(scrollEvent, onScroll, { passive: true });
    const resize = new ResizeObserver(measure);
    resize.observe(track);
    return () => {
      clearTimeout(timer);
      track.removeEventListener(scrollEvent, onScroll);
      resize.disconnect();
    };
  }, [count]);

  /** Shows the slide at `position` (wrapping around); announced unless autoplay. */
  const goTo = useCallback(
    (position: number, announce = true) => {
      const track = trackRef.current;
      if (!track) return;
      const target = ((position % positions) + positions) % positions;
      const slide = track.children[target] as HTMLElement | undefined;
      if (!slide) return;
      track.scrollTo({ left: slide.offsetLeft, behavior: reducedMotion ? "auto" : "smooth" });
      setView((v) => ({ ...v, position: target }));
      if (announce) setAnnouncement(fill(copy.announce, { n: target + 1, count }));
    },
    [positions, count, reducedMotion, copy.announce],
  );
  const visitorGoTo = (position: number) => {
    setStopped(true);
    goTo(position);
  };

  useEffect(() => {
    if (!rotating || settings.autoplay === null) return;
    const timer = setInterval(() => {
      const track = trackRef.current;
      const slideWidth = (track?.firstElementChild as HTMLElement | null)?.offsetWidth;
      if (track && slideWidth) goTo(Math.round(track.scrollLeft / slideWidth) + 1, false);
    }, settings.autoplay * 1000);
    return () => clearInterval(timer);
  }, [rotating, settings.autoplay, goTo]);

  const takeOver = autoplay ? () => setStopped(true) : undefined;
  const showControls = ready && positions > 1;
  return (
    <section
      ref={sectionRef}
      id={id}
      className={classes(styles.carousel, className)}
      style={{ ...style, ["--per-view" as string]: settings.perView }}
      aria-roledescription={copy.role}
      aria-label={settings.label}
      data-ready={ready ? "" : undefined}
      onPointerOver={autoplay ? () => setHeld(true) : undefined}
      onPointerLeave={autoplay ? () => setHeld(false) : undefined}
      onFocus={autoplay ? (e) => setHeld(e.target !== pauseRef.current) : undefined}
      onBlur={autoplay ? (e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setHeld(false) : undefined}
    >
      {/* Focusable so keyboard users can scroll it even when no slide holds a
          link or button (axe scrollable-region-focusable). */}
      <div
        ref={trackRef}
        className={styles.track}
        tabIndex={0}
        onPointerDown={takeOver}
        onWheel={takeOver}
        onKeyDown={takeOver}
      >
        {slides.map((slide, i) => (
          <div
            key={i}
            id={slide.id}
            className={classes(styles.slide, slide.className)}
            style={slide.style}
            role="group"
            aria-roledescription={copy.slideRole}
            aria-label={fill(copy.slideOf, { n: i + 1, count })}
            inert={ready && (i < view.position || i >= view.position + view.visible)}
          >
            {slide.children}
          </div>
        ))}
      </div>
      {showControls && (autoplay || settings.arrows || settings.dots) ? (
        // One bar under the slides, never over their content: ⏸ ‹ • • • ›.
        <div className={styles.bar} lang={lang}>
          {autoplay ? (
            <button
              ref={pauseRef}
              type="button"
              className={styles.pause}
              aria-label={stopped ? copy.resume : copy.pause}
              onClick={() => setStopped((s) => !s)}
            >
              <PlayPause playing={!stopped} />
            </button>
          ) : null}
          {settings.arrows ? (
            <button
              type="button"
              className={styles.arrow}
              aria-label={copy.previous}
              onClick={() => visitorGoTo(view.position - 1)}
            >
              <Chevron direction="left" />
            </button>
          ) : null}
          {settings.dots
            ? Array.from({ length: positions }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  className={styles.dot}
                  aria-label={fill(copy.goTo, { n: i + 1 })}
                  aria-current={i === view.position ? "true" : undefined}
                  onClick={() => visitorGoTo(i)}
                />
              ))
            : null}
          {settings.arrows ? (
            <button
              type="button"
              className={styles.arrow}
              aria-label={copy.next}
              onClick={() => visitorGoTo(view.position + 1)}
            >
              <Chevron direction="right" />
            </button>
          ) : null}
        </div>
      ) : null}
      {ready ? (
        <div className={styles.srOnly} aria-live="polite" aria-atomic="true" lang={lang}>
          {announcement}
        </div>
      ) : null}
    </section>
  );
}

function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path
        d={direction === "left" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlayPause({ playing }: { playing: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      {playing ? (
        <path d="M8 5v14M16 5v14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      ) : (
        <path d="M8 5l11 7-11 7z" fill="currentColor" />
      )}
    </svg>
  );
}

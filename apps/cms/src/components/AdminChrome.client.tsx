"use client";

import React from "react";
import { usePathname } from "next/navigation";

import type { BrandImage } from "../lib/branding";
import { gridFor, placeVariants } from "../lib/wallpaper";

/**
 * 022-ux-improvement (US4, FR-020, FR-022) — draws the wallpaper on a fixed
 * canvas behind the admin (redrawn on every page change and on resize, so
 * the variant moves) and shows the version footer. A failed image = no
 * wallpaper, never a broken one. The veil keeping lists readable is in
 * custom.css (`.trefle-wallpaper`); its strength is the Settings value,
 * passed as `--trefle-veil`.
 */
type Props = {
  children: React.ReactNode;
  pattern: BrandImage | null;
  variant: BrandImage | null;
  variantMode: "perScreen" | "oneIn";
  variantCount: number;
  variantOneIn: number;
  veilOpacity: number;
  version: string;
  release: string;
};

const load = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

export default function AdminChromeClient({ children, pattern, variant, variantMode, variantCount, variantOneIn, veilOpacity, version, release }: Props) {
  const canvas = React.useRef<HTMLCanvasElement>(null);
  const pathname = usePathname();
  const [size, setSize] = React.useState<{ w: number; h: number } | null>(null);
  const [images, setImages] = React.useState<{ tile: HTMLImageElement; alt: HTMLImageElement | null } | null>(null);

  React.useEffect(() => {
    if (!pattern) return;
    let alive = true;
    Promise.all([load(pattern.url), variant ? load(variant.url).catch(() => null) : Promise.resolve(null)])
      .then(([tile, alt]) => alive && setImages({ tile, alt }))
      .catch(() => alive && setImages(null));
    return () => {
      alive = false;
    };
  }, [pattern, variant]);

  React.useEffect(() => {
    document.body.style.setProperty("--trefle-veil", `${veilOpacity}%`);
  }, [veilOpacity]);

  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const measure = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(measure, 150);
    };
    measure();
    window.addEventListener("resize", onResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  React.useEffect(() => {
    const el = canvas.current;
    if (!el || !images || !size) return;
    const ratio = window.devicePixelRatio || 1;
    el.width = Math.round(size.w * ratio);
    el.height = Math.round(size.h * ratio);
    const ctx = el.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const tw = images.tile.naturalWidth || 1;
    const th = images.tile.naturalHeight || 1;
    const { cols, rows } = gridFor(size.w, size.h, tw, th);
    const swap = images.alt ? placeVariants({ cols, rows, mode: variantMode, count: variantCount, oneIn: variantOneIn }) : new Set<number>();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) ctx.drawImage(swap.has(r * cols + c) && images.alt ? images.alt : images.tile, c * tw, r * th, tw, th);
    }
    // pathname: a new draw (and new variant places) on every page change.
  }, [images, size, pathname, variantMode, variantCount, variantOneIn]);

  return (
    <>
      {pattern && images ? <canvas ref={canvas} className="trefle-wallpaper" aria-hidden="true" /> : null}
      {children}
      <footer className="trefle-powered-by">
        Powered by Trefle v {version} - r {release}
      </footer>
    </>
  );
}

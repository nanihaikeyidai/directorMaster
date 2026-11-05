"use client";
import { useEffect } from "react";
import DramaCanvas from "./DramaCanvas";
import { isShortDramaEnabled } from "../../lib/features.mjs";

const ENABLED = isShortDramaEnabled({ NEXT_PUBLIC_FEATURE_SHORT_DRAMA: process.env.NEXT_PUBLIC_FEATURE_SHORT_DRAMA });

export default function DramaPage() {
  useEffect(() => { if (!ENABLED) location.replace("/"); }, []);
  if (!ENABLED) return <main style={{ padding: 32 }}>短剧导演画布已在 MV Master 中停用，正在返回 MV 制作…</main>;
  return <DramaCanvas />;
}

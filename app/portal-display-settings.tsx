"use client";

import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { GripVertical } from "lucide-react";
import { SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

const STORAGE_KEY = "sfl-portal-display-v1";
const MIN_WIDTH = 220;
const MAX_WIDTH = 440;
const DEFAULT_WIDTH = 256;
const sizes = [{ value: "large", label: "大" }, { value: "medium", label: "中" }, { value: "small", label: "小" }] as const;
type TextSize = typeof sizes[number]["value"];
const clampWidth = (width: number) => Math.round(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, width)));
const isTextSize = (value: unknown): value is TextSize => sizes.some(size => size.value === value);

const DisplayContext = createContext({
  width: DEFAULT_WIDTH,
  setWidth: (_width: number) => {},
  textSize: "medium" as TextSize,
  setTextSize: (_size: TextSize) => {},
});

export function PortalDisplayProvider({ children }: { children: ReactNode }) {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [textSize, setTextSize] = useState<TextSize>("medium");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (typeof saved?.width === "number" && Number.isFinite(saved.width)) setWidth(clampWidth(saved.width));
      if (isTextSize(saved?.textSize)) setTextSize(saved.textSize);
    } catch { /* Device preferences are optional when storage is unavailable. */ }
    setReady(true);
    return () => { delete document.documentElement.dataset.portalTextSize; };
  }, []);

  useEffect(() => {
    if (!ready) return;
    document.documentElement.dataset.portalTextSize = textSize;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ width, textSize })); } catch { /* Keep controls usable without storage. */ }
  }, [ready, width, textSize]);

  return <DisplayContext.Provider value={{ width, setWidth: value => setWidth(clampWidth(value)), textSize, setTextSize }}>
    <SidebarProvider className="app-shell" style={{ "--sidebar-width": `${width}px` } as CSSProperties}>{children}</SidebarProvider>
  </DisplayContext.Provider>;
}

export function PortalSidebarToggle() {
  const { isMobile, open, openMobile } = useSidebar();
  const expanded = isMobile ? openMobile : open;
  const label = expanded ? "メニューを閉じる" : "メニューを開く";
  return <SidebarTrigger className="portal-mobile-menu-trigger portal-sidebar-toggle" aria-label={label} aria-expanded={expanded} title={label}>
    <span>{isMobile ? "メニュー" : label}</span>
  </SidebarTrigger>;
}

export function PortalTextSizeControls() {
  const { textSize, setTextSize } = useContext(DisplayContext);
  return <div className="topbar-text-size">
    <span id="portal-text-size-label">文字サイズ</span>
    <RadioGroup className="display-text-sizes" value={textSize} onValueChange={value => { if (isTextSize(value)) setTextSize(value); }} aria-labelledby="portal-text-size-label" orientation="horizontal">
      {sizes.map(size => <label key={size.value}><RadioGroupItem value={size.value} aria-label={`文字サイズ：${size.label}`}/><span>{size.label}</span></label>)}
    </RadioGroup>
  </div>;
}

export function PortalSidebarResizer() {
  const { width, setWidth } = useContext(DisplayContext);
  const { isMobile, open } = useSidebar();
  const drag = useRef<{ pointerId: number; x: number; width: number; scale: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!dragging) return;
    document.documentElement.classList.add("portal-sidebar-resizing");
    return () => document.documentElement.classList.remove("portal-sidebar-resizing");
  }, [dragging]);
  useEffect(() => { if (isMobile || !open) { drag.current = null; setDragging(false); } }, [isMobile, open]);

  if (isMobile || !open) return null;
  return <div className="portal-sidebar-resizer" role="separator" aria-label="左メニューの幅を調整" aria-orientation="vertical" aria-valuemin={MIN_WIDTH} aria-valuemax={MAX_WIDTH} aria-valuenow={width} aria-valuetext={`${width}ピクセル`} tabIndex={0} title="左右にドラッグして幅を調整。ダブルクリックで標準に戻します。"
    onPointerDown={event => {
      if (event.button !== 0) return;
      const panel = event.currentTarget.closest<HTMLElement>('[data-slot="sidebar-container"]');
      if (!panel) return;
      event.preventDefault();
      event.currentTarget.focus();
      event.currentTarget.setPointerCapture(event.pointerId);
      // Account for the portal's existing CSS zoom as well as browser zoom.
      drag.current = { pointerId: event.pointerId, x: event.clientX, width, scale: panel.getBoundingClientRect().width / panel.offsetWidth || 1 };
      setDragging(true);
    }}
    onPointerMove={event => {
      const start = drag.current;
      if (start?.pointerId === event.pointerId) setWidth(start.width + (event.clientX - start.x) / start.scale);
    }}
    onPointerUp={event => {
      if (drag.current?.pointerId !== event.pointerId) return;
      drag.current = null;
      setDragging(false);
      event.currentTarget.releasePointerCapture(event.pointerId);
    }}
    onPointerCancel={() => { drag.current = null; setDragging(false); }}
    onLostPointerCapture={() => { drag.current = null; setDragging(false); }}
    onDoubleClick={() => setWidth(DEFAULT_WIDTH)}
    onKeyDown={event => {
      const step = event.shiftKey ? 40 : 8;
      const next = ({ ArrowLeft: width - step, ArrowRight: width + step, Home: MIN_WIDTH, End: MAX_WIDTH } as Record<string, number>)[event.key];
      if (next !== undefined) { event.preventDefault(); setWidth(next); }
    }}><GripVertical size={16} aria-hidden="true"/></div>;
}

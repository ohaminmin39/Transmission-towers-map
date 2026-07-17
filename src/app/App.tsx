import "leaflet/dist/leaflet.css";
import { useState, useEffect, useRef } from "react";
import L from "leaflet";
import { ImageWithFallback } from "@/app/components/figma/ImageWithFallback";
import heroImg from "@/imports/22_orig.jpg";
import tower2 from "@/imports/example_1.jpg";
import tower3 from "@/imports/example_2.jpg";

import {
  MapPin,
  Search,
  Plus,
  ArrowLeft,
  Edit2,
  Navigation,
  Calendar,
  FileText,
  X,
  Zap,
  SortAsc,
  Trash2,
  Map as MapIcon,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
} from "lucide-react";

// ─── Config ──────────────────────────────────────────────────────────────────

const MAX_PHOTOS = 5; // Increase here to allow more photos per tower

// ─── Persistence ─────────────────────────────────────────────────────────────

const STORAGE_KEY = "tetsu-towers-v2";

function migrateTower(raw: Record<string, unknown>): Tower {
  const base = raw as unknown as Tower;
  // Ensure photos is always a non-empty valid array
  if (Array.isArray(raw.photos) && raw.photos.length > 0) return base;
  const legacy = typeof raw.photo === "string" && raw.photo ? [raw.photo] : [];
  return { ...base, photos: legacy };
}

function loadTowers(fallback: Tower[]): Tower[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return fallback;
    const parsed = JSON.parse(stored) as Record<string, unknown>[];
    const migrated = parsed.map(migrateTower);
    return migrated.length > 0 ? migrated : fallback;
  } catch {
    return fallback;
  }
}

function saveTowers(towers: Tower[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(towers));
  } catch {
    // quota exceeded — silently ignore
  }
}

// ─── Image compression ───────────────────────────────────────────────────────

function compressImage(
  file: File,
  maxWidth = 900,
  quality = 0.82,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}

// ─── Types ───────────────────────────────────────────────────────────────────

type View = "home" | "map" | "list" | "detail" | "register" | "edit";
type NavSource = "map" | "list";

interface Tower {
  id: string;
  title: string;
  photos: string[]; // was photo: string
  latitude: number;
  longitude: number;
  address: string;
  date: string;
  memo: string;
  tags: string[];
  createdAt: string;
}

type NavFn = (view: View, id?: string) => void;

// ─── Leaflet icons ───────────────────────────────────────────────────────────

function makeDot(color: string, size = 14) {
  return L.divIcon({
    className: "",
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:50%;
      background:${color};border:2.5px solid #FAFAF7;
      box-shadow:0 2px 8px rgba(0,0,0,0.35);
    "></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

const TOWER_ICON = makeDot("#3D6B52");
const PENDING_ICON = makeDot("#b33a3a", 16);

// ─── Seed data ───────────────────────────────────────────────────────────────

const SEED_TOWERS: Tower[] = [
  {
    id: "1",
    title: "愛知環状鉄道猿投変電所付近 鉄塔",
    photos: [heroImg],
    latitude: 35.130593,
    longitude: 137.155038,
    address: "愛知県豊田市",
    date: "2025-10-13",
    memo: "鉄塔が夕焼けに映えていた。高校生の頃からよく撮影している鉄塔。",
    tags: ["灰色鉄塔", "夕暮れ"],
    createdAt: "2024-03-15T14:30:00Z",
  },
  {
    id: "2",
    title: "亀首町新金山 鉄塔",
    photos: [tower2],
    latitude: 35.130877,
    longitude: 137.161419,
    address: "愛知県豊田市",
    date: "2023-06-11",
    memo: "スラッとしててかっこいい。",
    tags: ["灰色鉄塔"],
    createdAt: "2024-01-20T10:15:00Z",
  },
  {
    id: "3",
    title: "伊保町鉄塔",
    photos: [tower3],
    latitude: 35.131139,
    longitude: 137.151412,
    address: "愛知県豊田市",
    date: "2025-10-13",
    memo: "下から見上げると圧巻だった。",
    tags: ["灰色鉄塔"],
    createdAt: "2024-02-08T17:00:00Z",
  },
];

// ─── Utilities ───────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

function firstPhoto(tower: Tower) {
  return (tower.photos ?? [])[0] ?? "";
}

// ─── Shared atoms ────────────────────────────────────────────────────────────

function NoPhotoPlaceholder({ className }: { className?: string }) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 bg-muted text-muted-foreground/50 ${className ?? ""}`}
    >
      <svg
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
      </svg>
      <span
        style={{ fontFamily: "'DM Mono', monospace" }}
        className="text-xs tracking-wider"
      >
        No Photo
      </span>
    </div>
  );
}

function TagPill({ label, dim }: { label: string; dim?: boolean }) {
  return (
    <span
      className={`inline-block text-xs px-2.5 py-0.5 ${dim ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"}`}
    >
      {label}
    </span>
  );
}

// ─── Photo carousel ──────────────────────────────────────────────────────────

function PhotoCarousel({ photos, title }: { photos: string[]; title: string }) {
  const [idx, setIdx] = useState(0);
  const safePhotos = photos ?? [];
  const count = safePhotos.length;
  const current = safePhotos[idx] ?? "";

  const prev = () => setIdx((i) => (i - 1 + count) % count);
  const next = () => setIdx((i) => (i + 1) % count);

  return (
    <div className="w-full bg-black select-none">
      {/* Image — natural aspect ratio, max height capped */}
      <div
        className="relative flex items-center justify-center"
        style={{ minHeight: 200, maxHeight: "75vh" }}
      >
        {count === 0 ? (
          <NoPhotoPlaceholder
            className="w-full"
            style={{ height: 260 } as React.CSSProperties}
          />
        ) : (
          <img
            key={current}
            src={current}
            alt={`${title} (${idx + 1}/${count})`}
            className="block w-full h-auto max-h-[75vh] object-contain"
            style={{ display: "block" }}
          />
        )}

        {/* Prev / Next */}
        {count > 1 && (
          <>
            <button
              onClick={prev}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-black/45 hover:bg-black/70 text-white flex items-center justify-center transition-colors"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              onClick={next}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-black/45 hover:bg-black/70 text-white flex items-center justify-center transition-colors"
            >
              <ChevronRight size={20} />
            </button>

            {/* Counter badge */}
            <div
              style={{ fontFamily: "'DM Mono', monospace" }}
              className="absolute bottom-3 right-3 bg-black/55 text-white text-xs px-2.5 py-1"
            >
              {idx + 1} / {count}
            </div>
          </>
        )}
      </div>

      {/* Dot indicators */}
      {count > 1 && (
        <div className="flex justify-center gap-1.5 py-2.5">
          {safePhotos.map((_, i) => (
            <button
              key={i}
              onClick={() => setIdx(i)}
              className={`w-1.5 h-1.5 rounded-full transition-colors ${i === idx ? "bg-white" : "bg-white/35"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Imperative Leaflet map ───────────────────────────────────────────────────

interface LeafletMapProps {
  towers: Tower[];
  pendingPos?: { lat: number; lng: number } | null;
  onTowerClick?: (id: string, center: [number, number], zoom: number) => void;
  onMapClick?: (lat: number, lng: number) => void;
  center?: [number, number];
  zoom?: number;
  interactive?: boolean;
  showTooltips?: boolean;
  style?: React.CSSProperties;
}

function LeafletMap({
  towers,
  pendingPos = null,
  onTowerClick,
  onMapClick,
  center = [36.5, 136.0],
  zoom = 6,
  interactive = true,
  showTooltips = true,
  style,
}: LeafletMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<globalThis.Map<string, L.Marker>>(
    new globalThis.Map(),
  );
  const pendingRef = useRef<L.Marker | null>(null);
  const onTowerClickRef = useRef(onTowerClick);
  onTowerClickRef.current = onTowerClick;

  useEffect(() => {
    const id = "tetsu-tooltip-style";
    if (document.getElementById(id)) return;
    const s = document.createElement("style");
    s.id = id;
    s.textContent = `
      .tetsu-tooltip { padding:0!important;background:transparent!important;border:none!important;border-radius:0!important;box-shadow:none!important; }
      .tetsu-tooltip::before { display:none!important; }
      .leaflet-tooltip-top.tetsu-tooltip { margin-bottom:8px; }
    `;
    document.head.appendChild(s);
  }, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center,
      zoom,
      zoomControl: interactive,
      dragging: interactive,
      scrollWheelZoom: interactive,
      doubleClickZoom: interactive,
      touchZoom: interactive,
      attributionControl: false,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(
      map,
    );
    if (interactive && onMapClick) {
      map.on("click", (e: L.LeafletMouseEvent) =>
        onMapClick(e.latlng.lat, e.latlng.lng),
      );
    }
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current.clear();
      pendingRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const existing = markersRef.current;
    const currentIds = new globalThis.Set(towers.map((t) => t.id));
    existing.forEach((marker, id) => {
      if (!currentIds.has(id)) {
        marker.remove();
        existing.delete(id);
      }
    });

    towers.forEach((t) => {
      if (existing.has(t.id)) return;
      const marker = L.marker([t.latitude, t.longitude], {
        icon: TOWER_ICON,
      }).addTo(map);

      if (showTooltips) {
        const thumb = firstPhoto(t);
        const html = `
          <div style="width:200px;font-family:'Inter',sans-serif;background:#FAFAF7;
            border:1px solid rgba(28,26,23,0.12);box-shadow:0 4px 20px rgba(0,0,0,0.15);overflow:hidden;">
            ${
              thumb
                ? `<div style="width:200px;height:112px;overflow:hidden;background:#E8E5DC;">
              <img src="${thumb}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;"/>
            </div>`
                : ""
            }
            <div style="padding:10px 12px 11px;">
              <div style="font-size:12px;font-weight:500;color:#1C1A17;line-height:1.4;margin-bottom:4px;">${t.title}</div>
              <div style="font-size:11px;color:#6B6856;display:flex;align-items:center;gap:4px;">
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#6B6856" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                </svg>${t.address}
              </div>
            </div>
          </div>`;
        marker.bindTooltip(html, {
          direction: "top",
          offset: [0, -10],
          opacity: 1,
          sticky: false,
          className: "tetsu-tooltip",
        });
      }

      marker.on("click", (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        const c = map.getCenter();
        onTowerClickRef.current?.(t.id, [c.lat, c.lng], map.getZoom());
      });
      existing.set(t.id, marker);
    });
  }, [towers, showTooltips]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (pendingRef.current) {
      pendingRef.current.remove();
      pendingRef.current = null;
    }
    if (pendingPos) {
      pendingRef.current = L.marker([pendingPos.lat, pendingPos.lng], {
        icon: PENDING_ICON,
      }).addTo(map);
    }
  }, [pendingPos]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", ...style }}
    />
  );
}

// ─── Header ──────────────────────────────────────────────────────────────────

function Header({ view, onNav }: { view: View; onNav: NavFn }) {
  return (
    <header className="fixed top-0 inset-x-0 z-[1001] h-13 flex items-center px-6 bg-card border-b border-border">
      <button
        onClick={() => onNav("home")}
        className="flex items-center gap-2 mr-8 hover:opacity-60 transition-opacity"
      >
        <Zap size={14} className="text-primary" strokeWidth={2.5} />
        <span
          style={{ fontFamily: "'Noto Serif JP', serif" }}
          className="text-sm tracking-widest text-foreground font-medium"
        >
          鉄塔マップ
        </span>
      </button>
      <nav className="flex items-center gap-0.5 flex-1">
        {(["map", "list"] as const).map((v) => (
          <button
            key={v}
            onClick={() => onNav(v)}
            className={`px-3 py-1.5 text-xs tracking-wider transition-colors ${v === view ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
          >
            {v === "map" ? "地図" : "一覧"}
          </button>
        ))}
      </nav>
      <button
        onClick={() => onNav("register")}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground text-xs tracking-wider hover:opacity-85 transition-opacity"
      >
        <Plus size={12} />
        登録
      </button>
    </header>
  );
}

// ─── Map page ────────────────────────────────────────────────────────────────

function MapPage({
  towers,
  onNavToDetail,
  onRegisterFromMap,
  initialCenter,
  initialZoom,
}: {
  towers: Tower[];
  onNavToDetail: (id: string, center: [number, number], zoom: number) => void;
  onRegisterFromMap: (lat: number, lng: number) => void;
  initialCenter?: [number, number];
  initialZoom?: number;
}) {
  const [query, setQuery] = useState("");
  const [pendingPos, setPendingPos] = useState<{
    lat: number;
    lng: number;
  } | null>(null);

  const shown = query
    ? towers.filter(
        (t) =>
          t.title.includes(query) || t.tags.some((tag) => tag.includes(query)),
      )
    : towers;

  return (
    <div className="pt-13 h-screen flex flex-col">
      <div className="flex items-center gap-3 px-6 py-2.5 border-b border-border bg-card">
        <Search size={13} className="text-muted-foreground shrink-0" />
        <input
          type="text"
          placeholder="タイトル・タグで検索"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 text-sm bg-transparent outline-none text-foreground placeholder:text-muted-foreground"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="text-muted-foreground hover:text-foreground"
          >
            <X size={13} />
          </button>
        )}
      </div>
      <div className="flex-1 relative">
        <LeafletMap
          towers={shown}
          pendingPos={pendingPos}
          onTowerClick={onNavToDetail}
          onMapClick={(lat, lng) => setPendingPos({ lat, lng })}
          center={initialCenter ?? [36.5, 136.0]}
          zoom={initialZoom ?? 6}
          showTooltips
          style={{ height: "100%" }}
        />
        <div
          style={{ fontFamily: "'DM Mono', monospace" }}
          className="absolute top-4 right-4 z-[1000] bg-card border border-border px-3 py-1.5 text-xs text-muted-foreground pointer-events-none"
        >
          {shown.length} 件
        </div>
        <button className="absolute bottom-6 right-4 z-[1000] w-10 h-10 bg-card border border-border shadow-md flex items-center justify-center hover:bg-muted transition-colors">
          <Navigation size={15} className="text-primary" />
        </button>
        <div
          style={{ fontFamily: "'DM Mono', monospace" }}
          className="absolute bottom-6 left-4 z-[1000] text-xs text-foreground/50 bg-card/85 backdrop-blur-sm px-2.5 py-1.5 border border-border/40 pointer-events-none"
        >
          地図をクリックして登録
        </div>
        {pendingPos && (
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-[1000] bg-card border border-border shadow-2xl w-72">
            <div className="px-5 pt-5 pb-4">
              <p className="text-sm font-medium text-foreground mb-1">
                この場所を登録しますか？
              </p>
              <p
                style={{ fontFamily: "'DM Mono', monospace" }}
                className="text-xs text-muted-foreground mb-4"
              >
                {pendingPos.lat.toFixed(5)}, {pendingPos.lng.toFixed(5)}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    onRegisterFromMap(pendingPos.lat, pendingPos.lng);
                    setPendingPos(null);
                  }}
                  className="flex-1 py-2 bg-primary text-primary-foreground text-xs tracking-wider hover:opacity-85 transition-opacity"
                >
                  登録する
                </button>
                <button
                  onClick={() => setPendingPos(null)}
                  className="flex-1 py-2 border border-border text-muted-foreground text-xs hover:text-foreground transition-colors"
                >
                  キャンセル
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Home ────────────────────────────────────────────────────────────────────

function HomePage({ towers, onNav }: { towers: Tower[]; onNav: NavFn }) {
  const recent = [...towers]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 3);
  return (
    <div className="pt-13">
      <section className="relative h-[88vh] overflow-hidden bg-stone-800">
        <ImageWithFallback
          src={heroImg}
          alt="送電鉄塔"
          className="absolute inset-0 w-full h-full object-cover opacity-70"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-background/90" />
        <div className="relative h-full flex flex-col justify-end px-10 pb-20 max-w-5xl">
          <p
            style={{ fontFamily: "'DM Mono', monospace" }}
            className="text-xs tracking-[0.35em] text-white/55 mb-5 uppercase"
          >
            Field Notes — Transmission Towers
          </p>
          <h1
            style={{ fontFamily: "'Noto Serif JP', serif" }}
            className="text-6xl md:text-8xl font-light text-white mb-7 leading-[1.1]"
          >
            鉄塔マップ
          </h1>
          <p className="text-base text-white/70 mb-10 max-w-sm leading-relaxed">
            撮影した鉄塔を地図上に記録・管理する、静かなフィールドノート。
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => onNav("map")}
              className="px-7 py-3 bg-primary text-primary-foreground text-sm tracking-wider hover:opacity-85 transition-opacity"
            >
              地図を見る
            </button>
            <button
              onClick={() => onNav("register")}
              className="px-7 py-3 bg-white/10 border border-white/25 text-white text-sm tracking-wider hover:bg-white/18 transition-colors backdrop-blur-sm"
            >
              登録する
            </button>
          </div>
        </div>
      </section>

      <section className="border-b border-border py-8 px-10 bg-card">
        <div className="max-w-5xl mx-auto flex gap-16">
          {[
            { value: towers.length, label: "登録鉄塔" },
            {
              value: new globalThis.Set(towers.flatMap((t) => t.tags)).size,
              label: "タグ数",
            },
            {
              value: new globalThis.Set(
                towers.map((t) => t.address.slice(0, 3)),
              ).size,
              label: "都道府県",
            },
          ].map(({ value, label }) => (
            <div key={label}>
              <div
                style={{ fontFamily: "'Noto Serif JP', serif" }}
                className="text-4xl font-light text-foreground"
              >
                {value}
              </div>
              <div
                style={{ fontFamily: "'DM Mono', monospace" }}
                className="text-xs text-muted-foreground mt-1.5 tracking-widest uppercase"
              >
                {label}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="py-16 px-10">
        <div className="max-w-5xl mx-auto">
          <h2
            style={{ fontFamily: "'Noto Serif JP', serif" }}
            className="text-xl font-light text-foreground mb-8 flex items-center gap-4"
          >
            最近の記録
            <span className="flex-1 h-px bg-border" />
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {recent.map((t) => (
              <button
                key={t.id}
                onClick={() => onNav("detail", t.id)}
                className="text-left group"
              >
                <div className="aspect-[4/3] bg-muted overflow-hidden mb-3.5">
                  {firstPhoto(t) ? (
                    <img
                      src={firstPhoto(t)}
                      alt={t.title}
                      className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-700"
                    />
                  ) : (
                    <NoPhotoPlaceholder className="w-full h-full" />
                  )}
                </div>
                <div
                  style={{ fontFamily: "'DM Mono', monospace" }}
                  className="text-xs text-muted-foreground mb-1"
                >
                  {fmtDate(t.date)}
                </div>
                <div className="text-sm font-medium text-foreground group-hover:text-primary transition-colors leading-snug mb-1.5">
                  {t.title}
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <MapPin size={9} />
                  {t.address}
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

// ─── List ─────────────────────────────────────────────────────────────────────

function ListPage({
  towers,
  onNav,
  onDelete,
}: {
  towers: Tower[];
  onNav: NavFn;
  onDelete: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"date" | "title">("date");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const shown = towers
    .filter(
      (t) =>
        !query ||
        t.title.includes(query) ||
        t.tags.some((tag) => tag.includes(query)),
    )
    .sort((a, b) =>
      sort === "date"
        ? new Date(b.date).getTime() - new Date(a.date).getTime()
        : a.title.localeCompare(b.title, "ja"),
    );

  return (
    <div className="pt-13 min-h-screen">
      <div className="sticky top-13 z-40 bg-card border-b border-border px-8 py-3 flex items-center gap-4">
        <div className="flex items-center gap-2 flex-1 max-w-xs">
          <Search size={13} className="text-muted-foreground shrink-0" />
          <input
            type="text"
            placeholder="タイトル・タグで検索"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 text-sm bg-transparent outline-none text-foreground placeholder:text-muted-foreground"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="text-muted-foreground hover:text-foreground"
            >
              <X size={13} />
            </button>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <SortAsc size={13} className="text-muted-foreground" />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as "date" | "title")}
            className="text-xs bg-transparent border border-border px-2 py-1.5 text-foreground outline-none cursor-pointer"
          >
            <option value="date">撮影日順</option>
            <option value="title">名前順</option>
          </select>
        </div>
      </div>

      <div className="px-8 py-8 max-w-6xl mx-auto">
        <div
          style={{ fontFamily: "'DM Mono', monospace" }}
          className="text-xs text-muted-foreground mb-6 tracking-wider"
        >
          {shown.length} 件
        </div>
        {shown.length === 0 ? (
          <div className="text-center py-24 text-muted-foreground text-sm">
            該当する鉄塔が見つかりません
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {shown.map((t) => (
              <div
                key={t.id}
                className="group bg-card border border-border hover:border-primary/30 transition-colors overflow-hidden relative"
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmDeleteId(t.id);
                  }}
                  className="absolute top-2 right-2 z-10 w-7 h-7 bg-black/40 hover:bg-destructive flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-150"
                  title="削除"
                >
                  <Trash2 size={12} className="text-white" />
                </button>
                <button
                  onClick={() => onNav("detail", t.id)}
                  className="text-left w-full"
                >
                  <div className="aspect-[16/10] bg-muted overflow-hidden">
                    {firstPhoto(t) ? (
                      <img
                        src={firstPhoto(t)}
                        alt={t.title}
                        className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-700"
                      />
                    ) : (
                      <NoPhotoPlaceholder className="w-full h-full" />
                    )}
                  </div>
                  <div className="p-4">
                    <div
                      style={{ fontFamily: "'DM Mono', monospace" }}
                      className="text-xs text-muted-foreground mb-1.5"
                    >
                      {fmtDate(t.date)}
                    </div>
                    <h3 className="text-sm font-medium text-foreground mb-1.5 leading-snug group-hover:text-primary transition-colors">
                      {t.title}
                    </h3>
                    <p className="text-xs text-muted-foreground mb-3 flex items-center gap-1">
                      <MapPin size={9} />
                      {t.address}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {t.tags.slice(0, 3).map((tag) => (
                        <TagPill key={tag} label={tag} dim />
                      ))}
                    </div>
                  </div>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {confirmDeleteId && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/30 backdrop-blur-[2px]">
          <div className="bg-card border border-border shadow-2xl w-80 p-6">
            <p className="text-sm font-medium text-foreground mb-2">
              この鉄塔を削除しますか？
            </p>
            <p className="text-xs text-muted-foreground mb-6">
              {towers.find((t) => t.id === confirmDeleteId)?.title}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  onDelete(confirmDeleteId);
                  setConfirmDeleteId(null);
                }}
                className="flex-1 py-2 bg-destructive text-destructive-foreground text-xs tracking-wider hover:opacity-85 transition-opacity"
              >
                削除する
              </button>
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="flex-1 py-2 border border-border text-muted-foreground text-xs hover:text-foreground transition-colors"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Detail ──────────────────────────────────────────────────────────────────

function DetailPage({
  tower,
  navSource,
  onBack,
  onEdit,
}: {
  tower: Tower;
  navSource: NavSource;
  onBack: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="pt-13 min-h-screen">
      <div className="px-8 py-3 border-b border-border bg-card flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors tracking-wider"
        >
          {navSource === "map" ? (
            <>
              <MapIcon size={13} />
              <span>地図に戻る</span>
            </>
          ) : (
            <>
              <ArrowLeft size={13} />
              <span>一覧に戻る</span>
            </>
          )}
        </button>
        <button
          onClick={onEdit}
          className="flex items-center gap-2 px-4 py-1.5 bg-secondary border border-border text-foreground text-xs tracking-wider hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors"
        >
          <Edit2 size={12} />
          編集する
        </button>
      </div>

      {/* Photo carousel — natural aspect ratio, no cropping */}
      {tower.photos.length > 0 && (
        <PhotoCarousel photos={tower.photos} title={tower.title} />
      )}

      <div className="px-8 py-10 max-w-4xl mx-auto">
        <div className="flex flex-wrap gap-1.5 mb-5">
          {tower.tags.map((tag) => (
            <TagPill key={tag} label={tag} />
          ))}
        </div>
        <h1
          style={{ fontFamily: "'Noto Serif JP', serif" }}
          className="text-4xl font-light text-foreground mb-8 leading-snug"
        >
          {tower.title}
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
          <div className="space-y-5">
            {[
              {
                icon: <MapPin size={13} />,
                label: "撮影場所",
                value: tower.address,
                mono: false,
              },
              {
                icon: <Calendar size={13} />,
                label: "撮影日",
                value: fmtDate(tower.date),
                mono: true,
              },
              {
                icon: <Navigation size={13} />,
                label: "GPS座標",
                value: `${tower.latitude.toFixed(5)}, ${tower.longitude.toFixed(5)}`,
                mono: true,
              },
            ].map(({ icon, label, value, mono }) => (
              <div key={label} className="flex items-start gap-3">
                <span className="text-muted-foreground mt-0.5">{icon}</span>
                <div>
                  <div className="text-xs text-muted-foreground mb-0.5 tracking-wider">
                    {label}
                  </div>
                  <div
                    className="text-sm text-foreground"
                    style={mono ? { fontFamily: "'DM Mono', monospace" } : {}}
                  >
                    {value}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div
            className="border border-border overflow-hidden"
            style={{ height: 200 }}
          >
            <LeafletMap
              towers={[tower]}
              onTowerClick={() => {}}
              center={[tower.latitude, tower.longitude]}
              zoom={13}
              interactive={false}
              showTooltips={false}
              style={{ height: "100%" }}
            />
          </div>
        </div>

        {tower.memo && (
          <div className="border-t border-border pt-7">
            <div className="flex items-center gap-2 mb-3">
              <FileText size={13} className="text-muted-foreground" />
              <span className="text-xs text-muted-foreground tracking-wider">
                メモ
              </span>
            </div>
            <p className="text-sm text-foreground leading-relaxed max-w-xl">
              {tower.memo}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tower form (register / edit) ─────────────────────────────────────────────

const BLANK_FORM = {
  title: "",
  latitude: "",
  longitude: "",
  address: "",
  date: "",
  tags: "",
  memo: "",
};

function TowerForm({
  initLatLng,
  editTower,
  onSave,
  onCancel,
}: {
  initLatLng: { lat: number; lng: number } | null;
  editTower: Tower | null;
  onSave: (data: Omit<Tower, "id" | "createdAt">) => void;
  onCancel: () => void;
}) {
  const isEdit = editTower !== null;

  const [form, setForm] = useState(() =>
    editTower
      ? {
          title: editTower.title,
          latitude: String(editTower.latitude),
          longitude: String(editTower.longitude),
          address: editTower.address,
          date: editTower.date,
          tags: editTower.tags.join(", "),
          memo: editTower.memo,
        }
      : {
          ...BLANK_FORM,
          latitude: initLatLng ? initLatLng.lat.toFixed(5) : "",
          longitude: initLatLng ? initLatLng.lng.toFixed(5) : "",
        },
  );

  const [photos, setPhotos] = useState<string[]>(editTower?.photos ?? []);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const set = (key: keyof typeof BLANK_FORM, val: string) =>
    setForm((f) => ({ ...f, [key]: val }));
  const tagList = form.tags.split(/[,、\s]+/).filter(Boolean);

  const remaining = MAX_PHOTOS - photos.length;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).slice(0, remaining);
    if (files.length === 0) return;
    setUploading(true);
    try {
      const results = await Promise.all(files.map((f) => compressImage(f)));
      setPhotos((prev) => [...prev, ...results].slice(0, MAX_PHOTOS));
    } catch {
      // ignore
    } finally {
      setUploading(false);
      // Reset input so same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removePhoto = (i: number) =>
    setPhotos((prev) => prev.filter((_, idx) => idx !== i));

  const handleSave = () => {
    onSave({
      title: form.title || "無題の鉄塔",
      photos: photos,
      latitude: parseFloat(form.latitude) || 35.6762,
      longitude: parseFloat(form.longitude) || 139.6503,
      address: form.address,
      date: form.date || new Date().toISOString().slice(0, 10),
      memo: form.memo,
      tags: tagList,
    });
  };

  const inputCls =
    "w-full border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary/40 transition-colors";

  return (
    <div className="pt-13 min-h-screen">
      <div className="px-8 py-3 border-b border-border bg-card flex items-center gap-3">
        <button
          onClick={onCancel}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors tracking-wider"
        >
          <ArrowLeft size={13} />
          戻る
        </button>
        <span className="text-xs text-foreground tracking-wider">
          {isEdit ? "鉄塔を編集" : "新しい鉄塔を登録"}
        </span>
        {!isEdit && initLatLng && (
          <span
            style={{ fontFamily: "'DM Mono', monospace" }}
            className="ml-auto text-xs text-primary bg-primary/8 px-2.5 py-1 border border-primary/20"
          >
            地図から位置を取得済み
          </span>
        )}
      </div>

      <div className="px-8 py-10 max-w-2xl mx-auto">
        {/* Hidden file input — multiple allowed up to remaining slots */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Photo grid */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <label className="text-xs text-muted-foreground tracking-wider">
              写真
            </label>
            <span
              style={{ fontFamily: "'DM Mono', monospace" }}
              className="text-xs text-muted-foreground"
            >
              {photos.length} / {MAX_PHOTOS}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {photos.map((src, i) => (
              <div
                key={i}
                className="relative aspect-square bg-muted overflow-hidden group/photo"
              >
                <img
                  src={src}
                  alt={`写真 ${i + 1}`}
                  className="w-full h-full object-cover"
                />
                {/* Remove button */}
                <button
                  type="button"
                  onClick={() => removePhoto(i)}
                  className="absolute top-1 right-1 w-6 h-6 bg-black/55 hover:bg-black/80 text-white flex items-center justify-center opacity-0 group-hover/photo:opacity-100 transition-opacity"
                >
                  <X size={12} />
                </button>
                {/* Order badge */}
                <div
                  style={{ fontFamily: "'DM Mono', monospace" }}
                  className="absolute bottom-1 left-1 text-[10px] text-white bg-black/45 px-1.5 py-0.5"
                >
                  {i + 1}
                </div>
              </div>
            ))}

            {/* Add button */}
            {photos.length < MAX_PHOTOS && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="aspect-square border-2 border-dashed border-border hover:border-primary/50 bg-muted/40 flex flex-col items-center justify-center gap-1.5 text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
              >
                {uploading ? (
                  <div className="w-5 h-5 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
                ) : (
                  <>
                    <ImagePlus size={18} />
                    <span className="text-xs tracking-wider">追加</span>
                    {photos.length === 0 && (
                      <span className="text-[10px] opacity-60">
                        最大{MAX_PHOTOS}枚
                      </span>
                    )}
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        <div className="space-y-5">
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block tracking-wider">
              タイトル *
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="例: 〇〇変電所付近 鉄塔 No.1"
              className={inputCls}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block tracking-wider">
                撮影日
              </label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => set("date", e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block tracking-wider">
                住所
              </label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => set("address", e.target.value)}
                placeholder="例: 静岡県富士市"
                className={inputCls}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block tracking-wider flex items-center gap-1.5">
                緯度 (Latitude)
                {!isEdit && initLatLng && (
                  <span className="text-primary text-[10px]">自動入力</span>
                )}
              </label>
              <input
                type="number"
                step="0.00001"
                value={form.latitude}
                onChange={(e) => set("latitude", e.target.value)}
                placeholder="35.37280"
                className={`${inputCls} ${!isEdit && initLatLng ? "border-primary/30 bg-primary/5" : ""}`}
                style={{ fontFamily: "'DM Mono', monospace" }}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block tracking-wider flex items-center gap-1.5">
                経度 (Longitude)
                {!isEdit && initLatLng && (
                  <span className="text-primary text-[10px]">自動入力</span>
                )}
              </label>
              <input
                type="number"
                step="0.00001"
                value={form.longitude}
                onChange={(e) => set("longitude", e.target.value)}
                placeholder="138.67620"
                className={`${inputCls} ${!isEdit && initLatLng ? "border-primary/30 bg-primary/5" : ""}`}
                style={{ fontFamily: "'DM Mono', monospace" }}
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block tracking-wider">
              タグ（カンマ区切り）
            </label>
            <input
              type="text"
              value={form.tags}
              onChange={(e) => set("tags", e.target.value)}
              placeholder="例: 500kV, 懸垂型, 富士山"
              className={inputCls}
            />
            {tagList.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {tagList.map((tag) => (
                  <TagPill key={tag} label={tag} dim />
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1.5 block tracking-wider">
              メモ
            </label>
            <textarea
              value={form.memo}
              onChange={(e) => set("memo", e.target.value)}
              placeholder="撮影時の状況、気づいたこと..."
              rows={4}
              className={`${inputCls} resize-none`}
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleSave}
              className="flex-1 py-3 bg-primary text-primary-foreground text-sm tracking-wider hover:opacity-85 transition-opacity"
            >
              {isEdit ? "更新する" : "保存する"}
            </button>
            <button
              onClick={onCancel}
              className="px-6 py-3 border border-border text-muted-foreground text-sm hover:text-foreground transition-colors"
            >
              キャンセル
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [view, setView] = useState<View>("home");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [towers, setTowers] = useState<Tower[]>(() => loadTowers(SEED_TOWERS));
  const [initLatLng, setInitLatLng] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [navSource, setNavSource] = useState<NavSource>("list");
  const [savedMapView, setSavedMapView] = useState<{
    center: [number, number];
    zoom: number;
  } | null>(null);

  useEffect(() => {
    saveTowers(towers);
  }, [towers]);

  const nav = (v: View, id?: string) => {
    setView(v);
    if (id !== undefined) setSelectedId(id);
    window.scrollTo({ top: 0, behavior: "instant" });
  };

  const selectedTower = towers.find((t) => t.id === selectedId) ?? null;

  const handleNavToDetailFromMap = (
    id: string,
    center: [number, number],
    zoom: number,
  ) => {
    setSavedMapView({ center, zoom });
    setNavSource("map");
    nav("detail", id);
  };

  const handleBackFromDetail = () => {
    nav(navSource === "map" ? "map" : "list");
  };

  return (
    <div
      className="min-h-screen bg-background text-foreground"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      <Header
        view={view}
        onNav={(v) => {
          if (v === "register") {
            setInitLatLng(null);
            nav("register");
            return;
          }
          nav(v);
        }}
      />

      {view === "home" && (
        <HomePage
          towers={towers}
          onNav={(v, id) => {
            if (v === "register") {
              setInitLatLng(null);
              nav("register");
              return;
            }
            if (v === "detail" && id) {
              setNavSource("list");
              nav("detail", id);
              return;
            }
            nav(v, id);
          }}
        />
      )}

      {view === "map" && (
        <MapPage
          towers={towers}
          onNavToDetail={handleNavToDetailFromMap}
          onRegisterFromMap={(lat, lng) => {
            setInitLatLng({ lat, lng });
            nav("register");
          }}
          initialCenter={savedMapView?.center}
          initialZoom={savedMapView?.zoom}
        />
      )}

      {view === "list" && (
        <ListPage
          towers={towers}
          onNav={(v, id) => {
            if (v === "detail" && id) {
              setNavSource("list");
              nav("detail", id);
              return;
            }
            nav(v, id);
          }}
          onDelete={(id) =>
            setTowers((prev) => prev.filter((t) => t.id !== id))
          }
        />
      )}

      {view === "detail" && selectedTower && (
        <DetailPage
          tower={selectedTower}
          navSource={navSource}
          onBack={handleBackFromDetail}
          onEdit={() => nav("edit", selectedTower.id)}
        />
      )}

      {(view === "register" || view === "edit") && (
        <TowerForm
          initLatLng={view === "register" ? initLatLng : null}
          editTower={view === "edit" ? selectedTower : null}
          onSave={(data) => {
            if (view === "edit" && selectedId) {
              setTowers((prev) =>
                prev.map((t) => (t.id === selectedId ? { ...t, ...data } : t)),
              );
              nav("detail", selectedId);
            } else {
              const t: Tower = {
                id: Date.now().toString(),
                createdAt: new Date().toISOString(),
                ...data,
              };
              setTowers((prev) => [...prev, t]);
              setInitLatLng(null);
              nav("map");
            }
          }}
          onCancel={() => {
            setInitLatLng(null);
            nav(
              view === "edit" && selectedId ? "detail" : "map",
              view === "edit" ? (selectedId ?? undefined) : undefined,
            );
          }}
        />
      )}
    </div>
  );
}

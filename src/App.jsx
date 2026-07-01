import { useState, useEffect, useCallback } from "react";
import {
  Car, Wrench, PaintBucket, CheckCircle2, Clock, AlertTriangle,
  Plus, X, Search, Trash2, ChevronLeft, Tag, Gauge, FileText, RefreshCw,
  ImagePlus, Loader2, Camera, CheckSquare, Check, Pencil, Truck
} from "lucide-react";
import { supabase } from "./supabase.js";

// ---- Billede-upload til Supabase Storage -----------------------------------
async function uploadCarImage(carId, file) {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${carId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from("car-images")
    .upload(path, file, { upsert: true, cacheControl: "3600" });
  if (upErr) throw upErr;
  const { data } = supabase.storage.from("car-images").getPublicUrl(path);
  return data.publicUrl;
}

async function uploadCarImages(carId, files) {
  const urls = [];
  for (const file of files) {
    if (!file.type.startsWith("image/")) continue;
    if (file.size > 8 * 1024 * 1024) throw new Error(`"${file.name}" er for stort (max 8 MB).`);
    urls.push(await uploadCarImage(carId, file));
  }
  return urls;
}

// ---- Status system ---------------------------------------------------------
const STATUSES = {
  available: { label: "Klar til salg", color: "#1f9d55", bg: "#e8f6ee", icon: CheckCircle2 },
  listed:    { label: "Sat til salg",  color: "#0d9488", bg: "#e3f5f2", icon: Tag },
  incoming:  { label: "På vej",        color: "#b45309", bg: "#fdf3e3", icon: Truck },
  body:      { label: "Pladearbejde",  color: "#c2410c", bg: "#fdeee4", icon: Wrench },
  paint:     { label: "Lakering",      color: "#6d28d9", bg: "#f0eafc", icon: PaintBucket },
  service:   { label: "Service / klargøring", color: "#0369a1", bg: "#e6f2fb", icon: Gauge },
  sold:      { label: "Solgt",         color: "#475569", bg: "#eef1f5", icon: Tag },
  attention: { label: "Skal tjekkes",  color: "#b91c1c", bg: "#fcebea", icon: AlertTriangle },
};
const STATUS_ORDER = ["incoming", "service", "body", "paint", "attention", "available", "listed", "sold"];

const CATEGORIES = {
  engros:   { label: "Engros",             color: "#7c3aed" },
  mainline: { label: "Mainline",           color: "#0369a1" },
  private:  { label: "Private collection", color: "#b45309" },
};
const CATEGORY_ORDER = ["engros", "mainline", "private"];

const kr = (n) => n == null ? "—" : new Intl.NumberFormat("da-DK").format(n) + " kr.";
const profit = (car) => (car.price != null && car.purchase_price != null) ? car.price - car.purchase_price : null;
const profitText = (car) => {
  const p = profit(car);
  if (p == null) return "—";
  return (p >= 0 ? "+" : "") + new Intl.NumberFormat("da-DK").format(p) + " kr.";
};
const profitColor = (car) => {
  const p = profit(car);
  if (p == null) return "#0f172a";
  return p >= 0 ? "#1f9d55" : "#dc2626";
};
const today = () => new Date().toISOString().slice(0, 10);

export default function App() {
  const [cars, setCars] = useState(null);
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [catFilter, setCatFilter] = useState("all");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const SIDEBAR_W = 460;

  // Initial load + realtime subscription so every device stays in sync
  useEffect(() => {
    fetchCars();
    const channel = supabase
      .channel("cars-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "cars" }, () => fetchCars())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function fetchCars() {
    const { data, error } = await supabase
      .from("cars")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) { setError(error.message); return; }
    setCars(data || []);
  }

  const setStatus = async (car, status, note) => {
    const log = [...(car.log || []), { t: today(), s: status, note: note || STATUSES[status].label }];
    const { error } = await supabase.from("cars").update({ status, log }).eq("id", car.id);
    if (error) setError(error.message); else fetchCars();
  };

  const updateCar = async (id, patch) => {
    const { error } = await supabase.from("cars").update(patch).eq("id", id);
    if (error) setError(error.message); else fetchCars();
  };

  const addCar = async (car) => {
    const row = { ...car, log: [{ t: today(), s: car.status, note: "Tilføjet til flåden" }] };
    const { error } = await supabase.from("cars").insert(row);
    if (error) setError(error.message);
    else { setAdding(false); fetchCars(); }
  };

  const remove = async (id) => {
    const { error } = await supabase.from("cars").delete().eq("id", id);
    if (error) setError(error.message);
    else { setSelected(null); fetchCars(); }
  };

  if (cars === null) return <Shell><div style={{ padding: 40, color: "#64748b" }}>Indlæser flåde…</div></Shell>;

  const selectedCar = cars.find((c) => c.id === selected);
  const counts = STATUS_ORDER.reduce((a, s) => { a[s] = cars.filter((c) => c.status === s).length; return a; }, {});

  // Kategori-tællinger
  const catCounts = CATEGORY_ORDER.reduce((a, cat) => { a[cat] = cars.filter((c) => (c.category || "mainline") === cat).length; return a; }, {});

  // Biler i den valgte overkategori (bruges til lagerværdi)
  const carsInCat = catFilter === "all" ? cars : cars.filter((c) => (c.category || "mainline") === catFilter);
  const stockBuy = carsInCat.reduce((sum, c) => sum + (c.purchase_price || 0), 0);
  const stockSell = carsInCat.reduce((sum, c) => sum + (c.price || 0), 0);

  const filtered = cars.filter((c) => {
    const mf = filter === "all" || c.status === filter;
    const mc = catFilter === "all" || (c.category || "mainline") === catFilter;
    const q = query.toLowerCase().trim();
    const mq = !q || `${c.make} ${c.model} ${c.plate} ${c.year}`.toLowerCase().includes(q);
    return mf && mc && mq;
  });

  return (
    <Shell pushBy={viewerOpen ? SIDEBAR_W : 0}>
      {error && (
        <div style={{ background: "#fcebea", color: "#b91c1c", padding: "10px 14px", borderRadius: 9, marginBottom: 16, fontSize: 13 }}>
          Fejl: {error}. Tjek din Supabase-opsætning i SETUP.md.
        </div>
      )}
      {selectedCar ? (
        <Detail car={selectedCar} onBack={() => setSelected(null)} onSetStatus={setStatus} onUpdate={updateCar} onRemove={remove}
          sidebarWidth={SIDEBAR_W} onViewerChange={setViewerOpen} />
      ) : (
        <>
          <Header total={cars.length} counts={counts} />
          <CategoryBar catFilter={catFilter} setCatFilter={setCatFilter} catCounts={catCounts} total={cars.length} />
          <StockValue buy={stockBuy} sell={stockSell} scope={catFilter} count={carsInCat.length} />
          <Toolbar query={query} setQuery={setQuery} filter={filter} setFilter={setFilter} counts={counts} total={cars.length} onAdd={() => setAdding(true)} />
          <div style={grid}>
            {filtered.map((c) => <CarCard key={c.id} car={c} onClick={() => setSelected(c.id)} />)}
          </div>
          {filtered.length === 0 && (
            <div style={empty}>
              <Car size={32} strokeWidth={1.5} color="#94a3b8" />
              <p style={{ margin: "12px 0 0", color: "#64748b" }}>Ingen biler endnu. Klik “Tilføj bil” for at starte.</p>
            </div>
          )}
        </>
      )}
      {adding && <AddModal onClose={() => setAdding(false)} onAdd={addCar} />}
    </Shell>
  );
}

function Shell({ children, pushBy = 0 }) {
  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: "#f1f4f8", minHeight: "100vh", color: "#0f172a" }}>
      <style>{`
        * { box-sizing: border-box; } body { margin: 0; }
        @keyframes pop { from { opacity:0; transform: translateY(8px);} to {opacity:1; transform:none;} }
        button { font-family: inherit; cursor: pointer; }
        input, select, textarea { font-family: inherit; }
        .fade { animation: pop .25s ease; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: none; } }
        .sidebar { animation: slideIn .22s ease; }
      `}</style>
      <div style={{ paddingRight: pushBy, transition: "padding-right .22s ease" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 20px 60px" }}>{children}</div>
      </div>
    </div>
  );
}

function Header({ total, counts }) {
  const inWork = (counts.body || 0) + (counts.paint || 0) + (counts.service || 0);
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 38, height: 38, borderRadius: 9, background: "#0f172a", display: "grid", placeItems: "center" }}>
          <Car size={20} color="#fff" />
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: 21, fontWeight: 700, letterSpacing: "-0.02em" }}>Bilhuset Sommer</h1>
          <div style={{ fontSize: 13, color: "#64748b" }}>Flådestyring</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 22 }}>
        <Stat n={total} label="Biler i alt" />
        <Stat n={inWork} label="På værksted" accent="#c2410c" />
        <Stat n={counts.available || 0} label="Klar til salg" accent="#1f9d55" />
      </div>
    </div>
  );
}
function Stat({ n, label, accent = "#0f172a" }) {
  return (
    <div style={{ textAlign: "right" }}>
      <div style={{ fontSize: 24, fontWeight: 700, color: accent, lineHeight: 1 }}>{n}</div>
      <div style={{ fontSize: 12, color: "#64748b", marginTop: 3 }}>{label}</div>
    </div>
  );
}

function CategoryBar({ catFilter, setCatFilter, catCounts, total }) {
  const chips = [{ key: "all", label: "Alle kategorier", n: total, color: "#0f172a" },
    ...CATEGORY_ORDER.map((cat) => ({ key: cat, label: CATEGORIES[cat].label, n: catCounts[cat] || 0, color: CATEGORIES[cat].color }))];
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
      {chips.map((c) => {
        const active = catFilter === c.key;
        return (
          <button key={c.key} onClick={() => setCatFilter(c.key)}
            style={{ display: "flex", alignItems: "center", gap: 8, border: active ? `1px solid ${c.color}` : "1px solid #d8dee8", background: active ? c.color : "#fff", color: active ? "#fff" : "#475569", borderRadius: 10, padding: "9px 15px", fontSize: 14, fontWeight: 600 }}>
            {c.key !== "all" && <span style={{ width: 9, height: 9, borderRadius: 999, background: active ? "#fff" : c.color, display: "inline-block" }} />}
            {c.label}
            <span style={{ fontSize: 13, opacity: 0.75 }}>{c.n}</span>
          </button>
        );
      })}
    </div>
  );
}

function StockValue({ buy, sell, scope, count }) {
  const scopeLabel = scope === "all" ? "hele flåden" : CATEGORIES[scope]?.label;
  const fmt = (n) => new Intl.NumberFormat("da-DK").format(n) + " kr.";
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 18 }}>
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 13, padding: "16px 18px" }}>
        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 4 }}>Lagerværdi indkøb <span style={{ color: "#94a3b8" }}>· {scopeLabel}</span></div>
        <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em", color: "#0f172a" }}>{fmt(buy)}</div>
        <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 3 }}>{count} {count === 1 ? "bil" : "biler"}</div>
      </div>
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 13, padding: "16px 18px" }}>
        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 4 }}>Lagerværdi salg <span style={{ color: "#94a3b8" }}>· {scopeLabel}</span></div>
        <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em", color: "#1f9d55" }}>{fmt(sell)}</div>
        <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 3 }}>
          Avance: {(sell - buy) >= 0 ? "+" : ""}{fmt(sell - buy)}
        </div>
      </div>
    </div>
  );
}

function Toolbar({ query, setQuery, filter, setFilter, counts, total, onAdd }) {
  const chips = [{ key: "all", label: "Alle", n: total }, ...STATUS_ORDER.map((s) => ({ key: s, label: STATUSES[s].label, n: counts[s] }))];
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 240px" }}>
          <Search size={16} color="#94a3b8" style={{ position: "absolute", left: 12, top: 11 }} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Søg model, nummerplade, årgang…"
            style={{ width: "100%", padding: "10px 12px 10px 36px", border: "1px solid #d8dee8", borderRadius: 9, fontSize: 14, background: "#fff", outline: "none" }} />
        </div>
        <button onClick={onAdd} style={{ display: "flex", alignItems: "center", gap: 6, background: "#0f172a", color: "#fff", border: "none", borderRadius: 9, padding: "10px 16px", fontSize: 14, fontWeight: 600 }}>
          <Plus size={16} /> Tilføj bil
        </button>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {chips.map((c) => {
          const active = filter === c.key;
          return (
            <button key={c.key} onClick={() => setFilter(c.key)}
              style={{ border: active ? "1px solid #0f172a" : "1px solid #d8dee8", background: active ? "#0f172a" : "#fff", color: active ? "#fff" : "#475569", borderRadius: 999, padding: "6px 13px", fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
              {c.label}<span style={{ fontSize: 12, opacity: 0.7 }}>{c.n}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const grid = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 14 };
const empty = { textAlign: "center", padding: "60px 20px" };

function StatusPill({ status, small }) {
  const s = STATUSES[status]; const Icon = s.icon;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: s.bg, color: s.color, borderRadius: 999, padding: small ? "3px 9px" : "5px 11px", fontSize: small ? 12 : 13, fontWeight: 600 }}>
      <Icon size={small ? 13 : 14} /> {s.label}
    </span>
  );
}

function CarCard({ car, onClick }) {
  const s = STATUSES[car.status];
  return (
    <button onClick={onClick} className="fade" style={{ textAlign: "left", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 13, padding: 0, overflow: "hidden", display: "block", width: "100%", transition: "box-shadow .15s, transform .15s" }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 8px 22px rgba(15,23,42,.10)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.transform = "none"; }}>
      <div style={{ height: 5, background: s.color }} />
      {(() => {
        const imgs = car.images?.length ? car.images : (car.image_url ? [car.image_url] : []);
        return imgs.length ? (
          <div style={{ position: "relative", height: 150, overflow: "hidden", background: "#eef2f7" }}>
            <img src={imgs[0]} alt={`${car.make} ${car.model}`} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            {imgs.length > 1 && (
              <span style={{ position: "absolute", right: 8, bottom: 8, display: "flex", alignItems: "center", gap: 4, background: "rgba(15,23,42,.8)", color: "#fff", borderRadius: 7, padding: "3px 8px", fontSize: 12, fontWeight: 600 }}>
                <Camera size={12} /> {imgs.length}
              </span>
            )}
          </div>
        ) : (
          <div style={{ height: 150, background: "#eef2f7", display: "grid", placeItems: "center", color: "#cbd5e1" }}>
            <Camera size={30} strokeWidth={1.5} />
          </div>
        );
      })()}
      <div style={{ padding: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.01em" }}>{car.make} {car.model}</div>
        <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>{car.year} · {car.plate}</div>
        <div style={{ margin: "13px 0 12px", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <StatusPill status={car.status} small />
          {(() => {
            const cat = CATEGORIES[car.category || "mainline"];
            return (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "#f8fafc", border: "1px solid #e2e8f0", color: cat.color, borderRadius: 999, padding: "3px 9px", fontSize: 12, fontWeight: 600 }}>
                <span style={{ width: 7, height: 7, borderRadius: 999, background: cat.color, display: "inline-block" }} />
                {cat.label}
              </span>
            );
          })()}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#475569", borderTop: "1px solid #f1f5f9", paddingTop: 11 }}>
          <span>{new Intl.NumberFormat("da-DK").format(car.km || 0)} km</span>
          <span style={{ fontWeight: 600, color: "#0f172a" }}>{kr(car.price)}</span>
        </div>
        {car.location && <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 8 }}>📍 {car.location}</div>}
      </div>
    </button>
  );
}

function Detail({ car, onBack, onSetStatus, onUpdate, onRemove, sidebarWidth = 460, onViewerChange }) {
  const [note, setNote] = useState("");
  const [notesDraft, setNotesDraft] = useState(car.notes || "");
  const [pendingStatus, setPendingStatus] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [imgError, setImgError] = useState(null);
  const [viewerIndex, setViewerIndex] = useState(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedImgs, setSelectedImgs] = useState([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  useEffect(() => { setNotesDraft(car.notes || ""); }, [car.id]);
  useEffect(() => { onViewerChange?.(viewerIndex !== null); }, [viewerIndex, onViewerChange]);
  useEffect(() => { setViewerIndex(null); setSelectMode(false); setSelectedImgs([]); setEditing(false); }, [car.id]);

  const startEdit = () => {
    setForm({
      make: car.make || "", model: car.model || "", year: car.year ?? "",
      plate: car.plate || "", vin: car.vin || "", km: car.km ?? "",
      price: car.price ?? "", purchase_price: car.purchase_price ?? "", location: car.location || "",
      category: car.category || "mainline",
    });
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!form.make || !form.model) { alert("Mærke og model skal udfyldes."); return; }
    await onUpdate(car.id, {
      make: form.make.trim(),
      model: form.model.trim(),
      year: form.year === "" ? null : +form.year,
      plate: form.plate.trim(),
      vin: form.vin.trim(),
      km: form.km === "" ? 0 : +form.km,
      price: form.price === "" ? null : +form.price,
      purchase_price: form.purchase_price === "" ? null : +form.purchase_price,
      location: form.location.trim(),
      category: form.category,
    });
    setEditing(false);
  };

  const images = car.images?.length ? car.images : (car.image_url ? [car.image_url] : []);
  const MAX_IMAGES = 10;

  const applyStatus = (s) => { onSetStatus(car, s, note.trim() || null); setNote(""); setPendingStatus(null); };

  const handleImages = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    const room = MAX_IMAGES - images.length;
    if (room <= 0) { setImgError(`Du kan højst have ${MAX_IMAGES} billeder. Fjern et først.`); return; }
    const toUpload = files.slice(0, room);
    const skipped = files.length - toUpload.length;
    setImgError(null); setUploading(true);
    try {
      const newUrls = await uploadCarImages(car.id, toUpload);
      await onUpdate(car.id, { images: [...images, ...newUrls], image_url: null });
      if (skipped > 0) setImgError(`Maks ${MAX_IMAGES} billeder — ${skipped} blev ikke uploadet.`);
    } catch (err) {
      setImgError(err.message || "Upload fejlede.");
    } finally {
      setUploading(false);
    }
  };

  const removeImage = async (url) => {
    if (!confirm("Fjern dette billede?")) return;
    const idx = images.indexOf(url);
    const next = images.filter((u) => u !== url);
    await onUpdate(car.id, { images: next, image_url: null });
    if (next.length === 0) {
      setViewerIndex(null);
    } else {
      setViewerIndex(Math.min(idx, next.length - 1));
    }
  };

  const makeCover = async (url) => {
    await onUpdate(car.id, { images: [url, ...images.filter((u) => u !== url)], image_url: null });
    setViewerIndex(0);
  };

  const toggleSelect = (url) => {
    setSelectedImgs((prev) => prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url]);
  };

  const exitSelect = () => { setSelectMode(false); setSelectedImgs([]); };

  const deleteSelected = async () => {
    if (selectedImgs.length === 0) return;
    if (!confirm(`Fjern ${selectedImgs.length} ${selectedImgs.length === 1 ? "billede" : "billeder"}?`)) return;
    const next = images.filter((u) => !selectedImgs.includes(u));
    await onUpdate(car.id, { images: next, image_url: null });
    exitSelect();
  };

  return (
    <div className="fade">
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", color: "#475569", fontSize: 14, fontWeight: 500, padding: "4px 0 16px" }}>
        <ChevronLeft size={18} /> Tilbage til flåden
      </button>
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, overflow: "hidden" }}>
        <div style={{ height: 6, background: STATUSES[car.status].color }} />
        <div style={{ padding: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              {editing ? (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <EditField label="Mærke" value={form.make} onChange={(v) => setForm({ ...form, make: v })} width={140} />
                  <EditField label="Model" value={form.model} onChange={(v) => setForm({ ...form, model: v })} width={140} />
                </div>
              ) : (
                <>
                  <h2 style={{ margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em" }}>{car.make} {car.model}</h2>
                  <div style={{ color: "#64748b", fontSize: 14, marginTop: 4 }}>
                    {car.year} ·{" "}
                    {car.plate ? (
                      <a href={`https://www.tjekbil.dk/nummerplade/${car.plate.replace(/\s+/g, "").toUpperCase()}/overblik`}
                        target="_blank" rel="noopener noreferrer"
                        style={{ color: "#2563eb", textDecoration: "none", fontWeight: 600 }}
                        title="Slå op på tjekbil.dk">
                        {car.plate}
                      </a>
                    ) : "ingen nummerplade"}
                    {" "}· {car.vin || "VIN ukendt"}
                  </div>
                </>
              )}
            </div>
            {editing ? (
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={saveEdit} style={{ display: "flex", alignItems: "center", gap: 6, background: "#0f172a", color: "#fff", border: "none", borderRadius: 9, padding: "8px 14px", fontSize: 13, fontWeight: 600 }}>
                  <Check size={15} /> Gem
                </button>
                <button onClick={() => setEditing(false)} style={{ background: "#fff", border: "1px solid #d8dee8", color: "#475569", borderRadius: 9, padding: "8px 14px", fontSize: 13, fontWeight: 600 }}>
                  Annullér
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <StatusPill status={car.status} />
                <button onClick={startEdit} title="Redigér oplysninger" style={{ display: "flex", alignItems: "center", gap: 6, background: "#fff", border: "1px solid #d8dee8", color: "#475569", borderRadius: 9, padding: "8px 12px", fontSize: 13, fontWeight: 600 }}>
                  <Pencil size={14} /> Redigér
                </button>
              </div>
            )}
          </div>
          {editing ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginTop: 20 }}>
              <EditField label="Årgang" value={form.year} onChange={(v) => setForm({ ...form, year: v })} type="number" />
              <EditField label="Nummerplade" value={form.plate} onChange={(v) => setForm({ ...form, plate: v })} />
              <EditField label="VIN" value={form.vin} onChange={(v) => setForm({ ...form, vin: v })} />
              <EditField label="Kilometer" value={form.km} onChange={(v) => setForm({ ...form, km: v })} type="number" />
              <EditField label="Købspris (kr.)" value={form.purchase_price} onChange={(v) => setForm({ ...form, purchase_price: v })} type="number" />
              <EditField label="Salgspris (kr.)" value={form.price} onChange={(v) => setForm({ ...form, price: v })} type="number" />
              <EditField label="Placering" value={form.location} onChange={(v) => setForm({ ...form, location: v })} />
              <div>
                <div style={{ fontSize: 12, color: "#64748b", fontWeight: 500, marginBottom: 4 }}>Overkategori</div>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                  style={{ width: "100%", padding: "9px 11px", border: "1px solid #d8dee8", borderRadius: 8, fontSize: 14, outline: "none", background: "#fff" }}>
                  {CATEGORY_ORDER.map((cat) => <option key={cat} value={cat}>{CATEGORIES[cat].label}</option>)}
                </select>
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 1, background: "#eef2f7", border: "1px solid #eef2f7", borderRadius: 10, marginTop: 20, overflow: "hidden" }}>
              <Field label="Kilometer" value={`${new Intl.NumberFormat("da-DK").format(car.km || 0)} km`} />
              <Field label="Købspris" value={kr(car.purchase_price)} />
              <Field label="Salgspris" value={kr(car.price)} />
              <Field label="Fortjeneste" value={profitText(car)} valueColor={profitColor(car)} />
              <Field label="Placering" value={car.location || "—"} />
              <Field label="Årgang" value={car.year} />
            </div>
          )}
          <Section title={`Billeder (${images.length}/${MAX_IMAGES})`} icon={Camera}>
            {images.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 10, flexWrap: "wrap" }}>
                {selectMode ? (
                  <>
                    <div style={{ fontSize: 13, color: "#475569", fontWeight: 600 }}>
                      {selectedImgs.length} valgt
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => setSelectedImgs(selectedImgs.length === images.length ? [] : [...images])}
                        style={{ background: "#fff", border: "1px solid #d8dee8", color: "#475569", borderRadius: 8, padding: "6px 12px", fontSize: 13, fontWeight: 600 }}>
                        {selectedImgs.length === images.length ? "Fravælg alle" : "Vælg alle"}
                      </button>
                      <button onClick={deleteSelected} disabled={selectedImgs.length === 0}
                        style={{ display: "flex", alignItems: "center", gap: 6, background: selectedImgs.length ? "#dc2626" : "#fca5a5", color: "#fff", border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 13, fontWeight: 600, cursor: selectedImgs.length ? "pointer" : "default" }}>
                        <Trash2 size={14} /> Slet valgte
                      </button>
                      <button onClick={exitSelect}
                        style={{ background: "#fff", border: "1px solid #d8dee8", color: "#475569", borderRadius: 8, padding: "6px 12px", fontSize: 13, fontWeight: 600 }}>
                        Annullér
                      </button>
                    </div>
                  </>
                ) : (
                  <button onClick={() => setSelectMode(true)}
                    style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, background: "#fff", border: "1px solid #d8dee8", color: "#475569", borderRadius: 8, padding: "6px 12px", fontSize: 13, fontWeight: 600 }}>
                    <CheckSquare size={14} /> Vælg flere
                  </button>
                )}
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
              {images.map((url, i) => {
                const checked = selectedImgs.includes(url);
                return (
                  <button key={url} onClick={() => selectMode ? toggleSelect(url) : setViewerIndex(i)}
                    style={{ position: "relative", aspectRatio: "1 / 1", padding: 0, border: checked ? "2px solid #2563eb" : i === 0 ? "2px solid #0f172a" : "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden", cursor: "pointer", background: "#eef2f7" }}>
                    <img src={url} alt={`Billede ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", opacity: selectMode && !checked ? 0.65 : 1 }} />
                    {i === 0 && (
                      <span style={{ position: "absolute", left: 5, top: 5, background: "#0f172a", color: "#fff", borderRadius: 5, padding: "1px 6px", fontSize: 10, fontWeight: 700 }}>COVER</span>
                    )}
                    {selectMode && (
                      <span style={{ position: "absolute", right: 6, top: 6, width: 24, height: 24, borderRadius: 6, background: checked ? "#2563eb" : "rgba(255,255,255,.9)", border: checked ? "none" : "1px solid #cbd5e1", display: "grid", placeItems: "center" }}>
                        {checked && <Check size={16} color="#fff" />}
                      </span>
                    )}
                  </button>
                );
              })}
              {!selectMode && images.length < MAX_IMAGES && (
                <label style={{ aspectRatio: "1 / 1", display: "grid", placeItems: "center", gap: 6, border: "2px dashed #cbd5e1", borderRadius: 10, cursor: uploading ? "default" : "pointer", color: "#64748b", background: "#f8fafc" }}>
                  {uploading ? <Loader2 size={22} className="spin" /> : <ImagePlus size={22} />}
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{uploading ? "Uploader…" : "Tilføj"}</span>
                  <input type="file" accept="image/*" multiple onChange={handleImages} disabled={uploading} style={{ display: "none" }} />
                </label>
              )}
            </div>
            {imgError && <div style={{ color: "#b91c1c", fontSize: 13, marginTop: 10 }}>{imgError}</div>}
            {images.length === 0 && !imgError && (
              <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 10 }}>Ingen billeder endnu. Klik “Tilføj” for at uploade (op til {MAX_IMAGES}).</div>
            )}
          </Section>
          <Section title="Skift status" icon={Wrench}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              {STATUS_ORDER.map((s) => {
                const st = STATUSES[s]; const Icon = st.icon; const active = pendingStatus === s || (pendingStatus === null && car.status === s);
                return (
                  <button key={s} onClick={() => setPendingStatus(s)} style={{ display: "flex", alignItems: "center", gap: 6, border: `1px solid ${active ? st.color : "#d8dee8"}`, background: active ? st.bg : "#fff", color: active ? st.color : "#475569", borderRadius: 9, padding: "8px 12px", fontSize: 13, fontWeight: 600 }}>
                    <Icon size={14} /> {st.label}
                  </button>
                );
              })}
            </div>
            {pendingStatus && pendingStatus !== car.status && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Tilføj note til denne ændring (valgfrit)" style={{ flex: "1 1 240px", padding: "9px 12px", border: "1px solid #d8dee8", borderRadius: 9, fontSize: 14 }} />
                <button onClick={() => applyStatus(pendingStatus)} style={{ background: "#0f172a", color: "#fff", border: "none", borderRadius: 9, padding: "9px 18px", fontSize: 14, fontWeight: 600 }}>Bekræft ændring</button>
              </div>
            )}
          </Section>
          <Section title="Noter & arbejde" icon={FileText}>
            <textarea value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} onBlur={() => onUpdate(car.id, { notes: notesDraft })} rows={3} placeholder="Beskriv arbejdet — fx lakering, pladearbejde, reservedele…" style={{ width: "100%", padding: 12, border: "1px solid #d8dee8", borderRadius: 9, fontSize: 14, resize: "vertical", lineHeight: 1.5 }} />
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>Gemmes automatisk når du klikker ud af feltet.</div>
          </Section>
          <Section title="Historik" icon={Clock}>
            <div style={{ borderLeft: "2px solid #e2e8f0", paddingLeft: 16, marginLeft: 4 }}>
              {[...(car.log || [])].reverse().map((l, i) => {
                const st = STATUSES[l.s] || STATUSES.service;
                return (
                  <div key={i} style={{ position: "relative", paddingBottom: 16 }}>
                    <div style={{ position: "absolute", left: -23, top: 3, width: 10, height: 10, borderRadius: 999, background: st.color, border: "2px solid #fff" }} />
                    <div style={{ fontSize: 13, fontWeight: 600, color: st.color }}>{st.label}</div>
                    <div style={{ fontSize: 13, color: "#475569", marginTop: 1 }}>{l.note}</div>
                    <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>{l.t}</div>
                  </div>
                );
              })}
            </div>
          </Section>
          <button onClick={() => { if (confirm(`Fjern ${car.make} ${car.model} fra flåden?`)) onRemove(car.id); }} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "1px solid #fca5a5", color: "#dc2626", borderRadius: 9, padding: "8px 14px", fontSize: 13, fontWeight: 600, marginTop: 24 }}>
            <Trash2 size={14} /> Fjern bil
          </button>
        </div>
      </div>
      {viewerIndex !== null && images[viewerIndex] && (
        <div className="sidebar" style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: sidebarWidth, maxWidth: "92vw", background: "#fff", zIndex: 61, boxShadow: "-8px 0 30px rgba(15,23,42,.15)", display: "flex", flexDirection: "column", borderLeft: "1px solid #e2e8f0" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px", borderBottom: "1px solid #eef2f7" }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Billede {viewerIndex + 1} af {images.length}</div>
              <button onClick={() => setViewerIndex(null)} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", display: "grid", placeItems: "center" }}><X size={20} /></button>
            </div>
            <div style={{ flex: 1, background: "#0f172a", display: "grid", placeItems: "center", position: "relative", overflow: "hidden" }}>
              <img src={images[viewerIndex]} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" }} />
              {images.length > 1 && (
                <>
                  <button onClick={() => setViewerIndex((viewerIndex - 1 + images.length) % images.length)}
                    style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", background: "rgba(255,255,255,.18)", color: "#fff", border: "none", borderRadius: 9, width: 38, height: 38, display: "grid", placeItems: "center", cursor: "pointer" }}>
                    <ChevronLeft size={22} />
                  </button>
                  <button onClick={() => setViewerIndex((viewerIndex + 1) % images.length)}
                    style={{ position: "absolute", right: 10, top: "50%", background: "rgba(255,255,255,.18)", color: "#fff", border: "none", borderRadius: 9, width: 38, height: 38, display: "grid", placeItems: "center", cursor: "pointer", transform: "translateY(-50%) rotate(180deg)" }}>
                    <ChevronLeft size={22} />
                  </button>
                </>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, padding: 14, borderTop: "1px solid #eef2f7" }}>
              {viewerIndex !== 0 && (
                <button onClick={() => makeCover(images[viewerIndex])}
                  style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "#0f172a", color: "#fff", border: "none", borderRadius: 9, padding: "10px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  ★ Gør til cover
                </button>
              )}
              <button onClick={() => removeImage(images[viewerIndex])}
                style={{ flex: viewerIndex === 0 ? 1 : "0 0 auto", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "#fff", color: "#dc2626", border: "1px solid #fca5a5", borderRadius: 9, padding: "10px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                <Trash2 size={15} /> Fjern
              </button>
            </div>
            {images.length > 1 && (
              <div style={{ display: "flex", gap: 8, padding: "0 14px 16px", overflowX: "auto" }}>
                {images.map((url, i) => {
                  const active = i === viewerIndex;
                  return (
                    <div key={url} onClick={() => setViewerIndex(i)}
                      style={{ position: "relative", flex: "0 0 auto", cursor: "pointer", borderRadius: 8, padding: 2, background: active ? "#2563eb" : "transparent" }}>
                      <img src={url} alt=""
                        style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 6, display: "block", opacity: active ? 1 : 0.5, transition: "opacity .15s" }} />
                      {active && (
                        <span style={{ position: "absolute", inset: 2, borderRadius: 6, boxShadow: "inset 0 0 0 2px #fff", pointerEvents: "none" }} />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
      )}
    </div>
  );
}

function Field({ label, value, valueColor }) {
  return (
    <div style={{ background: "#fff", padding: "12px 14px" }}>
      <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: valueColor || "#0f172a" }}>{value}</div>
    </div>
  );
}
function EditField({ label, value, onChange, type = "text", width }) {
  return (
    <div style={{ width }}>
      <div style={{ fontSize: 12, color: "#64748b", fontWeight: 500, marginBottom: 4 }}>{label}</div>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
        style={{ width: "100%", padding: "9px 11px", border: "1px solid #d8dee8", borderRadius: 8, fontSize: 14, outline: "none" }} />
    </div>
  );
}
function Section({ title, icon: Icon, children }) {
  return (
    <div style={{ marginTop: 26 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 12 }}>
        <Icon size={16} color="#64748b" />
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "#475569" }}>{title}</h3>
      </div>
      {children}
    </div>
  );
}

function AddModal({ onClose, onAdd }) {
  const [f, setF] = useState({ make: "", model: "", year: "", plate: "", vin: "", km: "", purchase_price: "", price: "", status: "service", category: "mainline", location: "", notes: "" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = () => {
    if (!f.make || !f.model) return alert("Mærke og model skal udfyldes.");
    onAdd({ ...f, year: +f.year || new Date().getFullYear(), km: +f.km || 0, price: +f.price || null, purchase_price: +f.purchase_price || null });
  };
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", display: "grid", placeItems: "center", padding: 20, zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} className="fade" style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 520, maxHeight: "90vh", overflow: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 22px", borderBottom: "1px solid #eef2f7" }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Tilføj bil</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#94a3b8" }}><X size={20} /></button>
        </div>
        <div style={{ padding: 22, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Input label="Mærke" v={f.make} on={set("make")} />
          <Input label="Model" v={f.model} on={set("model")} />
          <Input label="Årgang" v={f.year} on={set("year")} type="number" />
          <Input label="Nummerplade" v={f.plate} on={set("plate")} />
          <Input label="VIN" v={f.vin} on={set("vin")} />
          <Input label="Kilometer" v={f.km} on={set("km")} type="number" />
          <Input label="Købspris (kr.)" v={f.purchase_price} on={set("purchase_price")} type="number" />
          <Input label="Salgspris (kr.)" v={f.price} on={set("price")} type="number" />
          <Input label="Placering" v={f.location} on={set("location")} />
          <div style={{ gridColumn: "1 / -1" }}>
            <Label>Overkategori</Label>
            <select value={f.category} onChange={set("category")} style={inputStyle}>
              {CATEGORY_ORDER.map((cat) => <option key={cat} value={cat}>{CATEGORIES[cat].label}</option>)}
            </select>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <Label>Status</Label>
            <select value={f.status} onChange={set("status")} style={inputStyle}>
              {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUSES[s].label}</option>)}
            </select>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <Label>Noter</Label>
            <textarea value={f.notes} onChange={set("notes")} rows={2} style={{ ...inputStyle, resize: "vertical" }} />
          </div>
        </div>
        <div style={{ padding: "0 22px 22px", display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ background: "#fff", border: "1px solid #d8dee8", color: "#475569", borderRadius: 9, padding: "10px 18px", fontWeight: 600 }}>Annullér</button>
          <button onClick={submit} style={{ background: "#0f172a", color: "#fff", border: "none", borderRadius: 9, padding: "10px 20px", fontWeight: 600 }}>Tilføj til flåde</button>
        </div>
      </div>
    </div>
  );
}
const inputStyle = { width: "100%", padding: "9px 12px", border: "1px solid #d8dee8", borderRadius: 9, fontSize: 14, marginTop: 5 };
function Label({ children }) { return <div style={{ fontSize: 12, color: "#64748b", fontWeight: 500 }}>{children}</div>; }
function Input({ label, v, on, type = "text" }) {
  return <div><Label>{label}</Label><input type={type} value={v} onChange={on} style={inputStyle} /></div>;
}

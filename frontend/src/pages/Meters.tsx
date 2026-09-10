import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getEffectiveUserId } from "../lib/user";

interface Address {
  id: number;
  city: string;
  street: string;
  house: string;
  apartment?: string | null;
  is_primary: number;
}

interface Reading {
  id: number;
  resource: string;
  value: number;
  measured_at: string;
  street?: string | null;
  house?: string | null;
  apartment?: string | null;
}

const RESOURCES = [
  { value: "cold_water", label: "Холодная вода" },
  { value: "hot_water", label: "Горячая вода" },
  { value: "electricity", label: "Электричество" },
  { value: "gas", label: "Газ" },
  { value: "heating", label: "Отопление" },
];

const RESOURCE_NAMES: Record<string, string> = Object.fromEntries(RESOURCES.map((r) => [r.value, r.label]));

export default function Meters() {
  const navigate = useNavigate();
  const [uid] = useState(() => getEffectiveUserId());
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [loading, setLoading] = useState(true);
  const [addressId, setAddressId] = useState<string>("");
  const [resource, setResource] = useState("cold_water");
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function load() {
    try {
      const [ar, mr] = await Promise.all([
        fetch(`/api/users/${encodeURIComponent(uid)}/addresses`),
        fetch(`/api/users/${encodeURIComponent(uid)}/meter-readings?limit=20`),
      ]);
      if (ar.ok) {
        const list = await ar.json();
        setAddresses(Array.isArray(list) ? list : []);
        if (Array.isArray(list) && list.length && !addressId) {
          const primary = list.find((a: Address) => a.is_primary) || list[0];
          setAddressId(String(primary.id));
        }
      }
      if (mr.ok) {
        const list = await mr.json();
        setReadings(Array.isArray(list) ? list : []);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setMsg("");
    const num = Number(String(value).replace(",", "."));
    if (!addressId) { setErr("Сначала укажите адрес в профиле."); return; }
    if (!Number.isFinite(num) || num < 0 || num > 1_000_000) { setErr("Введите число с прибора, например 123.5"); return; }
    setSending(true);
    try {
      const r = await fetch("/api/meter-readings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: uid,
          address_id: Number(addressId),
          resource,
          value: num,
          measured_at: new Date().toISOString(),
        }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const saved = await r.json();
      setMsg(`Готово: ${RESOURCE_NAMES[resource]} — ${saved.value}`);
      setValue("");
      await load();
    } catch {
      setErr("Не сохранилось. Проверьте связь и попробуйте позже.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]" style={{ fontFamily: "'Inter', sans-serif" }}>
      <header className="bg-white border-b border-[#E2E8F0] sticky top-0 z-20">
        <div className="max-w-[1280px] mx-auto px-8 h-16 flex items-center justify-between">
          <button onClick={() => navigate("/")} className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#1B5EBE] flex items-center justify-center">
              <svg viewBox="0 0 20 20" fill="white" className="w-4 h-4"><path d="M10 2L2 8v10h5v-5h6v5h5V8L10 2z" /></svg>
            </div>
            <span className="text-[15px] font-bold tracking-tight text-[#0F172A]">ЖКХ-<span className="text-[#1B5EBE]">помощник</span></span>
          </button>
          <button onClick={() => navigate("/")} className="text-[13px] font-medium text-[#64748B] hover:text-[#1B5EBE] transition-colors">На главную</button>
        </div>
      </header>

      <main className="max-w-[900px] mx-auto px-8 py-10">
        <h1 className="text-[28px] font-extrabold text-[#0F172A] mb-1">Подать показания</h1>
        <p className="text-[14px] text-[#64748B] mb-6">Показания привязываются к вашему адресу из профиля (в том числе из бота)</p>

        <form onSubmit={submit} className="bg-white border border-[#E2E8F0] rounded-2xl p-6 mb-6">
          {loading ? (
            <p className="text-[14px] text-[#64748B]">Загружаю адреса…</p>
          ) : !addresses.length ? (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
              <p className="text-[13px] text-amber-800 mb-3">Адреса нет — заполните его в профиле (или пройдите /register в боте и привяжите Telegram).</p>
              <button type="button" onClick={() => navigate("/profile")} className="bg-[#1B5EBE] text-white text-[13px] font-semibold px-5 py-2.5 rounded-xl">Открыть профиль</button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-[12px] font-semibold text-[#94A3B8] uppercase tracking-wide mb-2">Адрес</label>
                <select value={addressId} onChange={(e) => setAddressId(e.target.value)} className="w-full bg-[#F8FAFC] border-2 border-[#E2E8F0] rounded-xl px-4 py-3 text-[14px] outline-none focus:border-[#1B5EBE]">
                  {addresses.map((a) => (
                    <option key={a.id} value={a.id}>{a.city}, {a.street} {a.house}{a.apartment ? `, кв. ${a.apartment}` : ""}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-[#94A3B8] uppercase tracking-wide mb-2">Ресурс</label>
                <select value={resource} onChange={(e) => setResource(e.target.value)} className="w-full bg-[#F8FAFC] border-2 border-[#E2E8F0] rounded-xl px-4 py-3 text-[14px] outline-none focus:border-[#1B5EBE]">
                  {RESOURCES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-[#94A3B8] uppercase tracking-wide mb-2">Значение</label>
                <input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" placeholder="123.5" className="w-full bg-[#F8FAFC] border-2 border-[#E2E8F0] rounded-xl px-4 py-3 text-[14px] outline-none focus:border-[#1B5EBE]" />
              </div>
              <div className="col-span-2 flex items-center gap-3">
                <button type="submit" disabled={sending} className="bg-[#1B5EBE] hover:bg-[#1449A0] disabled:bg-[#CBD5E1] text-white text-[14px] font-semibold px-6 py-3 rounded-xl transition-colors">
                  {sending ? "Отправка…" : "Отправить показания"}
                </button>
                {msg && <span className="text-[13px] text-emerald-600 font-medium">{msg}</span>}
              </div>
              {err && <p className="col-span-2 text-[13px] text-red-600">{err}</p>}
            </div>
          )}
        </form>

        <h2 className="text-[18px] font-bold text-[#0F172A] mb-4">Последние показания</h2>
        {!readings.length ? (
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-8 text-center text-[14px] text-[#64748B]">Показаний пока нет — отправьте первое выше.</div>
        ) : (
          <div className="space-y-3">
            {readings.map((m) => (
              <div key={m.id} className="bg-white border border-[#E2E8F0] rounded-2xl p-5 flex items-center justify-between">
                <div>
                  <p className="text-[14px] font-semibold text-[#0F172A]">{RESOURCE_NAMES[m.resource] || m.resource}</p>
                  <p className="text-[12px] text-[#94A3B8]">{m.street ? `${m.street} ${m.house || ""}${m.apartment ? `, кв. ${m.apartment}` : ""} · ` : ""}{String(m.measured_at).slice(0, 10)}</p>
                </div>
                <p className="text-[18px] font-extrabold text-[#0F172A]">{m.value}</p>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

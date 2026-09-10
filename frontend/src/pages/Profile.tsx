import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getEffectiveUserId, getWebUserId } from "../lib/user";

interface ProfileData {
  city: string;
  street: string;
  house: string;
  apartment: string;
  phone: string;
}

interface Receipt {
  billing_period: string;
  provider: string;
  amount_cents: number;
  status: string;
}

interface Reading {
  id: number;
  resource: string;
  value: number;
  measured_at: string;
  street?: string;
  house?: string;
}

const RESOURCE_NAMES: Record<string, string> = {
  cold_water: "Холодная вода",
  hot_water: "Горячая вода",
  electricity: "Электричество",
  gas: "Газ",
  heating: "Отопление",
};

const RECEIPT_STATUS: Record<string, string> = {
  unpaid: "не оплачена",
  paid: "оплачена",
  overdue: "просрочена",
  cancelled: "отменена",
};

export default function Profile() {
  const navigate = useNavigate();
  const [uid] = useState(() => getEffectiveUserId());

  const tgUser = (() => {
    try {
      return JSON.parse(localStorage.getItem("tg_user") || "{}");
    } catch {
      return {};
    }
  })();

  const saved = (() => {
    try {
      return JSON.parse(localStorage.getItem("profile") || "{}");
    } catch {
      return {};
    }
  })();

  const [form, setForm] = useState<ProfileData>({
    city: saved.city || "",
    street: saved.street || "",
    house: saved.house || "",
    apartment: saved.apartment || "",
    phone: saved.phone || "",
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [savedFlag, setSavedFlag] = useState(false);
  const [fromServer, setFromServer] = useState(false);

  const [linkCode, setLinkCode] = useState("");
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkError, setLinkError] = useState("");
  const isLinked = localStorage.getItem("tg_linked") === "true";

  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [mgmtName, setMgmtName] = useState("");

  const initials =
    (tgUser.first_name?.[0] || "И") + (tgUser.last_name?.[0] || "П");
  const displayName = tgUser.first_name
    ? `${tgUser.first_name} ${tgUser.last_name || ""}`.trim()
    : tgUser.display_name || "Пользователь";
  const username = tgUser.username ? `@${tgUser.username}` : tgUser.telegram_username ? `@${tgUser.telegram_username}` : "";

  // Подтягиваем то, что вводили в боте (/register хранит всё в базе)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`/api/users/${encodeURIComponent(uid)}/profile`);
        if (r.ok) {
          const p = await r.json();
          if (!alive) return;
          const next: ProfileData = {
            city: p.city || "",
            street: p.street || "",
            house: p.house || "",
            apartment: p.apartment || "",
            phone: p.phone || "",
          };
          // Сервер — источник правды, если там что-то заполнено
          if (next.city || next.street || next.phone) {
            setForm(next);
            localStorage.setItem("profile", JSON.stringify(next));
            setFromServer(true);
          }
          if (p.display_name || p.telegram_username) {
            try {
              const cur = JSON.parse(localStorage.getItem("tg_user") || "{}");
              localStorage.setItem(
                "tg_user",
                JSON.stringify({
                  ...cur,
                  id: p.id || cur.id,
                  display_name: p.display_name || cur.display_name,
                  telegram_username: p.telegram_username || cur.telegram_username,
                })
              );
            } catch { /* ignore */ }
          }
        }
      } catch { /* offline — покажем кэш */ }
      finally {
        if (alive) setLoading(false);
      }
      // Квитанции / показания / УК для этого же пользователя
      try {
        const rr = await fetch(`/api/users/${encodeURIComponent(uid)}/receipts?limit=3`);
        if (rr.ok && alive) setReceipts(await rr.json());
      } catch { /* ignore */ }
      try {
        const mr = await fetch(`/api/users/${encodeURIComponent(uid)}/meter-readings?limit=3`);
        if (mr.ok && alive) setReadings(await mr.json());
      } catch { /* ignore */ }
      try {
        const or = await fetch(`/api/users/${encodeURIComponent(uid)}/organization`);
        if (or.ok && alive) {
          const d = await or.json();
          if (d?.management?.name) setMgmtName(d.management.name);
        }
      } catch { /* ignore */ }
    })();
    return () => { alive = false; };
  }, [uid]);

  function handleChange(field: keyof ProfileData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSavedFlag(false);
    setSaveError("");
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError("");
    try {
      const r = await fetch(`/api/users/${encodeURIComponent(uid)}/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: form.phone || null,
          city: form.city || null,
          street: form.street || null,
          house: form.house || null,
          apartment: form.apartment || null,
        }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const p = await r.json();
      const next: ProfileData = {
        city: p.city || form.city,
        street: p.street || form.street,
        house: p.house || form.house,
        apartment: p.apartment || form.apartment,
        phone: p.phone || form.phone,
      };
      setForm(next);
      localStorage.setItem("profile", JSON.stringify(next));
      setSavedFlag(true);
      setTimeout(() => setSavedFlag(false), 2500);
    } catch {
      // Нет связи — сохраним хотя бы локально, чтобы не потерять ввод
      localStorage.setItem("profile", JSON.stringify(form));
      setSaveError("Нет связи с сервером — сохранил локально. Проверьте позже.");
    } finally {
      setSaving(false);
    }
  }

  async function handleLinkTelegram(e: React.FormEvent) {
    e.preventDefault();
    setLinkError("");

    const code = linkCode.replace(/\D/g, "").slice(0, 6);
    if (code.length !== 6) {
      setLinkError("Введите 6-значный код");
      return;
    }

    setLinkLoading(true);
    try {
      const r = await fetch("/api/users/link-telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          web_user_id: getWebUserId(),
          code,
        }),
      });

      if (!r.ok) throw new Error(`HTTP ${r.status}`);

      const data = await r.json();
      if (data?.ok === false || data?.error) {
        setLinkError(data.error || "Неверный код или он истёк");
        return;
      }

      if (data?.user) {
        const u = data.user;
        // После привязки единый id — telegram-xxx: все запросы пойдут с ним
        const prev = (() => { try { return JSON.parse(localStorage.getItem("tg_user") || "{}"); } catch { return {}; } })();
        localStorage.setItem("tg_user", JSON.stringify({
          ...prev,
          id: u.id,
          first_name: prev.first_name || u.display_name?.split(" ")?.[0],
          last_name: prev.last_name || u.display_name?.split(" ")?.slice(1)?.join(" "),
          display_name: u.display_name,
          username: u.telegram_username || prev.username,
          telegram_username: u.telegram_username,
        }));
        if (u.city || u.street || u.phone) {
          const next = {
            city: u.city || "",
            street: u.street || "",
            house: u.house || "",
            apartment: u.apartment || "",
            phone: u.phone || "",
          };
          localStorage.setItem("profile", JSON.stringify(next));
        }
      }
      localStorage.setItem("auth", "true");
      localStorage.setItem("tg_linked", "true");
      setLinkCode("");
      window.location.reload();
    } catch {
      setLinkError("Сервис недоступен. Попробуйте позже");
    } finally {
      setLinkLoading(false);
    }
  }

  function logout() {
    localStorage.removeItem("auth");
    localStorage.removeItem("tg_user");
    localStorage.removeItem("tg_linked");
    navigate("/");
  }

  const isComplete = form.city && form.street && form.house && form.apartment;

  return (
    <div className="min-h-screen bg-[#F8FAFC]" style={{ fontFamily: "'Inter', sans-serif" }}>
      <header className="bg-white border-b border-[#E2E8F0] sticky top-0 z-20">
        <div className="max-w-[1280px] mx-auto px-8 h-16 flex items-center justify-between">
          <button onClick={() => navigate("/")} className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#1B5EBE] flex items-center justify-center">
              <svg viewBox="0 0 20 20" fill="white" className="w-4 h-4">
                <path d="M10 2L2 8v10h5v-5h6v5h5V8L10 2z" />
              </svg>
            </div>
            <span className="text-[15px] font-bold tracking-tight text-[#0F172A]">
              ЖКХ-<span className="text-[#1B5EBE]">помощник</span>
            </span>
          </button>

          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/")}
              className="text-[13px] font-medium text-[#64748B] hover:text-[#1B5EBE] transition-colors"
            >
              На главную
            </button>
            <div className="w-px h-5 bg-[#E2E8F0]" />
            <button
              onClick={logout}
              className="text-[13px] font-medium text-[#64748B] hover:text-red-600 transition-colors"
            >
              Выйти
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[900px] mx-auto px-8 py-10">
        <h1 className="text-[28px] font-extrabold text-[#0F172A] mb-1">Личный кабинет</h1>
        <p className="text-[14px] text-[#64748B] mb-8">
          {loading
            ? "Загружаю данные…"
            : fromServer
              ? "Данные подтянуты из вашего профиля (в том числе из бота)"
              : "Заполните данные — они используются для отключений, квитанций и обращений в УК"}
        </p>

        <div className="grid grid-cols-3 gap-6">
          <aside className="col-span-1">
            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6">
              <div className="flex flex-col items-center text-center">
                <div className="w-20 h-20 rounded-full bg-[#1B5EBE] flex items-center justify-center text-white text-[28px] font-bold mb-4">
                  {initials}
                </div>
                <p className="text-[16px] font-bold text-[#0F172A] mb-0.5">{displayName}</p>
                {username && <p className="text-[13px] text-[#64748B]">{username}</p>}
              </div>

              <div className="border-t border-[#E2E8F0] mt-6 pt-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[12px] text-[#94A3B8]">Статус</span>
                  {isComplete ? (
                    <span className="text-[12px] font-semibold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                      Заполнен
                    </span>
                  ) : (
                    <span className="text-[12px] font-semibold text-amber-700 bg-amber-100 px-2.5 py-0.5 rounded-full">
                      Не заполнен
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-[#94A3B8]">Telegram</span>
                  {isLinked ? (
                    <span className="text-[12px] font-semibold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                      Привязан
                    </span>
                  ) : (
                    <span className="text-[12px] font-semibold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full">
                      Не привязан
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 mt-4 space-y-3">
              <button onClick={() => navigate("/receipts")} className="w-full text-left p-3 rounded-xl bg-[#F8FAFC] hover:bg-[#EBF2FF] transition-colors">
                <p className="text-[13px] font-semibold text-[#0F172A]">🧾 Мои квитанции</p>
                <p className="text-[12px] text-[#64748B]">{receipts.length ? `Последняя: ${receipts[0].billing_period} — ${(receipts[0].amount_cents / 100).toFixed(2)} ₽` : "Пока нет данных"}</p>
              </button>
              <button onClick={() => navigate("/meters")} className="w-full text-left p-3 rounded-xl bg-[#F8FAFC] hover:bg-teal-50 transition-colors">
                <p className="text-[13px] font-semibold text-[#0F172A]">💡 Показания</p>
                <p className="text-[12px] text-[#64748B]">{readings.length ? `${RESOURCE_NAMES[readings[0].resource] || readings[0].resource}: ${readings[0].value}` : "Подать показания"}</p>
              </button>
              <button onClick={() => navigate("/company")} className="w-full text-left p-3 rounded-xl bg-[#F8FAFC] hover:bg-violet-50 transition-colors">
                <p className="text-[13px] font-semibold text-[#0F172A]">🏠 Моя УК</p>
                <p className="text-[12px] text-[#64748B]">{mgmtName || "Узнать свою УК"}</p>
              </button>
            </div>
          </aside>

          <section className="col-span-2 space-y-6">
            <form onSubmit={handleSave} className="bg-white border border-[#E2E8F0] rounded-2xl p-6">
              <h2 className="text-[16px] font-bold text-[#0F172A] mb-5">Адрес проживания</h2>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="col-span-2">
                  <label className="block text-[12px] font-semibold text-[#94A3B8] uppercase tracking-wide mb-2">
                    Город
                  </label>
                  <input
                    type="text"
                    value={form.city}
                    onChange={(e) => handleChange("city", e.target.value)}
                    placeholder="Томск"
                    className="w-full bg-[#F8FAFC] border-2 border-[#E2E8F0] rounded-xl px-4 py-3 text-[14px] text-[#0F172A] placeholder-[#94A3B8] outline-none focus:border-[#1B5EBE] focus:bg-white transition-colors"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-[12px] font-semibold text-[#94A3B8] uppercase tracking-wide mb-2">
                    Улица
                  </label>
                  <input
                    type="text"
                    value={form.street}
                    onChange={(e) => handleChange("street", e.target.value)}
                    placeholder="ул. Ленина"
                    className="w-full bg-[#F8FAFC] border-2 border-[#E2E8F0] rounded-xl px-4 py-3 text-[14px] text-[#0F172A] placeholder-[#94A3B8] outline-none focus:border-[#1B5EBE] focus:bg-white transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-[#94A3B8] uppercase tracking-wide mb-2">
                    Дом
                  </label>
                  <input
                    type="text"
                    value={form.house}
                    onChange={(e) => handleChange("house", e.target.value)}
                    placeholder="15"
                    className="w-full bg-[#F8FAFC] border-2 border-[#E2E8F0] rounded-xl px-4 py-3 text-[14px] text-[#0F172A] placeholder-[#94A3B8] outline-none focus:border-[#1B5EBE] focus:bg-white transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-[#94A3B8] uppercase tracking-wide mb-2">
                    Квартира
                  </label>
                  <input
                    type="text"
                    value={form.apartment}
                    onChange={(e) => handleChange("apartment", e.target.value)}
                    placeholder="42"
                    className="w-full bg-[#F8FAFC] border-2 border-[#E2E8F0] rounded-xl px-4 py-3 text-[14px] text-[#0F172A] placeholder-[#94A3B8] outline-none focus:border-[#1B5EBE] focus:bg-white transition-colors"
                  />
                </div>
              </div>

              <h2 className="text-[16px] font-bold text-[#0F172A] mb-5 mt-8">Контакты</h2>

              <div className="mb-6">
                <label className="block text-[12px] font-semibold text-[#94A3B8] uppercase tracking-wide mb-2">
                  Телефон
                </label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => handleChange("phone", e.target.value)}
                  placeholder="+7 (___) ___-__-__"
                  className="w-full bg-[#F8FAFC] border-2 border-[#E2E8F0] rounded-xl px-4 py-3 text-[14px] text-[#0F172A] placeholder-[#94A3B8] outline-none focus:border-[#1B5EBE] focus:bg-white transition-colors"
                />
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-[#1B5EBE] hover:bg-[#1449A0] disabled:bg-[#CBD5E1] text-white text-[14px] font-semibold px-6 py-3 rounded-xl transition-colors"
                >
                  {saving ? "Сохранение…" : "Сохранить"}
                </button>
                {savedFlag && (
                  <span className="text-[13px] text-emerald-600 font-medium flex items-center gap-1.5">
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                      <path d="M3 8l3 3 7-7" />
                    </svg>
                    Сохранено
                  </span>
                )}
              </div>
              {saveError && <p className="text-[13px] text-amber-700 mt-3">{saveError}</p>}
              {receipts.length > 0 && (
                <p className="text-[12px] text-[#94A3B8] mt-4">
                  Последняя квитанция: {receipts[0].billing_period} · {receipts[0].provider} · {(receipts[0].amount_cents / 100).toFixed(2)} ₽ ({RECEIPT_STATUS[receipts[0].status] || receipts[0].status})
                </p>
              )}
            </form>

            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-xl bg-[#229ED9] flex items-center justify-center">
                  <svg viewBox="0 0 24 24" fill="white" className="w-5 h-5">
                    <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-[16px] font-bold text-[#0F172A]">Привязка Telegram</h2>
                  <p className="text-[12px] text-[#64748B]">
                    Получайте уведомления об отключениях и ответы поддержки в боте
                  </p>
                </div>
              </div>

              {isLinked ? (
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
                  <p className="text-[13px] text-emerald-800 font-medium flex items-center gap-2">
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                      <path d="M3 8l3 3 7-7" />
                    </svg>
                    Telegram успешно привязан
                  </p>
                </div>
              ) : (
                <form onSubmit={handleLinkTelegram}>
                  <div className="p-4 rounded-xl bg-[#F0F7FF] border border-[#BFDBFE] mb-4">
                    <p className="text-[13px] text-[#334155] leading-relaxed">
                      1. Откройте бота{" "}
                      <a
                        href="https://t.me/drunteambot"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-[#1B5EBE] hover:underline"
                      >
                        @drunteambot
                      </a>{" "}
                      в Telegram
                      <br />
                      2. Отправьте команду <span className="font-mono font-semibold">/link</span>
                      <br />
                      3. Бот пришлёт 6-значный код — введите его ниже
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={linkCode}
                      onChange={(e) => {
                        setLinkCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                        setLinkError("");
                      }}
                      placeholder="000000"
                      className="flex-1 bg-[#F8FAFC] border-2 border-[#E2E8F0] rounded-xl px-4 py-3 text-[18px] text-center font-mono tracking-widest text-[#0F172A] placeholder-[#CBD5E1] outline-none focus:border-[#1B5EBE] focus:bg-white transition-colors"
                    />
                    <button
                      type="submit"
                      disabled={linkLoading || linkCode.length !== 6}
                      className="bg-[#1B5EBE] hover:bg-[#1449A0] disabled:bg-[#CBD5E1] disabled:cursor-not-allowed text-white text-[14px] font-semibold px-6 py-3 rounded-xl transition-colors"
                    >
                      {linkLoading ? "Проверка…" : "Привязать"}
                    </button>
                  </div>

                  {linkError && <p className="text-[13px] text-red-600 mt-3">{linkError}</p>}
                </form>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

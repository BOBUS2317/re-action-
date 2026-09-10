import { useState } from "react";
import { useNavigate } from "react-router-dom";

interface ProfileData {
  city: string;
  street: string;
  house: string;
  apartment: string;
  phone: string;
}

function getWebUserId(): string {
  let id = localStorage.getItem("web_user_id");
  if (!id) {
    id = `web-${crypto.randomUUID()}`;
    localStorage.setItem("web_user_id", id);
  }
  return id;
}

export default function Profile() {
  const navigate = useNavigate();

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

  const [savedFlag, setSavedFlag] = useState(false);

  const [linkCode, setLinkCode] = useState("");
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkError, setLinkError] = useState("");
  const isLinked = localStorage.getItem("tg_linked") === "true";

  const initials =
    (tgUser.first_name?.[0] || "И") + (tgUser.last_name?.[0] || "П");
  const displayName = tgUser.first_name
    ? `${tgUser.first_name} ${tgUser.last_name || ""}`.trim()
    : "Пользователь";
  const username = tgUser.username ? `@${tgUser.username}` : "";

  function handleChange(field: keyof ProfileData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSavedFlag(false);
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    localStorage.setItem("profile", JSON.stringify(form));
    setSavedFlag(true);
    setTimeout(() => setSavedFlag(false), 2500);
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
        localStorage.setItem("tg_user", JSON.stringify(data.user));
      }
      localStorage.setItem("auth", "true");
      localStorage.setItem("tg_linked", "true");
      setLinkCode("");
      // Перезагружаем, чтобы обновилась карточка
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
          Заполните данные — они используются для отключений, квитанций и обращений в УК
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
                  className="bg-[#1B5EBE] hover:bg-[#1449A0] text-white text-[14px] font-semibold px-6 py-3 rounded-xl transition-colors"
                >
                  Сохранить
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

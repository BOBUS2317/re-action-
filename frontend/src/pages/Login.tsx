import { useState } from "react";
import { useNavigate } from "react-router-dom";

function getWebUserId(): string {
  let id = localStorage.getItem("web_user_id");
  if (!id) {
    id = `web-${crypto.randomUUID()}`;
    localStorage.setItem("web_user_id", id);
  }
  return id;
}

export default function Login() {
  const navigate = useNavigate();

  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const cleanCode = code.replace(/\D/g, "").slice(0, 6);
    if (cleanCode.length !== 6) {
      setError("Введите 6-значный код");
      return;
    }

    setLoading(true);
    try {
      const r = await fetch("/api/users/link-telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          web_user_id: getWebUserId(),
          code: cleanCode,
        }),
      });

      if (!r.ok) {
        throw new Error(`HTTP ${r.status}`);
      }

      const data = await r.json();
      if (data?.ok === false || data?.error) {
        setError(data.error || "Неверный код или он истёк");
        return;
      }

      // Сохраняем данные пользователя, если бэк их вернул
      if (data?.user) {
        localStorage.setItem("tg_user", JSON.stringify(data.user));
      }
      localStorage.setItem("auth", "true");
      localStorage.setItem("tg_linked", "true");

      navigate("/");
    } catch {
      setError("Сервис недоступен. Попробуйте позже");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen bg-gradient-to-b from-[#EBF2FF] to-white flex items-center justify-center px-4 py-10"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      <div className="w-full max-w-[440px] bg-white rounded-2xl border border-[#E2E8F0] shadow-lg p-10">
        <button
          onClick={() => navigate("/")}
          className="text-[13px] text-[#64748B] hover:text-[#1B5EBE] mb-6 flex items-center gap-1 transition-colors"
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
            <path d="M10 3L5 8l5 5" />
          </svg>
          На главную
        </button>

        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-10 h-10 rounded-xl bg-[#1B5EBE] flex items-center justify-center">
            <svg viewBox="0 0 20 20" fill="white" className="w-5 h-5">
              <path d="M10 2L2 8v10h5v-5h6v5h5V8L10 2z" />
            </svg>
          </div>
          <span className="text-[18px] font-bold tracking-tight text-[#0F172A]">
            ЖКХ-<span className="text-[#1B5EBE]">помощник</span>
          </span>
        </div>

        <h1 className="text-[24px] font-bold text-[#0F172A] text-center mb-2">
          Вход через Telegram
        </h1>
        <p className="text-[14px] text-[#64748B] text-center mb-8">
          Это быстро и безопасно — подтвердите личность через бота
        </p>

        {/* Инструкция */}
        <div className="p-4 rounded-xl bg-[#F0F7FF] border border-[#BFDBFE] mb-6">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#229ED9] flex items-center justify-center shrink-0">
              <svg viewBox="0 0 24 24" fill="white" className="w-5 h-5">
                <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" />
              </svg>
            </div>
            <div className="text-[13px] text-[#334155] leading-relaxed">
              <p className="font-semibold mb-1.5">Как получить код:</p>
              <p>
                1. Откройте{" "}
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
                2. Отправьте <span className="font-mono font-semibold">/link</span>
                <br />
                3. Бот пришлёт 6-значный код
                <br />
                4. Введите его ниже
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <label className="block text-[12px] font-semibold text-[#94A3B8] uppercase tracking-wide mb-2">
            Код из бота
          </label>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => {
              setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
              setError("");
            }}
            placeholder="000000"
            autoFocus
            className="w-full bg-[#F8FAFC] border-2 border-[#E2E8F0] rounded-xl px-4 py-4 text-[24px] text-center font-mono tracking-[0.5em] text-[#0F172A] placeholder-[#CBD5E1] outline-none focus:border-[#1B5EBE] focus:bg-white transition-colors mb-4"
          />

          {error && (
            <p className="text-[13px] text-red-600 mb-4">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className="w-full bg-[#1B5EBE] hover:bg-[#1449A0] disabled:bg-[#CBD5E1] disabled:cursor-not-allowed text-white text-[15px] font-semibold rounded-xl py-3.5 transition-colors"
          >
            {loading ? "Проверка…" : "Войти"}
          </button>
        </form>

        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 h-px bg-[#E2E8F0]" />
          <span className="text-[12px] text-[#94A3B8]">или</span>
          <div className="flex-1 h-px bg-[#E2E8F0]" />
        </div>

        <button
          onClick={() => navigate("/profile")}
          className="w-full text-[13px] font-medium text-[#64748B] hover:text-[#0F172A] bg-white border border-[#E2E8F0] hover:border-[#CBD5E1] rounded-xl py-3 transition-colors"
        >
          Продолжить без входа
        </button>

        <p className="text-[12px] text-[#94A3B8] text-center mt-6 leading-relaxed">
          Нажимая кнопку, вы соглашаетесь с условиями обработки персональных данных
        </p>
      </div>
    </div>
  );
}

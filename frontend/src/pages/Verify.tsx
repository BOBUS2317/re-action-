import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function Verify() {
  const navigate = useNavigate();
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState("");
  const [timer, setTimer] = useState(60);
  const [canResend, setCanResend] = useState(false);
  const [demoCode, setDemoCode] = useState("");
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const phone = localStorage.getItem("phone") || "+7 (___) ___-__-__";

  useEffect(() => {
    const saved = sessionStorage.getItem("demo_code") || "";
    setDemoCode(saved);
  }, []);

  useEffect(() => {
    if (timer > 0) {
      const t = setTimeout(() => setTimer(timer - 1), 1000);
      return () => clearTimeout(t);
    } else {
      setCanResend(true);
    }
  }, [timer]);

  function handleChange(i: number, value: string) {
    if (!/^\d?$/.test(value)) return;
    const next = [...code];
    next[i] = value;
    setCode(next);
    setError("");
    if (value && i < 5) refs.current[i + 1]?.focus();

    if (next.every((d) => d) && next.join("").length === 6) {
      setTimeout(() => submitCode(next.join("")), 200);
    }
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !code[i] && i > 0) {
      refs.current[i - 1]?.focus();
    }
  }

  function submitCode(fullCode: string) {
    const expected = sessionStorage.getItem("demo_code");
    if (fullCode === expected) {
      localStorage.setItem("auth", "true");
      localStorage.setItem(
        "tg_user",
        JSON.stringify({
          id: 1,
          first_name: "Иван",
          last_name: "Петров",
          username: "ivan_p",
          auth_date: Date.now(),
          hash: "demo",
        })
      );
      sessionStorage.removeItem("demo_code");
      navigate("/");
    } else {
      setError("Неверный код. Попробуйте снова");
      setCode(["", "", "", "", "", ""]);
      refs.current[0]?.focus();
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const fullCode = code.join("");
    if (fullCode.length === 6) submitCode(fullCode);
  }

  function resend() {
    const newCode = String(Math.floor(100000 + Math.random() * 900000));
    sessionStorage.setItem("demo_code", newCode);
    setDemoCode(newCode);
    setTimer(60);
    setCanResend(false);
    setCode(["", "", "", "", "", ""]);
    setError("");
    refs.current[0]?.focus();
  }

  return (
    <div
      className="min-h-screen bg-gradient-to-b from-[#EBF2FF] to-white flex items-center justify-center px-4"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      <div className="w-full max-w-[440px] bg-white rounded-2xl border border-[#E2E8F0] shadow-lg p-10">
        <button
          onClick={() => navigate("/login")}
          className="text-[13px] text-[#64748B] hover:text-[#1B5EBE] mb-6 flex items-center gap-1 transition-colors"
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
            <path d="M10 3L5 8l5 5" />
          </svg>
          Назад
        </button>

        <div className="flex justify-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-[#229ED9] flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="white" className="w-7 h-7">
              <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" />
            </svg>
          </div>
        </div>

        <h1 className="text-[24px] font-bold text-[#0F172A] text-center mb-2">
          Введите код из Telegram
        </h1>
        <p className="text-[14px] text-[#64748B] text-center mb-1">
          Мы отправили код на <span className="font-semibold text-[#0F172A]">{phone}</span>
        </p>
        <p className="text-[12px] text-[#94A3B8] text-center mb-8">
          через бота <span className="font-semibold text-[#229ED9]">@drunteambot</span>
        </p>

        <form onSubmit={handleSubmit}>
          <div className="flex justify-center gap-2 mb-4">
            {code.map((digit, i) => (
              <input
                key={i}
                ref={(el) => { refs.current[i] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                autoFocus={i === 0}
                className={`w-12 h-14 text-center text-[22px] font-semibold bg-[#F8FAFC] rounded-xl border-2 outline-none transition-colors ${
                  error
                    ? "border-red-400 text-red-600"
                    : digit
                    ? "border-[#1B5EBE] text-[#0F172A]"
                    : "border-[#E2E8F0] text-[#0F172A] focus:border-[#1B5EBE]"
                }`}
              />
            ))}
          </div>

          {error && (
            <p className="text-[13px] text-red-600 text-center mb-4">{error}</p>
          )}

          <button
            type="submit"
            disabled={code.some((d) => !d)}
            className="w-full bg-[#1B5EBE] hover:bg-[#1449A0] disabled:bg-[#CBD5E1] disabled:cursor-not-allowed text-white text-[15px] font-semibold rounded-xl py-3.5 transition-colors mb-4"
          >
            Подтвердить
          </button>
        </form>

        <p className="text-[13px] text-[#94A3B8] text-center">
          {canResend ? (
            <button
              onClick={resend}
              className="text-[#1B5EBE] hover:text-[#1449A0] font-medium transition-colors"
            >
              Отправить код повторно
            </button>
          ) : (
            <>
              Отправить повторно через 0:{String(timer).padStart(2, "0")}
            </>
          )}
        </p>

        {/* Демо-подсказка */}
        {demoCode && (
          <div className="mt-8 p-3 rounded-xl bg-amber-50 border border-amber-200">
            <p className="text-[11px] text-amber-800 text-center leading-relaxed">
              <span className="font-semibold">Демо-режим:</span> код пришёл бы в Telegram.
              <br />
              Ваш код: <span className="font-mono font-bold text-[14px] text-amber-900">{demoCode}</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
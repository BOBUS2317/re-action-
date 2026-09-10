import { useState, useRef, useEffect } from "react";

type Role = "bot" | "user";

interface Message {
  id: number;
  role: Role;
  text: string;
  time: string;
  ticketId?: number;
}

const QUICK_REPLIES = [
  "Куда платить за воду?",
  "Подать показания счётчиков",
  "Сообщить об аварии",
  "Мои квитанции",
];

function formatTime(date: Date) {
  return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function BotAvatar() {
  return (
    <div className="w-8 h-8 rounded-full bg-[#1B5EBE] flex items-center justify-center shrink-0">
      <svg viewBox="0 0 20 20" fill="white" className="w-4 h-4">
        <path d="M10 2L2 8v10h5v-5h6v5h5V8L10 2z" />
      </svg>
    </div>
  );
}

function Bubble({ msg }: { msg: Message }) {
  const isBot = msg.role === "bot";
  return (
    <div className={`flex gap-3 ${isBot ? "justify-start" : "justify-end"}`}>
      {isBot && <BotAvatar />}
      <div className={`max-w-[520px] ${isBot ? "" : "items-end flex flex-col"}`}>
        <div
          className={`px-4 py-3 rounded-2xl text-[14px] leading-relaxed whitespace-pre-wrap ${
            isBot
              ? "bg-[#F1F5F9] text-[#0F172A] rounded-tl-sm"
              : "bg-[#1B5EBE] text-white rounded-tr-sm"
          }`}
          dangerouslySetInnerHTML={{
            __html: msg.text
              .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
              .replace(/\n/g, "<br/>"),
          }}
        />
        <p className="text-[11px] text-[#94A3B8] mt-1 px-1">{msg.time}</p>
      </div>
      {!isBot && (
        <div className="w-8 h-8 rounded-full bg-[#1B5EBE] flex items-center justify-center shrink-0 text-white text-[12px] font-600">
          ИП
        </div>
      )}
    </div>
  );
}

const INITIAL_MESSAGES: Message[] = [
  {
    id: 1,
    role: "bot",
    text: "Здравствуйте, Иван! Я виртуальный помощник ЖКХ-сервиса. Помогу разобраться с оплатой, показаниями счётчиков и многим другим.\n\nЧем могу помочь?",
    time: formatTime(new Date()),
  },
];

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [currentTicketId, setCurrentTicketId] = useState<number | null>(null);
  const [ticketStatus, setTicketStatus] = useState("В работе");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  async function sendMessage(text: string) {
    if (!text.trim()) return;
    const now = new Date();
    const userMsg: Message = { id: Date.now(), role: "user", text: text.trim(), time: formatTime(now) };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setTyping(true);

    try {
      // Специальный хардкор для быстрой демонстрации квитанций из бэкенда
      if (text.trim() === "Мои квитанции") {
        const userId = localStorage.getItem("user_id") || "guest";
        const res = await fetch(`/api/receipts/${userId}`);
        const data = await res.json();
        let receiptText = "Найдены квитанции по адресу ул. Ленина, 15:\n\n";
        if (data.receipts && data.receipts.length > 0) {
          data.receipts.forEach((r: any) => {
            receiptText += `• **${r.month}** — ${r.amount} ₽ ${r.is_paid ? "✓ оплачено" : "(не оплачено)"}\n`;
          });
        } else {
          receiptText += "• Сентябрь 2026 — 4 512 ₽ (не оплачено)\n• Август 2026 — 4 318 ₽ ✓ оплачено";
        }

        setTyping(false);
        setMessages((prev) => [
          ...prev,
          { id: Date.now() + 1, role: "bot", text: receiptText, time: formatTime(new Date()) },
        ]);
        return;
      }

      // Основной запрос к FastAPI бэкенду (RAG + Qwen LLM)
      const response = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: localStorage.getItem("user_id") || "guest", message: text.trim() }),
      });

      if (!response.ok) throw new Error("Ошибка сервера");

      const data = await response.json();
      setCurrentTicketId(data.ticket_id);
      if (data.escalated) setTicketStatus("Эскалация оператору");

      setTyping(false);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: "bot",
          text: data.response,
          time: formatTime(new Date()),
          ticketId: data.ticket_id
        },
      ]);
    } catch (error) {
      setTyping(false);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: "bot",
          text: "Произошла ошибка связи с сервером. Позвоните в УК ООО «Уют»: +7 812 555-01-02.",
          time: formatTime(new Date())
        },
      ]);
    }
  }

  async function handleRate(rating: number) {
    if (!currentTicketId) return;
    await fetch("/api/rate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket_id: currentTicketId, rating }),
    });
    alert(`Спасибо за оценку ${rating}!`);
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  return (
    <div className="h-screen flex flex-col bg-white" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Header */}
      <header className="bg-white border-b border-[#E2E8F0] h-14 flex items-center px-6 gap-4 shrink-0 z-10">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-[#1B5EBE] flex items-center justify-center">
            <svg viewBox="0 0 20 20" fill="white" className="w-3.5 h-3.5">
              <path d="M10 2L2 8v10h5v-5h6v5h5V8L10 2z" />
            </svg>
          </div>
          <span className="text-[14px] font-600 text-[#0F172A]">ЖКХ-помощник</span>
          <span className="text-[13px] text-[#94A3B8] mx-1">/</span>
          <span className="text-[14px] text-[#64748B]">Чат с помощником</span>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-[12px] text-[#64748B]">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
            На связи
          </span>
          <div className="w-px h-4 bg-[#E2E8F0]" />
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-[#1B5EBE] flex items-center justify-center text-white text-[11px] font-600">
              ИП
            </div>
            <span className="text-[13px] font-500 text-[#334155]">Иван П.</span>
          </div>
        </div>
      </header>

      {/* Body: chat + sidebar */}
      <div className="flex flex-1 overflow-hidden">
        {/* Chat area */}
        <div className="flex flex-col flex-1 min-w-0">
          <div className="flex-1 overflow-y-auto px-8 py-6 space-y-5">
            {messages.map((m) => (
              <div key={m.id} className="space-y-2">
                <Bubble msg={m} />
                {/* Если это сообщение бота и есть активный тикет, покажем кнопки оценки */}
                {m.role === "bot" && m.ticketId && (
                  <div className="flex items-center gap-2 ml-11">
                    <span className="text-[12px] text-[#64748B]">Оцените ответ:</span>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        onClick={() => handleRate(star)}
                        className="w-6 h-6 rounded bg-[#F1F5F9] hover:bg-[#1B5EBE] hover:text-white text-[11px] font-600 transition-colors"
                      >
                        {star}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {typing && (
              <div className="flex gap-3 items-center">
                <BotAvatar />
                <div className="bg-[#F1F5F9] rounded-2xl rounded-tl-sm px-4 py-3 flex gap-1 items-center">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="w-1.5 h-1.5 rounded-full bg-[#94A3B8] animate-bounce"
                      style={{ animationDelay: `${i * 150}ms` }}
                    />
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Quick replies */}
          <div className="px-8 py-3 border-t border-[#F1F5F9] flex gap-2 overflow-x-auto">
            {QUICK_REPLIES.map((q) => (
              <button
                key={q}
                onClick={() => sendMessage(q)}
                className="shrink-0 text-[12px] font-500 text-[#1B5EBE] border border-[#BFDBFE] bg-[#F0F7FF] hover:bg-[#DBEAFE] rounded-full px-3.5 py-1.5 transition-colors"
              >
                {q}
              </button>
            ))}
          </div>

          {/* Input */}
          <div className="px-8 py-4 border-t border-[#E2E8F0] bg-white">
            <div className="flex items-end gap-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-2xl px-4 py-3 focus-within:border-[#1B5EBE] focus-within:bg-white transition-all">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Напишите сообщение… (Enter — отправить)"
                rows={1}
                className="flex-1 bg-transparent resize-none text-[14px] text-[#0F172A] placeholder-[#94A3B8] outline-none max-h-32 leading-relaxed"
                style={{ overflowY: "auto" }}
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim()}
                className="w-9 h-9 rounded-xl bg-[#1B5EBE] hover:bg-[#1449A0] disabled:bg-[#CBD5E1] flex items-center justify-center transition-colors shrink-0"
              >
                <svg viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 translate-x-px">
                  <path d="M14 8H2M9 3l5 5-5 5" />
                </svg>
              </button>
            </div>
            <p className="text-[11px] text-[#CBD5E1] mt-2 text-center">
              Shift+Enter — перенос строки
            </p>
          </div>
        </div>

        {/* Sidebar */}
        <aside className="w-[320px] border-l border-[#E2E8F0] bg-[#F8FAFC] flex flex-col shrink-0 overflow-y-auto">
          <div className="px-6 py-5 border-b border-[#E2E8F0]">
            <h2 className="text-[14px] font-700 text-[#0F172A]">Карточка обращения</h2>
            <p className="text-[12px] text-[#94A3B8] mt-0.5">Текущий диалог</p>
          </div>

          <div className="px-6 py-5 space-y-4 flex-1">
            {[
              { label: "ID обращения", value: currentTicketId ? `#${currentTicketId}` : "—", mono: true },
              { label: "Категория", value: "ЖКХ / Поддержка" },
              { label: "Адрес", value: "ул. Ленина, 15" },
              { label: "Дата создания", value: new Date().toLocaleDateString("ru-RU") },
            ].map((f) => (
              <div key={f.label}>
                <p className="text-[11px] font-500 text-[#94A3B8] uppercase tracking-wide mb-1">
                  {f.label}
                </p>
                <p className={`text-[14px] text-[#0F172A] font-500 ${f.mono ? "font-mono" : ""}`}>
                  {f.value}
                </p>
              </div>
            ))}

            <div>
              <p className="text-[11px] font-500 text-[#94A3B8] uppercase tracking-wide mb-1">
                Статус
              </p>
              <span className="inline-flex items-center gap-1.5 text-[13px] font-600 text-amber-700 bg-amber-100 px-3 py-1 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                {ticketStatus}
              </span>
            </div>

            <div className="border-t border-[#E2E8F0] pt-4">
              <p className="text-[11px] font-500 text-[#94A3B8] uppercase tracking-wide mb-3">
                Ответственный
              </p>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-[#E2E8F0] flex items-center justify-center text-[12px] font-600 text-[#64748B]">
                  АК
                </div>
                <div>
                  <p className="text-[13px] font-600 text-[#0F172A]">Алексей К.</p>
                  <p className="text-[11px] text-[#94A3B8]">Диспетчер ООО «Уют»</p>
                </div>
              </div>
            </div>
          </div>

          <div className="px-6 py-5 border-t border-[#E2E8F0] space-y-2">
            <button
              onClick={() => { setTicketStatus("Эскалация оператору"); alert("Обращение эскалировано оператору!"); }}
              className="w-full text-[13px] font-600 text-white bg-[#1B5EBE] hover:bg-[#1449A0] rounded-xl py-2.5 transition-colors"
            >
              Эскалировать обращение
            </button>
            <button
              onClick={() => { setTicketStatus("Закрыто"); alert("Обращение закрыто."); }}
              className="w-full text-[13px] font-500 text-[#64748B] hover:text-[#0F172A] bg-white border border-[#E2E8F0] hover:border-[#CBD5E1] rounded-xl py-2.5 transition-colors"
            >
              Закрыть обращение
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
import { useState, useRef, useEffect } from "react";

type Role = "bot" | "user";

interface Message {
  id: number;
  role: Role;
  text: string;
  time: string;
  conversationId?: string;
  ticketId?: string | null;
  rated?: boolean;
}

interface Receipt {
  id: number;
  billing_period: string;
  provider: string;
  amount_cents: number;
  status: "unpaid" | "paid" | "overdue" | "cancelled";
  due_at?: string | null;
}

const QUICK_REPLIES = [
  "Куда платить за воду?",
  "Подать показания счётчиков",
  "Сообщить об аварии",
  "Мои квитанции",
];

const API_URL = import.meta.env.VITE_API_URL ?? "";

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

function Bubble({ msg, onRate }: { msg: Message; onRate: (messageId: number, score: number) => void }) {
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
        >
          {msg.text}
        </div>
        <p className="text-[11px] text-[#94A3B8] mt-1 px-1">{msg.time}</p>
        {isBot && msg.conversationId && (
          <div className="flex items-center gap-1 mt-1 px-1 text-[11px] text-[#94A3B8]">
            {msg.rated ? (
              <span>Спасибо за оценку</span>
            ) : (
              <>
                <span className="mr-1">Ответ полезен?</span>
                {[1, 2, 3, 4, 5].map((score) => (
                  <button
                    key={score}
                    type="button"
                    onClick={() => onRate(msg.id, score)}
                    className="text-[#F59E0B] hover:scale-125 transition-transform"
                    aria-label={`Оценить на ${score}`}
                  >
                    ★
                  </button>
                ))}
              </>
            )}
          </div>
        )}
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
    text: "Здравствуйте, Иван! Я виртуальный помощник ЖКХ-сервиса. Помогу разобраться с оплатой, показаниями счётчиков, плановыми отключениями и многим другим.\n\nЧем могу помочь?",
    time: formatTime(new Date()),
  },
];

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [currentTicketId, setCurrentTicketId] = useState<string | null>(null);
  const [category, setCategory] = useState("Не определена");
  const [categorySlug, setCategorySlug] = useState("other");
  const [ticketStatus, setTicketStatus] = useState("Диалог открыт");
  const [createdAt] = useState(() => new Date());
  const [lastUserText, setLastUserText] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const userId = useRef(`web-${crypto.randomUUID()}`);
  const nextMessageId = useRef(2);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  async function sendMessage(text: string) {
    if (!text.trim()) return;
    const now = new Date();
    const userMsg: Message = { id: nextMessageId.current++, role: "user", text: text.trim(), time: formatTime(now) };
    setMessages((prev) => [...prev, userMsg]);
    setLastUserText(text.trim());
    setActionMessage("");
    setInput("");
    setTyping(true);

    try {
      if (text.trim() === "Мои квитанции") {
        const response = await fetch(`${API_URL}/api/users/${encodeURIComponent(userId.current)}/receipts`);
        if (!response.ok) throw new Error(`API error ${response.status}`);
        const receipts: Receipt[] = await response.json();
        const receiptText = receipts.length
          ? receipts.map((item) => {
              const amount = (item.amount_cents / 100).toLocaleString("ru-RU", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              });
              const status = { unpaid: "к оплате", paid: "оплачена", overdue: "просрочена", cancelled: "отменена" }[item.status];
              return `${item.billing_period} · ${item.provider}: ${amount} ₽ (${status})`;
            }).join("\n")
          : "Квитанций пока нет. Их можно загрузить через API управляющей компании.";
        setMessages((prev) => [...prev, {
          id: nextMessageId.current++, role: "bot", text: receiptText, time: formatTime(new Date()),
        }]);
        return;
      }

      const response = await fetch(`${API_URL}/api/support`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId.current,
          message: text.trim(),
          conversation_id: conversationId,
          channel: "web",
          display_name: "Иван",
        }),
      });
      if (!response.ok) throw new Error(`API error ${response.status}`);
      const result = await response.json();
      setConversationId(result.conversation_id);
      setCategory(result.category_name);
      setCategorySlug(result.category);
      setCurrentTicketId(result.ticket_id ?? null);
      setTicketStatus(result.ticket_id ? "Новая заявка" : "Диалог открыт");
      const ticket = result.ticket_id ? `\n\nЗаявка: ${result.ticket_id}` : "";
      const reply = `${result.response}\n\nКатегория: ${result.category_name}${ticket}`;
      setMessages((prev) => [
        ...prev,
        {
          id: nextMessageId.current++, role: "bot", text: reply, time: formatTime(new Date()),
          conversationId: result.conversation_id, ticketId: result.ticket_id,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: nextMessageId.current++,
          role: "bot",
          text: "Не удалось связаться с сервисом. Попробуйте ещё раз. При аварии звоните 112.",
          time: formatTime(new Date()),
        },
      ]);
    } finally {
      setTyping(false);
    }
  }

  async function rateMessage(messageId: number, score: number) {
    const message = messages.find((item) => item.id === messageId);
    if (!message?.conversationId) return;
    const response = await fetch(`${API_URL}/api/ratings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId.current,
        score,
        conversation_id: message.conversationId,
        ticket_id: message.ticketId ?? null,
      }),
    });
    if (response.ok) {
      setMessages((prev) => prev.map((item) => item.id === messageId ? { ...item, rated: true } : item));
    }
  }

  async function escalateTicket() {
    setActionMessage("");
    try {
      if (currentTicketId) {
        const response = await fetch(`${API_URL}/api/tickets/${encodeURIComponent(currentTicketId)}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "accepted", actor: "web-user", note: "Запрошена связь с диспетчером" }),
        });
        if (!response.ok) throw new Error();
      } else {
        const response = await fetch(`${API_URL}/api/tickets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: userId.current,
            conversation_id: conversationId,
            category: categorySlug,
            title: `Обращение: ${category}`,
            description: lastUserText || "Пользователь запросил помощь диспетчера",
            priority: "normal",
          }),
        });
        if (!response.ok) throw new Error();
        const ticket = await response.json();
        setCurrentTicketId(ticket.id);
      }
      setTicketStatus("Передано диспетчеру");
      setActionMessage("Обращение передано диспетчеру.");
    } catch {
      setActionMessage("Не удалось передать обращение. Попробуйте ещё раз.");
    }
  }

  async function closeTicket() {
    if (!currentTicketId) return;
    setActionMessage("");
    try {
      const response = await fetch(`${API_URL}/api/tickets/${encodeURIComponent(currentTicketId)}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "closed", actor: "web-user", note: "Закрыто пользователем" }),
      });
      if (!response.ok) throw new Error();
      setTicketStatus("Закрыто");
      setActionMessage("Обращение закрыто.");
    } catch {
      setActionMessage("Не удалось закрыть обращение.");
    }
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
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-8 py-6 space-y-5">
            {messages.map((m) => (
              <Bubble key={m.id} msg={m} onRate={rateMessage} />
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
              { label: "ID обращения", value: currentTicketId ?? "Ещё не создано", mono: true },
              { label: "Категория", value: category },
              { label: "Канал", value: "Веб-чат" },
              { label: "Дата создания", value: createdAt.toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" }) },
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
            <button onClick={escalateTicket} className="w-full text-[13px] font-600 text-white bg-[#1B5EBE] hover:bg-[#1449A0] rounded-xl py-2.5 transition-colors">
              Эскалировать обращение
            </button>
            <button onClick={closeTicket} disabled={!currentTicketId || ticketStatus === "Закрыто"} className="w-full text-[13px] font-500 text-[#64748B] hover:text-[#0F172A] bg-white border border-[#E2E8F0] hover:border-[#CBD5E1] disabled:opacity-50 rounded-xl py-2.5 transition-colors">
              Закрыть обращение
            </button>
            {actionMessage && <p className="text-[12px] text-[#64748B] text-center pt-1">{actionMessage}</p>}
          </div>
        </aside>
      </div>
    </div>
  );
}

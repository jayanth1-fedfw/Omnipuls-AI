"use client";

import { FormEvent, useState } from "react";
import type { PulseResponse } from "@/lib/pulse";

interface Props {
  onAction?: (action: PulseResponse["action"]) => void;
  onToast?: (message: string) => void;
}

export default function PulseChat({ onAction, onToast }: Props) {
  const [message, setMessage] = useState("");
  const [conversation, setConversation] = useState<Array<{ role: "user" | "pulse"; text: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!message.trim() || loading) return;

    // Add user message
    const userMsg = message;
    setConversation((prev) => [...prev, { role: "user", text: userMsg }]);
    setMessage("");
    setLoading(true);

    try {
      const response = await fetch("/api/pulse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Request failed");
      }

      const data = (await response.json()) as PulseResponse;

      // Add pulse response
      setConversation((prev) => [...prev, { role: "pulse", text: data.reply }]);

      // Trigger action if present
      if (data.action && onAction) {
        onAction(data.action);
        onToast?.(`Pulse prepared an action: ${data.action.type}`);
      }
    } catch (err) {
      const errorText = err instanceof Error ? err.message : "Unknown error";
      setConversation((prev) => [...prev, { role: "pulse", text: `Error: ${errorText}` }]);
    } finally {
      setLoading(false);
    }
  };

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 shadow-lg flex items-center justify-center text-white text-2xl font-bold transition transform hover:scale-110"
        title="Open Pulse Chat"
      >
        💬
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 w-96 h-96 bg-slate-900 border border-cyan-500/50 rounded-lg shadow-2xl flex flex-col overflow-hidden">
      <div className="bg-gradient-to-r from-cyan-600 to-blue-600 p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">💬</span>
          <div>
            <h3 className="text-white font-bold text-sm">Pulse</h3>
            <p className="text-cyan-100 text-xs">AI Copilot</p>
          </div>
        </div>
        <button
          onClick={() => setExpanded(false)}
          className="text-white hover:text-cyan-200 text-xl font-bold"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {conversation.length === 0 && (
          <div className="text-slate-400 text-sm italic">
            Hey, I'm Pulse. Tell me what you need to manage. I can help you create tasks, add memories,
            or set alerts.
          </div>
        )}
        {conversation.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-xs px-4 py-2 rounded-lg text-sm ${
                msg.role === "user"
                  ? "bg-cyan-600 text-white rounded-br-none"
                  : "bg-slate-700 text-slate-100 rounded-bl-none"
              }`}
            >
              {msg.text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-slate-700 text-slate-400 px-4 py-2 rounded-lg rounded-bl-none text-sm">
              <span className="animate-pulse">Pulse is thinking...</span>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="border-t border-slate-700 p-3 flex gap-2">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Tell Pulse what to do..."
          disabled={loading}
          className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={loading || !message.trim()}
          className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-600 text-white rounded text-sm font-semibold transition"
        >
          {loading ? "..." : "Send"}
        </button>
      </form>
    </div>
  );
}

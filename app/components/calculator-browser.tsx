"use client";

import { FormEvent, useState } from "react";
import type { CalculationResult } from "@/lib/arithmetic";

interface Props {
  onAlert?: (message: string) => void;
}

export default function CalculatorBrowser({ onAlert }: Props) {
  const [expression, setExpression] = useState("");
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<CalculationResult[]>([]);

  const handleCalculate = async (e: FormEvent) => {
    e.preventDefault();
    if (!expression.trim()) return;

    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expression })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Calculation failed");
      }

      const data = (await response.json()) as CalculationResult;
      setResult(data);
      setHistory([data, ...history.slice(0, 9)]);

      if (data.alert && data.alertMessage && onAlert) {
        onAlert(data.alertMessage);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const quickCalculations = [
    { label: "5 + 3", expr: "5 + 3" },
    { label: "100 * 2", expr: "100 * 2" },
    { label: "15 / 3", expr: "15 / 3" },
    { label: "true && false", expr: "true && false" },
    { label: "true || false", expr: "true || false" }
  ];

  return (
    <div className="w-full max-w-2xl bg-gradient-to-br from-slate-900 to-slate-800 rounded-lg border border-cyan-500/30 p-6 shadow-lg">
      <h2 className="text-lg font-bold text-cyan-400 mb-4 flex items-center gap-2">
        <span>🧮</span> AI Calculator & Logic Engine
      </h2>

      <form onSubmit={handleCalculate} className="space-y-4 mb-6">
        <div className="flex gap-2">
          <input
            type="text"
            value={expression}
            onChange={(e) => setExpression(e.target.value)}
            placeholder="e.g., 5 + 3 or true && false"
            className="flex-1 px-4 py-2 bg-slate-700 border border-cyan-500/50 rounded text-white placeholder-slate-400 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-600 text-white rounded font-semibold transition"
          >
            {loading ? "..." : "Calculate"}
          </button>
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}
      </form>

      {result && (
        <div
          className={`mb-6 p-4 rounded border ${
            result.alert
              ? "bg-red-900/30 border-red-500/50"
              : "bg-green-900/30 border-green-500/50"
          }`}
        >
          <div className="text-cyan-300 font-mono text-lg mb-2">{result.expression}</div>
          <div className="text-white text-2xl font-bold mb-2">= {result.result}</div>
          <div className="text-slate-300 text-sm mb-2">{result.description}</div>
          {result.alertMessage && (
            <div className="text-yellow-300 text-sm flex items-center gap-2">
              <span>🔔</span> {result.alertMessage}
            </div>
          )}
        </div>
      )}

      <div className="mb-6">
        <h3 className="text-slate-400 text-sm font-semibold mb-2">Quick Examples:</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {quickCalculations.map((q) => (
            <button
              key={q.expr}
              onClick={() => setExpression(q.expr)}
              className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-cyan-300 text-xs rounded border border-slate-600 hover:border-cyan-500 transition"
            >
              {q.label}
            </button>
          ))}
        </div>
      </div>

      {history.length > 0 && (
        <div>
          <h3 className="text-slate-400 text-sm font-semibold mb-3">History:</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {history.map((calc, idx) => (
              <div
                key={idx}
                className="p-2 bg-slate-700/50 rounded border border-slate-600 text-xs"
              >
                <div className="text-cyan-300 font-mono">
                  {calc.expression} = <span className="text-green-400">{calc.result}</span>
                </div>
                <div className="text-slate-400 text-xs mt-1">{new Date(calc.timestamp).toLocaleTimeString()}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

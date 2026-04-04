/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { Send, Bot, User, Loader2, Calendar, MapPin, Image as ImageIcon, CheckCircle2, ExternalLink, AlertCircle } from 'lucide-react';
import Markdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

// Helper for retrying API calls
const callGeminiWithRetry = async (fn: () => Promise<any>, retries = 3, delay = 1000): Promise<any> => {
  try {
    return await fn();
  } catch (error: any) {
    if (retries > 0 && error?.message?.includes('429')) {
      console.warn(`Rate limit hit, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return callGeminiWithRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
};

interface Message {
  role: 'user' | 'model';
  text: string;
  isPending?: boolean;
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'model', text: "Hello! I'm your Eventbrite Agent. I can help you create new events from your template, or query the latest event you've created. How can I help you today?" }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setIsLoading(true);

    try {
      const chat = ai.chats.create({
        model: "gemini-3-flash-preview",
        config: {
          systemInstruction: `You are an Eventbrite Agent. Your goal is to help users create events using a template, or query existing events.
          
          The process for creating an event is:
          1. Collect event details: title, summary (max 140 chars), date and time (start and end), and location name. Enforce the format of "2026-04-18T15:00:00" for date and time.
          2. When you have all details, call 'prepare_event' to copy the template and update it.
          3. When 'prepare_event' succeeds, it returns an 'id' and a 'url'. You MUST show the user this exact 'url' so they can review the event, and ask if they want to publish it.
          4. If they say yes, call 'publish_event' with the event_id.
          
          You can also query the latest event created by the organization using 'get_latest_event'.
          
          Constants:
          - Organization ID: 1937809150453
          - Template Event ID: 1986677712518
          
          Always be professional and helpful. If the user provides a date like "next Friday", convert it to the enforced format (e.g., 2026-04-18T15:00:00) for the tool call.`,
          tools: [
            {
              functionDeclarations: [
                {
                  name: "prepare_event",
                  description: "Copies the template event and updates it with new details. Returns the new event ID and URL.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING, description: "The title of the event" },
                      summary: { type: Type.STRING, description: "A short summary (max 140 chars)" },
                      start_time: { type: Type.STRING, description: "Start time. Enforce the format of \"2026-04-18T15:00:00\"" },
                      end_time: { type: Type.STRING, description: "End time. Enforce the format of \"2026-04-18T15:00:00\"" },
                      location_name: { type: Type.STRING, description: "The name of the location" }
                    },
                    required: ["title", "summary", "start_time", "end_time", "location_name"]
                  }
                },
                {
                  name: "publish_event",
                  description: "Publishes the event so it becomes live on Eventbrite.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      event_id: { type: Type.STRING, description: "The ID of the event to publish" }
                    },
                    required: ["event_id"]
                  }
                },
                {
                  name: "get_latest_event",
                  description: "Queries the latest event created by the organization. Returns event details including title, start time, end time, status, and URL.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {}
                  }
                }
              ]
            }
          ]
        }
      });

      // We need to send the whole history to maintain context for function calling
      // For simplicity in this demo, we'll just send the last few messages or rebuild the history
      const history = messages.map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.text }]
      }));

      let response = await callGeminiWithRetry(() => ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [...history, { role: 'user', parts: [{ text: userMessage }] }],
        config: {
          systemInstruction: `You are an Eventbrite Agent. Your goal is to help users create events using a template, or query existing events.
          
          The process for creating an event is:
          1. Collect event details: title, summary (max 140 chars), date and time (start and end), and location name. Enforce the format of "2026-04-18T15:00:00" for date and time.
          2. When you have all details, call 'prepare_event' to copy the template and update it.
          3. When 'prepare_event' succeeds, it returns an 'id' and a 'url'. You MUST show the user this exact 'url' so they can review the event, and ask if they want to publish it.
          4. If they say yes, call 'publish_event' with the event_id.
          
          You can also query the latest event created by the organization using 'get_latest_event'.
          
          Constants:
          - Organization ID: 1937809150453
          - Template Event ID: 1986677712518
          
          Always be professional and helpful. If the user provides a date like "next Friday", convert it to the enforced format (e.g., 2026-04-18T15:00:00) for the tool call.`,
          tools: [
            {
              functionDeclarations: [
                {
                  name: "prepare_event",
                  description: "Copies the template event and updates it with new details. Returns the new event ID and URL.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING, description: "The title of the event" },
                      summary: { type: Type.STRING, description: "A short summary (max 140 chars)" },
                      start_time: { type: Type.STRING, description: "Start time. Enforce the format of \"2026-04-18T15:00:00\"" },
                      end_time: { type: Type.STRING, description: "End time. Enforce the format of \"2026-04-18T15:00:00\"" },
                      location_name: { type: Type.STRING, description: "The name of the location" }
                    },
                    required: ["title", "summary", "start_time", "end_time", "location_name"]
                  }
                },
                {
                  name: "publish_event",
                  description: "Publishes the event so it becomes live on Eventbrite.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      event_id: { type: Type.STRING, description: "The ID of the event to publish" }
                    },
                    required: ["event_id"]
                  }
                },
                {
                  name: "get_latest_event",
                  description: "Queries the latest event created by the organization. Returns event details including title, start time, end time, status, and URL.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {}
                  }
                }
              ]
            }
          ]
        }
      }));

      const handleFunctionCalls = async (res: GenerateContentResponse): Promise<string> => {
        const calls = res.functionCalls;
        if (!calls) return res.text || "I'm sorry, I didn't get that.";

        const results = [];
        for (const call of calls) {
          if (call.name === "prepare_event") {
            try {
              const apiRes = await fetch("/api/eventbrite/prepare", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(call.args)
              });
              const data = await apiRes.json();
              if (!apiRes.ok) throw new Error(data.error || "Failed to prepare event");
              results.push({ functionResponse: { name: call.name, response: data } });
            } catch (err: any) {
              results.push({ functionResponse: { name: call.name, response: { error: err.message } } });
            }
          } else if (call.name === "publish_event") {
            try {
              const apiRes = await fetch("/api/eventbrite/publish", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(call.args)
              });
              const data = await apiRes.json();
              if (!apiRes.ok) throw new Error(data.error || "Failed to publish event");
              results.push({ functionResponse: { name: call.name, response: data } });
            } catch (err: any) {
              results.push({ functionResponse: { name: call.name, response: { error: err.message } } });
            }
          } else if (call.name === "get_latest_event") {
            try {
              const apiRes = await fetch("/api/eventbrite/latest");
              const data = await apiRes.json();
              if (!apiRes.ok) throw new Error(data.error || "Failed to fetch latest event");
              results.push({ functionResponse: { name: call.name, response: data } });
            } catch (err: any) {
              results.push({ functionResponse: { name: call.name, response: { error: err.message } } });
            }
          }
        }

        // Send results back to Gemini
        const finalRes = await callGeminiWithRetry(() => ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: [
            ...history,
            { role: 'user', parts: [{ text: userMessage }] },
            { role: 'model', parts: res.candidates?.[0]?.content?.parts || [] },
            { role: 'user', parts: results as any }
          ]
        }));

        return finalRes.text || "I've processed that for you.";
      };

      const finalOutput = await handleFunctionCalls(response);
      setMessages(prev => [...prev, { role: 'model', text: finalOutput }]);

    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { role: 'model', text: "I encountered an error while processing your request. Please check your Eventbrite token and try again." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 font-sans text-slate-900">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-orange-500 p-2 rounded-lg">
            <Bot className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-800">Eventbrite Agent</h1>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">ADK Powered</p>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-1 bg-slate-100 rounded-full">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span className="text-xs font-semibold text-slate-600">Connected</span>
        </div>
      </header>

      {/* Chat Area */}
      <main 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth"
      >
        <div className="max-w-3xl mx-auto space-y-6">
          {messages.map((msg, idx) => (
            <div 
              key={idx}
              className={cn(
                "flex gap-4 max-w-[85%]",
                msg.role === 'user' ? "ml-auto flex-row-reverse" : "mr-auto"
              )}
            >
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm",
                msg.role === 'user' ? "bg-slate-800" : "bg-orange-500"
              )}>
                {msg.role === 'user' ? <User className="w-5 h-5 text-white" /> : <Bot className="w-5 h-5 text-white" />}
              </div>
              <div className={cn(
                "px-4 py-3 rounded-2xl text-sm leading-relaxed shadow-sm",
                msg.role === 'user' 
                  ? "bg-slate-800 text-white rounded-tr-none" 
                  : "bg-white border border-slate-200 text-slate-800 rounded-tl-none"
              )}>
                <div className="markdown-body prose prose-slate prose-sm max-w-none">
                  <Markdown>{msg.text}</Markdown>
                </div>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex gap-4 mr-auto max-w-[85%] animate-pulse">
              <div className="w-8 h-8 rounded-full bg-orange-200 flex items-center justify-center shrink-0">
                <Loader2 className="w-5 h-5 text-orange-400 animate-spin" />
              </div>
              <div className="px-4 py-3 rounded-2xl bg-white border border-slate-200 text-slate-400 text-sm italic">
                Thinking...
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Input Area */}
      <footer className="bg-white border-t border-slate-200 p-6">
        <div className="max-w-3xl mx-auto">
          <div className="relative flex items-center">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Type your message..."
              className="w-full pl-4 pr-12 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all text-sm"
            />
            <button
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
              className="absolute right-2 p-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 justify-center">
            <QuickAction icon={<Calendar className="w-3 h-3" />} label="Set Date" onClick={() => setInput(prev => prev + " Date: ")} />
            <QuickAction icon={<MapPin className="w-3 h-3" />} label="Add Location" onClick={() => setInput(prev => prev + " Location: ")} />
            <QuickAction icon={<ImageIcon className="w-3 h-3" />} label="Add Image" onClick={() => setInput(prev => prev + " Image: ")} />
          </div>
        </div>
      </footer>
    </div>
  );
}

function QuickAction({ icon, label, onClick }: { icon: React.ReactNode, label: string, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full text-[10px] font-bold uppercase tracking-wider transition-colors border border-slate-200"
    >
      {icon}
      {label}
    </button>
  );
}

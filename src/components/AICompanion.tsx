import React, { useState, useRef, useEffect } from 'react';
import { Bot, X, Send, Sparkles, ShoppingBag, ArrowRight } from 'lucide-react';
import { Product } from '../types';

interface Message {
  role: 'user' | 'assistant';
  text: string;
}

interface AICompanionProps {
  products: Product[];
  onAddProductsToCart: (productIds: string[]) => void;
  cartItemIds: string[];
  addToCart?: (productId: string, qty?: number) => void;
  setViewMode?: (mode: 'catalog' | 'checkout' | 'profile' | 'admin' | 'ai' | 'success') => void;
  notifyUser?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export default function AICompanion({ products, onAddProductsToCart, cartItemIds, addToCart, setViewMode, notifyUser }: AICompanionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      text: "👋 Hello! I am your **Nammashop AI Smart Kitchen Assistant**.\n\nAsk me for quick dinner recipes, healthy breakfasts, or ingredient substitutes! I'll instantly gather available in-stock items from our shelves, so you can add them to your delivery cart in one click! 🥦✨\n\nTry asking:\n* *\"Suggest a healthy mango breakfast recipe\"*\n* *\"What can I cook with tomatoes and milk?\"*"
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [matchedIds, setMatchedIds] = useState<string[]>([]);
  
  const chatEndRef = useRef<HTMLDivElement>(null);

  const parseMessageText = (text: string) => {
    const parts = text.split(/(\[PRODUCT:[a-zA-Z0-9_\-]+\])/g);
    return parts.map((part, index) => {
      const match = part.match(/^\[PRODUCT:([a-zA-Z0-9_\-]+)\]$/);
      if (match) {
        const prodId = match[1];
        const p = products.find(prod => prod.id === prodId);
        if (p) {
          const discountPrice = p.price * (1 - p.discount / 100);
          return (
            <div key={index} className="my-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 flex flex-col gap-2 text-slate-800 dark:text-slate-100 text-left select-none">
              <div className="flex items-center gap-2 truncate">
                <img src={p.image} className="h-8 w-8 object-cover rounded-lg border border-white shrink-0 shadow-3xs" referrerPolicy="no-referrer" />
                <div className="truncate text-left leading-tight">
                  <h4 className="font-extrabold text-[10px] text-slate-900 dark:text-white truncate max-w-[150px]">{p.name}</h4>
                  <p className="text-[8px] text-slate-550 font-mono">£{discountPrice.toFixed(2)} • {p.unit} ({p.stock > 0 ? `${p.stock} left` : 'Out of Stock'})</p>
                </div>
              </div>
              <div className="flex gap-1.5 w-full">
                <button
                  type="button"
                  onClick={() => {
                    if (addToCart) {
                      addToCart(p.id, 1);
                      if (notifyUser) notifyUser(`Added ${p.name} to cart!`, 'success');
                    } else {
                      onAddProductsToCart([p.id]);
                    }
                  }}
                  disabled={p.stock <= 0}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[8px] py-1 rounded-md uppercase tracking-wider transition-all cursor-pointer text-center"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (addToCart && setViewMode) {
                      addToCart(p.id, 1);
                      setViewMode('checkout');
                      if (notifyUser) notifyUser(`Redirecting for instant checkout!`, 'info');
                    } else {
                      onAddProductsToCart([p.id]);
                    }
                    setIsOpen(false);
                  }}
                  disabled={p.stock <= 0}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[8px] py-1 rounded-md uppercase tracking-wider transition-all cursor-pointer text-center"
                >
                  Buy Now
                </button>
              </div>
            </div>
          );
        }
      }
      return <span key={index}>{part}</span>;
    });
  };

  const sendQuickAction = async (textToSend: string) => {
    if (isLoading) return;
    setMessages(prev => [...prev, { role: 'user', text: textToSend }]);
    setIsLoading(true);
    try {
      const response = await fetch('/api/gemini/assist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('nammashop_token') || ''}`
        },
        body: JSON.stringify({
          message: textToSend,
          previousChat: messages.slice(-4).map(m => ({
            role: m.role,
            text: m.text
          }))
        })
      });

      const data = await response.json();
      if (response.ok) {
        setMessages(prev => [...prev, { role: 'assistant', text: data.reply }]);
        if (data.suggestedProductIds && data.suggestedProductIds.length > 0) {
          setMatchedIds(data.suggestedProductIds);
        }
      } else {
        setMessages(prev => [...prev, { role: 'assistant', text: `⚠️ Error: ${data.error || 'Failed to analyze.'}` }]);
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', text: '⚠️ Connection timeout.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || isLoading) return;

    const userText = inputMessage;
    setInputMessage('');
    setMessages(prev => [...prev, { role: 'user', text: userText }]);
    setIsLoading(true);

    try {
      const response = await fetch('/api/gemini/assist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('nammashop_token') || ''}`
        },
        body: JSON.stringify({
          message: userText,
          // Extract last 4 turns to keep context brief and token-efficient
          previousChat: messages.slice(-4).map(m => ({
            role: m.role,
            text: m.text
          }))
        })
      });

      const data = await response.json();
      if (response.ok) {
        setMessages(prev => [...prev, { role: 'assistant', text: data.reply }]);
        if (data.suggestedProductIds && data.suggestedProductIds.length > 0) {
          // Track what product IDs the assistant highlighted
          setMatchedIds(data.suggestedProductIds);
        }
      } else {
        setMessages(prev => [...prev, { role: 'assistant', text: `⚠️ Error: ${data.error || 'Unable to fetch guidance.'}` }]);
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', text: '⚠️ Network timeout. Please confirm server is listening.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const matchedProducts = products.filter(p => matchedIds.includes(p.id) && p.stock > 0);

  const addMatchedToCart = () => {
    if (matchedProducts.length > 0) {
      onAddProductsToCart(matchedProducts.map(p => p.id));
      // Reset trigger IDs
      setMatchedIds([]);
      // Inject bot action confirmation message
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          text: `🎉 **Success!** I've added all available ingredients of this recipe to your active cart for direct instant checkout!`
        }
      ]);
    }
  };

  return (
    <>
      {/* Floating Action Button */}
      <button
        id="btn-ai-companion-toggle"
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-medium rounded-full shadow-lg transition-transform focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
        aria-label="Open AI Chef Assistant"
      >
        <div className="relative">
          <Bot size={22} className="animate-pulse" />
          <span className="absolute -top-1 -right-1 flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
          </span>
        </div>
        <span className="text-sm font-sans tracking-wide">AI Kitchen</span>
      </button>

      {/* AI Assistant Chat Panel */}
      {isOpen && (
        <div
          id="panel-ai-companion"
          className="fixed bottom-24 right-6 z-50 w-[380px] max-w-[calc(100vw-2rem)] h-[480px] bg-white dark:bg-slate-900 border border-gray-100 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-6 duration-200"
        >
          <div className="bg-emerald-600 px-4 py-3.5 flex items-center justify-between text-white shrink-0">
            <div className="flex items-center gap-2">
              <div className="bg-emerald-500/30 p-1.5 rounded-lg">
                <Sparkles size={18} className="text-emerald-100" />
              </div>
              <div>
                <h4 className="font-semibold text-sm leading-tight tracking-wide">Nammashop AI Chef</h4>
                <p className="text-xs text-emerald-100/80">Active Grocery Assistant</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-emerald-100 hover:text-white hover:bg-white/10 p-1 rounded-lg transition-all"
            >
              <X size={18} />
            </button>
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'assistant' && (
                  <div className="h-7 w-7 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
                    <Bot size={14} className="text-emerald-600" />
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-xs inline-block shadow-xs leading-relaxed whitespace-pre-line ${
                    msg.role === 'user'
                      ? 'bg-emerald-600 text-white rounded-br-xs font-sans'
                      : 'bg-white border border-gray-100 text-gray-700 rounded-bl-xs font-sans'
                  }`}
                >
                  {parseMessageText(msg.text)}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-2.5 justify-start">
                <div className="h-7 w-7 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0 animate-bounce">
                  <Bot size={14} className="text-emerald-600" />
                </div>
                <div className="bg-white border border-gray-100 rounded-2xl px-4 py-2.5 text-xs text-gray-400 flex items-center gap-1.5">
                  <span className="dot animate-bounce delay-0 w-1.5 h-1.5 bg-gray-400 rounded-full"></span>
                  <span className="dot animate-bounce delay-100 w-1.5 h-1.5 bg-gray-400 rounded-full"></span>
                  <span className="dot animate-bounce delay-200 w-1.5 h-1.5 bg-gray-400 rounded-full"></span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Quick Actions Scroll Bar */}
          <div className="px-3 py-2 border-t border-gray-100 bg-slate-50/50 flex gap-1.5 overflow-x-auto shrink-0 select-none">
            <button
              onClick={() => sendQuickAction("Look up my previous shopping purchases history and help me order those items again!")}
              disabled={isLoading}
              className="text-[9px] font-bold bg-white text-slate-700 dark:text-slate-300 border border-slate-200 hover:border-emerald-500 rounded-full px-2.5 py-1 whitespace-nowrap cursor-pointer transition-all disabled:opacity-50 shrink-0"
              type="button"
            >
              🔄 Reorder Prev
            </button>
            <button
              onClick={() => sendQuickAction("Design a package of weekly grocery essentials from items currently in stock.")}
              disabled={isLoading}
              className="text-[9px] font-bold bg-white text-slate-700 border border-slate-200 hover:border-emerald-500 rounded-full px-2.5 py-1 whitespace-nowrap cursor-pointer transition-all disabled:opacity-50 shrink-0"
              type="button"
            >
              📦 Weekly Essentials
            </button>
            <button
              onClick={() => sendQuickAction("Which highly nutritious and organic healthy picks do you recommend from our inventory?")}
              disabled={isLoading}
              className="text-[9px] font-bold bg-white text-slate-700 border border-slate-200 hover:border-emerald-500 rounded-full px-2.5 py-1 whitespace-nowrap cursor-pointer transition-all disabled:opacity-50 shrink-0"
              type="button"
            >
              🥗 Healthy Picks
            </button>
            <button
              onClick={() => sendQuickAction("Suggest some of Nammashop's best-selling and trending products currently in stock!")}
              disabled={isLoading}
              className="text-[9px] font-bold bg-white text-slate-700 border border-slate-200 hover:border-emerald-500 rounded-full px-2.5 py-1 whitespace-nowrap cursor-pointer transition-all disabled:opacity-50 shrink-0"
              type="button"
            >
              🔥 Trending
            </button>
            <button
              onClick={() => sendQuickAction("Do you have any active combo offers, discount bundle deals, or today's special discounts?")}
              disabled={isLoading}
              className="text-[9px] font-bold bg-white text-slate-700 border border-slate-200 hover:border-emerald-500 rounded-full px-2.5 py-1 whitespace-nowrap cursor-pointer transition-all disabled:opacity-50 shrink-0"
              type="button"
            >
              🎁 Today's Offers
            </button>
          </div>

          {/* Matched product list helper pop-up */}
          {matchedProducts.length > 0 && (
            <div className="bg-emerald-50/90 border-t border-emerald-100 px-4 py-2.5 flex items-center justify-between text-xs transition-all">
              <div className="flex items-center gap-1.5 text-emerald-800">
                <ShoppingBag size={14} className="text-emerald-600" />
                <span>Found <strong>{matchedProducts.length}</strong> available matching items!</span>
              </div>
              <button
                onClick={addMatchedToCart}
                className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded-md font-medium text-[11px] cursor-pointer"
              >
                <span>Add {matchedProducts.length} items</span>
                <ArrowRight size={10} />
              </button>
            </div>
          )}

          {/* Input field */}
          <form onSubmit={handleSendMessage} className="p-3 border-t border-gray-100 bg-white flex gap-2">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Recipe question or ingredient search..."
              className="flex-1 bg-slate-50 border border-slate-100 dark:border-slate-800 hover:border-slate-200 focus:border-emerald-500 rounded-xl px-3.5 py-2 text-xs focus:outline-none transition-all placeholder:text-gray-400"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={!inputMessage.trim() || isLoading}
              className="bg-emerald-600 hover:bg-emerald-700 text-white p-2 rounded-xl transition-all disabled:opacity-40 disabled:hover:bg-emerald-600 cursor-pointer flex items-center justify-center aspect-square"
            >
              <Send size={14} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}

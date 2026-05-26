import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Bot, Send, Trash2, ShoppingCart, MessageSquare, ArrowRight, BookOpen, AlertCircle } from 'lucide-react';
import { Product } from '../types';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
}

interface AIPageProps {
  products: Product[];
  onAddProductsToCart: (productIds: string[]) => void;
  cartItemIds: string[];
  notifyUser: (message: string, type?: 'success' | 'error' | 'info') => void;
  addToCart?: (productId: string, qty?: number) => void;
  setViewMode?: (mode: 'catalog' | 'checkout' | 'profile' | 'admin' | 'ai' | 'success') => void;
}

export default function AIPage({ products, onAddProductsToCart, cartItemIds, notifyUser, addToCart, setViewMode }: AIPageProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: "💫 **Welcome to Nammashop AI Smart Assistant!**\n\nI have direct access to our live inventory of fresh, 100% organic products. Ask me any culinary or grocery questions, and I'll find available items on our shelves so you can add them to your delivery cart in 1 click!\n\n**Try asking me:**\n* *\"I want breakfast items for 1 week\"*\n* *\"Suggest a healthy recipe with Alphonso Mangoes\"*\n* *\"Do you have fresh tomatoes and milk? List their prices\"*",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [matchedIds, setMatchedIds] = useState<string[]>([]);
  
  const chatEndRef = useRef<HTMLDivElement>(null);

  const parseMessageText = (text: string) => {
    // Regex splits on [PRODUCT:id] tags
    const parts = text.split(/(\[PRODUCT:[a-zA-Z0-9_\-]+\])/g);
    return parts.map((part, index) => {
      const match = part.match(/^\[PRODUCT:([a-zA-Z0-9_\-]+)\]$/);
      if (match) {
        const prodId = match[1];
        const p = products.find(prod => prod.id === prodId);
        if (p) {
          const discountPrice = p.price * (1 - p.discount / 100);
          return (
            <div key={index} className="my-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-150 rounded-2xl p-3 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm text-slate-850 text-left select-none">
              <div className="flex items-center gap-2.5 w-full sm:w-auto truncate">
                <img src={p.image} className="h-10 w-10 object-cover rounded-xl border border-white shrink-0 shadow-3xs" referrerPolicy="no-referrer" />
                <div className="truncate text-left leading-tight">
                  <span className="text-[9px] font-mono bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded-full inline-block uppercase tracking-wider mb-0.5">{p.brand}</span>
                  <h4 className="font-extrabold text-[11px] text-slate-900 dark:text-white truncate max-w-[160px]">{p.name}</h4>
                  <p className="text-[9px] text-slate-500 font-mono">{p.unit} • {p.stock > 0 ? `${p.stock} in stock` : 'Out of Stock'}</p>
                </div>
              </div>
              <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between sm:justify-center shrink-0 w-full sm:w-auto gap-2">
                <div className="text-right flex items-center gap-1">
                  {p.discount > 0 && (
                    <span className="text-[9px] line-through text-slate-400 font-mono">£{p.price.toFixed(2)}</span>
                  )}
                  <span className="text-[11px] font-mono font-black text-rose-600">£{discountPrice.toFixed(2)}</span>
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (addToCart) {
                        addToCart(p.id, 1);
                        notifyUser(`Added ${p.name} to delivery cart!`, 'success');
                      } else {
                        onAddProductsToCart([p.id]);
                        notifyUser(`Added ${p.name} to cart.`, 'success');
                      }
                    }}
                    disabled={p.stock <= 0}
                    className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-[9px] px-2 py-1 rounded-md uppercase tracking-wider transition-all cursor-pointer text-center"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (addToCart && setViewMode) {
                        addToCart(p.id, 1);
                        setViewMode('checkout');
                        notifyUser(`Checking out for immediate delivery of ${p.name}!`, 'info');
                      } else {
                        onAddProductsToCart([p.id]);
                        notifyUser(`Review your delivery cart to purchase.`, 'info');
                      }
                    }}
                    disabled={p.stock <= 0}
                    className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-[9px] px-2 py-1 rounded-md uppercase tracking-wider transition-all cursor-pointer text-center"
                  >
                    Buy Now
                  </button>
                </div>
              </div>
            </div>
          );
        }
      }
      return <span key={index}>{part}</span>;
    });
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSendMessage = async (textToSend: string) => {
    if (!textToSend.trim() || isLoading) return;

    const userMessage: Message = {
      id: Math.random().toString(36).substring(7),
      role: 'user',
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMessage]);
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
          previousChat: messages.slice(-6).map(m => ({
            role: m.role,
            text: m.text
          }))
        })
      });

      const data = await response.json();
      if (response.ok) {
        setMessages(prev => [...prev, {
          id: Math.random().toString(36).substring(7),
          role: 'assistant',
          text: data.reply,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }]);

        if (data.suggestedProductIds && data.suggestedProductIds.length > 0) {
          setMatchedIds(data.suggestedProductIds);
          notifyUser(`AI processed! Found ${data.suggestedProductIds.length} matching products from store shelves.`, 'info');
        } else {
          setMatchedIds([]);
        }
      } else {
        setMessages(prev => [...prev, {
          id: Math.random().toString(36).substring(7),
          role: 'assistant',
          text: `⚠️ **API Response Mismatch:** ${data.error || 'Server error occurred during prompt parsing.'}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }]);
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        id: Math.random().toString(36).substring(7),
        role: 'assistant',
        text: '⚠️ **Network connection aborted.** Please verify Nammashop background process is fully listening on port 3000.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;
    const text = inputMessage;
    setInputMessage('');
    handleSendMessage(text);
  };

  const matchedProducts = products.filter(p => matchedIds.includes(p.id) && p.stock > 0);

  const addAllMatchedToCart = () => {
    if (matchedProducts.length > 0) {
      onAddProductsToCart(matchedProducts.map(p => p.id));
      notifyUser(`Success! Added ${matchedProducts.length} matching recipe items to your active cart!`, 'success');
      setMatchedIds([]);
    }
  };

  const clearChatHistory = () => {
    if (window.confirm('Delete all messages from this session?')) {
      setMessages([
        {
          id: 'welcome',
          role: 'assistant',
          text: "💫 **Welcome back!** Ready for more grocery optimization ideas. Ask me about custom seven-day plans or ingredients setup.",
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
      setMatchedIds([]);
    }
  };

  const samplePrompts = [
    { label: "🔄 Reorder Previous Items", text: "Look up my previous shopping purchases history and help me order those items again!" },
    { label: "📦 Weekly Essentials", text: "Design a package of weekly grocery essentials from items currently in stock." },
    { label: "🥗 Healthy Picks", text: "Which highly nutritious and organic healthy picks do you recommend from our inventory?" },
    { label: "🔥 Trending Products", text: "Suggest some of Nammashop's best-selling and trending products currently in stock!" },
    { label: "🎁 Today's Offers & Combos", text: "Do you have any active combo offers, discount bundle deals, or today's special discounts?" }
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 md:py-8 animate-in fade-in duration-300">
      
      {/* Top Banner Alert */}
      <div className="bg-gradient-to-tr from-emerald-600 to-teal-600 rounded-[2rem] p-6 text-white shadow-md mb-8 flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
        <div className="space-y-1.5 z-10 text-center md:text-left">
          <div className="inline-flex items-center gap-1.5 bg-emerald-500/30 text-emerald-100 font-sans font-bold text-[10px] tracking-widest uppercase px-3 py-1 rounded-full border border-emerald-400/25">
            <Sparkles size={11} className="text-emerald-300 animate-spin" />
            <span>Nammashop AI Engine</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight leading-tight">AI Grocery Kitchen & Assistant</h1>
          <p className="text-xs text-emerald-100/90 font-medium max-w-xl">
            Real-time deep query integration. Plan dinners, extract lists, compile custom servings, and matching local shelf inventory levels instantly.
          </p>
        </div>
        <div className="z-10 bg-white dark:bg-slate-900/10 border border-white/20 backdrop-blur-md px-4 py-3 rounded-2xl flex items-center gap-2">
          <Bot size={24} className="text-emerald-100 animate-bounce" />
          <div className="text-left text-xs text-white">
            <p className="font-bold font-sans">Gemini 3.5 Active</p>
            <p className="text-[10px] text-emerald-200">100% Secure Inventory Reads</p>
          </div>
        </div>
        <div className="absolute -right-20 -top-20 bg-emerald-500/20 h-64 w-64 rounded-full blur-3xl pointer-events-none" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left column: Chat Panel */}
        <div className="lg:col-span-8 bg-white border border-gray-100 rounded-[2.5rem] shadow-3xs overflow-hidden flex flex-col h-[600px]">
          {/* Panel Header */}
          <div className="border-b border-gray-100 px-6 py-4 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center gap-3">
              <div className="bg-emerald-100 text-emerald-700 p-2 rounded-xl">
                <Bot size={18} />
              </div>
              <div>
                <span className="font-extrabold text-slate-800 dark:text-slate-100 text-sm block">Live AI Conversation</span>
                <span className="text-[10px] font-mono text-emerald-600 flex items-center gap-1">
                  <span className="h-1.5 w-1.5 bg-emerald-500 rounded-full animate-ping" /> Connection Established
                </span>
              </div>
            </div>

            <button
              onClick={clearChatHistory}
              title="Clear entire converse history"
              className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 p-2 rounded-xl transition-all cursor-pointer border border-transparent hover:border-rose-100"
            >
              <Trash2 size={15} />
            </button>
          </div>

          {/* Messages Container */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/30">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'assistant' && (
                  <div className="h-8 w-8 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
                    <Bot size={15} className="text-emerald-650" />
                  </div>
                )}
                <div
                  className={`max-w-[85%] rounded-[1.5rem] px-5 py-3.5 text-xs shadow-3xs leading-relaxed whitespace-pre-line ${
                    msg.role === 'user'
                      ? 'bg-emerald-600 text-white rounded-br-xs font-sans'
                      : 'bg-white border border-gray-100 text-slate-700 dark:text-slate-300 rounded-bl-xs font-sans'
                  }`}
                >
                  <div className="markdown-body">
                    {parseMessageText(msg.text)}
                  </div>
                  <span className={`text-[9px] block text-right mt-1.5 font-mono ${msg.role === 'user' ? 'text-emerald-250' : 'text-slate-400'}`}>
                    {msg.timestamp}
                  </span>
                </div>
              </div>
            ))}
            
            {/* Typing state loading animation */}
            {isLoading && (
              <div className="flex gap-3.5 justify-start">
                <div className="h-8 w-8 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0 animate-bounce">
                  <Bot size={15} className="text-emerald-650" />
                </div>
                <div className="bg-white border border-gray-100 rounded-[1.5rem] px-5 py-3.5 text-xs text-slate-400 flex items-center gap-1.5 shadow-3xs">
                  <span className="font-medium animate-pulse">Nammashop Assistant analyzing store shelves</span>
                  <div className="flex items-center gap-1">
                    <span className="dot animate-bounce delay-0 w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                    <span className="dot animate-bounce delay-100 w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                    <span className="dot animate-bounce delay-200 w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Quick chip template suggestions */}
          <div className="border-t border-gray-100 px-6 py-3 flex flex-wrap gap-2 overflow-x-auto bg-slate-50/20 max-h-24">
            {samplePrompts.map((q, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSendMessage(q.text)}
                disabled={isLoading}
                className="text-[10px] bg-white border border-slate-200 dark:border-slate-700 hover:border-emerald-500 hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 font-sans px-3 py-1.5 rounded-full cursor-pointer transition-all shrink-0 font-medium disabled:opacity-50"
              >
                {q.label}
              </button>
            ))}
          </div>

          {/* Input control form */}
          <form onSubmit={handleFormSubmit} className="p-4 border-t border-gray-100 bg-white flex gap-2.5">
            <input
              type="text"
              required
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Ask Nammashop AI Chef for high protein recipes or weekly prep items..."
              className="flex-1 bg-slate-50 border border-slate-200 hover:border-slate-300 focus:border-emerald-500 rounded-2xl px-4 py-3 text-xs focus:outline-none transition-all placeholder:text-gray-400 font-sans"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={!inputMessage.trim() || isLoading}
              className="bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white p-3 rounded-2xl transition-all disabled:opacity-40 disabled:hover:bg-emerald-600 cursor-pointer flex items-center justify-center shadow-3xs font-bold shrink-0 aspect-square"
            >
              <Send size={15} />
            </button>
          </form>
        </div>

        {/* Right column: Matching stock item list popup */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Matching Products Widget Card */}
          <div className="bg-white border border-gray-100 rounded-[2rem] p-5 shadow-3xs space-y-4">
            <div className="flex items-center justify-between border-b border-gray-50 pb-3">
              <div className="flex items-center gap-1.5">
                <MessageSquare size={15} className="text-emerald-650" />
                <h3 className="font-extrabold text-slate-800 text-xs uppercase tracking-wider">AI Shelf Suggestions</h3>
              </div>
              <span className="text-[10px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-500 px-2 py-0.5 rounded-full font-bold">
                In Stock
              </span>
            </div>

            {matchedProducts.length > 0 ? (
              <div className="space-y-3">
                <p className="text-[11px] text-slate-500">
                  We have found <strong>{matchedProducts.length}</strong> matching organic product(s) in active stock matching your recipe outline:
                </p>

                <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                  {matchedProducts.map(p => (
                    <div key={p.id} className="flex items-center justify-between bg-slate-50 border border-slate-100 dark:border-slate-800 rounded-xl p-2 gap-2">
                      <div className="flex items-center gap-2 truncate">
                        <img src={p.image} className="h-8 w-8 object-cover rounded-lg shrink-0 border border-white" referrerPolicy="no-referrer" />
                        <div className="truncate text-left">
                          <h4 className="font-bold text-slate-800 text-[11px] truncate leading-tight">{p.name}</h4>
                          <span className="text-[9px] font-mono text-slate-450 block">{p.unit} • {p.brand}</span>
                        </div>
                      </div>
                      <span className="text-[11px] font-mono font-black text-slate-700 shrink-0">
                        £{p.price.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={addAllMatchedToCart}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs py-2.5 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <ShoppingCart size={13} />
                  <span>Add {matchedProducts.length} Items To Cart</span>
                  <ArrowRight size={11} className="ml-1" />
                </button>
              </div>
            ) : (
              <div className="text-center py-6 text-slate-400 space-y-2">
                <BookOpen size={22} className="mx-auto text-slate-300" />
                <p className="text-[11px] italic">
                  Ask AI for recipes, mango shakes, weekly packages, or combo listings to highlight matching products automatically.
                </p>
              </div>
            )}
          </div>

          {/* Assistant FAQs Info Banner */}
          <div className="bg-emerald-50/50 border border-emerald-100 rounded-[2rem] p-5 shadow-3xs space-y-3 text-left">
            <h4 className="font-extrabold text-emerald-800 text-xs flex items-center gap-1.5">
              <AlertCircle size={14} className="text-emerald-650" />
              Frequently Asked Questions
            </h4>
            
            <div className="space-y-2 text-[11px] text-emerald-900 leading-relaxed font-sans">
              <div>
                <span className="font-bold block text-emerald-800">Can AI check out for me?</span>
                <p className="text-emerald-700">Not directly, but AI automatically adds catalog ingredients to your active shopping list. You can review and proceed on checkout gates.</p>
              </div>
              
              <div>
                <span className="font-bold block text-emerald-800">Are the prices updated?</span>
                <p className="text-emerald-700">Yes, the AI Assistant references our live store inventory levels, prices, and unit pack descriptions in real-time.</p>
              </div>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}

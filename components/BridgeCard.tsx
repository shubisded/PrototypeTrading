
import React, { useState } from 'react';

type Tab = 'BRIDGE' | 'SWAP' | 'SEND';

const BridgeCard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('BRIDGE');
  const [fromAmount, setFromAmount] = useState('0');
  const [toAmount, setToAmount] = useState('0');

  const tabs: Tab[] = ['BRIDGE', 'SWAP', 'SEND'];

  return (
    <div className="w-full max-w-[480px] bg-[#051505] border border-[#152b15] rounded-xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
      {/* Header Tabs */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#152b15]">
        <div className="flex gap-2">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1 text-[11px] font-bold tracking-widest rounded transition-all ${
                activeTab === tab 
                ? 'bg-[#152b15] text-[#f5f5dc]' 
                : 'text-emerald-900 hover:text-emerald-200'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        <button className="text-emerald-900 hover:text-[#f5f5dc] transition-colors">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/>
          </svg>
        </button>
      </div>

      {/* Input Sections */}
      <div className="p-4 space-y-2 relative">
        
        {/* From Section */}
        <div className="bg-[#081a08] border border-[#152b15] p-5 rounded-lg">
          <div className="flex justify-between items-center mb-2">
            <input 
              type="text" 
              value={fromAmount}
              onChange={(e) => setFromAmount(e.target.value)}
              className="bg-transparent text-2xl font-medium w-2/3 focus:outline-none text-[#f5f5dc]"
              placeholder="0"
            />
            <button className="flex items-center gap-2 bg-[#152b15] px-3 py-1.5 rounded-lg border border-[#1e3d1e] hover:bg-[#1e3d1e] transition-colors">
               <img src="https://cryptologos.cc/logos/solana-sol-logo.png?v=024" className="w-5 h-5 grayscale invert brightness-[2.5]" style={{ filter: 'grayscale(1) invert(1) brightness(1.5) sepia(1) hue-rotate(10deg) saturate(0.5)' }} alt="SOL" />
               <span className="text-xs font-bold text-[#f5f5dc]">SOL</span>
               <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#f5f5dc]/50">
                 <path d="m6 9 6 6 6-6"/>
               </svg>
            </button>
          </div>
          <div className="text-[11px] text-emerald-800 font-medium">$0.000</div>
        </div>

        {/* Swap Switch Button */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
            <button className="w-8 h-8 bg-[#081a08] border border-[#152b15] rounded-full flex items-center justify-center text-emerald-500 hover:text-[#f5f5dc] transition-all hover:scale-110 shadow-lg">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M7 15l5 5 5-5M7 9l5-5 5 5"/>
                </svg>
            </button>
        </div>

        {/* To Section */}
        <div className="bg-[#081a08] border border-[#152b15] p-5 rounded-lg">
          <div className="flex justify-between items-center mb-2">
            <input 
              type="text" 
              value={toAmount}
              onChange={(e) => setToAmount(e.target.value)}
              className="bg-transparent text-2xl font-medium w-2/3 focus:outline-none text-[#f5f5dc]"
              placeholder="0"
            />
            <button className="flex items-center gap-2 bg-[#152b15] px-3 py-1.5 rounded-lg border border-[#1e3d1e] hover:bg-[#1e3d1e] transition-colors">
               <img src="https://cryptologos.cc/logos/zcash-zec-logo.png?v=024" className="w-5 h-5 grayscale invert brightness-[2.5]" style={{ filter: 'grayscale(1) invert(1) brightness(1.5) sepia(1) hue-rotate(10deg) saturate(0.5)' }} alt="ZEC" />
               <span className="text-xs font-bold text-[#f5f5dc]">ZEC</span>
               <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#f5f5dc]/50">
                 <path d="m6 9 6 6 6-6"/>
               </svg>
            </button>
          </div>
          <div className="text-[11px] text-emerald-800 font-medium">$0.000</div>
        </div>

        {/* Address Input */}
        <div className="bg-[#081a08] border border-[#152b15] px-5 py-4 rounded-lg flex items-center justify-between">
            <input 
                type="text" 
                placeholder="Enter Recipient Address"
                className="bg-transparent text-[11px] w-full focus:outline-none text-emerald-100/30 uppercase tracking-widest font-bold placeholder:text-emerald-900"
            />
            <button className="text-[10px] font-bold text-emerald-500 border border-[#152b15] px-2 py-1 rounded hover:bg-[#152b15] transition-colors uppercase tracking-widest">
                Paste
            </button>
        </div>
      </div>

      {/* Near Intent Subtext */}
      <div className="text-center py-4 bg-transparent">
          <p className="text-[10px] text-emerald-900 font-bold uppercase tracking-widest">
            With <span className="text-emerald-500">❤</span> Near Intent
          </p>
      </div>

      {/* Connect Wallet Large Button */}
      <div className="p-1">
        <button className="w-full py-5 bg-[#f5f5dc] hover:bg-emerald-50 text-[#020f02] font-bold text-xs uppercase tracking-[0.2em] transition-all rounded-lg">
            Connect Wallet
        </button>
      </div>
    </div>
  );
};

export default BridgeCard;

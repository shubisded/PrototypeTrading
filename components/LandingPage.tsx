
import React from 'react';
import { ViewState } from '../App';

interface Props {
  onSelect: (view: ViewState) => void;
}

const LandingPage: React.FC<Props> = ({ onSelect }) => {
  return (
    <div className="relative z-10 flex-grow flex items-center justify-center px-6">
      <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 gap-8">
        
        {/* Option 1: Synthetic Market */}
        <button 
          onClick={() => onSelect('SYNTHETIC')}
          className="group relative bg-[#0c1515] border border-[#1a2e2e] hover:border-[#2ed3b7] p-10 rounded-3xl transition-all duration-500 overflow-hidden flex flex-col text-left active:scale-[0.98]"
        >
          <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-30 transition-opacity">
            <span className="text-8xl font-bold italic tracking-tighter">01</span>
          </div>
          <div className="mb-8 w-14 h-14 bg-[#1a2e2e] group-hover:bg-[#2ed3b7] rounded-2xl flex items-center justify-center transition-colors duration-500">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#2ed3b7] group-hover:text-[#040b0b] transition-colors duration-500">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white mb-4 uppercase tracking-[0.1em] group-hover:text-[#2ed3b7] transition-colors">Synthetic Market</h2>
          <p className="text-[12px] text-[#7f8c8d] uppercase tracking-widest leading-relaxed mb-8">
            Trade the digital equivalent of DRAM based on real-time spot prices. Gain direct exposure to semiconductor commodity movements.
          </p>
          <div className="mt-auto flex items-center gap-3">
             <span className="text-[10px] font-bold text-[#2ed3b7] uppercase tracking-[0.3em]">Enter Exchange</span>
             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2ed3b7" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="transform translate-x-0 group-hover:translate-x-2 transition-transform">
                <path d="M5 12h14M12 5l7 7-7 7" />
             </svg>
          </div>
          <div className="absolute bottom-0 left-0 h-1 w-0 bg-[#2ed3b7] group-hover:w-full transition-all duration-700"></div>
        </button>

        {/* Option 2: Prediction Market */}
        <button 
          onClick={() => onSelect('PREDICTION')}
          className="group relative bg-[#0c1515] border border-[#1a2e2e] hover:border-[#2ed3b7] p-10 rounded-3xl transition-all duration-500 overflow-hidden flex flex-col text-left active:scale-[0.98]"
        >
          <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-30 transition-opacity">
            <span className="text-8xl font-bold italic tracking-tighter">02</span>
          </div>
          <div className="mb-8 w-14 h-14 bg-[#1a2e2e] group-hover:bg-[#2ed3b7] rounded-2xl flex items-center justify-center transition-colors duration-500">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#2ed3b7] group-hover:text-[#040b0b] transition-colors duration-500">
              <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
              <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
              <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white mb-4 uppercase tracking-[0.1em] group-hover:text-[#2ed3b7] transition-colors">Prediction Market</h2>
          <p className="text-[12px] text-[#7f8c8d] uppercase tracking-widest leading-relaxed mb-8">
            Buy shares of outcomes on the price action of DRAM spot prices. Forecast supply chain shifts and industrial demand.
          </p>
          <div className="mt-auto flex items-center gap-3">
             <span className="text-[10px] font-bold text-[#2ed3b7] uppercase tracking-[0.3em]">Launch Portal</span>
             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2ed3b7" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="transform translate-x-0 group-hover:translate-x-2 transition-transform">
                <path d="M5 12h14M12 5l7 7-7 7" />
             </svg>
          </div>
          <div className="absolute bottom-0 left-0 h-1 w-0 bg-[#2ed3b7] group-hover:w-full transition-all duration-700"></div>
        </button>

      </div>
    </div>
  );
};

export default LandingPage;

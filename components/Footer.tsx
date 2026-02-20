import React from "react";

const Footer: React.FC = () => {
  return (
    <footer className="relative z-30 w-full max-w-[1700px] flex items-center justify-between px-6 md:px-8 py-5 mt-1">
      {/* Left side: Network Info */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 bg-[#0c1515] border border-[#1a2e2e] rounded-full px-4 py-2 shadow-lg">
          <span className="w-2 h-2 rounded-full bg-[#2ed3b7] shadow-[0_0_8px_#2ed3b7]"></span>
          <span className="text-[11px] font-bold text-[#2ed3b7] uppercase tracking-[0.14em]">
            Floor: Mainnet
          </span>
        </div>
        <div className="hidden lg:flex items-center gap-6 ml-6">
          {["Terms", "Policy", "Support", "GitHub"].map((item) => (
            <a
              key={item}
              href="#"
              className="text-[11px] font-bold text-[#7f8c8d] hover:text-[#2ed3b7] transition-colors uppercase tracking-[0.12em]"
            >
              {item}
            </a>
          ))}
        </div>
      </div>

      {/* Floating Action (Mock Chat Button) */}
      <div className="relative">
        <button className="w-12 h-12 bg-[#2ed3b7] rounded-full flex items-center justify-center shadow-2xl shadow-[#2ed3b7]/30 hover:scale-110 active:scale-95 transition-all">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#040b0b"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      </div>
    </footer>
  );
};

export default Footer;


import React, { useMemo } from 'react';

const BackgroundGrid: React.FC = () => {
  const characters = "++//0011__^^**!!~~";
  
  const grid = useMemo(() => {
    const rows = 24;
    const cols = 24;
    const items = [];
    for (let i = 0; i < rows; i++) {
      const row = [];
      for (let j = 0; j < cols; j++) {
        row.push(characters[Math.floor(Math.random() * characters.length)]);
      }
      items.push(row);
    }
    return items;
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none select-none overflow-hidden">
      <div className="absolute inset-0 opacity-10">
        <div className="grid grid-cols-24 grid-rows-24 gap-16 p-20 w-full h-full text-white text-[10px] font-mono leading-none">
            {grid.map((row, i) => (
            row.map((char, j) => (
                <div 
                    key={`${i}-${j}`} 
                    className={`transition-all duration-[4000ms] ${Math.random() > 0.9 ? 'opacity-100 scale-125' : 'opacity-20'}`}
                    style={{
                        color: Math.random() > 0.95 ? '#2ed3b7' : (Math.random() > 0.8 ? '#ffffff' : '#1a2e2e')
                    }}
                >
                {char}
                </div>
            ))
            ))}
        </div>
      </div>
      
      {/* Background radial overlays for color depth */}
      <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 10% 20%, rgba(46, 211, 183, 0.05) 0%, transparent 40%)' }}></div>
      <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 90% 80%, rgba(46, 211, 183, 0.05) 0%, transparent 40%)' }}></div>
      <div className="absolute inset-0 bg-[#040b0b]/50 backdrop-blur-[2px]"></div>
    </div>
  );
};

export default BackgroundGrid;

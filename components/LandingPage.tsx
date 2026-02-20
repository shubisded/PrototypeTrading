import React from "react";
import { ViewState } from "../App";

interface Props {
  onSelect: (view: ViewState) => void;
  activityFeed: Array<{ id: number; text: string; timestamp: string }>;
  usernameReady: boolean;
  usernameCheckComplete: boolean;
  currentUsername: string;
  onSetUsername: (username: string) => Promise<{ ok: boolean; error?: string }>;
}

const LandingPage: React.FC<Props> = ({
  onSelect,
  activityFeed,
  usernameReady,
  usernameCheckComplete,
  currentUsername,
  onSetUsername,
}) => {
  const [usernameInput, setUsernameInput] = React.useState("");
  const [usernameError, setUsernameError] = React.useState("");
  const [savingUsername, setSavingUsername] = React.useState(false);

  React.useEffect(() => {
    if (usernameReady && currentUsername && currentUsername !== "DEMO") {
      setUsernameInput(currentUsername);
    }
  }, [usernameReady, currentUsername]);

  const submitUsername = async () => {
    const trimmed = usernameInput.trim();
    if (!trimmed) {
      setUsernameError("Enter a username");
      return;
    }
    setSavingUsername(true);
    setUsernameError("");
    const result = await onSetUsername(trimmed);
    if (!result.ok) {
      setUsernameError(result.error || "Failed to set username");
    }
    setSavingUsername(false);
  };

  return (
    <div className="relative z-10 flex-grow w-full max-w-[1500px] px-6 pt-24 pb-12">
      {usernameCheckComplete && !usernameReady ? (
        <div className="fixed inset-0 z-[130] bg-[#020808]/72 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="w-full max-w-[560px] rounded-2xl border border-[#1a2e2e] bg-[#0c1515] shadow-[0_24px_60px_rgba(0,0,0,0.6)] p-6">
            <h3 className="text-[16px] font-black uppercase tracking-[0.12em] text-[#2ed3b7]">
              Set Username
            </h3>
            <p className="mt-2 text-[12px] text-[#9ab3b3] font-semibold">
              Create a username to unlock Spot and Prediction markets.
            </p>
            <div className="mt-4 flex flex-col sm:flex-row gap-2">
              <input
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value.replace(/\s+/g, ""))}
                placeholder="Enter username"
                className="flex-1 h-11 px-4 rounded-lg bg-[#081212] border border-[#1a2e2e] text-white font-bold tracking-[0.04em] focus:outline-none focus:border-[#2ed3b7]"
                disabled={savingUsername}
              />
              <button
                onClick={submitUsername}
                disabled={savingUsername}
                className="h-11 px-4 rounded-lg bg-[#2ed3b7] text-[#040b0b] text-[12px] font-black uppercase tracking-[0.12em] disabled:opacity-50"
              >
                {savingUsername ? "Saving..." : "Save"}
              </button>
            </div>
            {usernameError ? (
              <div className="mt-2 text-[10px] font-bold uppercase tracking-[0.1em] text-rose-400">
                {usernameError}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="mb-6 bg-[#0c1515] border border-[#1a2e2e] rounded-xl px-6 py-5">
        <h1 className="text-5xl md:text-6xl font-black uppercase tracking-[0.08em] text-white leading-none">
          Choose Your Table
        </h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <button
          onClick={() => onSelect("SYNTHETIC")}
          disabled={!usernameReady}
          className="group relative overflow-hidden text-left bg-[#0c1515] border border-[#1a2e2e] rounded-xl p-7 md:p-9 min-h-[320px] flex flex-col"
        >
          <img
            src="/landing-spot.png"
            alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-35 group-hover:opacity-45 transition-opacity duration-300 pointer-events-none"
          />
          <div className="absolute inset-0 bg-[linear-gradient(125deg,rgba(6,14,16,0.92)_5%,rgba(10,24,34,0.88)_45%,rgba(6,12,20,0.86)_100%)] pointer-events-none" />
          <div className="relative z-10 flex flex-col h-full">
          <div className="flex items-center justify-between mb-8">
            <span className="px-3 py-1.5 rounded-full bg-[#183048] text-[#2ed3b7] text-[11px] font-bold uppercase tracking-[0.16em]">
              Spot Market
            </span>
          </div>

          <h2 className="text-4xl font-black uppercase tracking-[0.06em] text-white mb-5">
            Spot Market
          </h2>
          <p className="text-[18px] leading-relaxed text-[#7f8c8d] mb-4">
            Real-time DRAM spot trading
          </p>

          <div>
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#2ed3b7] text-[#040b0b] text-[12px] font-bold uppercase tracking-[0.14em]">
              Enter Spot
              <span className="text-[16px] leading-none">&gt;</span>
            </span>
          </div>
          </div>
        </button>

        <button
          onClick={() => onSelect("PREDICTION")}
          disabled={!usernameReady}
          className="group relative overflow-hidden text-left bg-[#0c1515] border border-[#1a2e2e] rounded-xl p-7 md:p-9 min-h-[320px] flex flex-col"
        >
          <img
            src="/landing-prediction.png"
            alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-35 group-hover:opacity-45 transition-opacity duration-300 pointer-events-none"
          />
          <div className="absolute inset-0 bg-[linear-gradient(125deg,rgba(10,8,20,0.92)_5%,rgba(24,18,36,0.88)_45%,rgba(8,10,20,0.86)_100%)] pointer-events-none" />
          <div className="relative z-10 flex flex-col h-full">
          <div className="flex items-center justify-between mb-8">
            <span className="px-3 py-1.5 rounded-full bg-[#2a1f38] text-[#d0b6ff] text-[11px] font-bold uppercase tracking-[0.16em]">
              Prediction Market
            </span>
          </div>

          <h2 className="text-4xl font-black uppercase tracking-[0.06em] text-white mb-5">
            Prediction Market
          </h2>
          <p className="text-[18px] leading-relaxed text-[#7f8c8d] mb-4">
            Take YES/NO positions on future DRAM moves
          </p>

          <div>
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#2ed3b7] text-[#040b0b] text-[12px] font-bold uppercase tracking-[0.14em]">
              Enter Prediction
              <span className="text-[16px] leading-none">&gt;</span>
            </span>
          </div>
          </div>
        </button>
      </div>

      <div className="mt-6 bg-[#0c1515] border border-[#1a2e2e] rounded-xl p-4 h-[150px]">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#7f8c8d] mb-3">
          Activity
        </h3>
        <div className="h-[calc(100%-26px)] overflow-y-auto pr-1 space-y-1.5">
          {activityFeed.length ? (
            activityFeed.map((item) => (
              <div
                key={item.id}
                className="rounded-md border border-[#1a2e2e] bg-[#081212] px-3 py-2 flex items-start justify-between gap-3"
              >
                <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#c7d6d6] leading-snug">
                  {item.text}
                </span>
                <span className="text-[9px] font-bold uppercase tracking-[0.08em] text-[#7f8c8d] shrink-0">
                  {item.timestamp}
                </span>
              </div>
            ))
          ) : (
            <div className="h-full flex items-center justify-center">
              <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#7f8c8d]">
                No activity yet
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LandingPage;

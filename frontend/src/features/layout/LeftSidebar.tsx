type LeftSidebarProps = {
  location: string;
  onNavigate: (path: string) => void;
  scanRunning: boolean;
  onRunIncrementalScan: () => Promise<void>;
  onRunFullScan: () => Promise<void>;
};

const navItems = [
  { label: "Albums", path: "/albums" },
  { label: "Artists", path: "/artists" },
  { label: "Tracks", path: "/tracks" },
  { label: "Settings", path: "/settings" },
];

export function LeftSidebar(props: LeftSidebarProps) {
  return (
    <aside className="flex h-full flex-col gap-6 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <div>
        <p className="text-xl font-semibold tracking-wide text-zinc-100">ben</p>
      </div>

      <nav aria-label="Main navigation" className="flex flex-col gap-2">
        {navItems.map((item) => {
          const isActive = props.location.startsWith(item.path);
          return (
            <button
              key={item.path}
              type="button"
              onClick={() => props.onNavigate(item.path)}
              className={`rounded-md px-3 py-2 text-left text-sm transition ${
                isActive
                  ? "bg-zinc-100 text-zinc-900"
                  : "bg-zinc-800/70 text-zinc-200 hover:bg-zinc-800"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-2 border-t border-zinc-800 pt-4">
        <p className="text-xs tracking-wide text-zinc-400 uppercase">Scan</p>
        <button
          type="button"
          onClick={() => void props.onRunIncrementalScan()}
          disabled={props.scanRunning}
          className="rounded-md bg-zinc-800 px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {props.scanRunning ? "Scanning..." : "Incremental Scan"}
        </button>
        <button
          type="button"
          onClick={() => void props.onRunFullScan()}
          disabled={props.scanRunning}
          className="rounded-md bg-zinc-800 px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {props.scanRunning ? "Scanning..." : "Full Scan"}
        </button>
      </div>
    </aside>
  );
}

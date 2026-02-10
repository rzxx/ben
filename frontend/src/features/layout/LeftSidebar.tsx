import { Disc3, FolderSearch, Library, Music2, Settings2, Users } from "lucide-react";

type LeftSidebarProps = {
  location: string;
  onNavigate: (path: string) => void;
  scanRunning: boolean;
  onRunIncrementalScan: () => Promise<void>;
  onRunFullScan: () => Promise<void>;
};

const navItems = [
  { label: "Albums", path: "/albums", icon: Library },
  { label: "Artists", path: "/artists", icon: Users },
  { label: "Tracks", path: "/tracks", icon: Music2 },
  { label: "Settings", path: "/settings", icon: Settings2 },
];

export function LeftSidebar(props: LeftSidebarProps) {
  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950 px-4 pb-36 pt-4">
      <div className="border-b border-zinc-800 pb-4">
        <p className="text-xl font-semibold tracking-wide text-zinc-100">ben</p>
        <p className="mt-1 text-xs text-zinc-500">Local music player</p>
      </div>

      <nav
        aria-label="Main navigation"
        className="mt-4 flex min-h-0 flex-1 flex-col gap-2"
      >
        {navItems.map((item) => {
          const isActive = props.location.startsWith(item.path);
          const Icon = item.icon;
          return (
            <button
              key={item.path}
              type="button"
              onClick={() => props.onNavigate(item.path)}
              className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition ${
                isActive
                  ? "bg-zinc-100 text-zinc-900"
                  : "bg-zinc-800/70 text-zinc-200 hover:bg-zinc-800"
              }`}
            >
              <Icon size={15} />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="mt-4 flex flex-col gap-2 border-t border-zinc-800 pt-4">
        <p className="text-xs tracking-wide text-zinc-400 uppercase">Scan</p>
        <button
          type="button"
          onClick={() => void props.onRunIncrementalScan()}
          disabled={props.scanRunning}
          className="inline-flex items-center gap-2 rounded-md bg-zinc-800 px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Disc3 size={15} />
          {props.scanRunning ? "Scanning..." : "Incremental Scan"}
        </button>
        <button
          type="button"
          onClick={() => void props.onRunFullScan()}
          disabled={props.scanRunning}
          className="inline-flex items-center gap-2 rounded-md bg-zinc-800 px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <FolderSearch size={15} />
          {props.scanRunning ? "Scanning..." : "Full Scan"}
        </button>
      </div>
    </aside>
  );
}

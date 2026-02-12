import {
  BarChart3,
  Disc3,
  FolderSearch,
  Library,
  Music2,
  Settings2,
  Users,
} from "lucide-react";

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
  { label: "Stats", path: "/stats", icon: BarChart3 },
  { label: "Settings", path: "/settings", icon: Settings2 },
];

export function LeftSidebar(props: LeftSidebarProps) {
  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-white/3 px-4 pt-4 pb-36">
      <nav
        aria-label="Main navigation"
        className="flex min-h-0 flex-1 flex-col gap-2"
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
                  ? "bg-neutral-100 text-neutral-900"
                  : "text-neutral-200 hover:bg-neutral-800"
              }`}
            >
              <Icon size={15} />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="mt-4 flex flex-col gap-2 border-t border-white/3 pt-4">
        <p className="text-xs tracking-wide text-neutral-400 uppercase">Scan</p>
        <button
          type="button"
          onClick={() => void props.onRunIncrementalScan()}
          disabled={props.scanRunning}
          className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-neutral-200 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Disc3 size={15} />
          {props.scanRunning ? "Scanning..." : "Incremental Scan"}
        </button>
        <button
          type="button"
          onClick={() => void props.onRunFullScan()}
          disabled={props.scanRunning}
          className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-neutral-200 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <FolderSearch size={15} />
          {props.scanRunning ? "Scanning..." : "Full Scan"}
        </button>
      </div>
    </aside>
  );
}

import { BarChart3, Library, Music2, Settings2, Users } from "lucide-react";

type LeftSidebarProps = {
  location: string;
  onNavigate: (path: string) => void;
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
    <aside className="border-theme-300/7 flex h-full w-56 shrink-0 flex-col border-r px-4 pt-4 pb-36 dark:border-white/3">
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
                  ? "bg-theme-900 text-theme-100 dark:bg-theme-100 dark:text-theme-900"
                  : "text-theme-700 hover:bg-theme-200 dark:text-theme-200 dark:hover:bg-theme-800"
              }`}
            >
              <Icon size={15} />
              {item.label}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { AppShell } from "./app/AppShell";
import { AppProviders } from "./app/providers/AppProviders";

const appMemoryLocation = memoryLocation({ path: "/albums" });

function App() {
  return (
    <Router
      hook={appMemoryLocation.hook}
      searchHook={appMemoryLocation.searchHook}
    >
      <AppProviders>
        <AppShell />
      </AppProviders>
    </Router>
  );
}

export default App;

import { Router } from "wouter";
import { AppShell } from "./app/AppShell";
import { AppProviders } from "./app/providers/AppProviders";
import { appLocation } from "./app/routing/appLocation";

function App() {
  return (
    <Router
      hook={appLocation.hook}
      searchHook={appLocation.searchHook}
    >
      <AppProviders>
        <AppShell />
      </AppProviders>
    </Router>
  );
}

export default App;

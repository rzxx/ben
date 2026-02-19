import { useContext } from "react";
import { AppStartupContext, type AppStartupState } from "../startup/startupContext";

export function useAppStartup(): AppStartupState {
  const startupState = useContext(AppStartupContext);
  if (!startupState) {
    throw new Error("Startup state is missing. Wrap with AppStartupProvider.");
  }

  return startupState;
}

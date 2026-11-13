import { Navigate, Route, Routes } from "react-router-dom";
import { WelcomeModal } from "./components/layout/WelcomeModal";
import { useWelcomeModal } from "./hooks/useWelcomeModal";
import { CustomSchedulePage } from "./pages/custom-schedule/CustomSchedulePage";
import { PlannerPage } from "./pages/planner/PlannerPage";

function App() {
  const { isOpen: isWelcomeOpen, open: openWelcome, dismiss: dismissWelcome } = useWelcomeModal();

  return (
    <>
      <WelcomeModal isOpen={isWelcomeOpen} onDismiss={dismissWelcome} />
      <Routes>
        <Route path="/" element={<Navigate to="/planner/post-2024-4-year" replace />} />
        <Route path="/planner/:pageId" element={<PlannerPage onOpenWelcome={openWelcome} />} />
        <Route path="/custom" element={<CustomSchedulePage onOpenWelcome={openWelcome} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default App;

import { Routes, Route } from "react-router-dom";
import { ProjectsPage } from "@/components/ProjectsPage";
import { SessionPage } from "@/components/SessionPage";
import { LandingPage } from "@/pages/LandingPage";

export function App() {
  return (
    <Routes>
      {/* Marketing landing page */}
      <Route path="/" element={<LandingPage />} />

      {/* App — create and browse maps */}
      <Route path="/app" element={<ProjectsPage />} />

      {/* Session view with chat and 3D viewer */}
      <Route path="/session/:sessionId" element={<SessionPage />} />
    </Routes>
  );
}

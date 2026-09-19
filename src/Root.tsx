import { Navigate, useLocation } from "react-router-dom";
import LandingPage from "./pages/LandingPage";

export default function Root() {
  const { hash } = useLocation();
  return hash === "#try-one" ? <Navigate to="/app" replace /> : <LandingPage />;
}

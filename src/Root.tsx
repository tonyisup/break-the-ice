import { useLocalStorage } from "./hooks/useLocalStorage";
import { Navigate } from "react-router-dom";
import LandingPage from "./pages/LandingPage";

const Root = () => {
  // const [bypassLandingPage] = useLocalStorage<boolean>("bypassLandingPage", false);

  // if (bypassLandingPage) {
    return <Navigate to="/app" replace />;
  // }

  // return <LandingPage />;
};

export default Root;

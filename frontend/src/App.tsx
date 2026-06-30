import {Route, Routes} from "react-router-dom";

import MainLayout from "@/layouts/MainLayout";
import AIChatLayout from "./pages/VoiceAgent";

const App = () => {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route path="/" element={<AIChatLayout />} />
      </Route>
    </Routes>
  );
};

export default App;

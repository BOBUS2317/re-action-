import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Chat from "./pages/Chat";
import Login from "./pages/Login";
import Profile from "./pages/Profile";
import History from "./pages/History";
import Receipts from "./pages/Receipts";
import Meters from "./pages/Meters";
import Company from "./pages/Company";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/login" element={<Login />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/history" element={<History />} />
        <Route path="/receipts" element={<Receipts />} />
        <Route path="/meters" element={<Meters />} />
        <Route path="/company" element={<Company />} />
      </Routes>
    </BrowserRouter>
  );
}

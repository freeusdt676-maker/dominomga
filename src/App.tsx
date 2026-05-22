import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import Lobby from "./pages/Lobby";
import Wallet from "./pages/Wallet";
import Rules from "./pages/Rules";
import AdminChat from "./pages/AdminChat";
import Game from "./pages/Game";
import Admin from "./pages/Admin";
import AdminSecurity from "./pages/AdminSecurity";
import LudoLobby from "./pages/LudoLobby";
import LudoGame from "./pages/LudoGame";
import PetanqueLobby from "./pages/PetanqueLobby";
import PetanqueGame from "./pages/PetanqueGame";
import Discussions from "./pages/Discussions";
import Profile from "./pages/Profile";
import ProfileEdit from "./pages/ProfileEdit";
import { AuthProvider } from "./contexts/AuthContext";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/lobby" element={<Lobby />} />
            <Route path="/wallet" element={<Wallet />} />
            <Route path="/rules" element={<Rules />} />
            <Route path="/admin-chat" element={<AdminChat />} />
            <Route path="/game/:id" element={<Game />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/admin/security" element={<AdminSecurity />} />
            <Route path="/ludo" element={<LudoLobby />} />
            <Route path="/ludo/:id" element={<LudoGame />} />
            <Route path="/petanque" element={<PetanqueLobby />} />
            <Route path="/petanque/:id" element={<PetanqueGame />} />
            <Route path="/discussions" element={<Discussions />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/profile/edit" element={<ProfileEdit />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

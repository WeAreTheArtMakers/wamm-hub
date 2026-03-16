import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/AppLayout";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import ReleasePage from "./pages/ReleasePage.tsx";
import ArtistProfilePage from "./pages/ArtistProfilePage.tsx";
import DiscoverPage from "./pages/DiscoverPage.tsx";
import ReleasesPage from "./pages/ReleasesPage.tsx";
import ArtistsPage from "./pages/ArtistsPage.tsx";
import SearchPage from "./pages/SearchPage.tsx";
import LoginPage from "./pages/LoginPage.tsx";
import RegisterPage from "./pages/RegisterPage.tsx";
import StudioPage from "./pages/StudioPage.tsx";
import AuthSuccessPage from "./pages/AuthSuccessPage.tsx";
import AdminGatePage from "./pages/AdminGatePage.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AppLayout>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/discover" element={<DiscoverPage />} />
            <Route path="/releases" element={<ReleasesPage />} />
            <Route path="/artists" element={<ArtistsPage />} />
            <Route path="/release/:slug" element={<ReleasePage />} />
            <Route path="/artist/:slug" element={<ArtistProfilePage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/auth/success" element={<AuthSuccessPage />} />
            <Route path="/studio" element={<StudioPage />} />
            <Route path="/__wamm-console-9f4ad8" element={<AdminGatePage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AppLayout>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

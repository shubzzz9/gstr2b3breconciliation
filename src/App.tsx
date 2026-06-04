import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Auth from "./pages/Auth";
import Tool from "./pages/Tool";
import Admin from "./pages/Admin";
import NotFound from "./pages/NotFound";
import Article from "./pages/Article";
import { guideReconciliation, guideVsTally, guideFaq, guideTroubleshooting } from "./pages/articles";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Tool />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/tool" element={<Navigate to="/" replace />} />
          <Route path="/guide/gst-reconciliation" element={<Article data={guideReconciliation} />} />
          <Route path="/guide/gstr-2b-vs-tally" element={<Article data={guideVsTally} />} />
          <Route path="/guide/faq" element={<Article data={guideFaq} />} />
          <Route path="/guide/troubleshooting" element={<Article data={guideTroubleshooting} />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

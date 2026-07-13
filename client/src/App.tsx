import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { ThemeProvider, useTheme } from './lib/theme';
import { AppShell } from './components/layout/AppShell';
import { AuthGuard } from './components/layout/AuthGuard';
import LoginPage from './routes/Login';
import TreePage from './routes/Tree';
import PersonDetailPage from './routes/PersonDetail';
import PersonFormPage from './routes/PersonForm';
import TimelinePage from './routes/Timeline';
import BirthdaysPage from './routes/Birthdays';
import CalculatorPage from './routes/Calculator';
import ConnectionPage from './routes/Connection';
import GedcomPage from './routes/Gedcom';
import SettingsPage from './routes/Settings';
import NotFoundPage from './routes/NotFound';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

/** autoUpdate registracija servisnog radnika — bez prompta korisniku. */
function PwaRegistration() {
  useRegisterSW({ immediate: true });
  return null;
}

/** Toaster prati aktivnu temu. */
function ThemedToaster() {
  const { resolved } = useTheme();
  return <Toaster richColors position="top-center" theme={resolved} />;
}

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <PwaRegistration />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              element={
                <AuthGuard>
                  <AppShell />
                </AuthGuard>
              }
            >
              <Route path="/" element={<TreePage />} />
              <Route path="/person/new" element={<PersonFormPage />} />
              <Route path="/person/:id" element={<PersonDetailPage />} />
              <Route path="/person/:id/edit" element={<PersonFormPage />} />
              <Route path="/timeline" element={<TimelinePage />} />
              <Route path="/birthdays" element={<BirthdaysPage />} />
              <Route path="/calculator" element={<CalculatorPage />} />
              <Route path="/connection" element={<ConnectionPage />} />
              <Route path="/gedcom" element={<GedcomPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
        <ThemedToaster />
      </QueryClientProvider>
    </ThemeProvider>
  );
}

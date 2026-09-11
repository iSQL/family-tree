import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Toaster, toast } from 'sonner';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { ApiError } from './api/client';
import { ThemeProvider, useTheme } from './lib/theme';
import { KinshipSystemProvider } from './lib/kinshipSystem';
import { STR } from './lib/strings';
import { BRANCH_KEY } from './hooks/useProposals';
import { AppShell } from './components/layout/AppShell';
import { AuthGuard } from './components/layout/AuthGuard';
import { MainTreeOnly } from './components/layout/MainTreeOnly';
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
import PosterPage from './routes/Poster';
import EnterProposalPage from './routes/EnterProposal';
import BranchChangesPage from './routes/BranchChanges';
import ProposalsPage from './routes/Proposals';
import ProposalReviewPage from './routes/ProposalReview';
import NotFoundPage from './routes/NotFound';

/** Link je istekao ili opozvan usred rada u grani — osveži sesiju, AuthGuard preuzima dalje. */
function handleBranchClosed(err: unknown): void {
  if (err instanceof ApiError && err.body?.error === 'branch_closed') {
    toast.error(STR.branch.closed);
    void queryClient.resetQueries({ queryKey: ['session'] });
  }
}

const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({ onError: handleBranchClosed }),
  mutationCache: new MutationCache({
    onError: handleBranchClosed,
    // U režimu predloga svaka izmena menja granu — osveži broj izmena u traci.
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: BRANCH_KEY }),
  }),
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
      <KinshipSystemProvider>
        <QueryClientProvider client={queryClient}>
          <PwaRegistration />
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/predlog/:token" element={<EnterProposalPage />} />
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
                <Route path="/moje-izmene" element={<BranchChangesPage />} />
                <Route
                  path="/gedcom"
                  element={
                    <MainTreeOnly>
                      <GedcomPage />
                    </MainTreeOnly>
                  }
                />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/settings/poster" element={<PosterPage />} />
                <Route
                  path="/settings/proposals"
                  element={
                    <MainTreeOnly>
                      <ProposalsPage />
                    </MainTreeOnly>
                  }
                />
                <Route
                  path="/settings/proposals/:tokenId"
                  element={
                    <MainTreeOnly>
                      <ProposalReviewPage />
                    </MainTreeOnly>
                  }
                />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Routes>
          </BrowserRouter>
          <ThemedToaster />
        </QueryClientProvider>
      </KinshipSystemProvider>
    </ThemeProvider>
  );
}

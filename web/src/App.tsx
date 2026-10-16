import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { Overview } from './pages/Overview';
import { Links } from './pages/Links';
import { Routes as RoutesPage } from './pages/Routes';
import { Simulator } from './pages/Simulator';
import { Benchmark } from './pages/Benchmark';
import { Settings } from './pages/Settings';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppShell />}>
          <Route index element={<Overview />} />
          <Route path="links" element={<Links />} />
          <Route path="routes" element={<RoutesPage />} />
          <Route path="simulator" element={<Simulator />} />
          <Route path="benchmark" element={<Benchmark />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;

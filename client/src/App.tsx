import { Route, Routes } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import LobbyPage from './pages/LobbyPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/lobby/:lobbyId" element={<LobbyPage />} />
    </Routes>
  );
}

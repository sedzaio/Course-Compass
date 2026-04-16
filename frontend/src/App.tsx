import { BrowserRouter, Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import Settings from "./pages/Settings";
import Courses from "./pages/Courses";
import StudyPlanner from "./pages/StudyPlanner";

function App(): JSX.Element {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"                element={<LandingPage />} />
        <Route path="/login"           element={<Login />} />
        <Route path="/register"        element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password"  element={<ResetPassword />} />
        <Route path="/dashboard"       element={<Dashboard />} />
        <Route path="/courses"         element={<Courses />} />
        <Route path="/settings"        element={<Settings />} />
        <Route path="/planner"         element={<StudyPlanner />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

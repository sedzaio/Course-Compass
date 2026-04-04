import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import Settings from "./pages/Settings";
import Courses from "./pages/Courses";

function App(): JSX.Element {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"                element={<Navigate to="/login" />} />
        <Route path="/login"           element={<Login />} />
        <Route path="/register"        element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password"  element={<ResetPassword />} />
        <Route path="/dashboard"       element={<Dashboard />} />
        <Route path="/courses"         element={<Courses />} />
        <Route path="/settings"        element={<Settings />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
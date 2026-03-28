import { Link, useNavigate } from "react-router-dom";

export default function Dashboard() {
  const navigate = useNavigate();

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  }

  return (
    <div>
      <h1>Dashboard</h1>
      <p>Welcome to Course Compass.</p>

      <div style={{ marginTop: "20px" }}>
        <Link to="/settings">
          <button type="button">Settings</button>
        </Link>
      </div>

      <div style={{ marginTop: "12px" }}>
        <button type="button" onClick={handleLogout}>
          Logout
        </button>
      </div>
    </div>
  );
}
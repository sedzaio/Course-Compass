import { Link } from "react-router-dom";

export default function Settings() {
  return (
    <div>
      <h1>Settings</h1>
      <p>Settings page coming soon.</p>

      <div style={{ marginTop: "20px" }}>
        <Link to="/dashboard">
          <button type="button">Back to Dashboard</button>
        </Link>
      </div>
    </div>
  );
}
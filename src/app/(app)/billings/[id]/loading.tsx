export default function Loading() {
  return (
    <div className="app-page">
      <div className="app-page-header">
        <div>
          <div
            className="app-skeleton"
            style={{ height: "1.75rem", width: "260px" }}
          />
          <div
            className="app-skeleton"
            style={{
              height: "1rem",
              width: "320px",
              marginTop: "0.5rem",
            }}
          />
        </div>
        <div
          className="app-skeleton"
          style={{ height: "2.25rem", width: "100px" }}
        />
      </div>

      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          marginBottom: "1rem",
          flexWrap: "wrap",
        }}
      >
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="app-skeleton"
            style={{ height: "2.25rem", width: "130px" }}
          />
        ))}
      </div>

      <div className="app-section cols-2">
        <div className="app-card">
          <div
            className="app-skeleton"
            style={{ height: "1rem", width: "80px", marginBottom: "0.75rem" }}
          />
          <div
            className="app-skeleton"
            style={{ height: "1.25rem", width: "60%" }}
          />
        </div>
        <div className="app-card">
          <div
            className="app-skeleton"
            style={{ height: "1rem", width: "100px", marginBottom: "0.75rem" }}
          />
          <div
            className="app-skeleton"
            style={{ height: "1.25rem", width: "70%" }}
          />
        </div>
      </div>

      <div className="app-card" style={{ marginTop: "1rem" }}>
        <div
          className="app-skeleton"
          style={{ height: "1rem", width: "100px", marginBottom: "0.75rem" }}
        />
        <div style={{ display: "grid", gap: "0.5rem" }}>
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="app-skeleton"
              style={{ height: "40px" }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

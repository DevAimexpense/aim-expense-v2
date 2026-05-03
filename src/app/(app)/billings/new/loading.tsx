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
              width: "360px",
              marginTop: "0.5rem",
            }}
          />
        </div>
        <div
          className="app-skeleton"
          style={{ height: "2.25rem", width: "100px" }}
        />
      </div>

      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="app-card"
          style={{ marginBottom: "1rem" }}
        >
          <div
            className="app-skeleton"
            style={{ height: "1.125rem", width: "180px", marginBottom: "1rem" }}
          />
          <div
            className="app-skeleton"
            style={{ height: "2.5rem", marginBottom: "0.5rem" }}
          />
          <div
            className="app-skeleton"
            style={{ height: "2.5rem", width: "60%" }}
          />
        </div>
      ))}
    </div>
  );
}

// ===========================================
// Instant skeleton — render ขณะ server component กำลัง resolve
// (Next.js App Router convention)
// ===========================================

export default function Loading() {
  return (
    <div className="app-page">
      <div className="app-page-header">
        <div>
          <div
            className="app-skeleton"
            style={{ height: "1.75rem", width: "200px" }}
          />
          <div
            className="app-skeleton"
            style={{
              height: "1rem",
              width: "300px",
              marginTop: "0.5rem",
            }}
          />
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          flexWrap: "wrap",
          marginBottom: "1rem",
        }}
      >
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="app-skeleton"
            style={{ height: "2.25rem", width: "150px" }}
          />
        ))}
      </div>

      <div className="app-card">
        <div style={{ display: "grid", gap: "0.5rem" }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="app-skeleton"
              style={{ height: "48px" }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

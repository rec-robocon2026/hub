// Shown instantly on every navigation inside the hub while the page's data loads.
export default function Loading() {
  return (
    <main className="page" aria-busy="true" aria-label="Loading">
      <div className="skeleton" style={{ width: 140, height: 12, marginBottom: 10 }} />
      <div className="skeleton" style={{ width: "min(420px, 70%)", height: 40, marginBottom: 14 }} />
      <div className="skeleton" style={{ width: "min(640px, 90%)", height: 14, marginBottom: 36 }} />
      <div className="grid" style={{ ["--min" as string]: "250px" }}>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="blueprint skeleton-card">
            <div className="skeleton" style={{ width: "40%", height: 10, marginBottom: 12 }} />
            <div className="skeleton" style={{ width: "70%", height: 18, marginBottom: 10 }} />
            <div className="skeleton" style={{ width: "90%", height: 10 }} />
          </div>
        ))}
      </div>
    </main>
  );
}

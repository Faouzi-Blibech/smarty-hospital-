const roles = ["doctor", "nurse", "admin", "patient"] as const;

export default function Home() {
  return (
    <main style={{ padding: 24 }}>
      <h1>Ward</h1>
      <p>Scaffold — role views are built in web/src/app/&lt;role&gt;/ (see plans/FAOUZI.md).</p>
      <ul>
        {roles.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
    </main>
  );
}

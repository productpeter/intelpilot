import Link from "next/link";

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <span className="footer-brand">◆ IntelPilot</span>
        <span className="footer-tagline">Intelligence for your pipeline</span>
        <div className="footer-links">
          <Link href="/report">Latest Report</Link>
          <span className="footer-sep" aria-hidden>·</span>
          <Link href="/api">API</Link>
        </div>
      </div>
    </footer>
  );
}

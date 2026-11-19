import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, experienceRange } from '../api.jsx';
import { GroupLogo } from '../components/Logo.jsx';

// One branded template for every role — the Bharat Steel Group brand, clean and print-ready.
const CSS = `
.jd-wrap{--navy:#0a2b66;--blue:#0064a0;--ink:#101519;--mut:#5c6670;--line:#e4e9ee;--soft:#f4f7fa;
  background:var(--soft);min-height:100vh;padding:28px 16px 60px;
  font:16px/1.65 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:var(--ink);-webkit-font-smoothing:antialiased}
.jd-toolbar{max-width:820px;margin:0 auto 16px;display:flex;gap:10px;flex-wrap:wrap}
.jd-toolbar button{font:inherit;cursor:pointer;border-radius:6px;padding:8px 16px;border:1px solid var(--line);background:#fff;color:var(--ink);font-weight:600}
.jd-toolbar button.primary{background:var(--navy);border-color:var(--navy);color:#fff}
.jd-paper{max-width:820px;margin:0 auto;background:#fff;border:1px solid var(--line);border-radius:12px;overflow:hidden;
  box-shadow:0 8px 30px rgba(10,43,102,.07)}
.jd-head{padding:30px 40px 22px;border-bottom:4px solid var(--navy)}
.jd-head .top{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:20px}
.jd-head img,.jd-head .mark{height:38px}
.jd-head .mark{font-weight:800;letter-spacing:.04em;color:var(--navy)}
.jd-head .careers{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--mut);font-weight:600}
.jd-head h1{margin:0;font-size:30px;line-height:1.15;color:var(--navy);font-weight:750}
.jd-head .tagline{margin:8px 0 0;font-size:16px;color:var(--blue);font-weight:600}
.jd-meta{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px}
.jd-meta span{background:var(--soft);border:1px solid var(--line);border-radius:999px;padding:5px 13px;font-size:13px;color:var(--ink);font-weight:500}
.jd-body{padding:26px 40px 34px}
.jd-body .lede{font-size:16px;color:var(--ink);margin:0 0 22px}
.jd-body h2{font-size:15px;letter-spacing:.06em;text-transform:uppercase;color:var(--navy);font-weight:700;
  margin:24px 0 10px;padding-bottom:7px;border-bottom:1px solid var(--line)}
.jd-body ul{margin:0;padding-left:0;list-style:none}
.jd-body li{position:relative;padding:5px 0 5px 22px;color:var(--ink)}
.jd-body li::before{content:"";position:absolute;left:3px;top:13px;width:7px;height:7px;border-radius:2px;background:var(--blue)}
.jd-foot{padding:18px 40px 26px;border-top:1px solid var(--line);color:var(--mut);font-size:13px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px}
.jd-note{max-width:820px;margin:0 auto;background:#fff;border:1px solid var(--line);border-radius:12px;padding:40px;text-align:center;color:var(--mut)}
@media (max-width:560px){.jd-head,.jd-body,.jd-foot{padding-left:22px;padding-right:22px}.jd-head h1{font-size:24px}}
@media print{
  .jd-wrap{background:#fff;padding:0}
  .jd-toolbar{display:none}
  .jd-paper{box-shadow:none;border:0;border-radius:0;max-width:none}
  .jd-head,.jd-body li,.jd-meta span{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  h2{page-break-after:avoid}ul{page-break-inside:avoid}
}`;

const Section = ({ title, items }) =>
  items && items.length ? (
    <>
      <h2>{title}</h2>
      <ul>{items.map((t, i) => <li key={i}>{t}</li>)}</ul>
    </>
  ) : null;

export default function JDView() {
  const { id } = useParams();
  const [job, setJob] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.get(`/public/jobs/${id}/jd`).then(setJob).catch((e) => setError(e.message));
  }, [id]);

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(window.location.href); } catch { /* ignore */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  if (error)
    return (
      <div className="jd-wrap"><style>{CSS}</style>
        <div className="jd-note"><h2 style={{ color: '#0a2b66' }}>Role not available</h2><p>{error}</p></div>
      </div>
    );
  if (!job)
    return <div className="jd-wrap"><style>{CSS}</style><div className="jd-note">Loading…</div></div>;

  const jd = job.jd_doc;
  const meta = [
    job.company_name,
    job.department,
    job.location,
    job.employment_type,
    experienceRange(job.min_experience, job.max_experience),
  ].filter(Boolean);

  return (
    <div className="jd-wrap">
      <style>{CSS}</style>

      <div className="jd-toolbar">
        <button className="primary" onClick={() => window.print()}>Print / Save as PDF</button>
        <button onClick={copyLink}>{copied ? 'Link copied' : 'Copy link'}</button>
      </div>

      <div className="jd-paper">
        <div className="jd-head">
          <div className="top">
            <GroupLogo className="" />
            <div className="careers">Careers</div>
          </div>
          <h1>{job.title}</h1>
          {jd?.tagline && <p className="tagline">{jd.tagline}</p>}
          {!!meta.length && (
            <div className="jd-meta">{meta.map((m, i) => <span key={i}>{m}</span>)}</div>
          )}
        </div>

        {jd ? (
          <div className="jd-body">
            {jd.about_role && <p className="lede">{jd.about_role}</p>}
            <Section title="Key responsibilities" items={jd.responsibilities} />
            <Section title="What we are looking for" items={jd.requirements} />
            <Section title="Preferred" items={jd.preferred} />
            <Section title="Qualifications" items={jd.qualifications} />
            <Section title="What we offer" items={jd.what_we_offer} />
          </div>
        ) : (
          <div className="jd-body">
            <p className="lede">A detailed description has not been written for this role yet.</p>
            <p className="sub">Open this role in the ATS and use “Generate JD with AI” to create one.</p>
          </div>
        )}

        <div className="jd-foot">
          <span>The Bharat Steel Group</span>
          <span>Apply at ats.thebharatsteelgroup.com/careers</span>
        </div>
      </div>
    </div>
  );
}

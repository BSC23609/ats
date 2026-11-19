import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, experienceRange } from '../api.jsx';
import { GroupLogo, CompanyLogo } from '../components/Logo.jsx';

// One branded template for every role — co-branded (company + The Bharat Steel Group), print-ready.
const CSS = `
.jd-wrap{--navy:#0a2b66;--navy2:#0d3a86;--blue:#1f6fd0;--ink:#121922;--mut:#5c6670;--line:#e6ebf1;--soft:#f5f8fc;
  background:#eef2f7;min-height:100vh;padding:30px 16px 64px;
  font:16px/1.65 "Inter",-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:var(--ink);-webkit-font-smoothing:antialiased}
.jd-toolbar{max-width:860px;margin:0 auto 16px;display:flex;gap:10px;flex-wrap:wrap}
.jd-toolbar button{font:inherit;cursor:pointer;border-radius:8px;padding:9px 17px;border:1px solid var(--line);background:#fff;color:var(--ink);font-weight:600}
.jd-toolbar button.primary{background:var(--navy);border-color:var(--navy);color:#fff}
.jd-toolbar button:hover{box-shadow:0 2px 10px rgba(10,43,102,.12)}

.jd-paper{max-width:860px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 18px 50px rgba(10,43,102,.12)}

.jd-hero{position:relative;background:linear-gradient(135deg,#0a2b66 0%,#0d3a86 55%,#145bbf 100%);color:#fff;padding:34px 44px 30px}
.jd-hero::after{content:"";position:absolute;right:-60px;top:-60px;width:260px;height:260px;border-radius:50%;
  background:radial-gradient(circle at center,rgba(255,255,255,.14),transparent 70%)}
.jd-hero-top{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:22px;position:relative;z-index:1}
.jd-plate{background:#fff;border-radius:10px;padding:9px 14px;display:inline-flex;align-items:center;box-shadow:0 4px 14px rgba(0,0,0,.14)}
.jd-plate img{height:30px;display:block}
.jd-plate .name{color:var(--navy);font-weight:800;font-size:15px}
.jd-eyebrow{text-align:right;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,.8);font-weight:600;line-height:1.5}
.jd-hero h1{margin:0;font-size:33px;line-height:1.12;font-weight:780;position:relative;z-index:1}
.jd-hero .tagline{margin:10px 0 0;font-size:16px;color:#cfe0f7;font-weight:500;position:relative;z-index:1}
.jd-pills{display:flex;flex-wrap:wrap;gap:8px;margin-top:20px;position:relative;z-index:1}
.jd-pills span{background:rgba(255,255,255,.13);border:1px solid rgba(255,255,255,.26);border-radius:999px;padding:6px 14px;font-size:13px;color:#fff;font-weight:500}

.jd-grid{display:grid;grid-template-columns:1fr 244px;gap:36px;padding:30px 44px 20px}
.jd-content .lede{font-size:16.5px;color:var(--ink);margin:0 0 6px}
.jd-content h2{font-size:13px;letter-spacing:.09em;text-transform:uppercase;color:var(--navy);font-weight:750;
  margin:26px 0 12px;display:flex;align-items:center;gap:10px}
.jd-content h2::before{content:"";width:16px;height:16px;border-radius:5px;flex:none;
  background:linear-gradient(135deg,var(--navy),var(--blue))}
.jd-content ul{margin:0;padding:0;list-style:none}
.jd-content li{position:relative;padding:6px 0 6px 24px;color:#283240}
.jd-content li::before{content:"";position:absolute;left:4px;top:14px;width:8px;height:8px;border-radius:2px;
  background:var(--blue);transform:rotate(45deg)}

.jd-aside{align-self:start}
.jd-card{background:var(--soft);border:1px solid var(--line);border-radius:12px;padding:18px 18px 6px}
.jd-card .h{font-size:12px;letter-spacing:.09em;text-transform:uppercase;color:var(--mut);font-weight:700;margin-bottom:10px}
.jd-card .row{padding:9px 0;border-top:1px solid var(--line)}
.jd-card .row:first-of-type{border-top:0}
.jd-card .lbl{font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:var(--mut);font-weight:600}
.jd-card .val{font-size:14.5px;color:var(--ink);font-weight:600;margin-top:2px}
.jd-apply{display:block;margin-top:14px;text-align:center;background:var(--navy);color:#fff;text-decoration:none;
  border-radius:9px;padding:13px 16px;font-weight:700;font-size:15px}
.jd-apply:hover{background:#0d3a86}

.jd-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;
  padding:20px 44px 26px;margin-top:6px;border-top:1px solid var(--line);color:var(--mut);font-size:12.5px}
.jd-foot img,.jd-foot .mark{height:22px}
.jd-foot .mark{font-weight:800;color:var(--navy);font-size:13px}
.jd-foot .contact{text-align:right;line-height:1.6}

.jd-note{max-width:860px;margin:0 auto;background:#fff;border-radius:16px;padding:48px;text-align:center;color:var(--mut)}

@media (max-width:720px){
  .jd-hero,.jd-grid,.jd-foot{padding-left:22px;padding-right:22px}
  .jd-hero h1{font-size:26px}
  .jd-grid{grid-template-columns:1fr;gap:24px;padding-top:26px}
}
@media print{
  .jd-wrap{background:#fff;padding:0}
  .jd-toolbar,.jd-apply{display:none}
  .jd-paper{box-shadow:none;border-radius:0;max-width:none}
  .jd-hero,.jd-pills span,.jd-content h2::before,.jd-content li::before,.jd-card{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .jd-content h2,.jd-card{page-break-inside:avoid}
  .jd-content ul{page-break-inside:avoid}
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
  const pills = [job.company_name, job.employment_type, job.location,
    experienceRange(job.min_experience, job.max_experience)].filter(Boolean);
  const glance = [
    ['Company', job.company_name],
    ['Department', job.department],
    ['Location', job.location],
    ['Employment type', job.employment_type],
    ['Experience', experienceRange(job.min_experience, job.max_experience)],
  ].filter(([, v]) => v);

  return (
    <div className="jd-wrap">
      <style>{CSS}</style>

      <div className="jd-toolbar">
        <button className="primary" onClick={() => window.print()}>Print / Save as PDF</button>
        <button onClick={copyLink}>{copied ? 'Link copied' : 'Copy link'}</button>
      </div>

      <div className="jd-paper">
        <div className="jd-hero">
          <div className="jd-hero-top">
            <span className="jd-plate">
              <CompanyLogo code={job.company_code} name={job.company_name} className="" />
            </span>
            <div className="jd-eyebrow">The Bharat Steel Group<br />Careers</div>
          </div>
          <h1>{job.title}</h1>
          {jd?.tagline && <p className="tagline">{jd.tagline}</p>}
          {!!pills.length && <div className="jd-pills">{pills.map((m, i) => <span key={i}>{m}</span>)}</div>}
        </div>

        {jd ? (
          <div className="jd-grid">
            <div className="jd-content">
              {jd.about_role && <p className="lede">{jd.about_role}</p>}
              <Section title="Key responsibilities" items={jd.responsibilities} />
              <Section title="What we are looking for" items={jd.requirements} />
              <Section title="Preferred" items={jd.preferred} />
              <Section title="Qualifications" items={jd.qualifications} />
              <Section title="What we offer" items={jd.what_we_offer} />
            </div>

            <aside className="jd-aside">
              <div className="jd-card">
                <div className="h">At a glance</div>
                {glance.map(([l, v]) => (
                  <div className="row" key={l}>
                    <div className="lbl">{l}</div>
                    <div className="val">{v}</div>
                  </div>
                ))}
              </div>
              <a className="jd-apply" href={`/careers?job=${job.id}`} target="_blank" rel="noopener noreferrer">
                Apply for this role →
              </a>
            </aside>
          </div>
        ) : (
          <div className="jd-grid">
            <div className="jd-content">
              <p className="lede">A detailed description has not been written for this role yet.</p>
              <p style={{ color: '#5c6670' }}>Open this role in the ATS and use “Generate JD with AI” to create one.</p>
            </div>
          </div>
        )}

        <div className="jd-foot">
          <GroupLogo className="" />
          <div className="contact">
            Apply: ats.thebharatsteelgroup.com/careers<br />
            WhatsApp: wa.me/919500680093
          </div>
        </div>
      </div>
    </div>
  );
}

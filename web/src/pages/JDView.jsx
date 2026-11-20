import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, experienceRange } from '../api.jsx';
import { GroupLogo, CompanyLogo } from '../components/Logo.jsx';

// One branded template for every role — co-branded, compact, balanced two-column, print-ready.
const CSS = `
.jd-wrap{--navy:#0a2b66;--navy2:#0d3a86;--blue:#1f6fd0;--ink:#1a222e;--mut:#64707e;--line:#e6ebf1;--soft:#f5f8fc;
  background:#eef2f7;min-height:100vh;padding:28px 16px 56px;
  font:15px/1.5 "Inter",-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:var(--ink);-webkit-font-smoothing:antialiased}
.jd-toolbar{max-width:880px;margin:0 auto 14px;display:flex;gap:10px;flex-wrap:wrap}
.jd-toolbar button{font:inherit;cursor:pointer;border-radius:8px;padding:9px 17px;border:1px solid var(--line);background:#fff;color:var(--ink);font-weight:600}
.jd-toolbar button.primary{background:var(--navy);border-color:var(--navy);color:#fff}
.jd-toolbar button:hover{box-shadow:0 2px 10px rgba(10,43,102,.12)}

.jd-paper{max-width:880px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 18px 50px rgba(10,43,102,.12)}

.jd-hero{position:relative;background:linear-gradient(130deg,#0a2b66 0%,#0d3a86 52%,#1559ba 100%);color:#fff;padding:28px 40px 26px;overflow:hidden}
.jd-hero::after{content:"";position:absolute;right:-70px;top:-70px;width:260px;height:260px;border-radius:50%;
  background:radial-gradient(circle at center,rgba(255,255,255,.13),transparent 70%)}
.jd-hero-top{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:18px;position:relative;z-index:1}
.jd-plate{background:#fff;border-radius:9px;padding:8px 13px;display:inline-flex;align-items:center;box-shadow:0 4px 14px rgba(0,0,0,.16)}
.jd-plate img{height:28px;display:block}
.jd-plate .name{color:var(--navy);font-weight:800;font-size:14px}
.jd-eyebrow{text-align:right;font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,.82);font-weight:600;line-height:1.5}
.jd-hero h1{margin:0;font-size:30px;line-height:1.12;font-weight:780;position:relative;z-index:1}
.jd-hero .tagline{margin:9px 0 0;font-size:15.5px;color:#cfe0f7;font-weight:500;position:relative;z-index:1;max-width:620px}
.jd-pills{display:flex;flex-wrap:wrap;gap:7px;margin-top:18px;position:relative;z-index:1}
.jd-pills span{background:rgba(255,255,255,.13);border:1px solid rgba(255,255,255,.26);border-radius:999px;padding:5px 13px;font-size:12.5px;color:#fff;font-weight:500}

.jd-body{padding:26px 40px 16px}
.jd-lede{font-size:15.5px;color:#2b3542;margin:0 0 20px;padding-bottom:18px;border-bottom:1px solid var(--line)}
.jd-rich{font-size:14.5px;color:#2b3542;line-height:1.6}
.jd-rich p{margin:0 0 12px}
.jd-rich strong{color:#0a2b66}
.jd-rich ul,.jd-rich ol{margin:6px 0 16px;padding-left:20px}
.jd-rich li{margin:4px 0}
.jd-rich h1,.jd-rich h2,.jd-rich h3,.jd-rich h4{color:#0a2b66;margin:16px 0 8px;font-size:15px}
.jd-cols{column-count:2;column-gap:40px}
.jd-sec{break-inside:avoid;-webkit-column-break-inside:avoid;page-break-inside:avoid;margin:0 0 18px;display:inline-block;width:100%}
.jd-sec h2{font-size:12px;letter-spacing:.09em;text-transform:uppercase;color:var(--navy);font-weight:750;
  margin:0 0 9px;display:flex;align-items:center;gap:9px}
.jd-sec h2::before{content:"";width:14px;height:14px;border-radius:4px;flex:none;background:linear-gradient(135deg,var(--navy),var(--blue))}
.jd-sec ul{margin:0;padding:0;list-style:none}
.jd-sec li{position:relative;padding:3.5px 0 3.5px 20px;color:#333d4a;font-size:14px;line-height:1.45}
.jd-sec li::before{content:"";position:absolute;left:3px;top:11px;width:7px;height:7px;border-radius:2px;background:var(--blue);transform:rotate(45deg)}

.jd-cta{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;
  padding:16px 40px;background:var(--soft);border-top:1px solid var(--line)}
.jd-cta .t{font-weight:600;color:var(--navy);font-size:14.5px}
.jd-cta a{background:var(--navy);color:#fff;text-decoration:none;border-radius:9px;padding:11px 22px;font-weight:700;font-size:14.5px}
.jd-cta a:hover{background:#0d3a86}

.jd-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;
  padding:16px 40px 22px;color:var(--mut);font-size:12px;border-top:1px solid var(--line)}
.jd-foot img,.jd-foot .mark{height:20px}
.jd-foot .mark{font-weight:800;color:var(--navy);font-size:12px}
.jd-foot .contact{text-align:right;line-height:1.6}

.jd-note{max-width:880px;margin:0 auto;background:#fff;border-radius:16px;padding:48px;text-align:center;color:var(--mut)}

@media (max-width:720px){
  .jd-hero,.jd-body,.jd-cta,.jd-foot{padding-left:22px;padding-right:22px}
  .jd-hero h1{font-size:25px}
  .jd-cols{column-count:1}
}
@media print{
  @page{margin:12mm}
  .jd-wrap{background:#fff;padding:0;font-size:13px}
  .jd-toolbar,.jd-cta{display:none}
  .jd-paper{box-shadow:none;border-radius:0;max-width:none}
  .jd-hero{padding:22px 28px}
  .jd-body{padding:20px 28px 8px}
  .jd-foot{padding:12px 28px}
  .jd-hero,.jd-pills span,.jd-sec h2::before,.jd-sec li::before{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .jd-sec{page-break-inside:avoid}
}`;

const Section = ({ title, items }) =>
  items && items.length ? (
    <div className="jd-sec">
      <h2>{title}</h2>
      <ul>{items.map((t, i) => <li key={i}>{t}</li>)}</ul>
    </div>
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

  // Download the branded JD as a self-contained HTML file (images made absolute so it opens offline).
  const downloadJD = () => {
    const paper = document.querySelector('.jd-paper');
    if (!paper) return;
    const inner = paper.outerHTML.replace(/src="\//g, `src="${window.location.origin}/`);
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">`
      + `<meta name="viewport" content="width=device-width,initial-scale=1">`
      + `<title>${(job?.title || 'Job Description')} — Job Description</title><style>${CSS}</style></head>`
      + `<body class="jd-wrap">${inner}</body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(job?.title || 'role').replace(/[^\w]+/g, '-')}-JD.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
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
  const pills = [job.company_name, job.department, job.location, job.employment_type,
    experienceRange(job.min_experience, job.max_experience)].filter(Boolean);

  return (
    <div className="jd-wrap">
      <style>{CSS}</style>

      <div className="jd-toolbar">
        <button className="primary" onClick={() => window.print()}>Print / Save as PDF</button>
        <button onClick={copyLink}>{copied ? 'Link copied' : 'Copy link'}</button>
        <button onClick={downloadJD}>Download</button>
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
          <>
            <div className="jd-body">
              {jd.about_role && <p className="jd-lede">{jd.about_role}</p>}
              <div className="jd-cols">
                <Section title="Key responsibilities" items={jd.responsibilities} />
                <Section title="What we are looking for" items={jd.requirements} />
                <Section title="Preferred" items={jd.preferred} />
                <Section title="Qualifications" items={jd.qualifications} />
                <Section title="What we offer" items={jd.what_we_offer} />
              </div>
            </div>

            <div className="jd-cta">
              <span className="t">Interested? Apply in a few minutes.</span>
              <a href={`/careers?job=${job.id}`} target="_blank" rel="noopener noreferrer">Apply for this role →</a>
            </div>
          </>
        ) : job.description ? (
          <>
            {/* No AI-structured JD yet — show the role's own careers description. */}
            <div className="jd-body">
              <div className="jd-rich" dangerouslySetInnerHTML={{ __html: job.description }} />
            </div>
            <div className="jd-cta">
              <span className="t">Interested? Apply in a few minutes.</span>
              <a href={`/careers?job=${job.id}`} target="_blank" rel="noopener noreferrer">Apply for this role →</a>
            </div>
          </>
        ) : (
          <div className="jd-body">
            <p className="jd-lede">A detailed description has not been written for this role yet.</p>
            <p style={{ color: '#64707e' }}>Open this role in the ATS and use “Generate JD with AI” to create one.</p>
          </div>
        )}

        <div className="jd-foot">
          <GroupLogo className="" />
        </div>
      </div>
    </div>
  );
}

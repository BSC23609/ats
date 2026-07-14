import { useState } from 'react';

/**
 * A brand mark, looked up by company code from /brand/<CODE>.png.
 * If the file isn't there, we fall back to the name in text — a missing logo
 * should never leave a hole in the page.
 */
export function CompanyLogo({ code, name, className = 'co-logo' }) {
  const [failed, setFailed] = useState(false);
  if (failed || !code) return <span className="name">{name || code}</span>;
  return (
    <img src={`/brand/${code}.png`} alt={name || code} className={className}
         onError={() => setFailed(true)} />
  );
}

export function GroupLogo({ className = 'public-logo', plate = false }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <div className="mark">THE BHARAT STEEL GROUP</div>;

  const img = (
    <img src="/brand/group.png" alt="The Bharat Steel Group" className={className}
         onError={() => setFailed(true)} />
  );
  // On the dark rail the mark sits on a white plate, so its texture and blue survive.
  return plate ? <span className="rail-logo-plate">{img}</span> : img;
}

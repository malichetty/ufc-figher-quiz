import { useEffect, useMemo, useState } from 'react';
import roster from './data/roster.json';
import { QUESTIONS } from './lib/questions.js';
import { AXES, TYPES } from './lib/types.js';
import { findMatch, rank, scoreFighter, userAxes, whyYouMatch } from './lib/match.js';
import { NAME_MAX, parseShareLocation, sanitizeName, sharePath, shareUrl } from './lib/share.js';
import { saveResultImage } from './lib/card-image.js';

const bySlug = new Map(roster.fighters.map((f) => [f.slug, f]));
const API_DOCS = 'https://ufcapi.aristotle.me/docs';

const store = {
  get(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* private mode: the app works without it */
    }
  },
};

const track = (event, params) => {
  if (typeof window.gtag === 'function') window.gtag('event', event, params);
};

const lastName = (name) => name.split(' ').slice(-1)[0];
const possessive = (word) => (word === 'Their' ? word : `${word}'s`);
const typePlural = (code) => TYPES[code].name.replace(/^The /, '') + 's';

// Everything the result screen shows, rebuilt from a share URL or a finished quiz.
function buildResult({ slug, name, answers, division }) {
  const fighter = bySlug.get(slug);
  if (!fighter) return null;
  const base = { fighter, type: fighter.type, name, answers, division };
  if (!answers) return base;
  const fresh = findMatch(roster, answers, division);
  if (fresh && fresh.fighter.slug === slug) return { ...base, ...fresh, type: fighter.type };
  // The roster moved on since the link was made: keep the linked fighter and
  // score them against the saved answers.
  const axes = userAxes(answers);
  const { ranked } = rank(roster, answers, division);
  return {
    ...base,
    axes,
    matchPct: scoreFighter(axes, fighter.type, fighter).matchPct,
    runnersUp: ranked
      .filter((r) => r.fighter.slug !== slug)
      .slice(0, 2)
      .map((r) => ({ fighter: r.fighter, matchPct: r.matchPct })),
  };
}

function initialState() {
  const share = parseShareLocation(window.location.pathname, window.location.search);
  if (!share) return { stage: 'intro' };
  const result = buildResult(share);
  if (!result) {
    window.history.replaceState({}, '', '/');
    return { stage: 'intro', notice: 'That fighter is no longer in the active roster. Find your own match below.' };
  }
  if (share.legacy) window.history.replaceState({}, '', sharePath(share));
  const own = store.get('ufcq:last') === sharePath({ ...share, name: '' });
  return { stage: 'result', result, own };
}

export default function App() {
  const [init] = useState(initialState);
  const [stage, setStage] = useState(init.stage);
  const [notice, setNotice] = useState(init.notice || '');
  const [result, setResult] = useState(init.result || null);
  const [own, setOwn] = useState(!!init.own);
  const [challenger, setChallenger] = useState(null);
  const [name, setName] = useState(() => sanitizeName(store.get('ufcq:name')));
  const [division, setDivision] = useState(() => store.get('ufcq:division') || 'all');
  const [answers, setAnswers] = useState([]);

  useEffect(() => {
    if (init.stage === 'result' && !init.own) track('shared_view', { fighter: init.result.fighter.slug });
  }, [init]);

  useEffect(() => {
    const onPop = () => {
      const s = initialState();
      setStage(s.stage);
      setResult(s.result || null);
      setOwn(!!s.own);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [stage]);

  useEffect(() => {
    if (stage === 'result' && result) {
      const who = own ? (result.name ? `${result.name} fights` : 'I fight') : `${result.name || 'Your friend'} fights`;
      document.title = `${who} like ${result.fighter.name} | Which UFC Fighter Are You?`;
    } else {
      document.title = 'Which UFC Fighter Are You?';
    }
  }, [stage, result, own]);

  const start = () => {
    const clean = sanitizeName(name);
    setName(clean);
    store.set('ufcq:name', clean);
    store.set('ufcq:division', division);
    setAnswers([]);
    setNotice('');
    setStage('quiz');
    track('quiz_start', { division });
  };

  const answer = (choice) => {
    const next = [...answers, choice];
    setAnswers(next);
    if (next.length < QUESTIONS.length) return;
    const match = findMatch(roster, next, division);
    const r = { ...match, name: sanitizeName(name), answers: next, division };
    const path = sharePath({ slug: match.fighter.slug, name: r.name, answers: next, division });
    store.set('ufcq:last', sharePath({ slug: match.fighter.slug, answers: next, division }));
    setResult(r);
    setOwn(true);
    setStage('reveal');
    track('quiz_complete', { type: match.type, fighter: match.fighter.slug, division });
    window.setTimeout(() => {
      window.history.pushState({}, '', path);
      setStage('result');
    }, 1400);
  };

  const back = () => {
    if (answers.length === 0) setStage('intro');
    else setAnswers(answers.slice(0, -1));
  };

  const takeChallenge = () => {
    if (result && !own) setChallenger(result);
    window.history.pushState({}, '', '/');
    setResult(null);
    setStage('intro');
  };

  const retake = () => {
    window.history.pushState({}, '', '/');
    setResult(null);
    setChallenger(null);
    setStage('intro');
  };

  return (
    <div className="app">
      <div className="bg" aria-hidden="true" />
      <main className="content">
        {stage === 'intro' && (
          <Intro
            name={name}
            setName={setName}
            division={division}
            setDivision={setDivision}
            onStart={start}
            notice={notice}
            challenger={challenger}
          />
        )}
        {stage === 'quiz' && (
          <Quiz index={answers.length} name={sanitizeName(name)} onAnswer={answer} onBack={back} />
        )}
        {stage === 'reveal' && <Reveal />}
        {stage === 'result' && result && (
          <Result
            result={result}
            own={own}
            challenger={challenger}
            onRetake={retake}
            onChallenge={takeChallenge}
          />
        )}
      </main>
      <footer className="site-footer">
        Fighter data from the <a href={API_DOCS}>UFC Stats API</a>, active roster as of {formatDate(roster.snapshot)}.
        Not affiliated with the UFC.
      </footer>
    </div>
  );
}

function formatDate(iso) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function Intro({ name, setName, division, setDivision, onStart, notice, challenger }) {
  return (
    <section className="intro fade-in">
      {notice && <p className="notice">{notice}</p>}
      {challenger && (
        <p className="challenge-banner">
          {challenger.name || 'Your friend'} got <strong>{challenger.fighter.name}</strong>. Your turn.
        </p>
      )}
      <p className="eyebrow">Six questions. No sign-up.</p>
      <h1 className="title">
        Which UFC fighter <span>are you?</span>
      </h1>
      <p className="lede">
        We match your fighting style against {roster.fighters.length} active UFC fighters, champions included,
        using their real fight stats.
      </p>
      <form
        className="start-form"
        onSubmit={(e) => {
          e.preventDefault();
          onStart();
        }}
      >
        <label className="field">
          <span>Your name (optional)</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, NAME_MAX + 5))}
            maxLength={NAME_MAX + 5}
            placeholder="So friends know it's you"
            autoComplete="given-name"
            enterKeyHint="go"
          />
        </label>
        <fieldset className="segmented">
          <legend>Match me with</legend>
          {[
            ['all', 'Anyone'],
            ['men', "Men's divisions"],
            ['women', "Women's divisions"],
          ].map(([value, label]) => (
            <label key={value} className={division === value ? 'on' : ''}>
              <input
                type="radio"
                name="division"
                value={value}
                checked={division === value}
                onChange={() => setDivision(value)}
              />
              {label}
            </label>
          ))}
        </fieldset>
        <button type="submit" className="btn btn-primary btn-big">
          Find my fighter
        </button>
      </form>
    </section>
  );
}

function Quiz({ index, name, onAnswer, onBack }) {
  const q = QUESTIONS[index];
  return (
    <section className="quiz fade-in" key={q.id}>
      <div className="progress" aria-hidden="true">
        {QUESTIONS.map((x, i) => (
          <span key={x.id} className={i <= index ? 'done' : ''} />
        ))}
      </div>
      <p className="eyebrow">
        Question {index + 1} of {QUESTIONS.length}
        {name && index === 0 ? `. Let's go, ${name}.` : ''}
      </p>
      <h2 className="question">{q.question}</h2>
      <div className="options">
        {q.options.map((o, i) => (
          <button key={o.text} className="option" onClick={() => onAnswer(i)}>
            <span className="letter">{String.fromCharCode(65 + i)}</span>
            {o.text}
          </button>
        ))}
      </div>
      <button className="link-btn" onClick={onBack}>
        ← Back
      </button>
    </section>
  );
}

function Reveal() {
  return (
    <section className="reveal fade-in" role="status">
      <div className="spinner" />
      <p>Scoring you against {roster.fighters.length} fighters…</p>
    </section>
  );
}

function AxisBars({ you, them, themLabel, youLabel = 'You' }) {
  return (
    <div className="axes">
      {AXES.map((a) => (
        <div className="axis" key={a.key}>
          <div className="axis-labels">
            <span>{a.minus}</span>
            <span>{a.plus}</span>
          </div>
          <div className="axis-track">
            {them && (
              <span
                className="dot them"
                style={{ left: `${((them[a.key] + 1) / 2) * 100}%` }}
                title={themLabel}
              />
            )}
            {you && <span className="dot you" style={{ left: `${((you[a.key] + 1) / 2) * 100}%` }} title={youLabel} />}
          </div>
        </div>
      ))}
      <div className="axis-legend">
        {you && (
          <span>
            <i className="dot you" /> {youLabel}
          </span>
        )}
        {them && (
          <span>
            <i className="dot them" /> {themLabel}
          </span>
        )}
      </div>
    </div>
  );
}

function Result({ result, own, challenger, onRetake, onChallenge }) {
  const { fighter, type, name, axes, matchPct, runnersUp, answers, division } = result;
  const t = TYPES[type];
  const share = useMemo(
    () => (own ? shareUrl({ slug: fighter.slug, name, answers, division }) : null),
    [own, fighter.slug, name, answers, division],
  );
  const reasons = axes ? whyYouMatch(fighter, axes) : null;
  const rarity = Math.round((roster.typeShare[type] || 0) * 100);
  const heading = own
    ? name
      ? `${name}, you fight like`
      : 'You fight like'
    : `${name || 'Your friend'} fights like`;

  return (
    <section className="result fade-in">
      <article className="card">
        <div className="card-bar" />
        <p className="card-kicker">{heading}</p>
        {fighter.nickname && <p className="nickname">“{fighter.nickname}”</p>}
        <h1 className="fighter-name">{fighter.name}</h1>
        <p className="fighter-meta">
          {fighter.division} · {fighter.record}
          {fighter.champion && <span className="champ">Champion</span>}
        </p>
        <div className="type-row">
          <span className="type-badge">{t.name}</span>
          {matchPct != null && <span className="match-pct">{matchPct}% match</span>}
        </div>
        <p className="type-desc">{t.description}</p>
        <p className="rarity">
          Only {rarity}% of active UFC fighters are {typePlural(type)}.
        </p>

        <div className="stats">
          <Stat label="Strikes / min" value={fighter.slpm.toFixed(2)} />
          <Stat label="Strike accuracy" value={`${Math.round(fighter.strAcc * 100)}%`} />
          <Stat label="Takedowns / 15" value={fighter.tdAvg.toFixed(2)} />
          <Stat label="UFC finishes" value={fighter.koWins + fighter.subWins} />
        </div>

        {reasons && (
          <div className="why">
            <h3>Why {lastName(fighter.name)}</h3>
            <ul>
              {reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="style-block">
          <h3>{axes ? (own ? 'Your style' : `${possessive(name || 'Their')} style`) : `${possessive(lastName(fighter.name))} style`}</h3>
          <AxisBars
            you={axes}
            youLabel={own ? 'You' : name || 'Them'}
            them={fighter.axes}
            themLabel={lastName(fighter.name)}
          />
        </div>

        {challenger && own && challenger.axes && axes && (
          <div className="versus">
            <h3>You vs {challenger.name || 'your friend'}</h3>
            <div className="versus-row">
              <div>
                <span className="vs-label">You</span>
                <strong>{fighter.name}</strong>
                <span>{t.name}</span>
              </div>
              <span className="vs">VS</span>
              <div>
                <span className="vs-label">{challenger.name || 'Friend'}</span>
                <strong>{challenger.fighter.name}</strong>
                <span>{TYPES[challenger.type].name}</span>
              </div>
            </div>
            <AxisBars you={axes} them={challenger.axes} themLabel={challenger.name || 'Friend'} />
            <p className="vs-verdict">{verdict(axes, challenger.axes, challenger.name)}</p>
          </div>
        )}

        {runnersUp?.length > 0 && (
          <div className="runners">
            <h3>{own ? 'You also fight like' : 'Also close'}</h3>
            {runnersUp.map((r) => (
              <div className="runner" key={r.fighter.slug}>
                <div>
                  <strong>{r.fighter.name}</strong>
                  <span>
                    {TYPES[r.fighter.type].name} · {r.fighter.division}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </article>

      <aside className="actions">
        {own ? (
          <ShareActions result={result} url={share} />
        ) : (
          <>
            <p className="cta-text">
              Think you fight like {lastName(fighter.name)} too? Or are you a different beast?
            </p>
            <button className="btn btn-primary btn-big" onClick={onChallenge}>
              Find my fighter
            </button>
            <p className="small">Six questions, about a minute.</p>
          </>
        )}
        {own && (
          <button className="link-btn" onClick={onRetake}>
            ↺ Take it again
          </button>
        )}
      </aside>
    </section>
  );
}

const ROLE = {
  Striker: 'striker',
  Grappler: 'grappler',
  Pressure: 'pressure fighter',
  Counter: 'counter fighter',
  Finisher: 'finisher',
  Decision: 'points fighter',
};

function verdict(a, b, otherName) {
  const who = otherName || 'your friend';
  const diffs = AXES.map((x) => ({ x, d: a[x.key] - b[x.key] })).sort((p, q) => Math.abs(q.d) - Math.abs(p.d));
  const top = diffs[0];
  if (Math.abs(top.d) < 0.35) return `You and ${who} fight almost the same way. That's a five-round war.`;
  const you = ROLE[top.d > 0 ? top.x.plus : top.x.minus];
  const them = ROLE[top.d > 0 ? top.x.minus : top.x.plus];
  return `Biggest difference: you're the ${you}, ${who} is the ${them}.`;
}

function Stat({ label, value }) {
  return (
    <div className="stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function ShareActions({ result, url }) {
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const { fighter, name } = result;
  const text = `${name ? `${name} fights` : 'I fight'} like ${fighter.name}. Which UFC fighter are you?`;
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const nativeShare = async () => {
    try {
      await navigator.share({ title: 'Which UFC Fighter Are You?', text, url });
      track('share', { method: 'native', fighter: fighter.slug });
    } catch {
      /* dismissed */
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt('Copy your link:', url);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
    track('share', { method: 'copy', fighter: fighter.slug });
  };
  const postX = () => {
    const x = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
    window.open(x, '_blank', 'noopener,width=600,height=500');
    track('share', { method: 'x', fighter: fighter.slug });
  };
  const save = async () => {
    setSaving(true);
    try {
      const how = await saveResultImage(result, TYPES[result.type]);
      track('share', { method: `image_${how}`, fighter: fighter.slug });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {canNativeShare && (
        <button className="btn btn-primary" onClick={nativeShare}>
          Share my result
        </button>
      )}
      <button className={canNativeShare ? 'btn btn-outline' : 'btn btn-primary'} onClick={copy}>
        {copied ? 'Link copied' : 'Copy my link'}
      </button>
      <button className="btn btn-outline" onClick={postX}>
        Post on X
      </button>
      <button className="btn btn-outline" onClick={save} disabled={saving}>
        {saving ? 'Drawing…' : 'Save image'}
      </button>
      <p className="small share-url">{url.replace('https://', '')}</p>
    </>
  );
}

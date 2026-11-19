import { useEffect, useMemo, useRef, useState } from 'react';
import roster from './data/roster.json';
import { QUESTIONS } from './lib/questions.js';
import { TYPES } from './lib/types.js';
import { verdict } from './lib/versus.js';
import { findMatch, scoreFighter, userAxes } from './lib/match.js';
import { parseShareLocation, sharePath, shareUrl } from './lib/share.js';
import { saveResultImage } from './lib/card-image.js';
import { fetchTally, prepareBotCheck, recordTally } from './lib/tally.js';
import { statusOf } from './lib/status.js';

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

// Everything the result screen shows, rebuilt from a share URL or a finished quiz.
function buildResult({ slug, answers }) {
  const fighter = bySlug.get(slug);
  if (!fighter) return null;
  const base = { fighter, type: fighter.type, answers };
  if (!answers) return base;
  const fresh = findMatch(roster, answers);
  if (fresh && fresh.fighter.slug === slug) return { ...base, ...fresh, type: fighter.type };
  // The roster moved on since the link was made: keep the linked fighter and
  // score them against the saved answers.
  const axes = userAxes(answers);
  return { ...base, axes, matchPct: scoreFighter(axes, fighter.type, fighter).matchPct };
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
  const own = store.get('ufcq:last') === sharePath(share);
  return { stage: 'result', result, own };
}

export default function App() {
  const [init] = useState(initialState);
  const [stage, setStage] = useState(init.stage);
  const [notice, setNotice] = useState(init.notice || '');
  const [result, setResult] = useState(init.result || null);
  const [own, setOwn] = useState(!!init.own);
  const [challenger, setChallenger] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [tally, setTally] = useState(null);
  // The result being revealed; cleared when the person navigates away so the
  // reveal timer does not push a stale result.
  const revealing = useRef(null);

  useEffect(() => {
    if (init.stage === 'result' && !init.own) track('shared_view', { fighter: init.result.fighter.slug });
  }, [init]);

  useEffect(() => {
    const onPop = () => {
      revealing.current = null;
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
    if (stage !== 'intro') return;
    let live = true;
    fetchTally().then((t) => live && setTally(t));
    return () => {
      live = false;
    };
  }, [stage]);

  useEffect(() => {
    if (stage === 'result' && result) {
      const who = own ? 'I fight' : 'Your friend fights';
      document.title = `${who} like ${result.fighter.name} | Which UFC Fighter Are You?`;
    } else {
      document.title = 'Which UFC Fighter Are You?';
    }
  }, [stage, result, own]);

  const start = () => {
    setAnswers([]);
    setNotice('');
    setStage('quiz');
    prepareBotCheck();
    track('quiz_start');
  };

  const answer = (choice) => {
    const next = [...answers, choice];
    setAnswers(next);
    if (next.length < QUESTIONS.length) return;
    const match = findMatch(roster, next);
    const r = { ...match, answers: next };
    const path = sharePath({ slug: match.fighter.slug, answers: next });
    store.set('ufcq:last', path);
    revealing.current = r;
    // A retake with the same answers is not counted twice; only a count that
    // went through is remembered.
    if (store.get('ufcq:counted') !== path)
      recordTally(match.fighter).then((t) => {
        if (t) store.set('ufcq:counted', path);
      });
    setResult(r);
    setOwn(true);
    setStage('reveal');
    track('quiz_complete', { type: match.type, fighter: match.fighter.slug });
    window.setTimeout(() => {
      if (revealing.current !== r) return;
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
          <Intro onStart={start} notice={notice} challenger={challenger} tally={tally} />
        )}
        {stage === 'quiz' && (
          <Quiz index={answers.length} onAnswer={answer} onBack={back} />
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
        Powered by <a href={API_DOCS}>UFC Stats API</a> · Not affiliated with the UFC
      </footer>
    </div>
  );
}

function Intro({ onStart, notice, challenger, tally }) {
  return (
    <section className="intro fade-in">
      {notice && <p className="notice">{notice}</p>}
      {challenger && (
        <p className="challenge-banner">
          Your friend got <strong>{challenger.fighter.name}</strong>. Your turn.
        </p>
      )}
      <p className="eyebrow">Six questions</p>
      <h1 className="title">
        Which UFC fighter <span>are you?</span>
      </h1>
      <button className="btn btn-primary btn-big start-btn" onClick={onStart}>
        Find my fighter
      </button>
      {tally?.total > 0 && (
        <p className="social-proof">
          <strong>{tally.total.toLocaleString()}</strong> people matched
        </p>
      )}
    </section>
  );
}

function Quiz({ index, onAnswer, onBack }) {
  const q = QUESTIONS[index];
  const heading = useRef(null);
  // Keyboard and screen-reader users land on each new question.
  useEffect(() => {
    heading.current?.focus();
  }, [index]);
  return (
    <section className="quiz fade-in" key={q.id}>
      <div className="progress" aria-hidden="true">
        {QUESTIONS.map((x, i) => (
          <span key={x.id} className={i <= index ? 'done' : ''} />
        ))}
      </div>
      <p className="eyebrow">
        {index + 1} / {QUESTIONS.length}
      </p>
      <h2 className="question" ref={heading} tabIndex={-1} aria-label={`Question ${index + 1} of ${QUESTIONS.length}: ${q.question}`}>
        {q.question}
      </h2>
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

function Result({ result, own, challenger, onRetake, onChallenge }) {
  const { fighter, type, axes, matchPct, answers } = result;
  const t = TYPES[type];
  const share = useMemo(
    () => (own ? shareUrl({ slug: fighter.slug, answers }) : null),
    [own, fighter.slug, answers],
  );
  const status = statusOf(fighter);
  const versus = challenger && own && challenger.axes && axes;
  const heading = own ? 'You fight like' : 'Your friend fights like';
  const nameRef = useRef(null);
  useEffect(() => {
    nameRef.current?.focus();
  }, [fighter.slug]);

  return (
    <section className="result fade-in">
      <article className="card">
        <div className="card-bar" />
        <p className="card-kicker">{heading}</p>
        {fighter.nickname && <p className="nickname">“{fighter.nickname}”</p>}
        <h1 className="fighter-name" ref={nameRef} tabIndex={-1}>
          {fighter.name}
        </h1>
        <p className="fighter-meta">
          {fighter.division} · {fighter.record}
          {status && <span className={`status ${status.className}`}>{status.label}</span>}
        </p>
        <div className="type-row">
          <span className="type-badge">{t.name}</span>
          {matchPct != null && <span className="match-pct">{matchPct}% match</span>}
        </div>
        <p className="type-desc">{t.tagline}</p>

        {versus && (
          <div className="versus">
            <div className="versus-row">
              <div>
                <span className="vs-label">You</span>
                <strong>{fighter.name}</strong>
              </div>
              <span className="vs">VS</span>
              <div>
                <span className="vs-label">Friend</span>
                <strong>{challenger.fighter.name}</strong>
              </div>
            </div>
            <p className="vs-verdict">{verdict(axes, challenger.axes)}</p>
          </div>
        )}
      </article>

      <aside className="actions">
        {own ? (
          <>
            <ShareActions result={result} url={share} />
            <button className="link-btn" onClick={onRetake}>
              ↺ Take it again
            </button>
          </>
        ) : (
          <button className="btn btn-primary btn-big" onClick={onChallenge}>
            Find my fighter
          </button>
        )}
      </aside>
    </section>
  );
}

function ShareActions({ result, url }) {
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const { fighter } = result;
  const text = `I fight like ${fighter.name} 🥊 Which UFC fighter are you?`;
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
      <button className="btn btn-primary btn-big" onClick={canNativeShare ? nativeShare : copy}>
        {canNativeShare ? 'Share my result' : copied ? 'Link copied' : 'Copy my link'}
      </button>
      <div className="share-links">
        {canNativeShare && (
          <>
            <button className="link-btn" onClick={copy}>
              {copied ? 'Copied' : 'Copy link'}
            </button>
            <span aria-hidden="true">·</span>
          </>
        )}
        <button className="link-btn" onClick={postX}>
          Post on X
        </button>
        <span aria-hidden="true">·</span>
        <button className="link-btn" onClick={save} disabled={saving}>
          {saving ? 'Drawing…' : 'Save image'}
        </button>
      </div>
    </>
  );
}

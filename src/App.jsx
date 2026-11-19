import { useEffect, useMemo, useRef, useState } from 'react';
import roster from './data/roster.json';
import { QUESTIONS } from './lib/questions.js';
import { TYPES } from './lib/types.js';
import { verdict } from './lib/versus.js';
import { findMatch, rank, scoreFighter, userAxes } from './lib/match.js';
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

const lastName = (name) => name.replace(/\s+(Jr\.?|Sr\.?|II|III|IV)$/i, '').split(' ').slice(-1)[0];

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
  const { ranked } = rank(roster, answers);
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
  // The result whose counts came from the record call; a cached read must not
  // overwrite those fresher numbers.
  const fresh = useRef(null);

  useEffect(() => {
    if (init.stage === 'result' && !init.own) track('shared_view', { fighter: init.result.fighter.slug });
  }, [init]);

  useEffect(() => {
    const onPop = () => {
      fresh.current = null;
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

  // The counter: totals on the start screen, the fighter's count on any
  // result page. A quiz just finished gets its numbers from the record call.
  useEffect(() => {
    let live = true;
    const show = (t) => live && setTally(t);
    if (stage === 'intro') fetchTally().then(show);
    if (stage === 'result' && result && fresh.current !== result) fetchTally(result.fighter).then(show);
    return () => {
      live = false;
    };
  }, [stage, result]);

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
    setTally(null);
    fresh.current = r;
    // A retake with the same answers reads the counts instead of counting
    // twice; only a count that went through is remembered.
    // Only show counts that belong to the result still on screen.
    const show = (t) => fresh.current === r && setTally(t);
    if (store.get('ufcq:counted') === path) fetchTally(match.fighter).then(show);
    else
      recordTally(match.fighter).then((t) => {
        if (t) store.set('ufcq:counted', path);
        show(t);
      });
    setResult(r);
    setOwn(true);
    setStage('reveal');
    track('quiz_complete', { type: match.type, fighter: match.fighter.slug });
    window.setTimeout(() => {
      if (fresh.current !== r) return; // the person navigated away during the reveal
      window.history.pushState({}, '', path);
      setStage('result');
    }, 1400);
  };

  const back = () => {
    if (answers.length === 0) setStage('intro');
    else setAnswers(answers.slice(0, -1));
  };

  const takeChallenge = () => {
    fresh.current = null;
    if (result && !own) setChallenger(result);
    window.history.pushState({}, '', '/');
    setResult(null);
    setStage('intro');
  };

  const retake = () => {
    fresh.current = null;
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
            tally={tally}
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

function Result({ result, own, challenger, tally, onRetake, onChallenge }) {
  const { fighter, type, axes, matchPct, runnersUp, answers } = result;
  const t = TYPES[type];
  const share = useMemo(
    () => (own ? shareUrl({ slug: fighter.slug, answers }) : null),
    [own, fighter.slug, answers],
  );
  const status = statusOf(fighter);
  const counted = tally?.total > 0 && tally.fighter > 0;
  const surname = lastName(fighter.name);
  const versus = challenger && own && challenger.axes && axes;
  const heading = own ? 'You fight like' : 'Your friend fights like';
  const nameRef = useRef(null);
  useEffect(() => {
    nameRef.current?.focus();
  }, [fighter.slug]);

  return (
    <section className={`result fade-in ${own ? 'is-own' : 'is-friend'}`}>
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

        <div className="stats">
          <Stat label="Strikes/min" value={fighter.slpm.toFixed(1)} />
          <Stat label="Accuracy" value={`${Math.round(fighter.strAcc * 100)}%`} />
          <Stat label="TDs/15 min" value={fighter.tdAvg.toFixed(1)} />
          <Stat label="Finishes" value={fighter.koWins + fighter.subWins} />
        </div>

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

        <div className="card-foot">
          {runnersUp?.length > 0 && (
            <p className="also">
              {own ? 'Also' : 'Also close'}: {runnersUp.map((r) => r.fighter.name).join(' · ')}
            </p>
          )}
          {counted && (
            <p className="also">
              {own && tally.fighter === 1 ? (
                <>First to get {surname}</>
              ) : (
                <>
                  <strong>{tally.fighter.toLocaleString()}</strong> got {surname}
                </>
              )}
            </p>
          )}
        </div>

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
      <div className="share-row">
        {canNativeShare && (
          <button className="btn btn-outline" onClick={copy}>
            {copied ? 'Copied' : 'Copy link'}
          </button>
        )}
        <button className="btn btn-outline" onClick={postX}>
          Post on X
        </button>
        <button className="btn btn-outline" onClick={save} disabled={saving}>
          {saving ? 'Drawing…' : 'Save image'}
        </button>
      </div>
    </>
  );
}

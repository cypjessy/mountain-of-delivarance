"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import LiveTvEmbed from "@/components/shared/LiveTvEmbed";
import { useRouter } from "next/navigation";

/* ─── BIBLE VERSES COLLECTION ─── */
const VERSES: { text: string; ref: string }[] = [
  { text: "For I know the plans I have for you, declares the Lord, plans to prosper you and not to harm you, plans to give you hope and a future.", ref: "Jeremiah 29:11" },
  { text: "I can do all things through him who strengthens me.", ref: "Philippians 4:13" },
  { text: "Trust in the Lord with all your heart, and do not lean on your own understanding.", ref: "Proverbs 3:5" },
  { text: "The Lord is my shepherd; I shall not want.", ref: "Psalm 23:1" },
  { text: "Be strong and courageous. Do not be frightened, and do not be dismayed, for the Lord your God is with you wherever you go.", ref: "Joshua 1:9" },
  { text: "But they who wait for the Lord shall renew their strength; they shall mount up with wings like eagles.", ref: "Isaiah 40:31" },
  { text: "Fear not, for I am with you; be not dismayed, for I am your God; I will strengthen you, I will help you, I will uphold you with my righteous right hand.", ref: "Isaiah 41:10" },
  { text: "The peace of God, which surpasses all understanding, will guard your hearts and your minds in Christ Jesus.", ref: "Philippians 4:7" },
  { text: "For God so loved the world, that he gave his only Son, that whoever believes in him should not perish but have eternal life.", ref: "John 3:16" },
  { text: "Commit your work to the Lord, and your plans will be established.", ref: "Proverbs 16:3" },
  { text: "Delight yourself in the Lord, and he will give you the desires of your heart.", ref: "Psalm 37:4" },
  { text: "The Lord is my light and my salvation; whom shall I fear?", ref: "Psalm 27:1" },
  { text: "My grace is sufficient for you, for my power is made perfect in weakness.", ref: "2 Corinthians 12:9" },
  { text: "Rejoice in the Lord always; again I will say, Rejoice.", ref: "Philippians 4:4" },
  { text: "And we know that for those who love God all things work together for good.", ref: "Romans 8:28" },
  { text: "The Lord bless you and keep you; the Lord make his face shine upon you and be gracious to you.", ref: "Numbers 6:24-25" },
  { text: "Be still, and know that I am God.", ref: "Psalm 46:10" },
  { text: "Your word is a lamp to my feet and a light to my path.", ref: "Psalm 119:105" },
  { text: "Cast all your anxieties on him, because he cares for you.", ref: "1 Peter 5:7" },
  { text: "Do not be anxious about anything, but in everything by prayer and supplication with thanksgiving let your requests be made known to God.", ref: "Philippians 4:6" },
  { text: "The Lord is my rock, my fortress and my deliverer; my God is my rock, in whom I take refuge.", ref: "Psalm 18:2" },
  { text: "Taste and see that the Lord is good; blessed is the one who takes refuge in him.", ref: "Psalm 34:8" },
  { text: "He heals the brokenhearted and binds up their wounds.", ref: "Psalm 147:3" },
  { text: "The name of the Lord is a fortified tower; the righteous run to it and are safe.", ref: "Proverbs 18:10" },
  { text: "A gentle answer turns away wrath, but a harsh word stirs up anger.", ref: "Proverbs 15:1" },
  { text: "The fear of the Lord is the beginning of knowledge, but fools despise wisdom and instruction.", ref: "Proverbs 1:7" },
  { text: "Above all else, guard your heart, for everything you do flows from it.", ref: "Proverbs 4:23" },
  { text: "As water reflects the face, so one's life reflects the heart.", ref: "Proverbs 27:19" },
  { text: "Hope deferred makes the heart sick, but a longing fulfilled is a tree of life.", ref: "Proverbs 13:12" },
  { text: "A friend loves at all times, and a brother is born for a time of adversity.", ref: "Proverbs 17:17" },
  { text: "Two are better than one, because they have a good return for their labor.", ref: "Ecclesiastes 4:9" },
  { text: "To everything there is a season, and a time to every purpose under heaven.", ref: "Ecclesiastes 3:1" },
  { text: "He has made everything beautiful in its time.", ref: "Ecclesiastes 3:11" },
  { text: "But those who hope in the Lord will renew their strength. They will soar on wings like eagles.", ref: "Isaiah 40:31" },
  { text: "When you pass through the waters, I will be with you; and when you pass through the rivers, they will not sweep over you.", ref: "Isaiah 43:2" },
  { text: "For I am the Lord your God who takes hold of your right hand and says to you, Do not fear; I will help you.", ref: "Isaiah 41:13" },
  { text: "Call to me and I will answer you and tell you great and unsearchable things you do not know.", ref: "Jeremiah 33:3" },
  { text: "I have loved you with an everlasting love; I have drawn you with unfailing kindness.", ref: "Jeremiah 31:3" },
  { text: "The steadfast love of the Lord never ceases; his mercies never come to an end; they are new every morning.", ref: "Lamentations 3:22-23" },
  { text: "I will give you a new heart and put a new spirit within you.", ref: "Ezekiel 36:26" },
  { text: "The Lord is good to those whose hope is in him, to the one who seeks him.", ref: "Lamentations 3:25" },
  { text: "Blessed are the poor in spirit, for theirs is the kingdom of heaven.", ref: "Matthew 5:3" },
  { text: "Blessed are the pure in heart, for they will see God.", ref: "Matthew 5:8" },
  { text: "Blessed are the peacemakers, for they will be called children of God.", ref: "Matthew 5:9" },
  { text: "You are the light of the world. A town built on a hill cannot be hidden.", ref: "Matthew 5:14" },
  { text: "Ask and it will be given to you; seek and you will find; knock and the door will be opened to you.", ref: "Matthew 7:7" },
  { text: "Come to me, all you who are weary and burdened, and I will give you rest.", ref: "Matthew 11:28" },
  { text: "For where two or three gather in my name, there am I with them.", ref: "Matthew 18:20" },
  { text: "With man this is impossible, but with God all things are possible.", ref: "Matthew 19:26" },
  { text: "Love the Lord your God with all your heart and with all your soul and with all your mind. This is the first and greatest commandment.", ref: "Matthew 22:37-38" },
  { text: "Jesus Christ is the same yesterday and today and forever.", ref: "Hebrews 13:8" },
  { text: "Now faith is confidence in what we hope for and assurance about what we do not see.", ref: "Hebrews 11:1" },
  { text: "Let us hold unswervingly to the hope we profess, for he who promised is faithful.", ref: "Hebrews 10:23" },
  { text: "The word of God is alive and active. Sharper than any double-edged sword.", ref: "Hebrews 4:12" },
  { text: "Let us then approach God's throne of grace with confidence, so that we may receive mercy and find grace to help us in our time of need.", ref: "Hebrews 4:16" },
  { text: "If any of you lacks wisdom, you should ask God, who gives generously to all without finding fault, and it will be given to you.", ref: "James 1:5" },
  { text: "Every good and perfect gift is from above, coming down from the Father of the heavenly lights.", ref: "James 1:17" },
  { text: "Submit yourselves, then, to God. Resist the devil, and he will flee from you.", ref: "James 4:7" },
  { text: "Humble yourselves before the Lord, and he will lift you up.", ref: "James 4:10" },
  { text: "The prayer of a righteous person is powerful and effective.", ref: "James 5:16" },
  { text: "In the same way, let your light shine before others, that they may see your good deeds and glorify your Father in heaven.", ref: "Matthew 5:16" },
  { text: "Do not judge, or you too will be judged. For in the same way you judge others, you will be judged.", ref: "Matthew 7:1-2" },
  { text: "Therefore go and make disciples of all nations, baptizing them in the name of the Father and of the Son and of the Holy Spirit.", ref: "Matthew 28:19" },
  { text: "For even the Son of Man did not come to be served, but to serve, and to give his life as a ransom for many.", ref: "Mark 10:45" },
  { text: "Love your neighbor as yourself. There is no commandment greater than these.", ref: "Mark 12:31" },
  { text: "For nothing will be impossible with God.", ref: "Luke 1:37" },
  { text: "Give, and it will be given to you. A good measure, pressed down, shaken together and running over, will be poured into your lap.", ref: "Luke 6:38" },
  { text: "But the Lord said to Samuel, Do not consider his appearance or his height, for I have rejected him. The Lord does not look at the things people look at. People look at the outward appearance, but the Lord looks at the heart.", ref: "1 Samuel 16:7" },
  { text: "The Lord is my strength and my shield; my heart trusts in him, and he helps me.", ref: "Psalm 28:7" },
  { text: "Weeping may stay for the night, but rejoicing comes in the morning.", ref: "Psalm 30:5" },
  { text: "I will instruct you and teach you in the way you should go; I will counsel you with my loving eye on you.", ref: "Psalm 32:8" },
  { text: "The righteous cry out, and the Lord hears them; he delivers them from all their troubles.", ref: "Psalm 34:17" },
  { text: "Commit your way to the Lord; trust in him and he will do this.", ref: "Psalm 37:5" },
  { text: "Be still before the Lord and wait patiently for him.", ref: "Psalm 37:7" },
  { text: "God is our refuge and strength, an ever-present help in trouble.", ref: "Psalm 46:1" },
  { text: "Create in me a pure heart, O God, and renew a steadfast spirit within me.", ref: "Psalm 51:10" },
  { text: "Cast your cares on the Lord and he will sustain you; he will never let the righteous be shaken.", ref: "Psalm 55:22" },
  { text: "Praise the Lord, my soul, and forget not all his benefits.", ref: "Psalm 103:2" },
  { text: "The Lord is compassionate and gracious, slow to anger, abounding in love.", ref: "Psalm 103:8" },
  { text: "As far as the east is from the west, so far has he removed our transgressions from us.", ref: "Psalm 103:12" },
  { text: "Your love, Lord, reaches to the heavens, your faithfulness to the skies.", ref: "Psalm 36:5" },
  { text: "Unless the Lord builds the house, the builders labor in vain.", ref: "Psalm 127:1" },
  { text: "Children are a heritage from the Lord, offspring a reward from him.", ref: "Psalm 127:3" },
  { text: "Search me, God, and know my heart; test me and know my anxious thoughts.", ref: "Psalm 139:23" },
  { text: "The Lord watches over you; he is your shade at your right hand.", ref: "Psalm 121:5" },
  { text: "The Lord will watch over your coming and going both now and forevermore.", ref: "Psalm 121:8" },
  { text: "Great is our Lord and mighty in power; his understanding has no limit.", ref: "Psalm 147:5" },
  { text: "The Lord is near to all who call on him, to all who call on him in truth.", ref: "Psalm 145:18" },
  { text: "He gives strength to the weary and increases the power of the weak.", ref: "Isaiah 40:29" },
  { text: "The grass withers and the flowers fall, but the word of our God endures forever.", ref: "Isaiah 40:8" },
  { text: "I have engraved you on the palms of my hands.", ref: "Isaiah 49:16" },
  { text: "So is my word that goes out from my mouth: It will not return to me empty, but will accomplish what I desire and achieve the purpose for which I sent it.", ref: "Isaiah 55:11" },
  { text: "You will go out in joy and be led forth in peace; the mountains and hills will burst into song before you.", ref: "Isaiah 55:12" },
  { text: "For as the heavens are higher than the earth, so are my ways higher than your ways and my thoughts than your thoughts.", ref: "Isaiah 55:9" },
  { text: "The Spirit of the Sovereign Lord is on me, because the Lord has anointed me to proclaim good news to the poor.", ref: "Isaiah 61:1" },
  { text: "But I will restore you to health and heal your wounds, declares the Lord.", ref: "Jeremiah 30:17" },
  { text: "And you will seek me and find me when you seek me with all your heart.", ref: "Jeremiah 29:13" },
  { text: "No eye has seen, no ear has heard, and no mind has conceived what God has prepared for those who love him.", ref: "1 Corinthians 2:9" },
  { text: "Do you not know that your bodies are temples of the Holy Spirit, who is in you, whom you have received from God?", ref: "1 Corinthians 6:19" },
  { text: "God is faithful, who has called you into fellowship with his Son, Jesus Christ our Lord.", ref: "1 Corinthians 1:9" },
  { text: "Therefore, if anyone is in Christ, the new creation has come: The old has gone, the new is here!", ref: "2 Corinthians 5:17" },
  { text: "My God will meet all your needs according to the riches of his glory in Christ Jesus.", ref: "Philippians 4:19" },
  { text: "Let the peace of Christ rule in your hearts, since as members of one body you were called to peace.", ref: "Colossians 3:15" },
  { text: "For we live by faith, not by sight.", ref: "2 Corinthians 5:7" },
  { text: "Be joyful in hope, patient in affliction, faithful in prayer.", ref: "Romans 12:12" },
];

export default function OracleTvPage() {
  const router = useRouter();

  /* ── Auto-playing Bible verses ── */
  const [verseIndex, setVerseIndex] = useState(0);
  const [verseVisible, setVerseVisible] = useState(true);
  const [paused, setPaused] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Stable ref to the latest goToNext so intervals never use stale closures
  const goToNextRef = useRef<() => void>(() => {});

  const goToNext = useCallback(() => {
    setVerseVisible(false);
    setTimeout(() => {
      setVerseIndex((i) => (i + 1) % VERSES.length);
      setVerseVisible(true);
    }, 400);
  }, []);

  const goToPrev = useCallback(() => {
    setVerseVisible(false);
    setTimeout(() => {
      setVerseIndex((i) => (i - 1 + VERSES.length) % VERSES.length);
      setVerseVisible(true);
    }, 400);
  }, []);

  // Keep the ref pointing to the latest callback
  goToNextRef.current = goToNext;

  const startInterval = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      goToNextRef.current();
    }, 7000);
  }, []);

  const stopInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const restartInterval = useCallback(() => {
    stopInterval();
    if (!paused) startInterval();
  }, [paused, startInterval, stopInterval]);

  // Start/stop the auto-advance based on paused state
  useEffect(() => {
    if (!paused) {
      startInterval();
    } else {
      stopInterval();
    }
    return stopInterval;
  }, [paused, startInterval, stopInterval]);

  // Pause/Resume toggle
  const handleTogglePause = useCallback(() => {
    setPaused((p) => !p);
  }, []);

  // Manual navigation that also resets the auto-advance timer
  const handleNext = useCallback(() => {
    goToNext();
    restartInterval();
  }, [goToNext, restartInterval]);

  const handlePrev = useCallback(() => {
    goToPrev();
    restartInterval();
  }, [goToPrev, restartInterval]);

  // Jump to a specific verse via dot
  const handleJumpToVerse = useCallback((i: number) => {
    setVerseVisible(false);
    setTimeout(() => {
      setVerseIndex(i);
      setVerseVisible(true);
    }, 400);
    restartInterval();
  }, [restartInterval]);

  const currentVerse = VERSES[verseIndex];

  return (
    <div className="oracle-page">
      {/* ─── Background layers ─── */}
      <div className="oracle-bg-gradient" />
      <div className="oracle-bg-pattern" />
      <div className="oracle-bg-glow oracle-bg-glow-1" />
      <div className="oracle-bg-glow oracle-bg-glow-2" />

      {/* ─── Back button ─── */}
      <button
        className="oracle-back-btn"
        onClick={() => router.back()}
        aria-label="Go back"
      >
        <i className="fas fa-arrow-left" />
      </button>

      {/* ─── Top branding bar ─── */}
      <div className="oracle-top-bar">
        <div className="oracle-brand">
          <div className="oracle-brand-icon">
            <i className="fas fa-tower-broadcast" />
          </div>
          <div className="oracle-brand-text">
            <span className="oracle-brand-name">ORACLE TV</span>
            <span className="oracle-brand-sub">Live Stream</span>
          </div>
          <div className="oracle-live-dot" />
        </div>
      </div>

      {/* ─── Player: edge to edge, full width ─── */}
      <div className="oracle-player-section">
        <LiveTvEmbed navTo="/tv" />
      </div>

      {/* ─── Bible Verses: unified premium card ─── */}
      <div className="oracle-verses-section">
        <div className={`oracle-premium-verse-card ${verseVisible ? "oracle-verse-visible" : "oracle-verse-hidden"}`}>
          {/* Shine overlay */}
          <div className="oracle-pvc-shine" />
          {/* Gradient border */}
          <div className="oracle-pvc-border" />
          {/* Inner glow */}
          <div className="oracle-pvc-glow" />

          {/* ── Label ── */}
          <div className="oracle-pvc-label">
            <i className="fas fa-bible" />
            <span>Word of God</span>
            {paused && <span className="oracle-pvc-paused">Paused</span>}
          </div>

          {/* ── Verse content ── */}
          <div className="oracle-pvc-body" onClick={handleTogglePause} title={paused ? "Tap to resume" : "Tap to pause"}>
            <div className="oracle-pvc-quote">
              <i className="fas fa-quote-left" />
            </div>
            <p className="oracle-pvc-text" lang="en">{currentVerse.text}</p>
            <span className="oracle-pvc-ref">{currentVerse.ref}</span>
          </div>

          {/* ── Divider ── */}
          <div className="oracle-pvc-divider" />

          {/* ── Controls ── */}
          <div className="oracle-pvc-controls">
            <div className="oracle-pvc-dots">
              {VERSES.slice(0, 7).map((_, i) => (
                <span
                  key={i}
                  className={`oracle-pvc-dot ${i === verseIndex ? "oracle-pvc-dot-active" : ""}`}
                  onClick={(e) => { e.stopPropagation(); handleJumpToVerse(i); }}
                />
              ))}
              {VERSES.length > 7 && <span className="oracle-pvc-dot-more">+{VERSES.length - 7}</span>}
            </div>
            <div className="oracle-pvc-nav">
              <button className="oracle-pvc-btn" onClick={(e) => { e.stopPropagation(); handlePrev(); }} aria-label="Previous">
                <i className="fas fa-chevron-left" />
              </button>
              <button className="oracle-pvc-btn oracle-pvc-btn-play" onClick={(e) => { e.stopPropagation(); handleTogglePause(); }} aria-label={paused ? "Resume" : "Pause"}>
                <i className={`fas ${paused ? "fa-play" : "fa-pause"}`} />
              </button>
              <button className="oracle-pvc-btn" onClick={(e) => { e.stopPropagation(); handleNext(); }} aria-label="Next">
                <i className="fas fa-chevron-right" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Styles ─── */}
      <style>{`
        /* ── Page layout ── */
        .oracle-page {
          min-height: 100vh;
          min-height: 100dvh;
          width: 100%;
          background: #0a0a0f;
          position: relative;
          overflow-y: auto;
          overflow-x: hidden;
          display: flex;
          flex-direction: column;
          align-items: center;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }

        /* ── Background layers ── */
        .oracle-bg-gradient {
          position: fixed;
          inset: 0;
          background: radial-gradient(ellipse 80% 60% at 50% -10%, rgba(139,92,246,0.15) 0%, transparent 70%),
                      radial-gradient(ellipse 60% 50% at 80% 80%, rgba(59,130,246,0.08) 0%, transparent 60%),
                      radial-gradient(ellipse 50% 40% at 20% 90%, rgba(168,85,247,0.06) 0%, transparent 50%);
          pointer-events: none;
          z-index: 0;
        }
        .oracle-bg-pattern {
          position: fixed;
          inset: 0;
          background-image:
            radial-gradient(rgba(255,255,255,0.03) 1px, transparent 1px);
          background-size: 32px 32px;
          pointer-events: none;
          z-index: 0;
        }
        .oracle-bg-glow {
          position: fixed;
          border-radius: 50%;
          filter: blur(80px);
          pointer-events: none;
          z-index: 0;
        }
        .oracle-bg-glow-1 {
          width: 400px;
          height: 400px;
          top: -100px;
          right: -100px;
          background: rgba(139,92,246,0.12);
        }
        .oracle-bg-glow-2 {
          width: 300px;
          height: 300px;
          bottom: 50px;
          left: -80px;
          background: rgba(59,130,246,0.08);
        }

        /* ── Back button ── */
        .oracle-back-btn {
          position: fixed;
          top: 16px;
          left: 16px;
          z-index: 100;
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: rgba(0,0,0,0.6);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(255,255,255,0.1);
          color: #fff;
          font-size: 18px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.25s ease;
        }
        .oracle-back-btn:hover {
          background: rgba(139,92,246,0.25);
          border-color: rgba(139,92,246,0.4);
          transform: scale(1.05);
        }
        .oracle-back-btn:active {
          transform: scale(0.95);
        }

        /* ── Top branding bar ── */
        .oracle-top-bar {
          position: relative;
          z-index: 1;
          width: 100%;
          padding: 16px 16px 12px;
          display: flex;
          justify-content: center;
        }
        .oracle-brand {
          display: flex;
          align-items: center;
          gap: 14px;
        }
        .oracle-brand-icon {
          width: 48px;
          height: 48px;
          border-radius: 14px;
          background: linear-gradient(135deg, rgba(139,92,246,0.25), rgba(59,130,246,0.15));
          border: 1px solid rgba(139,92,246,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 22px;
          color: #a78bfa;
        }
        .oracle-brand-text {
          display: flex;
          flex-direction: column;
        }
        .oracle-brand-name {
          font-size: 22px;
          font-weight: 800;
          color: #fff;
          letter-spacing: 1px;
          line-height: 1.2;
        }
        .oracle-brand-sub {
          font-size: 12px;
          font-weight: 500;
          color: rgba(255,255,255,0.45);
          letter-spacing: 0.3px;
        }
        .oracle-live-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #ef4444;
          animation: oracle-pulse 2s ease-in-out infinite;
          box-shadow: 0 0 12px rgba(239,68,68,0.5);
          margin-left: 4px;
        }
        @keyframes oracle-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.85); }
        }

        /* ── Player section: edge to edge ── */
        .oracle-player-section {
          width: 100%;
          position: relative;
          z-index: 1;
          display: flex;
          justify-content: center;
        }
        .oracle-player-section .live-tv-embed-section {
          width: 100%;
          max-width: 100%;
          border-radius: 0;
        }
        .oracle-player-section .live-tv-header {
          display: none !important;
        }
        .oracle-player-section .live-tv-embed-wrap {
          width: 100%;
          position: relative;
          overflow: hidden;
          aspect-ratio: 16 / 9;
          background: #000;
        }
        .oracle-player-section iframe {
          width: 100%;
          height: 100%;
          border: none;
          display: block;
          position: absolute;
          top: 0;
          left: 0;
        }

        /* ── Bible Verses Section ── */
        .oracle-verses-section {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 800px;
          margin: 0 auto;
          padding: 32px 16px 48px;
          display: flex;
          flex-direction: column;
          align-items: center;
          flex: 1;
          box-sizing: border-box;
          overflow-x: hidden;
        }

        /* ── Unified Premium Verse Card ── */
        .oracle-premium-verse-card {
          width: 100%;
          max-width: 100%;
          padding: 28px 24px 24px;
          border-radius: 24px;
          position: relative;
          overflow: hidden;
          transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
          display: flex;
          flex-direction: column;
          gap: 0;
          box-sizing: border-box;
        }
        .oracle-premium-verse-card:hover {
          transform: translateY(-2px);
        }
        .oracle-verse-visible {
          opacity: 1;
          transform: translateY(0);
        }
        .oracle-verse-hidden {
          opacity: 0;
          transform: translateY(12px);
        }

        /* Card background gradient */
        .oracle-premium-verse-card::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 24px;
          background: linear-gradient(135deg, rgba(139,92,246,0.1) 0%, rgba(59,130,246,0.04) 50%, rgba(15,15,30,0.6) 100%);
          pointer-events: none;
        }

        /* Gradient border ring */
        .oracle-pvc-border {
          position: absolute;
          inset: 0;
          border-radius: 24px;
          padding: 1px;
          background: linear-gradient(135deg, rgba(139,92,246,0.3) 0%, rgba(99,102,241,0.15) 50%, rgba(139,92,246,0.05) 100%);
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          mask-composite: exclude;
          pointer-events: none;
        }

        /* Inner glow */
        .oracle-pvc-glow {
          position: absolute;
          top: -50%;
          left: -20%;
          width: 140%;
          height: 60%;
          background: radial-gradient(ellipse at center, rgba(139,92,246,0.06) 0%, transparent 70%);
          pointer-events: none;
        }

        /* Shine animation */
        .oracle-pvc-shine {
          position: absolute;
          top: 0;
          left: -100%;
          width: 60%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.02), transparent);
          animation: oracle-pvc-shine 10s ease-in-out infinite;
          pointer-events: none;
        }
        @keyframes oracle-pvc-shine {
          0%, 100% { left: -100%; }
          50% { left: 200%; }
        }

        /* ── Card Label ── */
        .oracle-pvc-label {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 28px;
          padding-bottom: 16px;
          border-bottom: 1px solid rgba(139,92,246,0.1);
        }
        .oracle-pvc-label i {
          font-size: 16px;
          color: rgba(139,92,246,0.6);
        }
        .oracle-pvc-label span {
          font-size: 14px;
          font-weight: 700;
          color: rgba(255,255,255,0.35);
          letter-spacing: 1.5px;
          text-transform: uppercase;
        }
        .oracle-pvc-paused {
          font-size: 9px;
          padding: 3px 10px;
          border-radius: 6px;
          background: rgba(234,179,8,0.12);
          color: #eab308;
          font-weight: 700;
          letter-spacing: 0.5px;
        }

        /* ── Card Body (verse content) ── */
        .oracle-pvc-body {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 24px;
          padding: 8px 0 4px;
          cursor: pointer;
          width: 100%;
          max-width: 100%;
          overflow: hidden;
          box-sizing: border-box;
        }
        .oracle-pvc-quote {
          font-size: 44px;
          color: rgba(139,92,246,0.1);
          line-height: 1;
        }
        .oracle-pvc-text {
          font-size: 32px;
          line-height: 1.5;
          color: rgba(255,255,255,0.9);
          font-weight: 400;
          text-align: center;
          margin: 0;
          font-style: italic;
          letter-spacing: 0.2px;
          width: 100%;
          max-width: 100%;
          overflow-wrap: break-word;
          word-break: break-word;
          hyphens: auto;
          box-sizing: border-box;
        }
        .oracle-pvc-ref {
          font-size: 18px;
          font-weight: 700;
          color: rgba(167,139,250,0.5);
          letter-spacing: 0.5px;
        }

        /* ── Card Divider ── */
        .oracle-pvc-divider {
          position: relative;
          z-index: 1;
          width: 100%;
          height: 1px;
          margin: 24px 0 0;
          background: linear-gradient(90deg, transparent, rgba(139,92,246,0.12), rgba(99,102,241,0.08), transparent);
        }

        /* ── Card Controls (bottom row) ── */
        .oracle-pvc-controls {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-top: 20px;
          gap: 16px;
        }

        /* Progress dots */
        .oracle-pvc-dots {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 1;
        }
        .oracle-pvc-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: rgba(255,255,255,0.1);
          cursor: pointer;
          transition: all 0.3s ease;
          flex-shrink: 0;
        }
        .oracle-pvc-dot:hover {
          background: rgba(139,92,246,0.5);
          transform: scale(1.3);
        }
        .oracle-pvc-dot-active {
          width: 28px;
          border-radius: 4px;
          background: linear-gradient(90deg, #8B5CF6, #6366F1);
          box-shadow: 0 0 10px rgba(139,92,246,0.3);
        }
        .oracle-pvc-dot-more {
          font-size: 11px;
          color: rgba(255,255,255,0.2);
          font-weight: 500;
          margin-left: 2px;
          flex-shrink: 0;
        }

        /* Navigation buttons */
        .oracle-pvc-nav {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-shrink: 0;
        }
        .oracle-pvc-btn {
          width: 40px;
          height: 40px;
          border-radius: 12px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(139,92,246,0.1);
          color: rgba(255,255,255,0.35);
          font-size: 14px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.25s ease;
        }
        .oracle-pvc-btn:hover {
          background: rgba(139,92,246,0.12);
          border-color: rgba(139,92,246,0.2);
          color: rgba(255,255,255,0.7);
        }
        .oracle-pvc-btn:active {
          transform: scale(0.9);
        }
        .oracle-pvc-btn-play {
          background: rgba(139,92,246,0.15);
          border-color: rgba(139,92,246,0.25);
          color: #a78bfa;
        }
        .oracle-pvc-btn-play:hover {
          background: rgba(139,92,246,0.25);
          border-color: rgba(139,92,246,0.35);
          color: #c4b5fd;
        }

        /* ── Responsive ── */
        @media (max-width: 600px) {
          .oracle-pvc-text { font-size: 22px; }
          .oracle-premium-verse-card { padding: 24px 20px 20px; }
          .oracle-verses-section { padding: 24px 12px 40px; }
          .oracle-pvc-ref { font-size: 15px; }
          .oracle-pvc-body { gap: 18px; }
          .oracle-pvc-quote { font-size: 32px; }
          .oracle-pvc-controls { flex-direction: column; gap: 12px; }
          .oracle-top-bar { padding: 14px 12px 10px; }
          .oracle-brand-icon { width: 40px; height: 40px; font-size: 18px; }
          .oracle-brand-name { font-size: 18px; }
        }
      `}</style>
    </div>
  );
}

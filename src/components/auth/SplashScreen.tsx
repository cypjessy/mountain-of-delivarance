"use client";

import { useEffect, useRef } from "react";

const SPLASH_IMAGE = "/splash.png";

export default function SplashScreen() {
  const splashRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    import("@capacitor/splash-screen").then(({ SplashScreen }) => {
      SplashScreen.hide().catch(() => {});
    }).catch(() => {});

    // Exit after the image has been visible for a beat
    const exitTimer = setTimeout(() => {
      splashRef.current?.classList.add("hidden");
    }, 2000);

    return () => {
      clearTimeout(exitTimer);
    };
  }, []);

  return (
    <div className="splash-screen" ref={splashRef}>
      <img className="splash-img" src={SPLASH_IMAGE} alt="MOUNTAIN OF DELIVERANCE CHURCH" />

      <style>{`
        .splash-screen {
          position: fixed;
          inset: 0;
          background: #0F0D0A;
          z-index: 10000;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          transition: opacity 0.5s ease, visibility 0.5s ease;
        }
        .splash-screen.hidden {
          opacity: 0;
          visibility: hidden;
        }
        .splash-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center;
          display: block;
        }
      `}</style>
    </div>
  );
}

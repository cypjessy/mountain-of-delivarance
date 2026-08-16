"use client";

import { useEffect } from "react";
import { hapticSuccess, hapticError } from "@/lib/haptics";
import { ToastProvider } from "@/components/ui/Toast";
import SplashScreen from "@/components/auth/SplashScreen";
import LoginForm from "@/components/auth/LoginForm";
import ForgotPasswordModal from "@/components/auth/ForgotPasswordModal";
import PhoneLoginModal from "@/components/auth/PhoneLoginModal";
import CountryPickerModal from "@/components/auth/CountryPickerModal";
import RegisterModal from "@/components/auth/RegisterModal";
import TempAdminModal from "@/components/auth/TempAdminModal";
import PremiumTopBar from "@/components/shared/PremiumTopBar";


export default function LoginPage() {
  useEffect(() => {
    let cleanup: (() => void) | null = null;

    (async () => {
      try {
        const { App } = await import("@capacitor/app");

        const backListener = await App.addListener("backButton", () => {
          App.exitApp().catch(() => {});
        });

        cleanup = () => {
          backListener.remove();
        };
      } catch {
        // Fallback for web — no-op
      }
    })();

    return () => cleanup?.();
  }, []);

  return (
    <>
      <style>{`
        :root {
            --primary: #E8A838;
            --primary-light: #F5C76B;
            --primary-dark: #B98A1F;
            --bg: #0F0D0A;
            --surface: #181512;
            --surface-elevated: #23201B;
            --surface-card: #1C1915;
            --text-primary: #F7F5F0;
            --text-secondary: #A8A39A;
            --text-tertiary: #75706A;
            --border: #2B2720;
            --error: #F87171;
            --success: #34D399;
            --overlay: rgba(0,0,0,0.85);
            --gradient-start: #E8A838;
            --gradient-end: #C9771D;
            --shadow-soft: 0 4px 20px rgba(232,168,56,0.16);
            --shadow-elevated: 0 10px 36px rgba(0,0,0,0.55);
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            -webkit-tap-highlight-color: transparent;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        }

        html, body {
            height: 100%;
            overflow: hidden;
            background: var(--bg);
            color: var(--text-primary);
        }

        .splash-screen {
            position: fixed;
            inset: 0;
            background: var(--bg);
            z-index: 10000;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            transition: opacity 0.6s ease, visibility 0.6s ease;
        }

        .splash-screen.hidden {
            opacity: 0;
            visibility: hidden;
        }

        .splash-logo {
            width: 120px;
            height: 120px;
            background: linear-gradient(135deg, var(--gradient-start), var(--gradient-end));
            border-radius: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: var(--shadow-soft), 0 0 60px rgba(232,168,56,0.2);
            animation: splashPulse 2s ease-in-out infinite;
        }

        .splash-logo i {
            font-size: 52px;
            color: #fff;
        }

        .splash-brand {
            margin-top: 28px;
            font-size: 28px;
            font-weight: 800;
            letter-spacing: -0.5px;
            background: linear-gradient(135deg, var(--gradient-start), var(--gradient-end));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }

        .splash-tagline {
            margin-top: 8px;
            font-size: 14px;
            color: var(--text-tertiary);
            font-weight: 400;
        }

        .splash-loader {
            margin-top: 40px;
            width: 40px;
            height: 40px;
            border: 3px solid var(--surface-elevated);
            border-top-color: var(--primary);
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
        }

        @keyframes splashPulse {
            0%, 100% { transform: scale(1); box-shadow: var(--shadow-soft), 0 0 60px rgba(232,168,56,0.2); }
            50% { transform: scale(1.05); box-shadow: var(--shadow-soft), 0 0 80px rgba(232,168,56,0.35); }
        }

        @keyframes spin {
            to { transform: rotate(360deg); }
        }

        .app-container {
            height: 100%;
            display: flex;
            flex-direction: column;
            position: relative;
            overflow: hidden;
        }

        /* Ambient premium backdrop — soft gold & violet glows, viewport-fixed */
        .app-container::before {
            content: '';
            position: fixed;
            inset: 0;
            z-index: 0;
            pointer-events: none;
            background:
                radial-gradient(560px 380px at 88% -8%, rgba(232,168,56,0.08) 0%, transparent 62%),
                radial-gradient(640px 460px at -12% 108%, rgba(139,92,246,0.055) 0%, transparent 62%),
                radial-gradient(480px 340px at 50% 118%, rgba(232,168,56,0.045) 0%, transparent 65%);
        }

        .login-screen {
            position: relative;
            z-index: 1;
            flex: 1;
            width: 100%;
            max-width: 424px;
            margin: 0 auto;
            display: flex;
            flex-direction: column;
            justify-content: center;
            padding: 28px 20px 36px;
            overflow-y: auto;
            -webkit-overflow-scrolling: touch;
        }

        .login-screen::-webkit-scrollbar { display: none; }

        .login-hero {
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 0 0 26px;
            position: relative;
            text-align: center;
        }

        .login-hero-bg {
            position: absolute;
            top: -110px;
            left: 50%;
            transform: translateX(-50%);
            width: 420px;
            height: 420px;
            background:
                radial-gradient(circle, rgba(232,168,56,0.13) 0%, transparent 62%),
                radial-gradient(circle at 70% 30%, rgba(255,255,255,0.03) 0%, transparent 45%);
            pointer-events: none;
        }

        .login-hero-logo {
            width: 84px;
            height: 84px;
            border-radius: 24px;
            background: linear-gradient(160deg, #F5C76B 0%, var(--gradient-start) 48%, var(--gradient-end) 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
            box-shadow:
                0 14px 44px rgba(232,168,56,0.30),
                0 0 0 1px rgba(232,168,56,0.28),
                inset 0 1px 0 rgba(255,255,255,0.35);
        }

        .login-hero-logo::after {
            content: '';
            position: absolute;
            inset: -7px;
            border-radius: 30px;
            border: 1px solid rgba(232,168,56,0.16);
            pointer-events: none;
        }

        .login-hero-logo i {
            font-size: 36px;
            color: #fff;
            filter: drop-shadow(0 2px 6px rgba(0,0,0,0.25));
        }

        .login-eyebrow {
            margin-top: 22px;
            font-size: 11px;
            font-weight: 600;
            letter-spacing: 2.8px;
            text-transform: uppercase;
            color: var(--primary);
            opacity: 0.9;
        }

        .login-hero h1 {
            margin-top: 10px;
            font-size: 27px;
            font-weight: 800;
            text-align: center;
            letter-spacing: -0.5px;
            line-height: 1.2;
        }

        .login-hero p {
            margin-top: 8px;
            font-size: 14px;
            color: var(--text-secondary);
            text-align: center;
            line-height: 1.55;
            max-width: 300px;
        }

        .login-form {
            width: 100%;
            display: flex;
            flex-direction: column;
            gap: 18px;
            background: linear-gradient(180deg, rgba(255,255,255,0.035) 0%, rgba(255,255,255,0.012) 100%);
            border: 1px solid rgba(255,255,255,0.075);
            border-radius: 24px;
            padding: 24px 20px;
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            box-shadow: 0 24px 64px rgba(0,0,0,0.38), inset 0 1px 0 rgba(255,255,255,0.045);
        }

        .input-group { position: relative; }

        .input-group label {
            display: block;
            font-size: 11px;
            font-weight: 600;
            color: var(--text-secondary);
            margin-bottom: 8px;
            text-transform: uppercase;
            letter-spacing: 0.9px;
        }

        .input-wrapper {
            position: relative;
            background: rgba(26,26,26,0.65);
            border: 1px solid var(--border);
            border-radius: 14px;
            transition: all 0.25s ease;
            overflow: hidden;
        }

        .input-wrapper:focus-within {
            border-color: rgba(232,168,56,0.55);
            background: var(--surface-elevated);
            box-shadow: 0 0 0 4px rgba(232,168,56,0.10), 0 8px 24px rgba(0,0,0,0.28);
        }

        .input-wrapper.error {
            border-color: var(--error);
            box-shadow: 0 0 0 4px rgba(255,107,107,0.08);
        }

        .input-wrapper i {
            position: absolute;
            left: 18px;
            top: 50%;
            transform: translateY(-50%);
            color: var(--text-tertiary);
            font-size: 17px;
            transition: color 0.25s ease;
        }

        .input-wrapper:focus-within i { color: var(--primary); }

        .input-wrapper input {
            width: 100%;
            padding: 16px 54px 16px 50px;
            background: transparent;
            border: none;
            outline: none;
            color: var(--text-primary);
            font-size: 16px;
            font-weight: 500;
        }

        .input-wrapper input::placeholder {
            color: var(--text-tertiary);
            font-weight: 400;
        }

        .toggle-password {
            position: absolute;
            right: 12px;
            top: 50%;
            transform: translateY(-50%);
            background: none;
            border: none;
            color: var(--text-secondary);
            font-size: 18px;
            cursor: pointer;
            padding: 10px;
            z-index: 3;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: color 0.2s ease;
            min-width: 44px;
            min-height: 44px;
        }

        .toggle-password:active { color: var(--primary); }
        .toggle-password:hover { color: var(--text-primary); }

        .login-options {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-top: 2px;
        }

        .remember-me {
            display: flex;
            align-items: center;
            gap: 10px;
            cursor: pointer;
        }

        .remember-me input {
            appearance: none;
            width: 20px;
            height: 20px;
            border: 1.5px solid var(--border);
            border-radius: 6px;
            background: rgba(26,26,26,0.65);
            cursor: pointer;
            transition: all 0.2s ease;
            position: relative;
            flex-shrink: 0;
        }

        .remember-me input:checked {
            background: var(--primary);
            border-color: var(--primary);
            box-shadow: 0 0 0 3px rgba(232,168,56,0.14);
        }

        .remember-me input:checked::after {
            content: '\\f00c';
            font-family: 'Font Awesome 6 Free';
            font-weight: 900;
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            color: #fff;
            font-size: 11px;
        }

        .remember-me span {
            font-size: 13px;
            color: var(--text-secondary);
            font-weight: 500;
        }

        .forgot-password {
            font-size: 13px;
            color: var(--primary);
            font-weight: 600;
            text-decoration: none;
            background: none;
            border: none;
            cursor: pointer;
            padding: 6px 0;
        }

        .forgot-password:active { opacity: 0.7; }

        .btn-primary {
            width: 100%;
            padding: 17px;
            background: linear-gradient(135deg, var(--gradient-start), var(--gradient-end));
            border: none;
            border-radius: 14px;
            color: #fff;
            font-size: 15px;
            font-weight: 700;
            cursor: pointer;
            position: relative;
            overflow: hidden;
            transition: all 0.3s ease;
            box-shadow: 0 10px 30px rgba(232,168,56,0.24), inset 0 1px 0 rgba(255,255,255,0.22);
            letter-spacing: 0.4px;
        }

        .btn-primary::after {
            content: '';
            position: absolute;
            top: 0;
            left: -90%;
            width: 55%;
            height: 100%;
            background: linear-gradient(105deg, transparent, rgba(255,255,255,0.28), transparent);
            transform: skewX(-20deg);
            transition: left 0.55s ease;
            pointer-events: none;
        }

        .btn-primary:hover::after { left: 130%; }

        .btn-primary:active { transform: scale(0.98); box-shadow: 0 4px 16px rgba(232,168,56,0.18), inset 0 1px 0 rgba(255,255,255,0.22); }
        .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }

        .btn-primary .btn-text { transition: opacity 0.2s ease; }
        .btn-primary.loading .btn-text { opacity: 0; }

        .btn-primary .btn-loader {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 24px;
            height: 24px;
            border: 2.5px solid rgba(255,255,255,0.3);
            border-top-color: #fff;
            border-radius: 50%;
            animation: spin 0.7s linear infinite;
            opacity: 0;
            transition: opacity 0.2s ease;
        }

        .btn-primary.loading .btn-loader { opacity: 1; }

        .btn-biometric {
            width: 100%;
            padding: 15px;
            background: rgba(26,26,26,0.65);
            border: 1px solid var(--border);
            border-radius: 14px;
            color: var(--text-primary);
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            transition: all 0.2s ease;
            position: relative;
            font-family: inherit;
        }
        .btn-biometric:active { background: var(--surface-elevated); transform: scale(0.98); }
        .btn-biometric:disabled { opacity: 0.6; cursor: not-allowed; }
        .btn-biometric i { font-size: 19px; color: var(--primary); }
        .btn-biometric .btn-text { transition: opacity 0.2s ease; }
        .btn-biometric.loading .btn-text { opacity: 0; }
        .btn-biometric .btn-loader {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 22px;
            height: 22px;
            border: 2.5px solid var(--border);
            border-top-color: var(--primary);
            border-radius: 50%;
            animation: spin 0.7s linear infinite;
            opacity: 0;
            transition: opacity 0.2s ease;
        }
        .btn-biometric.loading .btn-loader { opacity: 1; }

        .divider {
            display: flex;
            align-items: center;
            gap: 16px;
            margin: 8px 0;
        }

        .divider::before, .divider::after {
            content: '';
            flex: 1;
            height: 1px;
            background: linear-gradient(90deg, transparent, var(--border) 30%, var(--border) 70%, transparent);
        }

        .divider span {
            font-size: 12px;
            color: var(--text-tertiary);
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 1.2px;
        }

        .social-login { display: flex; gap: 12px; }

        .social-btn {
            flex: 1;
            padding: 15px;
            background: rgba(26,26,26,0.65);
            border: 1px solid var(--border);
            border-radius: 14px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            color: var(--text-primary);
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .social-btn:active { background: var(--surface-elevated); transform: scale(0.98); }
        .social-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .social-btn i { font-size: 19px; }
        .social-btn.google i { color: #EA4335; }
        .social-btn.phone i { color: var(--primary); }

        .login-footer {
            padding: 22px 0 4px;
            text-align: center;
        }

        .login-footer p {
            font-size: 13px;
            color: var(--text-secondary);
        }

        .login-footer a {
            color: var(--primary);
            font-weight: 700;
            text-decoration: none;
            padding: 4px 0;
        }

        .login-footer a:active { opacity: 0.7; }


        .modal-overlay {
            position: fixed;
            inset: 0;
            background: var(--overlay);
            z-index: 9000;
            display: flex;
            align-items: flex-end;
            justify-content: center;
            opacity: 0;
            visibility: hidden;
            transition: opacity 0.3s ease, visibility 0.3s ease;
        }

        .modal-overlay.active { opacity: 1; visibility: visible; }

        .modal-sheet {
            width: 100%;
            max-height: 88vh;
            background: linear-gradient(180deg, #1E1E1E 0%, #171717 100%);
            border-radius: 28px 28px 0 0;
            padding: 0 0 env(safe-area-inset-bottom, 0px);
            transform: translateY(100%);
            transition: transform 0.35s cubic-bezier(0.32, 0.72, 0, 1);
            overflow: hidden;
            display: flex;
            flex-direction: column;
            border-top: 1px solid rgba(255,255,255,0.06);
        }

        .modal-overlay.active .modal-sheet { transform: translateY(0); }

        .modal-handle {
            width: 40px;
            height: 5px;
            background: var(--text-tertiary);
            border-radius: 3px;
            margin: 12px auto 8px;
            opacity: 0.4;
        }

        .modal-header {
            padding: 8px 24px 16px;
            text-align: center;
        }

        .modal-header h2 { font-size: 20px; font-weight: 700; margin-bottom: 6px; letter-spacing: -0.3px; }
        .modal-header p { font-size: 13px; color: var(--text-secondary); line-height: 1.5; }

        .modal-body {
            flex: 1;
            overflow-y: auto;
            padding: 0 24px 20px;
            -webkit-overflow-scrolling: touch;
        }

        .modal-body::-webkit-scrollbar { display: none; }

        .modal-footer {
            padding: 16px 24px;
            border-top: 1px solid var(--border);
        }

        .terms-text {
            font-size: 12px;
            color: var(--text-tertiary);
            text-align: center;
            line-height: 1.6;
            margin-top: 16px;
        }

        .terms-text a {
            color: var(--primary);
            font-weight: 600;
            text-decoration: none;
        }

        /* Compact the hero on short phones so the form always fits */
        @media (max-height: 700px) {
            .login-screen { padding-top: 16px; justify-content: flex-start; }
            .login-hero { padding-bottom: 18px; }
            .login-hero-logo { width: 72px; height: 72px; border-radius: 21px; }
            .login-hero-logo i { font-size: 31px; }
            .login-eyebrow { margin-top: 16px; }
            .login-hero h1 { font-size: 24px; }
            .login-form { padding: 20px 18px; gap: 15px; }
        }

        @media (min-width: 480px) {
            .app-container {
                max-width: 480px;
                margin: 0 auto;
            }
        }
        @media (min-width: 768px) {
            .app-container { max-width: 100%; }
            .login-screen { padding: 0 24px; justify-content: center; max-width: 440px; }
            .login-hero { padding: 28px 0 26px; }
            .login-hero-logo { width: 92px; height: 92px; border-radius: 26px; }
            .login-hero-logo i { font-size: 40px; }
            .login-hero h1 { font-size: 30px; }
            .login-hero p { font-size: 15px; max-width: 340px; }
            .input-wrapper input { padding: 17px 54px 17px 50px; font-size: 16px; }
            .btn-primary { padding: 18px; font-size: 16px; }
            .login-footer { padding: 26px 0 6px; }
            .modal-body { padding: 0 32px 24px; }
            .modal-header { padding: 8px 32px 20px; }
        }
      `}</style>

      <SplashScreen />

      <ToastProvider>
        <div className="app-container">
          <PremiumTopBar minimal />
          <div className="login-screen">
            <LoginForm />
          </div>
        </div>

        <RegisterModal />
        <TempAdminModal />
        <ForgotPasswordModal />
        <PhoneLoginModal />
        <CountryPickerModal />
      </ToastProvider>
    </>
  );
}

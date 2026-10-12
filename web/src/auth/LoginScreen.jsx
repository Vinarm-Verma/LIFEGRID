
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Ambulance,
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  HeartPulse,
  Hospital,
  LockKeyhole,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Sparkles,
  User,
  Users,
  LoaderCircle,
  AlertCircle,
} from "lucide-react";

import { isSupabaseConfigured, supabase } from "./supabase";
import "./LoginScreen.css";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api";

const ROLES = [
  {
    id: "citizen",
    title: "Citizen / Bystander",
    description: "Report an emergency and follow its response.",
    icon: Users,
  },
  {
    id: "ambulance",
    title: "Ambulance Driver",
    description: "Receive assignments and share your live location.",
    icon: Ambulance,
  },
  {
    id: "hospital",
    title: "Hospital / Clinic",
    description: "Manage incoming emergencies and capacity.",
    icon: Hospital,
  },
  {
    id: "resource_provider",
    title: "Resource Provider",
    description: "Provide emergency resources for coordination.",
    icon: Building2,
  },
];

const PROVIDER_FIELDS = {
  ambulance: [
    ["vehicle_number", "Vehicle number", "e.g. UP16AB1234"],
    ["ambulance_type", "Ambulance type", "Basic / Advanced"],
    ["provider_name", "Provider / organization", "Organization name"],
    ["city", "Operating city", "City"],
  ],
  hospital: [
    ["organization_name", "Hospital / clinic name", "Hospital name"],
    ["address", "Full address", "Street / locality"],
    ["city", "City", "City"],
    ["state", "State", "Uttar Pradesh"],
  ],
  resource_provider: [
    ["organization_name", "Organization name", "Organization name"],
    ["resource_type", "Resource type", "Blood / Oxygen / Equipment"],
    ["resource_name", "Resource name", "e.g. O+ Blood"],
    ["quantity_available", "Available quantity", "e.g. 10 units"],
    ["city", "City", "City"],
  ],
};

function RobotCompanion() {
  return (
    <div className="lg-robot-scene" aria-label="Animated LIFEGRID robot mascot">
      <div className="lg-orbit lg-orbit-one" />
      <div className="lg-orbit lg-orbit-two" />
      <div className="lg-robot-spark lg-spark-one">✦</div>
      <div className="lg-robot-spark lg-spark-two">✧</div>

      <div className="lg-robot-shadow" />

      <svg
        className="lg-robot"
        viewBox="0 0 300 330"
        role="img"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="robotBody" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="55%" stopColor="#c9f6ee" />
            <stop offset="100%" stopColor="#77cfc5" />
          </linearGradient>
          <linearGradient id="robotFace" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f8ffff" />
            <stop offset="100%" stopColor="#d8efff" />
          </linearGradient>
          <linearGradient id="robotArm" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f7ffff" />
            <stop offset="100%" stopColor="#7cd4d1" />
          </linearGradient>
          <filter id="robotGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="8" />
          </filter>
        </defs>

        <ellipse
          cx="151"
          cy="300"
          rx="78"
          ry="13"
          fill="#76c9c1"
          opacity=".22"
          filter="url(#robotGlow)"
        />

        {/* Body */}
        <g className="lg-robot-body">
          <path
            d="M105 188 Q150 167 194 188 L218 278 Q153 305 84 278 Z"
            fill="url(#robotBody)"
            stroke="#8bd9d2"
            strokeWidth="2"
          />
          <path
            d="M120 209 Q151 222 181 209 L190 265 Q150 282 110 265 Z"
            fill="#ecfffc"
            opacity=".8"
          />
          <circle cx="151" cy="241" r="19" fill="#fff" opacity=".85" />
          <path
            d="M139 241 L147 249 L164 231"
            fill="none"
            stroke="#078b79"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>

        {/* Left arm */}
        <path
          d="M105 204 Q78 213 72 244"
          fill="none"
          stroke="url(#robotArm)"
          strokeWidth="19"
          strokeLinecap="round"
        />
        <circle cx="72" cy="246" r="12" fill="#c5f2ec" stroke="#7bcfc8" strokeWidth="2" />
        <path
          d="M72 246 L61 265"
          fill="none"
          stroke="#8ad8d1"
          strokeWidth="13"
          strokeLinecap="round"
        />

        {/* Raised waving arm */}
        <g className="lg-robot-wave">
          <path
            d="M194 205 Q221 185 230 154"
            fill="none"
            stroke="url(#robotArm)"
            strokeWidth="19"
            strokeLinecap="round"
          />
          <circle cx="231" cy="152" r="11" fill="#d9fbf7" stroke="#7bcfc8" strokeWidth="2" />
          <path
            d="M232 149 L236 123"
            fill="none"
            stroke="#c6f2ed"
            strokeWidth="11"
            strokeLinecap="round"
          />
          <path
            d="M236 123 L232 103 M239 123 L245 105 M232 125 L220 109 M243 126 L256 114"
            fill="none"
            stroke="#c6f2ed"
            strokeWidth="8"
            strokeLinecap="round"
          />
          <path
            d="M236 123 L232 103 M239 123 L245 105 M232 125 L220 109 M243 126 L256 114"
            fill="none"
            stroke="#73c8c3"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </g>

        {/* Head */}
        <g className="lg-robot-head">
          <path
            d="M98 88 Q100 40 151 37 Q204 40 206 88 L201 146 Q197 174 151 179 Q105 174 101 146 Z"
            fill="url(#robotFace)"
            stroke="#a5dce5"
            strokeWidth="2"
          />
          <path
            d="M105 87 Q113 48 151 47 Q190 48 199 87"
            fill="none"
            stroke="#fff"
            strokeWidth="6"
            strokeLinecap="round"
            opacity=".9"
          />

          {/* Face display */}
          <ellipse cx="128" cy="111" rx="10" ry="13" fill="#4d91e8" className="lg-robot-eye" />
          <ellipse cx="175" cy="111" rx="10" ry="13" fill="#4d91e8" className="lg-robot-eye" />
          <circle cx="131" cy="106" r="3.2" fill="#fff" />
          <circle cx="178" cy="106" r="3.2" fill="#fff" />

          <path
            d="M137 141 Q151 153 166 141"
            fill="none"
            stroke="#e58fb5"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
          <ellipse cx="113" cy="133" rx="8" ry="4" fill="#f6b7d0" opacity=".6" />
          <ellipse cx="189" cy="133" rx="8" ry="4" fill="#f6b7d0" opacity=".6" />

          {/* Side details */}
          <path d="M100 104 L91 108 L93 135 L103 139" fill="#9ce1dc" stroke="#79c9c8" strokeWidth="2" />
          <path d="M203 104 L212 108 L210 135 L200 139" fill="#9ce1dc" stroke="#79c9c8" strokeWidth="2" />
        </g>

        {/* Antenna */}
        <path
          d="M151 38 L151 24"
          stroke="#9adbd6"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <circle cx="151" cy="18" r="8" fill="#7dd6cb" />
        <circle cx="148" cy="15" r="2.5" fill="#fff" />

        {/* Small chest light */}
        <circle cx="151" cy="272" r="4" fill="#078b79" />
      </svg>

      <div className="lg-robot-message">
        <span className="lg-message-dot" />
        Hi! I'm Grid, your LIFEGRID companion.
      </div>
    </div>
  );
}

function Field({
  label,
  icon: Icon,
  type = "text",
  value,
  onChange,
  placeholder,
  autoComplete,
  required = true,
  suffix,
  minLength,
}) {
  return (
    <label className="lg-field">
      <span className="lg-field-label">{label}</span>
      <span className="lg-field-control">
        <Icon size={18} className="lg-field-icon" />
        <input
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={required}
          minLength={minLength}
        />
        {suffix}
      </span>
    </label>
  );
}

function Notice({ children, type = "error" }) {
  return (
    <div
      className={`lg-notice lg-notice-${type}`}
      role={type === "error" ? "alert" : "status"}
    >
      {type === "error" ? (
        <AlertCircle size={17} />
      ) : (
        <CheckCircle2 size={17} />
      )}
      <span>{children}</span>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z" transform="translate(4 4) scale(.83)" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.74 7.18l7.72 5.99c4.51-4.17 7.06-10.31 7.06-17.64Z" transform="translate(4 4) scale(.83)" />
      <path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.77 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.9 23.9 0 0 0 0 24c0 3.87.93 7.52 2.56 10.78l7.97-6.19Z" transform="translate(4 4) scale(.83)" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.81l-7.72-5.99c-2.14 1.44-4.89 2.3-8.19 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.97 6.19C6.51 42.62 14.62 48 24 48Z" transform="translate(4 4) scale(.83)" />
    </svg>
  );
}

function AppleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M16.37 12.25c.02 2.2 1.93 2.93 1.95 2.94-.02.05-.3 1.03-1.01 2.04-.61.86-1.25 1.72-2.25 1.74-.98.02-1.3-.56-2.42-.56-1.12 0-1.47.54-2.4.58-.96.04-1.69-.93-2.3-1.78-1.25-1.75-2.2-4.95-.92-7.11.64-1.07 1.78-1.75 3.02-1.77.94-.02 1.82.63 2.4.63.58 0 1.66-.78 2.8-.67.48.02 1.83.19 2.7 1.47-.07.04-1.61.94-1.59 2.49ZM14.53 6.83c.5-.6.84-1.44.75-2.28-.73.03-1.62.49-2.14 1.09-.47.54-.88 1.4-.77 2.22.81.06 1.66-.41 2.16-1.03Z"
      />
    </svg>
  );
}

function friendlyAuthError(message) {
  const text = String(message || "");

  if (/invalid login credentials/i.test(text)) {
    return "Email or password is incorrect. Please try again.";
  }
  if (/email not confirmed/i.test(text)) {
    return "Please verify your email before signing in.";
  }
  if (/user already registered/i.test(text)) {
    return "An account with this email already exists. Please sign in.";
  }
  if (/password should be at least/i.test(text)) {
    return "Please choose a stronger password that meets the minimum length.";
  }
  if (/network|fetch failed|failed to fetch/i.test(text)) {
    return "Unable to connect. Check your internet connection and try again.";
  }

  return text || "Something went wrong. Please try again.";
}

export default function LoginScreen() {
  const [mode, setMode] = useState("login");
  const [step, setStep] = useState(1);
  const [role, setRole] = useState("citizen");

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [details, setDetails] = useState({});

  const [resetEmail, setResetEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const selectedRole = useMemo(
    () => ROLES.find((item) => item.id === role) || ROLES[0],
    [role]
  );
  const SelectedRoleIcon = selectedRole.icon;

  function clearMessages() {
    setError("");
    setSuccess("");
  }

  function switchMode(nextMode) {
    setMode(nextMode);
    setStep(1);
    clearMessages();
  }

  function updateDetail(key, value) {
    setDetails((current) => ({ ...current, [key]: value }));
  }

  useEffect(() => {
    if (!supabase) return undefined;

    let mounted = true;

    async function checkRecovery() {
      const params = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(
        window.location.hash.replace(/^#/, "")
      );

      const recoveryRequested =
        params.get("recovery") === "true" ||
        params.get("type") === "recovery" ||
        hashParams.get("type") === "recovery";

      if (!recoveryRequested) return;

      const { data, error: sessionError } =
        await supabase.auth.getSession();

      if (!mounted) return;

      if (sessionError || !data?.session) {
        setMode("forgot");
        setError(
          "This recovery link is invalid or expired. Request a new password reset email."
        );
        return;
      }

      setMode("reset-password");
      clearMessages();
    }

    void checkRecovery();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;

      if (event === "PASSWORD_RECOVERY" && session) {
        setMode("reset-password");
        clearMessages();
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleLogin(event) {
    event.preventDefault();
    clearMessages();

    if (!isSupabaseConfigured || !supabase) {
      setError(
        "Authentication is not configured. Check the Supabase settings in web/.env."
      );
      return;
    }

    setLoading(true);

    try {
      const { data, error: authError } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

      if (authError) throw authError;

      const session = data?.session;
      const user = session?.user;

      if (!session || !user) {
        throw new Error("No active login session was returned.");
      }

      const metadata = user.user_metadata || {};
      const requestedRole = String(
        metadata.lifegrid_role_request || "citizen"
      ).toLowerCase();
      const registration = metadata.lifegrid_registration || {};

      try {
        const response = await fetch(
          `${API_BASE_URL}/auth/onboarding/sync`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              role: requestedRole,
              full_name: metadata.full_name || "",
              phone: metadata.phone || "",
              details: registration,
            }),
          }
        );

        if (!response.ok) {
          console.warn(
            "LIFEGRID onboarding sync returned",
            response.status
          );
        }
      } catch (syncError) {
        console.warn("LIFEGRID onboarding sync unavailable:", syncError);
      }

      setSuccess("Signed in successfully. Opening your workspace…");
      window.setTimeout(() => window.location.reload(), 450);
    } catch (authError) {
      setError(friendlyAuthError(authError?.message));
    } finally {
      setLoading(false);
    }
  }

  async function handleOAuth(provider) {
    clearMessages();

    if (!isSupabaseConfigured || !supabase) {
      setError("Authentication is not configured. Check web/.env.");
      return;
    }

    setLoading(true);

    try {
      const { error: oauthError } =
        await supabase.auth.signInWithOAuth({
          provider,
          options: {
            redirectTo: `${window.location.origin}/`,
          },
        });

      if (oauthError) throw oauthError;
    } catch (oauthError) {
      setError(friendlyAuthError(oauthError?.message));
      setLoading(false);
    }
  }

  async function handleSignup(event) {
    event.preventDefault();
    clearMessages();

    if (!isSupabaseConfigured || !supabase) {
      setError("Authentication is not configured. Check web/.env.");
      return;
    }

    if (password.length < 8) {
      setError("Your password must contain at least 8 characters.");
      setStep(3);
      return;
    }

    if (password !== confirmPassword) {
      setError("Your passwords do not match.");
      setStep(3);
      return;
    }

    if (role !== "citizen") {
      const missing = (PROVIDER_FIELDS[role] || []).find(
        ([key]) => !String(details[key] || "").trim()
      );

      if (missing) {
        setError(`${missing[1]} is required.`);
        setStep(3);
        return;
      }
    }

    setLoading(true);

    try {
      const { data, error: signupError } =
        await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              full_name: name.trim(),
              phone: phone.trim(),
              lifegrid_role_request: role,
              lifegrid_registration: details,
            },
            emailRedirectTo: `${window.location.origin}/`,
          },
        });

      if (signupError) throw signupError;

      if (data?.session) {
        const session = data.session;

        try {
          await fetch(`${API_BASE_URL}/auth/onboarding/sync`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              role,
              full_name: name.trim(),
              phone: phone.trim(),
              details,
            }),
          });
        } catch (syncError) {
          console.warn("LIFEGRID signup sync unavailable:", syncError);
        }

        setSuccess("Account created. Opening LIFEGRID…");
        window.setTimeout(() => window.location.reload(), 650);
        return;
      }

      setSuccess(
        "Account created. Check your email to verify your account before signing in."
      );
      setMode("login");
      setPassword("");
      setConfirmPassword("");
    } catch (signupError) {
      setError(friendlyAuthError(signupError?.message));
    } finally {
      setLoading(false);
    }
  }

  async function handleSendReset(event) {
    event.preventDefault();
    clearMessages();

    if (!isSupabaseConfigured || !supabase) {
      setError("Authentication is not configured. Check web/.env.");
      return;
    }

    if (!resetEmail.trim()) {
      setError("Enter the email address registered to your account.");
      return;
    }

    setLoading(true);

    try {
      const { error: resetError } =
        await supabase.auth.resetPasswordForEmail(
          resetEmail.trim().toLowerCase(),
          {
            redirectTo: `${window.location.origin}/?recovery=true`,
          }
        );

      if (resetError) throw resetError;

      setSuccess(
        "If an account exists for this email, a reset link has been sent. Check your inbox and spam folder."
      );
    } catch (resetError) {
      setError(friendlyAuthError(resetError?.message));
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdatePassword(event) {
    event.preventDefault();
    clearMessages();

    if (newPassword.length < 8) {
      setError("Your new password must contain at least 8 characters.");
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setError("Your new passwords do not match.");
      return;
    }

    if (!supabase) {
      setError("Authentication is not configured. Check web/.env.");
      return;
    }

    setLoading(true);

    try {
      const { data, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError) throw sessionError;

      if (!data?.session) {
        throw new Error(
          "Your recovery session has expired. Request a new reset email."
        );
      }

      const { error: updateError } =
        await supabase.auth.updateUser({ password: newPassword });

      if (updateError) throw updateError;

      await supabase.auth.signOut();

      window.history.replaceState(
        {},
        document.title,
        window.location.pathname
      );

      setPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      setEmail(resetEmail.trim());
      setMode("login");
      setSuccess("Password updated successfully. Sign in with your new password.");
    } catch (updateError) {
      setError(friendlyAuthError(updateError?.message));
    } finally {
      setLoading(false);
    }
  }

  function selectRole(nextRole) {
    setRole(nextRole);
    setDetails({});
    clearMessages();
    setStep(2);
  }

  function goToLogin() {
    switchMode("login");
    setPassword("");
    setConfirmPassword("");
  }

  const providerFields = PROVIDER_FIELDS[role] || [];

  return (
    <main className="lg-login-page">
      <header className="lg-login-topbar">
        <a
          className="lg-login-brand"
          href="/"
          aria-label="LIFEGRID home"
          onClick={(event) => {
            event.preventDefault();
            goToLogin();
          }}
        >
          <span className="lg-login-brand-mark">
            <HeartPulse size={23} />
          </span>
          <span>
            <strong>LIFEGRID</strong>
            <small>Emergency coordination</small>
          </span>
        </a>

        <div className="lg-login-secure">
          <span />
          Secure access
        </div>
      </header>

      <section className="lg-login-layout">
        <section className="lg-login-hero">
          <div className="lg-hero-glow" />
          <div className="lg-hero-kicker">
            <Sparkles size={15} />
            YOUR RESPONSE COMPANION
          </div>

          <h1>
            When every
            <br />
            second <span>matters.</span>
          </h1>

          <p className="lg-hero-copy">
            One connected platform for people, responders, ambulances and
            hospitals—working together when it matters most.
          </p>

          <RobotCompanion />

          <div className="lg-hero-trust">
            <span className="lg-trust-icon">
              <ShieldCheck size={18} />
            </span>
            <span>
              <strong>Built around coordinated response</strong>
              <small>Secure access · Role-aware workspaces</small>
            </span>
          </div>

          <div className="lg-hero-bottom">
            <span><i /> EMERGENCY COORDINATION</span>
            <span>01 / LIFEGRID</span>
          </div>
        </section>

        <section className="lg-login-card">
          <div className="lg-card-topline">
            <span className="lg-card-kicker">
              {mode === "login"
                ? "WELCOME TO LIFEGRID"
                : mode === "signup"
                  ? "CREATE YOUR ACCOUNT"
                  : mode === "forgot"
                    ? "ACCOUNT RECOVERY"
                    : "SECURE YOUR ACCOUNT"}
            </span>
            <span className="lg-card-shield">
              <ShieldCheck size={16} />
            </span>
          </div>

          <h2>
            {mode === "login"
              ? "Welcome back"
              : mode === "signup"
                ? step === 1
                  ? "Create account"
                  : step === 2
                    ? "Your details"
                    : "Secure your account"
                : mode === "forgot"
                  ? "Forgot password?"
                  : "New password"}
          </h2>

          <p className="lg-card-subtitle">
            {mode === "login"
              ? "Sign in to continue to your workspace."
              : mode === "signup"
                ? "A few details to set up your LIFEGRID access."
                : mode === "forgot"
                  ? "We'll email you a secure link to reset your password."
                  : "Choose a strong password for your account."}
          </p>

          {mode === "login" && (
            <>
              <form className="lg-login-form" onSubmit={handleLogin}>
                <Field
                  label="EMAIL ADDRESS"
                  icon={Mail}
                  type="email"
                  value={email}
                  onChange={setEmail}
                  placeholder="you@example.com"
                  autoComplete="email"
                />

                <Field
                  label="PASSWORD"
                  icon={LockKeyhole}
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={setPassword}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  suffix={
                    <button
                      type="button"
                      className="lg-password-toggle"
                      onClick={() => setShowPassword((value) => !value)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  }
                />

                <div className="lg-forgot-row">
                  <button
                    type="button"
                    onClick={() => {
                      setResetEmail(email);
                      clearMessages();
                      setMode("forgot");
                    }}
                  >
                    Forgot password?
                  </button>
                </div>

                {error && <Notice>{error}</Notice>}
                {success && <Notice type="success">{success}</Notice>}

                <button className="lg-login-submit" type="submit" disabled={loading}>
                  {loading ? (
                    <>
                      <LoaderCircle size={18} className="lg-login-spin" />
                      Signing in…
                    </>
                  ) : (
                    <>
                      Sign in to LIFEGRID
                      <ArrowRight size={18} />
                    </>
                  )}
                </button>
              </form>

              <div className="lg-login-divider">
                <span />
                <small>or continue with</small>
                <span />
              </div>

              <div className="lg-social-buttons">
                <button
                  type="button"
                  className="lg-social-button"
                  disabled={loading}
                  onClick={() => void handleOAuth("google")}
                >
                  <GoogleMark />
                  <span>Google</span>
                </button>

                <button
                  type="button"
                  className="lg-social-button"
                  disabled={loading}
                  onClick={() => void handleOAuth("apple")}
                >
                  <AppleMark />
                  <span>Apple</span>
                </button>
              </div>

              <p className="lg-social-note">
                Social sign-in requires the provider to be enabled in Supabase.
              </p>

              <div className="lg-create-account">
                <span>New to LIFEGRID?</span>
                <button
                  type="button"
                  onClick={() => {
                    setRole("citizen");
                    setStep(1);
                    clearMessages();
                    setMode("signup");
                  }}
                >
                  Create account <ArrowRight size={15} />
                </button>
              </div>
            </>
          )}

          {mode === "forgot" && (
            <form className="lg-login-form" onSubmit={handleSendReset}>
              <button
                className="lg-text-back"
                type="button"
                onClick={goToLogin}
              >
                <ArrowLeft size={16} /> Back to sign in
              </button>

              <Field
                label="REGISTERED EMAIL"
                icon={Mail}
                type="email"
                value={resetEmail}
                onChange={setResetEmail}
                placeholder="you@example.com"
                autoComplete="email"
              />

              {error && <Notice>{error}</Notice>}
              {success && <Notice type="success">{success}</Notice>}

              <button className="lg-login-submit" type="submit" disabled={loading}>
                {loading ? (
                  <><LoaderCircle size={18} className="lg-login-spin" /> Sending link…</>
                ) : (
                  <>Send reset link <ArrowRight size={18} /></>
                )}
              </button>
            </form>
          )}

          {mode === "reset-password" && (
            <form className="lg-login-form" onSubmit={handleUpdatePassword}>
              <div className="lg-reset-callout">
                <ShieldCheck size={19} />
                <span>Your recovery session is active. Set your new password below.</span>
              </div>

              <Field
                label="NEW PASSWORD"
                icon={LockKeyhole}
                type="password"
                value={newPassword}
                onChange={setNewPassword}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                minLength={8}
              />

              <Field
                label="CONFIRM NEW PASSWORD"
                icon={LockKeyhole}
                type="password"
                value={confirmNewPassword}
                onChange={setConfirmNewPassword}
                placeholder="Enter it again"
                autoComplete="new-password"
                minLength={8}
              />

              {error && <Notice>{error}</Notice>}
              {success && <Notice type="success">{success}</Notice>}

              <button className="lg-login-submit" type="submit" disabled={loading}>
                {loading ? (
                  <><LoaderCircle size={18} className="lg-login-spin" /> Updating…</>
                ) : (
                  <>Update password <CheckCircle2 size={18} /></>
                )}
              </button>
            </form>
          )}

          {mode === "signup" && (
            <div className="lg-signup-flow">
              <div className="lg-signup-progress">
                {[1, 2, 3].map((item) => (
                  <span
                    key={item}
                    className={step >= item ? "active" : ""}
                  />
                ))}
                <small>STEP {step} OF 3</small>
              </div>

              {step === 1 && (
                <div className="lg-role-options">
                  {ROLES.map((item) => {
                    const Icon = item.icon;
                    const active = role === item.id;

                    return (
                      <button
                        type="button"
                        key={item.id}
                        className={`lg-role-option ${active ? "active" : ""}`}
                        onClick={() => setRole(item.id)}
                      >
                        <span className="lg-role-option-icon"><Icon size={20} /></span>
                        <span className="lg-role-option-copy">
                          <strong>{item.title}</strong>
                          <small>{item.description}</small>
                        </span>
                        <span className="lg-role-check">
                          {active && <CheckCircle2 size={18} />}
                        </span>
                      </button>
                    );
                  })}

                  {error && <Notice>{error}</Notice>}

                  <button
                    type="button"
                    className="lg-login-submit"
                    onClick={() => {
                      clearMessages();
                      setStep(2);
                    }}
                  >
                    Continue <ArrowRight size={18} />
                  </button>
                </div>
              )}

              {step === 2 && (
                <form
                  className="lg-login-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    clearMessages();

                    if (!name.trim() || !phone.trim() || !email.trim()) {
                      setError("Please complete your name, phone number, and email.");
                      return;
                    }

                    setStep(3);
                  }}
                >
                  <div className="lg-selected-role">
                    <SelectedRoleIcon size={19} />
                    <span>{selectedRole.title}</span>
                    <button type="button" onClick={() => setStep(1)}>Change</button>
                  </div>

                  <Field
                    label="FULL NAME"
                    icon={User}
                    value={name}
                    onChange={setName}
                    placeholder="Your full name"
                    autoComplete="name"
                  />

                  <Field
                    label="MOBILE NUMBER"
                    icon={Phone}
                    type="tel"
                    value={phone}
                    onChange={setPhone}
                    placeholder="+91 XXXXX XXXXX"
                    autoComplete="tel"
                  />

                  <Field
                    label="EMAIL ADDRESS"
                    icon={Mail}
                    type="email"
                    value={email}
                    onChange={setEmail}
                    placeholder="you@example.com"
                    autoComplete="email"
                  />

                  {error && <Notice>{error}</Notice>}

                  <div className="lg-form-button-row">
                    <button type="button" className="lg-secondary-action" onClick={() => setStep(1)}>
                      <ArrowLeft size={16} /> Back
                    </button>
                    <button type="submit" className="lg-login-submit">
                      Continue <ArrowRight size={18} />
                    </button>
                  </div>
                </form>
              )}

              {step === 3 && (
                <form className="lg-login-form" onSubmit={handleSignup}>
                  <div className="lg-selected-role">
                    <SelectedRoleIcon size={19} />
                    <span>{selectedRole.title}</span>
                    <button type="button" onClick={() => setStep(2)}>Edit details</button>
                  </div>

                  <Field
                    label="PASSWORD"
                    icon={LockKeyhole}
                    type="password"
                    value={password}
                    onChange={setPassword}
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                    minLength={8}
                  />

                  <Field
                    label="CONFIRM PASSWORD"
                    icon={LockKeyhole}
                    type="password"
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                    placeholder="Enter password again"
                    autoComplete="new-password"
                    minLength={8}
                  />

                  {providerFields.length > 0 && (
                    <div className="lg-provider-fields">
                      <p>Provider information</p>
                      {providerFields.map(([key, label, placeholder]) => (
                        <label className="lg-field" key={key}>
                          <span className="lg-field-label">{label.toUpperCase()}</span>
                          <span className="lg-field-control">
                            {key === "city" || key === "address" ? (
                              <MapPin size={18} className="lg-field-icon" />
                            ) : (
                              <Building2 size={18} className="lg-field-icon" />
                            )}
                            <input
                              value={details[key] || ""}
                              onChange={(event) => updateDetail(key, event.target.value)}
                              placeholder={placeholder}
                              required
                            />
                          </span>
                        </label>
                      ))}
                    </div>
                  )}

                  <p className="lg-signup-disclaimer">
                    Provider accounts may require verification before operational access is granted.
                  </p>

                  {error && <Notice>{error}</Notice>}
                  {success && <Notice type="success">{success}</Notice>}

                  <div className="lg-form-button-row">
                    <button type="button" className="lg-secondary-action" onClick={() => setStep(2)}>
                      <ArrowLeft size={16} /> Back
                    </button>
                    <button className="lg-login-submit" type="submit" disabled={loading}>
                      {loading ? (
                        <><LoaderCircle size={18} className="lg-login-spin" /> Creating…</>
                      ) : (
                        <>Create account <ArrowRight size={18} /></>
                      )}
                    </button>
                  </div>
                </form>
              )}

              <div className="lg-create-account">
                <span>Already have an account?</span>
                <button type="button" onClick={goToLogin}>Sign in</button>
              </div>
            </div>
          )}

          <div className="lg-card-security">
            <ShieldCheck size={15} />
            <span>Your account is protected by LIFEGRID authentication.</span>
          </div>
        </section>
      </section>

      <footer className="lg-login-footer">
        <span>© LIFEGRID · Emergency coordination</span>
        <span><Activity size={13} /> Designed for dependable response</span>
      </footer>
    </main>
  );
}

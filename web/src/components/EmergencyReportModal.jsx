
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  MapPin,
  Mic,
  MicOff,
  Phone,
  ShieldAlert,
  Users,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const EMERGENCY_TYPES = [
  { value: "medical_emergency", label: "Medical emergency" },
  { value: "road_accident", label: "Road accident" },
  { value: "cardiac_emergency", label: "Cardiac emergency" },
  { value: "stroke", label: "Stroke / neurological" },
  { value: "severe_bleeding", label: "Severe bleeding" },
  { value: "fire", label: "Fire / burn" },
  { value: "injury", label: "Serious injury" },
  { value: "other", label: "Other emergency" },
];

const VOICE_LANGUAGES = [
  ["en-IN", "English"],
  ["hi-IN", "हिन्दी"],
  ["bn-IN", "বাংলা"],
  ["mr-IN", "मराठी"],
  ["te-IN", "తెలుగు"],
  ["ta-IN", "தமிழ்"],
  ["gu-IN", "ગુજરાતી"],
  ["kn-IN", "ಕನ್ನಡ"],
  ["ml-IN", "മലയാളം"],
  ["pa-IN", "ਪੰਜਾਬੀ"],
  ["ur-IN", "اردو"],
  ["de-DE", "Deutsch"],
  ["fr-FR", "Français"],
];

const WARNING_SIGNS = [
  "Unconscious / not responding",
  "Difficulty breathing",
  "Severe bleeding",
  "Chest pain",
  "Seizure",
  "Major burn",
];

export default function EmergencyReportModal({
  onSubmit,
  onClose,
  disabled = false,
  onCall112,
}) {
  const [description, setDescription] = useState("");
  const [patientCount, setPatientCount] = useState(1);
  const [emergencyType, setEmergencyType] = useState("medical_emergency");
  const [sceneSafety, setSceneSafety] = useState("safe");
  const [warningSigns, setWarningSigns] = useState([]);
  const [locationText, setLocationText] = useState("");
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [voiceLanguage, setVoiceLanguage] = useState("en-IN");

  const recognitionRef = useRef(null);
  const descriptionRef = useRef("");
  const voiceSessionStartRef = useRef("");
  const voiceSessionActiveRef = useRef(false);

  useEffect(() => {
    document.body.classList.add("lifegrid-modal-open");

    const Recognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!Recognition) {
      setVoiceSupported(false);

      return () => {
        document.body.classList.remove("lifegrid-modal-open");
      };
    }

    setVoiceSupported(true);

    const recognition = new Recognition();

    // Final results only: do not process interim results that are repeatedly
    // revised by the browser's speech recognition engine.
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.lang = voiceLanguage;

    recognition.onstart = () => {
      voiceSessionActiveRef.current = true;
      setVoiceError("");
      setVoiceListening(true);
    };

    recognition.onend = () => {
      voiceSessionActiveRef.current = false;
      setVoiceListening(false);
    };

    recognition.onerror = (event) => {
      voiceSessionActiveRef.current = false;
      setVoiceListening(false);

      if (
        event?.error === "not-allowed" ||
        event?.error === "service-not-allowed"
      ) {
        setVoiceError(
          "Microphone permission was denied. Allow microphone access in your browser and try again."
        );
      } else if (event?.error === "no-speech") {
        setVoiceError("No speech was detected. Please try speaking again.");
      } else if (event?.error === "language-not-supported") {
        setVoiceError(
          "This browser does not support that voice language. Choose another language or type the report."
        );
      } else {
        setVoiceError(
          "Voice reporting is temporarily unavailable. You can type the emergency instead."
        );
      }
    };

    recognition.onresult = (event) => {
      const finalParts = [];

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];

        if (result.isFinal && result[0]?.transcript) {
          finalParts.push(result[0].transcript.trim());
        }
      }

      const transcript = finalParts
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      if (!transcript) return;

      const sessionStart = voiceSessionStartRef.current.trim();
      const existingText = descriptionRef.current.trim();

      // Do not add an exact duplicate of the text already in the field.
      if (
        existingText &&
        existingText.toLocaleLowerCase() === transcript.toLocaleLowerCase()
      ) {
        return;
      }

      // If the user had selected text and started another voice session,
      // append the newly recognized sentence once.
      const nextDescription = sessionStart
        ? `${sessionStart}${sessionStart ? " " : ""}${transcript}`.trim()
        : transcript;

      // Prevent a repeated final result from being appended twice.
      if (
        existingText.toLocaleLowerCase() ===
        nextDescription.toLocaleLowerCase()
      ) {
        return;
      }

      descriptionRef.current = nextDescription;
      setDescription(nextDescription);
    };

    recognitionRef.current = recognition;

    return () => {
      voiceSessionActiveRef.current = false;

      try {
        recognition.onresult = null;
        recognition.onend = null;
        recognition.onerror = null;
        recognition.stop();
      } catch {
        // Recognition may already be stopped.
      }

      recognitionRef.current = null;
      document.body.classList.remove("lifegrid-modal-open");
    };
  }, [voiceLanguage]);

  useEffect(() => {
    descriptionRef.current = description;
  }, [description]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape" && !disabled) {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [disabled, onClose]);

  const toggleVoice = () => {
    const recognition = recognitionRef.current;

    if (!recognition || disabled) return;

    setVoiceError("");

    if (voiceListening || voiceSessionActiveRef.current) {
      try {
        recognition.stop();
      } catch {
        voiceSessionActiveRef.current = false;
        setVoiceListening(false);
      }

      return;
    }

    // Save the text that existed before this voice session. The final
    // transcript will be appended to this once.
    voiceSessionStartRef.current = descriptionRef.current.trim();

    try {
      recognition.lang = voiceLanguage;
      recognition.start();
    } catch {
      setVoiceListening(false);
      voiceSessionActiveRef.current = false;
      setVoiceError(
        "The microphone is already starting. Please try again."
      );
    }
  };

  const toggleWarning = (warning) => {
    setWarningSigns((current) =>
      current.includes(warning)
        ? current.filter((item) => item !== warning)
        : [...current, warning]
    );
  };

  const canSubmit = description.trim().length >= 5 && !disabled;

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!canSubmit) return;

    if (voiceSessionActiveRef.current) {
      try {
        recognitionRef.current?.stop();
      } catch {
        // The recognition session may already have ended.
      }
    }

    onSubmit({
      description: description.trim(),
      patientCount,
      emergencyType,
      sceneSafety,
      warningSigns,
      locationText,
    });
  };

  const handleDescriptionChange = (event) => {
    const value = event.target.value;

    descriptionRef.current = value;
    setDescription(value);
    setVoiceError("");
  };

  return (
    <AnimatePresence>
      <motion.div
        className="modal-overlay lifegrid-emergency-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && !disabled) {
            onClose();
          }
        }}
      >
        <motion.form
          className="emergency-modal lifegrid-emergency-modal"
          onSubmit={handleSubmit}
          initial={{ opacity: 0, y: 18, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 18, scale: 0.98 }}
          transition={{ duration: 0.18 }}
        >
          <div className="lifegrid-modal-topbar">
            <div className="modal-header">
              <div className="modal-alert-icon">
                <ShieldAlert size={25} />
              </div>

              <div>
                <div className="modal-kicker">EMERGENCY REPORT</div>
                <h2>Tell us what is happening</h2>
                <p className="lifegrid-modal-subtitle">
                  Give responders the clearest information you can.
                </p>
              </div>
            </div>

            <button
              className="modal-close"
              onClick={onClose}
              type="button"
              disabled={disabled}
              aria-label="Close emergency report"
            >
              <X size={20} />
            </button>
          </div>

          <div className="lifegrid-modal-scroll">
            <div className="lifegrid-location-notice">
              <MapPin size={19} />
              <div>
                <strong>Location-aware response</strong>
                <span>
                  GPS is requested when you send the report. You can also
                  enter a landmark or address below.
                </span>
              </div>
            </div>

            <div className="lifegrid-form-grid">
              <label className="lifegrid-field">
                <span>Emergency type</span>

                <div className="lifegrid-select-wrap">
                  <select
                    value={emergencyType}
                    onChange={(event) =>
                      setEmergencyType(event.target.value)
                    }
                    disabled={disabled}
                  >
                    {EMERGENCY_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>

                  <ChevronDown size={16} />
                </div>
              </label>

              <label className="lifegrid-field">
                <span>People involved</span>

                <div className="lifegrid-number-field">
                  <Users size={18} />

                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={patientCount}
                    onChange={(event) =>
                      setPatientCount(
                        Math.min(
                          50,
                          Math.max(1, Number(event.target.value) || 1)
                        )
                      )
                    }
                    disabled={disabled}
                  />
                </div>
              </label>
            </div>

            <label className="lifegrid-field">
              <span>Location / landmark</span>

              <div className="lifegrid-text-input-with-icon">
                <MapPin size={17} />

                <input
                  value={locationText}
                  onChange={(event) => setLocationText(event.target.value)}
                  disabled={disabled}
                  placeholder="Example: Near college main gate, Mathura Road"
                />
              </div>
            </label>

            <div className="lifegrid-field">
              <span>Is the scene safe?</span>

              <div className="lifegrid-choice-grid">
                <button
                  type="button"
                  className={
                    sceneSafety === "safe" ? "selected safe" : ""
                  }
                  onClick={() => setSceneSafety("safe")}
                  disabled={disabled}
                >
                  <CheckCircle2 size={17} />
                  Yes, scene is safe
                </button>

                <button
                  type="button"
                  className={
                    sceneSafety === "unsafe" ? "selected unsafe" : ""
                  }
                  onClick={() => setSceneSafety("unsafe")}
                  disabled={disabled}
                >
                  <AlertTriangle size={17} />
                  No / unknown
                </button>
              </div>
            </div>

            <div className="lifegrid-field">
              <span>Critical warning signs</span>

              <div className="lifegrid-warning-grid">
                {WARNING_SIGNS.map((warning) => (
                  <button
                    type="button"
                    key={warning}
                    className={
                      warningSigns.includes(warning) ? "selected" : ""
                    }
                    onClick={() => toggleWarning(warning)}
                    disabled={disabled}
                  >
                    <span className="lifegrid-warning-check">
                      {warningSigns.includes(warning) ? "✓" : ""}
                    </span>
                    {warning}
                  </button>
                ))}
              </div>
            </div>

            <label className="lifegrid-field">
              <span className="lifegrid-field-label-row">
                <span>Describe the emergency</span>
                <span className="lifegrid-voice-hint">Type or speak</span>
              </span>

              <div
                className={`report-description-wrap ${
                  voiceListening ? "voice-active" : ""
                }`}
              >
                <textarea
                  value={description}
                  onChange={handleDescriptionChange}
                  disabled={disabled}
                  rows={5}
                  placeholder="Example: Two people are injured after a road accident. One person is unconscious and bleeding."
                  autoFocus
                />

                {voiceSupported && (
                  <div className="lifegrid-voice-bar">
                    <button
                      type="button"
                      className={`voice-report-button ${
                        voiceListening ? "listening" : ""
                      }`}
                      onClick={toggleVoice}
                      disabled={disabled}
                    >
                      {voiceListening ? (
                        <MicOff size={18} />
                      ) : (
                        <Mic size={18} />
                      )}

                      {voiceListening ? "Listening…" : "Speak report"}
                    </button>

                    <label className="lifegrid-modal-language">
                      <span>Voice language</span>

                      <select
                        value={voiceLanguage}
                        onChange={(event) =>
                          setVoiceLanguage(event.target.value)
                        }
                        disabled={disabled || voiceListening}
                      >
                        {VOICE_LANGUAGES.map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}
              </div>

              <small className="lifegrid-field-help">
                Mention consciousness, breathing, bleeding, injury and
                anything else responders should know.
              </small>
            </label>

            {voiceError && (
              <div className="lifegrid-voice-error" role="alert">
                <AlertTriangle size={16} />
                {voiceError}
              </div>
            )}

            <div className="lifegrid-safety-note">
              <AlertTriangle size={17} />

              <span>
                For an immediate life-threatening emergency, call{" "}
                <strong>112</strong>. LIFEGRID supports response coordination
                and does not replace emergency services.
              </span>
            </div>
          </div>

          <div className="lifegrid-modal-actions">
            <button
              type="button"
              className="lifegrid-secondary-action"
              onClick={onCall112}
              disabled={disabled}
            >
              <Phone size={18} />
              Call 112
            </button>

            <button
              type="submit"
              className="lifegrid-primary-action"
              disabled={!canSubmit}
            >
              <ShieldAlert size={19} />
              {disabled ? "Sending…" : "Send emergency report"}
            </button>
          </div>
        </motion.form>
      </motion.div>
    </AnimatePresence>
  );
}
